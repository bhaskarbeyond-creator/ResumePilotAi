#!/usr/bin/env bash
# One-time production bootstrap. Run as the Hostinger account owner through an
# already authenticated administrative SSH session, never from GitHub Actions.
set -Eeuo pipefail
umask 077

log() { printf '[resumepilot-install] %s\n' "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
GATEWAY_SOURCE="$SCRIPT_DIR/forced-command-gateway.sh"
RECEIVER_SOURCE="$SCRIPT_DIR/remote-deploy.sh"

[[ -f "$GATEWAY_SOURCE" && -f "$RECEIVER_SOURCE" ]] \
  || die "forced-command-gateway.sh and remote-deploy.sh must be beside this installer"
[[ -n "${DEPLOY_PUBLIC_KEY_B64:-}" ]] \
  || die "DEPLOY_PUBLIC_KEY_B64 must contain the base64-encoded dedicated deploy public key"
[[ -n "${DEPLOY_SIGNING_PUBLIC_KEY_B64:-}" ]] \
  || die "DEPLOY_SIGNING_PUBLIC_KEY_B64 must contain the base64-encoded Ed25519 release signing public key"
[[ "$HOME" != *$'\n'* && "$HOME" != *'"'* && "$HOME" != *' '* ]] \
  || die "HOME contains unsupported characters"

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/resumepilot-install.XXXXXX")"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT INT TERM

PUBLIC_KEY_FILE="$TMP_DIR/deploy_key.pub"
printf '%s' "$DEPLOY_PUBLIC_KEY_B64" | base64 --decode > "$PUBLIC_KEY_FILE" 2>/dev/null \
  || die "DEPLOY_PUBLIC_KEY_B64 is not valid base64"
# Normalize one terminal newline and reject multiline/options-bearing input.
printf '\n' >> "$PUBLIC_KEY_FILE"
mapfile -t KEY_LINES < <(sed '/^[[:space:]]*$/d' "$PUBLIC_KEY_FILE")
[[ "${#KEY_LINES[@]}" == "1" ]] || die "deploy public key must contain exactly one non-empty line"
read -r KEY_TYPE KEY_BLOB KEY_COMMENT EXTRA <<< "${KEY_LINES[0]}"
[[ "$KEY_TYPE" == "ssh-ed25519" && "$KEY_BLOB" =~ ^[A-Za-z0-9+/]+={0,2}$ && -z "${EXTRA:-}" ]] \
  || die "deploy key must be one plain ssh-ed25519 public key (no authorized_keys options)"
printf 'ssh-ed25519 %s resumepilot-github-actions\n' "$KEY_BLOB" > "$PUBLIC_KEY_FILE"
ssh-keygen -lf "$PUBLIC_KEY_FILE" >/dev/null || die "deploy public key is invalid"

SIGNING_PUBLIC_KEY_SOURCE="$TMP_DIR/release-signing-public.pem"
printf '%s' "$DEPLOY_SIGNING_PUBLIC_KEY_B64" | base64 --decode > "$SIGNING_PUBLIC_KEY_SOURCE" 2>/dev/null \
  || die "DEPLOY_SIGNING_PUBLIC_KEY_B64 is not valid base64"
[[ "$(wc -c < "$SIGNING_PUBLIC_KEY_SOURCE")" -le 4096 ]] || die "release signing public key is unexpectedly large"

LIB_DIR="$HOME/.local/lib/resumepilot-deploy"
CONFIG_DIR="$HOME/.config/resumepilot-deploy"
STATE_DIR="$HOME/.local/state/resumepilot-deploy"
SSH_DIR="$HOME/.ssh"
AUTHORIZED_KEYS="$SSH_DIR/authorized_keys"
mkdir -p "$LIB_DIR" "$CONFIG_DIR" "$STATE_DIR" "$SSH_DIR"
chmod 700 "$LIB_DIR" "$CONFIG_DIR" "$STATE_DIR" "$SSH_DIR"

install -m 700 "$GATEWAY_SOURCE" "$LIB_DIR/forced-command-gateway.sh"
install -m 700 "$RECEIVER_SOURCE" "$LIB_DIR/remote-deploy.sh"
bash -n "$LIB_DIR/forced-command-gateway.sh"
bash -n "$LIB_DIR/remote-deploy.sh"

NODE_BIN="${NODE_BIN:-/opt/alt/alt-nodejs20/root/usr/bin/node}"
NPM_BIN="${NPM_BIN:-/opt/alt/alt-nodejs20/root/usr/bin/npm}"
PM2_BIN="${PM2_BIN:-$HOME/.local/bin/pm2}"
[[ -x "$NODE_BIN" ]] || die "Node binary is not executable: $NODE_BIN"
[[ -x "$NPM_BIN" ]] || die "npm binary is not executable: $NPM_BIN"
[[ -x "$PM2_BIN" ]] || die "PM2 binary is not executable: $PM2_BIN"
command -v python3 >/dev/null || die "python3 must be installed before bootstrap"
SIGNING_PUBLIC_KEY="$CONFIG_DIR/release-signing-public.pem"
NORMALIZED_SIGNING_PUBLIC_KEY="$TMP_DIR/release-signing-public.normalized.pem"
SIGNING_PUBLIC_KEY_SHA256="$("$NODE_BIN" - "$SIGNING_PUBLIC_KEY_SOURCE" "$NORMALIZED_SIGNING_PUBLIC_KEY" <<'NODE'
const { createHash, createPublicKey } = require('node:crypto');
const fs = require('node:fs');
const [source, destination] = process.argv.slice(2);
const input = fs.readFileSync(source, 'utf8').replace(/\r\n/g, '\n').trim();
if (input.includes('PRIVATE KEY')) process.exit(1);
const key = createPublicKey(input);
if (key.asymmetricKeyType !== 'ed25519') process.exit(1);
const normalized = key.export({ type: 'spki', format: 'pem' }).trim();
if (input !== normalized) process.exit(1);
const der = key.export({ type: 'spki', format: 'der' });
fs.writeFileSync(destination, `${normalized}\n`, { mode: 0o600, flag: 'wx' });
process.stdout.write(createHash('sha256').update(der).digest('hex'));
NODE
)" || die "release signing public key must be one canonical Ed25519 PUBLIC KEY PEM block"
[[ "$SIGNING_PUBLIC_KEY_SHA256" =~ ^[0-9a-f]{64}$ ]] || die "could not fingerprint release signing public key"
install -m 600 "$NORMALIZED_SIGNING_PUBLIC_KEY" "$SIGNING_PUBLIC_KEY"

CONFIG_FILE="$CONFIG_DIR/config"
[[ ! -L "$CONFIG_FILE" ]] || die "deployment config must not be a symlink"
if [[ ! -e "$CONFIG_FILE" ]]; then
  {
    printf 'APP_HOME=%q\n' "$HOME"
    printf 'BACKEND_DIR=%q\n' "$HOME/backend"
    printf 'WEBROOT_DIR=%q\n' "$HOME/domains/${PROD_DOMAIN:-airesume.projectdemo.guru}/public_html"
    printf 'PUBLIC_URL=%q\n' "https://${PROD_DOMAIN:-airesume.projectdemo.guru}"
    printf 'PM2_APP=%q\n' "${PM2_APP:-airesume-backend}"
    printf 'NODE_BIN=%q\n' "$NODE_BIN"
    printf 'NPM_BIN=%q\n' "$NPM_BIN"
    printf 'PM2_BIN=%q\n' "$PM2_BIN"
    printf 'DEPLOY_STATE_DIR=%q\n' "$STATE_DIR"
    printf 'RELEASE_SIGNING_PUBLIC_KEY=%q\n' "$SIGNING_PUBLIC_KEY"
    printf 'MAX_BUNDLE_BYTES=%q\n' "268435456"
    printf 'RETAIN_RELEASES=%q\n' "5"
    printf 'VERIFY_ATTEMPTS=%q\n' "12"
    printf 'VERIFY_DELAY_SECONDS=%q\n' "5"
  } > "$CONFIG_FILE"
  chmod 600 "$CONFIG_FILE"
  log "created $CONFIG_FILE"
else
  [[ "$(stat -c '%u' "$CONFIG_FILE")" == "$(id -u)" ]] || die "existing config has wrong owner"
  UPDATED_CONFIG="$TMP_DIR/config"
  grep -v '^RELEASE_SIGNING_PUBLIC_KEY=' "$CONFIG_FILE" > "$UPDATED_CONFIG" || true
  printf 'RELEASE_SIGNING_PUBLIC_KEY=%q\n' "$SIGNING_PUBLIC_KEY" >> "$UPDATED_CONFIG"
  install -m 600 "$UPDATED_CONFIG" "$CONFIG_FILE"
  log "preserved existing $CONFIG_FILE and refreshed its signing-key path"
fi

# Keep a dated local backup, then atomically replace only the prior CI key.
[[ ! -L "$AUTHORIZED_KEYS" ]] || die "authorized_keys must not be a symlink"
touch "$AUTHORIZED_KEYS"
chmod 600 "$AUTHORIZED_KEYS"
cp -p "$AUTHORIZED_KEYS" "$AUTHORIZED_KEYS.backup.$(date -u +%Y%m%dT%H%M%SZ)"
FILTERED="$TMP_DIR/authorized_keys"
awk -v blob="$KEY_BLOB" '
  index($0, "ssh-ed25519 " blob) == 0 && $0 !~ /resumepilot-github-actions([[:space:]]|$)/ { print }
' "$AUTHORIZED_KEYS" > "$FILTERED"
printf 'restrict,command="%s" ssh-ed25519 %s resumepilot-github-actions\n' \
  "$LIB_DIR/forced-command-gateway.sh" "$KEY_BLOB" >> "$FILTERED"
install -m 600 "$FILTERED" "$AUTHORIZED_KEYS"

# Direct invocation validates configuration without exposing values.
"$LIB_DIR/remote-deploy.sh" status
log "dedicated deployment key installed with a forced command and SSH restrictions"
log "deploy_key_$(ssh-keygen -lf "$PUBLIC_KEY_FILE" | sed 's/ /_/g')"
log "release_signing_public_key_sha256=$SIGNING_PUBLIC_KEY_SHA256"
log "keep the administrative key until a separate replacement login has been tested"
