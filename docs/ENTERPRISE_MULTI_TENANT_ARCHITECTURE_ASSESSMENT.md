# ResumePilot AI — Enterprise Multi-Tenant Architecture & Premium UX Assessment

**Assessment date:** 2026-08-20 (UTC)  
**Repository / branch assessed:** `bhaskarbeyond-creator/ResumePilotAi`, `arena/01a01c9e-resumepilotai`  
**Assessment mode:** discovery and architecture recommendation only — **no application, baseline, infrastructure, or production change was implemented**.

> **Decision in one sentence:** Preserve the certified product as a modular-monolith product surface, introduce an explicit tenant control plane and server-enforced tenant context, use a shared-schema/RLS data plane for normal tenants, and offer a dedicated data plane only to contractually justified enterprise tenants. Do **not** “add `tenant_id` everywhere,” and do **not** begin with a microservice rewrite.

---

## Evidence standard and scope

This report distinguishes three kinds of statements:

- **Locally verified:** source, Git state, commands, and tests inspected or executed in this checkout.
- **Repository-declared:** documented in the repository, but not independently executable in this sandbox.
- **Externally attested:** supplied in the task context; useful for reconciliation, but not independently provable without production access, deployment telemetry, and cloud IAM access.

Key code evidence includes `.agents/AGENTS.md`, `package.json`, `src/main.jsx`, `src/conf/fire.js`, `src/firestore/dbOperations.js`, `SecurityRules.txt`, `Realtime_database_Security_rules.txt`, `backend/index.js`, `backend/security/*`, `backend/routes/ai.js`, `backend/services/aiRuntime.js`, `backend/services/notificationOutbox.js`, `.htaccess`, and the existing test suites.

The review deliberately does **not** treat a code inspection as proof of deployed Cloudflare rules, Firebase IAM, Firestore rules deployment, provider configuration, backup execution, production cache purge, or production health. Those require external evidence.

---

# 1. Executive Summary

ResumePilot AI is currently a feature-rich, **user-isolated career-product SaaS**, not an organization/workspace multi-tenant SaaS. It has important production-strength building blocks:

- A protected Resume Builder, 51-template rendering and DOCX pipeline, CV/print/download path, Interview Coach/CBT flow, and hardened AI provider failover.
- Firebase Auth identity, owner-scoped Firestore paths, deny-by-default Firestore/Realtime Database rules, backend bearer-token verification, server-owned payment/AI secrets, and extensive regression coverage.
- An Express backend that owns sensitive API operations, PDF export authorization, DOCX generation, payment flows, administrative mutation, and AI provider execution.

It does **not** yet have the concepts or enforcement points required for enterprise tenancy:

- no tenant, organization, membership, workspace, team, tenant lifecycle, tenant subscription, tenant usage ledger, tenant switcher, or tenant-aware audit model;
- no server-issued immutable tenant context;
- no database row-level security (RLS), tenant-aware cache, queue envelope, object-storage namespace, vector namespace, or tenant-specific AI configuration;
- no SAML, SCIM, service account/API-key model, tenant RBAC, or enterprise administration center;
- no proven production IaC, centralized observability, shared rate limiting, disaster recovery, or restore drill.

The safest strategic answer is a **hybrid tenancy architecture**, not a blanket database-per-tenant approach:

1. A **shared platform control plane** manages organizations, memberships, identity links, plans, billing, audit metadata, policy versions, data residency, and routing.
2. A **shared-schema, server-mediated tenant data plane** is the default for standard and most enterprise tenants. New tenant-scoped relational records use PostgreSQL RLS; cache, queue, file, AI, and observability boundaries all carry the same tenant context.
3. A **dedicated data plane** is available only for tenants with contractual isolation, data-residency, customer-managed-key, regulated-workload, or extreme-capacity requirements.
4. The current Firebase user trees remain a **legacy compatibility data plane during migration**, behind adapters, so the certified product is not rewritten merely to introduce tenancy.

The target runtime should be a **modular monolith plus separately scalable workers**, not a microservice program. The current code already has meaningful module seams (AI, export, DOCX, email, administration). Extracting every module into a network service now would increase operational risk and would not solve tenancy by itself.

---

# 2. Certified Baseline Verification

## 2.1 Git and baseline state

| Verification item | Result | Evidence / caveat |
|---|---|---|
| Working branch | **Verified:** `arena/01a01c9e-resumepilotai` | `git status --short --branch` before report creation was clean. |
| Current `HEAD` | **Verified:** `10196c029758e000f7c602b874c5976a1ffba890` | Commit subject freezes the `2be055e` wizard/recommendation/processing-modal baseline. |
| Local `origin/main` | **Verified:** `10196c029758e000f7c602b874c5976a1ffba890` | Local ref matches `HEAD`. |
| Remote `origin/main` | **Verified:** `git ls-remote origin refs/heads/main` returned `10196c029758e000f7c602b874c5976a1ffba890`. | Confirms the GitHub branch ref, not the deployed webroot. |
| Production SHA | **Reconciled, externally attested:** `10196…890` | The task’s production SHA matches local/remote `main`. This checkout has no signed deployment manifest or production artifact digest with which to independently prove it. |
| Historical certified commits | **Declared in freeze rules** | The checkout is shallow (`git rev-parse --is-shallow-repository` is `true`) and contains only the grafted tip, so the eight historical objects cannot be independently diffed here. Their names and protected scope are explicitly declared in `.agents/AGENTS.md`. |
| Freeze rules | **Verified** | `.agents/AGENTS.md` §6 contains all eight baselines and the modification protocol. |
| Destructive operations | **None performed** | No reset, rewrite, deployment, production mutation, or baseline code modification was performed for this assessment. |

## 2.2 Protected baseline register

| Protected capability | Declared baseline | Required preservation rule |
|---|---:|---|
| CV module + four CV templates + print/download | `1cf3d5d` | Preserve render, print, download, and existing CV ownership behavior. |
| Resume Builder + 51 templates | `1ffa9f7` | Preserve template identifiers, data contract, rendering, and wizard behavior. |
| High-fidelity DOCX pipeline | `2c45381` | Preserve 51-template DOCX mapping and export authorization behavior. |
| AI Interview Coach + CBT engine | `a15dd5d` | Preserve timer, anti-tab-switch behavior, scoring, history semantics, and reports. |
| AI provider fix/failover | `9f7dea7` | Preserve provider/model fallback behavior. |
| AI hardening/resilience | `9c479ff` | Preserve server-only credential and resilient parsing controls. |
| Contextual Interview Coach / zero-leakage pipeline | `54cb62f` | Preserve identity-field rejection, bounded context, bearer authentication, and user-scoped client state. |
| Wizard engine / recommendation deduplication / processing modal | `2be055e` | Preserve frozen `BuildResume`, `DashboardInterviews`, `resumeData`, Summary, Skills, Certifications, and AI-runtime contracts described in the rules. |

## 2.3 Tests and build executed in this assessment

The initial checkout had no installed root or backend dependencies. `npm ci --ignore-scripts` was used in the root and `backend/` only to prepare the local test environment; `node_modules` is ignored and no tracked dependency file changed.

| Command | Locally verified result |
|---|---|
| `npm run test:interview` | **PASS — 28/28** |
| `npm run test:security` | **PASS — 163/163** |
| `npm run test:product` | **PASS — 301/301** |
| `npm run build` | **PASS**; Vite completed in 4.70s in this environment. |
| `npm audit --omit=dev --audit-level=high` | **PASS — 0 vulnerabilities** |
| `npm --prefix backend audit --omit=dev --audit-level=high` | **PASS — 0 vulnerabilities** |
| `npm run test:firebase-rules` | **Not executable here:** `java` is not installed. The Firebase CLI is present, but the emulator suite cannot start without Java. |
| Browser/live production journeys | **Not executed:** no Chromium executable, authenticated staging fixture, or production control-plane access was available. |

These results confirm the three named certified suites at the stated counts. They do **not** substitute for deployed Firebase rules, real provider, browser, load, or production verification.

## 2.4 Deployment-state reconciliation

The repository implements an Apache/PHP same-origin proxy (`.htaccess`, `api/index.php`) to a Node service on port 8080, and it includes CSP/HSTS/header configuration. There is no tracked Dockerfile, Terraform, CloudFormation, Kubernetes manifest, active GitHub Actions workflow, Cloudflare configuration export, deployment manifest, or `COMMIT_SHA` endpoint implementation in this tree. Only workflow templates exist under `docs/ci-templates/`.

The task attests that production webroot synchronization, Cloudflare cache purge, `COMMIT_SHA`, and `/api/health` are healthy. A safe unauthenticated request from this sandbox to the backend’s declared default host (`https://airesume.projectdemo.guru/api/health`) failed during TLS negotiation with `SSL_ERROR_SYSCALL`; it therefore cannot independently confirm or deny production health. Treat the production facts as **externally attested and reconciled to Git**, not locally certified by this assessment.

---

# 3. Current Architecture Map

## 3.1 Runtime topology observed in code

```text
Browser
  ├─ Vite-built React 19 SPA + React Router 7
  ├─ Firebase compat SDK: Auth, Firestore, Realtime Database
  ├─ local React state / Context / class-component state
  └─ same-origin fetch/axios bearer-token interceptor
        │
        ▼
Cloudflare / edge                         (attested; configuration not in repository)
        │
Apache + .htaccess / PHP proxy            (tracked)
        │  /api/* → localhost:8080
        ▼
Express 5 modular monolith                (backend/index.js, ~4.6k lines)
  ├─ Firebase Admin / Firestore / RTDB
  ├─ AI routes + provider runtime
  ├─ PDF render via Playwright/Chromium in process
  ├─ DOCX generation in process
  ├─ payment/OAuth/email/admin routes
  └─ optional timer-based CMS/outbox workers
        │
        ├─ Firebase Auth / Firestore / Realtime Database
        ├─ Gemini, NVIDIA, OpenAI, Groq, OpenRouter, DeepSeek
        ├─ Stripe, PayPal, Razorpay, Paytm, PhonePe
        ├─ SMTP/IMAP/Twilio
        └─ Playwright browser process
```

## 3.2 Frontend

| Area | Actual implementation |
|---|---|
| Framework and routing | Vite + React 19 + React Router `BrowserRouter`; routes are defined in `src/main.jsx`. Lazy-loaded feature routes include dashboard, admin, Resume Builder, portfolios, jobs, blog, billing, and export. |
| State | No Redux, Zustand, React Query, or central domain store is present. State is primarily component-local `useState`, class state, `AuthContext`, Firebase listeners, and browser storage. |
| Authentication boundary | `src/main.jsx` attaches a Firebase ID token only to same-origin `/api/` calls. `RequireAuthenticated` guards private React routes. |
| Data access | `src/firestore/dbOperations.js` is a large direct Firebase client-access layer (~230 KB), plus dedicated persistence helpers. Many feature modules read/write Firestore directly under current user paths. |
| UI shell | `AuthenticatedAppShell` wraps authenticated builder routes with `ProfileDisplay`; dashboard and admin have separate navigation constructs. There is no tenant/workspace shell or context switcher. |
| Feature flags/configuration | Public Firestore `data/public_config`, admin settings endpoints, and `moduleFlags` provide module/config behavior. |
| i18n | i18next-backed locales are present. |

## 3.3 Backend

| Area | Actual implementation |
|---|---|
| API | Express 5 in a single process (`backend/index.js`) with route modules for AI and email. It has JSON limits, Helmet, CORS, request IDs, auth middleware, endpoint policy, and rate limiting. |
| Authentication | Firebase Admin verifies bearer ID tokens and attaches `req.user = { uid, email, emailVerified, claims }`. |
| Authorization | Current platform roles/permissions are in `backend/security/auth.js`: `SUPER_ADMIN`, `ADMIN`, and `SUPPORT`, plus custom permissions. Route policy handles admin, verified-email, and recent-auth checks. |
| AI | `backend/routes/ai.js` rejects client-supplied credentials and identity fields; `backend/services/aiRuntime.js` has provider routing, timeout/failover, structured-output parsing, and configuration caching. |
| Documents | PDF is rendered through a one-time Firestore render token and an in-process Playwright browser. DOCX is generated into a buffer and streamed. |
| Work | A Firestore notification outbox exists with lease/retry/dead-letter states. CMS scheduling and the outbox can be activated as timer loops in the same Node executable. |
| Logging | Request IDs, `console` logs, and Firestore `security_audit_logs` exist. There is no central log/trace/metric pipeline in source. |

## 3.4 Current data systems

| System | Current role | Important tenancy observation |
|---|---|---|
| Firebase Auth | Consumer identity, custom claims, password/OAuth/TOTP support | Firebase UID is the current effective account boundary. |
| Cloud Firestore | Primary application data, settings, payments, documents, public content, audit records | Shared project/database and shared collection vocabulary. User isolation is mostly path/owner-field based, not tenant based. |
| Realtime Database | Conversations/messages | Shared paths keyed by participant/conversation IDs, guarded by participant rules. |
| Firebase Storage | Configured only | No application `storage()` data-flow was found. Current PDF/DOCX files are not retained in object storage. |
| Browser storage | Resume recovery, current-document compatibility state, interview history/session, preferences | Several keys are user-scoped and sign-out clears known account data; keys are not tenant/workspace scoped because those concepts do not exist. |
| Cache | Browser/public settings cache; process-local maps/counters; AI provider configuration cache | No Redis/distributed cache; no tenant namespace. |
| Queue | Firestore notification outbox + in-process intervals | No generic durable queue for PDF/AI/background work. |

## 3.5 Representative runtime flows

### Resume/CV and export flow

```text
Authenticated Firebase user
  → Firestore users/{uid}/resumes/{resumeId} or covers/{id}
  → protected builder/templates
  → /api/export or /api/export-docx with bearer token
  → backend re-loads only users/{req.user.uid}/… document
  → checks subscription entitlement
  → PDF: one-time hashed Firestore render token → Playwright → in-memory PDF stream
  → DOCX: authoritative template resolution → in-memory DOCX buffer stream
```

The private PDF/DOCX paths are owner-scoped today. Public export is separately allowed only for explicitly published `pb/{resumeId}` records. There is no persistent generated-file repository in source.

### Interview/AI flow

```text
Authenticated user + selected owned resume facts
  → DashboardInterviews local state
  → same-origin /api/generate-interview bearer request
  → global API auth/policy/rate/quota middleware
  → AI route rejects apiKey, uid, userId, ownerUid, resumeId, profileId from body
  → bounded prompt construction and provider failover
  → validated question payload
  → user-scoped localStorage interviewSession:{uid}, interviewHistory:{uid}
```

This is an important current **user-context zero-leakage control**. It is not yet a tenant architecture because the server has no tenant membership context and does not persist enterprise AI context/memory/RAG data.

### Messaging and background flow

```text
Request → Express → Firestore/RTDB transaction
                  → notification_outbox Firestore document
                  → optional process-local interval worker
                  → SMTP provider
```

The outbox has durable event records and leases, but the worker topology is optional and is not a dedicated queue/worker deployment.

---

# 4. Current Tenancy Model

## 4.1 What exists today

| Concept | What the application currently means by it |
|---|---|
| User | A Firebase Auth principal and normally a Firestore `users/{uid}` profile. |
| Account | Effectively synonymous with one user/UID. Membership, payment status, personal documents, preferences, and account lifecycle are associated with the UID. |
| Organization / tenant | **Does not exist** as a data model, token claim, route context, API context, or UI concept. |
| Workspace | **Does not exist.** Some screens use the word conversationally, but there is no workspace object or permission boundary. |
| Team | **Does not exist** as a collaboration/authorization entity. |
| Admin | A platform-level Firebase custom claim/permission such as `ADMIN` or `SUPER_ADMIN`; it is not scoped to an organization. |
| Platform admin | Existing administrative roles are globally scoped across the shared product environment. |
| Employer | A user capability/claim and application state for job-posting features, not a tenant. |

The primary private paths are user-owner paths such as:

```text
/users/{uid}/resumes/{resumeId}
/users/{uid}/covers/{coverId}
/users/{uid}/coverLetters/{coverId}
/users/{uid}/portfolios/{portfolioId}
/users/{uid}/jobTracker/{jobId}
/notifications/{uid}/userNotifications/{notificationId}
```

Some shared-root collections use owner fields such as `userId`, `ownerUid`, `authorUid`, or `employerId` (`portfolios`, `pb`, `blog_posts`, `jobs`, `jobApplications`, financial records). Firestore rules and server handlers generally enforce the appropriate current user/owner relationship.

## 4.2 Current classification

> **Current tenancy model: user-isolated, account-based application on a shared Firebase project/database/schema. It is not organization-based multi-tenancy.**

More precisely:

- **Database model:** shared Firestore database/shared collection schema; shared RTDB hierarchy.
- **Isolation model:** mostly UID path ownership and document-owner checks, reinforced by Firestore rules and sensitive server routes.
- **Identity model:** one person normally owns one personal account; no membership relation allows the same identity to enter multiple business organizations.
- **Authorization model:** platform admin/support role checks plus resource ownership; no tenant-scoped role grants.
- **Commercial model:** individual plan/membership and AI quota, not organization seats, shared billing account, tenant quota, or cost center.

This existing user isolation is valuable and should be retained as a compatibility invariant. It must not be mislabeled as true multi-tenancy.

---

# 5. Multi-Tenant Architecture Comparison

Scores are relative to **this application’s target state**. For “development/operational complexity” and “operational burden,” a higher score means simpler/lower burden. A secure implementation is assumed; an unprotected shared schema is not being given credit merely because it is inexpensive.

| Criterion | A. Shared DB / shared schema | B. Schema per tenant | C. Database per tenant | D. Hybrid model |
|---|---:|---:|---:|---:|
| Security | 7 | 7 | 9 | 9 |
| Tenant isolation | 6 | 7 | 10 | 9 |
| Development simplicity | 9 | 4 | 2 | 7 |
| Operational simplicity | 9 | 3 | 2 | 7 |
| Cost efficiency | 10 | 5 | 2 | 7 |
| Performance | 8 | 5 | 8 | 9 |
| Scalability | 8 | 5 | 7 | 9 |
| Enterprise readiness | 7 | 5 | 9 | 10 |
| Compliance flexibility | 6 | 6 | 10 | 9 |
| Backup / tenant restore | 8 | 4 | 10 | 9 |
| Disaster recovery | 8 | 4 | 9 | 9 |
| Tenant migration | 9 | 3 | 8 | 9 |
| Noisy-neighbor protection | 5 | 6 | 9 | 9 |
| Very large enterprise tenants | 6 | 5 | 9 | 10 |
| Future flexibility | 8 | 4 | 8 | 10 |
| AI isolation | 7 | 6 | 9 | 10 |
| Low ongoing operational burden | 9 | 3 | 2 | 7 |
| **Overall fit for ResumePilot AI** | **7.6** | **4.9** | **7.5** | **9.0** |

### A. Shared DB / shared schema

This is closest to the current Firebase model and is the best default *data-plane shape* for the majority of SaaS tenants when strengthened with server mediation, PostgreSQL RLS, composite tenant keys, tenant-aware cache/queue/storage policies, and automated isolation testing. It is inexpensive and operationally tractable. It is insufficient by itself for demanding regulated/dedicated customers and becomes dangerous if application code merely remembers to add a filter.

### B. Shared DB / schema per tenant

This is a poor fit. Firestore has no relational schema construct, and dynamic relational schemas create migration, connection-pooling, reporting, backup, and observability complexity. It provides neither the strong operational isolation of database-per-tenant nor the simplicity of a disciplined shared schema. It should not be selected.

### C. Database per tenant

This gives the strongest default blast-radius and restore boundary, but would impose a large routing, migration, cost, monitoring, key-management, and support burden. It would require dynamic Firebase/project configuration or a substantial data-platform rewrite, threatening certified behavior without proportional benefit for every customer. It is appropriate as a premium exception, not the global default.

### D. Hybrid

A hybrid design preserves the shared-plane economics and developer velocity for normal customers while allowing a dedicated data plane for tenants with an actual contractual reason. It also lets the product retain the current Firebase user-isolated baseline during a controlled strangler migration. Its only meaningful cost is the need for an explicit tenant directory/routing layer — a cost that enterprise tenancy requires anyway.

---

# 6. Recommended Multi-Tenant Model

> ## Recommended Multi-Tenant Model: **Hybrid multi-tenancy**
>
> **Default tier:** shared-schema, server-mediated tenant data plane with PostgreSQL RLS and tenant-aware cache/queue/file/AI boundaries.  
> **Dedicated tier:** isolated database/data plane for regulated, residency-bound, customer-managed-key, contractually isolated, or exceptionally high-scale enterprises.  
> **Migration bridge:** preserve the existing Firebase UID-owned document trees until each certified module is migrated behind an adapter and re-certified.

## 6.1 Why this is the best fit

1. **It protects the baseline.** The current product has extensive direct Firestore use and production-certified behavior. A forced physical migration of all user data before introducing tenant context would be high risk and unnecessary.
2. **It makes isolation enforceable.** New enterprise data can use a database with native RLS and server-only access rather than relying on every client query to remember a filter.
3. **It makes enterprise exceptions commercially viable.** Dedicated storage/compute becomes an explicit premium capability rather than an expensive default.
4. **It avoids a false choice.** The architecture can use a shared default plane and still give a customer a dedicated plane when their DPA, residency, recovery, or capacity requirements demand it.
5. **It aligns with the current stack.** Firebase/Google Cloud is already foundational. A gradual Cloud SQL/PostgreSQL control/data-plane addition, managed workers, Redis, object storage, and Secret Manager is less disruptive than a wholesale replacement of the product.

## 6.2 Tier assignment policy

| Tier | Intended tenants | Data-plane shape | Reason |
|---|---|---|---|
| Personal / self-service | Existing individual users and small teams | Shared RLS data plane; legacy Firebase bridge while needed | Lowest cost; preserves existing behavior. |
| Standard business / enterprise | Most organizations | Shared RLS data plane, tenant quotas, encryption, audit, SSO options | Strong logical isolation with predictable operations. |
| Regulated / dedicated enterprise | Data-residency, regulated, high-volume, customer-managed-key, contractual-isolation, or custom RTO/RPO customers | Dedicated database/worker pool/object-storage key; optionally dedicated cloud project where contractual requirements justify it | Provides stronger blast-radius, restore, residency, and support boundaries. |

A large tenant does **not** automatically need a database. Start with quota and worker-pool isolation. Promote only after a documented security, legal, recovery, performance, or commercial threshold is met.

## 6.3 Architectural style

**Recommended:** modular monolith + independently deployable workers.

- Keep one versioned application API and one codebase initially.
- Organize code by bounded domain: Identity, Tenancy, Authorization, Resume/CV, Interview, AI, Exports, Billing, Administration, Notifications.
- Separate only workload-specific execution planes: PDF renderer, AI/background jobs, notifications, scheduled lifecycle work.
- Use an outbox/event contract where cross-domain effects matter.
- Do not create a network service for each current folder. Extract a service only when it needs independent scale, ownership, security boundary, release cadence, or failure isolation.

---

# 7. Tenant Hierarchy

## 7.1 Recommended hierarchy

```text
Platform
  └─ Organization (the tenant; mandatory boundary)
       ├─ Organization members and tenant-level policies
       ├─ Billing account / plan / data-residency policy
       └─ Workspace (optional but supported)
            ├─ Workspace membership overrides
            ├─ Career artifacts, workflows, and AI context
            └─ Optional groups/teams when a real collaboration requirement exists
                 └─ Users, service accounts, and API keys
```

### Why workspace is optional

The existing product is personal-career oriented. Making every individual navigate an artificial team/workspace hierarchy would add friction and break mental models. Every organization receives a default workspace; a personal account is represented as a private personal organization with one private workspace. Additional workspaces are enabled only where a tenant needs separation by department, client, career cohort, recruiter program, or policy.

### Why team is not initially a mandatory entity

Start with IdP groups and tenant/workspace membership. Introduce persisted team entities only when teams own resources, approval flows, quotas, or policy boundaries. Avoid creating a “team” table solely to mirror an org chart.

## 7.2 Personal-account migration mapping

```text
Existing Firebase UID
  → immutable principal_id
  → personal organization (one owner)
  → default personal workspace
  → legacy user data adapter maps to users/{uid}/…
```

This gives every existing user a tenant context without moving certified documents on day one.

---

# 8. Identity Architecture

## 8.1 Separate the three concerns

| Concern | Definition | Target responsibility |
|---|---|---|
| Authentication | Proving who/what the principal is | Managed identity broker / IdP; Firebase/Auth bridge during migration. |
| Authorization | Deciding what the authenticated principal may do | Tenant-aware policy evaluation using membership, role grants, resource attributes, and current tenant status. |
| Tenant isolation | Ensuring data and side effects are constrained to the authorized organization/workspace | Immutable server-side `TenantContext` propagated through APIs, data, cache, jobs, files, AI, logging, and audit. |

## 8.2 Current versus target identity capabilities

| Capability | Current | Target |
|---|---|---|
| Email/password | Firebase Auth | Retain during migration. |
| Social OAuth | Google/Facebook Firebase flows; LinkedIn/GitHub server OAuth/custom-token flow | Retain as consumer login; map to immutable principal. |
| OIDC enterprise federation | Not implemented | Managed OIDC federation per tenant; domain discovery and tenant IdP policy. |
| SAML | Not implemented | Use a managed SAML implementation, not custom XML parsing. |
| MFA | Firebase native TOTP code path | Tenant policy enforcement, step-up rules, recovery/support policy, session risk signals; external deployment validation required. |
| SCIM | Not implemented | SCIM 2.0 user/group provisioning and deprovisioning for enterprise tenants. |
| Sessions | Firebase token lifecycle; no application session inventory | Session registry, revocation, device/session UX, short-lived access tokens/rotated refresh or broker sessions, JIT step-up for sensitive actions. |
| API keys | Not implemented | Tenant-scoped, hashed, one-time-display keys with scopes, expiry, IP/network policy, rotation, usage, and audit. |
| Service accounts | Not implemented | Separate non-human principals; no inherited user role; explicit tenant/workspace scope and secret rotation. |

## 8.3 Identity migration recommendation

Use a managed enterprise identity broker that supports OIDC, SAML, SCIM, MFA policy, and audit. Keep Firebase Auth as the compatibility authenticator for existing accounts during the migration. Map a verified Firebase UID or external subject to a new immutable `principal_id`; do not use email as the join key.

Do not place full tenant memberships/permissions in long-lived access-token claims. Claims may carry an identity, token/session version, and coarse platform role. Resolve memberships and policy version server-side so suspension, role revocation, and tenant changes take effect promptly.

---

# 9. Authorization Architecture

## 9.1 Current authorization findings

- `backend/security/auth.js` verifies Firebase bearer tokens and maps global roles/permissions.
- `backend/security/policy.js` applies verified-email, admin, and recent-auth rules.
- Firestore rules use owner checks and global `ADMIN`/`SUPER_ADMIN` claims.
- There is no tenant membership check because no tenant exists.
- Current platform administrators can access broad shared-environment data. This is suitable only for a platform-admin model, not delegated enterprise administration.

## 9.2 Recommended role model

Use roles as permission bundles, not as an ever-growing list of job titles.

### Platform roles (rare, separate from customer roles)

| Role | Scope | Minimum purpose |
|---|---|---|
| Platform Owner | Platform | Break-glass governance; tightly controlled, MFA/approval required. |
| Platform Operator | Platform | Operates service health/configuration; no routine content browsing. |
| Support Agent | Case-scoped | Time-bound, customer-approved support access only; default-deny tenant content. |
| Security Auditor | Platform | Read-only security/audit views, no tenant content by default. |

### Tenant/workspace roles

| Role | Scope | Minimum permissions |
|---|---|---|
| Tenant Owner | Organization | Ownership transfer, deletion/export approval, admin delegation, policy governance. |
| Tenant Admin | Organization | Members, SSO/SCIM, policy, integrations, usage/admin configuration. |
| Billing Admin | Organization | Billing, invoices, plan, seats, quota visibility; no automatic content access. |
| Workspace Manager | Workspace | Workspace membership, workspace settings, workflow/resource administration. |
| Member | Workspace | Create/manage allowed career artifacts and use permitted AI functions. |
| Viewer | Workspace | Read-only access to explicitly shared resources. |

“AI administrator,” “data export approver,” and “security administrator” should initially be permissions such as `ai.policy.manage`, `data.export.approve`, and `security.sessions.manage`, not necessarily additional top-level roles.

## 9.3 Policy model

1. **RBAC first:** tenant/workspace grants drive ordinary navigation and actions.
2. **Resource-level checks always:** a role never bypasses tenant/resource ownership by accident.
3. **Small, justified ABAC layer:** enforce tenant status, workspace scope, classification, legal hold, data residency, SSO/MFA requirement, support grant, and plan/seat state.
4. **One policy decision point:** APIs call a tenant policy service/module before loading a resource; data access follows the decision rather than reimplementing policy ad hoc.
5. **No client authority:** a tenant ID supplied in URL/header/body is a request for context, never proof of entitlement.

A tenant-context middleware should produce an immutable structure similar to:

```text
TenantContext {
  requestId, traceId,
  principalId, actorType, authStrength,
  tenantId, workspaceId?, membershipId, policyVersion,
  platformPermissions, tenantPermissions,
  tenantStatus, dataResidency, supportGrant?
}
```

Every service/data adapter accepts this context explicitly. No service should infer a tenant from a client body field or ambient global variable.

---

# 10. Database Strategy

## 10.1 Current state

Firestore and RTDB are shared, document-oriented stores. Firestore rules provide useful owner isolation, but they are not native relational RLS, do not create an organization abstraction, and are bypassed by the Firebase Admin SDK. The code also has many direct client database calls in `src/firestore/dbOperations.js`.

## 10.2 Target database shape

### Control plane — shared PostgreSQL

Use a relational control plane for:

```text
principals, identity_links, organizations, organization_domains,
memberships, workspace_memberships, invitations, role_grants,
plans, subscriptions, seats, usage_ledger, tenant_routing,
data_residency, tenant_lifecycle, audit_index, support_grants,
api_keys, service_accounts, integration_connections
```

These data sets benefit from transactions, unique constraints, durable lifecycle states, reporting, and RLS.

### Standard tenant data plane — shared schema + RLS

For all new tenant-scoped records:

- `tenant_id NOT NULL` is mandatory;
- use opaque globally unique primary keys (UUIDv7/ULID), not tenant-guessable sequences;
- enforce tenant-aware foreign keys, usually composite relationships such as `(tenant_id, resource_id)`;
- use unique constraints that include `tenant_id` (`tenant_id, normalized_slug`, not a globally conflicting slug where the product does not require it);
- index principal query paths beginning with `tenant_id` and, when applicable, `workspace_id`;
- set the tenant context with `SET LOCAL app.tenant_id = …` only inside a transaction/request scope;
- enable and **force** RLS for every tenant table; application roles must not bypass it;
- prohibit raw SQL/data access outside a tenant-aware repository/transaction helper.

Illustrative policy principle:

```text
ALLOW row access only when row.tenant_id = current_setting('app.tenant_id')
AND the application policy layer has already authorized the action.
```

RLS is defense in depth, not a replacement for application authorization.

### Legacy Firebase bridge

Do not migrate certified documents in bulk just to claim tenancy. Initially:

- map each current UID to a personal tenant/workspace;
- retain `users/{uid}/…` reads/writes behind a legacy module adapter;
- prevent new enterprise collaboration features from adding new direct client-side global Firestore paths;
- migrate one bounded aggregate at a time with checksums, revision/version mapping, dual-read or dual-write only when needed, reconciliation, and a rollback window;
- eventually move tenant-owned real-time/document data behind the server data plane or give Firestore an equivalent tenant-rooted rule model only where a direct realtime client is truly justified.

### Dedicated tenant data plane

The tenant-routing control plane maps eligible tenants to a dedicated database, object-storage key/prefix, queue pool, and optional region/project. The application code remains tenant-context driven; it must not fork into a different product codebase for dedicated tenants.

---

# 11. Tenant Isolation Strategy and Cross-Tenant Leakage Audit

## 11.1 Current audit findings

| Boundary | What exists today | Current strength | Enterprise gap |
|---|---|---|---|
| Firestore private data | UID-nested document paths and rules | Good user isolation for the modeled paths | No organization/workspace boundary; Admin SDK bypass; inconsistent root-owner field conventions. |
| Firestore global collections | `userId`, `ownerUid`, `authorUid`, `employerId` filters and rules | Many owner checks exist | Every future query/search/aggregation would need a tenant model and consistent field/constraint. |
| RTDB messaging | Participant path rules | Good participant restriction | No tenant metadata or tenant lifecycle propagation. |
| APIs | Firebase bearer authentication + endpoint policy | Strong foundation | No tenant resolver, membership authorization, policy context, or tenant-scoped API contract. |
| Browser state | Account-scoped cleanup and several UID-scoped keys | Good account-switch controls | No tenant/workspace-scoped cache keys or safe context-switch semantics. |
| Cache | Process maps and browser caches | Small current surface | No distributed cache, namespace, generation invalidation, or tenant cache tests. |
| Queues/workers | Firestore outbox and timers | Durable notification record/lease exists | No universal job context, reauthorization, tenant quota, or worker routing. |
| Files | PDF/DOCX streamed from memory, no persistent storage use found | Reduces stale-file exposure | No object-storage tenancy, malware/quarantine, retention, signed-URL policy, or tenant export archive. |
| AI | Backend credentials, identity-field rejection, bounded interview context | Strong current user-oriented zero-leakage baseline | Global provider config/quota, no tenant scope, memory/RAG/vector controls, or tenant usage ledger. |
| Audit | Firestore security audit entries | Useful starting point | Not tenant-complete, immutable, searchable, retention-controlled, or support-access aware. |

## 11.2 Mandatory isolation invariants

The target must enforce the following invariant at every boundary:

> **Tenant A must never accidentally receive, retrieve, infer, or expose Tenant B's data.** A resource, result, cache entry, background job, file, vector record, audit event, or AI context may be used only when its `tenant_id` and applicable `workspace_id` match the immutable authorized `TenantContext`.

Specific controls:

### Database and query controls

- Repository methods take `TenantContext`; no `findById(id)` for tenant data, only `findByTenantAndId(context, id)`.
- RLS applies even if an application query omits a condition.
- Composite foreign keys prevent a tenant-A record from referencing a tenant-B parent.
- Search, reports, pagination cursors, aggregates, exports, and background reconciliation include the tenant predicate and are tested with collision IDs.
- No cross-tenant `collectionGroup`/global Firestore query is introduced without an explicit policy and tenant predicate.

### API controls

- Resolve tenant from a canonical route/context request after authentication.
- Verify active membership, tenant status, workspace membership, and policy version before resource lookup.
- Return non-enumerating `404`/`403` behavior according to the threat model.
- Bind idempotency keys to `tenant_id + actor + operation + canonical payload hash`.
- Include tenant and workspace in API audit events; never trust `tenantId` from a body as authorization.

### Cache controls

- Cache keys include `tenant_id`, `workspace_id` where relevant, principal/permission scope where needed, policy/config version, locale, and data version.
- Never cache authenticated responses at a CDN unless explicitly private and cryptographically scoped; default `Cache-Control: no-store, private` for tenant content.
- Context switch invalidates tenant-scoped browser/query cache and aborts in-flight requests.
- Use per-tenant rate limits and cache quotas to prevent one tenant evicting others.

### Queue/worker controls

- Every job includes `tenant_id`, `workspace_id`, `actor`, `correlation_id`, idempotency key, and resource references.
- The worker re-loads tenant status and re-authorizes the resource; it never trusts a stale serialized permission alone.
- Queue names, dead-letter queues, metrics, concurrency, retry policies, and payload encryption are tenant-aware.
- Workers use a constrained service identity and cannot perform an unscoped cross-tenant scan.

### File controls

- Object keys have an unforgeable tenant/workspace prefix and are generated server-side.
- Use separate quarantine and approved buckets/prefixes; scan before processing; content-disarm or reject unsafe inputs.
- Signed URLs are short-lived, purpose-bound, tenant-bound, content-disposition safe, and logged.
- Export/download decisions re-check current membership and tenant status.
- Dedicated tenants get separate bucket/key/region where required.

---

# 12. Cache, Queue, and File Strategy

## 12.1 Cache

**Current:** no Redis or other shared cache dependency is present. AI configuration uses a process-local cache; abuse limits use a process-local `Map`; PDF concurrency is a process-local counter; browser state is UID-based.

**Target:** managed Redis or an equivalent shared cache/rate-limit store.

- Key form: `v1:{tenant}:{workspace?}:{subject?}:{domain}:{version}:{hash}`.
- Store only data whose retention/classification allows caching; encrypt or avoid caching sensitive AI text by default.
- Add per-tenant memory quotas, TTLs, invalidation generations, and cache-hit/miss metrics.
- Use atomic distributed rate limits for API, AI, export, notification, and login abuse limits.
- Keep configuration cache separate from tenant data cache; invalidate tenant AI configuration by version.

## 12.2 Queue and workers

**Current:** Firestore notification outbox with lease/retry is a good seed. PDF and AI are synchronous request workloads; CMS/outbox use optional `setInterval` loops in the API executable.

**Target:** a managed durable task queue plus transactional outbox. A practical GCP-aligned reference is Cloud Tasks/Pub/Sub plus Cloud Run worker deployments; the exact vendor may vary, but the guarantees must not.

Workload separation:

| Worker pool | Purpose | Isolation requirement |
|---|---|---|
| API | Low-latency requests and authorization | Stateless, tenant-aware policy middleware. |
| AI worker | Long/async AI generation, RAG ingest, evaluation | Per-tenant budget/concurrency; encrypted payload; provider policy re-check. |
| Render worker | PDF/office conversion | Dedicated non-root sandbox, egress allowlist, CPU/memory limits, tenant quota. |
| Notification worker | Email/webhook dispatch | Tenant sender/config policy, retries, suppression, DLQ. |
| Lifecycle worker | export/delete/retention/provisioning | Idempotent, audit-heavy, approval-aware. |

## 12.3 Files

Current in-memory download behavior should remain for existing certified exports while the new file service is added. The new service must support originals, generated artifacts, quarantine, checksum, malware verdict, retention class, legal hold, encryption key, tenant/workspace scope, and audit history. No user-controlled object path is permitted.

---

# 13. AI Multi-Tenancy Strategy

## 13.1 Current AI security baseline to preserve

The current AI path is substantially stronger than a browser-to-model design:

- Browser AI calls are same-origin and bearer-authenticated.
- `backend/routes/ai.js` rejects browser-supplied provider keys and user/owner/resume identity fields.
- AI provider credentials are held server-side with masked admin responses.
- Provider fallback and model failover are implemented in `aiRuntime.js`.
- Interview data is bounded and user-scoped in client storage.
- The provider configuration cache is configuration-only; no generalized AI response cache, RAG store, embedding store, or long-lived server-side AI memory was found.

Preserve these controls; do not reintroduce direct browser provider calls, arbitrary provider URLs, client-supplied credential paths, or client-controlled ownership identifiers.

## 13.2 Current gaps relevant to tenant AI

- AI provider configuration and quota settings are platform-global (`settings/ai_providers`, `settings/ai_quota`).
- AI usage documents are keyed per day and UID hash, not tenant/workspace/cost-center.
- There is no tenant-specific model allowlist, provider credential/vault scope, budget, data-residency rule, prompt configuration, memory, RAG, embedding, or vector namespace.
- `backend/security/abuse.js` includes legacy hard-coded email checks in the admin-quota decision in addition to role-like fields. This is not a tenant authorization model and must not survive the enterprise authorization phase; replace it with explicit policy/permission evaluation when that phase is implemented and regression-tested.

## 13.3 Target AI architecture

```text
Authorized TenantContext
  → AI policy decision
      (tenant/workspace permission, plan, model/provider allowlist,
       region, data classification, budget, retention, support policy)
  → context broker
      (only explicitly selected/authorized artifacts)
  → prompt builder with versioned tenant instructions
  → provider router / existing failover capability
  → result validator / safety classifier
  → artifact store + usage ledger + audit event
```

### Tenant-specific configuration

Each tenant may configure, subject to plan and policy:

- allowed providers/models and fallback order;
- tenant instructions and approved prompt templates, versioned and audited;
- model temperature/token ceilings within platform guardrails;
- cost/token/request/concurrency budgets at tenant, workspace, group, and user level;
- retention and memory/RAG policy;
- data-residency/provider-processing constraints;
- optional BYOK only through a KMS/Secret-Manager reference, never browser-visible and never included in generic logs.

### AI memory, RAG, embeddings, and vector isolation

- AI memory is **off by default** for a tenant until retention/classification policy is accepted.
- A memory record includes tenant, workspace, subject, scope, source IDs, consent/policy version, expiry, and deletion linkage.
- Vector search must use a tenant/workspace physical namespace or mandatory server-enforced partition filter. Metadata filtering alone is not enough if an unscoped query can run.
- Retrieval queries are constructed server-side from `TenantContext`; users cannot provide raw vector namespace, document IDs, or tenant labels.
- Dedicated-tier tenants may receive a dedicated vector index/collection and encryption key.
- Embedding jobs are tenant-aware queue jobs; deleting a document queues deletion verification from all embeddings, caches, generated artifacts, and memory records.

### AI cache and observability

- AI response caching is disabled for sensitive operations unless a tenant explicitly allows it.
- Where allowed, cache key material includes tenant/workspace, policy/prompt version, model/provider, normalized input digest, source-artifact versions, and entitlement scope. A response can never be reused across tenants.
- Store usage, not prompt body, in broad metrics: tenant, workspace, user/service actor, operation, model, input/output token count, latency, provider, result status, cost estimate, and policy version.
- Redact/minimize prompt content in logs; sensitive investigations use audited, case-scoped retrieval where legally permitted.

### Preservation of `54cb62f`

The current identity-field rejection remains necessary. The target strengthens it by ensuring that a requested artifact reference is first resolved through an authorized `TenantContext`; AI prompt assembly then uses the server-loaded authorized artifact, not arbitrary client identity values. Existing interview context sanitation, deduplication, client bearer authentication, and user-scoped local history remain intact until a tenant-scoped durable history feature is deliberately introduced.

---

# 14. Security Threat Model

| Threat | Current evidence | Target mitigation and proof |
|---|---|---|
| BOLA/IDOR via tenant/resource IDs | Current owner paths and server export checks help UID isolation; no tenant resolver exists | Tenant-first resource lookup, membership policy, RLS, negative API tests for every endpoint/resource/action. |
| Client-forged tenant context | No tenant fields today | Tenant ID is only a requested context; server verifies membership and signs/derives effective context. |
| Direct data-store bypass | Current Firestore browser access is legitimate for legacy user paths | New tenant domain writes route through server repositories; Firestore rules deny tenant data unless explicitly justified and tested. |
| Cache response bleed | Process/browser caches not tenant namespaced | Tenant/workspace/permission/version namespacing, private cache headers, context-switch invalidation tests. |
| Queue context loss | Current outbox has no tenant envelope | Signed/immutable tenant job envelope plus worker re-authorization and DLQ isolation tests. |
| File/path traversal or stale URLs | Current exports stream from memory; no upload pipeline | Server-generated object keys, quarantine, scans, purpose-bound signed URLs, access re-checks. |
| AI cross-context disclosure | Current AI rejects client identity fields but has no tenant memory/RAG | Server context broker, isolated vector namespace, tenant-aware cache, policy version, red-team leakage tests. |
| Prompt injection against retrieved tenant data | No RAG today | Treat retrieved text as untrusted; source allowlists, instruction separation, output validation, scope display, and no cross-tenant retrieval. |
| Provider credential disclosure | Server-only/masked current controls are good | Per-tenant vault references, KMS envelope encryption, access logging, rotation, no credential logging. |
| Stale role/session after suspension | Firebase token checks exist; no tenant lifecycle | Membership/policy version checks, session revocation, short TTL, suspension at API/worker/data layers. |
| Support/admin overreach | Existing global admin is broad | Just-in-time case-scoped support grant, tenant approval, read-only default, immutable audit and customer-visible support activity. |
| Noisy-neighbor exhaustion | In-process limits and synchronous PDF/AI | Tenant quotas, queue partitions, worker pools, Redis limits, budget circuit breakers, load tests. |
| Backup/restore cross-tenant exposure | No tested backup/restore evidence | Tenant-aware encrypted backup catalog, restore-to-isolated-environment process, quarterly drills, chain-of-custody audit. |
| Supply-chain/deployment compromise | Dependency audits pass; no active tracked CI/IaC | Signed artifacts, active required CI, SBOM, secret scanning, least-privilege deployment identity, immutable deployment record. |

Security architecture must use defense in depth: gateway policy + application policy + data-plane policy/RLS + storage/queue/provider scope + audit. No single `tenant_id` predicate is an enterprise isolation control.

---

# 15. Scalability Assessment

## Current state

Strengths include lazy frontend routes, Firestore managed persistence, provider failover, in-memory document streaming, and an outbox implementation. Constraints include:

- one Express process contains API, timers, Playwright PDF work, and potentially background work;
- `activeExports`, short-window rate buckets, SMTP circuit state, and some caches are process-local;
- no distributed cache/rate limiter/worker queue is in source;
- AI and PDF work can consume API process capacity;
- Firestore has only a small set of declared composite indexes;
- Vite build reports large chunks: BuildResume approximately 1.22 MB minified, WebCvRenderer approximately 1.11 MB, Firebase approximately 0.89 MB, and Admin approximately 0.73 MB.

## Target capacity architecture

- Stateless horizontally scaled API services behind the edge/load balancer.
- Separate worker pools and tenant concurrency gates for AI, render, notification, and lifecycle jobs.
- Redis-backed distributed rate limits, idempotency coordination, and carefully scoped cache.
- Tenant budgets for request rate, concurrent renders, AI token spend, queue depth, storage, and API use.
- Queue backpressure with user-visible progress rather than synchronous overload failure.
- Partitioned/tenant-first database indexes and query budgets; no unbounded cross-tenant administrative scans in request paths.
- Dedicated worker pool/data plane promotion before a large tenant can dominate shared capacity.

Define capacity targets from measurement, not assumptions. The initial production certification should include per-tier load profiles, tail latency, queue recovery, failover, and noisy-neighbor tests.

---

# 16. Reliability Assessment

## Current state

- Provider failover, bounded request sizes, abort signals, export token consumption, and notification outbox leasing are positive reliability controls.
- `/api/health` only reports backend reachability/Firebase Admin configuration; it does not prove providers, queue health, database latency, or tenant readiness.
- PDF rendering uses a Playwright browser in the API process with `--no-sandbox`; repository documentation already identifies dedicated isolation as a production requirement.
- The codebase does not supply proven multi-region topology, shared coordination, backup/restore drill, RPO/RTO, or rolling deployment evidence.

## Target reliability design

- Separate readiness from liveness. Readiness checks dependency class and worker ability without exposing secrets.
- Use a durable outbox and queue with idempotent consumers, retry schedules, DLQ operations, and reconciliation.
- Move browser rendering to an isolated non-root sandboxed worker with egress policy and per-tenant concurrency limit.
- Set tenant-aware circuit breakers for providers and exports; one tenant cannot open a global circuit for every tenant.
- Create per-tier SLOs, error budgets, incident runbooks, and customer communication paths.
- Require encrypted backups, point-in-time recovery, quarterly restore drills, and tested tenant-level restore/export processes.

---

# 17. Observability Strategy

## Current state

The application emits request IDs, structured API error payloads, `console` messages, and some Firestore `security_audit_logs`. This is useful but not enterprise observability. There is no tracked centralized log sink, trace context, tenant dashboards, PII-redaction proof, SIEM integration, alert policy, or SLO measurement.

## Target design

### Logs

- Structured JSON logs with request/trace ID, tenant ID (or stable hash where appropriate), workspace ID, actor type/ID, route/job, policy decision, provider/model code, error class, and latency.
- Never log secrets, bearer tokens, raw provider keys, or raw resume/AI prompt bodies by default.
- Tenant IDs in high-cardinality metrics may be hashed/bucketed; full tenant identity belongs in access-controlled logs/audit.

### Metrics

- API: request/error/latency by route and tier.
- Tenant: quota/budget/storage/seat/queue/AI consumption.
- Worker: backlog, age, retries, DLQ, saturation, render/AI failures.
- Security: denied policy decisions, suspicious context switches, API key misuse, support grants, privilege changes.
- Data: RLS denials, migration reconciliation, backup/restore success.

### Tracing

Propagate W3C trace context from browser/API to worker/provider adapters. Add `tenant_id` as access-controlled trace baggage/attribute only where the tracing vendor policy permits it.

### Audit

Use an append-only audit event model with at least:

```text
occurred_at, tenant_id, workspace_id?, actor_type, actor_id,
action, category, severity, resource_type, resource_id,
request_id, source_ip/risk metadata, before/after digest,
policy_version, result, support_grant_id?
```

Export finalized audit batches to immutable/retention-locked storage. An operational log is not an audit log.

---

# 18. Tenant Lifecycle

```text
Draft
  → Provisioning
  → Active
  → Suspended
  → Reactivated OR Exporting / Pending deletion
  → Retention hold / Deleted
```

| Lifecycle stage | Required behavior |
|---|---|
| Create | Validate domain/plan; create tenant, owner membership, default workspace, routing record, policy baseline, audit event. Idempotent provisioning only. |
| Provision | Create database/schema routing, storage prefix/key, queue quotas, default AI policy, identity settings, and observability labels. |
| Invite/configure | Invite/JIT/SCIM users; configure SSO, MFA, roles, workspace, integrations, data classification, AI policy, and billing. |
| Active use | Enforce seats, quotas, tenant context, audit, policy version, and lifecycle status for every request/job. |
| Upgrade/downgrade | Versioned plan change; calculate seats/usage/retention effects; never silently delete data as a side effect. |
| Suspend | Block new sessions/API keys/jobs and stop expensive AI/render work; preserve evidence and permit authorized owner/admin remediation. |
| Reactivate | Revalidate subscription/policy and resume only valid queued work; do not replay expired signed URLs or stale jobs. |
| Export | Owner-approved asynchronous export, encrypted package, signed delivery, audit, expiry, and warning about legal/billing retention. |
| Delete | Require ownership/step-up authentication and cooling-off window; delete data by retention schedule, vector/cache/file copies, integrations, keys, and memberships; retain only legally required evidence. |
| Restore / migrate | Restore into an isolated target first; validate tenant identity, keys, counts, policy, and no cross-tenant overwrite before cutover. |

Tenant cloning is not an initial general feature. Permit it only for controlled demo/sandbox tenants with explicit synthetic-data rules; never clone real production PII by default.

---

# 19. Enterprise UI/UX Audit

## Current UX strengths

- The Resume Builder, templates, wizard, recommendation deduplication, DOCX/export controls, Interview Coach/CBT flow, and processing feedback are substantive product experiences, not generic CRUD pages.
- Existing routes are lazy loaded and several screens contain accessible status/dialog/live-region attributes.
- The profile sidebar supports collapse/mobile behavior, notifications, role-aware platform-admin entry, and settings access.
- Admin pages have some explicit loading/error/confirmation/re-auth patterns.
- Internationalization and responsive CSS are present.

## Current UX gaps for enterprise tenancy

| Area | Finding |
|---|---|
| Information architecture | Navigation is feature/user-account oriented. Dashboard, builder, and admin have separate shells and no common organization context. |
| Tenant clarity | There is no organization/workspace name, switcher, scope breadcrumb, or context safety cue. |
| Roles and permissions | Platform admin visibility exists, but a member cannot understand tenant/workspace role, inherited access, or why an action is unavailable. |
| Administration | Current `/adm` is a platform control panel, not a delegated tenant administration center. |
| AI UX | Strong interaction experiences exist, but users cannot see a tenant/workspace data scope, retention policy, model entitlement, RAG sources, or AI usage budget. |
| Audit/security UX | User account security/settings exists, but no tenant audit investigation, active tenant session controls, support-access awareness, or enterprise policy UX. |
| Billing/usage | Individual subscription UI exists; no organization seats, pooled AI use, storage/API usage, limits, or cost-center visibility. |
| Design consistency | The product mixes legacy SCSS, Tailwind classes, custom component styles, class components, and highly large feature modules. A cohesive token/component system is not yet evident. |
| Performance perception | Build warnings show large chunks. Loading states exist in places, but performance budgets and skeleton/transition conventions are not systematized. |
| Accessibility assurance | There are many ARIA attributes and interview accessibility tests, but no completed WCAG 2.2 AA audit, axe suite, keyboard matrix, or screen-reader validation evidence. |

This is a product-architecture assessment, not a visual human design review. The UI should not be called 10/10 enterprise UX until realistic tenant workflows and accessibility are independently tested with users and assistive technology.

---

# 20. Target UX Architecture

## 20.1 Global product shell

```text
Enterprise user
  → Global application shell
      → authenticated identity / session status
      → tenant context (always visible)
      → optional workspace context
      → role-aware navigation
      → module route
      → context-aware actions and AI assistance
```

### Desktop shell

- **Top bar:** logo/product, tenant/workspace switcher, breadcrumbs, global search/command palette, create action, notifications/activity, help, user menu.
- **Sidebar:** role-aware module navigation; group modules rather than creating a long flat list.
- **Content header:** tenant/workspace scope badge, page title, status/usage cue, page-level actions.
- **Right contextual panel when useful:** AI scope, activity, comments, help, or detail — not a permanent second sidebar.

### Suggested module grouping

```text
Home
Career Studio
  - Resumes
  - CVs / Cover letters
  - Portfolio
Practice
  - Interview Coach
  - Assessments / Reports
Opportunities
  - Jobs / Applications
Organization (shown by permission)
  - Overview, Members, Access, Security, AI, Integrations, Usage, Billing, Audit
```

Keep certified resume/CV/interview screens inside their current feature boundaries initially. The new shell wraps and contextualizes them; it does not redesign their proven editing/rendering flow merely for visual consistency.

## 20.2 Tenant/workspace switcher

A switcher is a security component, not a decorative dropdown.

| Requirement | Design response |
|---|---|
| Always know current organization | Show organization name/logo and workspace in persistent top-bar control and page breadcrumb. |
| Multiple organizations | Searchable list of active memberships with role label, plan/status cue, and recent organizations. |
| Multiple workspaces | Display workspace after organization selection; hide the workspace level if the organization uses only its default workspace. |
| Keyboard use | `⌘/Ctrl+K` opens command palette; arrows move, Enter selects, Escape closes; focus returns predictably. |
| Safe switching | Warn on unsaved work; save/discard/cancel; abort active requests; clear tenant cache; resolve new permissions; navigate to a safe landing page. |
| Security | The UI can request a context, but the backend re-verifies membership. Do not persist a trusted tenant ID in local storage as authority. |
| Suspended access | Show suspended/disabled context clearly but do not expose data/actions. |

## 20.3 Role-aware dashboards

| Persona | Dashboard focus |
|---|---|
| Tenant Owner | Organization setup/health, active seats, AI spend/use, policy/security tasks, billing, high-risk activity, tenant lifecycle actions. |
| Tenant Admin | Invites, group/role changes, SSO/SCIM readiness, workspace configuration, integrations, approval queues, recent activity. |
| Workspace Manager | Workspace members, shared artifacts, workflow status, scoped usage, team activity. |
| Member | Personal recent work, Resume/CV/cover-letter shortcuts, Interview Coach progress, assigned/shared artifacts, helpful onboarding. |
| Viewer | Shared artifacts and clear explanation of limited access, not empty navigation. |

Metrics must be honest. Where the product does not yet collect a business metric, show an explicit setup/unavailable state rather than synthetic trends.

## 20.4 Enterprise administration center

Use progressive disclosure:

```text
Administration
  Organization
  Members & Invitations
  Access & Roles
  Workspaces (if enabled)
  Security
    SSO / SCIM / MFA policy / Sessions / API keys / Service accounts
  AI Configuration & Usage
  Integrations
  Data & Privacy
  Audit Logs
  Usage & Billing
  Advanced / Danger zone
```

Normal members never see platform controls. Tenant administrators do not see platform-wide secrets or other tenants. Platform support controls are physically and visually distinct from customer administration and require a time-bound support grant.

## 20.5 AI UX

Every AI surface should show:

- the active tenant/workspace;
- an explicit context selector (current document, selected artifacts, workspace-approved sources);
- data classification/retention and whether memory is on;
- allowed model/provider when user-visible; no raw credential controls;
- source citations for RAG/retrieval;
- regeneration, feedback, and report-an-issue controls;
- a clear indicator when AI output is not yet saved/shared.

AI must never silently broaden from “this resume” to “all tenant documents.” A user should be able to inspect and remove selected context before generation.

## 20.6 Enterprise security, audit, and usage UX

### Security center

Present normal users with a calm, task-oriented **Security** page: MFA status and setup, active sessions/device list, login history, recovery/contact policy, and a clear sign-out-all-sessions action. Tenant administrators additionally see SSO enforcement, SCIM health, access policy, API keys, service accounts, recent high-risk events, and a scoped support-access history. Sensitive changes require a confirmation/step-up flow that states both the security consequence and the active tenant.

### Audit investigation experience

The audit interface should be a purpose-built investigation tool rather than a raw log table:

```text
Filters: actor/user | team/group | resource | action | category | severity | date/time | workspace
Results: timestamp, actor, action, resource, outcome, source/risk signal, correlation ID
Detail drawer: before/after digest, policy decision, related events, support grant, export/case link
```

It needs saved views, deep-linkable filtered URLs, keyboard-operable data tables, CSV/JSON export gated by permission, timezone clarity, immutable-event indicators, and a “why was this allowed/denied?” explanation. Tenant administrators see only their tenant’s events; platform security teams see cross-tenant operational aggregates under a separate, audited permission.

### Billing, usage, and quotas

A tenant-level **Usage & Billing** page must make consumption legible:

- current plan, billing period, renewal/overage policy, invoices, payment owner, and seats used/available;
- AI requests/tokens/cost by workspace, model, and user where policy permits;
- API requests, storage, queued/render work, configured limits, forecast/trend, and remaining budget;
- clear soft-limit warnings, hard-limit behavior, approval/request-upgrade path, and ownership of each setting;
- explicit `unavailable` or `not configured` states instead of invented usage/billing metrics.

## 20.7 Interaction, accessibility, and performance standard

Every new enterprise page must provide a recognizable loading, empty, error, success, and permission-denied state; use skeletons only when the layout is predictable and never hide an error behind an endless spinner. Dialogs/drawers must trap focus, restore focus on close, support Escape where safe, expose labels/descriptions, and honor reduced motion. Tables need semantic headers/captions, mobile alternatives, accessible sorting/filtering, and keyboard row actions.

The shell should work as a responsive progressive-disclosure system: full sidebar on desktop, compact rail on tablet, and an accessible navigation sheet/bottom action pattern on mobile. Define bundle and interaction budgets, measure real-user performance, and avoid loading large builder/admin bundles until the role and route require them.

---

# 21. Design System Strategy

## 21.1 Recommendation

Build an enterprise design system incrementally around the frozen product. Do not restyle all 51 templates or the certified Interview Coach to make the system look uniform.

### Foundation

- Semantic design tokens: color, typography, spacing, radius, elevation, breakpoints, motion, focus, z-index, chart palette.
- Light/dark policy only after contrast/print/export impacts are validated.
- Component state tokens: default, hover, focus-visible, disabled, selected, loading, danger, success, warning.
- WCAG-validated contrast and visible focus as non-negotiable token constraints.

### Reusable primitives

- App shell, sidebar, top bar, breadcrumbs, context switcher, command palette.
- Button, icon button, input, select/combobox, date control, validation message.
- Dialog, drawer, popover, toast, confirmation, progress/status.
- Data table with responsive behavior, sorting/filtering/pagination, row actions, empty/error/loading states.
- Permission-aware control/guard with an explanatory denied state.
- Usage meter, charts, activity timeline, audit event row.

### Migration approach

1. Tokenize new enterprise shell and admin components first.
2. Create primitives alongside current SCSS/Tailwind, avoiding global CSS collisions.
3. Use compatibility wrappers/adapters for frozen modules.
4. Migrate non-certified screens opportunistically after visual and keyboard regression tests exist.
5. Maintain a visual regression baseline for certified templates and export pages before touching shared styling.

---

# 22. Current Technical Architecture Scorecard

Scores describe **enterprise multi-tenant readiness**, not the quality of the protected single-account product features.

| Area | Score /10 | Evidence | Main risk |
|---|---:|---|---|
| Tenant model | 2 | UID/account model only; no org/workspace/membership | Adding tenant UI without a true boundary causes leakage. |
| Isolation | 5 | Owner Firestore paths/rules, export ownership, RTDB participant rules | Good user isolation does not equal tenant isolation; Admin SDK/global data remain broad. |
| Database | 4 | Firestore/RTDB shared schema, limited indexes, no ORM/RLS | Inconsistent owner fields and lack of transactional tenant control plane. |
| Authentication | 6 | Firebase Auth, bearer validation, social paths, TOTP support | No enterprise federation/SCIM/session governance proof. |
| Authorization | 5 | Global claims/permissions and endpoint policy | No tenant/workspace/resource policy system. |
| API architecture | 5 | Authenticated Express API with security middleware | Large monolith route file, no tenant middleware/versioned domain boundary. |
| Cache | 2 | Browser/process caches only | Cross-tenant cache design and horizontal-scale controls absent. |
| Queue | 3 | Firestore outbox/leases and timers | No tenant-aware durable task platform or worker isolation. |
| File isolation | 5 | Owner-checked exports stream in memory; no persistent storage use | No object-store quarantine, tenant prefix, retention, or signed URL architecture. |
| AI isolation | 6 | Backend-only provider keys, identity-field rejection, failover | No tenant config/budget/memory/RAG/vector isolation. |
| Security | 6 | 163/163 security suite, rules, policy, secret handling | Production IAM/rules/DAST/pentest/centralized controls not proven. |
| Scalability | 3 | Managed Firebase helps; lazy routes | In-process PDF/limits/workers and no shared coordination. |
| Reliability | 4 | Failover/outbox/token controls | No proven SLO/DR/restore/worker topology. |
| Observability | 2 | Request IDs, console logs, Firestore audit entries | No central logs, traces, metrics, SIEM, alerting. |
| Compliance readiness | 3 | Export/delete/privacy controls exist | No tenant lifecycle, DPA/residency, restore, retention, audit proof. |
| Billing/usage | 4 | Individual membership/payment/AI quota | No tenant seats, pooled usage, quota/billing UX. |
| Tenant lifecycle | 1 | Account deletion only | No tenant provisioning/suspend/export/restore/deletion process. |
| Testing | 7 | 28/28, 163/163, 301/301 locally pass | No tenant isolation matrix; emulator/browser/live tests not run. |
| Deployment | 3 | Proxy/headers/env docs exist | No tracked active CI/IaC/artifact/prod evidence. |
| **Overall** | **4** | Strong protected product and security foundation | Not ready to claim enterprise multi-tenancy. |

---

# 23. Current UI/UX Scorecard

| Area | Score /10 | Evidence | Gap |
|---|---:|---|---|
| Visual design | 6 | Modern Tailwind portions and rich templates | Mixed legacy styling and inconsistent foundations. |
| Navigation | 5 | Collapsible member/admin sidebars | Separate shells, long feature navigation, no unified context. |
| Information architecture | 5 | Feature modules are broad and valuable | No organization/workspace-oriented hierarchy. |
| Tenant switching | 1 | No tenant concept | Must be designed as a safety flow. |
| Admin UX | 5 | Dedicated admin routes, health/re-auth/loading patterns | Platform-centric rather than tenant-delegated administration. |
| Permissions UX | 2 | Platform admin visibility only | No member/role explanation or access-request experience. |
| Dashboard | 5 | Existing personal dashboard | No role-aware organizational dashboards. |
| AI UX | 6 | Interview coach, modal/progress, AI tools | No visible tenant scope, AI policy, sources, history/memory governance. |
| Resume UX | 8 | Certified 51-template builder/wizard/export surface | Preserve; contextualize rather than rewrite. |
| CV UX | 7 | Protected CV/print/download experience | Preserve; enterprise sharing/context still absent. |
| Interview UX | 8 | Certified CBT, timer, report, anti-tab-switch behavior | Preserve; add scope/history governance around it. |
| Settings | 6 | Profile/security/payment settings exist | Tenant administration/settings are absent. |
| Audit UX | 2 | Some internal audit records | No tenant investigator interface. |
| Billing UX | 4 | Individual plans/checkouts | No seats, pooled usage, limits, overage or tenant billing. |
| Accessibility | 5 | Many ARIA/live/dialog semantics and tests | No WCAG 2.2 AA audit or end-to-end assistive-tech proof. |
| Responsive UX | 5 | Mobile/collapsed sidebar CSS exists | Enterprise table/admin/switcher responsive patterns unproven. |
| Performance UX | 4 | Lazy routes and loading components | Large chunks and no explicit performance budget. |
| Design system | 3 | Some reusable controls/styles | No formal token/component/accessibility governance. |
| **Overall** | **5** | Strong module experiences | Not yet a coherent premium enterprise application shell. |

---

# 24. SWOT

## Strengths

- Protected, differentiated Resume/CV, DOCX, PDF/print, Interview Coach/CBT, and AI failover capabilities.
- User-scoped Firestore data model and deny-by-default Firestore/RTDB rule posture.
- Server-side bearer token enforcement, secret masking, AI key rejection, quota/rate controls, export tokens, and secure provider abstraction.
- Broad local regression suites that now pass at the declared counts.
- Existing audited admin/policy/payment/email hardening work provides useful patterns for future tenant controls.

## Weaknesses

- No native tenant/domain model; current “account” is an individual UID.
- Direct Firebase client data access and a large monolithic `dbOperations` layer make tenancy migration sensitive.
- No RLS/tenant-aware data plane, cache, queue, file store, vector store, or audit model.
- Single-process API/render/worker behavior, no shared cache/rate limiter, and no proven SRE controls.
- No SSO/SAML/SCIM/API keys/service accounts/tenant administration.
- Large components/bundles and mixed UI architecture complicate premium UX consistency.

## Opportunities

- Turn a strong individual career product into a team/cohort/employer career platform without discarding its differentiated workflows.
- Offer governed AI with visible context, cost controls, tenant model policy, and privacy as a premium enterprise advantage.
- Introduce tenant-controlled branding, workspace/collaboration, shared review workflows, compliance exports, auditability, and enterprise identity.
- Use a dedicated-tier offering to win regulated customers while keeping default economics competitive.

## Threats

- A superficial `tenant_id` retrofit can create cross-tenant leakage through root queries, caches, jobs, exports, or AI retrieval.
- Moving certified documents too early can break template/export/interview contracts.
- In-process render/AI workloads can cause noisy-neighbor and availability collapse under growth.
- Global provider credentials/configuration and non-tenant audit/usage handling can block enterprise procurement.
- Missing backups, restore drills, active CI/IaC, and centralized observability can turn a localized incident into a platform-wide incident.
- Over-decomposition into microservices before tenancy foundations would raise cost and slow security remediation.

---

# 25. Critical Gap Matrix

| Gap | Severity | Current evidence | Enterprise requirement | Recommended solution | Effort | Risk if deferred |
|---|---|---|---|---|---|---|
| No organization/membership/workspace model | **Critical** | UID is the effective account boundary | Explicit tenant lifecycle and membership source of truth | Build control plane and personal-tenant mapping first | L | Any “tenant” UI is cosmetic and unsafe. |
| No immutable tenant context | **Critical** | APIs authenticate only user/claims | Consistent tenant resolution/policy propagation | Tenant middleware + context object + policy decision point | L | BOLA/IDOR across APIs/services. |
| No RLS/server tenant data plane | **Critical** | Shared Firestore/direct client access; Admin SDK bypass | Defense in depth at data layer | PostgreSQL RLS for new tenant domains; legacy adapter/migration plan | XL | One missed query/filter can leak data. |
| No tenant isolation test matrix | **Critical** | Existing tests cover account isolation, not organizations | Automated proof for every boundary | API/DB/cache/queue/file/AI A-vs-B suites in CI | L | Regressions will reach production undetected. |
| New tenant data could use direct Firebase patterns | **High** | Large client `dbOperations` layer | New tenant workflows must be mediated/authorized | Server repository/BFF boundary; strict exception register | L | Rules/query drift and difficult audit. |
| Cache/rate/concurrency are process-local | **High** | Maps/counters in backend | Multi-instance tenant-aware control | Redis/shared limiter and quota service | M | Limit bypass, uneven load, noisy neighbor. |
| PDF/AI/background jobs not separated | **High** | In-process Playwright/timers | Fault/isolation boundaries and backpressure | Dedicated sandboxed workers + durable queue | M | API degradation/security blast radius. |
| No tenant-specific AI governance | **High** | Global config/quota; no RAG model | Tenant provider/model/budget/context isolation | AI policy/context broker/usage ledger/vector namespace | L | AI leakage and procurement failure. |
| No enterprise IdP / SCIM / service identity | **High** | Consumer auth/OAuth/TOTP only | SSO, lifecycle provisioning, M2M access | Managed OIDC/SAML/SCIM broker + service account design | L | Enterprise buyers cannot onboard safely. |
| Platform audit is not tenant-grade | **High** | Firestore audit docs, no immutable pipeline | Searchable, complete, retained audit trail | Append-only tenant audit events + SIEM/immutable archive | M | Investigations/compliance fail. |
| No tenant billing/usage/lifecycle | **High** | Individual plans/quotas | Seats, pooled limits, suspension/export/delete | Usage ledger, entitlement service, lifecycle workflows | L | Cannot sell/manage enterprise plans. |
| SRE/DR/IaC evidence absent | **High** | Docs explicitly note external gaps | Recoverable, repeatable production operations | IaC, artifact promotion, monitoring, backup/restore drills | L | Reliability/compliance claims unprovable. |
| Design system/application shell fragmented | **Medium** | Mixed SCSS/Tailwind/large components/separate shells | Consistent, accessible enterprise navigation | Token system and shell-first migration | M | UX inconsistency and costly feature work. |
| WCAG 2.2 AA not proven | **Medium** | ARIA use but no full audit | Keyboard/screen-reader/contrast compliance | Axe + manual accessibility matrix + remediation backlog | M | Accessibility and procurement risk. |
| Large bundle/performance budgets absent | **Medium** | >500 kB warnings, MB-scale feature chunks | Predictable perceived performance | Route/component split, performance budgets, RUM | M | Slow enterprise UX, especially low-bandwidth users. |
| Schema-per-tenant temptation | **Low / avoid** | No relational schema architecture today | Sustainable operations | Explicit ADR rejecting it as default | S | Migration/operational complexity debt. |

---

# 26. Target Architecture

## 26.1 Backend and data boundaries

```text
Identity Provider(s)
  Firebase compatibility auth / OIDC / SAML / SCIM
        │
        ▼
Edge / WAF / API gateway
  rate limit, TLS, request ID, bot protection
        │
        ▼
Tenant-aware application API (modular monolith)
  authenticate
    → resolve tenant/workspace request
    → verify membership / session / tenant status
    → evaluate RBAC + resource/ABAC policy
    → create immutable TenantContext
    → audit decision-sensitive action
        │
        ├─ Resume/CV module      ─┐
        ├─ Interview module       │ Existing certified modules are wrapped,
        ├─ AI module              │ not casually rewritten.
        ├─ Export module          │
        ├─ Billing/Admin module ──┘
        │
        ├─ Shared PostgreSQL control + tenant data plane (RLS)
        ├─ Legacy Firebase adapter during staged migration
        ├─ Redis (tenant-aware cache, rate/quota coordination)
        ├─ Object storage (tenant/workspace/key/quarantine policy)
        ├─ Durable queue/outbox
        ├─ Worker pools (AI, render, notify, lifecycle)
        ├─ AI provider router / isolated vector/RAG storage
        └─ Audit, logs, metrics, traces, SIEM/archive

Dedicated-tier router
  → dedicated database / storage key or bucket / queue pool / worker capacity
  → same policy contracts and application code
```

## 26.2 Frontend boundaries

```text
Enterprise user
  → Global shell
      → Auth/session state
      → Tenant switcher
      → Workspace switcher (when enabled)
      → Role-aware navigation
      → Command palette / search / notifications
      → Feature route
          → tenant-aware API client
          → context-aware actions
          → certified Resume/CV/Interview module adapters
```

## 26.3 Boundary rules

| Boundary | Rule |
|---|---|
| Browser → API | Browser may request context but cannot assert authorization; API replies include canonical context/version. |
| API → service | Pass immutable `TenantContext`, never raw client tenant identifiers. |
| Service → DB | Use tenant-aware repository and RLS transaction. |
| Service → cache | Key by tenant/workspace/scope/version; no shared response reuse. |
| API → queue | Serialize tenant/job context; worker rechecks lifecycle and policy. |
| Service → files | Server creates object keys/signatures and records scope. |
| Service → AI | Context broker authorizes selected sources; provider routing follows tenant policy. |
| Everything → audit | Sensitive decision/action emits tenant-scoped, structured audit event. |

---

# 27. Safe Phased Migration Plan

Every phase is gated. No phase is permission to refactor a certified baseline without the freeze protocol and relevant regression proof.

## Phase 0 — Architecture, inventory, and baseline protection

- **Scope:** Approve ADRs, tenant vocabulary, data classification, legacy-data inventory, protected-file/behavior manifest, test ownership, staging topology, and rollout flags.
- **Dependencies:** None.
- **Risks:** Incorrect inventory or a vague definition of “tenant.”
- **Tests:** Current `test:interview`, `test:security`, `test:product`; add a baseline manifest/hash/visual/export contract suite.
- **Rollback:** Documentation/configuration only; no runtime migration.
- **Done when:** Architecture decision, data inventory, threat model, supported tenant tiers, and freeze gates are signed off.

## Phase 1 — Identity and tenant foundation

- **Scope:** Introduce immutable principals, organizations, memberships, default personal organization/workspace, invitations, tenant lifecycle states, and IdP abstraction.
- **Dependencies:** Phase 0 data model and identity migration plan.
- **Risks:** Login lockout, duplicate identity mapping, accidental email-based account merge.
- **Tests:** Identity-link, invite, membership revocation, multi-org user, personal-account mapping, MFA/SSO fallback, and negative context tests.
- **Rollback:** Feature flag uses legacy Firebase account path; retain mappings, do not delete legacy identities.
- **Done when:** An existing user can safely receive a personal tenant and an authorized user can enter multiple tenants without changing certified content behavior.

## Phase 2 — Database isolation foundation

- **Scope:** Provision control plane, shared RLS schema, tenant-aware repository, key/index strategy, dedicated-tier routing contract, and legacy Firebase adapter.
- **Dependencies:** Tenant IDs and lifecycle states from Phase 1.
- **Risks:** Incorrect RLS policy, bad migration mapping, dual-write divergence.
- **Tests:** RLS force-policy tests, composite FK/unique constraint tests, tenant-A/B collision IDs, migration checksum/reconciliation tests, backup restore rehearsal.
- **Rollback:** Read legacy source of truth; disable migrated read/write feature flag; retain immutable migration journal.
- **Done when:** New tenant-domain records cannot be read/written cross-tenant even with a deliberately omitted application predicate.

## Phase 3 — API and authorization boundary

- **Scope:** Tenant resolver, `TenantContext`, policy module, tenant-aware API version, resource policy adapters, idempotency/audit conventions.
- **Dependencies:** Phases 1–2.
- **Risks:** Existing routes accidentally bypass middleware; stale membership state.
- **Tests:** Endpoint-by-endpoint BOLA matrix, role/membership change tests, suspend/revoke races, cursor/search/report isolation.
- **Rollback:** Route-level feature flags and legacy endpoint behavior remain until consumer cutover is verified.
- **Done when:** Every new tenant route is tenant-context required and no new data access uses unscoped repositories.

## Phase 4 — Cache, queue, files, and render isolation

- **Scope:** Redis, tenant-aware rate/quota coordination, durable queue/outbox, isolated render worker, object-storage/quarantine service, signed URLs.
- **Dependencies:** Tenant context and authorization contracts.
- **Risks:** Context loss in jobs, signed URL leakage, render compatibility regression.
- **Tests:** Queue replay/cancel/retry, cache collision, signed URL cross-tenant denial, worker reauthorization, malicious upload/render tests, PDF/DOCX parity tests.
- **Rollback:** Keep current in-memory export route as a controlled fallback until parity/capacity proof; disable async worker feature by flag.
- **Done when:** A tenant cannot consume another tenant’s cached item, job, file, or render capacity beyond configured shared limits.

## Phase 5 — AI isolation and governance

- **Scope:** Tenant AI policy/configuration, secret references, usage ledger, budget controls, context broker, optional memory/RAG/vector namespace, AI worker flow.
- **Dependencies:** Phases 1–4 and a data classification policy.
- **Risks:** Weakening existing provider failover or `54cb62f` behavior; AI context leakage.
- **Tests:** Preserve existing AI/interview suite; add cross-tenant prompt/cache/vector/job tests, provider failover by tenant, quota/budget, deletion propagation, prompt-injection evaluations.
- **Rollback:** Keep current global provider configuration behavior for legacy paths; disable optional tenant memory/RAG independently.
- **Done when:** No AI request can retrieve/cache/infer an unauthorized tenant source in automated adversarial tests.

## Phase 6 — Enterprise administration

- **Scope:** Tenant admin center, member/invite/role flows, SSO/SCIM policy, API keys/service accounts, support grants, tenant audit views, data/privacy controls.
- **Dependencies:** Authorization, audit, lifecycle, identity foundation.
- **Risks:** Privilege escalation or confusing role UX.
- **Tests:** Permission matrix, SCIM deprovisioning, JIT support access, audit completeness, browser accessibility/keyboard flows.
- **Rollback:** Feature-gate tenant admin; platform administrators retain existing operational controls while tenant management is rolled back safely.
- **Done when:** Tenant admins can perform delegated administration without platform-wide access or support intervention.

## Phase 7 — Advanced premium UI/UX

- **Scope:** Global enterprise shell, tenant/workspace switcher, command palette, role-aware dashboards, activity center, design-system primitives, context-aware AI UX.
- **Dependencies:** Canonical tenant API/context and admin permissions.
- **Risks:** Unsaved work loss, visual regressions in frozen workflows, accessibility regressions.
- **Tests:** Context-switch E2E, unsaved-change flows, visual regression, keyboard/screen reader acceptance, performance budget checks.
- **Rollback:** Shell/switcher feature flags; certified feature modules remain reachable with existing routes during transition.
- **Done when:** A user can always identify active tenant/workspace, switch safely, and see only role-appropriate navigation/actions.

## Phase 8 — Usage, billing, and quotas

- **Scope:** Seat ledger, tenant billing account, pooled/allocated AI/API/storage use, plan enforcement, limit/overage UX, invoice/report integration.
- **Dependencies:** Tenant control plane, usage events, audit.
- **Risks:** Entitlement/billing mismatch and incorrect metering.
- **Tests:** Meter idempotency, proration, suspension/reactivation, quota race, webhook reconciliation, tenant-level invoice/export tests.
- **Rollback:** Metering runs shadow/read-only before enforcement; preserve current individual entitlement checks until migration is reconciled.
- **Done when:** Usage and limits are explainable, accurate, auditable, and resistant to duplicate events.

## Phase 9 — Security, audit, compliance, and DR

- **Scope:** SIEM/logging/tracing, KMS/Secret Manager, retention/legal hold, DPA/residency, vulnerability management, DAST, pen test, backups/restore, incident response.
- **Dependencies:** All tenant boundaries and data inventory.
- **Risks:** False compliance claims or destructive retention automation.
- **Tests:** Restore drill, tabletop incident, external penetration test, secret rotation, access review, data deletion verification across stores.
- **Rollback:** Policy changes use staged/report-only modes; backup/retention changes require approval and reversible holds.
- **Done when:** External evidence demonstrates controls, not merely code intent.

## Phase 10 — Scale and production certification

- **Scope:** Multi-tenant load/chaos tests, capacity tiering, dedicated-tier migration rehearsal, rollout plan, go/no-go review, production evidence package.
- **Dependencies:** Phases 0–9.
- **Risks:** Real-world workload differs from test assumptions.
- **Tests:** Tenant-A/B isolation at load, worker/node/region failure, deploy rollback, SLO/error budget, production canary, live identity/provider/backup validation.
- **Rollback:** Canary/ring deployment, feature flags, database migration rollback/forward plan, tenant-level circuit breakers.
- **Done when:** Measurable Enterprise Definition of Done (Section 29) is met and all certified baseline suites are green.

---

# 28. Regression Protection Strategy

## 28.1 Non-negotiable promotion gates

At minimum, every migration phase that can affect product behavior must keep these green:

```text
npm run test:interview  → 28/28 PASS
npm run test:security   → 163/163 PASS
npm run test:product    → 301/301 PASS
npm run build           → PASS
```

A failure blocks promotion until root cause, blast radius, and remediation are documented. “The new tenant feature works” is not a reason to waive an existing certified regression.

## 28.2 Additional required suites

| Suite | What it proves |
|---|---|
| `test:tenant-isolation` | Tenant A cannot read/write/list/search/page/aggregate/export Tenant B data across every resource type. |
| `test:tenant-policy` | Membership, role, workspace, suspension, support grant, and policy-version decisions. |
| `test:tenant-context-propagation` | API → service → DB/cache/queue/file/AI context is never dropped or substituted. |
| `test:cache-isolation` | Cache keys, invalidation, CDN headers, and context switches cannot bleed data. |
| `test:worker-isolation` | Retry, replay, DLQ, cancellation, and reauthorization preserve tenant scope. |
| `test:file-isolation` | Upload/quarantine/sign/download/delete/restore paths stay tenant-bound. |
| `test:ai-tenant-isolation` | Prompt, response cache, memory, RAG, vectors, configuration, quota, and provider failover are tenant-bound. |
| `test:billing-metering` | Seat/usage/entitlement/webhook idempotency is tenant-correct. |
| `test:a11y-enterprise` | Keyboard, focus, dialog, switcher, tables, contrast, screen reader, reduced-motion acceptance. |
| `test:visual-certified` | Resume/CV/Interview/print/DOCX/PDF golden behavior, especially shared shell/style changes. |
| `test:firebase-rules` | Firestore and RTDB emulator rules under Java-enabled CI/staging. |
| Load/chaos/restore suites | Noisy neighbor, worker failure, database restore, and tenant migration proof. |

## 28.3 Certified baseline change protocol

For any future change touching a certified baseline:

1. Name the affected baseline commit and files/behavior.
2. Explain the architectural/security necessity.
3. Use an adapter/wrapper first; prove a direct edit is necessary.
4. Add focused regression coverage before changing behavior.
5. Run all three certified suites plus affected visual/export/browser suites.
6. Capture before/after behavior, document parity, and require reviewer sign-off.
7. Release behind a reversible feature flag/canary where feasible.

---

# 29. Enterprise Definition of Done

The system should not be called “10/10 enterprise” until evidence demonstrates all of the following.

## Tenant isolation

- 100% of tenant-scoped API routes, repositories, jobs, files, caches, vector searches, and exports have automated A-vs-B negative tests.
- RLS is forced for every shared tenant table; application service identities cannot bypass it in normal operation.
- No unauthorized cross-tenant access is found in independent penetration testing or adversarial test suites.

## Identity and authorization

- OIDC/SAML and SCIM work for a supported enterprise IdP matrix.
- Tenant-scoped RBAC/resource policy, suspension, revocation, step-up authentication, API keys, and service accounts are tested.
- Platform support access is JIT, case-scoped, tenant-visible/audited, and default-deny.

## AI isolation

- Provider/model configuration, budget, prompt policy, cache, memory, RAG, embeddings, and vector retrieval all include a server-enforced tenant boundary.
- Cross-tenant AI red-team tests show zero data/context retrieval across tenant boundaries.
- Existing provider failover, parsing resilience, Interview Coach contextual quality, and zero-leakage contracts remain green.

## Scalability and reliability

- Documented per-tier load tests establish target capacity and noisy-neighbor limits.
- API, AI, render, notification, and lifecycle workers are independently scalable and tenant-quotable.
- SLOs are agreed and measured; a reasonable initial target is 99.9% API availability with separately defined AI/render SLOs, but business owners must approve actual values.
- Backup/PITR and tenant restore drills meet approved RPO/RTO (for example, an initial target of RPO ≤15 minutes and RTO ≤4 hours should be validated, not assumed).

## Administration, audit, and compliance

- Tenant owners/admins can provision, suspend, export, delete, and investigate their tenant without platform-wide access.
- Security-sensitive actions create complete, searchable audit events with an approved retention policy and immutable archive.
- Data residency, retention, legal hold, deletion, DPA, and vendor-processing controls have legal/security approval and operational proof.

## UX and accessibility

- Active tenant/workspace is unmistakable on every authenticated product route.
- Context switching protects unsaved work and clears scope-sensitive state.
- Role-aware dashboards, administration, usage/billing, and AI scope are usable in task-based research.
- WCAG 2.2 AA automated and manual evidence covers keyboard navigation, dialogs, forms, tables, contrast, screen readers, focus management, and reduced motion.
- Performance budgets/RUM show acceptable experience on supported devices and networks.

## Production safety

- The protected baseline suite remains fully green at the recorded counts.
- Firebase rule emulator tests, staging/provider tests, DAST, dependency/secret scanning, external pentest, deployment/IAM review, and rollback drill are completed.
- A production evidence package records commit, immutable artifact digest, configuration version, deployment approvals, health checks, tenant isolation test result, and rollback plan.

---

# 30. Final Recommendation

1. **Do not implement tenant IDs in existing tables/documents as the first move.** First create the tenant control plane, tenant context, policy contract, data inventory, and regression matrix.
2. **Adopt the hybrid model**: shared RLS/server-mediated default plane, dedicated plane only for justified enterprise tiers, and a legacy Firebase bridge that protects current functionality.
3. **Choose modular monolith + workers.** This yields strong enterprise boundaries without a costly, regression-prone microservice rewrite.
4. **Treat AI as a tenant data plane.** Retain the current zero-leakage hardening and add tenant policy, context broker, usage, cache, memory/RAG/vector, and provider-secret boundaries before offering enterprise AI configuration.
5. **Make tenant context visible and authoritative.** It must be present in the UI, server authorization, data stores, caches, jobs, files, AI, logs, and audit events.
6. **Preserve the certified Resume/CV/Interview/export assets by wrapping, not rewriting.** The new enterprise shell should add organization/workspace context around them first.
7. **Do not claim 10/10 production enterprise readiness yet.** The current protected product baseline is strong and its named suites pass, but the multi-tenant control plane, enterprise identity, RLS data plane, tenant-aware operations, proof of isolation, and external production/SRE evidence remain future work.

The recommended next action is **Phase 0 approval**, followed by a small, separately reviewed tenant-foundation implementation plan. No production baseline should be modified until that plan includes an affected-baseline declaration, a rollback strategy, and the required regression gates.
