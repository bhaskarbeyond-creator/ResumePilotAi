# Local Senior Developer Enterprise 10/10 Execution Runbook

**Audience:** Local senior developer with authorized access to the real staging/production infrastructure.
**Repository branch:** `arena/01a01c9e-resumepilotai`
**Remote branch SHA at handoff:** Run `git ls-remote origin refs/heads/arena/01a01c9e-resumepilotai`; record the result because the runbook commit itself advances the branch.
**Pre-enterprise restore point:** `enterprise-pre-migration-restore` → `10196c029758e000f7c602b874c5976a1ffba890`
**Final local-foundation restore point:** `enterprise-tenant-foundation-final-verified` → `8422cc35aac912fc55beca6cc0630666dd772d4b`

> ## Autonomous execution authorization
>
> You are authorized to proceed autonomously through this runbook. Do not ask the owner routine technical questions. Inspect the repository and infrastructure first; use senior engineering judgment; fix legitimate defects; retest and preserve evidence after every material change. Do **not** make destructive production-data or DNS/IAM changes without a verified backup/restore point and an approved rollback route. Do not expose secrets, weaken RLS, weaken authorization, weaken tenant isolation, weaken AI isolation, silently migrate ambiguous data, or silently route a dedicated tenant to shared infrastructure.

This is an **execution manual**, not a certification. A 10/10 tag is allowed only after the evidence gates in Phase 29 are met. If any mandatory external gate remains unverified, create `enterprise-production-ready-candidate` instead of `enterprise-10-10-certified`.

---

# Execution map

```text
0  Repository / restore point
1  Baseline recertification
2  Real infrastructure inventory
3  Code-to-infrastructure map confirmation
4  PostgreSQL / RLS staging proof
5  Shared cache / Redis proof
6  Queue / worker / DLQ proof
7  Object storage / KMS / artifact proof
8  Firebase / rules / IAM proof
9  Data migration manifest and pilot
10 Identity / OIDC / SAML / SCIM / MFA
11 M2M service-account proof
12 Support / break-glass proof
13 AI production isolation proof
14 Cloudflare / WAF / edge proof
15 Secrets / IAM proof
16 Observability proof
17 Backup / restore / DR drill
18 Load / performance proof
19 Chaos / failure proof
20 Browser / UX / accessibility proof
21 DAST / security proof
22 Cross-tenant adversarial matrix
23 Whole-system conflict audit
24 Logical-error / bug hunt
25 Certified-product regression
26 Final full regression
27 Evidence package
28 Certification decision
29 Final restore point and tag
```

## Dependency graph

```text
Verified source + restore point
  └─ baseline suites
      └─ infrastructure inventory
          ├─ PostgreSQL role/RLS proof ───────┐
          ├─ Firebase/IAM/rules proof ────────┤
          ├─ cache + queue + storage proof ───┤
          ├─ identity/SSO/SCIM proof ─────────┤
          └─ Cloudflare/secret/observability ─┤
                                              ▼
                                  migration dry run / pilot
                                              ▼
                            load, chaos, browser, a11y, DAST
                                              ▼
                         cross-tenant adversarial matrix
                                              ▼
                         backup/restore and final regression
                                              ▼
                          evidence package + certification tag
```

---

# Phase 0 — Repository and restore-point handoff

## Purpose

Establish a known-good source state before touching a database, Firebase project, Cloudflare policy, queue, storage, or IdP. Do not assume a local clone, branch, tag, or deployment is current.

## Prerequisites

- GitHub read/write access to `bhaskarbeyond-creator/ResumePilotAi`.
- Node/npm compatible with the checked-in lockfiles.
- Permission to create local tags/worktrees.
- No production credentials are needed in this phase.

## Safety check

Do **not** use `git reset --hard`, force push, delete tags, overwrite tags, or remove existing worktrees. Do not check out `main` for implementation. Work only on `arena/01a01c9e-resumepilotai`.

## Exact steps

```bash
# Clone only if no working checkout exists.
git clone https://github.com/bhaskarbeyond-creator/ResumePilotAi.git ResumePilotAi
cd ResumePilotAi

# Fetch all refs and tags without changing files.
git fetch --all --tags --prune

git switch arena/01a01c9e-resumepilotai
# If the branch is not present locally, use the Arena-provided branch checkout;
# do not create a differently named implementation branch.

git status --short --branch
git rev-parse HEAD
git ls-remote origin refs/heads/arena/01a01c9e-resumepilotai
git rev-parse origin/main

git tag -l 'enterprise-*' --sort=refname
for tag in enterprise-pre-migration-restore enterprise-tenant-foundation-final-verified; do
  git show -s --format='%D%n%H%n%s%n%ad' --date=iso-strict "$tag"
done
```

Expected references:

```text
enterprise-pre-migration-restore
  10196c029758e000f7c602b874c5976a1ffba890

enterprise-tenant-foundation-final-verified
  8422cc35aac912fc55beca6cc0630666dd772d4b
```

Known commits/tags after the initial local-foundation implementation include:

```text
0f56945  docs(verification): record hardened tenant foundation evidence
8422cc3  merge: reconcile prior enterprise foundation history
becb1af  docs(verification): record final tenant foundation restore proof
enterprise-tenant-foundation-final-verification-record → becb1af
```

These are documentation/history records around the same hardened source. Confirm the actual remote branch SHA with `git ls-remote`; record it in the evidence package rather than assuming this document is newer than the remote.

## Create an infrastructure-validation restore point

Only after `git status --short` is empty and baseline tests pass, create a new **non-overwriting** tag:

```bash
START_SHA="$(git rev-parse HEAD)"
git tag -a enterprise-infra-validation-start "$START_SHA" \
  -m "Infrastructure validation start; source verified before external changes"
git show -s --format='%D%n%H%n%s' enterprise-infra-validation-start
```

If that tag already exists, **do not overwrite it**. Inspect it and create a uniquely dated suffix instead, for example `enterprise-infra-validation-start-2026-08-20`.

## Detached rebuild proof

Use a disposable worktree. Do not alter the active implementation checkout.

```bash
VERIFY_DIR="$(mktemp -d -t resumepilot-restore-XXXXXX)"
git worktree add --detach "$VERIFY_DIR" enterprise-pre-migration-restore
(
  cd "$VERIFY_DIR"
  npm ci --ignore-scripts
  npm --prefix backend ci --ignore-scripts
  npm run test:interview
  npm run test:security
  npm run test:product
  npm run build
)
git worktree remove --force "$VERIFY_DIR"
git worktree prune
```

Repeat the same procedure for `enterprise-tenant-foundation-final-verified` after the enterprise baseline is installed. Preserve command output in the evidence directory, not in Git if it contains environment details.

## PASS / FAIL

- **PASS:** tag SHA matches expected, worktree is clean/detached, all baseline commands pass, and return to the enterprise branch cleanly.
- **FAIL:** unexpected SHA, dirty tree, tag mismatch, test mismatch, package-lock drift, missing tag, or build failure.

## Failure guidance and rollback

- Stop before infrastructure changes.
- Compare `git diff`, `git log --left-right HEAD...origin/arena/01a01c9e-resumepilotai`, lockfiles, Node version, and npm version.
- If the tag is missing from the local clone but exists remotely, fetch tags; never recreate a tag with a different target.
- If a package install changed a tracked lockfile, restore only that known file after recording why it changed; do not discard unrelated files.

## Evidence to capture

```text
commit SHA, branch, origin SHA, tag SHA, git status,
Node/npm versions, npm ci output, all test/build outputs, date/time/operator
```

---

# Phase 1 — Baseline recertification

## Commands

Run from the active enterprise branch after `npm ci --ignore-scripts` in root and `backend/`:

```bash
npm run test:interview
npm run test:security
npm run test:product
npm run test:enterprise
npm run build
npm run lint
npm audit --omit=dev --audit-level=high
npm --prefix backend audit --omit=dev --audit-level=high
```

## Expected results

| Command | Expected local baseline |
|---|---|
| `test:interview` | 28/28 pass |
| `test:security` | 163/163 pass |
| `test:product` | 301/301 pass |
| `test:enterprise` | 50 backend tests + 4 UI contract tests pass |
| `build` | pass |
| `lint` | 0 errors; legacy warnings may remain |
| both production audits | 0 vulnerabilities |

## PASS / FAIL

- **PASS:** counts equal or exceed the table with zero failures; any added tests must also pass.
- **FAIL:** any baseline failure, unexplained count reduction, build error, lint error, or audit finding.

## Failure guidance

1. Stop infrastructure work.
2. Determine whether source changed, production configuration differs, Node/npm differs, dependencies were not installed from lockfiles, or test fixtures are missing.
3. Fix source only if the failure is a real defect and apply the certified baseline protocol in `.agents/AGENTS.md`.
4. Rerun the affected suite **and the full Phase 1 suite**.

## Never change blindly

- Certified CV/Resume/DOCX/Interview/AI behavior.
- `SecurityRules.txt`, `Realtime_database_Security_rules.txt`, or deployed Firebase rules without staging/emulator evidence.
- `package-lock.json` or `backend/package-lock.json` merely to make an install succeed.

---

# Phase 2 — Real infrastructure inventory

## Deliverable

Create and maintain:

```text
docs/ENTERPRISE_INFRASTRUCTURE_INVENTORY.md
```

Use this table for every item. Secret **names**, paths, vault references, and ownership are allowed; secret values are prohibited.

| Component | Provider | Environment | Status | Repository integration point | Secret/config name only | Owner | Verification status |
|---|---|---|---|---|---|---|---|

## Exact inventory procedure

### Host, runtime, proxy, process manager

On each staging and production node/container platform, capture:

```bash
uname -a
cat /etc/os-release 2>/dev/null || true
node --version
npm --version
command -v pm2 && pm2 list || true
command -v systemctl && systemctl list-units --type=service | grep -Ei 'node|resume|pm2' || true
ps aux | grep -Ei 'node|backend/index' | grep -v grep || true
ss -ltnp | grep -E ':80|:443|:8080' || true
```

Inspect actual reverse proxy configuration. The tracked Apache baseline is `.htaccess` and `api/index.php`; it proxies `/api/*` to Node port 8080. Determine whether production uses this Apache/PHP proxy, Nginx, Cloudflare Tunnel, a managed load balancer, or another route. Record:

- TLS termination location;
- trusted proxy hop count versus `TRUST_PROXY_HOPS`;
- whether port 8080 is private-only;
- direct-origin firewall behavior;
- process restart policy and worker topology.

### Cloudflare / DNS / TLS

Inventory only through authorized dashboard/API/CLI access. Record zone, environment, origin hostname, SSL mode, DNS record type, WAF policy IDs/names, cache rules, rate limits, bot rules, Workers/Pages routes, and origin firewall policy. Never record API tokens.

### Firebase / Google Cloud

Inventory project IDs, Auth/Identity Platform configuration, authorized domains, enabled providers, MFA setting, Firestore database name/location, RTDB instance, Storage bucket, deployed rules timestamps, indexes, service accounts, Workload Identity/ADC, Secret Manager references, logging sinks, backup/export schedules, and billing project.

### Data platform

Inventory PostgreSQL engine/version, primary/replica topology, connection pooler, TLS policy, database names, role names only, secret-manager references, backup/PITR retention, RPO/RTO, Redis/version/topology, queue provider, worker deployment, DLQ, object storage provider/bucket naming policy, malware scanner, KMS/key hierarchy, vector/RAG provider, and AI provider regional settings.

### CI/CD and observability

Inventory source CI, deployment CI, protected branches, approvals, artifact registry, SBOM/CodeQL/dependency scanning, central logs, metrics, tracing, error reporting, SIEM, on-call/incident tooling, and release/rollback procedure.

## PASS / FAIL

- **PASS:** every row has provider/environment/owner/status/integration/config-name and evidence link or `UNAVAILABLE` justified.
- **FAIL:** any source of tenant data, identity, secrets, network routing, worker execution, or backup is unknown.

## Rollback

Inventory is read-only. If a required console action is proposed, export/screenshot existing configuration first and record exact rollback path before changing it.

---

# Phase 3 — Repository-to-infrastructure mapping

Create:

```text
docs/ENTERPRISE_CODE_INFRA_MAPPING.md
```

Use the table below as the starting truth. Update it only after comparing code and real infrastructure.

| Subsystem | Actual repository paths / entry point | Required infrastructure | Runtime configuration / expected behavior | Primary tests |
|---|---|---|---|---|
| Feature flags | `backend/enterprise/featureFlags.js`; `src/enterprise/EnterpriseContext.jsx`; `.env.example` | Environment/config service | `ENTERPRISE_TENANCY_ENABLED` is authoritative server gate; `VITE_ENTERPRISE_TENANCY_ENABLED` is UX-only; `/api/enterprise/status` reports server gate | `backend/enterprise-test/consistency-audit.test.js`, `tests/enterprise-ui.test.mjs` |
| App integration | `backend/index.js` lines around `app.set('tenantService')`, `/api/enterprise` mounts, public M2M exception, header guard | Node/Express reverse proxy/CORS | Node initializes `createTenantService`; CORS must permit enterprise headers for allowed origins | `backend/enterprise-test/enterprise-routes.test.js` |
| Tenant registry | `backend/enterprise/tenantRegistry.js` | Firestore transitional control plane or PostgreSQL control plane | `enterprise_*` Firestore documents are server-only; legacy personal mapping remains Firebase UID based | `tenant-foundation.test.js` |
| Context | `backend/enterprise/tenantContext.js`; `tenantService.resolveContext`; `routes/enterprise.js#resolveTenantContext` | Firebase Auth/IdP + control plane | issuer + source subject map to canonical UUID principal; tenant/workspace are server resolved | `tenant-foundation`, `consistency-audit`, route tests |
| Authorization | `backend/enterprise/tenantPolicy.js`; `backend/security/auth.js`; `backend/security/policy.js` | Firebase Auth now; future IdP/SCIM | Route permission checks plus resource checks plus RLS; UI is not enforcement | enterprise routes, security suite |
| RLS transaction | `backend/enterprise/tenantDataPlane.js` | PostgreSQL `pg` pool | `TENANT_DATABASE_URL`; `BEGIN`, `set_config(..., true)`, `COMMIT/ROLLBACK`, `RESET ALL` | `tenant-foundation` PGlite/pool tests |
| SQL migrations | `backend/sql/000_*` through `003_*`; `backend/scripts/applyEnterpriseMigrations.js`; `backend/enterprise/sqlMigrations.js` | DBA/migrator/runtime PostgreSQL roles | DBA runs 000/003; migrator runs 001/002 via `npm run migrate:enterprise` | migration/PGlite tests |
| Shared/dedicated route | `backend/enterprise/tenantRouting.js`; `tenantDataPlane.TenantDataPlaneRouter`; `tenantRegistry.normalizeDataPlane` | shared Postgres plus dedicated resolver/pools | `SHARED_POSTGRES` and `DEDICATED_POSTGRES`; no dedicated fallback to shared | route/profile tests |
| Cache/quota | `backend/enterprise/tenantCache.js`; `tenantQuota.js` | Firestore atomic quota now; Redis recommended for high scale | hash/key includes tenant/workspace/principal/version; Redis adapter must retain same contract | cache/quota/scale tests |
| Queue/outbox | `backend/enterprise/tenantJobs.js`; `backend/services/notificationOutbox.js`; worker invocation in `backend/index.js` | Firestore outbox now; managed queue/DLQ recommended | tenant envelopes are signed; outbox reauthorizes via `tenantService.authorizeOutboxEvent` | job/outbox adversarial tests |
| File/artifacts | `tenantStorage.js`; `tenantSignedArtifacts.js` | Object storage, scanner, KMS, signed URL service | tenant/workspace namespace + route-bound/purpose-bound tokens; no provider adapter is deployed yet | artifact tests |
| AI | `tenantAi.js`; enterprise route `/ai/generate-content`; legacy `backend/routes/ai.js`, `backend/services/aiRuntime.js` | provider vault, usage store, optional RAG/vector | tenant allowlist empty means deny; legacy AI stays certified UID path until adapter cutover | AI/adversarial/interview tests |
| Migration bridge | `firebaseBridge.js`; `firebaseMigrationAdapter.js`; `certifiedModuleBridge.js` | Firestore source + PostgreSQL target + manifest store | no blind migration; ambiguous ownership blocked | migration/reconciliation tests |
| M2M | `serviceIdentity.js`; `serviceAccountStore.js`; `routes/enterpriseM2m.js` | server-only Firestore store or future PostgreSQL control plane | one-time `rpa_` key display, hash only persisted, scope/tenant/workspace binding | M2M route tests |
| Support | `supportAccessStore.js`; `tenantService.createSupportGrant/resolveSupportContext`; enterprise support routes | server-only grant store/audit | explicit grant/reason/scope/expiry/revoke; no general support bypass | support tests |
| Audit/telemetry | `tenantAudit.js`; `tenantTelemetry.js`; `tenantRepository.js`; `/audit` route | Firestore transitional audit + PostgreSQL audit table + central sink | scoped event fields, low-cardinality metric labels | audit/telemetry tests |
| Enterprise UI | `src/enterprise/*`; `/enterprise` lazy route in `src/main.jsx`; conditional link in `ProfileDisplay.jsx` | same-origin API and build deployment | explicit status, switchers, role-aware nav, browser/server flag mismatch state | `tests/enterprise-ui.test.mjs` |
| Firebase rules | `SecurityRules.txt`; `Realtime_database_Security_rules.txt`; `firebase.json`; `firestore.indexes.json` | Firebase CLI/emulators/projects | direct browser client cannot read enterprise server-only documents due deny-by-default catchall | `tests/firestore.rules.test.mjs`, `tests/database.rules.test.mjs` |

## Mapping PASS criteria

For each row, local developer must add actual provider endpoint/project/role/pool/bucket/queue/owner/evidence link to the inventory. If the real system has an integration that the code does not use, mark it **not connected**; do not claim it is protecting this application.

---

# Phase 4 — Real PostgreSQL and RLS runbook

## Why

The local PGlite proof validates syntax and core PostgreSQL semantics, not managed PostgreSQL network policy, credentials, role ownership, PgBouncer behavior, failover, backups, or production pooling.

## Required access

- disposable staging PostgreSQL database, never production data first;
- DBA role for role provisioning and grant inspection;
- migration role for `001`/`002` migrations;
- runtime and worker role DSNs or a safe way to use `SET ROLE` in a disposable database;
- secret-manager read/injection access for **secret names only**;
- permission to create/remove a disposable validation database/schema and test records.

## Required configuration

Repository-consumed value:

```text
TENANT_DATABASE_URL
```

Use it only for the **runtime** data-plane DSN in an approved environment. Do not put it in a `VITE_` variable. For validation, use shell-injected temporary names such as these, never commit them:

```text
TENANT_MIGRATOR_DATABASE_URL
TENANT_RUNTIME_DATABASE_URL
TENANT_WORKER_DATABASE_URL
TENANT_DBA_DATABASE_URL
ENTERPRISE_RLS_VERIFY_DATABASE_URL
```

These names are a local execution convention; record the actual secret-manager reference in the inventory.

## Safety check

```bash
# Confirm target is an explicitly disposable staging database.
psql "$TENANT_DBA_DATABASE_URL" -X -Atc 'SELECT current_database(), current_user, inet_server_addr(), version();'
```

**PASS:** output identifies a disposable staging/validation database and expected host/region.
**FAIL:** output points at an unknown or production database. Stop and create a disposable validation database first.

## Role provisioning

1. Inspect `backend/sql/000_enterprise_runtime_roles.sql`.
2. As DBA, run it only after confirming roles do not already exist with unexpected attributes.
3. Inspect role attributes without showing passwords:

```sql
SELECT rolname, rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls
FROM pg_roles
WHERE rolname IN (
  'resumepilot_tenant_runtime',
  'resumepilot_tenant_worker',
  'resumepilot_tenant_migrator'
);
```

Expected:

```text
runtime:  rolsuper=false, rolbypassrls=false
worker:   rolsuper=false, rolbypassrls=false
migrator: rolbypassrls=false; used only by migration workflow
```

The application runtime/worker identity must not own `tenant_data` tables, be superuser, or have `BYPASSRLS`.

## Migration procedure

Run in a disposable database in this order:

```bash
# 1. DBA-only role definitions.
psql "$TENANT_DBA_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f backend/sql/000_enterprise_runtime_roles.sql

# 2. Migrator schema/RLS migrations.
export TENANT_DATABASE_URL="$TENANT_MIGRATOR_DATABASE_URL"
npm run migrate:enterprise

# 3. DBA-only runtime grants after tables exist.
psql "$TENANT_DBA_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f backend/sql/003_enterprise_runtime_grants.sql
```

`npm run migrate:enterprise` runs `backend/scripts/applyEnterpriseMigrations.js`, which applies `backend/sql/001_enterprise_control_plane.sql` and `backend/sql/002_enterprise_tenant_data_plane_rls.sql` through `backend/enterprise/sqlMigrations.js`.

## Required inspection queries

```sql
-- RLS must be enabled AND forced.
SELECT n.nspname AS schema, c.relname, c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'tenant_data'
  AND c.relname IN ('resources', 'audit_events', 'ai_usage_ledger');

-- Inspect policies; capture policy text in evidence.
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'tenant_data'
ORDER BY tablename, policyname;

-- Inspect grants, ownership and PUBLIC access.
SELECT table_schema, table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema IN ('tenant_data', 'platform')
ORDER BY table_schema, table_name, grantee, privilege_type;
```

PASS requires all three tenant data tables to show `relrowsecurity=t` and `relforcerowsecurity=t`; policies must contain both tenant and workspace conditions in `qual` and `with_check`; runtime/worker roles must have only intended CRUD on `tenant_data`; PUBLIC must not retain grants.

## Real Tenant A / Tenant B test fixture

Use generated UUIDs. Do not use real customer identifiers.

```bash
TENANT_A="$(uuidgen | tr '[:upper:]' '[:lower:]')"
TENANT_B="$(uuidgen | tr '[:upper:]' '[:lower:]')"
WORKSPACE_A1="$(uuidgen | tr '[:upper:]' '[:lower:]')"
WORKSPACE_A2="$(uuidgen | tr '[:upper:]' '[:lower:]')"
WORKSPACE_B1="$(uuidgen | tr '[:upper:]' '[:lower:]')"
PRINCIPAL_A="$(uuidgen | tr '[:upper:]' '[:lower:]')"
PRINCIPAL_B="$(uuidgen | tr '[:upper:]' '[:lower:]')"
RESOURCE_A1="$(uuidgen | tr '[:upper:]' '[:lower:]')"
RESOURCE_A2="$(uuidgen | tr '[:upper:]' '[:lower:]')"
RESOURCE_B1="$(uuidgen | tr '[:upper:]' '[:lower:]')"
```

As migrator/owner, seed only the test DB:

```sql
INSERT INTO tenant_data.resources
  (id, tenant_id, workspace_id, resource_type, owner_principal_id, payload)
VALUES
  (:'resource_a1', :'tenant_a', :'workspace_a1', 'TEST_RECORD', :'principal_a', '{"fixture":"A1"}'::jsonb),
  (:'resource_a2', :'tenant_a', :'workspace_a2', 'TEST_RECORD', :'principal_a', '{"fixture":"A2"}'::jsonb),
  (:'resource_b1', :'tenant_b', :'workspace_b1', 'TEST_RECORD', :'principal_b', '{"fixture":"B1"}'::jsonb);
```

Use a runtime-role connection for each matrix row. In each transaction:

```sql
BEGIN;
SELECT set_config('app.tenant_id', :'tenant_a', true);
SELECT set_config('app.workspace_id', :'workspace_a1', true);
SELECT set_config('app.workspace_scope', 'WORKSPACE', true);
SELECT set_config('app.principal_id', :'principal_a', true);
SELECT set_config('app.policy_version', '1', true);
SELECT set_config('app.routing_version', '1', true);

SELECT id, tenant_id, workspace_id, payload
FROM tenant_data.resources
ORDER BY id;
COMMIT;
```

### Mandatory RLS matrix

| Scenario | Expected result |
|---|---|
| Runtime role, no `app.tenant_id` | zero rows; insert/update denied |
| Tenant A / workspace A1 read | only A1 resource |
| Tenant A / workspace A1 insert A1 | allowed |
| Tenant A / workspace A1 insert A2 | denied by `WITH CHECK` |
| Tenant A / workspace A1 update resource tenant to B | denied |
| Tenant A / tenant-wide workspace scope | A1 + A2 only, never B1 |
| Tenant B / workspace B1 read | B1 only |
| Invalid UUID context | transaction/query error; no fallback |
| Missing workspace scope | workspace-bound rows denied unless approved tenant-wide context |
| Suspended tenant at API/service layer | context resolution denied before DB call |
| Worker with stale route/version | rejected before side effect |

## Connection pooling and reuse

`backend/enterprise/tenantDataPlane.js` uses a `pg.Pool` and `withTenantTransaction`:

```text
BEGIN
set_config(..., true) for tenant/workspace/workspace scope/principal/policy/routing
callback SQL
COMMIT or ROLLBACK
RESET ALL
release
```

Create an **uncommitted staging-only** verifier if none exists. It must:

1. open a single `pg.Pool` using `TENANT_RUNTIME_DATABASE_URL`;
2. acquire/release the same physical client or demonstrate reuse through pool instrumentation;
3. run A1 transaction, commit, then query with no context (must return zero), then B1 transaction;
4. run concurrent A/B transactions through at least two pooled clients;
5. throw inside callback and prove `ROLLBACK` and `RESET ALL` happen;
6. force connection failure and verify poisoned client is discarded;
7. print only test IDs and result counts, never DSNs.

Suggested test file name if not already present:

```text
backend/enterprise-test/real-postgres-rls.integration.test.js
```

Gate it behind `RUN_REAL_POSTGRES_RLS_TESTS=true` and skip with an explicit message when absent; never make a CI suite silently pass when the flag was expected.

## Rollback

- Before applying migrations: restore the validation DB from backup/snapshot or drop only the named disposable database.
- In staging/production: use a reviewed forward migration or backup restore; never use an unreviewed `DROP SCHEMA tenant_data CASCADE`.
- If runtime behavior is wrong after enablement: set `ENTERPRISE_TENANCY_ENABLED=false`, stop tenant API traffic, preserve logs, restore the last known schema/role configuration, and rerun certified suites.

## Evidence

```text
PostgreSQL engine/version, target DB classification, role query output,
policy query output, grants/ownership output, migration output,
A/B matrix transcript, pool reuse transcript, concurrency transcript,
rollback transcript, operator/date/commit/config version.
```

---

# Phase 5 — Redis/shared-cache validation

## Repository contract

- Key format: `backend/enterprise/tenantCache.js`.
- Quota abstraction: `backend/enterprise/tenantQuota.js`.
- Current production-capable fallback: `FirestoreAtomicCounterStore` when server-side Firebase Admin is available.
- Local-only test fallback: `InMemoryAtomicCounterStore`.
- No Redis client adapter is currently shipped; do **not** claim Redis is integrated simply because Redis exists.

## Required infrastructure decision

Choose and document one of:

1. **Firestore atomic quota store** for moderate scale, with transaction throughput and cleanup evidence; or
2. **Redis** for shared cache/rate limits at higher scale, implemented behind `TenantQuotaGuard` without changing the tenant key contract.

If Redis is selected, create a reviewed `RedisAtomicCounterStore` with atomic `INCR`/expiry semantics, TLS/auth, timeouts, circuit behavior, and fail-closed behavior for cost/security-sensitive quota paths.

## Redis inventory commands

Run only with authorized endpoint/credentials supplied from a secret manager:

```bash
redis-cli --tls -u "$REDIS_VALIDATION_URL" INFO server
redis-cli --tls -u "$REDIS_VALIDATION_URL" INFO replication
redis-cli --tls -u "$REDIS_VALIDATION_URL" ACL WHOAMI
redis-cli --tls -u "$REDIS_VALIDATION_URL" CONFIG GET maxmemory
```

Do not paste URLs/passwords into evidence. Record version, topology, TLS, replication, persistence, eviction policy, role/account name, and region.

## Required test keys

Use generated Tenant A/B UUIDs and the actual helper/adapter. Validate that these differ:

```text
v1:tenant:{A}:workspace:{A1}:domain:resume:resource:X:revision:1
v1:tenant:{B}:workspace:{B1}:domain:resume:resource:X:revision:1
```

## Required tests

| Test | Action | PASS |
|---|---|---|
| Tenant collision | write same resource ID under A/B | distinct keys and values |
| Workspace collision | same tenant, A1/A2 | distinct keys |
| Principal collision | user/service-specific key | distinct where `subjectId` is used |
| TTL | set expiry, wait/query | key expires at expected window |
| Invalidation | update resource/version | old version not returned |
| Tenant switch | UI/API switches A→B | A private cache absent from B view |
| Suspension | suspend A | protected cache reads/refreshes fail closed |
| Deletion | remove A / invalidate prefix | no A keys/artifacts remain after retention policy |
| Noisy tenant | exhaust A quota | B quota remains available |
| Restart | restart Redis or failover replica | no cross-tenant key reinterpretation |
| Cache unavailable | stop/deny Redis | quota/security operation fails closed; no global fallback |
| Poisoning | manually attempt B key from A context | adapter rejects context/key mismatch or cannot address B key |

## Evidence

Capture redacted CLI output, key patterns with UUIDs masked if required, TTL output, invalidation output, application logs/metrics, and test commit SHA.

## Rollback

Snapshot Redis configuration before changes. Roll back adapter deployment with feature flag disabled; do not run broad `FLUSHALL` on shared environments. Delete only test keys using a unique validation prefix.

---

# Phase 6 — Queue, worker and DLQ validation

## Repository contract

| Code | Behavior |
|---|---|
| `backend/enterprise/tenantJobs.js` | HMAC-signed tenant job envelope with tenant, workspace, canonical principal, subject, issuer, resource, route/profiles, idempotency, correlation and expiry |
| `backend/services/notificationOutbox.js` | Firestore outbox, lease/retry/dead-letter states; stores optional tenant context |
| `backend/index.js` around notification worker startup | calls `processOutboxOnce` with `tenantService.authorizeOutboxEvent` |
| `backend/enterprise/tenantService.js#authorizeOutboxEvent` | re-resolves current Firebase subject membership/lifecycle/data-plane route; non-Firebase issuer currently fails closed |

Current implementation is a Firestore outbox plus optional process-local timer. A true enterprise deployment should choose a managed queue/worker/DLQ topology, while preserving the envelope and reauthorization contract.

## Required topology inventory

Record queue provider, queue names, tenant partition/priority policy, worker deployment/identity, retry schedule, lease/visibility timeout, max attempts, DLQ, replay authorization, metrics, alerting, region, and secret/credential reference.

## Envelope validation

A worker must reject jobs with any of these changes:

```text
tenantId, workspaceId, principalId, subjectId, identityIssuer,
dataPlaneId, routingVersion, cacheProfile, queueProfile,
storageProfile, aiProfile, resource, idempotencyKey, correlationId, signature
```

Use `backend/enterprise/tenantJobs.js#createTenantJobEnvelope` and `validateTenantJobEnvelope` as the canonical contract. Do not invent another envelope shape.

## Mandatory queue test matrix

| Scenario | Expected PASS result |
|---|---|
| Normal tenant job | worker executes after current context validation |
| Duplicate delivery | idempotency prevents duplicate side effect |
| Retry | same signed envelope is revalidated; no double bill/export/email |
| Worker restart | leased job is reclaimed safely after lease expiry |
| Tampered envelope | signature validation rejects before data access |
| Wrong tenant/workspace | route/context mismatch rejects |
| Stale membership | worker reauthorization rejects |
| Revoked membership | rejects |
| Suspended tenant | rejects |
| Route changed A shared→dedicated | old job rejects or is explicitly requeued through approved migration flow |
| Invalid issuer | fails closed |
| DLQ | terminal job contains sanitized metadata, no secret/prompt, and requires authorized replay |
| Replay | re-sign/re-authorize or reject; never blindly replay old context |

## Commands

Use provider-native tooling in staging. For Firestore outbox, query only validation documents and use a unique event prefix. Inspect `notification_outbox` state, `attemptCount`, `leaseOwner`, `leaseExpiresAt`, `nextAttemptAt`, `providerAccepted`, and `lastError`.

For a managed queue, use its staging CLI/dashboard to enqueue only known synthetic jobs. Never manually serialize a production job without using the canonical signing function.

## PASS / FAIL

- **PASS:** every worker side effect is preceded by current context validation and unauthorized jobs reach no provider/database/file side effect.
- **FAIL:** any job executes with stale/missing/tampered tenant context, a DLQ replay bypasses reauthorization, or dedicated jobs use shared worker/resource profile without an explicit approved route.

## Rollback

Pause consumers, preserve queue/DLQ evidence, disable enterprise feature flag, drain only validated synthetic jobs, and do not delete production queues until retention/incident requirements are met.

---

# Phase 7 — Object storage, KMS and file-security validation

## Repository contract

- Namespace: `backend/enterprise/tenantStorage.js`.
- Artifact claims/token: `backend/enterprise/tenantSignedArtifacts.js`.
- Signed artifacts require tenant/workspace plus data-plane ID/routing version/storage profile/purpose/expiry.
- Current certified PDF/DOCX behavior streams in-memory buffers from `backend/index.js`; no generic object-store adapter is deployed yet.

## Required provider integration

Select the actual provider (Firebase Storage, GCS, S3, Azure Blob, etc.) and implement the provider adapter **behind** the namespace/token contract. Do not allow clients to construct arbitrary bucket/key paths.

Required server-only configuration references to inventory:

```text
object storage endpoint/account reference
bucket/container name or profile reference
KMS/CMK reference
scanner/quarantine service reference
signed URL signer identity/reference
retention/lifecycle policy reference
```

## Required object metadata

Persist or derive:

```text
tenant_id, workspace_id, resource_type, resource_id,
artifact_id/version, classification, storage_profile,
data_plane_id, routing_version, KMS key reference,
scan_status, retention class, legal hold, checksum
```

## Mandatory tests

| Attack/test | PASS |
|---|---|
| A token requests B object | denied before provider URL is issued |
| A DB record references B key | namespace/context assertion fails |
| Expired token | denied |
| Modified tenant/workspace/object key | signature or context denial |
| Wrong purpose (`UPLOAD` vs `DOWNLOAD`) | denied |
| Wrong data-plane route/profile | denied |
| Upload malformed/malware sample in staging | quarantined; never parsed/rendered/AI-ingested |
| Scan failure | fail closed |
| KMS key disabled | operation fails safely/audit emitted |
| Tenant suspend | new URLs/operations denied |
| Tenant delete | retention workflow deletes/marks all versions/derived artifacts according to policy |
| Download authorization | server rechecks membership for high-risk/private artifacts |

## Provider checks

- Buckets/containers are private; no wildcard public read for tenant artifacts.
- Bucket policy prevents path traversal and direct cross-tenant prefixes.
- CORS permits only approved origins/methods/headers.
- KMS key policy excludes application browser identities.
- Scanner/quarantine identity has least privilege; renderer/AI never reads unscanned upload originals.
- Object lifecycle/preservation supports legal holds and restore requirements.

## Evidence / rollback

Capture IAM policy export/redacted, bucket policy, KMS key ID/reference, scan result, URL claim test output, audit event, and deletion test output. Roll back provider policy from exported prior version; revoke signer/key rather than trying to invalidate arbitrary public URLs.

---

# Phase 8 — Firebase real-environment validation

## Repository integration

| Item | Path |
|---|---|
| Client Firebase config | `src/conf/fire.js` |
| Firebase Admin initialization | `backend/index.js`, `backend/services/firebaseAdmin.js` |
| Firestore rules | `SecurityRules.txt` |
| RTDB rules | `Realtime_database_Security_rules.txt` |
| Firebase config/emulators | `firebase.json` |
| Firestore indexes | `firestore.indexes.json` |
| Legacy data access | `src/firestore/dbOperations.js`, `src/services/resumePersistence.js` |
| Enterprise Firestore bridge | `backend/enterprise/tenantRegistry.js`, stores/services listed in Phase 3 |

## Required access

- Firebase Console/Google Cloud project viewer + deploy rights appropriate to staging first;
- Firebase CLI authenticated account or CI service identity;
- IAM viewer for service account roles;
- staging project separate from production;
- permission to run emulators with Java installed.

## Inventory and deployed-state commands

```bash
firebase projects:list
firebase use --add                     # choose staging, never production first
firebase apps:list
firebase target
firebase firestore:indexes > /tmp/deployed-indexes.json 2>/dev/null || true
firebase --version
java -version
```

Use Google Cloud console/CLI to record project number/ID, region, authorized domains, Identity Platform providers, MFA/TOTP, API key restrictions, service account roles, and Secret Manager references. Do not export secret values.

## Rule and index validation

```bash
npm run test:firebase-rules
# Equivalent alias:
npm run test:firestore

# Deploy only to staging after emulator PASS and review:
firebase deploy --project "$FIREBASE_STAGING_PROJECT_ID" \
  --only firestore:rules,firestore:indexes,database
```

Before production deployment, export or screenshot currently deployed rules/indexes, record SHA, and create a rollback command using the last known reviewed artifact. Do not deploy rules from an unclean tree.

## Legacy User A/User B matrix

Using two disposable Firebase Auth users and emulator/staging data:

| Action | Expected |
|---|---|
| A reads `users/B/resumes/*` | deny |
| A writes/deletes `users/B/resumes/*` | deny |
| A reads/writes B covers/coverLetters | deny |
| A reads/writes B private portfolios/job tracker/favorites | deny |
| A reads B notifications | deny |
| A reads B payment/subscription/invoice/order records | deny |
| A reads B non-public `pb` resume | deny |
| A reads only explicitly published public resume/portfolio | allowed only as intended |
| A reaches `enterprise_*` collections directly | deny; Firebase Admin server-only bridge is the only access path |

Run actual browser and SDK checks after emulator tests. For each denied request preserve the Firebase error code, authenticated UID, document path pattern, rule deployment version, and test timestamp.

## Enterprise compatibility checks

- Enabling `ENTERPRISE_TENANCY_ENABLED` must not change a certified legacy UID path unless a deliberate adapter route is used.
- `backend/index.js` rejects tenant/workspace headers on legacy `/api/*` routes while enterprise mode is enabled; validate this behavior with a bearer-authenticated staging request.
- Verify server Firestore Admin identity has only necessary access and browser clients cannot read `enterprise_principal_tenants`, `enterprise_tenants`, `enterprise_memberships`, `enterprise_api_keys`, `enterprise_support_grants`, `enterprise_audit_events`, or `enterprise_quota_buckets`.

## Rollback

Disable the server/client enterprise flags first. Restore the previously exported rules/indexes only after verifying source/tag. Do not delete legacy user documents or enterprise bridge documents during a rules rollback investigation.

---

# Phase 9 — Migration runbook

## Mandatory deliverable before any production copy

Create:

```text
docs/ENTERPRISE_DATA_MIGRATION_MANIFEST.md
```

Use one row per collection/resource category:

| Source | Source path/query | Current owner field/path | Target table/aggregate | Tenant rule | Workspace rule | Transform | Checksum | Dependencies | Ambiguity | Rollback | Pilot status |
|---|---|---|---|---|---|---|---|---|---|---|---|

## Repository-specific source classification

| Source type | Current evidence | Target decision |
|---|---|---|
| `users/{uid}/resumes/{resumeId}` and nested sections | UID path owner | personal tenant/default workspace until explicit transfer |
| `users/{uid}/covers`, `coverLetters` | UID path owner | personal tenant/default workspace |
| `users/{uid}/jobTracker`, favorites, private portfolios | UID path owner | personal tenant/default workspace |
| `pb/{resumeId}` | `ownerUid`, explicit public mode | projection follows source only after owner/source match |
| root/user portfolio duplicates | `userId` plus private copy | reconcile before target cutover |
| companies/jobs | `employerId` person, not tenant | **QUARANTINE** until explicit tenant owner mapping |
| job applications | applicant UID + job relation | assign only after job tenant is deterministic |
| RTDB conversations/messages | participants/application relationship | **QUARANTINE/legacy archive** until tenant relation is deterministic |
| AI browser history/recovery | UID/browser local state | personal/local; never bulk-upload to business tenant |
| payments/invoices/orders/transactions | UID/userId/legal retention | control-plane/legal mapping; no blind tenant reclassification |
| CMS/settings/coupons/reviews/ads | platform global | remain platform control plane unless product explicitly changes |

## Procedure

### 1. Dry run

- Export only metadata/counts/checksums from a **staging clone** or a sampled production read-only snapshot.
- Use `backend/enterprise/firebaseBridge.js`, `firebaseMigrationAdapter.js`, and `reconcileCollection()` semantics as canonical logic.
- Generate a manifest row for every planned record; rows with `BLOCKED_OWNERSHIP` must not be copied.

### 2. Pilot

Choose 2–5 synthetic/pilot personal tenants with written owner consent and no legal hold. Do not select a high-value customer first.

For each aggregate:

```text
source revision + source checksum
→ copy into target tenant/workspace
→ target legacyDocumentId mapping
→ target checksum
→ relationship validation
→ authorization validation
→ UI/export validation
→ shadow read comparison
→ cutover flag only after all pass
```

### 3. Reconciliation

Run collection-level reconciliation and preserve:

```text
sourceCount, targetCount, duplicateSource, duplicateTarget,
missingTarget, unexpectedTarget, checksumMismatches,
source revision, target revision, tenant/workspace mapping,
operator/date/commit/config version
```

### 4. Authorization and product checks

For each migrated pilot resume/CV/cover:

- owner can read/edit in intended personal tenant;
- non-owner and other tenant cannot read/edit;
- selected template renders correctly;
- PDF print/export and DOCX export preserve data/template;
- public projection status is preserved/revocable;
- old Firebase source remains intact during rollback window.

### 5. Rollback

Before target is source of truth: disable cutover flag and return reads/writes to Firebase source. Do not delete target or source until reconciliation and retention policy allow it.

After target cutover: use a recorded forward-repair/inverse migration. Never overwrite Firebase blindly with stale target data.

## PASS / FAIL

- **PASS:** all rows deterministic; no blocked row silently copied; counts/checksums/relations/permissions/export checks match; rollback proves source remains usable.
- **FAIL:** ambiguous owner, duplicate, mismatch, missing relationship, unauthorized read, broken template/export, or untested rollback.

---

# Phase 10 — OIDC, SAML, SSO, MFA and SCIM runbook

## Current repository reality

Existing Firebase/Auth flows remain the compatibility path. The tenant implementation distinguishes an external identity issuer + subject from canonical PostgreSQL principal. It does **not** contain a secure custom SAML parser or a production SCIM adapter. Use a managed IdP/Identity Platform integration; do not write ad hoc SAML XML parsing.

## Provider-neutral prerequisites

- approved IdP tenant/application;
- OIDC issuer/discovery URL **or** SAML metadata URL/entity ID;
- client ID and secret/certificate held in secret manager;
- redirect URIs/ACS URLs approved for staging and production;
- issuer/audience/signing key rotation policy;
- SCIM base URL/token/service account where applicable;
- group-to-role mapping policy;
- break-glass Firebase account policy;
- MFA and session lifetime policy;
- domain verification and user lifecycle owner.

## Required configuration model

Tenant configuration supports `identityPolicy` in `backend/enterprise/tenantRegistry.js`:

```text
ssoMode: NONE | OIDC | SAML
scimEnabled: true | false
sessionMaxMinutes: 15..10080
```

This is policy metadata only. The local developer must add/configure the actual provider adapter and secret references before claiming SSO/SCIM is implemented.

## Lifecycle matrix

| Test | Expected PASS |
|---|---|
| Firebase existing user login | continues to work unchanged |
| OIDC create user | issuer+subject resolves to one canonical principal |
| SAML create user | same issuer+subject rule; no email-only merge |
| Provision user via SCIM | active membership/role/workspace assigned only from approved mapping |
| Disable user in IdP | sessions revoked; API/tenant access denied |
| Remove tenant membership | next context resolution denied; queued work reauthorization denied |
| Change role | old permission removed; UI and API agree after token/session policy refresh |
| Group mapping | only allowlisted group IDs map to roles; no free-form group privilege escalation |
| MFA challenge | sensitive operation honors MFA/recent auth policy |
| Logout/revocation | refresh/session/token behavior matches policy across instances |

## Evidence

Capture redacted IdP configuration screenshots/exports, issuer/audience, mapping manifest, test user IDs, lifecycle timestamps, login/logout/revocation logs, and audit events. Never store SAML certificates, client secrets, SCIM bearer tokens, or JWTs in Git/evidence.

---

# Phase 11 — Service account / M2M runbook

## Code paths

```text
backend/enterprise/serviceIdentity.js
backend/enterprise/serviceAccountStore.js
backend/enterprise/tenantService.js#createServiceAccount
backend/enterprise/tenantService.js#authenticateServiceApiKey
backend/routes/enterprise.js POST /service-accounts
backend/routes/enterpriseM2m.js GET /context
```

## Safe staging procedure

1. Enable server enterprise feature flag in staging only.
2. Create a test tenant/workspace using an authorized tenant owner.
3. Call `POST /api/enterprise/service-accounts` with scopes from `backend/enterprise/constants.js` only, for example `resource.read`, `ai.use`.
4. Record the plaintext key only in a protected ephemeral terminal/secret vault. It is expected exactly once; do not paste it into shell history, ticket comments, browser console, or Git.
5. Use `X-API-Key` with `GET /api/enterprise/m2m/context` and matching `X-Tenant-Id`/`X-Workspace-Id`.

## Mandatory matrix

| Test | Expected PASS |
|---|---|
| valid key / tenant / workspace / scope | returns service context only for bound scope |
| modified key | 401 |
| expired key | 401 |
| revoked key | 401 |
| wrong tenant header | 404/non-enumerating denial |
| wrong workspace header | 404/non-enumerating denial |
| unknown scope at creation | validation failure |
| M2M key attempts browser-only endpoint | denied unless route explicitly supports M2M context/policy |
| Service A/Tenant A accesses B | denied by bound tenant/context |
| key rotation | old key revoked, new key works, audit entries exist |

## Evidence

Store only key ID/prefix/hash reference, account ID, tenant/workspace, scope, expiry, response status, and audit event. Never store plaintext key after its one-time display.

## Rollback

Revoke the key in the store, disable the account, invalidate any associated session/token cache, and verify M2M context returns 401. Do not delete audit records.

---

# Phase 12 — Support / break-glass runbook

## Code paths

```text
backend/enterprise/supportAccessStore.js
backend/enterprise/tenantService.js#createSupportGrant
backend/enterprise/tenantService.js#resolveSupportContext
backend/enterprise/tenantService.js#revokeSupportGrant
backend/routes/enterprise.js /support-grants and /support/context
```

## Required controls

A support grant requires:

```text
tenant, workspace, support identity, requester identity,
reason (10–500 chars), recognized scopes, 5–480 minute expiry, ACTIVE status
```

No valid grant means no support context. A support grant is not a normal tenant membership and must not become a global support bypass.

## Test matrix

| Test | Expected PASS |
|---|---|
| no grant | 403 |
| valid grant | only grant scope and tenant/workspace context returned |
| wrong support subject | 403 |
| wrong tenant/workspace | 403 |
| expired grant | 403 |
| revoked grant | 403 |
| modified grant ID | 403/404 according policy, no tenant detail leak |
| support role absent | 403 even with copied grant ID |
| tenant suspended | 403 |
| grant audit | requester, reason, scope, expiry, tenant/workspace, result recorded |

## Rollback

Use the revoke endpoint/store operation first. Verify denial. Preserve audit evidence. Do not remove grant records without retention/legal review.

---

# Phase 13 — AI production isolation runbook

## Code paths to preserve

```text
Legacy/certified:
  backend/routes/ai.js
  backend/services/aiRuntime.js
  src/services/aiService.js
  src/components/Dashboard/DashboardInterviews/DashboardInterviews.jsx
  src/utils/interviewCoach.js

Enterprise:
  backend/enterprise/tenantAi.js
  backend/routes/enterprise.js POST /ai/generate-content
  backend/enterprise/tenantRepository.js#recordTenantAiUsage
  backend/enterprise/tenantQuota.js
```

## Required policy checks

- Empty `allowedProviders` in tenant `aiPolicy` = **DENY**.
- Provider/model/failover candidates must all satisfy the tenant allowlist and region/data-processing policy.
- No client `tenantId`, `workspaceId`, `resourceId`, `uid`, vector namespace, owner ID, or provider credential is accepted as authority.
- Current enterprise route rejects client `sources`; future source retrieval must be server-loaded from authorized resources.
- Tenant AI must fail closed if quota coordination or RLS usage ledger is unavailable.

## Real provider validation

For every configured provider record only provider/model/result/latency/status; do not log prompt contents, API keys, bearer tokens, or customer resumes.

Test per tenant:

| Test | Expected PASS |
|---|---|
| empty allowlist | deny before provider call |
| allowlisted primary | request succeeds only with policy-approved provider/model |
| primary failover | fallback stays within same tenant policy/profile/region |
| provider disabled in tenant | deny; does not use global fallback |
| quota exhausted A | A denied; B unaffected |
| prompt with forged IDs | 400 before provider call |
| Tenant A source requested in B | 404/deny before provider call |
| AI job with stale membership | worker reauthorization denies |
| cache key collision | A/B result never reused |
| vector/RAG query | physical/logical tenant/workspace filter mandatory; B never returned |
| memory/history | tenant/workspace/principal/expiry bound; no cross-context history |

## RAG/vector prerequisites

Current repository has no deployed RAG/vector provider. Before enabling it, document provider/index/collection/region/encryption key and implement server-side namespace selection. The client must never submit a namespace as authority. Dedicated tenant vector/index route must match the same `tenantRouting` data-plane profile as database/storage/queue.

## Evidence

Preserve provider test matrix, tenant policy revision, provider/model, token/cost metadata, quota result, route/profile, sanitized request ID/correlation ID, and failure outputs. Preserve no prompt bodies by default.

---

# Phase 14 — Cloudflare, WAF and edge runbook

## Repository integration

- Apache proxy/header baseline: `.htaccess`, `public/.htaccess`, `api/index.php`.
- Server CORS/CSP/Helmet: `backend/index.js`.
- Health endpoints: `/healthz`, `/readyz`, `/api/health`, `/api/readyz`.
- Enterprise headers: `X-Tenant-Id`, `X-Workspace-Id`, `X-API-Key`, `X-Support-Grant-Id` are allowed only through exact CORS origins.

## Safe inventory before changes

Export/screenshot existing Cloudflare configuration:

```text
DNS records, SSL/TLS mode, Origin Rules, Cache Rules, WAF custom rules,
Rate Limiting Rules, Bot rules, Workers/routes, Page Rules, Transform Rules,
Access policies, API Shield, firewall events, origin IP allowlist
```

## Required verification

```bash
# Replace with actual authorized staging hostname.
HOST="https://staging.example.invalid"
curl -sS -D /tmp/headers.txt -o /dev/null "$HOST/"
curl -sS -D /tmp/health.txt -o /tmp/health.json "$HOST/api/health"
curl -sS -D /tmp/ready.txt -o /tmp/ready.json "$HOST/api/readyz"
```

Check:

- HTTPS redirect and valid origin certificate;
- HSTS only after HTTPS is stable;
- TLS mode is Full (strict) or equivalent, never flexible;
- origin port/private network cannot be reached directly from public Internet;
- Cloudflare cache bypasses `/api/*`, authenticated HTML, private export routes, and one-time tokens;
- no `Cache-Control: public` for tenant/private responses;
- WAF/rate limits do not break Firebase/OAuth/payments/exports but protect abusive paths;
- CSP from `.htaccess` is actually present at the edge and report-only changes are tested before enforcement;
- CORS allows only `CORS_ALLOWED_ORIGINS`, not wildcard reflected origins;
- enterprise headers work from approved same-origin client and do not permit a foreign Origin.

## Adversarial checks

```bash
curl -i -H 'Origin: https://evil.example' \
  -H 'Access-Control-Request-Method: GET' \
  -H 'Access-Control-Request-Headers: X-Tenant-Id,X-API-Key' \
  -X OPTIONS "$HOST/api/enterprise/status"
```

Expected: no unauthorized `Access-Control-Allow-Origin` grant.

Test private API cache behavior with two authenticated accounts/tenants and browser DevTools: response must not be a public edge cache hit, and switching tenants must not show prior response payload.

## Rollback

Use exported Cloudflare configuration/rule version. Disable only the changed staging rule; do not change DNS, SSL mode, origin firewall, or broad cache rule without recorded rollback action and observed health checks.

---

# Phase 15 — Secrets and IAM runbook

## Required secret/config name checklist

Repository-known names:

```text
TENANT_DATABASE_URL
TENANT_JOB_SIGNING_SECRET
ENTERPRISE_TENANCY_ENABLED
VITE_ENTERPRISE_TENANCY_ENABLED
FIREBASE_PROJECT_ID
FIREBASE_DATABASE_URL
FIREBASE_USE_ADC
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
CORS_ALLOWED_ORIGINS
TRUST_PROXY_HOPS
GEMINI_API_KEY / NVIDIA_API_KEY / OPENAI_API_KEY / GROQ_API_KEY /
OPENROUTER_API_KEY / DEEPSEEK_API_KEY
STRIPE_SECRET / STRIPE_WEBHOOK_SECRET
SMTP_* / TWILIO_*
```

Additional infrastructure names to inventory, not necessarily current repository variables:

```text
PostgreSQL runtime/migrator/worker/DBA secret references
Redis validation/runtime secret reference
queue worker credential reference
object storage signer/scanner/KMS key references
IdP OIDC/SAML/SCIM secret references
Cloudflare token reference
CI deployment identity reference
central logging/tracing/SIEM credential references
```

## Audit procedure

1. Search Git and build artifacts:

```bash
git grep -nEi '(password|secret|api[_-]?key|private[_-]?key|token)\s*[:=]\s*[^$[:space:]][^[:space:]]{8,}' -- ':!package-lock.json' ':!backend/package-lock.json'
npm run test:security
npm audit --omit=dev --audit-level=high
npm --prefix backend audit --omit=dev --audit-level=high
```

2. Inspect deployed environment variable names through the secret manager/process manager without printing values.
3. Verify browser production bundle does not contain provider secrets using the existing security suite and manual grep of built `dist/assets` only for known secret prefixes, never actual values.
4. Verify IAM least privilege: runtime cannot administer PostgreSQL roles, bypass RLS, decrypt unrelated KMS keys, read all tenant storage, alter Cloudflare, or deploy CI.
5. Verify rotation/revocation runbook exists for every secret.

## PASS / FAIL

- **PASS:** only secret references/names are documented, all runtime identities have least privilege, no secret in Git/browser/logs, rotation path tested.
- **FAIL:** plaintext secret appears in source/logs/client/command history, broad owner/BYPASSRLS role is app runtime, or staging/prod environment is mixed.

---

# Phase 16 — Observability runbook

## Code fields to preserve

`tenantContextAuditProjection()` in `backend/enterprise/tenantContext.js` and `buildTenantTelemetry()` in `backend/enterprise/tenantTelemetry.js` define the canonical context fields:

```text
tenantId, workspaceId, principalId, subjectId, identityIssuer,
actorType, supportGrantId, requestId, correlationId,
policyVersion, dataPlaneId, dataPlaneType, routingVersion
```

Do not add raw resume contents, raw AI prompts, API keys, bearer tokens, full object URLs, or provider credentials to broad logs/metrics.

## Required deployment checks

- Structured Node/API logs include request/correlation ID and safe tenant context where policy allows.
- Central log sink access is role-controlled and retention documented.
- Metrics use `tenantMetricLabels()` style low-cardinality labels; do not emit raw tenant IDs as high-cardinality labels by default.
- Traces propagate request/correlation IDs through API, worker, PostgreSQL, storage, and AI provider adapters.
- Audit events are append-only/retention-protected according to policy.
- Dashboards/alerts cover API health, DB pool, RLS errors, quota limits, queue age/DLQ, worker failures, storage scan failures, AI providers, support grants, M2M failures, tenant suspension and migration reconciliation.

## Validation

Execute one synthetic operation per tenant A/B and trace it through API → audit/log → database → worker/provider. Verify:

```text
same correlation ID across related events
correct tenant/workspace/principal
no cross-tenant event data
no secrets or prompt bodies
support grant ID only on support flows
```

---

# Phase 17 — Backup, restore and disaster recovery runbook

## Prerequisites

- Approved RPO/RTO by product/security/legal.
- Isolated restore environment.
- Encrypted backups for PostgreSQL, Firestore, RTDB, object storage, configuration/secret references, and queue/audit data as applicable.
- Written data retention/legal-hold policy.

## Actual drill

Never label a backup verified until it is restored.

1. Record baseline object counts/checksums/config revisions for a synthetic Tenant A.
2. Trigger or identify a recent encrypted backup/PITR point.
3. Restore to isolated database/bucket/project; do not overwrite production.
4. Restore tenant A data, artifact metadata/files, tenant configuration, memberships, and required queue/audit records according to policy.
5. Run tenant A context/RLS/access tests against restored environment.
6. Verify Tenant B is absent/unaffected.
7. Measure start/end times for RPO/RTO.
8. Record mismatches and fix backup scope before considering DR verified.

## Required matrices

| Drill | PASS |
|---|---|
| PostgreSQL full restore | schemas, roles/policies/data valid in isolated target |
| tenant-specific restore | A restores, B absent/unaffected |
| dedicated tenant restore | correct dedicated route/profile/key/region restored |
| object/file restore | metadata/key/checksum/authorization match database |
| Firebase restore | UID data/rules/indexes/RTDB behavior validated |
| config/secret restore | references restore, values remain secret-managed |
| migration rollback | source/Firebase data remains usable during configured window |

## Rollback

The restore drill itself is isolated. If a production restore is needed, invoke approved incident process, freeze destructive writes, preserve audit trail, and use tested RPO/RTO procedure.

---

# Phase 18 — Load and performance runbook

## Local contract versus real evidence

The repository has a logical 1,000-tenant namespace test only. It is **not** production load evidence.

## Scenarios

| Scenario | Suggested starting target |
|---|---|
| Normal traffic | 10 tenants × 5 concurrent users; context/list/resource paths |
| Tenant switching | 100 switches/minute across A/B with cache invalidation verification |
| Large tenant | 1 tenant with high membership/resource/page queries |
| Noisy tenant | AI/export/queue quota exhaustion while B stays healthy |
| AI-heavy | quota boundary, provider latency/failover, ledger writes |
| Export-heavy | PDF/DOCX concurrency and browser worker saturation |
| Queue-heavy | retry/DLQ queue age and worker throughput |
| DB-heavy | concurrent A/B RLS transactions and pool saturation |
| Cache-heavy | TTL/invalidation/restart/eviction behavior |

## Tooling

Use an approved tool such as k6, Artillery, Locust, JMeter, or cloud load test. Keep test credentials synthetic and scoped to staging. Never point intrusive load at production without capacity approval.

## Capture

```text
p50/p95/p99 latency, throughput, error rate,
CPU/memory, Node event-loop delay, DB connections/locks/CPU,
Redis ops/latency/evictions, queue age/DLQ, worker utilization,
storage latency/errors, AI provider latency/error/failover/cost
```

Define accepted thresholds from the actual deployed capacity and SLOs before calling PASS. Do not invent latency/SLO evidence in a report.

---

# Phase 19 — Chaos and failure runbook

Run only in staging with synthetic tenants.

| Failure injection | Expected PASS |
|---|---|
| PostgreSQL connection interruption | requests fail safely; no tenant fallback; pool recovers after dependency returns |
| Redis interruption | quota/cache operation follows documented fail-closed/fallback policy; no cross-tenant cache reuse |
| Queue interruption | jobs retained/retried/DLQ; no duplicate unauthorized side effect |
| Worker restart | leases/retries/idempotency/reauthorization correct |
| Storage interruption | no fake successful export/upload; correct error/audit |
| KMS/key failure | encrypted operations denied safely |
| AI primary outage | only tenant-approved fallback provider is used |
| AI all provider outage | safe error; no fabricated result/cross-tenant cache |
| Network latency/timeouts | cancellation/retry/error categories remain correct |
| Dedicated route failure | no silent shared fallback; explicit tenant-route incident |

Record injected fault, time, tenant, expected/actual result, recovery time, logs/metrics, and rollback.

---

# Phase 20 — Browser, UX and accessibility runbook

## Browsers/devices

At minimum test current Chrome, Edge, Firefox, and Safari where available on desktop; Chrome/Safari mobile emulation or physical devices for tablet/mobile.

## Required journeys

1. Existing personal user login → Resume → CV → PDF/DOCX → Interview Coach → logout.
2. Enterprise owner: tenant switch, workspace switch, members, teams, config, service account, support grant, audit, suspend/reactivate.
3. Enterprise member: only permitted nav/actions, denied action explanation, workspace list scope.
4. Service/M2M: context result only in authorized scope.
5. Support user: no grant, valid grant, expired/revoked/wrong-tenant grant.
6. Tenant A/B account switching in same browser, separate tabs, and after logout.

## WCAG 2.2 AA checks

| Area | Verification |
|---|---|
| Keyboard | Tab/Shift+Tab, Enter, Escape, arrows in tenant/workspace switchers and command palette |
| Focus | visible focus, dialog trap/return focus, route transition focus |
| Semantics | landmarks, labels, captions, status/alert roles, table headers |
| Contrast | inspect tokens with automated tool and manual sample |
| Motion | `prefers-reduced-motion` state |
| Forms | labels, errors, required state, server error mapping |
| Tables | header/caption, sorting/filter controls, responsive overflow alternative |
| Screen reader | VoiceOver/NVDA/JAWS sample of switcher, command palette, audit/member tables, error states |
| Responsive | 320px/mobile, tablet, desktop; no hidden tenant context |

Capture screenshots/video and browser/version. Fix defects, rerun `tests/enterprise-ui.test.mjs`, `npm run build`, and affected certified UI tests.

---

# Phase 21 — Authorized DAST/security runbook

## Safety boundary

Run intrusive scans only against an approved staging environment with synthetic tenant data and written authorization. Do not point fuzzers/scanners at production without explicit approval.

## Test scope

```text
authentication, OIDC/SAML callbacks, MFA/session lifecycle,
IDOR/BOLA, tenant/workspace/header tampering, role escalation,
M2M/API key, support grants, cache poisoning, queue/job tampering,
artifact/token access, RLS bypass, AI context/RAG/cache, secret exposure,
CORS/CSP/WAF/rate limit and legacy API behavior
```

## Tools

Use approved tooling such as OWASP ZAP/Burp Enterprise/Nuclei/custom integration tests. Preserve scanner configuration, target URL, commit/config version, findings, remediation and retest. Do not upload proprietary data to third-party scanners unless approved.

## PASS / FAIL

- **PASS:** no Critical/High unresolved finding; all cross-tenant attack attempts deny/fail closed; no secret exposure.
- **FAIL:** any cross-tenant data, auth bypass, RLS bypass, raw key/token, unauthorized support/M2M, or unsafe fallback. Fix before moving forward; rerun `test:security`, `test:enterprise`, and relevant regression suites.

---

# Phase 22 — Final Tenant A/B adversarial matrix

## Fixture

Create synthetic:

```text
Tenant A: Owner A, Admin A, Manager A, Member A, Service Account A
Tenant B: Owner B, Admin B, Manager B, Member B, Service Account B
Workspace A1/A2 and B1/B2
Support user S with no grant, valid A1 grant, expired grant, revoked grant
```

## Matrix

| Path | Attack | Expected |
|---|---|---|
| API | A modifies B tenant/workspace/resource IDs | deny/non-enumerating response |
| Database | A context queries B row | RLS zero rows/denied |
| Database | A changes `tenant_id`/workspace | `WITH CHECK` deny |
| Pool | A transaction then B/no-context same pooled client | no data/context bleed |
| Cache | A/B same resource ID | different namespace/value |
| Queue | change signed job tenant/workspace/route/profile | signature/context denial |
| Queue | stale/revoked/suspended membership | reauthorization denial |
| Storage | A token/B object or changed profile | denial |
| AI | A payload references B context/source/vector namespace | input/source denial |
| AI failover | primary outage | only tenant-approved fallback; no B context |
| Audit | A asks B audit route | denial |
| M2M | Service A key with B header | deny |
| Support | no/wrong/expired/revoked grant | deny |
| Legacy API | tenant header on legacy UID route | explicit unsupported-context error |
| UI | A browser switches to B | backend context determines visible data; no stale cache |
| Dedicated | alter route/shared profile | route mismatch/fail closed |

Record every request ID, actor, tenant/workspace, expected/actual status, data presence/absence, evidence path, and retest after remediation.

---

# Phase 23 — Whole-system conflict audit

Perform after real infrastructure integration and again after any major fix. Review as if you did not build the system.

## Required comparison pairs

```text
Firebase subject ↔ issuer ↔ canonical principal
principal ↔ membership ↔ role ↔ workspace membership
API context ↔ SQL set_config ↔ RLS row
API context ↔ cache key/profile
API context ↔ job envelope/worker reauthorization
API context ↔ object namespace/artifact claim
API context ↔ AI policy/provider/cache/RAG/vector
registry route ↔ DB/cache/queue/storage/AI route
UI displayed scope ↔ backend returned scope ↔ permitted action
legacy UID path ↔ personal tenant bridge ↔ migration ledger
support grant ↔ support actor ↔ scope/expiry/audit
M2M key ↔ service account ↔ scope/tenant/workspace
```

## Required output

Append to `docs/ENTERPRISE_INFRASTRUCTURE_VERIFICATION_REPORT.md`:

```text
CONFLICT AUDIT
commit/config/environment
systems compared
result
conflicts found
fixes
retest evidence
remaining uncertainty
```

Any source-of-truth disagreement is a release blocker until documented, fixed, or intentionally quarantined.

---

# Phase 24 — Logical-error and bug hunt

Review all relevant paths for:

```text
null/undefined handling, UUID validation, issuer/subject collision,
missing context, stale contexts, pool reset, transaction rollback,
role downgrade, membership revoke, suspension, route changes,
cache expiry, queue replay, artifact expiry, migration partial failure,
AI fallback/provider outage, browser switch/race, UI/backend mismatch,
configuration precedence, secret exposure, status-code information leaks
```

For every defect:

```text
reproduce with synthetic fixture
→ write focused regression test
→ fix smallest safe unit
→ run focused test
→ run test:enterprise + relevant certified suite
→ record in evidence report
```

Never weaken test assertions, RLS, permission checks, or tenant validation merely to make a test pass.

---

# Phase 25 — Certified product regression

After every infrastructure-facing change and at release end, run:

```bash
npm run test:interview
npm run test:security
npm run test:product
npm run build
npm run audit:production
```

Additionally perform browser/visual/export checks:

```bash
npm run test:templates
npm run test:templates:visual      # when required tooling/evidence is available
npm run test:portfolio
npm run test:interview:browser     # staging/browser environment
```

Manually verify in staging:

```text
4 CV templates: preview, print, download
51 resume templates: selection, render, multi-page, no duplicate layout
DOCX: template mapping, empty sections, download/open in Word/LibreOffice
Resume wizard: save/recovery, experience calculation, recommendations
Interview Coach: AI generation, CBT, timer, anti-tab, reports/history
AI: provider selection/failover/hardening/zero-leakage
```

Do not re-host these modules inside enterprise scope until their adapter/migration contract passes the same checks.

---

# Phase 26 — Final full regression command index

Run **after the final real fixes**, not from earlier output:

```bash
# Install exact dependencies
npm ci --ignore-scripts
npm --prefix backend ci --ignore-scripts

# Local/certified suites
npm run test:interview
npm run test:security
npm run test:product
npm run test:enterprise
npm run build
npm run lint
npm audit --omit=dev --audit-level=high
npm --prefix backend audit --omit=dev --audit-level=high

# Firebase when Java/emulators are available
npm run test:firebase-rules

# Optional product/browser/visual suites when environment permits
npm run test:templates
npm run test:templates:visual
npm run test:portfolio
npm run test:interview:browser
```

External test commands/scripts created by the local developer must be added to the evidence package with exact environment and commit SHA. Do not call an unrun command PASS.

---

# Phase 27 — Evidence package

Create and update:

```text
docs/ENTERPRISE_INFRASTRUCTURE_INVENTORY.md
docs/ENTERPRISE_CODE_INFRA_MAPPING.md
docs/ENTERPRISE_DATA_MIGRATION_MANIFEST.md
docs/ENTERPRISE_INFRASTRUCTURE_VERIFICATION_REPORT.md
docs/ENTERPRISE_10_10_CERTIFICATION_REPORT.md
```

Use this row format in the verification report:

| Test | Environment | Date | Commit SHA | Configuration version | Result | Evidence location | Issues found | Fix | Retest result |
|---|---|---|---|---|---|---|---|---|---|

Allowed evidence locations: approved ticket IDs, internal run IDs, redacted artifact paths, dashboard links, sanitized logs, screenshots, test output file checksums. Never include secret values, DSNs, API keys, tokens, user PII, or private resume content.

---

# Phase 28 — Final certification decision

## Conditions for `enterprise-10-10-certified`

Create this tag only when all are **evidence-backed**:

- real PostgreSQL version/roles/forced RLS/pool reuse/concurrency verified;
- real shared cache/quota behavior verified;
- real queue/worker/DLQ/replay verification passed;
- real storage/KMS/scanning/artifact authorization passed;
- real tenant routing shared/dedicated consistency passed;
- Firebase deployed rules/IAM/indexes/legacy isolation verified;
- identity/SSO/SCIM/MFA/session lifecycle verified where product claims it;
- support/M2M production behaviors verified;
- migration pilot/reconciliation/rollback verified;
- backup/restore/DR drill meets approved RPO/RTO;
- Cloudflare/WAF/TLS/CORS/private-cache behavior verified;
- browser UX/accessibility evidence supports WCAG target;
- load/chaos/failure recovery evidence passed;
- DAST and required independent penetration evidence complete;
- Tenant A/B adversarial matrix fully passes;
- whole-system conflict and logical-error audit pass;
- final certified suites are green;
- no known Critical/High security or tenant-isolation issue remains.

Then:

```bash
FINAL_SHA="$(git rev-parse HEAD)"
git tag -a enterprise-10-10-certified "$FINAL_SHA" \
  -m "Evidence-backed enterprise 10/10 certification; see docs/ENTERPRISE_INFRASTRUCTURE_VERIFICATION_REPORT.md"
```

Create a detached worktree at the tag, run `npm ci`, backend `npm ci`, all final regression commands, and record the outputs.

## Conditions for `enterprise-production-ready-candidate`

Use this tag instead when local/staging implementation is strong but any material external evidence remains unavailable, including:

```text
independent penetration test unverified
real PostgreSQL/pool/RLS not proven
backup restore not drilled
real migration not reconciled
load/chaos not run
identity provider not validated
storage/queue/cache not verified
production edge/IAM state unknown
```

This tag must state the exact outstanding evidence in its annotation and certification report. Never use `enterprise-10-10-certified` as a placeholder.

---

# Phase 29 — Final restore point procedure

1. Confirm clean tree and remote SHA.
2. Confirm all final evidence files are committed.
3. Create the appropriate tag from Phase 28 without overwriting a tag.
4. Verify with a detached worktree:

```bash
TAG="enterprise-10-10-certified"  # or enterprise-production-ready-candidate
VERIFY_DIR="$(mktemp -d -t resumepilot-final-XXXXXX)"
git worktree add --detach "$VERIFY_DIR" "$TAG"
(
  cd "$VERIFY_DIR"
  npm ci --ignore-scripts
  npm --prefix backend ci --ignore-scripts
  npm run test:interview
  npm run test:security
  npm run test:product
  npm run test:enterprise
  npm run build
  npm run lint
  npm audit --omit=dev --audit-level=high
  npm --prefix backend audit --omit=dev --audit-level=high
)
git worktree remove --force "$VERIFY_DIR"
git worktree prune
```

5. Push only the session branch as required by Arena. Push tags only if the release policy authorizes it and the tag meaning is truthful.

---

# Infrastructure prerequisite checklist

- [ ] authorized staging environment separate from production
- [ ] disposable PostgreSQL validation DB and DBA/migrator/runtime/worker access
- [ ] approved connection pooler and TLS policy
- [ ] Firebase staging project and deploy/IAM/index/rules access
- [ ] Redis or approved shared quota/cache decision
- [ ] queue/worker/DLQ provider access
- [ ] object storage/scanner/KMS access
- [ ] IdP/OIDC/SAML/SCIM configuration access
- [ ] Cloudflare/DNS/WAF/cache access
- [ ] secret manager/IAM visibility without secret export
- [ ] logging/metrics/tracing/SIEM access
- [ ] backup/restore tooling and isolated restore target
- [ ] load/DAST/browser/a11y tools and authorization
- [ ] synthetic Tenant A/B identities and test data

# Required access checklist

| Access | Minimum needed |
|---|---|
| GitHub | branch fetch/push, tag read, CI logs/artifacts |
| Hosting | read process/proxy/log/health config; controlled staging deploy |
| PostgreSQL | DBA + migrator + runtime + worker test accounts |
| Firebase/GCP | staging project IAM, rules/index deploy, Auth/RTDB/Storage inspection |
| Cloudflare | zone/rules/cache/WAF read; approved staging write |
| Secrets | secret reference/rotation metadata, no value export into docs |
| IdP | staging tenant/app configuration and audit logs |
| Storage/KMS | bucket/container policy, signer, scanner, key policy |
| Queue/Redis | staging topology, metrics, test operation rights |
| Observability | logs/metrics/traces/security audit dashboards |
| Backup/DR | backup manifests and isolated restore rights |

# Rollback checklist

- [ ] verified source tag/commit
- [ ] current deployment artifact/version recorded
- [ ] current config/rule/proxy/WAF export captured
- [ ] database backup/PITR point recorded
- [ ] Firebase rules/index export recorded
- [ ] queue paused/drained plan recorded
- [ ] object-store policy/key version recorded
- [ ] feature flags can disable enterprise server/client behavior
- [ ] migration ledger/cutover status known
- [ ] rollback owner/on-call notified
- [ ] regression commands ready after rollback

# Infrastructure assumptions requiring explicit verification

1. `TENANT_DATABASE_URL` is consumed by `createTenantService()` to create a shared `pg.Pool`, but no production database has been provisioned by this repository session. Verify TLS, role, pooler, route and secret injection before enabling the server flag.
2. `TENANT_JOB_SIGNING_SECRET` is documented for signed job/artifact envelopes. Confirm the actual worker/queue integration injects and uses it; do not assume the environment variable alone signs a provider-native job.
3. `FirestoreAtomicCounterStore` is a server-side fallback. Verify its transaction throughput/retention or replace it with a reviewed Redis adapter before high-scale tenant quotas are claimed.
4. `tenantStorage.js` and `tenantSignedArtifacts.js` define the contract, not a deployed bucket/scanner/KMS adapter. Provider integration is mandatory before file isolation is VERIFIED.
5. `TenantDataPlaneRouter` has a dedicated route contract, but a real dedicated pool resolver/secret/profile deployment is required before dedicated tenants are enabled.
6. `identityPolicy` stores OIDC/SAML/SCIM policy metadata only. No managed IdP adapter, SCIM webhook, SAML parser, or production session registry is implicitly enabled by configuration.
7. Support grants and API-key stores use server-only Firestore stores in the supplied adapter. Verify Firestore server IAM, audit retention, expiry cleanup, rate limits and break-glass operating procedure.
8. Existing certified Resume/CV/Interview/legacy AI flows remain Firebase UID-scoped. Do not assert they are tenant-migrated until adapter-by-adapter pilot and reconciliation evidence exists.
9. `.htaccess`/Apache proxy rules are repository baseline only. Confirm the actual origin/proxy/Cloudflare deployment uses equivalent or stronger controls.
10. No backup/restore, load, DAST, browser accessibility, independent penetration, or production traffic evidence is generated by local PGlite/unit tests.

# Final handoff starting point

```text
Start branch: arena/01a01c9e-resumepilotai
Start remote SHA: verify with git ls-remote before work
Source restore: enterprise-pre-migration-restore
Local enterprise restore: enterprise-tenant-foundation-final-verified
Feature flags default: disabled
Production 10/10 tag: intentionally absent until external evidence is complete
```
