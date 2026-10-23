# Home-Energy Android install test (v0.1.1)

This is **not** the full Google Home companion. The original companion v0.1.0
compiled but apparently failed installation on a Samsung Android 12 phone.

This separate minimal APK isolates the Android package installation and
launcher path. It has:

- No Google Home SDK, proprietary libraries, background services or device controls.
- No Android permissions, analytics or data access.
- A native launch screen identifying itself as a test and a button to open
  the Home-Energy website in the installed browser.
- The same application ID as the companion (`se.lierikes.homeenergy.companion`)
  and a higher versionCode, but a visible label of **Home-Energy (Install Test)**.
- A proper launcher icon, Android 10 minimum (API 29) and target API 35.

CI builds on GitHub-hosted Android SDK tooling, installs the APK on an Android 12
emulator and verifies successful Activity startup, then removes it. A successful
emulator run does **not** guarantee installation on a particular Samsung phone.

The APK must not replace the approved, protected relay. No device controls or
background switching are enabled by this application.

Build on a machine with Android SDK and Gradle 9.2.1:

```sh
gradle -p apps/android-install-smoke :app:assembleDebug
```

APK output: `apps/android-install-smoke/app/build/outputs/apk/debug/app-debug.apk`.
Retrieve CI build artifacts from the dedicated smoke-test workflow. Do not
publish an unverified file as a production release.
