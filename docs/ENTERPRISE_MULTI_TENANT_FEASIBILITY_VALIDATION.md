> **SUPERSEDED (2026-08-20 architecture refactor):** The enterprise architecture described here (PostgreSQL/RLS data plane, local queue, Redis) was replaced by the Firestore-first architecture. The current truth is `docs/ENTERPRISE_ARCHITECTURE.md`; the deployment runbook is `docs/ENTERPRISE_LOCAL_INFRASTRUCTURE_HANDOFF.md`. This document is retained as history.

# ResumePilot AI — Enterprise Multi-Tenant Architecture Feasibility Validation

**Validation date:** 2026-08-20 (UTC)  
**Repository / branch:** `bhaskarbeyond-creator/ResumePilotAi`, `arena/01a01c9e-resumepilotai`  
**Starting production SHA:** `10196c029758e000f7c602b874c5976a1ffba890`  
**Mode:** second-stage architecture validation only. **No application, baseline, database, infrastructure, or production code was implemented or changed.**

---

## Decision at a glance

> # **APPROVE WITH CONDITIONS**
>
> The proposed **hybrid model** remains the best practical target for this codebase: a global control plane, a shared PostgreSQL/RLS tenant data plane for the normal tier, a dedicated data plane only when justified, a Firebase compatibility bridge, and a modular monolith with separate workers.
>
> It is **not yet approved to start implementation** because PostgreSQL/RLS, tenant routing, deterministic legacy ownership mapping, enterprise identity, and tenant AI/cache/worker controls do not exist in the current repository and therefore cannot be empirically proven from it. The exact blockers are listed in Section 15.

The architecture is conceptually sound and compatible with the protected production baseline. It is not a free pass to add tenant columns or migrate Firebase data. The first implementation may begin only after the preconditions and proof plan in this document are accepted.

---

## Evidence and verification limits

| Item | Validation result |
|---|---|
| Current `HEAD` | **Verified:** `10196c029758e000f7c602b874c5976a1ffba890` |
| `origin/main` | **Verified:** same SHA locally and on the GitHub remote ref |
| Baseline freeze | **Verified:** `.agents/AGENTS.md` contains the protected capabilities and required regression protocol |
| PostgreSQL usage in checkout | **Not present:** no `pg`, PostgreSQL, Prisma, Sequelize, TypeORM, Knex, Drizzle, MySQL, SQLite, SQL migration, raw SQL, RLS, or connection-pool implementation is present in root/backend package manifests or tracked application source |
| Current primary application data store | **Verified:** Firebase Auth + Firestore + Realtime Database; browser local/session storage for some recovery/history state |
| Object storage usage | **No application upload/storage SDK flow found:** Firebase Storage is configured but not used by application source; PDF/DOCX exports stream from memory |
| Existing AI isolation behavior | **Verified at current tip:** bearer-authenticated same-origin AI routes, server-owned provider keys, client identity-field rejection, bounded interview context, provider failover, UID-scoped local interview history/session |
| Historical `54cb62f` / `9c479ff` deltas | **Not independently diffable:** repository is shallow; the protections are declared in freeze rules and visible in current code/tests |
| Production cloud topology/PostgreSQL | **Unknown:** no deployed infrastructure/IAM/Cloudflare/Firebase configuration or PostgreSQL deployment evidence is in the checkout |

The certified baseline suites and build were already rerun during the first-stage assessment:

```text
npm run test:interview  → 28/28 PASS
npm run test:security   → 163/163 PASS
npm run test:product    → 301/301 PASS
npm run build           → PASS
```

This document does not repeat production claims that cannot be verified locally.

---

# 1. PostgreSQL RLS Feasibility Validation

## 1.1 Actual current data-access architecture

### Direct answer

**No application data currently lives in PostgreSQL in the inspected repository.** No PostgreSQL driver, ORM, SQL migration, pool, RLS policy, SQL statement, or database URL configuration was found in tracked application code or package manifests.

This does **not** prove a hidden production PostgreSQL instance does not exist. It proves that there is no repository-managed PostgreSQL integration to validate today. The RLS recommendation is a target architecture choice, not an existing system capability.

### Current datastore map

| Datastore | Current data | Modules accessing it | Current access pattern |
|---|---|---|---|
| Firebase Auth | User identity, provider identity, custom claims, MFA capability | `src/main.jsx`, auth components/hooks, `src/firestore/auth.js`, backend auth/OAuth routes | Browser Firebase SDK and Firebase Admin token verification |
| Cloud Firestore | User profiles, resumes, covers, portfolios, job tracker, favorites, invoices/transactions, notifications, jobs, job applications, companies, CMS, settings, AI usage, payment records, audit/outbox/transient tokens | `src/firestore/dbOperations.js`, `src/services/resumePersistence.js`, dashboard/admin/components, `backend/index.js`, AI/admin/email services | Browser compat SDK for many user flows; Firebase Admin SDK for sensitive server routes |
| Realtime Database | Conversations, messages, user-conversation index, conversation participant index | `src/firestore/dbOperations.js`, `DashboardMessages`, backend messaging/account-delete routes | Browser reads/listeners; backend-only writes |
| Browser local/session storage | Resume recovery, current document compatibility state, interview sessions/history, import/ATS temporary data, preferences, public metadata cache | `resumePersistence`, `interviewCoach`, builder/dashboard/auth modules | UID-scoped for some sensitive state; cleared on account sign-out/switch |
| In-memory process state | AI provider configuration cache, rate-limit buckets, export concurrency, email circuit breaker/log/template compatibility state | `aiRuntime`, `security/abuse`, `backend/index.js`, `routes/email.js` | Node process-local only |
| Persistent object storage | No product object-store path found | N/A | Firebase Storage is configuration-only in current source |
| PostgreSQL | None found | None | None |

### Modules and the datastore boundary

| Module/domain | Current datastore boundary | Consequence for RLS feasibility |
|---|---|---|
| Resume/CV/cover builder | Browser Firestore reads/writes under `users/{uid}/resumes`, `covers`, `coverLetters` | Requires a legacy adapter; RLS cannot protect these Firestore documents. |
| Public resume / portfolio | Firestore root `pb` and `portfolios`, owner fields plus public state | Requires explicit target ownership/publication semantics before migration. |
| Interview Coach/CBT | Client state + localStorage `interviewSession:{uid}` / `interviewHistory:{uid}`; selected resume facts sent to AI | No server history table to migrate; future durable history must be tenant scoped. |
| AI provider settings/runtime | Server Firestore `settings/ai_providers`, `data/public_config`, `data/system_settings`; usage in `ai_usage` | RLS can govern a new tenant AI control plane, but current platform config must stay global until intentionally split. |
| Export/DOCX/PDF | Firestore source records plus transient render token; PDF/DOCX buffers streamed | New artifact metadata/file service can use RLS; current source lookup must preserve UID ownership during bridge. |
| Messaging | RTDB participant graph + Firestore profiles/notifications | Requires a dedicated migration rule because a conversation has multiple users and may not have deterministic tenant ownership. |
| Jobs/companies/applications | Root Firestore owner/application relationships | Requires explicit organization ownership policy before migration. |
| Payments/billing | Firestore user/payment records + provider systems | Existing records are individual-account/financial records; target tenant billing must be introduced separately. |
| CMS/platform configuration | Shared Firestore global documents | These are platform-control-plane data, not tenant product data by default. |

## 1.2 Is PostgreSQL RLS feasible here?

**Yes, conditionally.** It is feasible as the new server-mediated tenant data plane because:

1. The sensitive backend already has an Express API boundary, Firebase bearer-token verification, route policy middleware, and server-owned Firestore operations. A tenant resolver/policy/transaction boundary can be inserted in that style.
2. Existing certified data can remain in Firebase behind adapters while new enterprise control-plane and tenant collaboration data use PostgreSQL.
3. The application does not have an existing ORM/data layer that would force an unsafe or incompatible RLS migration. This is an opportunity to create a narrow tenant repository contract correctly from the start.

It is **not proven** until a non-production RLS proof validates all of the following:

- a pooled connection never retains Tenant A context for Tenant B;
- all tenant data queries execute inside explicit tenant transactions;
- unscoped queries deny by default;
- application runtime credentials cannot bypass RLS;
- report/admin/job paths cannot silently use privileged connections;
- worker retries and failure recovery recreate context correctly;
- dedicated-plane routing selects the correct pool/credentials;
- tenant-A/B collision, pagination, aggregation, join, export, and reporting tests pass.

## 1.3 Required safe request flow

```text
Authenticated user / service account
        │
        ▼
1. Verify identity token or API key
        │
        ▼
2. Resolve requested tenant/workspace context
   - URL/session context is only a request, never authorization
        │
        ▼
3. Query control plane for active membership and tenant status
   - principal_id + tenant_id + workspace_id
        │
        ▼
4. Evaluate policy
   - tenant membership, role, permission, resource action,
     MFA/SSO/support-grant/plan/lifecycle conditions
        │
        ▼
5. Resolve data plane server-side
   - shared plane or dedicated plane; no endpoint/credential reaches browser
        │
        ▼
6. Begin explicit PostgreSQL transaction on one checked-out pool client
        │
        ▼
7. Set transaction-local context
   - app.tenant_id, app.workspace_id, app.principal_id, app.policy_version
        │
        ▼
8. Use tenant-aware repository only
        │
        ▼
9. PostgreSQL RLS USING + WITH CHECK policies enforce row boundary
        │
        ▼
10. Commit/rollback, release/reset connection, write audit event
```

The tenant data plane must never be selected based solely on a client `tenant_id`, a Firebase custom claim, a frontend route, or a cached browser value.

## 1.4 Canonical transaction pattern

This is a conceptual contract, **not implementation code**:

```text
checkout one client from the selected data-plane pool
BEGIN
set_config('app.tenant_id', tenant UUID, true)
set_config('app.workspace_id', workspace UUID or empty marker, true)
set_config('app.principal_id', principal UUID, true)
set_config('app.policy_version', policy version, true)
execute only repository operations using that same client
COMMIT on success / ROLLBACK on any error
release client only after rollback/commit and reset verification
```

`set_config(..., true)`/`SET LOCAL` must be transaction-local. A tenant context must never be set as a long-lived connection/session attribute and then trusted across pooled requests.

### Connection-pooling requirements

| Pooling mode / behavior | Safe condition | Unsafe condition |
|---|---|---|
| Driver pool | Every scoped operation starts an explicit transaction and uses the checked-out client through commit/rollback | Calling `pool.query()` for tenant data outside the tenant transaction |
| PgBouncer transaction pooling | Safe if all tenant SQL is inside an explicit transaction and context is transaction-local | Session-level `SET` or reliance on session stickiness |
| Session pooling | Still use transaction-local state; execute reset/rollback defensively on release | Leaving `app.tenant_id` set when a connection is returned to pool |
| Nested service calls | Pass the same scoped client/repository | A child service obtains a second pool client with no tenant context |
| Async/concurrent work | Each job/request gets its own transaction and context | Ambient global tenant variable / AsyncLocalStorage without DB transaction enforcement |

The repository API should make unscoped access impossible by convention and test instrumentation: no application module imports a raw pool except the tenant transaction factory. A lint/import boundary and runtime test double should reject `pool.query()` from feature modules.

## 1.5 Required RLS policy posture

For every tenant-scoped table:

- `tenant_id UUID NOT NULL`;
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`;
- separate `USING` policies for reads/deletes and `WITH CHECK` policies for inserts/updates;
- a missing `app.tenant_id` must result in a false/denied predicate, never a permissive fallback;
- unique constraints and foreign keys include tenant scope where resource uniqueness/relationships are tenant-local;
- indexes begin with `tenant_id` and then relevant workspace/ordering columns;
- table IDs are globally opaque; cursor tokens contain signed tenant/context/version claims and are verified server-side;
- views use `security_invoker` behavior or are avoided for tenant data unless they are tested under RLS;
- `SECURITY DEFINER` functions are prohibited by default; any exception needs a fixed `search_path`, explicit tenant assertion, independent review, and adversarial tests.

Illustrative policy principle:

```text
USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid)
```

RLS is a **data-layer guardrail**, not the sole authorization system. It does not decide whether a member may edit a particular resume, whether an owner has approved an export, or whether a support grant is valid. Those remain policy-layer decisions.

## 1.6 Privileged roles and controlled bypass

| Database role/type | Permitted use | Must not be used for |
|---|---|---|
| `app_runtime` | Normal API tenant reads/writes | Table ownership, `BYPASSRLS`, migration, unrestricted reporting |
| `control_plane_runtime` | Membership/routing/lifecycle records only | Tenant content database access unless a separately scoped policy allows it |
| `worker_runtime` | Tenant-scoped job processing with the same RLS transaction contract | Broad scans of all tenant rows without a tenant loop/context |
| `migration_owner` | Reviewed schema migrations in CI/CD | Long-running API or worker runtime |
| `breakglass_restore` | Approved recovery/forensics with dual approval, time limit, complete audit | Routine support, dashboard reporting, generic admin queries |
| `analytics_reader` | Sanitized/aggregated reporting replica or approved governed dataset | Direct raw cross-tenant content warehouse access |

Superusers, database owners, roles with `BYPASSRLS`, and some security-definer patterns can bypass RLS. They must be isolated from runtime credentials, network paths, and ordinary operations. `FORCE ROW LEVEL SECURITY` protects against table-owner shortcuts but cannot constrain superusers/BYPASSRLS roles; those are operationally privileged escape hatches and need controls outside RLS.

## 1.7 RLS escape-path register

| Escape path | Why it can fail | Required control / test |
|---|---|---|
| Unscoped `pool.query()` | No tenant setting; poorly written RLS fallback could expose data | Deny on missing context; prohibit raw pool imports; negative test. |
| Connection reuse | Session tenant setting leaks between callers | Explicit transaction + local context + rollback/reset + pool-reuse test. |
| Database owner/BYPASSRLS | Privileged role ignores policies | Separate credentials; no runtime ownership; IAM/network audit. |
| Migration process | Migration can run privileged DDL/DML | Dedicated CI role, review, audit, no use from app. |
| Worker | Job loses or forges tenant context | Signed/validated envelope, control-plane route resolution, worker reauthorization. |
| Reporting/BI | Global cross-tenant query/export bypasses application policy | Tenant-scoped reports use RLS; platform analytics uses governed aggregate pipeline. |
| Views/functions/triggers | Definer security or implicit owner context can bypass | `security_invoker`, fixed search path, review/automated RLS tests. |
| Cross-tenant FK/join | Tenant A can reference Tenant B or infer existence | Composite tenant FKs; tenant predicates on all joins; collision fixtures. |
| Globally unique values | Error or lookup reveals other tenant data | Tenant-scoped uniqueness unless global uniqueness is explicitly required. |
| ORM/raw SQL future use | ORM filter conventions can be skipped | RLS remains mandatory; parameterized repository contract; raw SQL review/tests. |
| Connection-string routing | Wrong pool/data plane selected | Server-side signed route record/version; tenant route integration tests. |
| Admin/support endpoint | “Platform admin” uses a bypass connection | JIT support grants, tenant scope, RLS by default, separately audited break glass only. |
| Restore/export tooling | Tool reads broad data without context | Dedicated approved recovery workflow, isolate restore target, audit chain. |
| Cache/queue/provider side effects | RLS protects DB but not stale external copies | Tenant context at every downstream boundary; deletion/reconciliation tests. |

## 1.8 RLS pre-implementation proof gate

Before any certified module is moved, build a **non-production, disposable RLS validation harness** and pass these assertions:

1. Tenant A query cannot see Tenant B rows even when application SQL omits a tenant predicate.
2. Insert/update cannot set a different `tenant_id`.
3. An unscoped request returns no rows/denied state.
4. The same physical pooled connection serves A, then B, then no-context with no context bleed.
5. Rollback, exception, timeout, retry, and cancelled request clear state.
6. Joins, aggregate, search, pagination, cursor, `ON CONFLICT`, FK, view, and reporting cases stay scoped.
7. Runtime role fails to disable row security or read with a bypass role.
8. Worker job retry and dedicated-plane routing establish the correct context again.
9. Schema migration and restore roles are not reachable from API/worker credentials.
10. Results are reviewed by an application security architect and kept as CI integration tests.

Until that harness exists and passes, PostgreSQL RLS is an architecture hypothesis — not proven isolation.

---

# 2. Firebase → Tenant Migration Validation

## 2.1 Canonical identity mapping

```text
Firebase Auth UID
      │
      ▼
Identity link
  issuer = firebase / project identity
  subject = Firebase UID
      │
      ▼
Global user / human principal
      │
      ├── Personal tenant membership (owner; created deterministically)
      │       └── Personal default workspace
      │             └── Existing UID-owned career data through Firebase adapter
      │
      └── Zero or more business tenant memberships
              └── Tenant/workspace resources created or explicitly transferred there
```

### Rule: personal data does not automatically become employer/organization data

When an existing user later joins multiple organizations, existing personal resumes, covers, portfolio drafts, job tracker items, personal interview history, and personal profile data remain in the user’s **personal tenant** unless the user performs an explicit, authorized copy/share/transfer workflow. Membership in a business tenant must not silently re-home a person’s career history.

## 2.2 Deterministic legacy mapping

| Existing source | Canonical target at first migration | Deterministic rule |
|---|---|---|
| Firebase Auth UID | `identity_links(firebase_uid)` → `users/principals` | One immutable normalized identity link per Firebase UID; never join by email alone. |
| `users/{uid}` profile | User profile + personal tenant membership | Create one personal tenant with a generated opaque ID and a unique legacy UID mapping. |
| `users/{uid}/resumes/*` + nested employment/education/skills/languages | Personal workspace resume aggregate | Source path owns data; all child sections follow parent resume. |
| `users/{uid}/covers/*`, `coverLetters/*` | Personal workspace cover aggregate | Source path owns data. |
| `users/{uid}/portfolios/*` / root `portfolios` | Personal workspace portfolio aggregate | Match source `userId`; reconcile duplicated root/subcollection copies before cutover. |
| `pb/{resumeId}` | Public projection of its source personal resume | `ownerUid` must equal source UID; public state follows source aggregate. |
| `users/{uid}/jobTracker/*`, favorites, personal notifications, login history | Personal tenant/user-scoped data | Current path/UID is deterministic; login history remains identity-level but may be shown under personal security history. |
| Browser resume recovery `resume_recovery_v1:{uid}:{resumeId}` | Do not automatically upload/migrate | Keep local compatibility state until user returns to personal context; expire after current seven-day recovery window. |
| Interview local state/history | Personal context only; no automatic server import | Existing records are UID-scoped but lack tenant/workspace provenance. Keep local or offer explicit export/import; never surface in business tenant by default. |
| AI-generated text saved into resume/cover | Follows the parent resume/cover aggregate | There is no separate durable generation ledger in current source. |
| PDF/DOCX exports | No durable artifact to migrate | Current server streams buffers; transient render tokens expire/are consumed. |
| `ai_usage` daily user hash | Legacy personal attribution only | Historical data has no tenant. Link to personal tenant with `attribution_method=legacy_personal`; do not allocate to future employers. |

## 2.3 Current resource classification and ownership risks

| Current resource | Current ownership evidence | Target owner/classification | Migration status / ambiguity |
|---|---|---|---|
| User profile | `users/{uid}` | Global user profile; personal tenant profile projection | Deterministic. |
| Resume/CV data | `users/{uid}/resumes` | Personal workspace by default; may be explicitly shared/copied | Deterministic. |
| Four CV template implementations | Static source assets/components | Platform-global template catalog | No tenant data migration. |
| 51 resume template implementations | Static source assets/components | Platform-global template catalog | No tenant data migration. |
| Covers/cover letters | UID subcollections | Personal workspace by default | Deterministic. |
| Portfolio draft/root public portfolio | `userId` and user subcollection | Personal workspace, publication is separate public projection | Reconcile duplicate representations. |
| Published resume (`pb`) | `ownerUid`, explicit publication mode | Projection of source aggregate, not independent ownership | Deterministic only when source UID exists/matches. |
| Job tracker/favorites | UID subcollection | Personal workspace | Deterministic. |
| Employer application | `employerApplications/{uid}` | Personal/identity application to platform employer program | Deterministic as personal/platform workflow; not organization data. |
| Company | `employerId` | Future employer tenant-owned organization resource | **Ambiguous for users with future multiple tenant memberships.** Owner/administrator must select or map a tenant. |
| Job posting | `employerId`, optional company relation | Job owner tenant/workspace | **Ambiguous** until company/employer tenant is resolved. |
| Job application | Applicant `userId` + `jobId`; job owner can read | Resource owned by the job’s tenant, with applicant data-subject access/retention rights | Depends on deterministic job tenant assignment. |
| Conversations/messages | RTDB participant graph, often linked to application | Job/application tenant when linked; otherwise legacy personal participant archive | **High ambiguity** for old conversations with multiple participants/no tenant. |
| Blog posts/categories/pages/reviews/trusted-by/ads | Shared platform content, author UID for posts | Platform control-plane content, not customer tenant data by default | Do not blindly tenantize. |
| Contact submissions | Shared platform moderation collection | Platform operational/CRM data | Not tenant resource unless enterprise contact feature is added. |
| Payment orders/subscriptions/invoices/transactions | UID/userId and provider ledger | Billing control-plane record linked to personal tenant or future billing account | Finance/legal retention and reconciliation required; do not move/delete casually. |
| Notifications | `notifications/{uid}` | Legacy personal inbox; future events include tenant/workspace | Deterministic legacy data but lacks historical tenant provenance. |
| AI provider/admin settings | Global Firestore settings | Platform configuration; future tenant overrides separate | Must not be copied per tenant by default. |
| Audit/outbox/reset/OAuth records | Server-only Firestore collections | Platform/security control plane; tenant field only when event pertains to tenant | Do not treat as user content migration. |

## 2.4 Ambiguous ownership blockers

No data migration should begin for these categories until a policy is approved:

1. **Companies and jobs.** `employerId` identifies a person, not a tenant. A future member can belong to several organizations. A company/job must be assigned through a deterministic legacy-owner mapping or explicit administrator confirmation.
2. **Job applications.** The job’s tenant should own the workflow record, while the applicant remains a data subject with access/export/delete rights subject to legal retention. Existing applications cannot be assigned until the job is assigned.
3. **Realtime conversations.** A conversation is participant-scoped, not tenant-scoped. Existing conversations may need to remain a read-only legacy archive under the personal context until a trusted job/application mapping exists.
4. **Legacy browser AI/interview history.** It has UID ownership but no tenant/workspace source. It must not appear in each future tenant merely because the user has membership there.
5. **Duplicated portfolio representations.** Root and user-subcollection data need canonical reconciliation before migration.
6. **Financial/legal records.** Individual paid plan records cannot be reclassified as business billing simply because the user later joins a tenant.
7. **Public links.** Published resumes/portfolios must preserve explicit publication state, public URL, revocation behavior, and source ownership; public projection does not imply tenant-wide access.

## 2.5 Reversible migration strategy

A safe migration is an **aggregate-by-aggregate strangler**, not a bulk rewrite.

```text
Inventory source aggregate
  → determine ownership rule
  → create migration ledger entry
  → snapshot source revision + canonical checksum
  → copy into target tenant data plane
  → verify counts/checksum/publication state
  → shadow read / controlled adapter comparison
  → tenant-scoped canary cutover
  → retain source during rollback window
  → reconcile before source retirement
```

### Migration ledger requirements

```text
migration_id, source_store, source_path, source_uid,
source_revision, source_checksum, target_tenant_id,
target_workspace_id, target_resource_type, target_resource_id,
ownership_rule_version, status, cutover_at, reconciled_at,
rollback_window_expires_at, operator/audit metadata
```

### Reversibility rules

- Before write cutover, rollback means routing reads/writes to the Firebase source; do not delete source data.
- During dual-write/shadow phases, any conflict halts cutover and is reconciled; “last write wins” is not accepted for resumes or financial/legal data.
- After a target becomes the source of truth, rollback is a controlled forward repair/inverse migration, never an unreviewed overwrite of stale Firebase data.
- Every move is versioned by an ownership rule. If ownership is ambiguous, status is `BLOCKED_OWNERSHIP`, not “best guessed.”
- Existing certified behavior remains on the legacy adapter until per-module certification passes.

---

# 3. Canonical Tenant Membership Model

## 3.1 Relationship model

```text
User (human profile) ───── 1:1 ───── Principal
      │                                  │
      │                                  ├── Identity links (Firebase/OIDC/SAML)
      │                                  ├── Sessions
      │                                  └── Service accounts are separate principals
      │
      ├──────── Tenant memberships ───── Tenant
      │                                    │
      │                                    ├── Tenant roles / policies / billing
      │                                    ├── Workspaces
      │                                    │     ├── Workspace memberships
      │                                    │     ├── Teams (optional)
      │                                    │     └── Resources
      │                                    └── Data-plane routing record
      │
      └──────── Platform roles (rare, separate from tenant roles)
```

A user may have many memberships. A tenant has many users. A tenant membership is the canonical relationship; it must not be inferred from email domain, employer claim, Firebase custom claim, or client state.

## 3.2 Recommended canonical schema

| Entity | Key fields | Why it exists |
|---|---|---|
| `principals` | `id`, `type` (`human`, `service`), status, created/disabled timestamps | Uniform authorization subject for humans and machine identities. |
| `users` | `principal_id`, display profile, privacy profile | Human profile separated from authentication provider identity. |
| `identity_links` | `principal_id`, issuer, subject, provider, verified email snapshot | Maps Firebase UID/OIDC/SAML subject safely; email is not the identity key. |
| `tenants` | `id`, slug, name, status, isolation tier, data-plane ID, region, routing version, lifecycle policy | Organization boundary and router input. |
| `tenant_memberships` | `tenant_id`, `principal_id`, status, joined/invited/removed timestamps, default workspace, membership revision | Canonical many-to-many access relationship; supports multi-organization users. |
| `roles` | global system role catalog and optional tenant-custom role definition | Stable permission bundle definitions. |
| `permissions` | immutable verb/resource catalog | Prevents role-name logic from spreading through code. |
| `role_permissions` | role-to-permission mapping | Auditable authorization bundle. |
| `membership_role_assignments` | membership, role, optional workspace scope | Assigns tenant-level or scoped roles to a membership. |
| `workspaces` | `tenant_id`, name, status, policy/retention settings | Optional collaboration/data boundary beneath tenant. |
| `workspace_memberships` | workspace, membership, access state | Allows access to selected workspaces without duplicating tenant identity. |
| `teams` | `tenant_id`, optional workspace ID, name, external group mapping | Introduced only where a group has a real policy/workflow purpose. |
| `team_memberships` | team, membership | Useful for grants/workflows, not a substitute for tenant membership. |
| Domain resource tables | `tenant_id`, `workspace_id?`, owner/creator principal, classification, revision | Every tenant resource can be enforced by policy/RLS. |
| `tenant_routes` / `data_planes` | tenant ID, plane ID, tier, region, primary/standby, routing version, secret references | Server-only placement/routing metadata. |

## 3.3 Membership semantics for multi-organization users

- A principal can have one **personal tenant** plus any number of employer/customer/cohort tenants.
- A browser tab is scoped by the current route/context; a user can open different tenant contexts in different tabs without one tab changing the other.
- A membership status is explicit: invited, active, suspended, removed, expired. A removed membership invalidates current tenant context and queued work at the next policy check.
- Workspace access is additive/restrictive under an active tenant membership. It cannot grant access to a tenant where the user is not a member.
- External IdP group synchronization maps to memberships/roles through controlled SCIM/group mapping; it never lets arbitrary group names grant platform administration.
- Platform roles are not tenant roles. `SUPER_ADMIN`/`ADMIN` from the existing application must be migrated as platform governance roles, not copied into every tenant membership.

## 3.4 Resource authorization model

```text
Authenticated principal
  → active tenant membership
  → tenant role / workspace role
  → permission for action
  → resource belongs to same tenant/workspace
  → attribute checks (owner, classification, lifecycle, MFA, support grant)
  → API decision
  → RLS/storage/queue/AI data boundary
```

No layer is sufficient alone. Frontend visibility is usability only; API policy is primary authorization; RLS is data-layer defense; signed storage/jobs/cache scopes prevent downstream leakage.

---

# 4. Dedicated Tenant Architecture Validation

## 4.1 What “dedicated” must mean

“Dedicated” must be a documented isolation profile, not a vague sales label. It should not automatically mean a separate product deployment for every customer.

| Component | Standard tenant | Enterprise tenant | Regulated / high-isolation tenant |
|---|---|---|---|
| Database | Shared PostgreSQL schema + forced RLS | Shared RLS by default; reserved capacity/partitioning if needed | **Dedicated PostgreSQL database** (not merely a schema) with isolated backup/restore boundary |
| Application API | Shared stateless application deployment | Shared API with tenant quotas | Shared application by default; dedicated deployment only if contract/network/runtime isolation requires it |
| Workers | Shared queues/pools with per-tenant concurrency | Reserved concurrency/priority where purchased | Dedicated queue/pool for AI/render/lifecycle when required |
| Object storage | Tenant/workspace prefix and server-controlled signed URLs | Prefix plus optional tenant-managed retention policy | Separate bucket/account/container or strongly isolated prefix + **tenant-specific KMS/CMK**, as contract requires |
| Cache | Shared Redis with strict namespacing/quota | Shared namespace/reserved memory limits | Dedicated logical cache/database/instance only when performance/security contract requires it |
| AI provider routing | Platform credential/model policy, tenant budget | Tenant model/provider policy and potentially tenant BYOK vault reference | Dedicated vector index/namespace, dedicated encryption key, private endpoint/provider arrangement if contract requires it |
| Vector/RAG | None until added; future logical namespace | Tenant/workspace namespace | Dedicated index/collection/region where required |
| Region | Platform default permitted region | Tenant selected supported region where available | Contractual residency region, data/backup/worker affinity enforced |
| Encryption | Platform KMS/envelope policy | Tenant key policy where offered | Tenant CMK/BYOK/envelope key + rotation/audit |
| Support | Tenant-scoped JIT access | Same | Contract-specific access, approvals, break-glass terms |

## 4.2 Explicit non-goals for the dedicated tier

A regulated tenant does **not** automatically require:

- a different frontend codebase;
- a permanent dedicated Kubernetes cluster/VM fleet;
- one application repository/branch per customer;
- schema-per-tenant as a substitute for a database boundary;
- direct customer database access;
- unrestricted provider/model deployments.

Dedicated deployment, private networking, or a separate cloud project is justified only if legal, data-residency, security, service-level, or scale requirements require runtime/network isolation beyond a dedicated database/storage/worker configuration.

## 4.3 Tenant placement and request routing

```text
Tenant registry (global control plane)
  tenant_id + status + isolation tier + data_plane_id + region + route_version
        │
        ▼
Server-side tenant router
  validates membership and route version
        │
        ├── shared data plane pool
        │       └── PostgreSQL RLS / shared cache / shared worker partition
        │
        └── dedicated data plane pool
                └── dedicated DB / storage key or bucket / worker pool / region
```

The browser receives a tenant name/slug and application result, never data-plane connection details, database name, storage credentials, queue destination, or KMS material.

## 4.4 Global control-plane placement schema

A minimal route record should include:

```text
tenant_id
slug
status
isolation_tier                  # standard | enterprise | regulated
control_plane_region
data_plane_id
data_plane_type                 # shared_postgres | dedicated_postgres
primary_region
standby_region?
routing_version
storage_profile_id
cache_profile_id
queue_profile_id
ai_profile_id
kms_key_reference
provisioning_state
created_at / updated_at
```

Secret values belong in a secret manager; the registry stores only secret/profile references and policy metadata.

## 4.5 Provisioning, tier migration, region migration, failover, and DR

| Operation | Required safe behavior |
|---|---|
| Provision | Create registry row as pending; create database/storage/queue profile; verify policy/key/health; activate only after audit and smoke validation. |
| Standard → dedicated | Put tenant in controlled migration state; snapshot/checksum; copy; reconcile; canary; flip `routing_version`; keep source rollback window; never move all tenants together. |
| Dedicated → standard | Require legal/retention/key approval; reconcile and rotate credentials/keys; ensure no dedicated-only policy is lost. |
| Region migration | Explicit tenant owner/legal approval; residency checks on primary, backup, queue, object storage, vector store, logs, and provider processing; preserve audit chain. |
| Failover | Control plane chooses approved standby; app uses current route version; queued jobs re-resolve route; no client-side endpoint switch. |
| DR | Restore tenant only into isolated restore target first; validate counts/checksums/RLS/key scope; promote only after approved runbook. |

The global control plane is itself critical infrastructure. It needs its own high availability, backup, access controls, and a small, audited route cache. A stale route cache must never override a tenant suspension or security revocation for sensitive operations.

---

# 5. AI Isolation Validation

## 5.1 Actual AI runtime trace

### Current request path

```text
Browser feature module
  → src/services/aiService.js / same-origin API request with Firebase bearer token
  → backend global requireAuth + verified-email/policy/quota middleware
  → backend/routes/ai.js for most generation operations
      - rejects client apiKey and x-gemini-api-key
      - rejects uid, userId, ownerUid, resumeId, profileId in body/payload
      - bounds serialized input
  → prompt construction / response validation
  → backend/services/aiRuntime.js
      - loads global provider configuration
      - provider/model selection and failover
      - timeout/error normalization
  → external model provider
  → validated response to browser
```

The cover-letter endpoint is implemented in `backend/index.js` rather than the AI router but remains behind the global authenticated API boundary. It currently constructs output from bounded client-supplied job/candidate fields and does not load a cross-user document itself.

### Current persistence and configuration facts

| Area | Current evidence |
|---|---|
| Provider configuration | Platform-global Firestore configuration plus environment secrets; `configurationCache` is a `WeakMap` keyed by DB object with a 15-second TTL. |
| Provider failover | NVIDIA, Gemini, OpenAI, Groq, OpenRouter, DeepSeek candidates are supported by `aiRuntime`. |
| AI quota/usage | `ai_usage/{day}_{uidHash}`, with UID/email/tier fields; no tenant/workspace attribution. |
| Resume/CV context | Browser builds bounded resume facts/selected content and submits it; server rejects identity fields but does not resolve a tenant resource today. |
| Interview history/session | UID-scoped browser localStorage; session TTL is 24 hours and history limit is 25; no server AI conversation store found. |
| Memory/RAG/embeddings/vector store | No implementation found. |
| AI response cache | No generalized response cache found. Provider configuration cache only. |
| Background AI jobs | None found; AI calls are synchronous request work. |

## 5.2 Preservation of the protected AI baselines

The current tip visibly implements the controls associated with the declared `54cb62f` and `9c479ff` baselines: bearer-authenticated user AI requests, identity-field rejection, bounded context, user-scoped interview client state, server-only provider credentials, resilient parsing, provider failover, and error/timeout handling. The shallow repository prevents an independent historical commit diff, so this validation relies on the current code and passing baseline suites rather than claiming commit-delta proof.

**The target architecture must strengthen, not replace, these controls.** In particular, do not allow a future tenant ID, workspace ID, vector namespace, provider URL, model credential, or document ID to become client-authoritative input to a model request.

## 5.3 Tenant A → Tenant B contamination threat model

| Contamination path | Current posture | Future protection requirement |
|---|---|---|
| Prompt contains Tenant B resume/CV | Current route rejects IDs but browser supplies context | Server context broker loads only resources authorized by TenantContext; prompt records source resource/version. |
| Wrong tenant AI configuration/credential | Current config cache is global because config is global | Tenant config cache key includes tenant/profile/version; vault returns only allowed credential reference. |
| Provider failover crosses policy/residency boundary | Current failover is platform-global | Candidate provider/model must be approved by tenant policy and residency/data-processing policy before request. |
| AI response cache collision | No current response cache | Cache disabled for sensitive data by default; otherwise key includes tenant/workspace/policy/model/prompt/source versions. |
| Conversation/history leak | Current history is UID-local only | Durable history rows include tenant/workspace/principal; legacy UID history appears only in personal context or stays local. |
| RAG retrieves another tenant document | No current RAG | Physical namespace or mandatory server-side partition + vector policy; no raw namespace client input. |
| Embedding deletion misses copies | No embeddings | Source-to-embedding ledger; tenant delete triggers queues and verification. |
| Background job uses stale tenant context | No AI workers now | Job envelope includes route/policy/source versions; worker re-resolves and re-authorizes. |
| Admin/support prompt inspection | Current global admin model | JIT tenant-scoped support grant, redaction, audit, customer visibility; default no raw prompt access. |
| Provider retention/training | Repository cannot prove provider tenancy/data terms | Tenant provider policy, DPA/zero-retention/region evidence, contract review. |

## 5.4 Safe target AI flow

```text
Authorized TenantContext
  → AI policy decision
      (permission, plan, provider/model allowlist, budget,
       classification, retention, region, tenant status)
  → source/context broker
      (tenant/workspace/resource authorization; no raw client IDs trusted)
  → versioned prompt assembly
      (tenant instruction policy + selected source versions)
  → existing hardened provider router/failover
      (only policy-approved candidates)
  → response validator/safety layer
  → tenant-scoped artifact/usage/audit records
```

### Mandatory AI boundaries

- **Prompt construction:** resource content comes from server-authorized aggregate fetches. Client text is still bounded/sanitized but is tagged as client-provided, not trusted resource provenance.
- **Resume/CV/interview context:** `tenant_id`, `workspace_id`, source IDs, source revisions, and policy version are recorded with generation metadata; only content in active scope may be included.
- **Memory:** opt-in, tenant/workspace/principal/scope/expiry bound; disabled by default for legacy data.
- **RAG/vector:** tenant/workspace namespace is selected by the server; metadata filter plus physical/logical partition and adversarial tests; dedicated tier can use dedicated collection/index.
- **Provider failover:** all failover candidates comply with same tenant policy; a fallback cannot move data into an unapproved provider/region merely because primary fails.
- **Usage:** ledger key includes tenant, workspace, actor, model/provider, operation, token/cost estimates, and policy version; the current UID-only counter is not sufficient.
- **Background work:** no raw prompt/secret in queue payload; worker fetches sources after authorization.

---

# 6. Cache Isolation Validation

## 6.1 Current cache/state inventory

| Cache/state | Purpose | Current key / scope | Current TTL/invalidation | Future tenant-aware key | Risk |
|---|---|---|---|---|---|
| AI configuration `WeakMap` | Avoid repeated global provider settings reads | DB object, process-local | 15 seconds; explicit clear after admin save | `ai-config:{tenantProfile}:{revision}`; platform config may remain `platform-ai-config:{revision}` | If tenant overrides are added without a new key, tenant config/credential policy can bleed. |
| Rate-limit `buckets` Map | Per-account burst/hour limits | `namespace:{uid or ip}` | Window-dependent, process-local | Redis `rl:{tenant}:{principal}:{operation}:{window}`; global IP/edge limits remain global | Multi-instance bypass and tenant budget ambiguity. |
| PDF `activeExports` counter | Per-process concurrent render protection | Single global process counter | Until request finishes | Distributed `render-concurrency:{tenant}` plus platform pool ceiling | One tenant can consume shared capacity; counter multiplies across instances. |
| SMTP circuit breaker | Provider failover state | One process-wide primary SMTP state | Configurable cooldown (default five minutes) | Global provider-health circuit may remain global; tenant sender/config cache must be separately versioned | Global health state is legitimate; tenant-specific configuration must not share it. |
| Email logs/templates stores | Compatibility in-memory state | Process-local globals | Process lifetime / DB fallback | Tenant-aware only if tenant mail templates/senders are introduced | Potential future template/config mix-up. |
| Website metadata cache | Public marketing metadata | `website_meta_cache` in browser | No explicit TTL; server overwrite/fallback | Remains platform-global/public | Legitimately global; must never hold tenant private content. |
| Browser public settings cache | Last known curated public platform config | `inMemorySettingsCache` in browser | Session/process and server-confirmed refresh | Platform-global stays global; tenant settings use separate tenant/version cache | Do not merge tenant settings into this global object. |
| Resume recovery | Unsaved private resume recovery | `resume_recovery_v1:{uid}:{resumeId}` | Envelope max age seven days | `resume_recovery_v2:{tenant}:{workspace}:{principal}:{resource}` | A multi-tenant user could otherwise reopen personal state in another tenant. |
| Interview session | CBT resume-after-refresh state | `interviewSession:{uid}` | 24 hours | `interviewSession:{tenant}:{workspace}:{principal}:{session}` | Current UID key is safe only while all context is personal. |
| Interview history | Recent question dedup/history | `interviewHistory:{uid}` | Bounded to 25 entries; no time TTL | `interviewHistory:{tenant}:{workspace}:{principal}` | Do not reveal personal history in business tenant. |
| Current resume/cover IDs | Browser compatibility/navigation | Plain `currentResumeId`, `currentCoverId` etc. | Cleared on sign-out/account switch | Context-scoped/ephemeral state, or URL state | Key lacks tenant; must not be relied on as authorization. |
| Service worker/cache storage | Legacy cache cleanup | Disabled/cleared at bootstrap/sign-out | Deleted | Keep authenticated tenant API responses out of shared cache by default | Stale authenticated data if re-enabled without policy. |

## 6.2 Global caches that may legitimately remain global

The following may remain platform-global if they never contain tenant data and are versioned:

- static template catalog/source assets;
- public marketing configuration, public CMS assets, translation bundles, public feature catalog;
- provider availability/health circuit state without tenant content;
- generic rate-limit/configuration metadata that does not encode a tenant response;
- build artifacts/CDN assets with immutable content hashes.

A global cache is never acceptable for private document payloads, tenant settings, AI context/results, membership/permission decisions beyond a short versioned server-side cache, signed URLs, report results, or user browser state.

## 6.3 Cache proof requirement

Every future private cache key must include an unambiguous tenant scope before a resource identifier:

```text
tenant:{tenant_id}:workspace:{workspace_id}:resource:{resource_type}:{resource_id}:v:{revision}
```

A resource ID collision must be tested deliberately:

```text
tenant:A:resume:X  ≠  tenant:B:resume:X
```

Cache invalidation events must include tenant, workspace, resource, and revision. Context switching aborts in-flight requests and clears only the old tenant’s private client/query cache; it must not clear unrelated device preferences or platform public assets.

---

# 7. Queue and Worker Isolation Validation

## 7.1 Current background/asynchronous work map

| Workload | Current execution | Context today | Retry / DLQ / idempotency | Tenant gap |
|---|---|---|---|---|
| Notification outbox | Firestore `notification_outbox` + optional timer worker | Event metadata/recipient UID; no tenant | Deterministic hashed outbox ID, 2-minute lease, max 5 attempts, exponential retry 1 minute to 1 hour, terminal `DEAD_LETTER` | Add tenant/workspace/route/policy context and reauthorization. |
| CMS scheduled publication | Optional in-process `setInterval` | Platform CMS, actor `cms-scheduler` | Firestore transaction/idempotent revision check | Platform-global today; tenant CMS would need tenant context. |
| PDF export | Synchronous API → in-process Playwright | Authenticated UID/source record | One-time render token, process concurrency 5; no queue/DLQ | Move to isolated tenant-aware render worker for scale. |
| DOCX export | Synchronous API → in-memory buffer | Authenticated UID/source record | Request retry only | Future job/artifact flow must retain tenant scope. |
| AI generation | Synchronous API → provider | Firebase user + bounded client content | Provider/model fallback; request abort; no job/DLQ | Future async AI jobs require tenant context. |
| Payment webhook/order state | Synchronous backend transaction | UID/order | Provider event idempotency in Firestore | Tenant billing needs tenant billing account/context. |
| Account deletion | Synchronous recursive cleanup | UID | Partial-failure reporting | Tenant lifecycle deletion must be durable, resumable, tenant-scoped job. |

## 7.2 Canonical future job envelope

```json
{
  "schema_version": 1,
  "job_id": "opaque-id",
  "job_type": "render_pdf | ai_generate | notify | tenant_export | lifecycle_delete",
  "tenant_id": "opaque-tenant-id",
  "workspace_id": "optional-workspace-id",
  "data_plane_id": "server-route-id",
  "routing_version": 7,
  "actor": { "type": "user|service|system", "principal_id": "opaque-id" },
  "resource": { "type": "resume", "id": "opaque-id", "revision": 12 },
  "policy_version": 19,
  "idempotency_key": "opaque-hash",
  "correlation_id": "trace/request-id",
  "classification": "private|confidential|public",
  "submitted_at": "timestamp"
}
```

The payload intentionally excludes provider credentials, raw bearer tokens, database connection strings, raw prompt bodies, and full private file/document payloads. The worker retrieves resources only after re-resolving route, tenant status, policy, and resource authorization.

## 7.3 Worker safety contract

```text
Claim job
  → validate signature/schema/idempotency
  → resolve current tenant route from control plane
  → validate tenant/workspace status and policy version
  → begin RLS-scoped tenant transaction
  → fetch authoritative resource/version
  → perform side effect with tenant quota/circuit checks
  → record result/audit/outbox atomically where possible
  → retry or DLQ without losing tenant identifiers
```

A worker may retain an authorization snapshot for auditing, but it must not trust a stale snapshot as permission. Suspension, membership revocation, data deletion, or policy change must be honored before expensive/provider side effects.

---

# 8. File Storage Isolation Validation

## 8.1 Current file/artifact map

| Artifact | Current persistence/location | Ownership | Migration implication |
|---|---|---|---|
| Resume/CV content | Firestore document/subcollections | UID owner | Migrates as structured aggregate, not a file. |
| CV/resume templates | Static frontend/backend source | Platform-global | No tenant storage. |
| PDF export | Playwright buffer streamed to browser | Request UID/source authorization | No persistent file; future generated artifact optional. |
| DOCX export | Node buffer streamed to browser | Request UID/source authorization | No persistent file; future generated artifact optional. |
| Export render payload | Firestore `export_render_tokens`, hashed one-time token | Server-issued after owner/entitlement check | Ephemeral, 60-second default TTL; do not classify as retained user file. |
| Resume import | Browser reads PDF/DOCX/RTF/TXT locally; image/OCR import fails closed | Browser local transient data | No uploaded original currently; future upload requires quarantine/scan pipeline. |
| User photos | URL fields/provider URLs | User profile metadata | Future managed uploads need own storage policy. |
| Attachments | No general attachment storage implementation found | N/A | New capability must not reuse ad hoc paths. |

## 8.2 Canonical future namespace

```text
quarantine/{upload_id}

tenants/{tenant_id}/workspaces/{workspace_id}/
  resources/{resource_type}/{resource_id}/source/{file_id}/{version}
  generated/{artifact_type}/{artifact_id}/{version}
  exports/{export_request_id}/{artifact_id}
  audit-evidence/{event_id}
```

Paths are generated by the server. A client never selects a bucket, prefix, tenant ID, workspace ID, filename path, or encryption key as authority.

## 8.3 Signed URL and file controls

- Verify tenant/workspace/resource authorization at URL issuance and, for high-risk downloads, at download gateway time.
- Use short expiry, single purpose (`upload`, `download`, `render`, `export`), content-disposition, MIME/size expectations, and auditable issuance.
- Scan/quarantine uploaded content before parsers/AI/renderers process it; preserve the current fail-closed image-import posture until this exists.
- Store tenant/workspace/resource/classification/retention/key metadata independently of object path.
- On deletion, revoke/expire URLs, remove object versions/derived artifacts/embeddings/caches according to retention/legal hold policy.
- Dedicated tier receives dedicated storage/key/region only at its profile requirement.

---

# 9. Authorization Architecture Validation

## 9.1 Required defense-in-depth chain

```text
Authentication
  ↓  cryptographically verified identity
Tenant membership
  ↓  active membership + tenant/workspace status
Role / permission
  ↓  action entitlement
Resource authorization
  ↓  same tenant/workspace + owner/classification/workflow conditions
Application repository boundary
  ↓  only scoped transaction client
PostgreSQL RLS / Firestore legacy ownership rules
  ↓
Cache, queue, files, AI provider/context boundaries
  ↓
Audit and observability
```

## 9.2 Layer-by-layer validation

| Layer | Current foundation | Target control | Why it is independently valuable |
|---|---|---|---|
| Authentication | Firebase bearer verification + email/MFA mechanisms | Firebase bridge + OIDC/SAML/SCIM managed identity | Proves principal identity, not tenant access. |
| Membership | None | Control-plane `tenant_memberships` | A user can belong to multiple tenants safely. |
| Role/permission | Platform custom claims/permissions | Tenant/workspace grants and static permission catalog | Makes delegated tenant admin possible. |
| Resource policy | Owner/role checks in routes/rules | Tenant/workspace/resource/attribute policy engine | Stops member overreach inside a tenant. |
| API boundary | Express auth/policy middleware | Immutable `TenantContext`, route resolution, audit | Stops user-controlled tenant IDs. |
| Data boundary | Firestore rules for legacy data | RLS for new relational tenant data; adapter checks for legacy Firestore | Prevents missed query predicates from becoming disclosure. |
| Cache/job/file/AI | Partial UID context/current hardening | Scope-bound keys/envelopes/URLs/context broker | Prevents data leaving the database boundary. |
| Audit | Firestore security audit events | Tenant-complete immutable audit trail | Enables detection, investigation, and accountability. |

No frontend `if (can(...))`, API `tenantId` condition, or RLS policy alone is enough. A secure design has independent layers that fail closed in different ways.

---

# 10. Enterprise UI/UX Feasibility Validation

The current React application can evolve incrementally because it already has lazy feature routes, an authenticated shell, a member sidebar, a distinct admin console, and reusable dialogs/toasts. It does **not** yet have a tenant shell, global command/search state, or a normalized design system. The safest UX implementation order is shell/context primitives first, then tenant admin surfaces, then selective module wrappers; do not restyle certified feature internals as the initial work.

## 10.1 Global application shell — conceptual wireframe

```text
┌────────────────────────────────────────────────────────────────────────────────────┐
│ ResumePilot  [ Acme Careers ▾ ] [ Talent Ops ▾ ]  ⌘K Search   + Create  ◌  Avatar │
├───────────────┬────────────────────────────────────────────────────────────────────┤
│ Home          │ Acme Careers / Talent Ops / Resumes                    [Share] [···]│
│ Career Studio │ ────────────────────────────────────────────────────────────────── │
│  Resumes      │ Page content / module host                                             │
│  Cover Letters│ Context badge:  Acme Careers  •  Talent Ops  •  Member                │
│  Portfolio    │                                                                        │
│ Practice      │                                                                        │
│ Opportunities │                                                                        │
│ ───────────── │                                                                        │
│ Administration│                                                                        │
│ Help          │                                                                        │
└───────────────┴────────────────────────────────────────────────────────────────────┘
```

Rules:

- Tenant/workspace name appears in top bar, breadcrumb, and page context badge on every authenticated tenant route.
- Navigation is generated from server-confirmed permissions; hidden navigation does not replace API policy.
- Certified Resume/CV/Interview modules render inside the module host with compatibility adapters and existing behavior preserved.
- Desktop sidebar, tablet compact rail, and mobile accessible navigation sheet are one responsive system.

## 10.2 Tenant switcher — conceptual wireframe

```text
┌ Select organization ────────────────────────────────────────────────┐
│ Search organizations…                                                │
│ Recent                                                               │
│ ✓ Acme Careers                 Owner       Active                   │
│   Northwind Graduate Program   Member      Active                   │
│ All organizations                                                   │
│   Personal workspace           Owner       Personal                 │
│   Add / request access…                                              │
└────────────────────────────────────────────────────────────────────┘
```

- Shows only active memberships, role label, status, recent order, and search.
- Keyboard: command palette shortcut, arrows, Enter, Escape, visible focus.
- Switching prompts save/discard/cancel for dirty certified builder/interview work; it cancels old context requests and clears tenant-private client cache.
- The request goes to the server for membership validation. Local storage is not proof of context.

## 10.3 Workspace switcher — conceptual wireframe

```text
Acme Careers / [ Talent Ops ▾ ]
  ✓ Talent Ops                 Workspace manager
    Graduate Cohort 2026       Member
    Shared Templates           Viewer
  ─────────────────────────────────────────
    Manage workspaces          (permission-gated)
```

Do not show a workspace switcher in the personal tenant if it has only the default personal workspace; that would create artificial complexity.

## 10.4 Enterprise dashboard

```text
[Organization health] [Seats] [AI budget] [Security tasks]

Recent activity                      Usage trend
• Jaya invited 3 members             AI 62% of monthly budget
• SSO domain verified                Storage 18 GB / 50 GB
• 4 resumes shared                   API within plan

Action queue
[Review pending invite] [Configure SSO] [Resolve data export request]
```

- Owner: usage, seats, security, billing, tenant lifecycle, organizational activity.
- Tenant Admin: members, roles, integrations, policy/setup tasks.
- Member: personal work, recently shared items, Resume/CV/Interview shortcuts.
- No fabricated business metrics; unavailable values state why and link to setup.

## 10.5 Administration center

```text
Administration
  Overview
  Members & invitations
  Teams / groups                  (only when enabled)
  Roles & permissions
  Security
    SSO & SCIM · MFA policy · Sessions · API keys · Service accounts
  AI configuration & usage
  Integrations
  Usage & billing
  Audit logs
  Data & privacy
  Advanced / danger zone
```

Use progressive disclosure. A member sees no admin navigation. A billing administrator sees billing/usage but not private resume content. Platform-support access is visibly separate and time-bound.

## 10.6 Users, teams, roles, and permission UX

| Surface | Required UX behavior |
|---|---|
| Members | Search/filter/invite/status, workspace coverage, last active, clear role summary, no exposure of platform-wide data. |
| Teams | Optional group/member view and external IdP group mapping; explain whether group grants access. |
| Roles | Human-readable permission summary, scope badge (tenant/workspace), impact preview before change, immutable system roles marked clearly. |
| Permission changes | Confirmation, reason where sensitive, step-up authentication when required, audit event, post-change notification. |
| Denied action | Explain missing permission/scope and offer request-access path where policy allows; do not reveal a hidden resource. |

## 10.7 Security, SSO/MFA, and audit UX

```text
Security Center
  [MFA status] [SSO enforcement] [SCIM health] [Active sessions]
  High-risk events ───────────────  Access policy alerts

Audit Logs
  Filters: user | team | resource | action | category | severity | date | workspace
  Results:  time · actor · action · resource · outcome · correlation ID
  Detail drawer: policy decision · before/after digest · related events · support grant
```

The audit table needs keyboard handling, semantic headers/caption, timezone clarity, saved filters, deep links, permission-gated CSV/JSON export, immutable-event indication, and a “why was this allowed/denied?” explanation.

## 10.8 AI workspace, usage/billing, tenant settings, data/privacy UX

| Surface | Wireframe-level requirements |
|---|---|
| AI Workspace | Active tenant/workspace pill; explicit selected source list; scope/retention/memory state; model/provider policy label; citations; regenerate/feedback; clear “not saved/shared” state. |
| Usage & Billing | Plan, billing period, owner, seats, AI/API/storage/render use, limits/forecasts, soft/hard limit behavior, invoices, upgrade/approval path. |
| Tenant Settings | Name/logo/domain, workspace enablement, region/residency policy, allowed integrations, lifecycle status, feature policy — all revisioned/audited. |
| Data & Privacy | Data inventory, exports, retention, legal holds, deletion requests/status, public links, AI memory/RAG policy, support access history. |

## 10.9 Enterprise design-system architecture

The current system can be evolved; it does not need a blind rewrite. It has Tailwind, SCSS, reusable controls, dialogs, toasts, accessible attributes, and module-specific style systems, but no formal cross-product token/component governance.

### Foundation

```text
tokens
  color · typography · spacing · elevation · radius · motion · focus · z-index · chart
    ↓
primitives
  button · field · select/combobox · table · card · dialog · drawer · toast · alert
    ↓
patterns
  app shell · switcher · command palette · empty/loading/error · permission guard
    ↓
feature compositions
  admin center · dashboard · AI scope panel · certified module host
```

### Required patterns

- Navigation: desktop/sidebar/compact/mobile states, current scope, role-aware hierarchy.
- Typography/spacing: semantic scale rather than per-component literals.
- Forms: labels, descriptions, inline errors, validation summary, async/save state.
- Tables: semantic headers/captions, sort/filter/pagination, responsive alternative, row actions.
- Cards/data visualization: accessible values in text, not color alone.
- Dialogs/drawers: focus trap, restore focus, Escape where safe, reduced motion.
- Command palette/search: scope-aware search, no cross-tenant result leakage, keyboard-first.
- States: explicit empty/loading/error/permission-denied/retry states; no endless spinners.
- Permission controls: show why an action is unavailable without disclosing private resources.

Start with tokens + shell + administration primitives. Protect frozen Resume/CV/Interview styling behind compatibility scopes and visual regression gates.

---

# 11. Certified Module Compatibility Validation

| Module | Current ownership | Tenant target | Migration method | Regression risk |
|---|---|---|---|---|
| CV module | UID-owned resume/CV data; static module/templates | Personal workspace by default; explicitly shared/copyable later | Legacy adapter first; no template rewrite | High if routing/data contract changes. |
| 4 CV templates | Static source/rendering assets | Platform-global catalog | No data migration; host/context wrapper only | High visual/print regression if shared CSS changes. |
| 51 resume templates | Static source/rendering assets; UID-owned resume data | Platform-global catalog + tenant-scoped resume aggregate | Preserve template ID/data contract; adapter reads legacy then target | Critical visual/render/export regression risk. |
| DOCX export | UID source document → server buffer | Tenant/workspace source lookup + artifact policy | Keep existing owner path while legacy; move only server lookup behind tenant repository after parity | Critical export/entitlement risk. |
| PDF/print/download | UID source document + one-time render token | Tenant/workspace source + scoped artifact/render job | Preserve render token semantics; add tenant context around issuance | High token/cache/print risk. |
| Resume wizard | Client state + UID Firestore persistence | Scoped resume aggregate | Wrap persistence adapter; preserve wizard UI/state machine | Critical frozen wizard behavior risk. |
| Experience calculation | Pure client `resumeData` utility | No ownership change; operates on current authorized aggregate | No migration beyond compatibility tests | Low code risk, high if data normalization changes. |
| Recommendation deduplication | Client steps + AI runtime constraints | Current document/tenant scope | Preserve existing fields/negative constraints; add source context outside algorithm | High AI UX regression risk. |
| AI Interview Coach | UID local session/history + selected resume facts | Personal context first; durable tenant history only later by explicit design | Keep local legacy history personal-only; new scoped store opt-in | Critical zero-leakage/history risk. |
| CBT simulator | Browser component state | Same tenant context as interview session | Shell/context wrapper; no timer/exam rewrite | High behavioral/accessibility risk. |
| Timer | Local deadline/session state | Tenant-scoped session key only when durable/multi-context state added | Preserve deadline logic; version storage key/adapter | High exam continuity risk. |
| Anti-tab switching | Browser event behavior | No ownership change | Leave behavior intact; ensure context switch is blocked/confirmed during exam | High integrity UX risk. |
| Comprehensive reports | Client-generated report/history | Personal legacy context; future tenant workspace report record | Do not upload historical reports automatically | Medium privacy/history risk. |
| AI provider failover | Platform-global server provider router | Tenant policy-approved provider/model set | Preserve router/fallback semantics; filter candidates by tenant policy | Critical availability/security risk. |
| AI hardening | Server auth, input bounds, secret handling/parsing | Tenant-aware extension | Retain existing route guards and add context broker, never relax them | Critical security risk. |
| Zero-leakage pipeline | Client identity-state isolation + backend identity-field rejection | Server-authorized tenant/resource context | Strengthen through source broker/RLS/job/cache/vector scopes | Critical confidentiality risk. |

### Compatibility rule

No certified module is migrated merely because a tenant table now exists. For each aggregate, the new adapter must preserve its exact data, presentation, export, timing, and error contracts; then pass `test:interview`, `test:security`, `test:product`, focused migration tests, and affected visual/export/browser tests before cutover.

---

# 12. UNKNOWN / NEEDS VERIFICATION

The following cannot be confidently proven from the repository and remain explicit unknowns:

## Production and infrastructure

- Actual production hosting topology, Node process manager, autoscaling, load balancer, origin firewall, trusted proxy hop count, and Cloudflare cache/WAF/header rules.
- Actual deployed `COMMIT_SHA`, build artifact digest, webroot synchronization, cache purge, health/readiness, and rollback mechanics.
- Active GitHub CI/branch protections, artifact signing, deployment approvals, secret scanning, or CodeQL execution. Only documentation templates/Dependabot configuration are tracked.
- Production Firebase project IAM, service-account privileges, Identity Platform configuration, MFA settings, Firestore/RTDB rule/index deployment, TTL policy, backups, and restore success.
- Any hidden production PostgreSQL, Redis, queue, object store, vector store, or external storage configuration. None is repository-managed.
- Cloud region/residency, KMS/Secret Manager use, network egress policy, and provider DPA/zero-retention terms.

## Data and migration

- Actual Firestore document shape/quality/volume, legacy duplicates, orphan documents, missing owner fields, invalid IDs, and index coverage.
- Which customers intend to use organization/workspace collaboration versus personal-only use.
- Contractual definition of a tenant, data controller/processor roles, data ownership, legal retention, and export/deletion requirements.
- Deterministic owner mapping for companies, jobs, job applications, RTDB conversations, historical AI usage, and financial records.
- Whether public resume/portfolio links require tenant branding, domain mapping, legal review, or public URL preservation during migration.

## Identity and AI

- Selected enterprise IdP/broker, supported SAML/OIDC/SCIM matrix, domain-verification process, session/recovery policy, and break-glass process.
- AI provider contractual isolation, allowed regions/models, BYOK requirements, prompt retention/training policy, and enterprise budget/chargeback rules.
- Whether future RAG, vector search, AI memory, attachments, team sharing, or collaborative resume editing are actually product requirements.

## Validation gaps

- Firebase emulator rules are still not executable in this sandbox because Java is unavailable.
- Browser/accessibility/real-PDF production journeys are not proven here because no Chromium executable/staging fixture is available.
- No real PostgreSQL/RLS/pool proof can occur until a non-production data-plane environment is approved.

Unknowns are not defects by themselves. They are blockers when an implementation decision would require guessing.

---

# 13. Architecture Validation Summary

| Area | Feasibility judgment | Rationale |
|---|---|---|
| Shared PostgreSQL + RLS normal tier | **Feasible with proof gate** | Clean opportunity because no existing SQL layer must be unwound; requires strict transaction/pool/role design and test harness. |
| Firebase compatibility bridge | **Feasible** | Current UID path structure is strong for personal data; adapters can preserve baseline behavior. |
| Automatic legacy tenant assignment | **Partially feasible** | Personal career data maps deterministically; company/job/message/billing categories do not all map safely without policy/resolution. |
| Multi-organization memberships | **Feasible** | Requires new control plane; no current data model conflict if personal data remains personal by default. |
| Dedicated tier | **Feasible** | Requires global routing/control plane and tier definitions; should be selective, not default. |
| Tenant AI isolation | **Feasible with strict conditions** | Existing baseline is a strong foundation; tenant config/cache/RAG/job controls are absent and must be designed/tested before rollout. |
| Tenant cache/worker/file isolation | **Feasible with new infrastructure** | Current process-local design must not be stretched into horizontal enterprise scale. |
| Premium enterprise UX | **Feasible incrementally** | Existing shell/routes can host new context primitives; design system/switcher/admin center should precede broad restyling. |
| Immediate implementation | **Not approved** | Critical preconditions below remain unresolved. |

---

# 14. Required Pre-Implementation Proofs

These are validation artifacts, not an invitation to modify the certified product now.

1. **RLS proof-of-isolation ADR and disposable integration harness**
   - Database roles, forced RLS, transaction-local context, pooling behavior, bypass register, report/admin/worker cases.
2. **Legacy ownership decision register**
   - One approved deterministic rule for every current Firestore/RTDB collection and browser state category; unresolved records are explicitly blocked.
3. **Tenant registry/routing ADR**
   - Control-plane placement, route versioning, shared/dedicated tier profile, region/failover/DR transition rules.
4. **Identity and membership ADR**
   - Firebase bridge, principal mapping, tenant membership semantics, IdP/SAML/OIDC/SCIM choice, session and support access model.
5. **AI tenant boundary ADR**
   - Source context broker, configuration/vault policy, provider failover constraints, cache/memory/RAG/vector namespace, usage ledger, deletion propagation.
6. **Worker/file/cache contract**
   - Canonical job envelope, cache-key standard, signed URL/quarantine policy, render-worker isolation, idempotency/DLQ behavior.
7. **Certified module compatibility matrix acceptance**
   - Per-module legacy adapter plan, feature flags, rollback contract, focused regression/visual/export evidence.
8. **Production evidence access plan**
   - Named owners for Firebase rules/IAM, deployment/Cloudflare, secrets, backups/restore, staging, providers, penetration/accessibility/load validation.

---

# 15. Final Architecture Decision — APPROVE WITH CONDITIONS

The hybrid architecture is approved **as the target direction**, but implementation is blocked until the following conditions are closed and recorded.

## BLOCKER 1 — Prove RLS transaction context with pooling

**Condition:** A non-production PostgreSQL harness proves transaction-local tenant context, pooled-connection cleanup, `FORCE RLS`, no runtime bypass, reporting safety, worker safety, and tenant-A/B adversarial tests.

**Why blocking:** The current repository contains no PostgreSQL. The most important proposed tenant control cannot be assumed from architecture diagrams.

## BLOCKER 2 — Approve deterministic Firebase ownership mapping

**Condition:** Approve the mapping rules and a migration ledger for every source category. Resolve companies, jobs, job applications, RTDB conversations, historical AI usage, public projections, duplicated portfolios, and finance/legal records.

**Why blocking:** A user can later belong to multiple organizations; UID ownership alone cannot retroactively identify the correct business tenant for all resources.

## BLOCKER 3 — Finalize tenant registry and data-plane routing

**Condition:** Define control-plane authority, `tenant_routes` schema, data-plane profiles, routing version, shared/dedicated promotion, regional movement, failover, and restore behavior.

**Why blocking:** RLS is not enough if the application can select a wrong shared/dedicated connection pool or region.

## BLOCKER 4 — Finalize enterprise identity/membership policy

**Condition:** Select managed IdP/broker approach and define principal mapping, SSO/SAML/OIDC/SCIM scope, MFA/session policy, platform vs tenant roles, service accounts/API keys, and JIT support access.

**Why blocking:** Tenant membership is the authorization root of the entire design.

## BLOCKER 5 — Approve AI/cache/worker/file isolation contracts

**Condition:** Approve tenant AI policy/context broker, cache keys/invalidation, job envelope/re-authentication, provider failover constraints, vector/RAG policy, artifact namespace, signed URL/quarantine, and usage/retention policy.

**Why blocking:** The existing AI baseline is secure in a UID context but lacks tenant-aware memory/config/cache/job boundaries.

## BLOCKER 6 — Establish a production validation ownership plan

**Condition:** Obtain authorized evidence/owners for Cloudflare, hosting, Firebase IAM/rules/indexes, secrets, staging, backup/restore, provider contracts, CI, penetration testing, accessibility, and load testing.

**Why blocking:** Enterprise guarantees require deployed operational proof, not source-only intent.

## BLOCKER 7 — Approve certified-module migration gates

**Condition:** Each certified module has an explicit owner, adapter strategy, regression suite, visual/export acceptance criteria, feature flag, and rollback plan.

**Why blocking:** The target must add tenancy around proven behavior, not destabilize it.

Until all seven blockers are accepted and the necessary proof artifacts pass, the correct decision is **not to implement**.

---

# 16. Final Target Architecture

```text
                              PLATFORM CONTROL PLANE
 ┌────────────────────────────────────────────────────────────────────────────┐
 │ Tenant registry / routing / lifecycle / billing / audit index              │
 │ Principal + identity links / memberships / roles / policy versions         │
 │ IdP federation (Firebase bridge, OIDC, SAML, SCIM)                         │
 └────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
                              TENANT ROUTER
                     validates membership + policy + route version
                         │                                 │
             ┌───────────┴───────────┐         ┌───────────┴───────────┐
             │     SHARED TIER        │         │    DEDICATED TIER     │
             │ PostgreSQL shared      │         │ Dedicated PostgreSQL  │
             │ schema + FORCE RLS     │         │ DB / approved region  │
             │ tenant cache namespace │         │ dedicated key/storage │
             │ partitioned workers    │         │ reserved worker pool  │
             └───────────┬───────────┘         └───────────┬───────────┘
                         │                                 │
                         └──────────────┬──────────────────┘
                                        ▼
                     MODULAR APPLICATION + CERTIFIED MODULE HOSTS
          Auth → TenantContext → Policy → Repository/legacy Firebase adapter
                                        │
       ┌────────────────┬───────────────┼─────────────────┬────────────────┐
       │                │               │                 │                │
     Cache          Workers          AI context        Files/Search   Audit/Metrics
       │                │               │                 │                │
       └────────────────┴───────────────┴─────────────────┴────────────────┘
                                        │
                          Firebase legacy bridge (temporary)
                    UID-owned certified data until aggregate cutover
```

### Immutable architectural rules

1. The control plane knows where a tenant lives; clients do not.
2. Tenant membership is resolved before a data plane is selected.
3. Every shared-plane tenant query runs inside an explicit transaction with RLS context.
4. Dedicated is a documented profile, not an uncontrolled infrastructure fork.
5. Firebase remains the current source for certified aggregates until a deterministic migration passes its module gates.
6. AI, cache, queue, files, search/vector, audit, and observability use the same tenant/workspace scope as the primary data access.
7. Tenant A must never receive, retrieve, infer, or expose Tenant B data.

---

# 17. Implementation Gate

No application implementation should begin yet.

When the blocking conditions are closed, the first implementation phase must:

- start from `10196c029758e000f7c602b874c5976a1ffba890` on the Arena branch;
- identify every affected certified baseline before a change;
- introduce the control-plane/tenant-context seams before moving certified data;
- retain current Firebase UID behavior through explicit adapters;
- keep `test:interview`, `test:security`, and `test:product` green at their certified counts;
- add isolation, pooling/RLS, AI, cache, worker, storage, accessibility, visual/export, and migration regression suites before cutover;
- use staged feature flags, canaries, migration ledgers, and rollback/forward-repair plans;
- not claim enterprise production readiness until deployed infrastructure and operational evidence are independently validated.

**Final validation conclusion:** the architecture should proceed only through the listed proof gates. It is strong enough to preserve as the approved target direction, but not yet sufficiently evidenced to begin implementation safely.
