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
echo "Checking Devices screen without Google OAuth or physical plug access"
adb shell uiautomator dump /sdcard/homeenergy-ui.xml >/dev/null
adb pull /sdcard/homeenergy-ui.xml /tmp/homeenergy-ui.xml >/dev/null
python3 - <<'PY'
import re
import subprocess
from pathlib import Path
xml=Path('/tmp/homeenergy-ui.xml').read_text()
match=re.search(r'text="Devices"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"',xml)
if not match:
    raise SystemExit("Devices toolbar button not visible")
l,t,r,b=map(int,match.groups())
subprocess.run(['adb','shell','input','tap',str((l+r)//2),str((t+b)//2)],check=True)
PY
sleep 3
adb shell uiautomator dump /sdcard/homeenergy-devices.xml >/dev/null
adb pull /sdcard/homeenergy-devices.xml /tmp/homeenergy-devices.xml >/dev/null
grep -q 'Connect Google Home' /tmp/homeenergy-devices.xml
grep -q 'Open existing Google Home controls' /tmp/homeenergy-devices.xml
echo "Android 12 launch, Google Home Devices screen and existing controls shortcut: PASS"
adb uninstall "$PKG"
