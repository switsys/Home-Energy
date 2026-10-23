package se.lierikes.homeenergy.companion

import android.content.Context
import androidx.activity.ComponentActivity
import com.google.home.ConnectivityState
import com.google.home.FactoryRegistry
import com.google.home.ForcePermissionFlow
import com.google.home.Home
import com.google.home.HomeClient
import com.google.home.HomeConfig
import com.google.home.HomeDevice
import com.google.home.PermissionsState
import com.google.home.matter.standard.DimmableLightDevice
import com.google.home.matter.standard.OnOff
import com.google.home.matter.standard.OnOffLightDevice
import com.google.home.matter.standard.OnOffPluginUnitDevice
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.firstOrNull
import java.time.Instant

internal data class DeviceSnapshot(
    val id: String,
    val name: String,
    val room: String?,
    val type: String,
    val online: Boolean,
    val traits: List<String>,
    val on: Boolean?,
)
internal data class HomeSnapshot(
    val scopeId: String,
    val structureName: String,
    val devices: List<DeviceSnapshot>,
)

/**
 * Only the currently consented Google Home structure is accessible.
 * Previously synchronized structures remain in Home-Energy as *offline* devices.
 */
internal class GoogleHomeAccess(context: Context) {
    private val registry = FactoryRegistry(
        types = listOf(OnOffPluginUnitDevice, OnOffLightDevice, DimmableLightDevice),
        traits = listOf(OnOff),
    )
    private val client: HomeClient = Home.getClient(
        context.applicationContext,
        HomeConfig(
            coroutineContext = Dispatchers.IO,
            factoryRegistry = registry,
            homePlatformScope = HomeConfig.HomePlatformScope.HOME_PLATFORM_SCOPE_VERSION_1,
        ),
    )
    private var lastScope: String? = null
    private var devicesById = emptyMap<String, HomeDevice>()

    fun register(activity: ComponentActivity) {
        client.registerActivityResultCallerForPermissions(activity)
    }

    suspend fun requestAccess() {
        val result = client.requestPermissions(ForcePermissionFlow.FORCE_LAUNCH)
        require(result.status == com.google.home.PermissionsResultStatus.SUCCESS) {
            "Google Home permission not granted: " + result.status
        }
    }

    private suspend fun trait(device: HomeDevice): OnOff? =
        when {
            device.has(OnOffPluginUnitDevice) ->
                device.typeOrNull(OnOffPluginUnitDevice).firstOrNull()?.standardTraits?.onOff
            device.has(OnOffLightDevice) ->
                device.typeOrNull(OnOffLightDevice).firstOrNull()?.standardTraits?.onOff
            device.has(DimmableLightDevice) ->
                device.typeOrNull(DimmableLightDevice).firstOrNull()?.standardTraits?.onOff
            else -> null
        }

    private fun type(device: HomeDevice): String = when {
        device.has(OnOffPluginUnitDevice) -> "on-off-plugin-unit"
        device.has(OnOffLightDevice) -> "on-off-light"
        device.has(DimmableLightDevice) -> "dimmable-light"
        else -> "unsupported-device"
    }

    suspend fun snapshot(): HomeSnapshot {
        val state = client.hasPermissions().first {
            it != PermissionsState.PERMISSIONS_STATE_UNINITIALIZED
        }
        require(state == PermissionsState.GRANTED) { "Grant Google Home access first" }
        // Google's permissions are for ONE structure at a time.
        val structure = client.structures().list().firstOrNull()
            ?: error("No Google Home structure granted")
        val scope = structure.id.id
        val rooms = structure.rooms().list().associate { it.id.id to it.name }
        val devices = structure.devices().list()
        require(devices.size <= 150) { "Too many devices: snapshot limit is 150" }
        val live = mutableMapOf<String, HomeDevice>()
        val discovered = devices.map { device ->
            val id = scope + ":" + device.id.id
            live[id] = device
            val onOff = try { trait(device) } catch (_: Exception) { null }
            val online = device.sourceConnectivity.connectivityState.let {
                it == ConnectivityState.ONLINE || it == ConnectivityState.PARTIALLY_ONLINE
            }
            val commandsSupported = onOff != null &&
                onOff.supports(OnOff.Command.On) && onOff.supports(OnOff.Command.Off)
            DeviceSnapshot(
                id = id, name = device.name.take(120),
                room = rooms[device.roomId?.id]?.take(120),
                type = type(device),
                online = online,
                traits = if (commandsSupported) listOf("on-off") else emptyList(),
                on = if (onOff?.supports(OnOff.Attribute.onOff) == true) onOff.onOff else null,
            )
        }
        lastScope = scope
        devicesById = live
        return HomeSnapshot(scope, structure.name, discovered)
    }

    /** Run only on a command leased by the bridge and approved through its dashboard. */
    suspend fun perform(scope: String, command: PendingCommand) {
        // Scheduled OFF cannot be guaranteed by a foreground phone companion.
        // Reject scheduled ON and OFF commands until an always-on controller exists.
        require(command.automationId == null) {
            "Timed automation is disabled on this foreground-only companion"
        }
        require(scope == lastScope) { "Google Home structure changed" }
        require(Instant.now().isBefore(Instant.parse(command.expiresAt))) {
            "Expired command will not be executed"
        }
        val device = devicesById[command.deviceId] ?: error("Device not in selected structure")
        val kind = type(device)
        require(kind in listOf("on-off-plugin-unit", "on-off-light", "dimmable-light")) {
            "Safety: this device type cannot be remotely switched"
        }
        require(device.sourceConnectivity.connectivityState.let {
            it == ConnectivityState.ONLINE || it == ConnectivityState.PARTIALLY_ONLINE
        }) { "Device is offline" }
        val onOff = trait(device) ?: error("OnOff trait unavailable")
        when (command.command) {
            "on" -> {
                require(onOff.supports(OnOff.Command.On)) { "On not supported" }
                onOff.on()
            }
            "off" -> {
                require(onOff.supports(OnOff.Command.Off)) { "Off not supported" }
                onOff.off()
            }
            else -> error("Unsupported command")
        }
    }
}
