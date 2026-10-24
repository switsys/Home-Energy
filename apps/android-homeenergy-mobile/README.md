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
