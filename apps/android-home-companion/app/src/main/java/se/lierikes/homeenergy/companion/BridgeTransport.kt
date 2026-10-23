package se.lierikes.homeenergy.companion

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.net.URLEncoder

internal data class PendingCommand(
    val id: String,
    val deviceId: String,
    val command: String,
    val expiresAt: String,
)

/** Never follows redirects with the bridge credential or accepts arbitrary remote commands. */
internal class BridgeTransport(private val settings: CompanionSettings) {
    private fun endpoint(path: String): URL {
        val origin = URI(settings.serverUrl.trim().trimEnd('/'))
        require(origin.scheme == "https" && !origin.host.isNullOrBlank() &&
                origin.userInfo == null && origin.query == null && origin.fragment == null &&
                (origin.path.isNullOrEmpty() || origin.path == "/")) {
            "Bridge URL must be an HTTPS origin, e.g. https://energy.li-erikes.se"
        }
        return URL(origin.toString().trimEnd('/') + "/api/companion/" + path)
    }

    private suspend fun request(path: String, method: String, body: JSONObject? = null): JSONObject =
        withContext(Dispatchers.IO) {
            val secret = settings.bridgeKey()
            require(secret.isNotEmpty()) { "Pairing key not saved yet" }
            val connection = (endpoint(path).openConnection() as HttpURLConnection).apply {
                requestMethod = method
                instanceFollowRedirects = false
                connectTimeout = 12_000
                readTimeout = 12_000
                setRequestProperty("x-home-energy-bridge-key", secret)
                setRequestProperty("Cache-Control", "no-store")
                if (body != null) {
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json")
                }
            }
            try {
                if (body != null) {
                    connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
                }
                val status = connection.responseCode
                require(status in 200..299) {
                    "Bridge returned HTTP $status (check URL, key and structure permission)"
                }
                val response = connection.inputStream.bufferedReader().use { it.readText() }
                JSONObject(response)
            } finally {
                connection.disconnect()
            }
        }

    suspend fun sync(snapshot: HomeSnapshot): Int {
        val devices = JSONArray()
        for (d in snapshot.devices) {
            val obj = JSONObject().apply {
                put("id", d.id)
                put("name", d.name)
                put("room", d.room)
                put("type", d.type)
                put("traits", JSONArray(d.traits))
                put("online", d.online)
                if (d.on != null) put("state", JSONObject().put("on", d.on))
            }
            devices.put(obj)
        }
        return request("devices/sync", "POST", JSONObject().apply {
            put("scopeId", snapshot.scopeId)
            put("devices", devices)
        }).getInt("deviceCount")
    }

    suspend fun claim(scopeId: String): PendingCommand? {
        val response = request(
            "commands/claim?scopeId=" + URLEncoder.encode(scopeId, "UTF-8"), "GET",
        )
        if (response.isNull("command")) return null
        val c = response.getJSONObject("command")
        require(c.getString("trait") == "on-off" &&
                c.getString("command") in listOf("on", "off")) { "Unsupported remote command" }
        return PendingCommand(
            c.getString("id"), c.getString("deviceId"),
            c.getString("command"), c.getString("expiresAt"),
        )
    }

    suspend fun acknowledge(scopeId: String, command: PendingCommand,
                            succeeded: Boolean, message: String) {
        require(Regex("^[0-9a-fA-F-]{36}$").matches(command.id)) { "Invalid command ID" }
        request("commands/" + command.id + "/ack", "POST", JSONObject().apply {
            put("scopeId", scopeId)
            put("succeeded", succeeded)
            put("message", message.take(140))
        })
    }
}
