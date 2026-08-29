#!/usr/bin/env sh
#
# install-backup-schedule.sh
# --------------------------
# Install the automated MariaDB backup schedule.
#
# This is the single highest-value DR control in the whole programme: without a
# schedule there is no measurable RPO, because the recovery point is whatever
# someone last remembered to take by hand.
#
# The script is idempotent. It replaces only the block between its own markers
# and leaves every other crontab entry untouched, so it can be re-run after the
# repository path or schedule changes.
#
# Usage
#   sh ops/dr/install-backup-schedule.sh [--repo <dir>] [--interval <hours>] [--uninstall]
#
# Defaults
#   repo      : the directory containing this repository (auto-detected)
#   interval  : 6 hours  ->  RPO target of <= 6 hours
#
# What gets installed
#   Backups   every N hours : npm run dr:backup
#   Retention every day     : npm run dr:retain
#   Monitor   every 30 min  : npm run dr:monitor
#
# Monitoring is scheduled separately from backups on purpose: if the backup job
# breaks, the monitor must still run to tell you it broke.

set -eu

REPO=""
INTERVAL="6"
UNINSTALL="0"

while [ $# -gt 0 ]; do
  case "$1" in
    --repo) REPO="${2:-}"; shift 2 ;;
    --interval) INTERVAL="${2:-}"; shift 2 ;;
    --uninstall) UNINSTALL="1"; shift ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [ -z "$REPO" ]; then
  REPO=$(cd "$(dirname "$0")/../.." && pwd)
fi

if [ ! -f "$REPO/scripts/dr-backup-run.mjs" ]; then
  echo "ERROR: $REPO does not look like the ResumePilot repository." >&2
  exit 2
fi

case "$INTERVAL" in
  ''|*[!0-9]*) echo "ERROR: --interval must be a whole number of hours." >&2; exit 2 ;;
esac
if [ "$INTERVAL" -lt 1 ] || [ "$INTERVAL" -gt 23 ]; then
  echo "ERROR: --interval must be between 1 and 23 hours." >&2
  exit 2
fi

# Build the cron schedule expression.
#   interval 1  -> hourly at minute 17
#   interval N  -> at minute 17 past every Nth hour
if [ "$INTERVAL" -eq 1 ]; then
  BACKUP_SCHEDULE="17 * * * *"
else
  BACKUP_SCHEDULE="17 */$INTERVAL * * *"
fi

BEGIN="# >>> ResumePilot DR backup schedule (managed) >>>"
END="# <<< ResumePilot DR backup schedule (managed) <<<"

CURRENT=""
if command -v crontab >/dev/null 2>&1; then
  CURRENT=$(crontab -l 2>/dev/null || true)
fi

# Strip any previous managed block.
STRIPPED=$(printf '%s\n' "$CURRENT" | awk -v b="$BEGIN" -v e="$END" '
  $0 == b { skip = 1; next }
  $0 == e { skip = 0; next }
  skip { next }
  { print }
')

if [ "$UNINSTALL" = "1" ]; then
  printf '%s\n' "$STRIPPED" | grep -v '^[[:space:]]*$' | crontab -
  echo "Removed the managed ResumePilot backup schedule."
  exit 0
fi

LOG_DIR="$REPO/logs"
mkdir -p "$LOG_DIR"
chmod 700 "$LOG_DIR"

BLOCK=$(cat <<EOF
$BEGIN
# Automated MariaDB backup. Establishes a measurable RPO of <= ${INTERVAL}h.
$BACKUP_SCHEDULE cd $REPO && /usr/bin/env NODE_ENV=production npm run dr:backup >> $LOG_DIR/dr-backup.log 2>&1
# Retention pruning (grandfather-father-son). Runs daily, independent of backups.
43 3 * * * cd $REPO && /usr/bin/env NODE_ENV=production npm run dr:retain >> $LOG_DIR/dr-retain.log 2>&1
# DR health monitor. Any non-zero exit is an alertable condition.
*/30 * * * * cd $REPO && /usr/bin/env NODE_ENV=production npm run dr:monitor -- --quiet >> $LOG_DIR/dr-monitor.log 2>&1
$END
EOF
)

# Hostinger SHARED hosting does not provide crontab access - scheduled tasks
# must be created in hPanel (Advanced -> Cron Jobs). Only VPS plans allow
# editing crontab directly. Detect which world we are in rather than failing.
CRONTAB_AVAILABLE="0"
if command -v crontab >/dev/null 2>&1; then
  if crontab -l >/dev/null 2>&1; then CRONTAB_AVAILABLE="1"; fi
fi

if [ "$CRONTAB_AVAILABLE" = "1" ]; then
  printf '%s\n%s\n' "$STRIPPED" "$BLOCK" | grep -v '^[[:space:]]*$' | crontab -
  echo "Installed the ResumePilot DR backup schedule via crontab:"
  echo "  backups   : $BACKUP_SCHEDULE  (interval ${INTERVAL}h, RPO target ${INTERVAL}h)"
  echo "  retention : daily 03:43"
  echo "  monitor   : every 30 minutes"
  echo
  echo "Verify with: crontab -l"
else
  echo "crontab is NOT available on this host."
  echo
  echo "This is expected on Hostinger SHARED hosting, where scheduled tasks are"
  echo "managed in hPanel and crontab access is reserved for VPS plans."
  echo "Use ops/dr/backup-cron.sh as the cron entrypoint; it needs no shell"
  echo "special characters, which hPanel does not accept reliably."
  echo
  echo "Create these three jobs in hPanel -> Advanced -> Cron Jobs:"
  echo
  echo "  1) Backups    ($BACKUP_SCHEDULE, RPO target ${INTERVAL}h)"
  echo "     /bin/sh $REPO/ops/dr/backup-cron.sh backup"
  echo
  echo "  2) Retention  (43 3 * * *)"
  echo "     /bin/sh $REPO/ops/dr/backup-cron.sh retain"
  echo
  echo "  3) Monitoring (*/30 * * * *)"
  echo "     /bin/sh $REPO/ops/dr/backup-cron.sh monitor"
  echo
  echo "Each run's output is viewable with hPanel's \"View Output\" and is also"
  echo "appended to $REPO/logs/dr-<command>.log"
  echo
  echo "Managed block (for reference, if you later move to a VPS with crontab):"
  printf '%s\n' "$BLOCK"
fi

echo
echo "Two things must be configured before the first run will succeed:"
echo "  BACKUP_ENCRYPTION_KEY_BASE64   openssl rand -base64 32"
echo "  BACKUP_OFFSITE_DESTINATION     object-storage target for the independent copy"
echo
echo "Put them in $REPO/ops/dr/backup.env (chmod 600, untracked)."
echo "hPanel cron does not inherit a login shell, so the wrapper loads them"
echo "from that file explicitly."
