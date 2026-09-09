#!/usr/bin/env bash
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
export JAVA_HOME="${JAVA_HOME:-$root/.tools/jdk-17.0.20.1+1}"
if [[ ! -d "${ANDROID_HOME:-}/platforms" && -d "$root/.tools/android-sdk/platforms" ]]; then
  export ANDROID_HOME="$root/.tools/android-sdk"
fi
export ANDROID_HOME="${ANDROID_HOME:-$root/.tools/android-sdk}"
export GRADLE_USER_HOME="${GRADLE_USER_HOME:-$root/.tools/gradle}"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
if [[ -z "${FUND_FUNERAL_KEYSTORE:-}" && -f "$HOME/.local/share/fund-funeral-signing/release.jks" ]]; then
  export FUND_FUNERAL_KEYSTORE="$HOME/.local/share/fund-funeral-signing/release.jks"
  export FUND_FUNERAL_STORE_PASSWORD="$(cat "$HOME/.local/share/fund-funeral-signing/password")"
fi
: "${FUND_FUNERAL_KEYSTORE:?Set FUND_FUNERAL_KEYSTORE to your private release signing key}"
: "${FUND_FUNERAL_STORE_PASSWORD:?Set FUND_FUNERAL_STORE_PASSWORD}"
cd "$root/mobile/android"
./gradlew --no-daemon --max-workers=1 assembleRelease "$@"
mkdir -p "$root/dist"
cp app/build/outputs/apk/release/app-release.apk "$root/dist/fund-funeral-1.0.2-android.apk"
