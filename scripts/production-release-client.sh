#!/usr/bin/env bash
# Strict local client for the restricted production deployment gateway.
set -Eeuo pipefail
umask 077

usage() {
  cat <<'USAGE'
Usage:
  scripts/production-release-client.sh status
  scripts/production-release-client.sh deploy [COMMIT_SHA] [BUNDLE_FILE]

Required environment:
  PROD_SSH_HOST
  PROD_SSH_USER
  PROD_SSH_PRIVATE_KEY_FILE
  PROD_SSH_KNOWN_HOSTS_FILE
  PROD_SSH_KEY_FINGERPRINT   # SHA256:... fingerprint of the deploy public key
For deploy only:
  PROD_RELEASE_SIGNING_PRIVATE_KEY_FILE
  PROD_RELEASE_SIGNING_PUBLIC_KEY_SHA256
Optional:
  PROD_SSH_PORT              # defaults to 22

The client never accepts a password and never uses trust-on-first-use.
USAGE
}

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

assert_owned_regular_file() {
  local file="$1" label="$2" forbidden_mode="$3" mode
  [[ -f "$file" && ! -L "$file" ]] || die "$label must be a regular, non-symlink file"
  [[ "$(stat -c '%u' "$file")" == "$(id -u)" ]] || die "$label must be owned by the current user"
  mode="$(stat -c '%a' "$file")"
  (( (8#$mode & 8#$forbidden_mode) == 0 )) || die "$label has unsafe permissions"
}

ACTION="${1:-}"
[[ "$ACTION" == "status" || "$ACTION" == "deploy" ]] || { usage >&2; exit 2; }
: "${PROD_SSH_HOST:?PROD_SSH_HOST is required}"
: "${PROD_SSH_USER:?PROD_SSH_USER is required}"
: "${PROD_SSH_PRIVATE_KEY_FILE:?PROD_SSH_PRIVATE_KEY_FILE is required}"
: "${PROD_SSH_KNOWN_HOSTS_FILE:?PROD_SSH_KNOWN_HOSTS_FILE is required}"
: "${PROD_SSH_KEY_FINGERPRINT:?PROD_SSH_KEY_FINGERPRINT is required}"
PROD_SSH_PORT="${PROD_SSH_PORT:-22}"

[[ "$PROD_SSH_HOST" =~ ^[A-Za-z0-9.-]+$ ]] || die "invalid SSH host"
[[ "$PROD_SSH_USER" =~ ^[A-Za-z0-9._-]+$ ]] || die "invalid SSH user"
[[ "$PROD_SSH_PORT" =~ ^[0-9]{1,5}$ ]] && ((PROD_SSH_PORT >= 1 && PROD_SSH_PORT <= 65535)) \
  || die "invalid SSH port"
assert_owned_regular_file "$PROD_SSH_PRIVATE_KEY_FILE" "SSH private key" 077
assert_owned_regular_file "$PROD_SSH_KNOWN_HOSTS_FILE" "known_hosts" 022
[[ "$PROD_SSH_KEY_FINGERPRINT" =~ ^SHA256:[A-Za-z0-9+/]+$ ]] || die "invalid deploy-key fingerprint"

actual_fingerprint="$(ssh-keygen -lf "$PROD_SSH_PRIVATE_KEY_FILE" | awk '{print $2}')"
[[ "$actual_fingerprint" == "$PROD_SSH_KEY_FINGERPRINT" ]] \
  || die "private key fingerprint does not match PROD_SSH_KEY_FINGERPRINT"
ssh-keygen -F "[$PROD_SSH_HOST]:$PROD_SSH_PORT" -f "$PROD_SSH_KNOWN_HOSTS_FILE" >/dev/null \
  || die "known_hosts has no pinned entry for [$PROD_SSH_HOST]:$PROD_SSH_PORT"

SSH=(
  ssh
  -T
  -i "$PROD_SSH_PRIVATE_KEY_FILE"
  -p "$PROD_SSH_PORT"
  -o BatchMode=yes
  -o IdentitiesOnly=yes
  -o PasswordAuthentication=no
  -o KbdInteractiveAuthentication=no
  -o StrictHostKeyChecking=yes
  -o "UserKnownHostsFile=$PROD_SSH_KNOWN_HOSTS_FILE"
  -o ConnectTimeout=20
  -o ServerAliveInterval=15
  -o ServerAliveCountMax=3
  "$PROD_SSH_USER@$PROD_SSH_HOST"
)

if [[ "$ACTION" == "status" ]]; then
  [[ "$#" == "1" ]] || die "status takes no arguments"
  exec "${SSH[@]}" status
fi

: "${PROD_RELEASE_SIGNING_PRIVATE_KEY_FILE:?PROD_RELEASE_SIGNING_PRIVATE_KEY_FILE is required for deploy}"
: "${PROD_RELEASE_SIGNING_PUBLIC_KEY_SHA256:?PROD_RELEASE_SIGNING_PUBLIC_KEY_SHA256 is required for deploy}"
assert_owned_regular_file "$PROD_RELEASE_SIGNING_PRIVATE_KEY_FILE" "release signing private key" 077
[[ "$PROD_RELEASE_SIGNING_PUBLIC_KEY_SHA256" =~ ^[0-9a-f]{64}$ ]] || die "invalid release signing public-key digest"

TOOL_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
ROOT="${RELEASE_SOURCE_ROOT:-$TOOL_ROOT}"
ROOT="$(cd "$ROOT" && pwd -P)"
SHA="${2:-$(git -C "$ROOT" rev-parse HEAD)}"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || die "commit must be a full lowercase Git SHA"
[[ "$(git -C "$ROOT" rev-parse HEAD)" == "$SHA" ]] || die "requested commit is not checked out"
BUNDLE="${3:-$ROOT/.release/resumepilot-${SHA}.tar.gz}"
if [[ ! -f "$BUNDLE" ]]; then
  RELEASE_SOURCE_ROOT="$ROOT" "$TOOL_ROOT/scripts/create-production-release.sh" "$SHA" "$BUNDLE"
fi
[[ -s "$BUNDLE" ]] || die "release bundle is empty"

SIGNING_OUTPUT="$(node "$TOOL_ROOT/scripts/sign-production-release.mjs" \
  "$BUNDLE" "$SHA" "$PROD_RELEASE_SIGNING_PRIVATE_KEY_FILE")"
BUNDLE_SHA256="$(printf '%s\n' "$SIGNING_OUTPUT" | awk -F= '$1 == "bundle_sha256" {print $2}')"
SIGNATURE="$(printf '%s\n' "$SIGNING_OUTPUT" | awk -F= '$1 == "signature" {print $2}')"
SIGNING_PUBLIC_KEY_SHA256="$(printf '%s\n' "$SIGNING_OUTPUT" | awk -F= '$1 == "signing_public_key_sha256" {print $2}')"
[[ "$BUNDLE_SHA256" =~ ^[0-9a-f]{64}$ && "$SIGNATURE" =~ ^[A-Za-z0-9_-]{86}$ ]] \
  || die "release signer returned invalid metadata"
[[ "$SIGNING_PUBLIC_KEY_SHA256" == "$PROD_RELEASE_SIGNING_PUBLIC_KEY_SHA256" ]] \
  || die "release signing key does not match the pinned public-key digest"

printf 'Pre-deploy status:\n'
"${SSH[@]}" status
printf 'Streaming signed release %s (sha256 %s)...\n' "$SHA" "$BUNDLE_SHA256"
"${SSH[@]}" "release $SHA $BUNDLE_SHA256 $SIGNATURE" < "$BUNDLE"
