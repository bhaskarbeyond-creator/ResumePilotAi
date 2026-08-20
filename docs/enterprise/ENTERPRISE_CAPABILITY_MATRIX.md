# ResumePilot Enterprise — Capability Matrix (Completeness Audit)

**Baseline:** `cca10d3` (branch `arena/01a02113-resumepilotai`, as instructed)
**Working branch:** `arena/01a02146-resumepilotai` (session branch reset to the requested baseline, work committed on top)
**Audit method:** independent comparison of CURRENT implementation vs EXPECTED enterprise capability vs BACKEND vs API vs UI vs PERMISSION vs AUDIT vs TEST support, per module. The pre-existing UI/backend were treated as evidence, never as the source of truth.

Legend: ✅ implemented &nbsp;·&nbsp; ➕ added by this audit &nbsp;·&nbsp; ⛔ intentionally absent (justified) &nbsp;·&nbsp; 🔌 API building block (no UI by design)

## 1. Overview / Executive Dashboard

| Capability | Backend | API | UI | Permission | Audit | Test | Status |
|---|---|---|---|---|---|---|---|
| Tenant health posture | ✅ | ✅ | ✅ | tenant.read | — | ✅ | PASS |
| Member / workspace / team counts | ✅ | ✅ | ➕ teams count | ✅ | — | ✅ | PASS |
| AI usage today + quota ratio | ✅ | ✅ | ➕ | ✅ | — | ➕ | PASS |
| Request latency / error window (real telemetry) | ✅ | ✅ | ✅ | ✅ | — | ✅ | PASS |
| Queue health + DLQ count | ✅ | ✅ | ✅ | ✅ | — | ✅ | PASS |
| Encryption / data-plane posture | ✅ | ✅ | ✅ | ✅ | — | ✅ | PASS |
| Actionable recommendations (real state only) | ✅ | ✅ | ✅ | ✅ | — | ✅ | PASS |
| Recent activity feed | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | PASS |
| Trend history | — | — | — | — | — | — | ⛔ metrics are in-process windowed telemetry; no fake history rendered |

## 2. Documents / Resumes

| Capability | Status |
|---|---|
| List / search / detail-id / classification / revision | PASS |
| Create (composer link), edit (composer link), duplicate, delete (confirmed, permissioned, audited) | PASS |
| Workspace-scoped isolation (RLS partition) | PASS (enterprise-firestore-isolation tests) |
| Hard-delete of workspace with documents | ⛔ data-preservation model: archive/restore only |
| Signed artifact download button | 🔌 `/storage/token` + `/storage/verify` are verified building blocks; no object store is attached, so no decorative download button is exposed (no fake data rule) |

## 3. Users & IAM

| Capability | Status |
|---|---|
| Grant access (direct, verified identity only) | PASS |
| **Invitation lifecycle: create INVITED → email (best-effort) → auto-accept on first sign-in → resend → cancel** | ➕ PASS (tested) |
| Suspend / reactivate (server-enforced: frozen members get 403 at context resolution) | PASS (verified by test) |
| Remove (last-owner protection) | PASS |
| Role assignment/change (incl. custom roles) | PASS / ➕ custom roles |
| Primary workspace assignment | PASS |
| Status/role/invitation search + status filters | PASS |
| Member CSV / JSON export | ➕ PASS |
| Effective permissions in member detail (live roles-matrix join) | ➕ PASS |
| Member activity deep link into audit (server-side actor filter) | ➕ PASS |
| MFA status column | ⛔ per-user MFA state is not exposed by the identity provider records available to the tenant plane; the tenant MFA *policy* is enforced and shown in Security posture |
| SCIM provisioning | ⛔ recorded policy field; federation prerequisite, not implemented — not exposed as a fake control |
| Bulk member operations | ⛔ every membership mutation is individually guarded + audited; sequential client-side batching would fake atomicity |

## 4. Teams

| Capability | Status |
|---|---|
| Create / rename / archive | PASS |
| **Restore from archive + archived roster view** | ➕ PASS (tested; parity with workspaces restored) |
| **Team lead (set/clear, member-of-workspace validated)** | ➕ PASS (tested) |
| Members add/remove (validated against active tenant membership) | PASS |
| Search | ➕ PASS |
| Hard delete | ⛔ archive/restore model preserves audit history |

## 5. Workspaces

| Capability | Status |
|---|---|
| Create / rename / archive / restore / default-workspace protection | PASS |
| Members drawer (add/remove), workspace switching, unmistakable context badge | PASS |
| Hard delete | ⛔ data preservation; retention/export covers egress |

## 6. Roles & Permissions

| Capability | Status |
|---|---|
| Live role + permission matrix (server definitions) | PASS |
| **Tenant-defined custom roles** (whitelisted bundles, no wildcard, never tenant-wide scope, write-time allowlist, fail-closed resolution) | ➕ PASS (tested) |
| Member counts per role | ➕ PASS |
| Effective permission drill-down per member | ➕ PASS (Users detail) |
| Role comparison / inheritance explanation | PASS (matrix + role cards) |
| Platform role mutation | ⛔ fixed platform roles are a designed security invariant (scope semantics like tenant-wide workspace access are bound to builtin roles) |

## 7. AI Governance

| Capability | Status |
|---|---|
| Provider allowlist (deny-by-default, server-enforced) | PASS |
| **Model allowlist (server-enforced — provider disabled if its model is not approved)** | ➕ PASS (tested) |
| **Primary model (server-enforced via provider selection)** | ➕ PASS (tested) |
| Rate limits (per-principal durable atomic counters) + daily allowance | PASS |
| Quota consumption visibility + threshold warnings | ➕ PASS |
| Usage by workspace / provider / model / **by user** | PASS / ➕ by-user (tested) |
| **Per-event AI generation ledger (correlation ids)** | ➕ PASS (tested) |
| Client-authority rejection (identity/tenant fields), server-side source authorization | PASS |
| Provider health / cost dashboards | ⛔ only real metered values are shown; no synthetic health/cost is fabricated |

## 8. Security & M2M

| Capability | Status |
|---|---|
| Service accounts: create (reveal-once) / list / revoke | PASS |
| **Key rotation (old key dead immediately, transactional replacement)** | ➕ PASS (tested incl. m2m 401) |
| Key expiry visibility + expiring-soon warnings | ➕ PASS |
| Security posture (MFA policy, session policy, SSO state, encryption state, break-glass policy — all real values) | ➕ PASS |
| Durable jobs: status filters, DLQ replay, queue posture | PASS |
| Signed artifact tokens | 🔌 verified building blocks (tested) |

## 9. Usage / Quotas

Days window selector ➕ · summary + daily rollups ✅ · by workspace/provider/model ✅ · **by user ➕** · **quota cards with progress + thresholds ➕** · **recent generations ledger ➕** · billing ⛔ out of product scope (no fabricated billing).

## 10. Audit

| Capability | Status |
|---|---|
| Server-side filters: action/outcome/since/until | PASS |
| **Actor / severity / category filters** | ➕ PASS (tested) |
| **Keyset pagination (cursor + Load more)** | ➕ PASS (tested) |
| Event detail inspection (full JSON incl. before/after metadata, correlation ids) | PASS |
| CSV / JSON export of the server-filtered set | PASS |
| Severity/category columns | ➕ PASS |

## 11. Support / Break-Glass

Grant create (reason mandatory, TTL bounded 5–480 min) ✅ · revoke ✅ · **scope selection governed by tenant policy — diagnostic-only by default, repair scopes require explicit opt-out (server-enforced)** ➕ PASS (tested) · requested-by column ➕ · live/expired/revoked segmentation ➕ · support-side context activation 🔌 (`/support/context`, API-level for support staff; no tenant-UI consumer by design) · zero implicit access ✅ (grants are the only path).

## 12. Organization Settings

Retention policy ✅ · MFA-for-admins (enforced) ✅ · session max (enforced) ✅ · **SSO mode (now genuinely enforced: non-federated sign-ins rejected)** ➕ PASS (tested) · support scope policy (enforced) ➕ · **organization rename (audited, slug immutable)** ➕ PASS (tested) · **verified tenant data export** ➕ PASS (tested) · suspension danger zone ✅ · snapshot **restore** ⛔ platform/CLI-only operation (deliberately not tenant-self-service) · aiMemoryEnabled / renderConcurrency ⛔ recorded in config, not enforced anywhere → deliberately not exposed (no decorative controls).

## 13. Platform Administration (new module)

| Capability | Status |
|---|---|
| Server-gated visibility (`platformAdmin` derived in /context; nav item hidden otherwise) | ➕ PASS (tested) |
| Tenant registry list (all tenants, lifecycle/tier/region) | ➕ PASS (tested) |
| Suspend / reactivate tenant lifecycle (audited to security audit log) | ➕ PASS (tested) |
| Tenant provisioning (previously backend-only; now discoverable UI) | ➕ PASS (tested) |
| Tenant admins cannot reach platform routes | ➕ PASS (403 tested) |
| Global audit / incidents / global quotas | ⛔ platform telemetry beyond the registry is not implemented; nothing fabricated |

## Cross-cutting invariants

- **Tenant isolation:** Firestore partition-scoped repository + context freeze; cross-tenant access returns 404 (tested in enterprise-firestore-isolation).
- **Authorization:** every route behind `resolveTenantContext` + `requireTenantPermission`; UI gating is cosmetic only.
- **Auditability:** all new mutations write audit events (TEAM_RESTORED, SERVICE_ACCOUNT_KEY_ROTATED, TENANT_INVITATION_CREATED/RESENT, TENANT_PROFILE_UPDATED, TENANT_DATA_EXPORTED, PLATFORM_TENANT_*, TENANT_MEMBERSHIP_*).
- **No fake data:** every displayed number comes from a live endpoint; unavailable states say so.
