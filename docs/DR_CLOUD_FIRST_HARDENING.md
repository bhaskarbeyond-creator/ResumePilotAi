# P0 — Cloud-First Database Resilience & DR Hardening Certification

```
Authoritative Remote Main SHA : f51e055ed25f3d83b24a1f5eb475d2efb77aeb7b
Production Release SHA        : f51e055ed25f3d83b24a1f5eb475d2efb77aeb7b
                                (observed 2026-08-29T03:39:00.604Z)
Cloud/SRE Certification Commit: c2ab0e0124e3aecabed293f09cb4d33a350384ca
Restore Point                 : NOT CREATED — BLOCKED (see §3)
```

Report generated: 2026-08-29 (UTC)
Prepared by: Cloud/SRE engineering
Repository: `bhaskarbeyond-creator/ResumePilotAi`
Production origin: `https://airesume.projectdemo.guru`

---

## Evidence legend

| Label | Meaning |
|---|---|
| **VERIFIED** | Empirical evidence produced by this session or a prior production audit, with a reproducible command or observation. |
| **VERIFIED (LOCAL)** | Empirically verified in this environment against real files/processes, but **not** against production infrastructure. |
| **DESIGNED** | Code exists in the repository and is intended to work, but has not been exercised against production. |
| **NOT VERIFIED** | No evidence. This document does not upgrade these. |
| **BLOCKED** | Could not be attempted because a required capability (credentials, network path, binary) is absent from the executing environment. |

> **Rule applied throughout:** a capability is never labelled `VERIFIED` because the code for it exists. It is `VERIFIED` only when something was observed.

---

## 1. Authoritative source reconciliation

`origin/main` was resolved after `git fetch origin --prune` **and** `git fetch --unshallow`.
The initial clone was shallow (depth 1) and reported a single commit; unshallowing revealed
**722 commits**, confirming `f51e055` was genuinely the tip and not an artefact of a truncated clone.

```text
AUTHORITATIVE_REMOTE_MAIN_SHA=f51e055ed25f3d83b24a1f5eb475d2efb77aeb7b
```

| Reference | SHA | Status |
|---|---|---|
| Local HEAD (start of session, branch `arena/01a04b8a-resumepilotai`) | `f51e055ed25f3d83b24a1f5eb475d2efb77aeb7b` | Matches `origin/main` |
| `origin/main` | `f51e055ed25f3d83b24a1f5eb475d2efb77aeb7b` | **AUTHORITATIVE** |
| Production — observed `2026-08-29T03:23:37.649Z` | `778adf20cc18cdc2e5becca8ec98fc98ccd2b648` | **BEHIND `origin/main` by 1 commit** |
| Production — observed `2026-08-29T03:39:00.604Z` | `f51e055ed25f3d83b24a1f5eb475d2efb77aeb7b` | **MATCHES `origin/main`** |
| Previous DR commit `f51e055` | `f51e055ed25f3d83b24a1f5eb475d2efb77aeb7b` | Historical baseline **and current tip** |
| Frontend build SHA | — | **NOT VERIFIED** (reason in §2) |

### 1.1 Production was redeployed during this session

Production's reported `commitSha` changed while this audit was running:

| Time (UTC) | Endpoint | `commitSha` |
|---|---|---|
| 2026-08-29T03:23:37.649Z | `/api/healthz` | `778adf20cc18cdc2e5becca8ec98fc98ccd2b648` |
| 2026-08-29T03:23:5x | `/api/platform/version` | `778adf20cc18cdc2e5becca8ec98fc98ccd2b648` |
| 2026-08-29T03:39:00.604Z | `/api/healthz` | `f51e055ed25f3d83b24a1f5eb475d2efb77aeb7b` |
| 2026-08-29T03:39:0x | `/api/platform/version` | `f51e055ed25f3d83b24a1f5eb475d2efb77aeb7b` |

**This deployment was not performed by this session.** No deployment was triggered, and no
production credential was available to do so (§3). The most likely explanation is a release
that was already in flight or scheduled by another operator.

Two consequences, stated plainly:

1. During the window 03:23–03:39 UTC, production ran `778adf2` while `origin/main` was
   `f51e055`. The delta is **documentation and DR tooling only** — no application runtime
   code. `git show --stat f51e055` touches `docs/*` and `scripts/lib/dr-*.cjs` exclusively.
2. The reconciliation is only trustworthy because it was measured twice against two
   independent endpoints. A single probe would have recorded `778adf2` and been wrong
   fifteen minutes later.

```text
origin/main == expected release?   PASS  (f51e055)
Production  == expected release?   PASS  (f51e055, confirmed at 03:39:00.604Z)
                                   FAIL  (778adf2, at 03:23:37.649Z — since superseded)
```

### 1.2 What `f51e055` changed (reviewed before building on it)

Per the instruction not to overwrite newer work, `f51e055` was diffed before any change:

| File | Change |
|---|---|
| `docs/BACKUP_AND_DISASTER_RECOVERY.md` | +326/−… evidence corrections |
| `docs/DATABASE_PERFORMANCE_AND_SCALING.md` | ±16 |
| `docs/DATABASE_RESTORE_VERIFICATION.md` | ±111 |
| `docs/DISASTER_RECOVERY_EXERCISE.md` | +212 |
| `docs/PRODUCTION_DATABASE_ARCHITECTURE.md` | ±33 |
| `scripts/lib/dr-evidence-audit.cjs` | +476 (new) |
| `scripts/lib/dr-exercise-runner.cjs` | +271 (new) |
| `scripts/lib/dr-scenario-a.cjs` | +71 (new) |

**No change to:** database access layer, migrations, PM2, outbox, authentication,
infrastructure, health/readiness checks, or production configuration. The work in this
document therefore extends that tooling rather than replacing it. No file modified by
`f51e055` was overwritten.

---

## 2. Frontend SHA — NOT VERIFIED, with the exact blocker

The frontend build SHA is emitted into `dist/index.html` as
`<meta name="build-sha" data-build-sha="…" content="…" />` by `vite.config.js`.
Verifying it requires fetching the **raw** HTML of `https://airesume.projectdemo.guru/`.

This environment cannot do that:

* Direct HTTPS egress to the production host from this workspace **fails at the TLS
  handshake** (`SSL_ERROR_SYSCALL` immediately after Client Hello). Verified with `curl`
  and with Node's `fetch`.
* The only available read path to production returns HTML converted to Markdown, and the
  converter **strips `<meta>` tags**, so the marker never arrives.
* No endpoint currently exposes the frontend SHA as JSON.

**Status: NOT VERIFIED. Not assumed, not inferred.**

**Remediation implemented in this change:** `/api/platform/version` now also returns
`frontendBuildSha` and a `releaseIdentity` object, read from the deployed `dist/index.html`.
Once this commit is deployed, release identity becomes verifiable with a single
unauthenticated JSON request, which works from restricted environments like this one.
See §5.3.

---

## 3. Restore point — NOT CREATED, and why

The brief requires a verified production restore point **before** any architectural change.
**It was not created. It could not be created from this environment.**

| Required capability | Available here? | Evidence |
|---|---|---|
| SSH access to the production host | **No** | No `PROD_SSH_*` key material in the environment; `~/.ssh` has no production identity |
| MariaDB credentials | **No** | No `backend/.env`; no `DB_*` variables; only `.env.example` is present |
| Network path to production from a shell | **No** | TLS handshake fails; egress is allow-listed to `npm`, `pypi`, `github.com` |
| Local MariaDB to rehearse against | **No** | `mariadb-server` not installable — `deb.debian.org` and `dlm.mariadb.com` are unreachable |
| Read-only HTTPS to public endpoints | **Yes** | Production identity was verified this way (§1) |

**No production state was modified by this session.** No deployment, no schema change, no
configuration change, no file written to any production host.

### 3.1 What was done instead

The restore-point capability was **built and tested**, so it can be executed by anyone with
production access, and so its behaviour is not a matter of trust:

* `scripts/dr-restore-point.mjs` captures every field the brief requires
  (§4) and writes a signed-JSON manifest.
* It **refuses to fabricate**. When the database is unreachable it exits `2` with
  `status: BLOCKED` and creates **zero** artifacts — verified:
  `Database inventory failed: connection failed: connect ECONNREFUSED … No restore point was created.`
* It **measures independence** rather than asserting it: if both artifacts land on the same
  filesystem device, the manifest reports `independence.achieved: false`. A second copy on
  the same disk is not a backup.

### 3.2 Exact procedure to produce the restore point

```bash
# On the production host, as the application user:
cd /home/u727965524/<repo>
export NODE_ENV=production
export BACKUP_ENCRYPTION_KEY_BASE64="$(openssl rand -base64 32)"   # store it OUTSIDE the repo
export BACKUP_DIR=/home/u727965524/deploy_backups/scheduled
export BACKUP_SECONDARY_DIR=<a different filesystem or mount>

npm run dr:restore-point

# Artifacts:  restore-point-<epoch>-primary.sql.gz.enc
#             restore-point-<epoch>-secondary.sql.gz.enc
# Manifest :  $BACKUP_DIR/restore-point-<epoch>.json   (exit 0 only when BOTH verify)
```

The encryption key must be stored **separately from the backup**. An encrypted backup whose
key sits beside it is not encrypted; it is merely slower to read.

---

## 4. Restore-point manifest — fields captured

`scripts/dr-restore-point.mjs` records, and `BLOCKS` rather than guesses when any is unavailable:

| Field | Source | Status |
|---|---|---|
| Authoritative `origin/main` SHA | `git rev-parse origin/main` | VERIFIED (LOCAL) |
| Local HEAD SHA + branch + dirty flag | `git` | VERIFIED (LOCAL) |
| Production backend SHA | `GET /api/platform/version` | VERIFIED (both observations, §1) |
| Frontend SHA | `GET /api/platform/version` → `frontendBuildSha` | NOT VERIFIED until this commit is deployed |
| MariaDB version | `SELECT VERSION()` | DESIGNED (blocked: no DB access) |
| Database size | `information_schema.tables` | DESIGNED |
| Table count | `information_schema.columns` | DESIGNED |
| Migration version + count | `schema_migrations` | DESIGNED |
| Schema checksum | SHA-256 over `table.column:type:nullable` | DESIGNED |
| Backup filename / timestamp / SHA-256 | artifact + independent recomputation | DESIGNED |
| Backup location | artifact path | DESIGNED |
| Restore verification | `db-backup.mjs verify` (structural) | DESIGNED |
| PM2 / application state | `pm2 jlist` | DESIGNED (returns NOT VERIFIED where pm2 is absent) |
| Two independent artifacts | device-ID comparison | DESIGNED, with measured independence |

Only the rows marked DESIGNED require production execution. Everything else was observed here.

---

## 5. What was built

| Component | Purpose |
|---|---|
| `scripts/lib/dr-policy.mjs` | Pure retention + RPO + posture engine. No I/O. |
| `scripts/lib/dr-offsite.mjs` | Provider-managed offsite transport; argv-only, injection-proof. |
| `scripts/dr-backup-run.mjs` | Scheduled pipeline: backup → verify → index → retain → replicate → monitor. |
| `scripts/dr-restore-point.mjs` | Full restore-point capture with two measured-independent artifacts. |
| `scripts/dr-monitor.mjs` | DR health monitor with webhook alerting and cron exit codes. |
| `ops/dr/install-backup-schedule.sh` | Idempotent cron installer for all three jobs. |
| `tests/dr-hardening.test.mjs` | 35 assertions over the destructive and alerting logic. |
| `backend/routes/platform.js` | `/api/platform/version` now reports `frontendBuildSha` + `releaseIdentity`. |

### 5.1 Verified evidence produced this session

| Check | Result | Status |
|---|---|---|
| DR policy unit suite | 35 / 35 pass, 0 fail | **VERIFIED (LOCAL)** |
| Static security suite | 44 / 44 pass, 0 fail | **VERIFIED (LOCAL)** |
| Backend + security suite | 482 tests, 458 pass, 0 fail, 24 skipped | **VERIFIED (LOCAL)** |
| Product suite | 395 tests, 395 pass, 0 fail, 0 skipped | **VERIFIED (LOCAL)** |
| `eslint` | clean, 0 errors | **VERIFIED (LOCAL)** |
| Retention against 40 real files | 30 pruned, 10 kept, sidecars removed | **VERIFIED (LOCAL)** |
| Retention preserves the newest point | confirmed | **VERIFIED (LOCAL)** |
| Retained GFS spread | days 0–6, then 13, 20, 29 | **VERIFIED (LOCAL)** |
| Index ↔ disk consistency | all indexed files exist | **VERIFIED (LOCAL)** |
| Misconfigured run blocks | exit 2, no artifact written | **VERIFIED (LOCAL)** |
| Production w/o encryption key blocks | exit 2 | **VERIFIED (LOCAL)** |
| Zero-recovery-points → CRITICAL | exit 2, `NO_RECOVERY_POINTS` | **VERIFIED (LOCAL)** |
| Webhook alert delivery | HTTP 200, full JSON payload received | **VERIFIED (LOCAL)** |
| Cron installer input validation | rejects bad interval/path | **VERIFIED (LOCAL)** |
| Cron block idempotency | strip twice = strip once; other jobs survive | **VERIFIED (LOCAL)** |
| Restore point refuses to fabricate | 0 artifacts when DB unreachable | **VERIFIED (LOCAL)** |

**None of the above exercised production MariaDB.** They are labelled `VERIFIED (LOCAL)`
and are not evidence that production backups work.

### 5.2 Bug found and fixed during construction

`weekKey()` initially used a modulo-only offset to the ISO week's Thursday. That is correct
for Friday–Sunday but **wrong for Monday–Wednesday**, shifting those days into the previous
ISO week. With a 7-day daily retention bucket this would have kept the wrong backup and
pruned the intended one on a predictable weekday schedule. Fixed and pinned by tests that
assert the Monday/Sunday boundary and the 2027-01-01 case where the ISO year differs from
the calendar year (`2026-W53`).

### 5.3 Release-identity change

`/api/platform/version` response shape (additive; existing fields unchanged):

```json
{
  "commitSha": "…",
  "frontendBuildSha": "…|null",
  "service": "resumepilot-backend",
  "apiVersion": "platform-v2",
  "releaseIdentity": { "backendSha": "…", "frontendSha": "…|null", "aligned": false, "verified": false }
}
```

`frontendBuildSha` is `null` when `dist/index.html` is not deployed beside the API — it is
never guessed. Covered by a new backend test (17/17 pass in
`backend/test/superadmin-platform.test.js`).

---

## 6. Production invariants — preserved, not altered

The architecture in §3 of the brief was treated as authoritative and was **not** changed:

| Invariant | Status |
|---|---|
| MariaDB = authoritative application datastore | **Preserved.** No code path was changed. |
| Firebase Authentication = identity/tokens/MFA only | **Preserved.** Untouched. |
| Firestore = REMOVED | **Preserved.** Production health still reports `firestoreDataPlane: "REMOVED"` (verified at 03:39:00Z). |
| MariaDB transactional outbox = async work | **Preserved.** Production health reports queue subsystem present. |
| Redis = NOT USED | **Preserved.** Not introduced. |
| PostgreSQL = NOT USED | **Preserved.** Not introduced. |

No new datastore was added. PostgreSQL and Redis remain unnecessary: the constraint this
system actually has is **backup scheduling and offsite replication**, not query throughput
or caching, and both are solved with MariaDB plus object storage.

### 6.1 Firestore removal independently confirmed

Production `/api/healthz` at `2026-08-29T03:39:00.604Z`:

```json
{"status":"ok","identityProviderConfigured":true,"firebaseAdminConfigured":true,
 "firestoreDataPlane":"REMOVED","authoritativeDatabase":"MARIADB","commitSha":"f51e055…",
 "databases":{"mariadb":{"status":"UP","healthy":true},"authority":{"mode":"NORMAL","owner":"MARIADB"}}}
```

**VERIFIED** — consistent with the documented architecture.

---

## 7. Cloud-first assessment

Evaluated in the required order: provider-managed → existing cloud → managed database →
automated service → custom.

| Requirement | Recommended tier | Status |
|---|---|---|
| Automated backups | Provider-managed schedule or cron | **DESIGNED** — `ops/dr/install-backup-schedule.sh` |
| Offsite / independent copy | Managed object storage (S3/GCS/B2/Azure) | **NOT VERIFIED** — no destination configured |
| Encryption at rest | Provider SSE + application AES-256-GCM | **DESIGNED** — key required in production |
| Retention | Provider lifecycle policy, mirrored locally | **DESIGNED + VERIFIED (LOCAL)** |
| Immutability | S3 Object Lock / GCS Bucket Lock | **NOT CONFIGURED** — see §7.1 |
| PITR | Provider-managed PITR or binlog | **BLOCKED** — see §8 |
| Monitoring / alerting | Provider alarms + `dr-monitor` webhook | **DESIGNED + VERIFIED (LOCAL)** |
| Snapshots | Provider disk snapshots | **NOT VERIFIED** |
| Replication | MariaDB replica or managed read replica | **NOT VERIFIED** |
| DR / host loss | Object storage + redeploy from SHA | **DESIGNED** |

### 7.1 Immutability — the honest position

Immutability **cannot be implemented by this repository**. `rclone` cannot make a bucket
immutable; it can only write to one that already is. Immutability must be enforced by the
storage provider:

```bash
# S3 (COMPLIANCE mode makes the object undeletable by anyone, including the uploader,
# for the retention period):
aws s3api put-object-lock-configuration --bucket resumepilot-backups \
  --object-lock-configuration '{"ObjectLockEnabled":"Enabled","Rule":{"DefaultRetention":{"Mode":"COMPLIANCE","Days":35}}}'

# Verify:
aws s3api get-object-lock-configuration --bucket resumepilot-backups
```

`chattr +i` on a shared host is **not** equivalent — it is root-defeatable and provides no
protection against a compromised application credential. It is defence in depth at best.

**Current exposure:** a compromised application credential can delete every local backup.
This is the single most important remaining gap after backup scheduling.

### 7.2 Object-storage cost estimate

MariaDB is ~3.6 MB compressed per snapshot (measured 2026-08-29T02:54Z). At 4 snapshots/day
with 17 retained recovery points, steady-state storage is well under 100 MB — effectively
free on any object-storage tier. Cost is not a constraint; **configuration is**.

---

## 8. PITR and binary logging

**Status: STRUCTURALLY IMPOSSIBLE on the current host.** Confirmed by the prior production
audit and not contradicted by anything in this session.

| Parameter | Value | Consequence |
|---|---|---|
| `log_bin` | `0` (DISABLED) | No binary logs are produced at all |
| `log_bin_basename` | `null` | Nothing to archive or replay |
| `binlog_format` | `MIXED` | Configuration only; inert while disabled |
| `expire_logs_days` / `binlog_expire_logs_seconds` | `0` / `0` | No retention configured |
| Application grants | `ALL PRIVILEGES ON u727965524_airesume.*` | No `SUPER`, no `BINLOG MONITOR` |

Enabling binlog requires the hosting provider to change server configuration and grant
server-level privileges the application user does not have. **This is a provider action, not
an application change.**

Cloud-first consequence: PITR is a strong argument for **provider-managed MariaDB**
(e.g. a managed instance with continuous backup). That is a measured technical requirement,
not a preference — but it is a migration, and it is **not** proposed as a P0 change because
it would violate "do not replace MariaDB without a measured technical requirement" and
"architectural simplicity". Recommended as a **P1 roadmap item** (§11).

**Durability note (from prior audit, unchanged):** `innodb_flush_log_at_trx_commit = 2`
means up to ~1 second of committed transactions can be lost on an **OS** crash (not a
MariaDB crash). `innodb_doublewrite = ON` protects against partial writes.

---

## 9. RPO and RTO — measured where possible

### 9.1 RPO

| Component | Value | Status |
|---|---|---|
| Automated backup schedule | **None configured** (no crontab) | NOT VERIFIED |
| Last snapshot (prior audit) | `2026-08-29T02:54:31Z` | VERIFIED (2026-08-29) |
| Binlog availability | None | NOT APPLICABLE |
| **Current measured RPO** | **Unbounded** — the loss window equals the age of the newest snapshot | **NOT VERIFIED / UNBOUNDED** |

`dr-monitor.mjs` now *measures* this rather than asserting it, and reports
`RPO_UNKNOWN` (never `OK`) when no verified recovery point exists. Verified: with zero
recovery points it emits `RPO: UNKNOWN`, `posture: CRITICAL`, exit `2`.

With the installed 6-hour schedule, RPO becomes **≤ 6 hours and measurable**.

### 9.2 RTO

| Phase | Measured? | Value |
|---|---|---|
| Failure detection | No | depends on monitoring |
| Backup acquisition | No | local: instant; offsite: unproven |
| Full restore into MariaDB | **No** | parse-verified only (66 ms) in the prior audit |
| Binlog replay | N/A | binlog disabled |
| App start + healthcheck | Yes (prior audit, Scenario A) | ~3–5 s |
| DNS propagation | No | — |
| **End-to-end RTO** | **No** | **NOT VERIFIED** |

`scripts/dr-exercise-runner.cjs` (from `f51e055`) can measure Scenario A. **End-to-end RTO
remains unmeasured** and must not be stated as a number until a full restore is timed
against a real MariaDB instance. The restore drill is gated in CI by
`RUN_MARIADB_BACKUP_RESTORE_DRILL=true`; it is **skipped** in this environment because no
MariaDB is available, so it currently contributes no evidence.

---

## 10. Security findings

### 10.1 Backup artifacts were committable to Git

`backups/` and `scratch/` were **not** ignored. Tracked in history today:

| File | Size |
|---|---|
| `backups/local-backup-pre-cert.tar.gz` | 22.7 MB |
| `scratch/restore_point_checkpoint32.zip` | 19.4 MB |
| `scratch/restore_point_checkpoint17.zip` | 18.6 MB |
| `scratch/restore_point_20260811_*.zip` | 18.6 MB ×4 |

`scratch/` is now ignored, but these were committed **before** that rule existed, so they
remain in history. If any contains a database dump or `.env`, that material must be treated
as disclosed: rotate the credentials and purge history.

**Fix applied:** scoped ignore rules for `/backups/scheduled/`, `/backups/restore-points/`,
`/backups/runs/`, and backup file extensions. Scoped deliberately so tracked schema
migrations under `backend/database/migrations/*.sql` stay tracked.

### 10.2 Backup encryption key must not live beside the backup

`BACKUP_ENCRYPTION_KEY_BASE64` is mandatory in production — both `db-backup.mjs` and
`dr-backup-run.mjs` **exit 2** rather than write an unencrypted dump. Verified.

The key must be stored outside the repository and outside the backup directory.

---

## 11. Prioritised roadmap

| # | Action | Addresses | Status |
|---|---|---|---|
| P0 | Install the backup schedule (`ops/dr/install-backup-schedule.sh`) | Unbounded RPO | **DESIGNED** |
| P0 | Set `BACKUP_ENCRYPTION_KEY_BASE64` in `backend/.env` | Unencrypted dumps | **DESIGNED** |
| P0 | Configure an offsite object-storage destination | No independent copy | **NOT VERIFIED** |
| P0 | Create the first restore point before the next deploy | Change safety | **BLOCKED** |
| P1 | Enable object-lock immutability on the bucket | Ransomware / credential compromise | **NOT CONFIGURED** |
| P1 | Time a full end-to-end restore; record real RTO | Unknown RTO | **NOT VERIFIED** |
| P1 | Purge committed restore-point archives (§10.1) and rotate any exposed secret | Credential exposure | **OPEN** |
| P2 | Request binlog from the provider, or migrate to managed MariaDB with PITR | No PITR | **BLOCKED (provider)** |
| P2 | Wire `BACKUP_ALERT_WEBHOOK_URL` to a pager | Silent backup failure | **DESIGNED** |
| P3 | Provider disk snapshots as a second recovery tier | Host loss | **NOT VERIFIED** |

Not recommended: PostgreSQL, Redis, or any second datastore. No measured requirement exists.

---

## 12. Operating the new tooling

```bash
npm run dr:test            # DR policy assertions — 35 tests, no database required
npm run dr:backup:dry      # dry run: plan only, writes nothing
npm run dr:backup          # backup → verify → retain → replicate → measure RPO
npm run dr:retain          # retention pruning only
npm run dr:restore-point   # full restore point, two artifacts, exit 0 only if both verify
npm run dr:monitor         # health; exit 0 healthy / 1 warn / 2 critical / 3 unevaluable

sh ops/dr/install-backup-schedule.sh --interval 6    # install cron (idempotent)
sh ops/dr/install-backup-schedule.sh --uninstall     # remove only the managed block
```

Monitor exit codes are deliberate: `2` is critical **and** includes the "no recovery points
at all" case, so a cron job that emails on failure will surface silence as loudly as an error.

### 12.1 Continuous-integration gate — BLOCKED, needs manual application

`npm run dr:test` should run on every commit, because the retention policy decides which
recovery points get destroyed. Adding it to `.github/workflows/quality-gate.yml` was
**rejected by the remote**:

```text
! [remote rejected] arena/01a04b8a-resumepilotai -> arena/01a04b8a-resumepilotai
  (refusing to allow a GitHub App to create or update workflow
   `.github/workflows/quality-gate.yml` without `workflows` permission)
```

The GitHub App associated with this workspace does not hold the `workflows` scope. The step
was therefore reverted and is supplied as a patch at
**[`ops/dr/quality-gate-dr-step.patch`](../ops/dr/quality-gate-dr-step.patch)** for a user
with workflow permission to apply. Until it is applied, run `npm run dr:test` locally.

---

## 13. Certification statement

```text
Authoritative Remote Main SHA : f51e055ed25f3d83b24a1f5eb475d2efb77aeb7b
Production Release SHA        : f51e055ed25f3d83b24a1f5eb475d2efb77aeb7b
                                (observed 2026-08-29T03:39:00.604Z via /api/healthz
                                 and /api/platform/version; superseding an earlier
                                 observation of 778adf2 at 03:23:37.649Z)
Cloud/SRE Certification Commit: c2ab0e0124e3aecabed293f09cb4d33a350384ca
Restore Point                 : NOT CREATED — BLOCKED (no production credentials,
                                no SSH, no shell network path to production)
```

**PASS / FAIL**

| Assertion | Result |
|---|---|
| `origin/main` == expected release (`f51e055`) | **PASS** |
| Production == expected release (`f51e055`) | **PASS** (as of 03:39:00.604Z) |
| Frontend SHA reconciled | **FAIL** — NOT VERIFIED (§2) |
| Verified restore point exists | **FAIL** — BLOCKED (§3) |
| Production invariants preserved | **PASS** (§6) |
| No PostgreSQL / Redis introduced | **PASS** |
| No production state modified by this session | **PASS** |

Deliverables certified as `VERIFIED (LOCAL)`: the DR policy suite (35/35), retention
behaviour against real files, monitor exit-code and webhook alerting, cron idempotency, and
the fail-closed behaviour of every new tool.

Deliverables explicitly **not** certified: production backup execution, offsite replication,
restore drills, PITR, RPO/RTO achievement, immutability, and load/connection-pool
measurement. Each requires production access or a MariaDB instance that this environment
could not obtain.

**No certification evidence was manufactured.**
> **Note on the certification SHA.** `c2ab0e0…` is the DR-hardening *implementation*
> commit: it carries every script, test and configuration change described here, and it is
> the commit whose regression results are quoted in §5.1. A document cannot contain its own
> commit hash, so if later commits on this branch refine this text, the exact tip SHA is the
> one reported in the session delivery summary and obtainable with
> `git rev-parse arena/01a04b8a-resumepilotai`. `c2ab0e0…` is never superseded as the
> identifier of the work itself.


---

# Part II — Provider Capability, Capacity & Final Certification

## 14. Hosting provider capability investigation (§4)

### 14.1 Provider identification

Evidence indicates **Hostinger shared hosting**, not VPS:

| Signal | Value | Implication |
|---|---|---|
| Application home path | `/home/u727965524/` (recorded in `scripts/lib/remote-*.cjs`) | cPanel-style account directory, characteristic of shared hosting |
| Database name | `u727965524_airesume` | account-prefixed, shared-tenancy naming |
| Node path probed by tooling | `/opt/alt/alt-nodejs20/root/usr/bin/pm2` | CloudLinux ALT runtime stack, standard on Hostinger shared |
| MariaDB host reported by `/api/readyz` | `127.0.0.1` | database co-located with the application |

Confidence: **high**, but inferred from artifacts rather than read from the
account. Confirm in hPanel before relying on plan-specific limits.

### 14.2 Capability matrix

| Capability | Finding | Source |
|---|---|---|
| Automated database backups | **Not included on shared hosting** — manual backups required | [4](https://notestime.in/developer-resources/hostinger-hosting-for-beginners/hostinger-backup-restore) |
| Provider backup frequency | Weekly on all plans; **daily only on Business and above** | [1](https://www.tooltester.com/en/hosting/hostinger-review/), [5](https://blog.mddhosting.com/2026/08/we-went-from-21-days-of-backups-to-six-months-at-no-extra-cost/) |
| Provider backup retention | ~30 days (review); weekly 6 weeks / daily 7 days (secondary source) | [1](https://www.tooltester.com/en/hosting/hostinger-review/), [5](https://blog.mddhosting.com/2026/08/we-went-from-21-days-of-backups-to-six-months-at-no-extra-cost/) |
| Provider restore granularity | **Whole-account; no selective file/table restore** | [4](https://notestime.in/developer-resources/hostinger-hosting-for-beginners/hostinger-backup-restore) |
| Provider backup location | Shared plans store backups **on the same server** | [4](https://notestime.in/developer-resources/hostinger-hosting-for-beginners/hostinger-backup-restore) |
| `crontab` access | **VPS only.** Shared hosting uses hPanel Cron Jobs | [2](https://www.hostinger.com/support/1583713-can-background-processes-be-executed-via-ssh-in-hostinger/) |
| hPanel cron | Supported; minimum 1-minute interval; output viewable | [1](https://docs.hostinger.com/websites/cron-jobs), [3](https://www.hostinger.com/support/5647075-how-to-check-the-output-of-a-cron-job-at-hostinger/) |
| hPanel cron command restrictions | Shell special characters unreliable → use a wrapper script | [5](https://stackoverflow.com/questions/74519612/setting-up-cron-jobs-for-laravel-on-hostingers-hpanel) |
| VPS snapshots | One manual snapshot at a time; **expires after 1 day** | [2](https://www.hostinger.com/support/1583232-how-to-back-up-or-restore-a-vps-at-hostinger/), [3](https://support.hostinger.com/en/articles/1583232-how-to-back-up-or-restore-a-vps) |
| VPS automated backups | Weekly default, daily paid; max 4 retained (2 daily + 2 weekly) | [2](https://www.hostinger.com/support/1583232-how-to-back-up-or-restore-a-vps-at-hostinger/) |
| MariaDB binary logging | MariaDB ships with `log_bin=OFF`; enabling requires a **server restart** and config-file edit | [2](https://mariadb.com/docs/server/server-management/server-monitoring-logs/binary-log/activating-the-binary-log), [4](https://www.simplified.guide/mysql-mariadb/logging-enable-binary) |
| PITR | **NOT AVAILABLE** on shared hosting | derived from the above |
| Database replication | **NOT VERIFIED** — no evidence either way | — |
| Bundled object storage | **NOT VERIFIED** — no evidence Hostinger shared plans include it. Use third-party S3/B2/GCS | — |
| Monitoring/alerting | hPanel resource usage only | [2](https://www.hostinger.com/support/1583713-can-background-processes-be-executed-via-ssh-in-hostinger/) |
| Database size limit | 3 GB on shared plans | [1](https://www.tooltester.com/en/hosting/hostinger-review/) |

### 14.3 What this means

Hostinger's own backups **cannot be counted toward 3-2-1** without verification,
because on shared plans they are (a) not included, (b) where they exist, stored
on the same server, and (c) restorable only wholesale. Even if enabled, they are
a courtesy tier, not a DR system we control or can verify.

`crontab` being unavailable on shared hosting **invalidated the original
scheduling approach.** `ops/dr/install-backup-schedule.sh` now detects this and
emits hPanel entries, and `ops/dr/backup-cron.sh` provides a wrapper with no
shell special characters. Verified: on a host without `crontab`, the installer
prints the hPanel procedure instead of failing.

---

## 15. 3-2-1 objective (§6)

```text
3 copies  ……………… NOT MET     live DB + 1 local snapshot = 2
2 media   ……………… PARTIAL     InnoDB + compressed SQL dump, but the same host
1 offsite ……………… NOT MET     no destination configured, no upload ever observed

3-2-1 STATUS: NOT MET
```

The path to MET is: scheduled local backups (copy 2) + object-storage upload
with provider-side immutability (copy 3, offsite, different medium). **This is
one configuration task away**, not an engineering project.

---

## 16. Connection pool capacity (§13) — measured against the server limit

Static configuration (`backend/database/mysql.js`), read from source:

| Setting | Value |
|---|---|
| `connectionLimit` | 15 (env `DB_CONNECTION_LIMIT`, bounded 1–100) |
| `queueLimit` | 200 |
| `waitForConnections` | true (queue rather than refuse) |
| `connectTimeout` | 8 000 ms |
| `idleTimeout` | 60 000 ms |
| `enableKeepAlive` | true outside tests; `keepAliveInitialDelay` 10 000 ms |
| `multipleStatements` | **false** — materially reduces SQL-injection blast radius |

Server-side limit (`SHOW GRANTS`, prior production audit):
`MAX_USER_CONNECTIONS 75`, `MAX_STATEMENT_TIME 120 s`.

PM2 (`ecosystem.config.js`): `instances: 1`, `exec_mode: fork`.

**Capacity arithmetic:**

```text
1 process × 15 pool connections      = 15
+ backup/restore/admin connection    =  1
─────────────────────────────────────────
peak application demand              = 16 / 75   (21%)
```

**Verdict: healthy, with headroom.** The pool is correctly sized and cannot
exhaust the server allowance at the current instance count.

**Concrete scaling limit — the number to remember:** the pool limit is per
process, so raising PM2 `instances` multiplies demand.

```text
max safe instances ≈ (75 − 5 headroom) / 15 = 4
```

At 5 instances the pool alone reaches 75 and the database begins refusing
connections. Set `DB_CONNECTION_LIMIT` explicitly before scaling out.

**Status:** arithmetic **VERIFIED** against code + server grants. Live
connection utilisation **NOT VERIFIED** — no query-level metrics are exposed by
public endpoints.

---

## 17. Database performance (§12)

| Metric | Status |
|---|---|
| Query latency p50 / p95 / p99 | **NOT VERIFIED** — no query metrics exposed; requires server access or `performance_schema` analysis |
| Slow query log | **NOT VERIFIED** — requires server access |
| Index coverage | **NOT VERIFIED** — requires schema + query analysis against production |
| Lock contention / deadlocks | **NOT VERIFIED** |
| `innodb_flush_log_at_trx_commit` | `2` — up to ~1 s of commits losable on an **OS** crash (not a MariaDB crash). Prior audit. |
| `innodb_doublewrite` | `ON` — partial-write protection. Prior audit. |

**Do not trust `latencyMs: 0`.** `/api/readyz` reports
`checks.mysql.latencyMs: 0`. A zero-millisecond round trip is not physically
meaningful for a real connection, so this is **not a latency measurement** and is
not reported as one. The only latency figures this session produced came from
`scripts/dr-observability.mjs` sampling HTTP endpoints — see §18.

No performance tuning was performed. Tuning without measurements is guessing,
and guessing at a production database is how you create an outage.

---

## 18. Live HTTP latency (measured, local fixture)

`scripts/dr-observability.mjs` samples each endpoint N times and reports
percentiles. Verified against a fixture replaying the exact production payloads
captured at 2026-08-29T03:52Z (7 samples):

| Endpoint | Success | p50 | p95 | p99 |
|---|---|---|---|---|
| `/api/healthz` | 7/7 | 22.30 ms | 41.81 ms | 42.07 ms |
| `/api/readyz` | 7/7 | measured | measured | measured |
| `/api/platform/version` | 7/7 | measured | measured | measured |

**Status: VERIFIED (LOCAL).** These are fixture-latency figures for the probe
logic, **not** production latency. Running the script against production from a
host with egress is required before any production latency claim can be made.

### 18.1 Architecture invariant enforcement

Seven invariants are asserted against the live payload, and the check
**fails closed**: a value reported by *either* source that contradicts the
invariant fails it, and an unreported value also fails it. An earlier revision
used OR logic, which let one healthy source mask a violation reported by the
other — the exact failure the check exists to catch.

Detected in testing (`VERIFIED (LOCAL)`):

| Injected fault | Detected |
|---|---|
| `firestoreDataPlane: ACTIVE` | yes |
| `authoritativeDatabase: POSTGRES` | yes |
| enterprise `queue`/`quotaStore` → `redis` | yes (2 invariants) |
| MariaDB `DOWN` + `schema: UNINITIALIZED` | yes (2 invariants) |
| Service unreachable | yes → CRITICAL, exit 2 |
| Deployed SHA ≠ expected SHA | yes → `SHA_MISMATCH` |

---

## 19. Outbox / queue resilience (§14)

Static review of `backend/enterprise/enterpriseOutbox.js`. Redis is **not**
involved; `/api/readyz` confirms the live queue is
`mysql-transactional-outbox` and the quota store is `mariadb-atomic`.

| Property | Implementation | Status |
|---|---|---|
| Atomic enqueue | same transaction as the business write | **VERIFIED (static + tests)** |
| Concurrency safety | `SKIP LOCKED` on claim | **VERIFIED (static)** |
| Lease expiry | `leaseExpiresAt`; expired leases reclaimable | **VERIFIED (static)** |
| Lease ownership | completion requires `leaseOwner` match | **VERIFIED (static)** |
| Retry | `DEFAULT_MAX_ATTEMPTS = 5` | **VERIFIED (static)** |
| Backoff | exponential with jitter | **VERIFIED (static)** |
| Poison messages | terminal failure → `REJECTED` (dead-letter) | **VERIFIED (static)** |
| DLQ replay | supported | **VERIFIED (static)** |
| Tamper protection | HMAC-SHA256 signed envelopes | **VERIFIED (static)** |
| Recovery after DB outage | lease reclaim on restart | **NOT VERIFIED** in production |
| Recovery after app restart | lease reclaim on restart | **NOT VERIFIED** in production |

### 19.1 Finding — `ecosystem.config.js` does not reflect production worker state

`ecosystem.config.js` sets every worker flag to `false`:

```js
ENTERPRISE_OUTBOX_WORKER_ENABLED: 'false',
NOTIFICATION_OUTBOX_WORKER_ENABLED: 'false',
CMS_SCHEDULER_ENABLED: 'false',
TENANT_GC_WORKER_ENABLED: 'false',
```

Yet live `/api/readyz` reports:

```json
"cmsScheduler":"CONFIGURED",
"notificationOutbox":"LOCAL_WORKER_CONFIGURED",
"tenantGc":"LOCAL_WORKER_CONFIGURED"
```

Those strings are emitted only when the corresponding env var is `'true'`
(`backend/index.js:3957-3959`). **Production is therefore running with env that
overrides `ecosystem.config.js`.** The file is not the source of truth.

**Risk:** a redeploy that takes its environment strictly from
`ecosystem.config.js` would silently disable every background worker. Outbox jobs
would keep being enqueued and nothing would drain them — a failure that presents
as "the app is up and healthy" while work piles up.

**Recommended action:** capture the live PM2 environment and reconcile it into
`ecosystem.config.js`:

```bash
pm2 env <app-id>            # inspect effective environment
pm2 save                    # persist the running configuration
```

**Status: VERIFIED** (the discrepancy is observed live); reconciliation is an
operator action.

---

## 20. Database architecture decision matrix (§17)

| Architecture | Speed | Reliability | Complexity | Cost | Recommendation |
|---|---|---|---|---|---|
| **Current MariaDB (single host)** | adequate — 3.6 MB dataset, 15/75 connections used | limited by host; no PITR; no automated backup | lowest | included | **KEEP — default** |
| MariaDB + read replica | marginal gain at this scale | improves read availability, not durability | moderate | +1 instance | **Not now.** No measured read-pressure evidence |
| Managed MariaDB/MySQL | comparable | **adds PITR, automated backups, offsite retention, monitoring** | low (provider-operated) | moderate | **Recommended P1 if PITR or guaranteed offsite is required** |
| PostgreSQL | comparable | comparable | **high — full migration + rewrite of MariaDB-specific SQL** | higher | **Not recommended.** No measured requirement; violates simplicity |
| MariaDB + Redis | faster reads | **adds a second source of truth to keep consistent** | moderate | +1 service | **Not recommended.** Outbox quota/queue already MariaDB-owned and atomic |

**Default stands: keep MariaDB authoritative.** No measurement in this session
indicates MariaDB cannot meet production objectives. The binding constraints are
**backup scheduling and offsite replication**, both of which are solved with
MariaDB plus object storage and require no new datastore.

---

## 21. Final certification matrix (§26)

| Capability | Verdict | Evidence |
|---|---|---|
| Production SHA | **VERIFIED** | `f51e055ed25f3d83b24a1f5eb475d2efb77aeb7b` @ 2026-08-29T03:52:08Z |
| Frontend SHA | **NOT VERIFIED** | no raw-HTML egress; field absent until this work is deployed |
| MariaDB authority | **VERIFIED** | `/api/healthz` + `/api/readyz` report `MARIADB` |
| Firestore removed | **VERIFIED** | `/api/healthz` `firestoreDataPlane: "REMOVED"` |
| Firebase Auth identity-only | **VERIFIED** | `identityProviderConfigured: true`, `identityProvider: CONFIGURED` |
| Automated backup | **DESIGNED** | installer + runner built; not scheduled in production |
| Offsite backup | **NOT VERIFIED** | no destination configured |
| Backup encryption | **DESIGNED** | enforced (exit 2 in production without a key); never executed in production |
| Backup retention | **VERIFIED (LOCAL)** | 40 → 10 kept, GFS spread verified against real files |
| Backup verification | **VERIFIED (LOCAL)** | SHA-256 + structural, exercised in tests |
| PITR | **NOT AVAILABLE** | `log_bin = 0`; enabling requires a server restart |
| Binary logging | **NOT AVAILABLE** | MariaDB default OFF; shared hosting cannot restart the server |
| RPO | **NOT VERIFIED / unbounded** | no schedule; monitor reports `UNKNOWN` |
| RTO | **NOT VERIFIED** | no end-to-end recovery timed |
| Restore drill | **NOT VERIFIED** | gated test skipped without MariaDB |
| Database failover | **NOT APPLICABLE** | no replica configured |
| Application recovery | **DESIGNED** | PM2 `autorestart: true`; not exercised live this session |
| Outbox recovery | **VERIFIED (static)** | lease/SKIP LOCKED/DLQ reviewed; production outage recovery untested |
| Monitoring | **VERIFIED (LOCAL)** | `dr-observability.mjs` + `dr-monitor.mjs` tested against fixtures/real files |
| Alerting | **VERIFIED (LOCAL)** | webhook delivery observed, HTTP 200 |
| Database performance | **NOT VERIFIED** | no query metrics available |
| Scalability | **VERIFIED (capacity arithmetic)** | 16/75 connections; max 4 PM2 instances |
| Security | **PARTIAL** | backups untracked + encryption enforced; committed archives still in history (§10.1) |
| Disaster recovery | **NOT VERIFIED** | host-loss recovery blocked on offsite copy |

---

## 22. Final status

```text
PRODUCTION CERTIFICATION DEFERRED
```

Not certified, because:

1. The intended hardening SHA is **not yet deployed** to production.
2. No verified production restore point exists (**BLOCKED** — no credentials).
3. RPO is unbounded and RTO is unmeasured.
4. No offsite copy exists, so 3-2-1 is NOT MET and host-loss recovery is unachievable.
5. No restore drill has ever been executed against production-shaped data.
6. Six committed restore-point archives remain in Git history (§10.1).
7. `ecosystem.config.js` disagrees with live worker state (§19.1).

Every capability above is labelled with the evidence that exists for it. Nothing
has been upgraded from DESIGNED to VERIFIED because the code for it exists.
