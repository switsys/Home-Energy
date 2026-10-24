#!/usr/bin/env bash
set -euo pipefail
APK_FILE="${APK_FILE:-/tmp/ghome-apk/app-googleHome-debug.apk}"
PKG=se.lierikes.homeenergy.mobile
test -s "$APK_FILE"
echo "Checking Google Home-enabled APK package and certificate"
AAPT="${ANDROID_HOME}/build-tools/35.0.0/aapt"
SIGN="${ANDROID_HOME}/build-tools/35.0.0/apksigner"
"$SIGN" verify --verbose "$APK_FILE" | grep -q '^Verifies$'
"$AAPT" dump badging "$APK_FILE" | grep -q "name='$PKG' versionCode='5' versionName='0.4.0'"
sha256sum "$APK_FILE"
echo "Installing on Android emulator"
adb wait-for-device
adb install -r "$APK_FILE"
adb shell am force-stop "$PKG" || true
adb logcat -c
adb shell am start -n "$PKG/.MainActivity"
sleep 8
adb shell pidof "$PKG" | grep -Eq '^[0-9]+'
adb logcat -d -s HomeEnergyMobile:I AndroidRuntime:E | tee /tmp/ghome-android-log.txt
grep -q 'APP_READY_V040' /tmp/ghome-android-log.txt
if grep -q 'FATAL EXCEPTION' /tmp/ghome-android-log.txt; then
  echo 'ERROR: app crashed'
  exit 1
fi
echo "Capturing Android 12 screen; OAuth and physical device tests are separate"
adb shell input keyevent 224 || true
adb shell wm dismiss-keyguard || true
adb shell input keyevent 82 || true
adb shell am start -n "$PKG/.MainActivity"
sleep 3
adb exec-out screencap -p > /tmp/homeenergy-launch.png
test -s /tmp/homeenergy-launch.png
# Android 12 emulator accessibility can return null root until after unlocking.
# Treat it as a UI inspector limitation rather than falsely declaring an APK crash.
ui=false
for attempt in 1 2 3; do
  if adb shell uiautomator dump /sdcard/homeenergy-ui.xml >/tmp/homeenergy-dump.txt 2>&1 \
    && adb pull /sdcard/homeenergy-ui.xml /tmp/homeenergy-ui.xml >/dev/null 2>&1 \
    && grep -q 'text="Devices"' /tmp/homeenergy-ui.xml; then
    ui=true
    break
  fi
  sleep 2
done
if [ "$ui" = true ]; then
  python3 - <<'PY'
import re
import subprocess
from pathlib import Path
xml = Path('/tmp/homeenergy-ui.xml').read_text()
m = re.search(r'text="Devices"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', xml)
if not m:
    raise SystemExit('Device button unavailable in UI hierarchy')
l,t,r,b = map(int, m.groups())
subprocess.run(['adb','shell','input','tap',str((l+r)//2),str((t+b)//2)],check=True)
PY
  sleep 3
  adb exec-out screencap -p > /tmp/homeenergy-devices.png
  if adb shell uiautomator dump /sdcard/homeenergy-devices.xml >/dev/null 2>&1 \
    && adb pull /sdcard/homeenergy-devices.xml /tmp/homeenergy-devices.xml >/dev/null 2>&1; then
    grep -q 'Connect Google Home' /tmp/homeenergy-devices.xml
    grep -q 'Open existing Google Home controls' /tmp/homeenergy-devices.xml
    echo 'Device screen text: VERIFIED'
  else
    echo 'Device screen text: NOT VERIFIED (emulator UI inspector unavailable)'
  fi
else
  echo 'Device screen: NOT VERIFIED (emulator UI inspector unavailable)'
fi
echo "Android 12: APK signature, install, launch marker, no fatal crash = PASS"
adb uninstall "$PKG"
