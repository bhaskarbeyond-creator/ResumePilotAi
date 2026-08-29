#!/usr/bin/env sh
#
# backup-cron.sh — cron entrypoint for the ResumePilot DR backup pipeline.
#
# WHY THIS WRAPPER EXISTS
#   Hostinger hPanel cron runs the command string directly and does not
#   reliably handle shell special characters (pipes, &&, redirection), so the
#   command entered in hPanel should be as plain as possible:
#
#       /bin/sh /home/u727965524/resumepilot/ops/dr/backup-cron.sh backup
#
#   All complexity lives here instead, where it can be tested.
#
# WHY NOT `crontab`
#   Direct crontab editing is only available on Hostinger VPS plans. On shared
#   hosting, scheduled tasks must be created in hPanel (Advanced -> Cron Jobs).
#   This script works identically under either, so the same file serves both.
#
# Usage
#   sh ops/dr/backup-cron.sh [backup|retain|monitor|restore-point]
#
# Environment (set in the file below, NOT in this tracked script)
#   ops/dr/backup.env  — chmod 600, never committed, holds DB_* and
#                        BACKUP_ENCRYPTION_KEY_BASE64
#
# Logging
#   Writes to logs/dr-<command>.log and echoes to stdout, so hPanel's
#   "View Output" shows the result of the last run.

# `set -e` is deliberately NOT used: the wrapper must always exit through the
# logging path so a failed backup is visible in hPanel rather than silent.
REPO=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
COMMAND="${1:-backup}"

LOGDIR="$REPO/logs"
mkdir -p "$LOGDIR" 2>/dev/null
chmod 700 "$LOGDIR" 2>/dev/null
LOG="$LOGDIR/dr-$COMMAND.log"

say() {
  printf '%s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$1" | tee -a "$LOG"
}

say "=== dr-$COMMAND starting (repo=$REPO) ==="

# ── Load secrets from an untracked file ────────────────────────────────────
# hPanel cron does not inherit an interactive shell environment, so anything
# the backup needs must be loaded explicitly here.
ENVFILE="$REPO/ops/dr/backup.env"
if [ -f "$ENVFILE" ]; then
  # shellcheck disable=SC1090
  . "$ENVFILE"
  say "loaded environment from ops/dr/backup.env"
else
  say "WARNING: $ENVFILE not found; relying on inherited environment"
fi

# ── Locate node ────────────────────────────────────────────────────────────
NODE=""
for candidate in \
  /opt/alt/alt-nodejs20/root/usr/bin/node \
  /usr/local/bin/node \
  /usr/bin/node \
  "$(command -v node 2>/dev/null)"
do
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then
    NODE="$candidate"
    break
  fi
done

if [ -z "$NODE" ]; then
  say "FATAL: node executable not found"
  exit 127
fi
say "node=$NODE ($("$NODE" --version 2>/dev/null))"

# Hostinger shared hosting runs cron with a restricted PATH that does not
# include npm; call the scripts directly with node instead.
#
# run_node captures the REAL exit status of the node process. Piping straight
# into `tee` would make `$?` report tee's status (always 0), so a backup that
# exited 2 would look successful to cron and no one would ever be alerted.
# Output is captured to a temp file, then tee'd, so status and output coexist.
DR_STATUS=0
run_node() {
  DR_TMP="$LOGDIR/.dr-out.$$"
  (cd "$REPO" && NODE_ENV=production "$NODE" "$@") > "$DR_TMP" 2>&1
  DR_STATUS=$?
  tee -a "$LOG" < "$DR_TMP"
  rm -f "$DR_TMP"
  return $DR_STATUS
}

case "$COMMAND" in
  backup)
    say "running: dr-backup-run.mjs"
    run_node scripts/dr-backup-run.mjs
    ;;
  retain)
    say "running: dr-backup-run.mjs --retain-only --no-offsite"
    run_node scripts/dr-backup-run.mjs --retain-only --no-offsite
    ;;
  monitor)
    say "running: dr-monitor.mjs"
    run_node scripts/dr-monitor.mjs
    ;;
  restore-point)
    say "running: dr-restore-point.mjs"
    run_node scripts/dr-restore-point.mjs
    ;;
  *)
    say "FATAL: unknown command '$COMMAND' (expected backup|retain|monitor|restore-point)"
    exit 2
    ;;
esac
STATUS=$DR_STATUS

say "=== dr-$COMMAND finished with exit=$STATUS ==="
exit "$STATUS"
