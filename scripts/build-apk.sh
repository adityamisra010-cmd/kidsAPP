#!/usr/bin/env bash
# Builds a signed release APK at dist/mykids-tracker-v<version>.apk
#
# Requirements: JDK 17+ and the Android SDK (ANDROID_HOME). Signing env vars (see .env.example):
#   MYKIDS_KEYSTORE_PATH, MYKIDS_KEYSTORE_PASSWORD, MYKIDS_KEY_ALIAS, MYKIDS_KEY_PASSWORD
# Without them the APK is signed with the debug key (installable, but updates must use the same key).
set -euo pipefail
cd "$(dirname "$0")/.."

export ANDROID_HOME="${ANDROID_HOME:-/opt/android-sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
VERSION=$(node -p "require('./package.json').version")
OUT="dist/mykids-tracker-v${VERSION}.apk"

if [ -z "${MYKIDS_KEYSTORE_PATH:-}" ]; then
  echo "WARNING: MYKIDS_KEYSTORE_PATH not set — signing with the debug key." >&2
fi

npx expo prebuild --platform android --clean --no-install
(cd android && ./gradlew assembleRelease --no-daemon -Dorg.gradle.jvmargs="-Xmx4g -XX:MaxMetaspaceSize=1g" "$@")

mkdir -p dist
cp android/app/build/outputs/apk/release/app-release.apk "$OUT"

AAPT=$(ls "$ANDROID_HOME"/build-tools/*/aapt 2>/dev/null | sort -V | tail -1 || true)
if [ -n "$AAPT" ]; then
  "$AAPT" dump badging "$OUT" | grep -E "^(package|sdkVersion|targetSdkVersion|application-label|native-code)" || true
fi
APKSIGNER=$(ls "$ANDROID_HOME"/build-tools/*/apksigner 2>/dev/null | sort -V | tail -1 || true)
if [ -n "$APKSIGNER" ]; then
  "$APKSIGNER" verify --print-certs "$OUT" | head -3 || true
fi
ls -lh "$OUT"
echo "Built $OUT"
