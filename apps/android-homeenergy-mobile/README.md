# Li-Erikes Energy Android app v0.2.1

Small, native Java/Android application that hosts the existing Home-Energy
dashboard securely in a WebView at `https://energy.li-erikes.se/`.

Its launcher is labeled **Li-Erikes Energy**, with a navy house-and-lightning icon, to distinguish it from **Home-Energy Companion** and the older install-test app. It adds a persistent Home and Reload toolbar, status/error handling, strict
HTTPS and origin rules, and a launcher icon. Android permits only INTERNET.
This build deliberately **does not** include the licensed Google Home SDK,
device controls, unattended schedules or background tasks.

**Testing:** The GitHub Actions Android 12 workflow must install, launch,
confirm the app is still running, and uninstall the APK, in addition to
successful compilation and signature checks. CI emulator success cannot
guarantee Samsung-specific installation.

**Samsung install of v0.2.1:** This has the **same package ID** as the v0.2.0 dashboard app. Because GitHub Actions debug-signed APKs may use different keys between runs, Android may refuse an in-place update with a signature conflict. In that case, uninstall only the previous **Home-Energy** dashboard app and then install **Li-Erikes Energy**; do not remove **Home-Energy Companion** unless you no longer need it. This clears the old app local WebView storage, not server-side Home-Energy data.

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
