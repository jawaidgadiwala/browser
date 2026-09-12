#!/bin/bash
# Build /Applications/Browser.app: a copy of the stock BrowserOS.app with our
# icon and name, re-signed ad-hoc so macOS runs it. The stock bundle is left
# untouched. Re-run after every BrowserOS update. The proper fix is the native
# Chromium build with the staged branding in packages/browseros/resources.
set -euo pipefail
SRC="${1:-/Applications/BrowserOS.app}"
DST="${2:-/Applications/Browser.app}"
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
ICNS="$ROOT/branding/Browser.icns"
[ -f "$ICNS" ] || { echo "missing $ICNS"; exit 1; }
[ -d "$SRC" ] || { echo "missing $SRC"; exit 1; }

echo "[brand] copying $SRC -> $DST"
rm -rf "$DST"; cp -R "$SRC" "$DST"
xattr -cr "$DST"; find "$DST" -name .DS_Store -delete
C="$DST/Contents"
cp "$ICNS" "$C/Resources/app.icns"
find "$C" -maxdepth 6 -name document.icns -exec cp "$ICNS" {} \;
/usr/libexec/PlistBuddy -c "Set :CFBundleName Browser" -c "Set :CFBundleDisplayName Browser" "$C/Info.plist"

FW="$C/Frameworks/BrowserOS Framework.framework"
V="$(ls -d "$FW"/Versions/[0-9]* | head -1)"
sign() { codesign --force --sign - --preserve-metadata=entitlements "$@" 2>&1 | grep -v 'replacing existing signature' || true; }
echo "[brand] signing inside-out (ad-hoc, no hardened runtime)"
SP="$V/Frameworks/Sparkle.framework"
if [ -d "$SP" ]; then
  SPV="$(ls -d "$SP"/Versions/[A-Z]* | head -1)"
  for f in "$SPV"/XPCServices/*.xpc "$SPV"/Autoupdate "$SPV"/Updater.app "$SPV"/Sparkle; do [ -e "$f" ] && sign "$f"; done
  sign "$SP"
fi
for f in "$V"/Libraries/*.dylib "$V"/Helpers/* "$V/BrowserOS Framework"; do [ -e "$f" ] && sign "$f"; done
sign "$FW"
for f in "$C"/Frameworks/*.framework; do [ "$f" != "$FW" ] && sign "$f"; done
sign "$DST"
codesign --verify --deep --strict "$DST" && echo "[brand] signature ok"
touch "$DST"
echo "[brand] done: $DST"
