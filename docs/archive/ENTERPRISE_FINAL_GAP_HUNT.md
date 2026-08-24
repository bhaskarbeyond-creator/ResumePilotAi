> **SUPERSEDED (2026-08-20 architecture refactor):** The enterprise architecture described here (PostgreSQL/RLS data plane, local queue, Redis) was replaced by the Firestore-first architecture. The current truth is `docs/ENTERPRISE_ARCHITECTURE.md`; the deployment runbook is `docs/ENTERPRISE_LOCAL_INFRASTRUCTURE_HANDOFF.md`. This document is retained as history.

# Enterprise Tenant Foundation — Independent Gap Hunt

**Date:** 2026-08-20
**Scope:** implementation branch tenant foundation, independent of the earlier architecture assessment
**Result:** local code foundation is hardened and tested; full production enterprise certification is **not** claimed.

## Architecture review

| Question | Result | Evidence / action |
|---|---|---|
| Is tenant context explicit? | Yes for new enterprise routes/data-plane helpers | Immutable `TenantContext` is server-derived and carries tenant/workspace/canonical principal/routing/policy/correlation scope. |
| Can a client assert a tenant? | No | `X-Tenant-Id`/`X-Workspace-Id` are resolved against membership/workspace records. Spoofing tests deny access. |
| Is a personal Firebase tree exposed to a business tenant? | No in the bridge | `certifiedModuleBridge` allows legacy paths only when personal tenant `legacyOwnerUid` equals context subject. |
| Is PostgreSQL RLS merely declarative? | No locally | SQL enables and forces RLS; PGlite tests execute policies with a non-bypass role, missing context, tenant switch, workspace switch, and reused transaction connection. |
| Is a privileged database escape possible? | Operationally possible only for DBA roles by design | Runtime/worker roles are distinct and `NOBYPASSRLS`; real IAM/role grants remain a deployment gate. |
| Are dedicated routes scattered? | No | `TenantDataPlaneRouter` selects shared or injected dedicated pool from the data-plane route. Dedicated falls closed if resolver/profile is absent. |

## Security review

| Attack | Local result |
|---|---|
| Tenant A uses Tenant B API context | Denied by membership resolver/API integration test. |
| Tenant A requests Tenant B resource | Denied by resource policy/RLS contract and adversarial test. |
| Tenant A cache collision | Distinct tenant/workspace/version cache keys; 1,000 tenant namespace test. |
| Tenant A file/artifact token use | Namespace and signed-token context/purpose/expiry tests deny it. |
| Tenant A AI source/cache contamination | Client authority fields and foreign source descriptors are denied; cache key/policy test isolates it. |
| Tenant job tampering | HMAC envelope validation rejects changed tenant ID; worker reauthorization validates current membership/lifecycle/route. |
| Owner privilege escalation by non-owner | Tenant owner grants are restricted to existing owners; membership route requires tenant permission. |
| Suspended tenant reuse | Context resolution and outbox reauthorization deny suspended tenants. |
| Missing PostgreSQL context | Forced RLS test returns no rows. |

## Data/migration review

| Category | Status |
|---|---|
| Personal resumes/CVs/covers/job tracker/favorites | Adapter-first mapping is deterministic to personal tenant. No migration executed. |
| Public resume projection | Must follow verified personal source ownership; no physical move executed. |
| Companies/jobs/job applications | Explicitly blocked as ambiguous until approved ownership rule. |
| Realtime conversations/messages | Explicitly blocked/legacy archive until application/job tenant mapping is approved. |
| Financial/legal records | Retained as control-plane/legacy records; no reclassification/move executed. |
| Browser interview/recovery history | Remains personal/local; not silently uploaded or copied into business tenants. |

## Operations review

| Area | Implemented locally | Still external/unverified |
|---|---|---|
| RLS schema | SQL + PGlite proof | Managed PostgreSQL role/IAM/pool/backup/deployment proof |
| Control plane | Firestore server-only bridge + PostgreSQL schema | Actual production Firestore data/IAM/index deployment |
| Cache/quota | Key/atomic contract | Redis/shared store deployment and load behavior |
| Queue | Signed envelope + outbox reauthorization contract | Managed queue/worker/DLQ production topology |
| File security | Namespace/signed token contract | Object store/quarantine/scanner/signed URL deployment |
| AI | Tenant policy/context primitives | Provider DPA/region/BYOK/RAG/vector/memory deployment |
| Observability | Audit/telemetry context primitives | Central logs/metrics/traces/SIEM/alerts |
| UX | Feature-gated responsive enterprise shell | Browser/user/accessibility validation in staging/production |

## Remaining high-impact deployment gates

These are intentionally not hidden as “done”:

1. Apply and verify real PostgreSQL migrations and non-bypass runtime roles in staging.
2. Provision real shared cache/quota, queue/worker, object storage/quarantine, and secrets/KMS.
3. Configure and test enterprise IdP/OIDC/SAML/SCIM/MFA/session/service-account flows.
4. Approve ambiguous ownership rules before any historical data migration.
5. Run Firebase emulator rules (Java-enabled environment), browser accessibility, multi-instance load, DAST, independent penetration, backup/restore, and production routing/Cloudflare evidence.

## Follow-up consistency fixes

A subsequent consistency pass found and fixed the following code-level gaps:

- control-plane workspace lookup was using the canonical PostgreSQL principal instead of the external membership subject;
- tenant AI interpreted an empty provider allowlist as allow-all;
- legacy APIs could silently ignore an enterprise context header;
- feature-flag mismatch between browser and server lacked an explicit rollout state;
- signed job context omitted external subject/issuer required for reauthorization;
- support access and M2M key material existed only as primitives, not authenticated endpoint flows;
- downstream jobs/artifact tokens did not carry all canonical data-plane profile/routing claims;
- aggregate migration reconciliation did not report collection duplicates/missing/unexpected records.

All have targeted regression coverage in the enterprise suite.

## Final gap-hunt conclusion

No newly identified local code-level critical or high cross-tenant escape path remains in the feature-gated tenant foundation tests. Production/infrastructure verification remains a material gate, so the foundation must not be marketed or certified as a fully deployed 10/10 enterprise platform until those external controls are evidenced.
