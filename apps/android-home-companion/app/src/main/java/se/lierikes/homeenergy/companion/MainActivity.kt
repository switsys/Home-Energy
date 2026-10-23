package se.lierikes.homeenergy.companion

import android.os.Bundle
import android.text.InputType
import android.view.WindowManager
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Foreground-only prototype by design. Scheduled switching MUST NOT be relied
 * on until we have an approved, independently reliable controller.
 */
class MainActivity : ComponentActivity() {
    private lateinit var settings: CompanionSettings
    private lateinit var home: GoogleHomeAccess
    private lateinit var transport: BridgeTransport
    private lateinit var status: TextView
    private lateinit var consentToCommands: CheckBox
    private var pollJob: Job? = null
    private var deviceDetails: TextView? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        settings = CompanionSettings(this)
        transport = BridgeTransport(settings)

        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            val space = (18 * resources.displayMetrics.density).toInt()
            setPadding(space, space, space, space)
        }
        val scroller = ScrollView(this).apply { addView(column) }
        setContentView(scroller)

        fun label(value: String) {
            column.addView(TextView(this).apply {
                text = value
                textSize = 15f
                setPadding(0, 10, 0, 12)
            })
        }
        fun button(value: String, onClick: () -> Unit) {
            column.addView(Button(this).apply {
                text = value
                setOnClickListener { onClick() }
            })
        }

        label("HOME-ENERGY · Google Home companion\n" +
              "Li-Erikes Gård can combine devices from multiple Google Home structures. " +
              "Google permits access to one structure at a time.")

        label("HTTPS bridge URL")
        val url = EditText(this).apply {
            setSingleLine()
            setText(settings.serverUrl)
            hint = "https://energy.li-erikes.se"
        }
        column.addView(url)
        label("Bridge pairing key (never the Tibber API key or your Google password)")
        val key = EditText(this).apply {
            setSingleLine()
            hint = "Paste your bridge key once"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        }
        column.addView(key)
        button("Save bridge URL and encrypted key") {
            try {
                require(url.text.toString().startsWith("https://")) { "HTTPS is required" }
                settings.serverUrl = url.text.toString().trimEnd('/')
                if (key.text.isNotEmpty()) settings.setBridgeKey(key.text.toString())
                key.text.clear()
                status.text = "Bridge configuration saved in Android Keystore."
            } catch (e: Exception) { status.text = e.message ?: "Invalid bridge settings" }
        }

        status = TextView(this).apply {
            text = "No Google Home permission requested yet. Physical control is disabled."
            textSize = 14f
            setPadding(0, 20, 0, 20)
        }
        column.addView(status)

        try {
            home = GoogleHomeAccess(applicationContext)
            home.register(this)
        } catch (e: Exception) {
            status.text = "Home SDK initialization failed: " + e.javaClass.simpleName
            return
        }

        button("Grant / switch Google Home structure") {
            pollJob?.cancel()
            pollJob = null
            consentToCommands.isChecked = false
            lifecycleScope.launch {
                try {
                    home.requestAccess()
                    status.text = "Google permission granted. Tap 'Discover & sync' next."
                } catch (e: Exception) {
                    status.text = "Google permission not granted: " +
                        (e.message ?: e.javaClass.simpleName)
                }
            }
        }

        button("Discover & sync once (read-only)") {
            lifecycleScope.launch {
                try {
                    val snapshot = home.snapshot()
                    val count = transport.sync(snapshot)
                    showSnapshot(snapshot)
                    status.text = "Synced $count devices from " + snapshot.structureName +
                        " (no commands claimed)."
                } catch (e: Exception) {
                    status.text = "Sync failed: " + (e.message ?: e.javaClass.simpleName)
                }
            }
        }

        consentToCommands = CheckBox(this).apply {
            text = "Allow execution of commands explicitly approved in Home-Energy"
            isChecked = false // always opt in again after Activity relaunch
        }
        column.addView(consentToCommands)

        button("Start foreground connection (30-second polling)") {
            if (pollJob?.isActive == true) return@button
            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            pollJob = lifecycleScope.launch {
                status.text = "Connected while app remains on screen. Checking Google permissions."
                while (isActive) {
                    try {
                        val snapshot = home.snapshot()
                        val count = transport.sync(snapshot)
                        showSnapshot(snapshot)
                        status.text = "Online: " + snapshot.structureName + " ($count devices). " +
                            if (consentToCommands.isChecked) "Approved commands enabled." else "Read-only."
                        if (consentToCommands.isChecked) {
                            val command = transport.claim(snapshot.scopeId)
                            if (command != null) {
                                var succeeded = false
                                var result = "Command not executed"
                                try {
                                    // Claim involves network I/O. Consent can change before it returns.
                                    if (!isActive || !consentToCommands.isChecked) {
                                        result = "Execution consent withdrawn"
                                    } else if (command.automationId != null) {
                                        result = "Scheduled control needs an always-on controller"
                                    } else {
                                        try {
                                            home.perform(snapshot.scopeId, command)
                                            succeeded = true
                                            result = "Google Home SDK acknowledged " + command.command
                                        } catch (e: CancellationException) {
                                            result = "Command outcome unknown after app interruption"
                                            throw e
                                        } catch (e: Exception) {
                                            result = "Not executed: " +
                                                (e.message ?: e.javaClass.simpleName)
                                        }
                                    }
                                } finally {
                                    // onStop may cancel polling even *after* the device switched.
                                    // Always attempt the ACK, including when cancellation occurs.
                                    // There is no blind retry of the physical device command.
                                    withContext(NonCancellable + Dispatchers.IO) {
                                        runCatching {
                                            transport.acknowledge(
                                                snapshot.scopeId, command, succeeded, result,
                                            )
                                        }.onFailure {
                                            // The bridge lease will fail. For a manual command,
                                            // reconcile actual state in a later discovery sync.
                                            result = "ACK unavailable; verify physical device state"
                                        }
                                    }
                                }
                                if (isActive) status.text = result
                            }
                        }
                    } catch (e: CancellationException) { throw e }
                    catch (e: Exception) {
                        status.text = "Connection error: " + (e.message ?: e.javaClass.simpleName)
                    }
                    delay(30_000)
                }
            }
        }
        button("Stop connection and disable commands") {
            pollJob?.cancel()
            pollJob = null
            consentToCommands.isChecked = false
            window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            status.text = "Disconnected. No background device control."
        }
        label("Safety: This is a foreground-only test companion, NOT an unattended " +
              "scheduler. Timed automation is intentionally blocked. " +
              "Test read-only discovery and a low-risk plug first.")

        deviceDetails = TextView(this).apply { textSize = 13f }
        column.addView(deviceDetails)
    }

    private fun showSnapshot(snapshot: HomeSnapshot) {
        deviceDetails?.text = buildString {
            append(snapshot.structureName)
            append(" · ")
            append(snapshot.devices.size)
            append(" devices\n")
            snapshot.devices.forEach {
                append("\n")
                append(it.name)
                append(" · ")
                append(it.room ?: "No room")
                append(" · ")
                append(if (it.online) "online" else "offline")
                append(" · ")
                append(if (it.traits.contains("on-off")) "OnOff supported" else "read-only")
            }
        }
    }

    override fun onStop() {
        pollJob?.cancel()
        pollJob = null
        if (::consentToCommands.isInitialized) consentToCommands.isChecked = false
        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        super.onStop()
    }
}
