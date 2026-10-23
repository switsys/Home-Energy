#!/usr/bin/env bash
set -euo pipefail

apk="apps/android-install-smoke/app/build/outputs/apk/debug/app-debug.apk"
package="se.lierikes.homeenergy.companion"
component="$package/.MainActivity"

test -s "$apk" || { echo "APK missing"; exit 1; }
echo "Installing minimal Home-Energy APK on real Android emulator"
adb install -r "$apk"
adb shell pm path "$package" | grep -q 'package:'
echo "Launching Home-Energy using Android package manager"
adb shell am start -W -n "$component"
sleep 3

# Verify actual process runs, rather than merely accepting an install command.
pid="$(adb shell pidof "$package" | tr -d '\r')"
test -n "$pid" || {
  echo "FAIL: APK was installed but application process did not launch"
  adb logcat -d -t 200 | grep -i -E 'FATAL EXCEPTION|homeenergy|INSTALL_FAILED' | tail -30 || true
  exit 1
}
adb logcat -d -s HomeEnergyInstallTest:I '*:S' | grep -q 'LAUNCHED_OK_V2' || {
  echo "FAIL: expected onCreate launch marker not observed"
  adb logcat -d -s HomeEnergyInstallTest:I '*:S' | tail -40 || true
  exit 1
}
echo "PASS: Android installed and launched minimal Home-Energy app (PID $pid)."
adb shell am force-stop "$package"
adb uninstall "$package"
echo "PASS: Test app uninstalled cleanly."
