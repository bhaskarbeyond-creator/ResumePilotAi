#!/usr/bin/env bash
# Production-side receiver for a ResumePilot release bundle.
#
# This script is installed outside the webroot and is invoked only through the
# forced-command SSH gateway. The `receive` action reads one archive from stdin.
set -Eeuo pipefail
umask 077

readonly ACTION="${1:-}"
readonly REQUESTED_SHA="${2:-}"
readonly EXPECTED_BUNDLE_SHA256="${3:-}"
readonly RELEASE_SIGNATURE="${4:-}"
readonly CONFIG_FILE="${RESUMEPILOT_DEPLOY_CONFIG:-$HOME/.config/resumepilot-deploy/config}"

log() { printf '[resumepilot-deploy] %s\n' "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }

[[ "$CONFIG_FILE" == "$HOME/"* ]] || die "deployment config must be inside HOME"
command -v realpath >/dev/null || die "realpath is required"
[[ -f "$CONFIG_FILE" && ! -L "$CONFIG_FILE" ]] || die "deployment config must be a regular, non-symlink file"
[[ "$(realpath -e "$CONFIG_FILE")" == "$CONFIG_FILE" ]] || die "deployment config path must be canonical"
CONFIG_OWNER="$(stat -c '%u' "$CONFIG_FILE")"
CONFIG_MODE="$(stat -c '%a' "$CONFIG_FILE")"
[[ "$CONFIG_OWNER" == "$(id -u)" ]] || die "deployment config has the wrong owner"
# Reject any group/other permission. The config does not contain application
# secrets, but protecting it prevents command/path substitution by another user.
(( (8#$CONFIG_MODE & 8#077) == 0 )) || die "deployment config must not be group/world accessible"
# shellcheck disable=SC1090
source "$CONFIG_FILE"

: "${APP_HOME:?APP_HOME is required}"
: "${BACKEND_DIR:?BACKEND_DIR is required}"
: "${WEBROOT_DIR:?WEBROOT_DIR is required}"
: "${PUBLIC_URL:?PUBLIC_URL is required}"
: "${PM2_APP:?PM2_APP is required}"
: "${NODE_BIN:?NODE_BIN is required}"
: "${NPM_BIN:?NPM_BIN is required}"
: "${PM2_BIN:?PM2_BIN is required}"
: "${DEPLOY_STATE_DIR:?DEPLOY_STATE_DIR is required}"
: "${RELEASE_SIGNING_PUBLIC_KEY:?RELEASE_SIGNING_PUBLIC_KEY is required}"

readonly MAX_BUNDLE_BYTES="${MAX_BUNDLE_BYTES:-268435456}"
readonly RETAIN_RELEASES="${RETAIN_RELEASES:-5}"
readonly VERIFY_ATTEMPTS="${VERIFY_ATTEMPTS:-12}"
readonly VERIFY_DELAY_SECONDS="${VERIFY_DELAY_SECONDS:-5}"
readonly LOCK_DIR="$DEPLOY_STATE_DIR/deploy.lock"
readonly INCOMING_DIR="$DEPLOY_STATE_DIR/incoming"
readonly STAGING_ROOT="$DEPLOY_STATE_DIR/staging"
readonly ROLLBACK_ROOT="$DEPLOY_STATE_DIR/rollback"
readonly ARCHIVE_DIR="$DEPLOY_STATE_DIR/releases"
readonly RECEIPT_DIR="$DEPLOY_STATE_DIR/receipts"

assert_safe_config() {
  [[ "$APP_HOME" == "$HOME" || "$APP_HOME" == "$HOME/"* ]] || die "APP_HOME must be inside HOME"
  [[ "$BACKEND_DIR" == "$APP_HOME/"* ]] || die "BACKEND_DIR must be inside APP_HOME"
  [[ "$WEBROOT_DIR" == "$APP_HOME/"* ]] || die "WEBROOT_DIR must be inside APP_HOME"
  [[ "$DEPLOY_STATE_DIR" == "$HOME/"* ]] || die "DEPLOY_STATE_DIR must be inside HOME"
  [[ "$RELEASE_SIGNING_PUBLIC_KEY" == "$HOME/"* ]] || die "release signing public key must be inside HOME"
  command -v realpath >/dev/null || die "realpath is required"
  [[ "$(realpath -e "$HOME")" == "$HOME" ]] || die "HOME must be an existing canonical path"
  [[ "$(realpath -e "$APP_HOME")" == "$APP_HOME" ]] || die "APP_HOME must be an existing canonical path"
  [[ "$(realpath -e "$BACKEND_DIR")" == "$BACKEND_DIR" ]] || die "BACKEND_DIR must be an existing canonical path"
  [[ "$(realpath -e "$WEBROOT_DIR")" == "$WEBROOT_DIR" ]] || die "WEBROOT_DIR must be an existing canonical path"
  [[ "$PUBLIC_URL" =~ ^https://[A-Za-z0-9.-]+$ ]] || die "PUBLIC_URL must be an HTTPS origin without a path"
  [[ "$MAX_BUNDLE_BYTES" =~ ^[0-9]+$ ]] || die "MAX_BUNDLE_BYTES must be numeric"
  [[ "$RETAIN_RELEASES" =~ ^[1-9][0-9]*$ ]] || die "RETAIN_RELEASES must be a positive integer"
  [[ "$VERIFY_ATTEMPTS" =~ ^[1-9][0-9]*$ ]] && ((VERIFY_ATTEMPTS <= 60)) \
    || die "VERIFY_ATTEMPTS must be between 1 and 60"
  [[ "$VERIFY_DELAY_SECONDS" =~ ^[0-9]+$ ]] && ((VERIFY_DELAY_SECONDS <= 60)) \
    || die "VERIFY_DELAY_SECONDS must be between 0 and 60"
  [[ -x "$NODE_BIN" ]] || die "configured Node binary is not executable"
  [[ -f "$RELEASE_SIGNING_PUBLIC_KEY" && ! -L "$RELEASE_SIGNING_PUBLIC_KEY" ]] \
    || die "release signing public key must be a regular, non-symlink file"
  [[ "$(realpath -e "$RELEASE_SIGNING_PUBLIC_KEY")" == "$RELEASE_SIGNING_PUBLIC_KEY" ]] \
    || die "release signing public key path must be canonical"
  [[ "$(stat -c '%u' "$RELEASE_SIGNING_PUBLIC_KEY")" == "$(id -u)" ]] || die "release signing public key has the wrong owner"
  (( (8#$(stat -c '%a' "$RELEASE_SIGNING_PUBLIC_KEY") & 8#077) == 0 )) \
    || die "release signing public key must not be group/world accessible"
  "$NODE_BIN" -e '
const { createPublicKey } = require("node:crypto");
const fs = require("node:fs");
const input = fs.readFileSync(process.argv[1], "utf8");
if (input.includes("PRIVATE KEY")) process.exit(1);
const key = createPublicKey(input);
if (key.asymmetricKeyType !== "ed25519") process.exit(1);
' "$RELEASE_SIGNING_PUBLIC_KEY" || die "release signing public key must be valid Ed25519 PEM"
  [[ -x "$NPM_BIN" ]] || die "configured npm binary is not executable"
  [[ -x "$PM2_BIN" ]] || die "configured PM2 binary is not executable"
  command -v python3 >/dev/null || die "python3 is required"
  command -v tar >/dev/null || die "tar is required"
  command -v gzip >/dev/null || die "gzip is required"
  command -v sha256sum >/dev/null || die "sha256sum is required"
  command -v curl >/dev/null || die "curl is required"
  [[ -d "$BACKEND_DIR" ]] || die "current backend directory is missing"
  [[ -d "$WEBROOT_DIR" ]] || die "current frontend webroot is missing"
}

active_sha() {
  local value=""
  if [[ -f "$BACKEND_DIR/COMMIT_SHA" ]]; then
    value="$(tr -d '[:space:]' < "$BACKEND_DIR/COMMIT_SHA" 2>/dev/null || true)"
  fi
  [[ "$value" =~ ^[0-9a-f]{40}$ ]] && printf '%s' "$value" || printf 'unknown'
}

status() {
  assert_safe_config
  printf 'service=resumepilot\n'
  printf 'active_sha=%s\n' "$(active_sha)"
  if "$PM2_BIN" pid "$PM2_APP" 2>/dev/null | grep -Eq '^[1-9][0-9]*$'; then
    printf 'pm2_status=online\n'
  else
    printf 'pm2_status=not_online\n'
  fi
  printf 'release_archives=%s\n' "$(find "$ARCHIVE_DIR" -maxdepth 1 -type f -name '*.tar.gz' 2>/dev/null | wc -l | tr -d '[:space:]')"
}

acquire_lock() {
  mkdir -p "$DEPLOY_STATE_DIR" "$INCOMING_DIR" "$STAGING_ROOT" "$ROLLBACK_ROOT" "$ARCHIVE_DIR" "$RECEIPT_DIR"
  local state_path
  for state_path in "$DEPLOY_STATE_DIR" "$INCOMING_DIR" "$STAGING_ROOT" "$ROLLBACK_ROOT" "$ARCHIVE_DIR" "$RECEIPT_DIR"; do
    [[ "$(realpath -e "$state_path")" == "$state_path" ]] \
      || die "deployment state paths must be canonical and contain no symlink components"
  done
  chmod 700 "$DEPLOY_STATE_DIR" "$INCOMING_DIR" "$STAGING_ROOT" "$ROLLBACK_ROOT" "$ARCHIVE_DIR" "$RECEIPT_DIR"

  if mkdir "$LOCK_DIR" 2>/dev/null; then
    printf '%s\n' "$$" > "$LOCK_DIR/pid"
    date -u +'%Y-%m-%dT%H:%M:%SZ' > "$LOCK_DIR/started_at"
    return
  fi

  # Recover only locks older than one hour. Normal contention fails closed.
  if [[ -d "$LOCK_DIR" ]] && find "$LOCK_DIR" -maxdepth 0 -mmin +60 -print -quit | grep -q .; then
    local stale="$DEPLOY_STATE_DIR/deploy.lock.stale.$(date -u +%Y%m%dT%H%M%SZ)"
    mv "$LOCK_DIR" "$stale"
    mkdir "$LOCK_DIR"
    printf '%s\n' "$$" > "$LOCK_DIR/pid"
    date -u +'%Y-%m-%dT%H:%M:%SZ' > "$LOCK_DIR/started_at"
    log "recovered a stale deployment lock"
    return
  fi
  die "another production release is already running"
}

release_lock() {
  rm -rf "$LOCK_DIR"
}

receive_with_limit() {
  local destination="$1"
  python3 -c '
import os, sys
path, maximum = sys.argv[1], int(sys.argv[2])
total = 0
with open(path, "xb") as out:
    while True:
        chunk = sys.stdin.buffer.read(1024 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > maximum:
            out.close()
            os.unlink(path)
            raise SystemExit("release bundle exceeds the configured byte limit")
        out.write(chunk)
if total == 0:
    os.unlink(path)
    raise SystemExit("empty release bundle")
print(total)
' "$destination" "$MAX_BUNDLE_BYTES"
}

verify_bundle_signature() {
  local archive="$1"
  local actual_hash
  [[ "$EXPECTED_BUNDLE_SHA256" =~ ^[0-9a-f]{64}$ ]] || die "expected bundle digest is invalid"
  [[ "$RELEASE_SIGNATURE" =~ ^[A-Za-z0-9_-]{86}$ ]] || die "release signature encoding is invalid"
  actual_hash="$(sha256sum "$archive" | awk '{print $1}')"
  [[ "$actual_hash" == "$EXPECTED_BUNDLE_SHA256" ]] || die "received bundle digest does not match the signed digest"
  "$NODE_BIN" - "$RELEASE_SIGNING_PUBLIC_KEY" "$REQUESTED_SHA" "$actual_hash" "$RELEASE_SIGNATURE" <<'NODE' \
    || die "release signature verification failed"
const { createPublicKey, verify } = require('node:crypto');
const fs = require('node:fs');
const [publicKeyPath, releaseSha, bundleSha, encodedSignature] = process.argv.slice(2);
const publicKey = createPublicKey(fs.readFileSync(publicKeyPath));
if (publicKey.asymmetricKeyType !== 'ed25519') process.exit(2);
const message = Buffer.from(`resumepilot-release-v1\n${releaseSha}\n${bundleSha}\n`, 'ascii');
const signature = Buffer.from(encodedSignature, 'base64url');
if (signature.length !== 64 || !verify(null, message, publicKey, signature)) process.exit(1);
NODE
}

validate_and_extract_tar() {
  local archive="$1"
  local destination="$2"
  local profile="$3"
  python3 - "$archive" "$destination" "$profile" <<'PY'
import os
import pathlib
import sys
import tarfile

archive, destination, profile = sys.argv[1:]
outer_allowed = {"manifest.env", "SHA256SUMS", "backend.tar.gz", "frontend.tar.gz"}
max_file = 256 * 1024 * 1024
max_total = 512 * 1024 * 1024

with tarfile.open(archive, "r:gz") as tf:
    members = tf.getmembers()
    seen = set()
    total = 0
    if len(members) > 20000:
        raise SystemExit("archive contains too many members")
    for member in members:
        raw = member.name
        normalized = raw[2:] if raw.startswith("./") else raw
        if profile != "outer" and raw in (".", "./") and member.isdir():
            continue
        if any(ord(character) < 32 or ord(character) == 127 for character in raw):
            raise SystemExit(f"archive path contains control characters: {raw!r}")
        path = pathlib.PurePosixPath(normalized)
        canonical = path.as_posix()
        if not normalized or normalized != canonical or path.is_absolute() or ".." in path.parts:
            raise SystemExit(f"unsafe archive path (non-canonical): {raw!r}")
        normalized = canonical
        if member.issym() or member.islnk() or member.isdev() or member.isfifo():
            raise SystemExit(f"links and special files are forbidden: {raw!r}")
        if not (member.isfile() or member.isdir()):
            raise SystemExit(f"unsupported archive member: {raw!r}")
        if member.size > max_file:
            raise SystemExit(f"archive member is too large: {raw!r}")
        total += member.size
        if total > max_total:
            raise SystemExit("expanded archive exceeds the configured limit")
        if normalized in seen:
            raise SystemExit(f"duplicate archive member: {raw!r}")
        seen.add(normalized)
        if profile == "outer":
            if member.isdir() or normalized not in outer_allowed:
                raise SystemExit(f"unexpected outer archive member: {raw!r}")
    if profile == "outer" and seen != outer_allowed:
        missing = ", ".join(sorted(outer_allowed - seen))
        raise SystemExit(f"outer archive is incomplete: {missing}")

    # All paths and types were validated above. Use tarfile's data filter when
    # available and retain the explicit checks for older Python releases.
    kwargs = {}
    if hasattr(tarfile, "data_filter"):
        kwargs["filter"] = "data"
    tf.extractall(destination, **kwargs)
PY
}

sync_frontend() {
  local source_dir="$1"
  local destination_dir="$2"
  python3 - "$source_dir" "$destination_dir" <<'PY'
import os
import pathlib
import shutil
import stat
import sys
import uuid

source = pathlib.Path(sys.argv[1]).resolve(strict=True)
destination = pathlib.Path(sys.argv[2]).resolve(strict=True)
if not source.is_dir() or not destination.is_dir():
    raise SystemExit("frontend source and destination must be directories")

# Never follow a release-controlled or pre-existing symlink. `.well-known` is
# provider-managed and is left entirely untouched.
def under_well_known(relative):
    return bool(relative.parts) and relative.parts[0] == ".well-known"

for root, dirs, files in os.walk(source, followlinks=False):
    root_path = pathlib.Path(root)
    relative_root = root_path.relative_to(source)
    for name in dirs + files:
        candidate = root_path / name
        if candidate.is_symlink():
            raise SystemExit(f"frontend source symlink is forbidden: {candidate.relative_to(source)}")

for root, dirs, files in os.walk(destination, followlinks=False):
    root_path = pathlib.Path(root)
    relative_root = root_path.relative_to(destination)
    if under_well_known(relative_root):
        dirs[:] = []
        continue
    for name in list(dirs) + files:
        candidate = root_path / name
        relative = candidate.relative_to(destination)
        if under_well_known(relative):
            continue
        if candidate.is_symlink():
            raise SystemExit(f"frontend destination symlink is forbidden: {relative}")

source_dirs = set()
source_files = []
for root, dirs, files in os.walk(source, followlinks=False):
    root_path = pathlib.Path(root)
    relative_root = root_path.relative_to(source)
    if relative_root != pathlib.Path("."):
        source_dirs.add(relative_root)
    for directory in dirs:
        source_dirs.add(relative_root / directory)
    for filename in files:
        relative = relative_root / filename
        if under_well_known(relative):
            continue
        source_files.append(relative)

for relative in sorted(source_dirs, key=lambda item: (len(item.parts), item.as_posix())):
    if under_well_known(relative):
        continue
    target = destination / relative
    target.mkdir(mode=0o755, parents=True, exist_ok=True)
    if target.is_symlink() or not target.is_dir():
        raise SystemExit(f"unsafe frontend destination directory: {relative}")

# Content-addressed assets and API proxy files land before index.html switches.
source_files.sort(key=lambda item: (item.name == "index.html", item.as_posix()))
for relative in source_files:
    source_file = source / relative
    target = destination / relative
    temporary = target.parent / f".{target.name}.deploy-{uuid.uuid4().hex}.tmp"
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    descriptor = os.open(temporary, flags, 0o600)
    try:
        with os.fdopen(descriptor, "wb", closefd=True) as output, source_file.open("rb") as input_file:
            shutil.copyfileobj(input_file, output, length=1024 * 1024)
            output.flush()
            os.fsync(output.fileno())
        source_stat = source_file.stat()
        os.chmod(temporary, stat.S_IMODE(source_stat.st_mode) & 0o755 or 0o644)
        os.replace(temporary, target)
    finally:
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass

expected_files = set(source_files)
expected_dirs = source_dirs
for root, dirs, files in os.walk(destination, topdown=False, followlinks=False):
    root_path = pathlib.Path(root)
    relative_root = root_path.relative_to(destination)
    if under_well_known(relative_root):
        continue
    for filename in files:
        relative = relative_root / filename
        if under_well_known(relative) or relative in expected_files:
            continue
        (destination / relative).unlink()
    for directory in dirs:
        relative = relative_root / directory
        if under_well_known(relative) or relative in expected_dirs:
            continue
        target = destination / relative
        try:
            target.rmdir()
        except OSError:
            pass
PY
}

read_manifest_value() {
  local manifest="$1"
  local key="$2"
  awk -F= -v wanted="$key" '$1 == wanted { print substr($0, index($0, "=") + 1) }' "$manifest"
}

verify_live_sha() {
  local expected="$1"
  local attempts="${2:-12}"
  local expected_asset="${3:-}"
  local response=""
  local root_response=""
  local observed=""
  local ready_code=""
  local root_code=""
  local enterprise_code=""
  local asset_matches="false"

  for ((i=1; i<=attempts; i++)); do
    response="$(curl --silent --show-error --fail --max-time 15 \
      -H 'Cache-Control: no-cache' "$PUBLIC_URL/api/healthz" 2>/dev/null || true)"
    observed="$(printf '%s' "$response" | "$NODE_BIN" -e '
let data="";process.stdin.on("data",c=>data+=c).on("end",()=>{try{const v=JSON.parse(data);process.stdout.write(String(v.commitSha||""))}catch{}})
' 2>/dev/null || true)"
    ready_code="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 15 \
      -H 'Cache-Control: no-cache' "$PUBLIC_URL/api/readyz" 2>/dev/null || true)"
    root_code="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 15 \
      -H 'Cache-Control: no-cache' "$PUBLIC_URL/" 2>/dev/null || true)"
    root_response="$(curl --silent --show-error --fail --max-time 15 \
      -H 'Cache-Control: no-cache' "$PUBLIC_URL/" 2>/dev/null || true)"
    enterprise_code="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 15 \
      -H 'Cache-Control: no-cache' "$PUBLIC_URL/enterprise" 2>/dev/null || true)"
    asset_matches="false"
    [[ -z "$expected_asset" || "$root_response" == *"$expected_asset"* ]] && asset_matches="true"

    if [[ "$observed" == "$expected" && "$ready_code" == "200" && "$root_code" == "200" && "$enterprise_code" == "200" && "$asset_matches" == "true" ]]; then
      return 0
    fi
    sleep "$VERIFY_DELAY_SECONDS"
  done

  log "verification mismatch: expected_sha=$expected observed_sha=${observed:-none} ready=$ready_code root=$root_code enterprise=$enterprise_code asset_match=$asset_matches"
  return 1
}

prune_old_items() {
  local pattern="$1"
  local keep="$2"
  # Filenames are generated internally and contain no whitespace/newlines.
  mapfile -t old_items < <(find "$(dirname "$pattern")" -maxdepth 1 -mindepth 1 -name "$(basename "$pattern")" -printf '%T@ %p\n' 2>/dev/null \
    | sort -rn | tail -n "+$((keep + 1))" | cut -d' ' -f2-)
  if ((${#old_items[@]})); then
    rm -rf -- "${old_items[@]}"
  fi
}

rollback_switch() {
  local prior_backend="$1"
  local prior_frontend="$2"
  local failed_backend="$3"
  local rollback_failed="false"

  log "release activation failed; restoring the pre-release backend and frontend"
  if [[ -d "$prior_backend" ]]; then
    if [[ -e "$failed_backend" ]]; then
      log "WARNING: failed-release quarantine path already exists: $failed_backend"
      rollback_failed="true"
    elif [[ -d "$BACKEND_DIR" ]]; then
      mv "$BACKEND_DIR" "$failed_backend" || rollback_failed="true"
    fi
    if [[ "$rollback_failed" != "true" && ! -e "$BACKEND_DIR" ]]; then
      mv "$prior_backend" "$BACKEND_DIR" || rollback_failed="true"
    fi
  elif [[ ! -d "$BACKEND_DIR" ]]; then
    log "WARNING: neither the current nor prior backend is available during rollback"
    rollback_failed="true"
  fi

  if [[ -d "$prior_frontend" ]]; then
    mkdir -p "$WEBROOT_DIR" || rollback_failed="true"
    if [[ "$rollback_failed" != "true" ]]; then
      sync_frontend "$prior_frontend" "$WEBROOT_DIR" || rollback_failed="true"
    fi
  else
    log "WARNING: prior frontend snapshot is missing during rollback"
    rollback_failed="true"
  fi

  "$PM2_BIN" restart "$PM2_APP" --update-env >/dev/null 2>&1 || rollback_failed="true"
  [[ "$rollback_failed" != "true" ]]
}

receive_release() {
  [[ "$REQUESTED_SHA" =~ ^[0-9a-f]{40}$ ]] || die "release id must be a full lowercase Git SHA"
  assert_safe_config
  acquire_lock

  local stamp incoming="" stage="" outer backend_stage frontend_stage manifest manifest_sha
  local backend_hash frontend_hash previous_sha rollback_dir prior_backend prior_frontend failed_backend
  local expected_asset prior_asset
  local activation_started="false" activation_committed="false" rollback_attempted="false"
  cleanup_receive() {
    [[ -z "$incoming" || ! -e "$incoming" ]] || rm -f "$incoming"
    [[ -z "$stage" || ! -e "$stage" ]] || rm -rf "$stage"
    # Failed activations retain forensic rollback data, but never without a
    # bound; otherwise repeated failed releases could exhaust the account.
    prune_old_items "$ROLLBACK_ROOT/*" "$RETAIN_RELEASES" 2>/dev/null || true
    release_lock
  }
  on_receive_exit() {
    local exit_code="$?"
    trap - EXIT INT TERM
    if [[ "$activation_started" == "true" && "$activation_committed" != "true" && "$rollback_attempted" != "true" ]]; then
      rollback_attempted="true"
      log "release interrupted during activation; restoring the pre-release state"
      if ! rollback_switch "$prior_backend" "$prior_frontend" "$failed_backend"; then
        log "WARNING: automatic rollback after interruption did not complete cleanly"
      fi
    fi
    cleanup_receive
    exit "$exit_code"
  }
  trap on_receive_exit EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM

  stamp="$(date -u +%Y%m%dT%H%M%SZ)-$$"
  incoming="$INCOMING_DIR/${REQUESTED_SHA}.${stamp}.tar.gz"
  stage="$STAGING_ROOT/${REQUESTED_SHA}.${stamp}"
  outer="$stage/outer"
  backend_stage="$stage/backend"
  frontend_stage="$stage/frontend"
  mkdir -p "$outer" "$backend_stage" "$frontend_stage"

  log "receiving release $REQUESTED_SHA"
  local received_bytes
  received_bytes="$(receive_with_limit "$incoming")" || die "release upload failed"
  log "received $received_bytes bytes"
  verify_bundle_signature "$incoming"
  gzip -t "$incoming" || die "release bundle is not valid gzip"
  validate_and_extract_tar "$incoming" "$outer" outer

  manifest="$outer/manifest.env"
  python3 - "$manifest" "$outer/SHA256SUMS" "$REQUESTED_SHA" <<'PY' \
    || die "release metadata validation failed"
import re
import sys

manifest_path, sums_path, expected_sha = sys.argv[1:]
expected_keys = {
    "format_version", "commit_sha", "created_at",
    "backend_sha256", "frontend_sha256",
}
values = {}
with open(manifest_path, "r", encoding="ascii", newline="") as handle:
    lines = handle.read().splitlines()
if len(lines) != len(expected_keys):
    raise SystemExit("manifest must contain exactly five lines")
for line in lines:
    if "=" not in line:
        raise SystemExit("malformed manifest line")
    key, value = line.split("=", 1)
    if key not in expected_keys or key in values:
        raise SystemExit("unexpected or duplicate manifest key")
    values[key] = value
if set(values) != expected_keys:
    raise SystemExit("manifest keys are incomplete")
if values["format_version"] != "1" or values["commit_sha"] != expected_sha:
    raise SystemExit("manifest version or commit is invalid")
if not re.fullmatch(r"[0-9a-f]{64}", values["backend_sha256"]):
    raise SystemExit("invalid backend digest")
if not re.fullmatch(r"[0-9a-f]{64}", values["frontend_sha256"]):
    raise SystemExit("invalid frontend digest")
if not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", values["created_at"]):
    raise SystemExit("invalid creation timestamp")
with open(sums_path, "r", encoding="ascii", newline="") as handle:
    sums = handle.read().splitlines()
expected_sums = {
    f'{values["backend_sha256"]}  backend.tar.gz',
    f'{values["frontend_sha256"]}  frontend.tar.gz',
}
if len(sums) != 2 or set(sums) != expected_sums:
    raise SystemExit("checksum file is not the exact fixed allow-list")
PY
  manifest_sha="$(read_manifest_value "$manifest" commit_sha)"
  backend_hash="$(sha256sum "$outer/backend.tar.gz" | awk '{print $1}')"
  frontend_hash="$(sha256sum "$outer/frontend.tar.gz" | awk '{print $1}')"
  [[ "$backend_hash" == "$(read_manifest_value "$manifest" backend_sha256)" ]] || die "backend payload checksum mismatch"
  [[ "$frontend_hash" == "$(read_manifest_value "$manifest" frontend_sha256)" ]] || die "frontend payload checksum mismatch"

  validate_and_extract_tar "$outer/backend.tar.gz" "$backend_stage" inner
  validate_and_extract_tar "$outer/frontend.tar.gz" "$frontend_stage" inner
  [[ -f "$backend_stage/index.js" && -f "$backend_stage/package-lock.json" ]] || die "backend payload is incomplete"
  [[ -f "$frontend_stage/index.html" && -f "$frontend_stage/.htaccess" && -f "$frontend_stage/api/index.php" ]] \
    || die "frontend payload is incomplete"
  grep -Fq -- "data-build-sha=\"$REQUESTED_SHA\" content=\"$REQUESTED_SHA\"" "$frontend_stage/index.html" \
    || die "frontend build identity does not match the signed release"
  expected_asset="$(grep -oE 'assets/[A-Za-z0-9._-]+\.js' "$frontend_stage/index.html" | head -1 || true)"
  [[ -n "$expected_asset" ]] || die "frontend index has no content-addressed JavaScript entry"
  [[ -f "$frontend_stage/$expected_asset" ]] || die "frontend entry asset is missing from the payload"
  [[ "$(tr -d '[:space:]' < "$backend_stage/COMMIT_SHA")" == "$REQUESTED_SHA" ]] \
    || die "backend COMMIT_SHA is invalid"
  if find "$backend_stage" -type f \( -name '.env' -o -name '.env.*' -o -name '*.pem' -o -name '*.key' -o -name 'id_ed25519*' -o -name 'id_rsa*' \) -print -quit | grep -q .; then
    die "credential-shaped file found in backend payload"
  fi

  log "installing production dependencies in staging"
  export PATH="$(dirname "$NODE_BIN"):$(dirname "$PM2_BIN"):/usr/local/bin:/usr/bin:/bin"
  (cd "$backend_stage" && "$NPM_BIN" ci --omit=dev --ignore-scripts --no-audit --no-fund)
  "$NODE_BIN" --check "$backend_stage/index.js"

  # Preserve mutable server-only configuration as late as possible, without
  # ever transmitting it through CI. This minimizes the admin-update race.
  [[ -f "$BACKEND_DIR/.env" ]] || die "existing backend .env is missing; refusing to replace runtime"
  install -m 600 "$BACKEND_DIR/.env" "$backend_stage/.env"
  if [[ -f "$BACKEND_DIR/email_config.json" ]]; then
    install -m 600 "$BACKEND_DIR/email_config.json" "$backend_stage/email_config.json"
  fi
  if [[ -f "$BACKEND_DIR/database/engine_state.json" ]]; then
    install -m 600 "$BACKEND_DIR/database/engine_state.json" "$backend_stage/database/engine_state.json"
  fi

  previous_sha="$(active_sha)"
  rollback_dir="$ROLLBACK_ROOT/${stamp}-${previous_sha}"
  prior_backend="$rollback_dir/backend"
  prior_frontend="$rollback_dir/frontend"
  failed_backend="$rollback_dir/failed-${REQUESTED_SHA}"
  mkdir -p "$rollback_dir" "$prior_frontend"
  chmod 700 "$rollback_dir"

  prior_asset="$(grep -oE 'assets/[A-Za-z0-9._-]+\.js' "$WEBROOT_DIR/index.html" 2>/dev/null | head -1 || true)"
  log "capturing pre-release rollback snapshot (active_sha=$previous_sha)"
  cp -a "$WEBROOT_DIR/." "$prior_frontend/"

  # Backend directory renames occur on one filesystem and are atomic. The
  # currently running Node process keeps serving while the path is switched.
  # From this point until the health gate commits, EXIT/INT/TERM also trigger
  # restoration so an interrupted SSH session cannot strand a half-release.
  activation_started="true"
  mv "$BACKEND_DIR" "$prior_backend"
  if ! mv "$backend_stage" "$BACKEND_DIR"; then
    mv "$prior_backend" "$BACKEND_DIR"
    rollback_attempted="true"
    die "could not activate the staged backend; previous backend restored"
  fi

  # Vite assets are content-addressed. Atomic per-file updates copy new assets
  # before index.html changes and retain provider-managed .well-known files.
  if ! sync_frontend "$frontend_stage" "$WEBROOT_DIR"; then
    rollback_attempted="true"
    rollback_switch "$prior_backend" "$prior_frontend" "$failed_backend"
    die "frontend switch failed; previous release restored"
  fi

  log "restarting $PM2_APP"
  if ! "$PM2_BIN" restart "$PM2_APP" --update-env >/dev/null; then
    rollback_attempted="true"
    rollback_switch "$prior_backend" "$prior_frontend" "$failed_backend"
    die "PM2 restart failed; previous release restored"
  fi
  "$PM2_BIN" save >/dev/null 2>&1 || true

  if ! verify_live_sha "$REQUESTED_SHA" "$VERIFY_ATTEMPTS" "$expected_asset"; then
    rollback_attempted="true"
    rollback_switch "$prior_backend" "$prior_frontend" "$failed_backend"
    if [[ "$previous_sha" =~ ^[0-9a-f]{40}$ ]]; then
      verify_live_sha "$previous_sha" "$VERIFY_ATTEMPTS" "$prior_asset" || log "WARNING: rollback completed but its health verification also failed"
    fi
    die "release failed health verification and was rolled back"
  fi
  activation_committed="true"

  local archived receipt
  archived="$ARCHIVE_DIR/${stamp}-${REQUESTED_SHA}.tar.gz"
  mv "$incoming" "$archived"
  receipt="$RECEIPT_DIR/${stamp}-${REQUESTED_SHA}.env"
  cat > "$receipt" <<RECEIPT
format_version=1
status=deployed
commit_sha=$REQUESTED_SHA
previous_sha=$previous_sha
deployed_at=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
bundle_sha256=$(sha256sum "$archived" | awk '{print $1}')
backend_sha256=$backend_hash
frontend_sha256=$frontend_hash
RECEIPT
  chmod 600 "$receipt"

  rm -rf "$stage"
  prune_old_items "$ARCHIVE_DIR/*.tar.gz" "$RETAIN_RELEASES"
  prune_old_items "$ROLLBACK_ROOT/*" "$RETAIN_RELEASES"
  prune_old_items "$RECEIPT_DIR/*.env" "$((RETAIN_RELEASES * 4))"
  log "release $REQUESTED_SHA is healthy and active"
  printf 'deployed_sha=%s\n' "$REQUESTED_SHA"
  printf 'previous_sha=%s\n' "$previous_sha"
  trap - EXIT INT TERM
  cleanup_receive
}

case "$ACTION" in
  status)
    [[ -z "$REQUESTED_SHA" && -z "$EXPECTED_BUNDLE_SHA256" && -z "$RELEASE_SIGNATURE" ]] \
      || die "status takes no release metadata"
    status
    ;;
  receive)
    receive_release
    ;;
  *)
    die "unsupported deployment action"
    ;;
esac
