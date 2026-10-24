#!/usr/bin/env bash
set -euo pipefail
dir=/tmp/home-energy-upgrade
pkg=se.lierikes.homeenergy.mobile

echo "Install known-working v0.6 baseline"
adb wait-for-device
adb install -r "$dir/Li-Erikes-Energy-v0.6.0.apk"
adb shell am start -W -n "$pkg/.MainActivity"
sleep 4
adb shell pidof "$pkg" | grep -Eq '^[0-9]+'
adb shell am force-stop "$pkg"

echo "Update in place to v0.7 signed by same release key"
adb install -r "$dir/Li-Erikes-Energy-v0.7.0-GoogleHome-test.apk"
adb logcat -c
adb shell am start -W -n "$pkg/.MainActivity"
sleep 8
adb shell pidof "$pkg" | grep -Eq '^[0-9]+'
adb logcat -d -s HomeEnergyMobile:I AndroidRuntime:E | tee "$dir/launch-log.txt"
grep -q APP_READY_V070 "$dir/launch-log.txt"
if grep -q 'FATAL EXCEPTION' "$dir/launch-log.txt"; then
  echo 'FAIL: AndroidRuntime fatal exception'
  exit 1
fi
adb exec-out screencap -p > "$dir/v07-launch.png"
test -s "$dir/v07-launch.png"
# Tap the Devices toolbar button on the 1080 x 2280 Pixel 4 emulator.
# This MUST NOT authorize Google or send a device command.
adb shell input tap 690 165
sleep 3
adb shell pidof "$pkg" | grep -Eq '^[0-9]+'
adb exec-out screencap -p > "$dir/v07-devices.png"
test -s "$dir/v07-devices.png"
if adb logcat -d -s AndroidRuntime:E | grep -q 'FATAL EXCEPTION'; then
  echo 'FAIL: AndroidRuntime fatal exception after opening Devices'
  exit 1
fi
adb uninstall "$pkg"
echo 'PASS: v0.6 -> v0.7 in-place update, launch, uninstall on Android 12'
