package se.lierikes.homeenergy.companion

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Credentials are deliberately never stored in BuildConfig, checked into Git,
 * logged, backed up or sent to Google's Home APIs.
 */
internal class CompanionSettings(private val context: Context) {
    private val prefs = context.getSharedPreferences("companion_settings", Context.MODE_PRIVATE)
    private val alias = "home_energy_bridge_key_v1"

    var serverUrl: String
        get() = prefs.getString("server_url", "https://energy.li-erikes.se")!!
        set(value) { prefs.edit().putString("server_url", value).apply() }

    private fun encryptionKey(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(alias, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(KeyGenParameterSpec.Builder(
            alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
        ).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
         .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
         .setKeySize(256).build())
        return generator.generateKey()
    }

    fun setBridgeKey(secret: String) {
        require(secret.length >= 32 && secret.length <= 256) {
            "Enter the bridge-only key (at least 32 characters)"
        }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, encryptionKey())
        val encrypted = cipher.doFinal(secret.toByteArray(Charsets.UTF_8))
        prefs.edit().putString(
            "encrypted_bridge_key",
            Base64.encodeToString(cipher.iv + encrypted, Base64.NO_WRAP),
        ).apply()
    }

    fun bridgeKey(): String {
        val raw = prefs.getString("encrypted_bridge_key", null) ?: return ""
        val bytes = Base64.decode(raw, Base64.DEFAULT)
        require(bytes.size > 12) { "Invalid stored bridge key" }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, encryptionKey(), GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
        return String(cipher.doFinal(bytes.copyOfRange(12, bytes.size)), Charsets.UTF_8)
    }
}
