#!/usr/bin/env sh
#
# verify-backup-schedule.sh
# -------------------------
# Verify whether the Hostinger/MariaDB host has the managed ResumePilot DR
# crontab block installed.
#
# This script must be run ON the production host (or any host with the repo)
# by the deployment operator. The sandbox cannot install or inspect the real
# host crontab, so the repository-side gap remains an EXTERNAL/BLOCKED
# operational action until this returns PASS on the host.
#
# Usage:
#   sh ops/dr/verify-backup-schedule.sh
#
# Exit 0 = PASS (managed DR schedule present), 1 = MISSING (host action needed),
# 2 = host config not visible / crontab unavailable.

set -u

BEGIN="# >>> ResumePilot DR backup schedule (managed) >>>"
END="# <<< ResumePilot DR backup schedule (managed) <<<"

if ! command -v crontab >/dev/null 2>&1; then
  echo "ERROR: crontab is unavailable on this host; cannot verify the DR schedule." >&2
  exit 2
fi

CURRENT="$(crontab -l 2>/dev/null || true)"

echo "$CURRENT" | grep -qF "$BEGIN" || {
  echo "MISSING: ResumePilot DR backup crontab block is NOT installed." >&2
  echo "ACTION: run  sh ops/dr/install-backup-schedule.sh  as the application user on the production host." >&2
  exit 1
}

echo "$CURRENT" | grep -qF "dr:backup" || {
  echo "MISSING: DR backup crontab block exists but does not schedule dr:backup." >&2
  echo "ACTION: re-run  sh ops/dr/install-backup-schedule.sh  to repair the managed block." >&2
  exit 1
}

echo "PASS: ResumePilot DR backup schedule is installed on this host."
exit 0
