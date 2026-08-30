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

---

# PART III — HIGH AVAILABILITY, EXERCISE SCENARIOS, SECURITY AND PERFORMANCE

> Every item below is tagged `[EVIDENCE]` (directly measured at `788071d`), `[IMPLEMENTED]` (built and
> unit-tested in this session), `[DESIGN]` (designed, needs a production change gate to execute) or
> `[NOT VERIFIED]` (cannot be confirmed from here — no credentials, no SSH, no shell egress).

## 24. PITR — formal verdict

### 24.1 Verdict

```
PITR STATUS:  NOT AVAILABLE
```

### 24.2 Evidence

| Probe | Result | Source |
|-------|--------|--------|
| `log_bin` | `0` (OFF) | production `/api/diagnostics` at `788071d` — measured this session |
| `log_bin_basename` | empty | production `/api/diagnostics` at `788071d` — measured this session |
| Backup method | logical (`mysqldump`) | `scripts/db-backup.mjs` in this repository |

A logical dump is a **point-in-time snapshot**, not a point-in-time *recovery* capability. It cannot
replay the transactions written between two dumps. Without binary logs, the only recoverable points
are the moments a dump completed.

### 24.3 What enabling it would require

1. `log_bin=1` plus a `server_id` — **requires a MariaDB server restart**.
2. Shared-hosting plans do not expose `my.cnf` or allow a restart. Verified from provider
   documentation: binary logging is only configurable on VPS/root plans.
3. Binlog retention + offsite shipping also required, or the logs are lost with the host (§22.1).

**This is a platform limit, not a configuration oversight.** No change in this repository can enable
PITR on the current host.

### 24.4 Consequence for RPO

| Guard | RPO |
|-------|-----|
| Daily logical dump (the only thing currently possible) | up to **24 h** |
| Hourly logical dump (`--hourly`) | up to **1 h** |
| PITR with binlogs | seconds — **NOT AVAILABLE** |

**Recommendation:** run `--hourly` (§4.2). It is the only RPO improvement available without a
migration, and it costs one small dump per hour.

> **Not faked:** no binary-log replay is implemented or implied anywhere in this repository. If a
> migration to a managed database happens, PITR is delivered by the provider and must be verified
> there — see §26 Option B.

---

## 25. Availability today

| Layer | Redundancy | Failure impact |
|-------|-----------|----------------|
| Application | single PM2 process set, single host | total outage |
| MariaDB | **single primary, no replica** | total outage; lose everything since last dump |
| Backups | local + (optionally) offsite | see §15 (3-2-1 NOT MET) |
| Host | **single server** | total outage |

**There is no failover.** A MariaDB failure is an availability outage whose duration equals the time
to restore, and whose data loss equals the time since the last successful dump.

---

## 26. HA options considered

Each option is assessed on cost, complexity, performance, RPO, RTO, operational risk, failure modes
and migration risk. Cost is **indicative** — confirm with the provider before committing.

### Option A — Single MariaDB + offsite backups (keep current host)

| Dimension | Assessment |
|-----------|-----------|
| Cost | **Lowest** — no new infrastructure. One object-storage bucket (cents/month). |
| Complexity | **Low** — the pipeline in this repository is already built and tested. |
| Performance | **No change** — same host, same database. |
| RPO | **Up to 24 h**, or **1 h** with `--hourly`. |
| RTO | **30–90 min** — provision host, restore DB, redeploy, verify. |
| Operational risk | **Low** — nothing about the running system changes. |
| Failure modes | Host loss = full outage until rebuild. No PITR. Corruption propagates if not caught by the drill. |
| Migration risk | **None** — this is the current architecture. |

### Option B — Managed MariaDB/MySQL + automated backups + PITR  ✅ RECOMMENDED

| Dimension | Assessment |
|-----------|-----------|
| Cost | **Moderate** — managed instance + storage. Roughly one small always-on VM. |
| Complexity | **Low** — provider runs backups, PITR, patching, encryption at rest. |
| Performance | **Neutral to better** — dedicated DB resources instead of shared. |
| RPO | **Minutes** (PITR to any second in the retention window). |
| RTO | **10–30 min** — point-in-time restore, repoint `DB_HOST`, redeploy. |
| Operational risk | **Lowest of all options** — no replica topology to operate. |
| Failure modes | Provider region outage (mitigated by the local+offsite dumps you still keep). Restore to a *new* instance, never over the live one. |
| Migration risk | **Low** — a `mysqldump` restore onto the managed instance; MariaDB-compatible. Requires one cutover window and a verified restore point first. |

### Option C — Managed primary + read replica + automatic failover

| Dimension | Assessment |
|-----------|-----------|
| Cost | **Highest** — roughly double Option B, plus cross-AZ traffic. |
| Complexity | **High** — replica lag monitoring, failover testing, connection-string handling, split-brain awareness. |
| Performance | Reads can scale out; **writes do not**. |
| RPO | **Near-zero** (async replication still loses a replica-lag window on forced failover). |
| RTO | **1–5 min** for a failover that works; **indeterminate** for one that doesn't. |
| Operational risk | **Highest** — the classic failure is an untested failover that fails during the incident it was bought for. |
| Failure modes | Replication lag, replica divergence, failover flapping, write-after-failover data loss. |
| Migration risk | **Medium** — everything in Option B, plus topology. |

### Option D — Multi-region active/active

| Dimension | Assessment |
|-----------|-----------|
| Cost | **Prohibitive** for this workload. |
| Complexity | **Very high** — conflict resolution, global consensus, idempotent writes everywhere. |
| Performance | Write latency rises with quorum distance. |
| RPO / RTO | Best-in-class, at a complexity cost this product cannot justify. |
| Operational risk | **Extreme** without a dedicated SRE team. |
| Migration risk | **High** — would require application changes. |

**Rejected.** The product is a single-tenant-per-user SaaS with a MariaDB transactional core. There is
no measured requirement — no latency or throughput evidence (§31) that would justify it.

### 26.1 Recommendation — exactly one

> ### Adopt **Option B: managed MariaDB/MySQL with automated backups and PITR.**
>
> **Why B and not A:** Option A is cheap but its RPO is a hard 24 h (or 1 h with `--hourly`), and its
> RTO is 30–90 min of manual rebuild. Option B removes the single largest risk in the current
> architecture — *the database and the host are the same single point of failure* — for a moderate
> monthly cost, while **reducing** operational work rather than adding it.
>
> **Why B and not C:** the product has no measured read-scaling problem (§31). A replica buys a
> few minutes of RTO in exchange for a permanent increase in operational complexity and a new class
> of failure (replication lag, failed failover). That trade is not justified by evidence.
>
> **Migration is NOT executed here.** It requires a production change gate: a verified restore point,
> a cutover window, DNS/connection-string change, and independent post-deploy verification.
> See §33 for the exact sequence to hand to the Local Principal Developer.
>
> **Until that gate is passed, run Option A with `--hourly`** (§4.2). This is implemented and
> testable today.

---

## 27. DR exercise scenarios (A–G)

Each records Scenario / Detection / Recovery procedure / Measured recovery time / Data loss window /
RPO / RTO / Evidence / Status.

> **Status meaning:** `VERIFIED` = executed with recorded evidence. `NOT VERIFIED` = procedure
> specified but not yet executed against production. Nothing in this table is certified without an
> actual run.

### Scenario A — Application failure (PM2 process crash, bad deploy, unhandled exception)

| Field | Value |
|-------|-------|
| Detection | `/api/healthz` or `/api/readyz` fails; PM2 restart count rises; user reports. |
| Recovery | `pm2 resurrect`, or `pm2 restart` the failed process; if caused by a deploy, redeploy the previous known-good release. |
| Measured recovery time | **NOT VERIFIED** |
| Data loss window | None — the database is untouched. |
| RPO | n/a (no data loss) |
| RTO | Target **< 5 min** |
| Evidence | **NOT VERIFIED** — no production access this session. |
| Status | 🟡 **NOT VERIFIED** |

### Scenario B — MariaDB failure (service down, corruption, disk full on DB volume)

| Field | Value |
|-------|-------|
| Detection | `/api/readyz` → `mysql.status` non-READY; pool acquisition errors in logs. |
| Recovery | 1) Restart MariaDB. 2) If it will not start, restore the latest verified dump into a scratch database and promote, or rebuild the host and restore. 3) Never restore over production (§19). |
| Measured recovery time | **NOT VERIFIED** |
| Data loss window | Everything written since the last successful backup — **up to 24 h** daily, **1 h** hourly. |
| RPO | 24 h (current) / 1 h (recommended `--hourly`) |
| RTO | Target **< 60 min** |
| Evidence | **NOT VERIFIED** |
| Status | 🔴 **NOT VERIFIED — highest-risk open scenario** |

### Scenario C — Corrupted deployment (bad artifact, wrong env, failed migration)

| Field | Value |
|-------|-------|
| Detection | `/api/platform/version` reports an unexpected or non-aligned SHA; smoke tests fail post-deploy. |
| Recovery | Redeploy the last known-good SHA. Database schema changes must be forward-compatible or rolled forward deliberately — **never** drop a column to "undo" a deploy. |
| Measured recovery time | **NOT VERIFIED** |
| Data loss window | None if migrations are additive. Possible if a destructive migration ran — hence the mandatory restore point. |
| RPO | 0 for additive migrations |
| RTO | Target **< 15 min** |
| Evidence | `releaseIdentity.aligned === true` at `788071d` — the mechanism to *detect* this is live `[EVIDENCE]`. Recovery is **NOT VERIFIED**. |
| Status | 🟡 **NOT VERIFIED** (detection verified, recovery not) |

### Scenario D — Corrupted backup (truncated dump, bad checksum, wrong key)

| Field | Value |
|-------|-------|
| Detection | `dr-restore-drill.mjs` integrity stage fails: sidecar SHA-256 mismatch, gzip decode failure, or AES-GCM auth-tag failure. |
| Recovery | Do **not** trust the artifact. Fall back to the previous recovery point and re-run the drill against it. Investigate why (disk full? killed mid-dump? rotated key?). |
| Measured recovery time | **NOT VERIFIED** against production. |
| Data loss window | Shifts the recoverable point back by one backup interval. |
| RPO | Degrades to the last *good* backup |
| RTO | Add one drill cycle (~5 min) to the restore RTO |
| Evidence | **VERIFIED against a synthetic artifact** — tampered ciphertext → `integrity FAIL`, `exit 1` `[IMPLEMENTED]`. A **real** corrupted production backup has not been encountered. |
| Status | 🟢 **Detection VERIFIED** (logic) / 🔴 **NOT VERIFIED** (real corruption event) |

### Scenario E — Complete host loss (server destroyed, provider failure, ransomware)

| Field | Value |
|-------|-------|
| Detection | All endpoints unreachable; provider status page; monitoring alerts. |
| Recovery | 1) Provision a new host. 2) Install the application. 3) Restore MariaDB — **from the offsite copy** if the local host is gone. 4) Restore the newest verified dump. 5) Redeploy the known-good SHA. 6) Verify with `/api/platform/version` + the restore drill. |
| Measured recovery time | **NOT VERIFIED** |
| Data loss window | Up to one backup interval — **but see the risk below**. |
| RPO | 24 h / 1 h |
| RTO | Target **< 4 h** |
| Evidence | **NOT VERIFIED** |
| Status | 🔴 **NOT VERIFIED — and the highest-consequence one** |
| ⚠️ Risk | **Scenario E is the one that fails silently today.** Local-only backups live on the same host they protect. If the host is destroyed, the local `backups/` tree dies with it. **Enabling the offsite destination (§6) is what converts Scenario E from "total data loss" to "recoverable".** This is the single most important open action in this document. |

### Scenario F — Database deletion or corruption (DROP TABLE, bad UPDATE, ransomware encryption)

| Field | Value |
|-------|-------|
| Detection | Application errors on specific entities; row counts collapse; unexpected schema state. |
| Recovery | Restore into an **isolated** database (§19), extract the affected tables, and merge — **never** restore the whole dump over production to "fix" one table. |
| Measured recovery time | **NOT VERIFIED** |
| Data loss window | Up to one backup interval for the affected tables. |
| RPO | 24 h / 1 h |
| RTO | Target **< 60 min** for targeted recovery |
| Evidence | **NOT VERIFIED** |
| Status | 🔴 **NOT VERIFIED** |

### Scenario G — Offsite storage recovery (bucket deleted, provider outage, credential revoked)

| Field | Value |
|-------|-------|
| Detection | `dr-backup-run.mjs` replication fails; `dr-monitor.mjs` reports offsite failure; the run fails with `offsiteVerified: false` rather than pretending to succeed. |
| Recovery | 1) Confirm whether the *local* copy is intact — it is, if only the offsite leg failed. 2) Fix credentials/destination. 3) Re-run replication. 4) Re-run the drill against an offsite-restored copy. |
| Measured recovery time | **NOT VERIFIED** |
| Data loss window | None — the local copy is authoritative until the offsite leg is restored. |
| RPO | Unchanged |
| RTO | Target **< 2 h** to re-establish the offsite leg |
| Evidence | **VERIFIED as logic** — when no offsite destination is configured the run reports `NOT VERIFIED` and the monitor reports `NOT VERIFIED`, never `HEALTHY` `[IMPLEMENTED]`. A real offsite-leg failure has not been exercised. |
| Status | 🟡 **Detection VERIFIED** (logic) / 🔴 **NOT VERIFIED** (real event) |

### 27.1 Scenario summary

| Scenario | RPO | RTO target | Status |
|----------|-----|-----------|--------|
| A — Application failure | n/a | < 5 min | 🟡 NOT VERIFIED |
| B — MariaDB failure | 24 h / 1 h | < 60 min | 🔴 NOT VERIFIED |
| C — Corrupted deployment | 0 (additive) | < 15 min | 🟡 NOT VERIFIED |
| D — Corrupted backup | last good backup | + 5 min | 🟢 detection verified |
| E — **Complete host loss** | 24 h / 1 h | < 4 h | 🔴 **NOT VERIFIED — highest risk** |
| F — DB deletion/corruption | 24 h / 1 h | < 60 min | 🔴 NOT VERIFIED |
| G — Offsite storage recovery | none | < 2 h | 🟡 detection verified |

**No scenario is end-to-end VERIFIED against production.** None can be, from this session: there are no
credentials, no SSH, and no shell egress. The procedures and the automated tooling are in place so the
Local Principal Developer can execute and timestamp them.

---

## 28. Backup security assessment

| Control | Status | Notes |
|---------|--------|-------|
| **Encryption at rest (backup artifacts)** | 🟢 **IMPLEMENTED** | AES-256-GCM with a 32-byte key from `BACKUP_ENCRYPTION_KEY_BASE64`, AAD-bound to `ResumePilot-DB-Backup-v1`. |
| **Encryption in transit (offsite)** | 🟢 **IMPLEMENTED** | All supported transports (`rclone`, `aws`, `gsutil`, `az`) use TLS endpoints. |
| **Integrity** | 🟢 **IMPLEMENTED** | SHA-256 sidecar per artifact + GCM auth tag. A tampered file fails the drill. |
| **Key not stored beside the data** | 🟡 **CONFIGURED, live NOT VERIFIED** | The key lives in `ops/dr/backup.env` on the host, not inside `backups/`. That directory is excluded from the web root and from Git (§7.3). Live placement **NOT VERIFIED**. |
| **Key not in Git** | 🟢 **VERIFIED** | `ops/dr/backup.env` is git-ignored and only a `.example` template is tracked. Ran `git ls-files ops/dr` this session. |
| **Key not in the frontend bundle** | 🟢 **VERIFIED** | `BACKUP_ENCRYPTION_KEY_BASE64` appears only in `backend/scripts/` and `ops/`. No `VITE_`/`PUBLIC_`-prefixed reference. |
| **Key not in logs** | 🟢 **IMPLEMENTED** | Command logging prints the command shape, never argument values. |
| **Key not in API responses** | 🟢 **VERIFIED** | No backup module is reachable from a route. |
| **Credentials not in error messages** | 🟢 **IMPLEMENTED** | Failures report a reason and exit code, not command output containing secrets. |
| **Least privilege — DB backup user** | 🟡 **OPERATOR ACTION** | Needs `SELECT`, `LOCK TABLES`, `SHOW VIEW`, `TRIGGER`, `PROCESS`. Do **not** use root. Create a dedicated `backup` user. |
| **Least privilege — offsite credential** | 🟡 **OPERATOR ACTION** | Write-only (PutObject) to the backup prefix is sufficient for upload. Do not grant delete unless lifecycle rules need it. |
| **Storage permissions** | 🟡 **OPERATOR ACTION** | Bucket must be **private**. Object Versioning and a deny on `s3:DeleteObject` (or provider equivalent) recommended. |
| **Web-root exclusion** | 🟢 **VERIFIED** | `backups/` resolves below the public document root. |
| **Retention enforced** | 🟢 **IMPLEMENTED** | The nightly pipeline applies GFS retention. |
| **Deletion protection** | 🟢 **IMPLEMENTED** | `planRetention` protects undated entries, in-flight entries and a minimum of 3 most-recent points; deletes only files inside a managed recovery-point directory. |
| **Immutable / WORM storage** | 🟡 **NOT ENABLED** | Enable Object Lock / immutable versioning on the offsite bucket. Recommended — it is the defence against ransomware deleting your backups. |
| **Access logging** | 🟡 **NOT ENABLED** | Enable bucket access logging so an unusual read of a backup is visible. |
| **Secret rotation** | 🟡 **DOCUMENTED, not automated** | See runbook §"Rotating the backup passphrase". Artifacts keep their original key; old artifacts stay readable. |

### 28.1 Residual risks (must be actioned by the operator)

1. **Backup encryption key is not escrowed.** If it is lost, every encrypted backup is unrecoverable.
   Store it in a password manager or secret store, separate from the host.
2. **Immutable storage is not enabled.** Ransomware with host credentials can delete local backups and
   (without object lock) offsite ones.
3. **Offsite credential scope has not been reviewed for least privilege.**

---

## 29. Observability coverage

Signals, whether they exist, and whether they page.

| Signal | Exists | How to read it | Paging |
|--------|--------|----------------|--------|
| Backup success | 🟢 | `dr:monitor` → `backup.status` (HEALTHY/STALE/FAILING) | yes (see §30) |
| Backup failure | 🟢 | Run exits non-zero; `dr-monitor` reflects it | yes |
| Backup age / staleness | 🟢 | `dr-monitor` → `backup.ageHours` vs `--max-age-hours` | yes |
| Backup size anomaly | 🟢 **IMPLEMENTED** | `steps.sizeAnomaly` → `OK` \| `ANOMALY_SUSPICIOUSLY_SMALL` \| `ANOMALY_SUSPICIOUSLY_LARGE` \| `INSUFFICIENT_HISTORY` | 🟢 **surfaced by `dr-monitor`** — gap G1 closed in `6609efd` |
| Checksum verified | 🟢 | `dr-restore-drill.mjs` integrity stage | on drill |
| Offsite upload verified | 🟢 **IMPLEMENTED** | `steps.offsite.verified` — requires the remote object to exist **and** its size to match | 🟢 **surfaced by `dr-monitor`** — gap G1 closed in `6609efd` |
| Offsite NOT VERIFIED | 🟢 | `steps.offsite.verified === false` with a reason (e.g. `az` has no cheap verify command) | 🟢 `dr-monitor` → problem `OFFSITE_UPLOAD_NOT_VERIFIED`, exit 2 |
| Storage capacity (local disk) | 🟢 **IMPLEMENTED** | `steps.disk` pre-flight guard; run refuses to start when headroom is short | 🟢 `dr-monitor` → problem `DISK_HEADROOM_INSUFFICIENT`, exit 2 |
| Insufficient history | 🟢 | `INSUFFICIENT_HISTORY` (fewer than 5 prior backups) | 🟢 no problem raised; `signals.complete=false` so the monitor is UNCERTAIN, not healthy |
| DB availability | 🟢 | `/api/readyz` → `checks.mysql.status` | ⚠️ no external pager |
| Pool exhaustion | 🔴 | **No metric exposed.** `waitForConnection` logs only on final failure (`backend/database/mysql.js`) | no |
| Query latency | 🔴 | **No metric.** `/api/readyz` reports `latencyMs: 0` — a `SELECT 1` that is not a real measurement | no |
| Application health | 🟢 | `/api/healthz`, `/api/readyz` | ⚠️ no external pager |
| Worker health | 🟢 | `/api/readyz` → `cmsScheduler`, `notificationOutbox`, `tenantGc` (see the open finding in §36.1) | ⚠️ no external pager |
| Disk usage (host) | 🟡 | Pre-flight guard only; no trend metric | ⚠️ no external pager |
| Memory / CPU | 🔴 | **No endpoint and no host agent.** | no |
| Certificate expiry | 🔴 | **No check implemented.** | no |
| **External monitoring** | 🔴 | **Nothing is watching production from outside the host.** Every signal above is on-box and unread during a host-loss event. | **n/a** |

### 29.1 Gap G1 — CLOSED (`6609efd`)

**Status: IMPLEMENTED + unit-tested. Deployment to production: NOT VERIFIED.**

`dr-monitor.mjs` previously reported `HEALTHY`/`STALE`/`FAILING`/`NOT VERIFIED` without classifying
`ANOMALY_SUSPICIOUSLY_SMALL`, `ANOMALY_SUSPICIOUSLY_LARGE`, `INSUFFICIENT_HISTORY`, `INSUFFICIENT`
disk headroom, or an unverified offsite upload — those were detected in the JSON report but never
promoted to monitor status.

`scripts/lib/dr-policy.mjs` now exports `classifyBackupSignals()`, and `scripts/dr-monitor.mjs` reads
the last run report (`DR_BACKUP_RUN_REPORT`, else `test-results/dr-backup-run.json`), derives the
signals, and promotes them:

| Signal | Classification | Monitor exit |
|---|---|---|
| `ANOMALY_SUSPICIOUSLY_SMALL` | problem `BACKUP_SIZE_SUSPICIOUSLY_SMALL` | 2 |
| `ANOMALY_SUSPICIOUSLY_LARGE` | warning `BACKUP_SIZE_SUSPICIOUSLY_LARGE` | unchanged |
| zero-byte / non-numeric size | problem `BACKUP_SIZE_INVALID` | 2 |
| `disk.status = INSUFFICIENT` | problem `DISK_HEADROOM_INSUFFICIENT` | 2 |
| `disk.status = UNKNOWN` | warning `DISK_HEADROOM_UNKNOWN` | unchanged |
| offsite configured, `verified === false` | problem `OFFSITE_UPLOAD_NOT_VERIFIED` | 2 |
| offsite configured, `verified` unknown | warning `OFFSITE_STATUS_UNKNOWN` | unchanged |
| recovery points pending verification | warning `UNVERIFIED_RECOVERY_POINTS` | unchanged |

Two fail-closed properties worth stating explicitly:

- **Upload exit 0 is not success.** Only `verified === true` clears the offsite problem.
- **Absence of evidence is not health.** When a signal cannot be observed (no run report, unknown disk
  headroom, unknown offsite state) the classifier returns `complete: false` and the monitor prints an
  INCOMPLETE line rather than implying the system is healthy. A missing run report is legitimate
  (e.g. backups not yet scheduled) and is not treated as a problem on its own.

Covered by 10 new tests in `tests/dr-hardening.test.mjs` (suite now 112/112). Remaining work on this
path is operational, not code: the monitor can only observe real signals once the backup schedule is
installed on the host (P0-4) and offsite is configured (P0-2).

### 29.2 Gap G2 — no external pager

**This is the most consequential observability gap.** Every check in this repository runs *on the
production host*. During Scenario E (host loss) the monitoring dies with the host, so nobody is told.

**Recommendation:** add one external uptime check (e.g. UptimeRobot free tier, or a cron job on any
other machine) polling `https://airesume.projectdemo.guru/api/readyz` every 5 minutes and emailing on
failure. Low cost, and it is the only signal that survives host loss.

---

## 30. Alert routing (design)

| Condition | Severity | Action |
|-----------|----------|--------|
| Backup run exits non-zero | **Page** | Investigate immediately — a failed backup never reports success (§8). |
| `backup.status` STALE | **Page** | Backups have silently stopped. |
| `sizeAnomaly` = ANOMALY_SUSPICIOUSLY_SMALL | **Page** | A truncated dump is a real risk. |
| `sizeAnomaly` = ANOMALY_SUSPICIOUSLY_LARGE | **Warn** | Could be legitimate growth. |
| `sizeAnomaly` = INSUFFICIENT_HISTORY | **Info** | Expected for the first 5 backups. |
| `disk.status` = INSUFFICIENT | **Page** | The backup did not run. |
| `disk.status` = UNKNOWN | **Warn** | Could not measure; the run proceeded. |
| `offsite.verified === false` | **Page** | No independently verified copy. |
| Restore drill FAILED | **Page** | Backups are not provably restorable. |
| Restore drill BLOCKED | **Warn** | No isolated target configured. |
| `/api/readyz` unhealthy (external check) | **Page** | Production is down. |

---

## 31. Performance assessment

**No optimisation is recommended.** The brief is explicit: measure before optimising, and do not add
Redis prematurely. There is no evidence of a performance problem, so nothing is being added.

### 31.1 Redis — not added, and why

| Question | Finding |
|----------|---------|
| Is there a measured latency or throughput problem? | **No.** No latency metrics exist (§29), so no problem can be evidenced. |
| Is there a read-contention problem? | **No evidence.** No slow-query log access; no measured contention. |
| Would Redis help? | For session caching or rate-limit counters, possibly — but the quota system is **MariaDB atomic by design** (`quotaStore: "mariadb-atomic"`), and introducing a second store would weaken the correctness guarantee it was built for. |
| Cost | A new stateful component, a new failure mode, cache-invalidation bugs, and a new thing to back up. |

**Decision: do not add Redis.** Adding a cache before there is a measured need is exactly the
premature optimisation the brief forbids. If load-testing later evidences a read bottleneck, revisit
with data.

### 31.2 What the evidence actually shows

| Area | Finding | Evidence |
|------|---------|----------|
| Connection pool | **`pool: 15` vs `MAX_USER_CONNECTIONS: 75`** (pool probe at `788071d` — measured this session, single instance) | Safe at **1** PM2 instance (15 used, 60 headroom). Safe at **2** (30/75). **Caution at 4+: 60/75, only 15 spare.** |
| Transactions | ✅ Used for multi-step writes (`withTransaction`) with a 3-tier fallback | `backend/database/mysql.js` |
| Atomic quotas | ✅ Single-statement atomic increment, no read-modify-write | `quotaStore: "mariadb-atomic"` at `788071d` |
| Outbox | ✅ Transactional outbox in MariaDB | `queue: "mysql-transactional-outbox"` at `788071d` |
| Indexes | ✅ **MIGRATION-VERIFIED** — 56/56 performance indexes present, 0 missing | local scan of migrations 001–014 vs `db_diagnostics` |
| Slow queries | 🔴 **NOT VERIFIED** — no slow-query log access from this session | — |
| Query latency | 🔴 **NOT MEASURED** — `latencyMs: 0` on `/api/readyz` is a `SELECT 1`, not a real measurement | — |
| N+1 patterns | 🔴 **NOT VERIFIED** — requires query-level observation | — |
| Pagination | 🟡 **PARTIALLY VERIFIED** — CMS and job endpoints accept `page`/`limit` and apply `LIMIT`/`OFFSET`. Not all list endpoints audited. | endpoint sample |
| Locking | 🟡 No long-running transactions observed. Not measured under load. | — |
| Table growth / hot tables | 🔴 **NOT VERIFIED** — no row-count or growth data without DB credentials | — |

### 31.3 Recommendations — evidence-based only

1. **Cap PM2 instances at 2** until the pool is re-measured. At 4+ instances the pool is at 60/75
   with only 15 connections of headroom, and a traffic spike would exhaust it. *(Supported by
   measured evidence.)*
2. **Turn on the slow query log** and review it weekly. This is the prerequisite for *any* performance
   claim — without it, every optimisation is guesswork. *(Gap, not a recommendation to optimise.)*
3. **Make `/api/readyz` `latencyMs` a real measurement**, or remove it. A permanent `0` is worse than
   no metric because it looks healthy. *(Defect in the signal, not the system.)*
4. **Add a row-count + table-size job** to the nightly pipeline so table growth becomes visible before
   it becomes an incident. Cheap, and it closes a NOT VERIFIED gap.
5. **Do not add Redis, a read replica, or a cache** until (2) produces evidence.

---

---

# PART IV — HANDOFF

## 32. Pre-execution checklist (Local Principal Developer)

Every box must be ticked **before** executing anything against production.

- [ ] **1. Create and verify a restore point.** `dr:restore-point` must report
      `restorePoint.status.ok === true`. **Nothing else happens until this is green.**
- [ ] **2. Install the encryption key.**
      `cp ops/dr/backup.example.env ops/dr/backup.env` → set `BACKUP_ENCRYPTION_KEY_BASE64`
      (`openssl rand -base64 32`) and `chmod 600 ops/dr/backup.env`. **Escrow the key off-host.**
      Without it, backups are unrecoverable.
- [ ] **3. Configure the offsite destination.** Set `BACKUP_OFFSITE_DESTINATION` (there is no
      "enable" flag — setting the destination is what enables it) plus the matching transport
      credentials. See `ops/dr/backup.example.env` for the exact contract per provider.
      This is what converts Scenario E from total data loss to recoverable (§27 Scenario E).
- [ ] **4. Run a dry run:** `npm run dr:backup:dry` → confirm planned actions.
- [ ] **5. Run the first real backup:** `npm run dr:backup -- --hourly` → exit 0, `status ok`.
- [ ] **6. Verify:** `grep -E 'status|verify|bytes' backups/backup-*.log`; confirm the sidecar exists.
- [ ] **7. Install the schedule:** `bash ops/dr/install-backup-schedule.sh` (hPanel Cron Jobs on
      shared hosting — `crontab` is VPS-only).
- [ ] **8. Create the dedicated DB backup user** with least privilege (§28).
- [ ] **9. Enable bucket versioning + object lock** on the offsite destination (§28).
- [ ] **10. Add one external uptime check** on `/api/readyz` (§29.2). The only signal that survives
      host loss.

## 33. Recommended sequence

```
NOW        ├─ Restore point + offsite + hourly schedule + external ping   → Option A hardened
           └─ Run the restore drill for the first time                    → first real evidence
NEXT       ├─ Enable slow query log; review weekly                        → performance evidence
           └─ ✅ Wire ANOMALY_*/disk/unverified into dr-monitor (gap G1 closed, 6609efd)
THEN       ├─ Provision managed MariaDB (Option B) — STAGING FIRST
           └─ Time a full restore on staging                              → measured RTO
CHANGE GATE├─ Restore point verified  ·  cutover window agreed  ·  rollback ready
           └─ Cut over, redeploy, verify /api/platform/version + releaseIdentity.aligned
AFTER      └─ Re-run the drill against a managed-instance backup; timestamp scenarios A–G
```

**Do not skip to the managed migration.** An unhardened Option A migrated to Option B inherits every
gap — including having no verified offsite copy at cutover time, which is the worst moment to
discover it.

## 34. Certification status

| Document | Status |
|----------|--------|
| Production database architecture | 🟢 **VERIFIED** — `db_diagnostics`, 56/56 perf indexes, 14/14 migrations |
| PITR capability | 🟢 **VERIFIED AS NOT AVAILABLE** — `log_bin=0`; MariaDB restart required (§24) |
| HA/failover architecture | 🟡 **DESIGNED, NOT DEPLOYED** — Option B recommended, awaits change gate (§26.1) |
| Offsite backup | 🟡 **IMPLEMENTED, LIVE NOT VERIFIED** — no credentials configured yet (§6) |
| Backup/restore automation | 🟢 **VERIFIED** — 86/86 unit tests; live dry-run at `788071d` |
| Restore verification | 🟡 **VERIFIED AS LOGIC, NOT AGAINST LIVE DATA** — synthetic artifacts only (§20) |
| DR exercise scenarios A–G | 🔴 **PROCEDURES SPECIFIED, ALL NOT VERIFIED** (§27) |
| Backup security | 🟡 **PARTIAL** — encryption/integrity implemented; 3 operator actions open (§28.1) |
| Observability | 🔴 **PARTIAL** — on-box only; **no external pager**; pool/latency/CPU/cert unmonitored (§29) |
| Performance | 🔴 **INSUFFICIENT EVIDENCE** — no latency or load data; no optimisation recommended (§31) |
| **Production DR capability** | 🔴 **NOT VERIFIED** — **no restore has ever been proven against production data** |

### 34.1 The one risk that dominates

> **No backup in this system has ever been restored into a live database and verified.**
>
> Everything else — the encryption, the retries, the retention, the checksums — is machinery around
> that unproven assumption. Run `npm run dr:drill` against a real backup on a scratch database and
> that sentence stops being true. Until then it is the single largest open risk in the platform.

## 35. Deliverables

**Documentation** (created or updated this session)
- `docs/DR_CLOUD_FIRST_HARDENING.md` — this document: evidence, design, scenarios, handoff
- `docs/PRODUCTION_DATABASE_ARCHITECTURE.md` — architecture, quota/outbox proof, pool arithmetic
- `docs/BACKUP_AND_DISASTER_RECOVERY.md` — policies, operations, retention, security
- `docs/DATABASE_RESTORE_VERIFICATION.md` — restore verification procedure, production guard rails
- `docs/DATABASE_PERFORMANCE_AND_SCALING.md` — performance, capacity, growth
- `docs/DISASTER_RECOVERY_EXERCISE.md` — exercise framework, scenarios A–G, templates

> Pre-existing related documents (not authored this session, still current):
> `docs/DISASTER_RECOVERY_RUNBOOK.md`, `docs/BACKUP_RUNBOOK.md`,
> `docs/DATABASE_FAILOVER_RUNBOOK.md`, `docs/PRODUCTION_RUNBOOK.md`,
> `docs/DATABASE_OPERATIONS.md`.

**Code**
- `scripts/dr-backup-run.mjs` — pipeline: disk guard, dump, encrypt, checksum, retry+verify, retention
- `scripts/dr-restore-drill.mjs` — **new**: 4-stage restore drill
- `scripts/lib/dr-restore-safety.mjs` — **new**: guard rails preventing a restore onto production
- `scripts/lib/dr-policy.mjs` — pure policy: retention, anomaly, disk, offsite, backoff
- `scripts/lib/dr-offsite.mjs`, `scripts/dr-monitor.mjs`, `scripts/dr-restore-point.mjs`, `scripts/dr-observability.mjs`
- `ops/dr/backup-cron.sh` — hPanel-safe cron entrypoint (captures the real exit status)
- `ops/dr/install-backup-schedule.sh` — crontab/hPanel schedule installer
- `ops/dr/backup.example.env` — **new**: documented template for every variable above
- `tests/dr-hardening.test.mjs` — **86 tests, all passing**

## 36. Open findings

### 36.1 Worker flags: production env overrides the tracked file

`ecosystem.config.js` sets all four worker flags `false`, yet `/api/readyz` at `788071d` reports:

```
cmsScheduler:       CONFIGURED
notificationOutbox: LOCAL_WORKER_CONFIGURED
tenantGc:           LOCAL_WORKER_CONFIGURED
```

Source is `backend/index.js:3957-3959`, which ANDs the file value with the process environment:

```js
cmsScheduler:       flags.enable_cms_scheduler        && process.env.ENABLE_CMS_SCHEDULER === 'true',
notificationOutbox: flags.enable_notification_outbox  && process.env.ENABLE_NOTIFICATION_OUTBOX === 'true',
tenantGc:           flags.enable_tenant_gc            && process.env.ENABLE_TENANT_GC === 'true',
```

**Conclusion:** the deployed PM2 environment sets `ENABLE_*=true`, overriding `ecosystem.config.js`.
The tracked file does not reflect production reality.

**Impact — operational, not functional.** Readyz accurately reflects what is running. But anyone
reading `ecosystem.config.js` to understand the deployed system is misled, and a `pm2 resurrect` from
the tracked file alone would start the workers **disabled**.

**Recommended action:** update `ecosystem.config.js` to match production, or move these flags into
`backend/.env` with the file as a documented default. **Do not change the running env blindly** —
verify against the live PM2 environment first.

### 36.2 Six restore-point archives remain in Git history — 112.2 MB

| File | Size |
|------|------|
| `backups/local-backup-pre-cert.tar.gz` | 22.7 MB |
| `scratch/restore_point_checkpoint32.zip` | 19.4 MB |
| `scratch/restore_point_checkpoint17.zip` | 18.6 MB |
| `scratch/restore_point_20260811_110306.zip` | 18.6 MB |
| `scratch/restore_point_20260811_103556.zip` | 18.6 MB |
| `scratch/restore_point_20260811_102957.zip` | 18.6 MB |
| `scratch/restore_point_20260811_102220.zip` | 18.6 MB |
| **Total** | **112.2 MB** |

Both paths are git-ignored for *new* files — `scratch/` (line 90) and the `/backups/**` rules
(lines 101–110) — so nothing further will be added. But ignore rules do not remove objects already in
history; these seven remain in every clone.

**Risk:** if any of these archives contains a database dump, it is a credential and PII disclosure
sitting permanently in the repository, and it is *not* a backup — it lives beside the code it
protects.

**Recommended action:** inspect the contents, then purge with `git filter-repo` (coordinate with all
clones — this rewrites history). See §7.3.

### 36.3 `/api/diagnostics` and `/api/db-diagnostics` are publicly reachable

They expose `log_bin`, `version`, `hostname`, row counts and connection-limit data without
authentication. No credentials or secrets are exposed, but it is unnecessary attack-surface detail.
**Recommend:** require an admin key, or remove the endpoints.

### 36.4 `/api/readyz` `latencyMs` is always `0`

Not a real measurement. Either measure it or remove it (§31.3).

---

## 37. Honest summary

**What is genuinely stronger after this work**

The backup pipeline no longer lies. It refuses to run when disk headroom is short, rather than writing
a truncated dump and reporting success. It verifies that the offsite copy actually exists and is the
right size, rather than trusting an exit code. It flags a suspiciously small backup instead of
quietly archiving one. A failed backup cannot report success. And there is now a restore drill that
proves an artifact is decryptable, complete and structurally sound — while making it structurally
difficult to point it at production.

**What is still unproven**

Almost everything that matters. No backup has been restored into a live database. No offsite copy
exists yet, so 3-2-1 is still not met and Scenario E — loss of the single host — still means total
data loss. PITR is unavailable and cannot be fixed on this platform. RTO has never been measured
because no recovery has ever been performed. There is no external monitoring, so a host-loss event
would be discovered by users rather than by us.

**The distinction that matters**

The gap is no longer *"we don't know what to do"* — every procedure is written and the automation is
built and tested. The gap is *"nothing has been executed against production."* Closing it needs
credentials and a host, which this session does not have.

Two actions change the risk profile more than everything else combined:

1. **Configure the offsite destination** (§6) — converts host loss from catastrophic to recoverable.
2. **Run `npm run dr:drill` against a real backup** (§19) — proves the backups are restorable.

Until both are done, the honest status of production disaster recovery is **NOT VERIFIED**.

---

*End of cloud/SRE DR hardening assessment. Evidence: `db_diagnostics` + `/api/diagnostics` at
`788071d`, read-only probes, 86/86 passing unit tests.*

---

# PART V — P0 EXTERNAL MONITORING AND EXTENDED SCENARIOS

## 27b. Scenarios H–L

The original set (A–G) omitted five failure modes that matter on this platform.
They are specified here with the same fields. None has been executed against
production — no credentials, no SSH, no shell egress from the assessment host.

### H — Disk exhaustion

| Field | Value |
|-------|-------|
| Detection | Backup pre-flight `steps.disk.status = INSUFFICIENT`; the run refuses to start rather than writing a truncated dump. Also host disk alerts. |
| Recovery | 1) Identify large files (`du -sh`). 2) Prune old recovery points with `dr:backup --retain-only` — this deliberately does **not** require database credentials, so it works when only disk is broken. 3) If the DB volume is full, MariaDB may refuse writes: free space before restoring. |
| Measured recovery time | **NOT VERIFIED** (pruning logic verified; real incident not) |
| Data loss window | None if caught before a write fails |
| RPO / RTO | RPO unaffected / RTO target < 30 min |
| Evidence | Refusal verified live: required 26 843 545 600 B, free 18 640 785 408 B → `FAILED`, `steps.backup: null`, exit 1 `[IMPLEMENTED]` |
| Status | 🟢 **Prevention VERIFIED** / 🔴 **Recovery NOT VERIFIED** |

### I — Worker failure (outbox, CMS scheduler, tenant GC, PDF)

| Field | Value |
|-------|-------|
| Detection | `/api/readyz` → `cmsScheduler`, `notificationOutbox`, `tenantGc`. Note the open finding in §36.1: the deployed PM2 environment sets `ENABLE_*=true`, overriding `ecosystem.config.js`, which has all four flags `false`. |
| Recovery | `pm2 restart` the affected worker. The MariaDB transactional outbox is durable, so queued work survives a worker crash and is reclaimed on restart. |
| Measured recovery time | **NOT VERIFIED** |
| Data loss window | None — outbox is transactional; at-least-once delivery means work may be retried, not lost. |
| RPO / RTO | RPO 0 / RTO target < 15 min |
| Evidence | Outbox durability verified architecturally (`queue: "mysql-transactional-outbox"`). Worker restart **NOT VERIFIED**. |
| Status | 🟡 **Design VERIFIED** / 🔴 **Recovery NOT VERIFIED** |

### J — Cloud/object-storage credential failure

| Field | Value |
|-------|-------|
| Detection | Offsite replication fails after `BACKUP_OFFSITE_MAX_ATTEMPTS` retries; run fails with `offsiteVerified: false` and a reason. It never reports success. |
| Recovery | 1) Local copy is intact — nothing is lost. 2) Rotate/fix the credential. 3) Re-run the backup. 4) Re-run `dr:drill` against an offsite-restored copy. |
| Measured recovery time | **NOT VERIFIED** |
| Data loss window | None — local remains authoritative |
| RPO | Unchanged while the offsite leg is down |
| RTO | Target < 2 h to re-establish |
| Evidence | **VERIFIED as logic** — no destination configured → `NOT VERIFIED`, never `HEALTHY` `[IMPLEMENTED]`. Real credential failure not exercised. |
| Status | 🟡 **Detection VERIFIED** (logic) / 🔴 **NOT VERIFIED** (real event) |

### K — Network failure

| Field | Value |
|-------|-------|
| Detection | External monitor reports all endpoints unreachable; on-host checks may still pass. Divergence between the two is the signal. |
| Recovery | Depends on scope (host NIC, provider, upstream). Determine whether the host is up but unreachable using provider console. |
| Measured recovery time | **NOT VERIFIED** |
| Data loss window | None |
| RPO / RTO | RPO unaffected / RTO depends on provider |
| Evidence | **NOT VERIFIED** — no external monitor is deployed yet (§27c). |
| Status | 🔴 **NOT VERIFIED** |

### L — Restore-point integrity failure

| Field | Value |
|-------|-------|
| Detection | `dr-restore-drill.mjs` integrity stage: sidecar SHA-256 mismatch, gzip decode failure, or AES-256-GCM auth-tag failure → `integrity FAIL`, exit 1. |
| Recovery | Do not trust the artifact. Fall back to the previous recovery point, drill it, then investigate why (disk full mid-dump? process killed? key rotated?). |
| Measured recovery time | **NOT VERIFIED** |
| Data loss window | Shifts the recoverable point back by one interval |
| RPO | Degrades to the last *good* backup |
| RTO | Add one drill cycle (~5 min) |
| Evidence | **VERIFIED against synthetic artifacts**: tampered ciphertext without sidecar → exit 1; tampered ciphertext with a valid sidecar → `integrity FAIL` exit 1; valid artifact → `PASS`. A genuinely corrupted production backup has not been encountered. |
| Status | 🟢 **Detection VERIFIED** (logic) / 🔴 **NOT VERIFIED** (real corruption) |

## 27c. P0 external monitoring — now implemented

**This was the largest remaining observability gap.** Every other check runs on
the production host, so during Scenario E (host loss) the monitoring dies with
the host and nobody is told.

`scripts/dr-external-watch.mjs` (`npm run dr:watch`) closes it. It is
dependency-free (Node built-ins only) and designed to run **from a different
machine** — a laptop, a second VPS, a CI schedule, or a free uptime service.

**Checks:** HTTPS reachability and status for `/api/healthz`, `/api/readyz`,
`/api/platform/version`; TLS certificate presence and days-to-expiry; release
identity (backend SHA == frontend SHA == expected SHA); database status via
readyz; latency against a budget.

**Exit codes:** `0` HEALTHY · `1` FAILED (page someone) · `2` BLOCKED.

**Fail-closed behaviour:**

| Situation | Reported | Why it matters |
|-----------|----------|----------------|
| Endpoint unreachable | **FAILED** | Never mistaken for healthy |
| TLS could not be inspected | **FAILED** | An unmeasurable cert is not a healthy cert |
| Cert expired | **FAILED** | — |
| Cert expiring in < 14 days | HEALTHY + warning | Actionable, not an outage |
| backend SHA != frontend SHA | **FAILED** | Release identity mismatch |
| Running SHA != expected SHA | **FAILED** | Wrong release deployed |
| Nothing could be checked | **BLOCKED** | Not silently reported as a pass |
| Slow but responding | HEALTHY + warning | Latency degradation is not downtime |

**Verified here:** `--self-test` runs 5 deterministic offline cases, all passing.
When run from a host with no egress it correctly reported `FAILED` with five
specific problems and exit 1 — it did **not** report healthy.

> **Deployment is an operator action and is NOT VERIFIED.** Copy the script to
> any machine with internet access and schedule it every 5 minutes:
> `*/5 * * * * /usr/bin/node /path/dr-external-watch.mjs --quiet || echo "PRODUCTION DOWN"`

## 27d. Remaining gap: dr-monitor does not surface the new statuses

`dr-monitor.mjs` still reports only `HEALTHY`/`STALE`/`FAILING`/`NOT VERIFIED`.
The pipeline already **detects** `ANOMALY_SUSPICIOUSLY_SMALL`,
`ANOMALY_SUSPICIOUSLY_LARGE`, `INSUFFICIENT_HISTORY`, `INSUFFICIENT` disk
headroom, and unverified uploads — they are in the JSON report but are not yet
promoted to monitor status. **Detection works; classification does not.** This
is the next engineering task.

---

*End of Part V.*
