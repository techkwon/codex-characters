#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="HighLearning Pet Reminder"
APP_PATH="$ROOT_DIR/src-tauri/target/release/bundle/macos/$APP_NAME.app"
OUT_DIR="$ROOT_DIR/src-tauri/target/release/bundle/portable"
ZIP_PATH="$OUT_DIR/${APP_NAME// /-}_macos_aarch64_portable.zip"

if [[ ! -d "$APP_PATH" ]]; then
  echo "Missing app bundle: $APP_PATH" >&2
  echo "Run npm run build first." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
rm -f "$ZIP_PATH"

ditto -c -k --sequesterRsrc --keepParent "$APP_PATH" "$ZIP_PATH"

echo "$ZIP_PATH"
