# Home-Energy Android app v0.2.0

Small, native Java/Android application that hosts the existing Home-Energy
dashboard securely in a WebView at `https://energy.li-erikes.se/`.

It adds a persistent Home and Reload toolbar, status/error handling, strict
HTTPS and origin rules, and a launcher icon. Android permits only INTERNET.
This build deliberately **does not** include the licensed Google Home SDK,
device controls, unattended schedules or background tasks.

**Testing:** The GitHub Actions Android 12 workflow must install, launch,
confirm the app is still running, and uninstall the APK, in addition to
successful compilation and signature checks. CI emulator success cannot
guarantee Samsung-specific installation.

**Signing:** GitHub Actions debug-signed APKs may use different signing keys
between runs. This app has its own application ID
`se.lierikes.homeenergy.mobile`, distinct from the failed Google Home
prototype and the v0.1.1 install test. Never install unverified updates over
existing data. For future in-place updates, set up a persistent private
release-signing key; do not check signing keys into Git.

**Dependencies:** Android Gradle Plugin 8.10.0, Gradle 9.2.1, Java 17 and
Android SDK 35. This subproject has no dependency on the proprietary Home SDK
or repository-specific build tools.

Build:
```sh
gradle -p apps/android-homeenergy-mobile :app:assembleDebug --no-daemon
```

Artifact: `apps/android-homeenergy-mobile/app/build/outputs/apk/debug/app-debug.apk`.

Install from the separately validated GitHub Actions APK artifact. If it
cannot connect, the app still opens and exposes a Reload button. To add
Google Home later, use a separate, properly approved opt-in integration.
