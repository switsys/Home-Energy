#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sdk="${ANDROID_HOME:-/home/admin/.local/share/home-energy/android-build-sdk}"
bt="$sdk/build-tools/35.0.0"
android="$sdk/platforms/android-36/android.jar"
jdk="${JAVA_HOME:-/home/admin/.local/share/home-energy/jdk21}"
signing_dir="${HOME_ENERGY_SIGNING_DIR:-$HOME/.config/home-energy/android-signing}"
out="$root/build"
mkdir -p "$out/classes" "$out/dex"
echo 'Compiling native Android platform-only app'
"$jdk/bin/javac" -source 8 -target 8 -Xlint:-options -cp "$android" -d "$out/classes" "$root/src/se/lierikes/homeenergy/mobile/MainActivity.java"
"$bt/d8" --min-api 23 --lib "$android" --output "$out/dex" $(find "$out/classes" -name '*.class')
echo 'Packaging Android resources'
"$bt/aapt2" compile --dir "$root/res" -o "$out/resources.zip"
"$bt/aapt2" link -o "$out/base.apk" --manifest "$root/AndroidManifest.xml" \
    -I "$android" --min-sdk-version 23 --target-sdk-version 31 \
    --version-code 7 --version-name '0.6.0' -R "$out/resources.zip"
cp "$out/base.apk" "$out/unsigned.apk"
(cd "$out/dex" && zip -q -u "$out/unsigned.apk" classes.dex)
"$bt/zipalign" -f -p 4 "$out/unsigned.apk" "$out/aligned.apk"
echo 'Signing with persistent project keystore'
"$bt/apksigner" sign \
    --ks "$signing_dir/li-erikes-energy-v1.p12" --ks-type PKCS12 \
    --ks-key-alias li-erikes-energy --ks-pass "file:$signing_dir/keypass" \
    --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true \
    --out "$out/Li-Erikes-Energy-v0.6.0.apk" "$out/aligned.apk"
"$bt/apksigner" verify --verbose --print-certs "$out/Li-Erikes-Energy-v0.6.0.apk"
"$bt/aapt2" dump badging "$out/Li-Erikes-Energy-v0.6.0.apk" | head -8
sha256sum "$out/Li-Erikes-Energy-v0.6.0.apk"
ls -lh "$out/Li-Erikes-Energy-v0.6.0.apk"
echo 'ANDROID PACKAGE OK'
