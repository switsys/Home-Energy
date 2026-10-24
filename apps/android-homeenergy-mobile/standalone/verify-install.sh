#!/usr/bin/env bash
set -euo pipefail
apk=/tmp/li-energy/Li-Erikes-Energy-v0.6.0.apk
pkg=se.lierikes.homeenergy.mobile
test -s "$apk"
adb install -r "$apk"
adb shell pm path "$pkg" | grep -q 'package:'
adb logcat -c
adb shell am start -W -n "$pkg/.MainActivity"
sleep 8
adb shell pidof "$pkg" | grep -Eq '^[0-9]+'
adb logcat -d -s HomeEnergyMobile:I AndroidRuntime:E | tee /tmp/li-energy/app-log.txt
grep -q 'APP_READY_V060' /tmp/li-energy/app-log.txt
if grep -q 'FATAL EXCEPTION' /tmp/li-energy/app-log.txt; then
  echo "App crashed"
  exit 1
fi
adb uninstall "$pkg"
echo 'Native Android 12 install, launch, uninstall: PASS'
