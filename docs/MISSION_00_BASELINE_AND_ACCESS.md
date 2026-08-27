# Mission P0 — Baseline Forensics & Access Requirements

Status: **BLOCKED — awaiting infrastructure access**
Branch: `arena/01a04323-resumepilotai`
Date: 2026-08-27

This document records verified ground truth only. Nothing here is a claim of
testing that was not performed.

---

## A. Git identity (verified)

| Field | Value |
|---|---|
| `CURRENT_LOCAL_SHA` | `e915d6b358744ec27a77bfbc575555158118ec75` |
| `CURRENT_ORIGIN_MAIN_SHA` | `e915d6b358744ec27a77bfbc575555158118ec75` |
| `LAST_CERTIFIED_SHA` | `e915d6b…` (identical to HEAD) |
| `CURRENT_PRODUCTION_SHA` | **UNKNOWN — production unreachable from this environment** |
| `WORKING_TREE_STATE` | Clean. No staged, unstaged, or untracked changes. |
| Clone depth | **Grafted / shallow — single commit.** No history available, so commit-level archaeology of prior migrations is not possible here. |

Local and origin are in sync; there is no unpushed or divergent work to recover.

---

## B. Environment capability audit (verified)

| Capability | Result | Impact on mission |
|---|---|---|
| Node 22.22.3 / npm 10.9.8 | Available | OK |
| `npm install` | **Succeeded** — 1276 packages | Unit/integration tests are runnable |
| GitHub + npm registry egress | Reachable | Commit/push works |
| `https://airesume.projectdemo.guru` | **TLS handshake fails** (DNS resolves to Cloudflare; egress blocked) | §32 production Playwright, §36 deploy verification, §37 rollback **cannot be executed** |
| `https://ai-resume-builder.local` | **Does not resolve**; no Apache/XAMPP present | §32 local browser journeys **cannot be executed** |
| PostgreSQL | **Not installed** | — |
| MariaDB / MySQL | **Not installed** | — |
| Docker | **Not installed** | No containerised DB fallback |
| Debian apt repositories | **Network-blocked** (`deb.debian.org` unreachable) | Databases **cannot be installed** by any standard path |
| Firebase credentials | **None present** — no `.env`, no service-account key | §13 real MFA, §14 OAuth **cannot be executed** |

Consequence: §11–12 (live schema/data audit), §20 (outbox runtime), §26
(performance), §27 (failure injection), §28 (backup/restore) and §36–37
(deploy/rollback) are all gated on infrastructure that does not exist in this
sandbox.

---

## C. Two structural findings (verified by code inspection)

### C1 — PostgreSQL is not implemented at all

There is **no PostgreSQL runtime code, driver, connection pool, migration, or
environment variable** anywhere in the application. Every match for
`postgres`/`pgvector` outside `node_modules` falls into one of:

- test files that *assert about* a Postgres design (`backend/enterprise-test/*`)
- binary false positives (`backend/fonts/Inter_*.ttf`)

Environment variables actually read by the backend include `DB_*`, `MYSQL_*`,
and `FIREBASE_*` — and **zero** `PG*`/`POSTGRES_*` variables.

> §7–§10 (polyglot MariaDB + PostgreSQL architecture, domain ownership,
> database independence, outbox-based synchronisation) is therefore **greenfield
> work, not a repair**. Any prior report describing a working dual-database
> architecture was inaccurate.

### C2 — Firestore is a flag-gated live failover path, not merely legacy text

322 files reference Firestore. Critically, these are not all dead strings —
there are runtime-reachable, environment-gated switches:

| Flag | Location | Behaviour |
|---|---|---|
| `ALLOW_FIRESTORE_FAILOVER` | `backend/database/authority.js` (6 call sites) | Gates Firestore becoming a **write target** during failover |
| `ALLOW_FIRESTORE_ENGINE` | `backend/database/engineManager.js:87` | Gates switching the **active engine** to Firestore |
| `FIREBASE_DATA_PLANE` / `ENABLE_FIRESTORE_DATA_PLANE` | `syncManager.js`, `services/aiAdmin.js`, `services/paymentAdmin.js` | Gates Firestore data-plane reads |

`backend/index.js:152` prints that the data plane "has been removed from the
runtime", yet `aiAdmin.js:127` and `paymentAdmin.js:95` still branch on the same
variables. That is a **contradiction between the stated status and the code** —
precisely the misleading-status class of defect named in §25, and the
"disabled by configuration" pattern explicitly rejected by §5.

Both findings are structural and independent of the access blocker.

---

## D. Access required to execute the full mission

Supply these and the mission proceeds end to end. **Do not paste secrets into
chat** — place them in an untracked `.env` at the repository root (already
covered by `.gitignore`), or attach them as files.

### D1 — MariaDB (authoritative transactional store)
Either a reachable endpoint or permission to use a throwaway instance:
```
DB_HOST=      DB_PORT=      DB_USER=
DB_PASSWORD=  DB_NAME=      DB_SSL=
```
Plus a **schema dump of the real database** (`mysqldump --no-data`) so §11
schema reconciliation can compare code expectations against production reality.

### D2 — PostgreSQL (specialised store)
A reachable instance with `CREATE DATABASE` + `CREATE EXTENSION` rights
(pgvector required for §22). New variables will be introduced; none exist today.

### D3 — Firebase Authentication
Required for §13 MFA and §14 OAuth to be genuinely verified:
- service-account JSON (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`)
- `FIREBASE_WEB_API_KEY`
- a **test tenant** with TOTP MFA enabled, plus disposable test users per role
  (`USER` … `SUPER_ADMIN`). Production user accounts must not be used.

### D4 — A reachable running application
Either network egress to `airesume.projectdemo.guru`, or confirmation that I may
stand the full stack up **inside this sandbox** — which additionally requires a
way to obtain database binaries, since apt and Docker are both blocked
(e.g. permission to install `embedded-postgres` from npm, or a vendored tarball).

### D5 — Deployment path
Deploy mechanism (PM2? rsync? CI?), target host, and how a deploy is
authorised. Note: **I will never ask for or store passwords, PATs, or 2FA
codes.** If deployment needs a secret, run the deploy step yourself and I will
verify the resulting SHA once production is reachable.

---

## E. What happens next

On receipt of D1–D5 I proceed in the priority you set:

1. **§7–§12 database architecture** — domain-ownership matrix, PostgreSQL
   introduction, idempotent migrations, transactional outbox + sync worker,
   failure isolation, live schema/data reconciliation.
2. §4–§6 Firestore data-plane elimination and orphan cleanup.
3. §13/§16 MFA and Super Admin.
4. §31 three self-challenge reviews, then §32 Playwright, then §36 deploy.

Until then, per §34 and §40, no gate in §38 may be marked PASS and the mission
status remains **BLOCKED**.
