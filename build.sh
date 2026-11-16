#!/bin/sh
# Sync www/ into the Android assets and build the debug APK.
set -e
cd "$(dirname "$0")"

rm -rf android/app/src/main/assets/www
mkdir -p android/app/src/main/assets
cp -r www android/app/src/main/assets/www

cd android
./gradlew assembleDebug --no-daemon \
  -Pandroid.aapt2FromMavenOverride=/tmp/androidsdk/build-tools/34.0.0/aapt2 \
  -Dorg.gradle.native=false -Dorg.gradle.vfs.watch=false

APK=app/build/outputs/apk/debug/app-debug.apk
echo "APK: $(pwd)/$APK"
ls -l "$APK"
