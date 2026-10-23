# Google Home integration

Home-Energy should use Google Home as a device-control adapter, not as the source of energy decisions.

## Architecture

```text
Tibber / grid tariff / local telemetry
                |
                v
         Home-Energy core
     price + peak + automation
                |
                v
       Home device gateway
                |
                v
   Google Home companion app
      Android / iOS Home APIs
                |
                v
  Google Home / Matter devices
```

The core remains provider-neutral. Google-specific device types and traits belong in the companion adapter.

## Why a companion app

Google's current Home APIs are SDKs for Android and iOS. They provide structure, room, device, state, command, commissioning, and automation access after user OAuth and Home permission grants.

Home-Energy therefore should not pretend the Node API can directly call a generic Google Home REST endpoint. A companion app should hold the Google Home SDK session and expose only normalized device capabilities to Home-Energy.

## Initial Home-Energy contract

The core defines a `HomeDeviceGateway` that supports:

- device discovery
- normalized device state
- trait-based commands

The API exposes:

- `GET /api/home/devices`
- `GET /api/home/devices/:deviceId/state`
- `POST /api/home/devices/:deviceId/commands`

These routes remain unavailable until a device gateway is configured.

## Google Home adapter goals

The first Google Home companion should:

1. Request Google Home permissions through OAuth.
2. Read the selected structure, rooms, devices, types, and traits.
3. Map Google Home devices into Home-Energy `HomeDevice` records.
4. Read live state for supported traits.
5. Execute explicit Home-Energy commands such as on/off, brightness, thermostat setpoint, and similar energy-relevant actions.
6. Synchronize device state and telemetry back into Home-Energy.
7. Create Home API automations when it is more reliable to let Google's automation engine execute locally/cloud-side.

## Constraints we must design around

- Home API permission is granted to a structure and user-selected devices.
- An app can only have permission to one structure at a time.
- Google Home automations listed through the Home APIs are the automations created by that app, not every routine already present in Google Home.
- Trait support varies by device, and automation eligibility can depend on device state-reporting and command reliability.
- Matter devices can benefit from low-latency local control through supported Google hubs.

Home-Energy should keep its own automation registry and treat Google Home as one execution target.

## Visual property grouping

Google Home structure boundaries are provider details, not Home-Energy property
boundaries. Multiple Google Home structures may be presented as one homestead
when they represent parts of the same physical property.

For Li-Erikes Gård, both Google Home structures should therefore appear under
one visual property, `Li-Erikes Gård`. The original Google structure/room
metadata and provider scope IDs remain intact underneath for discovery,
permissions, commands, and diagnostics.

The same visual rule applies to energy data: shared supplier, price area, price
signal, automation, and property totals are presented once for the homestead.
The exception is grid-fee accounting. Separate physical grid inlets remain
separate billing scopes for Falu Elnät effect-charge and other inlet-specific
grid-fee calculations.

## Energy-aware use cases

Useful first targets:

- shift smart plugs and appliances away from expensive price windows
- avoid switching large loads on during Falu Elnät peak-demand hours
- reduce thermostat setpoints during expensive or peak-risk periods
- coordinate EV charging with the load planner
- expose manual device controls in the Home-Energy dashboard
- later combine Google Home device state with local clamp-meter telemetry

## Official references

- https://developers.home.google.com/apis
- https://developers.home.google.com/apis/android/overview
- https://developers.home.google.com/apis/android/permissions
- https://developers.home.google.com/apis/android/device/control
- https://developers.home.google.com/apis/android/automation

## Home-Energy companion bridge (2026-10)

The Node API **cannot enumerate an existing Google Home account** merely
because a Tibber token or Google account is present. Google's Home APIs
require a native Android/iOS companion, a signed-in Google account, and
explicit permission grants. Google Home's new MCP early access is currently
limited by subscription/region and should not be assumed available in Sweden.

The first working server-side component is the *Google Home companion bridge*:

1. In `.env`, set a strong `HOME_ENERGY_DEVICE_BRIDGE_KEY` (32+ random
   bytes represented as hex). It is for the companion only; never expose it to
   the dashboard or put it in the repository.
2. Restart `home-energy.service`; `GET /api/home/devices` (protected by the
   regular Home-Energy API key) returns the bridge-backed device list. Before
   the companion pairs this should be **empty**, not simulated.
3. Build/authorize the Android companion using the official [Google Home API
   sample](https://github.com/google-home/google-home-api-sample-app-android)
   and select the appropriate Google Home structure in the Permissions API.
   The SDK libraries require Google sign-in/download and OAuth configuration.
4. After OAuth consent and discovery, the companion publishes only normalized
   device info and state to this bridge. Do NOT upload OAuth or account tokens.
5. To enable physical controls, configure a different strong
   `HOME_ENERGY_CONTROL_KEY`, restart the service and enter this secret in the
   dashboard's **Control & automation** section. Changing state still
   requires user confirmation. Both secrets are independently authenticated.

### Bridge protocol

All bridge calls use `x-home-energy-bridge-key` over HTTPS. The dashboard
and Home-Energy account routes use `x-home-energy-key` instead, and any
control/mapping/automation mutations require the separate
`x-home-energy-control-key` plus `confirmed: true`.

- `POST /api/bridge/devices/sync`: body
  `{"scopeId":"google-structure-a","devices":[{"id":"google-structure-a:device-unique-id","name":"Workshop plug","room":"Workshop","type":"on-off-plugin-unit","traits":["on-off"],"online":true,"state":{"on":false}}]}`.
  Every device ID must be prefixed/namespaced by its originating structure.
  Synchronizing one structure leaves all other structures' snapshots alone.
  Publish state periodically; devices are considered offline after 2 minutes.
- `GET /api/bridge/commands/claim?scopeId=google-structure-a`: returns
  `{"command":null}` or the **single** ready, explicitly authorized command
  (ID, device ID, trait `on-off`, command `on|off`, expiry). Only deliver it
  to the indicated device, if the Home API SDK reports permission and an
  online supported OnOff trait. Never infer or execute a command from a
  price signal without a claimed command ID.
- `POST /api/bridge/commands/:commandId/ack`: body
  `{"scopeId":"google-structure-a","succeeded":true,"message":"..."}`.
  Acknowledge only *after* the native Home API command has actually succeeded
  or failed. Also publish fresh device state in the following sync.

Commands are leased once and **never blindly retried** after uncertainty.
Unclaimed commands expire after 5 minutes; a missing acknowledgement is
failed after 90 seconds. Scheduled OFF commands are dispatched only after
the corresponding ON is acknowledged; a schedule cannot be cancelled after
ON dispatch, preventing accidental permanent-on loads.

Only generic on/off for permitted device types is supported. Locks, garage
doors, security devices, cameras, alarms, valves and smoke devices are not
controllable through this generic bridge.

### Home-Energy dashboard and automation

The device panel is part of the homestead-wide dashboard. It shows Google's
native structure/room while allowing you to assign each device to one of the
**separate Falu Elnät grid inlets** and configure nominal kW.

- `GET /api/home/devices` and `.../:deviceId/state`: protected discovery.
- `PATCH /api/home/devices/:deviceId/config`: explicitly authorized mapping
  to an existing grid inlet + device nominal power.
- `GET /api/energy/devices`: energy-device projection.
- `POST /api/energy/automation/preview`: **read-only** best-window
  recommendation based on the mapped meter, Tibber price and Falu tariff.
- `POST /api/energy/automation/approve`: authorizes ON at the recommended
  start and OFF at the recommended end. Both actions require the companion
  to be present, online and polling during their respective windows.
- `POST /api/energy/automation/cancel`: cancels both commands *only before*
  the first action was dispatched; this is deliberate safety behavior.
- `GET /api/home/commands`: recent queued, acknowledged, expired or failed
  commands for status and troubleshooting.

The persisted registry and command queue default to
`~/.local/share/home-energy/device-bridge.json` (permissions 0600).
Override with `HOME_ENERGY_DEVICE_STATE_FILE` if needed. Back up this file
as configuration/state, but **never** commit it or the keys.

### Scope and limitations

- This is a **working, independently testable server bridge and web
  control plane**, not a claim that the Google Home mobile companion is
  already installed, authorized, or running.
- Android companion implementation must use Google's native Home APIs
  (OnOff trait for supported plugs/lights), OAuth, and user consent. The
  Google Home SDK is not a generic publicly available server REST API.
- Google Home permission is structure-scoped; the same companion app may
  need to switch permissions to share devices from a second structure.
- Timed on/off is appropriate only for devices that can safely be switched
  that way; do not use generic switching for EV charging, heat pumps, or
  high-risk heaters without device-specific protections.
- Execution depends on a running connected companion; no guarantee of
  command delivery when the phone is offline. This is *not* yet a reliable
  autonomous home controller.
- Supported Home APIs can be tested first using the [official Android
  sample app](https://developers.home.google.com/apis/android/sample-app/build).
