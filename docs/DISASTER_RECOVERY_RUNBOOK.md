# Disaster Recovery Runbook

Procedures for recovering ResumePilot AI from each failure class.

Authoritative database: MariaDB 11.8.8-MariaDB-log, `u727965524_airesume`
Production origin: `https://airesume.projectdemo.guru`
Status labels: `VERIFIED` · `VERIFIED (LOCAL)` · `DESIGNED` · `NOT VERIFIED` · `BLOCKED`

> **Never destroy production to test disaster recovery.** Every destructive
> procedure here targets an isolated, disposable environment.

---

## 0. Reconstructing the environment from scratch (Scenario E prerequisite)

A DR plan is only real if the environment can be rebuilt from artefacts rather
than from one engineer's memory. Inventory:

| Component | Source of truth | Status |
|---|---|---|
| Application code | Git — `origin/main` at a known SHA | **VERIFIED** (`f51e055`) |
| Backend dependencies | `backend/package-lock.json` | **VERIFIED** |
| Frontend build | `npm run build` with `VITE_BUILD_SHA=<sha>` | **VERIFIED** |
| Deployment bundle | `.github/workflows/production-release.yml` → `create-production-release.sh` | **VERIFIED** (pipeline exists) |
| Runtime config | `backend/.env` on host + `ops/dr/backup.env` | **NOT VERIFIED** — not in Git (correct), must be backed up separately |
| Process supervision | `ecosystem.config.js` (PM2, 1 instance, fork mode) | **VERIFIED** |
| Database schema | `backend/database/migrations/*.sql` (14 migrations) | **VERIFIED** |
| Database data | Backup artifacts in `backups/scheduled/` | **NOT VERIFIED** — none produced by automation yet |
| Web server / TLS | Cloudflare + Hostinger hPanel | **NOT VERIFIED** — documented only |

**Gap:** the host's `.env` files are deliberately untracked, so they are not
recoverable from Git. Back them up separately to offsite storage, encrypted.
Without them, a rebuilt host cannot reach MariaDB even with a perfect dump.

---

## Scenario A — Application failure (PM2 / process crash)

| Step | Command |
|---|---|
| 1. Confirm | `curl https://airesume.projectdemo.guru/api/healthz` |
| 2. Inspect | `pm2 status` / `pm2 logs resumepilot-backend --lines 100` |
| 3. Restart | `pm2 restart resumepilot-backend` |
| 4. Verify | `node scripts/dr-observability.mjs` |

**Self-healing:** `ecosystem.config.js` sets `autorestart: true`,
`max_restarts: 10`, `restart_delay: 4000`, `max_memory_restart: 600M`. A crash
loop exhausts `max_restarts` and stops — that is the condition to alert on.

Status: **DESIGNED** (auto-restart configured). Restart-and-recover timing was
measured at ~3–5 s in a prior production audit; not re-measured this session.

---

## Scenario B — Database unavailable

The application must **fail closed**, not serve stale or fabricated data.

```bash
node scripts/dr-observability.mjs      # invariants detect MariaDB DOWN
curl https://airesume.projectdemo.guru/api/readyz   # expect non-200 / not ready
```

Expected behaviour, all enforced in code and covered by
`tests/certification/mysql-outage.test.mjs`:

- no fabricated data
- no silent writes
- explicit error responses
- automatic recovery once MariaDB returns (authority mode returns to `NORMAL`)

Status: **VERIFIED (LOCAL)** by `npm run certify:runtime` (mysql-outage test).
Production behaviour during a real outage: **NOT VERIFIED** — not observed.

---

## Scenario C — Bad deployment

```text
backup → deploy → health check → rollback
```

1. **Backup first.** The release pipeline creates a pre-deployment snapshot.
2. **Deploy** via the gated workflow at an exact SHA.
3. **Verify identity** — this is the step that catches a stale CDN bundle:

   ```bash
   EXPECTED_SHA=<the sha you deployed> npm run certify:identity
   ```

4. **Roll back** if unhealthy. The workflow's `rollback` mode deliberately
   checks out old *application* source while running delivery tooling from
   current `main`, so a compromised old deployment script never executes.

Status: **VERIFIED** — `scripts/verify-backup-rollback.mjs` passed 5/5 in a prior
audit (artifact exists, is recent, is non-trivial, rollback target resolves and
is an ancestor of HEAD).

---

## Scenario D — Database restore

```bash
# 1. Verify before trusting
node scripts/db-backup.mjs verify --in <artifact>.sql.gz.enc

# 2. Restore into a DISPOSABLE database
export DB_NAME=resumepilot_restore_test
export DB_RESTORE_CONFIRM=RESTORE:resumepilot_restore_test
node scripts/db-backup.mjs restore --in <artifact>.sql.gz.enc

# 3. Validate
#    - table count vs pre-incident baseline (76 observed 2026-08-29)
#    - schema_migrations count and max version (14 observed)
#    - representative rows in users, resumes, system_settings
```

Status: **NOT VERIFIED.** The automated drill in
`tests/certification/backup-restore.test.mjs` is gated behind
`RUN_MARIADB_BACKUP_RESTORE_DRILL=true` and a disposable loopback database. It is
**skipped** in environments without MariaDB, so it currently contributes no
evidence. Structural verification of a real production artifact (76/76 tables,
14/14 migrations) **was** verified in the 2026-08-29 audit.

---

## Scenario E — Host loss

Rebuild, do not resurrect.

1. Provision a host with Node.js 20+, PM2, MariaDB 11.8.x.
2. Restore application code at the exact known SHA from `origin/main`.
3. `npm ci` and `npm --prefix backend ci`.
4. Restore `backend/.env` and `ops/dr/backup.env` from the **offsite secret copy**.
5. Recreate the database, then restore the newest verified offsite artifact.
6. `pm2 start ecosystem.config.js`.
7. Point Cloudflare DNS at the new origin.
8. `node scripts/dr-observability.mjs` then `EXPECTED_SHA=<sha> npm run certify:identity`.

**Blocking dependency:** step 4 and step 5 both need offsite copies. Neither the
secrets nor the database artifacts currently have an independent offsite copy,
so **host-loss recovery is NOT currently achievable**.

Status: **NOT VERIFIED.**

---

## Recovery objectives

### RPO

```text
Max data-loss window = backup interval + transfer uncertainty + verification limits
```

| Term | Value | Status |
|---|---|---|
| Backup interval | none configured | **NOT VERIFIED** |
| Binary log / PITR | disabled (`log_bin = 0`) | **NOT AVAILABLE** |
| **Actual measured RPO** | **unbounded** | — |
| Target RPO | 6 h (once scheduled) | **DESIGNED** |

`dr-monitor.mjs` measures this and reports `UNKNOWN` — never `OK` — when no
verified recovery point exists.

### RTO

| Phase | Measured | Value |
|---|---|---|
| Failure detection | no | — |
| Backup acquisition | no | — |
| Database restoration | no | — |
| Application startup | yes (prior audit) | ~3–5 s |
| Traffic restored | no | — |
| **End-to-end RTO** | **no** | **NOT VERIFIED** |

Do not sum component timings and call the result an RTO.

---

## 3-2-1 status

```text
3 copies ………………… NOT MET   (live DB + 1 snapshot; no offsite copy)
2 media   ………………… PARTIAL  (InnoDB + compressed dump, same host)
1 offsite ………………… NOT MET   (no destination configured)

3-2-1 STATUS: NOT MET
```

Multiple files on the same server do not satisfy 3-2-1.

---

## Drill cadence

| Drill | Frequency | Last |
|---|---|---|
| `npm run dr:test` (policy assertions) | every commit (once CI gate applied) | 2026-08-29 — 45/45 pass |
| Backup verification | every backup | **none yet** |
| Isolated restore | monthly | **never** |
| Full host-loss rehearsal | annually | **never** |

Record each drill's timestamp in `DR_LAST_RESTORE_DRILL_AT_MS` so the monitor
stops reporting `NO_RESTORE_DRILL`.
