#!/usr/bin/env bash
set -euo pipefail

apk="apps/android-homeenergy-mobile/app/build/outputs/apk/standard/debug/app-standard-debug.apk"
package="se.lierikes.homeenergy.mobile"
component="$package/.MainActivity"

test -s "$apk" || { echo "FAIL: missing APK"; exit 1; }
echo "Checking manifest permissions and launcher"
badging="$("${ANDROID_HOME}/build-tools/35.0.0/aapt" dump badging "$apk")"
grep -q "^package: name='$package'" <<< "$badging"
grep -q "launchable-activity: name='$package.MainActivity'" <<< "$badging"
grep -Fq "application-label:'Li-Erikes Energy'" <<< "$badging"
grep -Fq "versionName='0.5.0'" <<< "$badging"
permissions="$("${ANDROID_HOME}/build-tools/35.0.0/aapt" dump permissions "$apk")"
grep -q 'android.permission.INTERNET' <<< "$permissions"
if grep -qE 'android.permission.(CAMERA|RECORD_AUDIO|READ_CONTACTS|WRITE_EXTERNAL_STORAGE|ACCESS_FINE_LOCATION|READ_SMS)' <<< "$permissions"; then
    echo "FAIL: unexpected sensitive permission"
    exit 1
fi

adb shell getprop ro.build.version.sdk
adb logcat -c
echo "Installing Home-Energy v0.5.0"
adb install -r "$apk"
adb shell pm path "$package" | grep -q 'package:'
echo "Launching Li-Erikes Energy"
adb shell am start -W -n "$component"
sleep 5
pid="$(adb shell pidof "$package" | tr -d '\r')"
test -n "$pid" || {
    echo "FAIL: activity did not stay alive"
    adb logcat -d -t 350 | grep -E 'FATAL EXCEPTION|AndroidRuntime|HomeEnergyMobile' | tail -65 || true
    exit 1
}
adb logcat -d -s HomeEnergyMobile:I '*:S' | grep -q 'APP_READY_V050' || {
    echo "FAIL: onCreate ready marker not observed"
    adb logcat -d -s HomeEnergyMobile:I '*:S' | tail -25 || true
    exit 1
}
echo "PASS: Installed and launched Home-Energy v0.5.0 on Android 12 (PID $pid)"
adb shell am force-stop "$package"
adb uninstall "$package"
echo "PASS: Removed test APK cleanly"
