#!/usr/bin/env bash
# Install the pinned, out-of-repo tooling used to run the real backend and
# browser tests in sandboxes that have no native MariaDB, no Docker and no
# Playwright browser CDN access (only the npm registry is reachable).
#
#   scripts/dev-db/setup-sandbox-tools.sh
#
# Installs into ${IME365_TOOLS_DIR:-$HOME/.cache/ime365-tools} (outside the
# repository, never committed):
#   - lite4mariadb@0.1.2          MariaDB server engine compiled to WebAssembly
#   - @sparticuz/chromium@153.0.0 Chromium 153 shipped inside the npm tarball
# and prints the environment variables the bridge and Playwright read.
set -Eeuo pipefail

TOOLS_DIR="${IME365_TOOLS_DIR:-$HOME/.cache/ime365-tools}"
mkdir -p "$TOOLS_DIR"
cd "$TOOLS_DIR"
[[ -f package.json ]] || npm init -y >/dev/null
npm install --no-audit --no-fund --save-exact lite4mariadb@0.1.2 @sparticuz/chromium@153.0.0 >/dev/null

# Chromium: decompress the binary (to /tmp/chromium) and the NSS/NSPR shared
# libraries it needs. We deliberately do NOT use the package's default Lambda
# flags (--disable-web-security, --single-process): browser tests must run
# with normal same-origin and CORS enforcement.
node --input-type=module -e "
import chromium from '@sparticuz/chromium';
import fs from 'node:fs';
import zlib from 'node:zlib';
const executable = await chromium.executablePath();
fs.mkdirSync('chromium-libs', { recursive: true });
fs.writeFileSync('chromium-libs/al2023.tar', zlib.brotliDecompressSync(fs.readFileSync('node_modules/@sparticuz/chromium/bin/al2023.tar.br')));
console.log(executable);
" > chromium-path.txt
tar -xf chromium-libs/al2023.tar -C chromium-libs
CHROMIUM="$(cat chromium-path.txt)"
LD_LIBRARY_PATH="$TOOLS_DIR/chromium-libs/lib" "$CHROMIUM" --version

cat <<ENV

Tools ready in $TOOLS_DIR. Export before running browser tests:
  export PLAYWRIGHT_CHROMIUM_EXECUTABLE=$CHROMIUM
  export LD_LIBRARY_PATH=$TOOLS_DIR/chromium-libs/lib
Start the database bridge with:
  node scripts/dev-db/mariadb-sandbox-bridge.mjs
ENV
