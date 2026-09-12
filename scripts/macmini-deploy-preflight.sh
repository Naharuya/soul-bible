#!/bin/bash
set -euo pipefail

fail() { echo "[FAIL] $*" >&2; exit 1; }
ok() { echo "[OK] $*"; }

[[ "$(uname -s)" == "Darwin" ]] || fail "This preflight is for macOS."
[[ "$(uname -m)" == "arm64" ]] || fail "Apple Silicon arm64 is required for the configured runner labels."

for cmd in git node flutter; do
  command -v "$cmd" >/dev/null 2>&1 || fail "$cmd is not on PATH"
  ok "$cmd: $(command -v "$cmd")"
done

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [[ -z "$SDK" && -f android/local.properties ]]; then
  SDK="$(sed -n 's/^sdk.dir=//p' android/local.properties | head -1 | sed 's/\\:/:/g; s/\\\\/\\/g')"
fi
[[ -n "$SDK" ]] || fail "Android SDK path is unavailable. Set ANDROID_HOME/ANDROID_SDK_ROOT or android/local.properties."

ADB="$SDK/platform-tools/adb"
SIGNER="$SDK/build-tools/36.0.0/apksigner"
AAPT="$SDK/build-tools/36.0.0/aapt"
[[ -x "$ADB" ]] || fail "adb missing: $ADB"
[[ -x "$SIGNER" ]] || fail "apksigner missing: $SIGNER"
[[ -x "$AAPT" ]] || fail "aapt missing: $AAPT"
ok "Android SDK tools"

[[ -f android/key.properties ]] || fail "android/key.properties missing"
[[ -f android/soul-bible-release.jks ]] || fail "android/soul-bible-release.jks missing"
ok "Release signing files exist (contents not printed)"

DEVICE_LIST="$($ADB devices | awk '$2=="device" {print $1}')"
DEVICE_COUNT="$(printf '%s\n' "$DEVICE_LIST" | sed '/^$/d' | wc -l | tr -d ' ')"
if [[ "$DEVICE_COUNT" == "1" ]]; then
  ok "One authorized Android device: $(printf '%s\n' "$DEVICE_LIST" | head -1)"
elif [[ "$DEVICE_COUNT" == "0" ]]; then
  echo "[WARN] No authorized Android phone connected. Auto-deploy will fail until one is available."
else
  fail "More than one authorized Android device is connected. Keep exactly one for automatic deployment."
fi

node --test scripts/android-release.test.mjs
ok "Installer safety tests"

echo
ok "Mac mini is ready for ONARIA self-hosted deployment."
