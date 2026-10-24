package se.lierikes.homeenergy.mobile;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Read-only Meross-compatible LAN protocol for Refoss MSS210 plugs.
 * No discovery scans, no SET commands, no account/cloud calls.
 * Connection is HTTP only inside explicitly configured RFC1918 LAN addresses.
 */
public final class RefossLan {
    private RefossLan() {}

    public static final class DeviceState {
        public final String model;
        public final Boolean on;
        DeviceState(String model, Boolean on) {
            this.model = model;
            this.on = on;
        }
    }

    static boolean privateIpv4(String value) {
        if (value == null || !value.matches("[0-9]{1,3}(\\.[0-9]{1,3}){3}")) return false;
        String[] parts = value.split("\\.");
        int[] octets = new int[4];
        for (int i = 0; i < 4; i++) {
            try {
                octets[i] = Integer.parseInt(parts[i]);
                if (octets[i] < 0 || octets[i] > 255) return false;
            } catch (NumberFormatException e) {
                return false;
            }
        }
        if (octets[0] == 10) return true;
        if (octets[0] == 172 && octets[1] >= 16 && octets[1] <= 31) return true;
        return octets[0] == 192 && octets[1] == 168;
    }

    static String sign(String messageId, String key, long timestamp) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("MD5"); // Required by legacy Meross protocol.
        byte[] input = (messageId + key + timestamp).getBytes(StandardCharsets.UTF_8);
        byte[] hash = digest.digest(input);
        StringBuilder hex = new StringBuilder(32);
        for (byte b : hash) hex.append(String.format(Locale.ROOT, "%02x", b & 0xff));
        return hex.toString();
    }

    private static String randomId() {
        byte[] data = new byte[16];
        new SecureRandom().nextBytes(data);
        StringBuilder out = new StringBuilder(32);
        for (byte b : data) out.append(String.format(Locale.ROOT, "%02x", b & 0xff));
        return out.toString();
    }

    public static DeviceState read(String address, String deviceKey) throws Exception {
        if (!privateIpv4(address)) throw new IllegalArgumentException("Private LAN IPv4 required");
        if (deviceKey == null || deviceKey.length() > 256) {
            throw new IllegalArgumentException("Invalid local device key");
        }
        String messageId = randomId();
        long timestamp = System.currentTimeMillis() / 1000L;
        JSONObject header = new JSONObject()
            .put("from", "http://" + address + "/config")
            .put("messageId", messageId)
            .put("method", "GET")
            .put("namespace", "Appliance.System.All")
            .put("payloadVersion", 1)
            .put("timestamp", timestamp)
            .put("sign", sign(messageId, deviceKey, timestamp));
        JSONObject envelope = new JSONObject()
            .put("header", header)
            .put("payload", new JSONObject().put("all", new JSONObject()));

        HttpURLConnection conn = (HttpURLConnection) new URL("http://" + address + "/config").openConnection();
        conn.setInstanceFollowRedirects(false);
        conn.setConnectTimeout(3000);
        conn.setReadTimeout(3500);
        conn.setRequestMethod("POST");
        conn.setDoOutput(true);
        conn.setRequestProperty("Content-Type", "application/json");
        conn.setRequestProperty("Accept", "application/json");
        conn.setRequestProperty("Cache-Control", "no-store");
        try {
            byte[] request = envelope.toString().getBytes(StandardCharsets.UTF_8);
            if (request.length > 8192) throw new IllegalArgumentException("Oversized request");
            conn.setFixedLengthStreamingMode(request.length);
            try (OutputStream out = conn.getOutputStream()) {
                out.write(request);
            }
            if (conn.getResponseCode() != 200) throw new IllegalStateException("Device HTTP error");

            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            try (InputStream input = conn.getInputStream()) {
                byte[] chunk = new byte[4096];
                int n;
                while ((n = input.read(chunk)) != -1) {
                    if (buffer.size() + n > 65536) throw new IllegalStateException("Oversized response");
                    buffer.write(chunk, 0, n);
                }
            }
            JSONObject reply = new JSONObject(buffer.toString("UTF-8"));
            JSONObject responseHeader = reply.getJSONObject("header");
            if (!"Appliance.System.All".equals(responseHeader.optString("namespace"))
                    || !messageId.equalsIgnoreCase(responseHeader.optString("messageId"))) {
                throw new IllegalStateException("Unexpected device response");
            }
            if ("ERROR".equals(responseHeader.optString("method"))) {
                throw new SecurityException("Device rejected the local key");
            }
            if (!"GETACK".equals(responseHeader.optString("method"))) {
                throw new IllegalStateException("Unexpected device method");
            }
            String responseSign = responseHeader.optString("sign");
            String computed = sign(
                responseHeader.getString("messageId"), deviceKey, responseHeader.getLong("timestamp"));
            if (!MessageDigest.isEqual(
                    responseSign.toLowerCase(Locale.ROOT).getBytes(StandardCharsets.US_ASCII),
                    computed.getBytes(StandardCharsets.US_ASCII))) {
                throw new SecurityException("Device response signature invalid");
            }
            JSONObject all = reply.getJSONObject("payload").getJSONObject("all");
            String model = all.getJSONObject("system").getJSONObject("hardware").optString("type", "unknown");
            JSONObject digest = all.optJSONObject("digest");
            Boolean on = null;
            if (digest != null) {
                JSONArray channels = digest.optJSONArray("togglex");
                if (channels != null) {
                    for (int i = 0; i < channels.length(); i++) {
                        JSONObject channel = channels.optJSONObject(i);
                        if (channel != null && channel.optInt("channel", -1) == 0 &&
                                channel.has("onoff")) {
                            on = channel.getInt("onoff") == 1;
                            break;
                        }
                    }
                }
                if (on == null) {
                    JSONObject toggle = digest.optJSONObject("toggle");
                    if (toggle != null && toggle.has("onoff")) on = toggle.getInt("onoff") == 1;
                }
            }
            return new DeviceState(model, on);
        } finally {
            conn.disconnect();
        }
    }
}
