package se.lierikes.homeenergy.mobile;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Local Meross/Refoss key stays encrypted on this Android device and is never sent to Home-Energy. */
final class RefossSecrets {
    private static final String ALIAS = "lierikes_refoss_local_key_v1";
    private static final String PREFS = "refoss_settings";
    private final SharedPreferences prefs;

    RefossSecrets(Context context) {
        prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    String addresses() {
        return prefs.getString("addresses", "");
    }

    void saveAddresses(String addresses) {
        prefs.edit().putString("addresses", addresses).apply();
    }

    private SecretKey encryptionKey() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        SecretKey current = (SecretKey) store.getKey(ALIAS, null);
        if (current != null) return current;

        KeyGenerator generator = KeyGenerator.getInstance("AES", "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(
            ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build());
        return generator.generateKey();
    }

    boolean hasKey() {
        return prefs.contains("encrypted_device_key");
    }

    void saveKey(String value) throws Exception {
        if (value.isEmpty() || value.length() > 256) throw new IllegalArgumentException("Invalid local device key");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, encryptionKey());
        byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
        byte[] serialized = new byte[cipher.getIV().length + encrypted.length];
        System.arraycopy(cipher.getIV(), 0, serialized, 0, cipher.getIV().length);
        System.arraycopy(encrypted, 0, serialized, cipher.getIV().length, encrypted.length);
        prefs.edit().putString("encrypted_device_key",
            Base64.encodeToString(serialized, Base64.NO_WRAP)).apply();
    }

    String getKey() throws Exception {
        String stored = prefs.getString("encrypted_device_key", null);
        if (stored == null) return ""; // Some unpaired legacy firmware may accept an empty key.
        byte[] serialized = Base64.decode(stored, Base64.DEFAULT);
        if (serialized.length <= 28) throw new SecurityException("Invalid stored key");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, encryptionKey(),
            new GCMParameterSpec(128, serialized, 0, 12));
        return new String(cipher.doFinal(serialized, 12, serialized.length - 12), StandardCharsets.UTF_8);
    }
}
