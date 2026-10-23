# Home-Energy Android Google Home companion

This is the first **foreground-only** phone bridge for Home-Energy at
Li-Erikes Gård. It pairs Google's Android Home APIs with the server's
approval-gated device controls. It is not a general Google Home REST client.

## First setup

1. Open `apps/android-home-companion` in Android Studio (JDK 17+, Android
   SDK 36). Build and install the debug variant on an Android phone running
   Google Play services. App ID: `se.lierikes.homeenergy.companion`.
2. In Google Cloud Console, configure OAuth for this exact Android package
   and your debug certificate SHA-1, and register your Google account as an
   OAuth test user. For unverified apps Google only permits test users.
3. Enter your Home-Energy public **HTTPS** origin and the **bridge-only** key
   created in the server's `.env` (HOME_ENERGY_DEVICE_BRIDGE_KEY). Never
   paste the Tibber token, Google password, or Home-Energy API key.
4. Tap **Grant / switch Google Home structure** and consent to your selected
   Google Home home/structure.
5. Tap **Discover & sync once (read-only)**. This sends device metadata and
   current on/off state to the server through the authenticated companion
   HTTPS relay. Verify the devices appear in Home-Energy, under Li-Erikes Gård.

### Multiple Google Home homes

Google only allows one structure in a permission grant at a time. Tap
**Grant / switch** to authorize a different Google Home home, then sync it.
Home-Energy preserves the original structure/room names; devices from a
previous home will show offline until they are synced again. These are *not*
merged in Google's account, and individual Falu Elnät grid inlets remain
separate billing scopes. You may also list devices and their rooms manually
before mobile authorization to plan names and meter mappings.

## Device actions

Control is disabled by default on the server until a separate, strong
HOME_ENERGY_CONTROL_KEY is configured. The phone must also have the
**Allow execution** checkbox checked *while the app remains in the
foreground*. Physical switching requires explicit approval in the dashboard
and a companion-scope command lease. The phone never sends Google access
tokens to Home-Energy.

The first adapter intentionally supports only OnOff lights, dimmable lights
and smart plugs. No garage doors, locks, security devices or generic heating
controls. Start with a low-risk smart plug or light. **Do not use this
foreground prototype for unattended heater/EV charging control:** Android may
pause it, and a scheduled off command might not run.

## API paths and credential handling

- `POST /api/companion/devices/sync` — snapshot for the selected structure
- `GET /api/companion/commands/claim?scopeId=...` — lease one approved command
- `POST /api/companion/commands/:id/ack` — acknowledge actual SDK execution

All require `x-home-energy-bridge-key`. The Next.js relay has a small
allowlist of operations and forwards only to the private backend; it does not
store OAuth tokens or grant implicit device control. Credentials are
encrypted using Android Keystore AES-GCM with Android backup disabled.
The app does not follow HTTP redirects with the pairing key.

## Install Google's separately downloaded Home APIs SDK

The licensed Google Home SDK 1.11.1 ZIP contains a Maven repository for
`play-services-home:17.1.0` and `play-services-home-types:17.1.0`.
It is **not** supplied by Google's public Maven repository.

Extract the archive to
`~/.local/share/home-energy/google-home-maven` (the directory should
contain `com/google/android/gms/play-services-home/17.1.0/`).
The project now discovers that location automatically, or you can override
it using `HOME_ENERGY_HOME_SDK_MAVEN=/absolute/path/to/extracted/repo`.

Do not add the downloaded ZIP, the unpacked proprietary Android SDK, or
any Google account credentials to the Git repository. The Android CI build
will not succeed on an ordinary GitHub hosted runner until a licensed
SDK is provided to the runner through a private authorized mechanism.

## Android build

A build uses the same Google Play Home SDK version as the official sample:
`com.google.android.gms:play-services-home:17.1.0`. This package was written
against official source and Google reference documentation. Run Gradle
`:app:assembleDebug` after downloading Android SDK 36, or open in Android
Studio. The debug application ID and its signing SHA-1 must match your
Google Cloud OAuth configuration.

Reference: https://developers.home.google.com/apis/android/initialize
and https://developers.home.google.com/apis/android/permissions

## Safety limits

- No automatic background scheduler or bypass of device consent.
- No implicit retry after a possible command execution.
- No upload of Google OAuth tokens.
- If permissions or device connectivity are unavailable, control stays
  blocked; stale structures may be displayed as offline.
- A connected Android device must remain foreground-active and online to
  receive commands. Later iterations can use native Google Home automations
  or a dedicated always-on controller before real unattended control.

## Verified debug build on sorskog (23 October 2026)

The Google Home 1.11.1 developer ZIP was installed **privately** in
`~/.local/share/home-energy/google-home-maven` and its checksums validated.
The companion passed `:app:checkDebugAarMetadata`,
`:app:compileDebugKotlin` and `:app:assembleDebug` with local Temurin JDK
21.0.13 and Java/Kotlin bytecode target 17.

Android application ID: `se.lierikes.homeenergy.companion`
Minimum Android SDK: 29 (Android 10), target SDK: 36.
The debug signing certificate SHA-1 for registering Android OAuth is
`09:3A:6D:33:29:0F:9B:0C:1D:FF:35:1D:DD:09:DD:69:05:B2:66:81`.

The **debug APK is not committed or publicly hosted**. Its private copy
on sorskog is:

`/home/admin/Home-Energy-Companion-0.1.0-debug.apk`

Transfer with an authenticated SFTP client to your Android Downloads
folder. From Termux with storage permission already enabled:

```sh
scp admin@sorskog.se:/home/admin/Home-Energy-Companion-0.1.0-debug.apk ~/storage/downloads/
termux-open ~/storage/downloads/Home-Energy-Companion-0.1.0-debug.apk
```

The debug APK's SHA-256 is
`ea9094cec4cc014b80d87dea412be74f33d4149f046e6a18669883f314f04b2c`.

**Not verified yet:** Android installation/runtime, Google OAuth setup,
Google Home permission grants, live discovery, actual device execution.
Keep physical switching disabled until a permitted low-risk test device
works and acknowledgement is observed. Do not use this foreground-only
companion for unattended switching.
