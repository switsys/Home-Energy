package se.lierikes.homeenergy.mobile

import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import com.google.home.ConnectivityState
import com.google.home.FactoryRegistry
import com.google.home.ForcePermissionFlow
import com.google.home.Home
import com.google.home.HomeClient
import com.google.home.HomeConfig
import com.google.home.HomeDevice
import com.google.home.PermissionsResultStatus
import com.google.home.PermissionsState
import com.google.home.matter.standard.DimmableLightDevice
import com.google.home.matter.standard.FanControl
import com.google.home.matter.standard.FanDevice
import com.google.home.matter.standard.OnOff
import com.google.home.matter.standard.OnOffLightDevice
import com.google.home.matter.standard.OnOffPluginUnitDevice
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.launch
import java.util.ArrayList

/**
 * Read-only Google Home v1 discovery in the same Android package as Home-Energy.
 * Cloud-to-cloud Meross/eHomeLife outlets may appear as FanDevice in Home APIs.
 * Only claim capabilities actually reported by the SDK: never infer switching
 * from the marketing name "smart plug" or Google's UI classification.
 */
class HomeIntegrationImpl(private val activity: ComponentActivity) : HomeIntegration {
    private val client: HomeClient = Home.getClient(
        activity.applicationContext,
        HomeConfig(
            coroutineContext = Dispatchers.IO,
            factoryRegistry = FactoryRegistry(
                types = listOf(
                    OnOffPluginUnitDevice,
                    OnOffLightDevice,
                    DimmableLightDevice,
                    FanDevice,
                ),
                traits = listOf(OnOff, FanControl),
            ),
            homePlatformScope = HomeConfig.HomePlatformScope.HOME_PLATFORM_SCOPE_VERSION_1,
        ),
    )

    init {
        // Must be registered before the activity is STARTED.
        client.registerActivityResultCallerForPermissions(activity)
    }

    override fun isSupported(): Boolean = true

    override fun requestPermission(callback: HomeIntegration.Callback) {
        activity.lifecycleScope.launch {
            try {
                val result = client.requestPermissions(ForcePermissionFlow.FORCE_LAUNCH)
                if (result.status == PermissionsResultStatus.SUCCESS) {
                    callback.complete("Google Home access granted. Tap Discover devices.",
                        emptyList())
                } else {
                    callback.complete(
                        "Google Home authorization: ${result.status}. " +
                        "Check the Android OAuth client, test user and selected home.",
                        emptyList(),
                    )
                }
            } catch (e: Exception) {
                callback.complete("Google authorization error: ${e.javaClass.simpleName}: " +
                    (e.message ?: "Unknown problem"), emptyList())
            }
        }
    }

    private suspend fun onOff(device: HomeDevice): OnOff? = when {
        device.has(FanDevice) ->
            device.typeOrNull(FanDevice).firstOrNull()?.standardTraits?.onOff
        device.has(OnOffPluginUnitDevice) ->
            device.typeOrNull(OnOffPluginUnitDevice).firstOrNull()?.standardTraits?.onOff
        device.has(OnOffLightDevice) ->
            device.typeOrNull(OnOffLightDevice).firstOrNull()?.standardTraits?.onOff
        device.has(DimmableLightDevice) ->
            device.typeOrNull(DimmableLightDevice).firstOrNull()?.standardTraits?.onOff
        else -> null
    }

    private fun kind(device: HomeDevice): String = when {
        device.has(FanDevice) -> "Fan (may be an eHomeLife outlet)"
        device.has(OnOffPluginUnitDevice) -> "Smart plug"
        device.has(OnOffLightDevice) -> "Light"
        device.has(DimmableLightDevice) -> "Dimmable light"
        else -> "Other"
    }

    override fun readDevices(callback: HomeIntegration.Callback) {
        activity.lifecycleScope.launch {
            try {
                val state = client.hasPermissions().first {
                    it != PermissionsState.PERMISSIONS_STATE_UNINITIALIZED
                }
                if (state != PermissionsState.GRANTED) {
                    callback.complete("Grant Google Home access first.", emptyList())
                    return@launch
                }
                // Google's grant covers one structure at a time.
                val structure = client.structures().list().firstOrNull()
                    ?: error("No Google Home structure permitted")
                val rooms = structure.rooms().list().associate { it.id.id to it.name }
                val devices = structure.devices().list()
                if (devices.size > 150) error("Too many devices to display")
                val found = ArrayList<HomeIntegration.Device>()
                for (device in devices) {
                    val trait = try { onOff(device) } catch (_: Exception) { null }
                    val on = try {
                        if (trait?.supports(OnOff.Attribute.onOff) == true)
                            trait.onOff else null
                    } catch (_: Exception) { null }
                    val canSwitch = trait != null &&
                        trait.supports(OnOff.Command.On) &&
                        trait.supports(OnOff.Command.Off)
                    val online = device.sourceConnectivity.connectivityState.let {
                        it == ConnectivityState.ONLINE ||
                        it == ConnectivityState.PARTIALLY_ONLINE
                    }
                    found.add(HomeIntegration.Device(
                        structure.id.id + ":" + device.id.id,
                        device.name.take(120),
                        rooms[device.roomId?.id] ?: "Unassigned",
                        kind(device),
                        online,
                        on,
                        canSwitch,
                    ))
                }
                callback.complete(
                    "${structure.name}: ${found.size} devices (read-only).",
                    found,
                )
            } catch (e: Exception) {
                callback.complete(
                    "Discovery failed: ${e.javaClass.simpleName}: " +
                    (e.message ?: "Unknown problem"),
                    emptyList(),
                )
            }
        }
    }
}
