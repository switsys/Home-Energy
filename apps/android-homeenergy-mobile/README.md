# Li-Erikes Energy for Android — v0.3.0

One installable Android app for Li-Erikes Gård. This replaces the experimental
Home-Energy dashboard and Google Home Companion Android apps for daily use.

## What works

- Existing Tibber/Falu Elnät energy dashboard at `https://energy.li-erikes.se/`
- Native Home, Plugs and Refresh toolbar
- Native read-only Refoss **MSS210** status screen supporting up to 16 plugs
- LAN-only, manually configured private IPv4 addresses (10/8, 172.16/12, 192.168/16)
- Optional local Refoss/Meross protocol key protected with Android Keystore AES-GCM
- No cloud login, Google OAuth, companion bridge key, WebView JS interface or remote device commands
- Offline error and SSL validation; no untrusted HTTP content inside WebView

**The MSS210 generally has no power meter**: device status can show ON/OFF, not
watts/kWh. Tibber remains the source of electricity prices and measured totals.
Other Refoss models may require a different integration.

## Refoss setup (read-only first)

1. On the same Wi-Fi as your MSS210 plugs, open **Plugs**.
2. Enter the plugs' *private* IPv4 addresses from your router's DHCP client list,
   one per line. Fixed DHCP reservations are recommended.
3. Tap **Save local settings**, then **Check plug status (read-only)**.
4. Some legacy MSS210 firmware permits keyless reads; many paired plugs reject
   requests without the **Refoss account/device local key**. That key is distinct
   from HOME_ENERGY_DEVICE_BRIDGE_KEY and isn't automatically accessible via the
   Refoss app. Do not paste your Refoss password in the device key field.
5. The app never resets/re-pairs plugs. If authentication fails, stop there
   until the correct local protocol key can be obtained securely.

The phone communicates directly with plugs over HTTP port 80 on the LAN.
**Legacy Meross protocol is not encrypted on the wire**. The app sends protocol
signatures, never the plaintext local key. Cleartext permission is enabled only
because these plugs do not offer HTTPS; the native Refoss client rejects any
non-private IPv4 address and does not follow redirects. The dashboard remains
HTTPS-only with mixed content disallowed.

No automatic scheduling, physical switching, energy reading fabrication,
background service or remote access to home plugs is enabled in v0.3.

## Installation/testing

- Label: **Li-Erikes Energy** (distinct house/bolt icon)
- Application ID: `se.lierikes.homeenergy.mobile`
- Version: `0.3.0`, versionCode 4; minimum Android 10, target 35
- Only Android permission: `INTERNET`
- Build: `gradle -p apps/android-homeenergy-mobile :app:testDebugUnitTest :app:assembleDebug`
- APK: `apps/android-homeenergy-mobile/app/build/outputs/apk/debug/app-debug.apk`

The GitHub Actions job builds, signs, checks permissions, installs,
launches and uninstalls on an Android 12 emulator before publishing the APK.
Emulator success does not guarantee Samsung installation or local plug access.

**Signing:** Debug APKs from distinct GitHub-hosted runs may have different
signing certificates. Because you are uninstalling the two prototype apps,
the new APK can install cleanly; future seamless in-place updates require
a stable private release signing key. Do not commit signing keys to GitHub.

This app deliberately does not include Google's proprietary Home APIs SDK.
Home-Energy services running on sorskog are unchanged.


## v0.4 (unified Google Home preview)

**One application ID:** `se.lierikes.homeenergy.mobile`; two **build variants**, not
separate Android apps. Uninstalling or using a variant requires identical signing
certificates for in-place upgrade. The `standard` public CI build still provides the
Tibber dashboard and Advanced Refoss LAN fallback, without Google's SDK.
The private `googleHome` variant adds a **Google Home Devices** page in that exact
same installed application. Both flavors use the same launcher label/icon.

- Tap **Devices → Open existing Google Home controls** to use your already-working Google Home app immediately, with no OAuth configuration in Home-Energy. This opens the Google Home app and does not import its devices into Home-Energy.
- Tap **Devices → Connect Google Home** to authorize the home/structure;
  **Discover devices** to read back Google Home names, rooms, online and on/off states.
- Device types include **FanDevice**, because an eHomeLife/Meross smart outlet may
  appear to Google Home as a fan (Vplug1 in Office was observed that way).
- This is **read-only** until permission, live device discovery and actual capabilities
  have been validated on the owner's phone. No switching, automation edits, or
  credentials forwarded to the Home-Energy server.
- No manual LAN IP or legacy bridge key is required for Google discovery.
- A Google Cloud **Android OAuth client** is still required: register the exact
  `se.lierikes.homeenergy.mobile` application ID, **private build certificate SHA-1**,
  and the Google Home account as a test user. This is an SDK platform requirement;
  it does not move hosting away from sorskog.

The proprietary Google Home SDK stays under
`~/.local/share/home-energy/google-home-maven` on sorskog. It must **not**
be uploaded to GitHub or GitHub Actions. Local developer build:

```sh
./gradlew :app:assembleGoogleHomeDebug
```

The public Android 12 install smoke test builds **standardDebug** only, with
`:app:testStandardDebugUnitTest :app:assembleStandardDebug`.

## Android installation and signing (Samsung Android 12)

**Important:** Google Home-enabled v0.4 and the earlier GitHub Actions v0.3
APK have the **same package ID** (`se.lierikes.homeenergy.mobile`) but
were signed by **different debug signing certificates**. Android forbids
upgrading between them. If v0.3 was installed, uninstall *Li-Erikes Energy*
once before installing v0.4. This clears the old app's local settings but
does not remove Google Home or eHomeLife/Refoss devices or their automations.

Signing fingerprints:
- Old v0.3 CI test artifact SHA-256 (certificate):
  `38cc12345f8995dd64e11c48b87ce4a6c8626e77ad00e1c3b14beb7607fbcd76`
- Google Home v0.4 sorskog test APK SHA-256 (certificate):
  `fb2f0cb2868f9f0cf06ea2c6181377732b9429c5f920949a2ce395f607c12fdf`

**Do not distribute the CI standard/fallback build as an update to the
Google Home build.** GitHub runners generate different debug keys. Subsequent
Google Home candidates must be signed consistently using the same controlled
signing identity. Store signing credentials securely and outside Git; use an
explicit, backed-up release keystore before publishing a production version.
The private APK verification workflow checks the expected certificate.

A successful emulator install verifies packaging, not Samsung-specific
package installer behavior. If a fresh install still hangs, collect a device
installer error before making another APK.
