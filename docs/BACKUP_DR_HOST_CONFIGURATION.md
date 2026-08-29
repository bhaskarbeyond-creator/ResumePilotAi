# Backup / DR — Host Configuration Required

**Status:** ⚫ EXTERNAL/BLOCKED (host-level crontab on Hostinger)

**Gap:** GAP-05

## What is complete in repository code

The repository contains a complete, code-side backup/DR toolkit:

| Capability | Where | Evidence |
|---|---|---|
| Backup generation + encryption + retention + integrity | `scripts/dr-backup-run.mjs` | `npm run dr:backup`, `dr:retain` |
| Restore point / rollback | `scripts/dr-restore-point.mjs`, `scripts/verify-backup-rollback.mjs` | `npm run dr:restore-point` |
| Restore drill | `scripts/dr-restore-drill.mjs` | `npm run dr:drill` |
| Monitoring / observability | `scripts/dr-monitor.mjs`, `scripts/dr-observability.mjs`, `scripts/dr-external-watch.mjs` | `npm run dr:monitor`, `dr:observe`, `dr:watch` |
| Schedule installer (operator-run) | `ops/dr/install-backup-schedule.sh` | idempotent; installs backup + retention + monitor cron entries |
| Schedule verifier | `ops/dr/verify-backup-schedule.sh` | run on the production host |
| DR hardening regression suite | `tests/dr-hardening.test.mjs` | `npm run dr:test` (112 tests in this session) |

## Exact blocker

- **What is blocked:** activation of the automated backup schedule on the Hostinger VPS.
- **Why:** the sandbox cannot install or inspect the production host's crontab, and repository code cannot mutate host-level cron.
- **By whom/provider:** Hostinger VPS operator / deployment engineer.

## What was implemented in code

- `ops/dr/install-backup-schedule.sh` already installs a **6-hour RPO** backup schedule plus a separate every-30-min monitor and daily retention job.
- `ops/dr/verify-backup-schedule.sh` added in this session to make the presence of that schedule **verifiable** and to fail loudly when it is missing.

## Remaining operational action

On the Hostinger deployment host:

```sh
cd /path/to/ResumePilotAi
sh ops/dr/install-backup-schedule.sh
sh ops/dr/verify-backup-schedule.sh   # must print PASS
```

Acceptance for GAP-05 is **only met after** that command prints `PASS` on production and a backup artifact is confirmed by `npm run dr:monitor`.
