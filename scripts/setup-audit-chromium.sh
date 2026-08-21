#!/usr/bin/env bash
# Sets up a self-contained Chromium for Playwright in sandboxes where the
# Playwright browser CDN and OS package mirrors are unreachable but the npm
# registry is. The @lidio601/chromium package vendors the chromium binary plus
# an Amazon Linux 2023 library bundle (complete NSS/NSPR stack) inside its npm
# tarball; inflating both yields a browser Playwright can drive.
#
# Usage:  bash scripts/setup-audit-chromium.sh [TARGET_DIR]
# Prints: export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=...
#         export PLAYWRIGHT_CHROMIUM_LD_LIBRARY_PATH=...
set -euo pipefail

TARGET="${1:-/tmp/audit-chromium}"
PKG="@lidio601/chromium@127.0.2"

mkdir -p "$TARGET"
cd "$TARGET"

if [ ! -x "$TARGET/package/bin/chromium" ]; then
  npm pack "$PKG" --silent >/dev/null 2>&1 || npm pack "$PKG"
  tar xzf ./*.tgz
  node -e "
    const fs = require('fs'), zlib = require('zlib');
    const dir = process.argv[1] + '/package/bin';
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.br'))) {
      fs.writeFileSync(dir + '/' + f.slice(0, -3), zlib.brotliDecompressSync(fs.readFileSync(dir + '/' + f)));
    }
    console.log('[setup-audit-chromium] inflated', fs.readdirSync(dir).length, 'entries');
  " "$TARGET"
  chmod +x "$TARGET/package/bin/chromium"
fi

# Unpack the runtime library bundles (NSS/NSPR for AL2023) next to the binary.
for bundle in al2023 al2 fonts swiftshader; do
  if [ -f "$TARGET/package/bin/$bundle.tar" ] && [ ! -d "$TARGET/package/bin/$bundle" ]; then
    mkdir -p "$TARGET/package/bin/$bundle"
    tar xf "$TARGET/package/bin/$bundle.tar" -C "$TARGET/package/bin/$bundle" 2>/dev/null || true
  fi
done

echo "export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=$TARGET/package/bin/chromium"
echo "export PLAYWRIGHT_CHROMIUM_LD_LIBRARY_PATH=$TARGET/package/bin/al2023/lib"
