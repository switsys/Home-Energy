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
