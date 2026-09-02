#!/usr/bin/env bash
# Build a narrowly allow-listed, secret-free production release bundle.
# The resulting archive is consumed by ops/deploy/remote-deploy.sh over the
# restricted SSH forced-command gateway. It is never extracted by the CI runner.
set -Eeuo pipefail

usage() {
  cat <<'USAGE'
Usage: scripts/create-production-release.sh [COMMIT_SHA] [OUTPUT_FILE]

Prerequisites:
  * COMMIT_SHA is the currently checked-out, clean Git commit.
  * npm run build has produced dist/index.html.
  * backend dependencies remain represented by backend/package-lock.json.
USAGE
}

[[ "${1:-}" != "-h" && "${1:-}" != "--help" ]] || { usage; exit 0; }

TOOL_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
if command -v cygpath >/dev/null 2>&1; then
  [[ -n "${RELEASE_SOURCE_ROOT:-}" ]] && RELEASE_SOURCE_ROOT="$(cygpath -u "$RELEASE_SOURCE_ROOT")"
fi
ROOT="${RELEASE_SOURCE_ROOT:-$TOOL_ROOT}"
ROOT="$(cd "$ROOT" && pwd -P)"
cd "$ROOT"

COMMIT_SHA="${1:-$(git rev-parse HEAD)}"
OUTPUT_FILE="${2:-$ROOT/.release/resumepilot-${COMMIT_SHA}.tar.gz}"
if command -v cygpath >/dev/null 2>&1; then
  OUTPUT_FILE="$(cygpath -u "$OUTPUT_FILE")"
fi

if [[ ! "$COMMIT_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "ERROR: release commit must be a full, lowercase 40-character Git SHA." >&2
  exit 2
fi

HEAD_SHA="$(git rev-parse HEAD)"
if [[ "$HEAD_SHA" != "$COMMIT_SHA" ]]; then
  echo "ERROR: requested release $COMMIT_SHA is not checked out (HEAD is $HEAD_SHA)." >&2
  exit 2
fi

# A release must correspond exactly to a reviewed commit. Ignored build output is
# allowed, but staged or unstaged tracked changes are not.
git diff --quiet --
git diff --cached --quiet --

for required in \
  dist/index.html \
  dist/.htaccess \
  dist/api/index.php \
  backend/index.js \
  backend/package.json \
  backend/package-lock.json \
  backend/routes \
  backend/services \
  backend/security \
  backend/enterprise \
  backend/database \
  backend/repositories \
  backend/fonts; do
  if [[ ! -e "$required" ]]; then
    echo "ERROR: required release path is missing: $required" >&2
    exit 2
  fi
done

EXPECTED_BUILD_MARKER="data-build-sha=\"$COMMIT_SHA\" content=\"$COMMIT_SHA\""
if ! grep -Fq -- "$EXPECTED_BUILD_MARKER" dist/index.html; then
  echo "ERROR: dist/index.html was not built from release commit $COMMIT_SHA." >&2
  exit 2
fi

case "$OUTPUT_FILE" in
  /*) ;;
  *) OUTPUT_FILE="$ROOT/$OUTPUT_FILE" ;;
esac
mkdir -p "$(dirname "$OUTPUT_FILE")"

WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/resumepilot-release.XXXXXX")"
cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT INT TERM
umask 077

PAYLOAD="$WORK_DIR/payload"
BACKEND_STAGE="$WORK_DIR/backend"
mkdir -p "$PAYLOAD" "$BACKEND_STAGE"

# Deliberate allow-list: no .env, local operator utilities, tests, credentials,
# logs, or node_modules can enter the backend archive.
tar -C backend -cf - \
  index.js \
  package.json \
  package-lock.json \
  routes \
  services \
  security \
  enterprise \
  database \
  repositories \
  fonts \
  | tar -C "$BACKEND_STAGE" -xf -
printf '%s\n' "$COMMIT_SHA" > "$BACKEND_STAGE/COMMIT_SHA"

# Defense in depth against a future allow-list regression.
if find "$BACKEND_STAGE" -type f \( \
  -name '.env' -o -name '.env.*' -o -name '*.pem' -o -name '*.key' \
  -o -name 'id_rsa*' -o -name 'id_ed25519*' -o -name '*credentials*.json' \
\) -print -quit | grep -q .; then
  echo "ERROR: credential-shaped file entered the backend release." >&2
  exit 3
fi
if find dist -type f \( \
  -name '.env' -o -name '.env.*' -o -name '*.pem' -o -name '*.key' \
  -o -name 'id_rsa*' -o -name 'id_ed25519*' -o -name '*credentials*.json' \
\) -print -quit | grep -q .; then
  echo "ERROR: credential-shaped file entered the public frontend build." >&2
  exit 3
fi
python3 - "$BACKEND_STAGE" dist <<'PY'
import pathlib
import re
import sys

pem_patterns = (
    # Complete PEM, including JSON/.env values whose newlines are escaped.
    re.compile(
        rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"
        rb"(?:[A-Za-z0-9+/=\r\n]|\\[rn]){100,}"
        rb"-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"
    ),
    # Also reject a truncated PEM when a marker is followed by a substantial
    # base64 body. A human-readable validation error containing only the marker
    # is not key material and must not make a real application build impossible.
    re.compile(
        rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\"']?"
        rb"(?:\r?\n|\\[rn])(?:[A-Za-z0-9+/=]|\r?\n|\\[rn]){100,}"
    ),
)
for root in map(pathlib.Path, sys.argv[1:]):
    for candidate in root.rglob("*"):
        if candidate.is_file() and candidate.name != "package-lock.json":
            try:
                data = candidate.read_bytes()
            except OSError:
                continue
            if any(pattern.search(data) for pattern in pem_patterns):
                raise SystemExit(f"ERROR: private-key material detected in release file {candidate}")
PY

# Normalize ownership metadata. Runtime permissions are applied again by the
# receiver; no local uid/gid is trusted by production.
tar --sort=name --owner=0 --group=0 --numeric-owner \
  -C "$BACKEND_STAGE" -czf "$PAYLOAD/backend.tar.gz" .
tar --sort=name --owner=0 --group=0 --numeric-owner \
  -C dist -czf "$PAYLOAD/frontend.tar.gz" .

BACKEND_SHA256="$(sha256sum "$PAYLOAD/backend.tar.gz" | awk '{print $1}')"
FRONTEND_SHA256="$(sha256sum "$PAYLOAD/frontend.tar.gz" | awk '{print $1}')"
CREATED_AT="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"

cat > "$PAYLOAD/manifest.env" <<MANIFEST
format_version=1
commit_sha=$COMMIT_SHA
created_at=$CREATED_AT
backend_sha256=$BACKEND_SHA256
frontend_sha256=$FRONTEND_SHA256
MANIFEST
printf '%s  %s\n' "$BACKEND_SHA256" backend.tar.gz > "$PAYLOAD/SHA256SUMS"
printf '%s  %s\n' "$FRONTEND_SHA256" frontend.tar.gz >> "$PAYLOAD/SHA256SUMS"

TMP_OUTPUT="$WORK_DIR/release.tar.gz"
tar --sort=name --owner=0 --group=0 --numeric-owner \
  -C "$PAYLOAD" -czf "$TMP_OUTPUT" \
  manifest.env SHA256SUMS backend.tar.gz frontend.tar.gz
chmod 600 "$TMP_OUTPUT"
mv -f "$TMP_OUTPUT" "$OUTPUT_FILE"
chmod 600 "$OUTPUT_FILE"

BUNDLE_SHA256="$(sha256sum "$OUTPUT_FILE" | awk '{print $1}')"
BUNDLE_BYTES="$(wc -c < "$OUTPUT_FILE" | tr -d '[:space:]')"
printf 'release_file=%s\n' "$OUTPUT_FILE"
printf 'release_sha=%s\n' "$COMMIT_SHA"
printf 'bundle_sha256=%s\n' "$BUNDLE_SHA256"
printf 'bundle_bytes=%s\n' "$BUNDLE_BYTES"
