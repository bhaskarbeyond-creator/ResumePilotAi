# 11 — Residual Risk and Open Decisions

**What belongs here.** Only questions that (a) cannot be answered from the repository, and (b) change what should be built. Everything answerable from code is answered in §04–§10; nothing is parked here to avoid analysis. Each entry states the exact question, the provisional position this review takes in the meantime, the options with their trade-offs, and the single fact that would settle it.

**Every entry below is a live `UNRESOLVED — decision required` item**, with the exact question, the owner, the trade-offs and the provisional position stated.

**Format for every entry:** `Question` → `Why it cannot be settled from the repo` → `Provisional position (what this document assumes)` → `Options & trade-offs` → `Owner` → `Consequence if the provisional position is wrong`.

**Counts:** 10 open decisions — 3 blocking a phase-0/1 action (RR-001, RR-002, RR-003), 7 shaping later phases.

---

## RR-001 — Can the admin console ship behind a feature flag while remediation proceeds?

**Blocking:** Phase 0 scope and any release decision.

**Why it cannot be settled from the repo:** it depends on operational context the repository does not carry — who has access to `/admin` today, whether the new console is already deployed, and whether a trained operator set exists.

**Provisional position:** **No.** The console must not be enabled for any operator until REC-001, REC-002 and REC-003 are merged.

**Reasoning (evidence, not preference):** a feature flag protects against *unfinished* features; it does not protect against features that *state falsehoods*. `[PROBE-003]` shows 10 mutations calling `404`s; `AdminUsersTab.tsx:203-225` reports "User marked as SUSPENDED" after such a failure. An operator who is warned that the console is beta still cannot tell a working control from a broken one, because the interface renders both identically. Training cannot compensate for an interface that reports success falsely.

| Option | Trade-off |
|---|---|
| (a) Keep it disabled until Phase 1 completes | Safest; delays the genuinely good surfaces (health, email, maintenance) that are already correct |
| (b) Enable with a reduced tab set (maintenance/system-health only) | Gets the single capability that is correct end-to-end (CAP-048) into operators' hands early; the other 23 surfaces need REC-001/002/003 first, so the reduced set is genuinely small |
| (c) Enable fully with a warning banner | Rejected: a banner cannot make a false success honest |

**Owner:** release authority + product owner.
**If wrong:** if the console is already in operator hands, every RCA-001/002 instance is a live operational risk and Phase 0 becomes incident response rather than scheduled work.

---

## RR-002 — Backend authority first, or console completeness first?

**Blocking:** phase sequencing and staffing.

**Why it cannot be settled from the repo:** it is a resourcing decision, not a technical one.

**Provisional position:** **Parallel tracks, with a single emergency sprint ahead of both** containing REC-003, REC-004 and REC-012(a).

**Reasoning:** the two tracks have almost no file overlap — backend authority (REC-005, REC-006, REC-015) touches `backend/security/**` and migrations; console completeness (REC-001, REC-007, REC-011, REC-021) touches `frontend/src/components/admin/**`. Serialising them doubles the calendar time for no risk reduction. The exception is the emergency set, which is small (est. S+S+M), self-contained, and closes a live escalation path (`ADMIN` → strip `SUPER_ADMIN` MFA).

| Option | Trade-off |
|---|---|
| (a) Backend first | Produces one authoritative permission model before any UI is rebuilt — avoids encoding the inverted `ADMIN` profile (§08 §4.4) — but leaves the console unusable for another cycle |
| (b) Console first | Operators get surfaces sooner — but each new tab is built against a permission model that denies `ADMIN` its own panels, so the UI will hard-code workarounds that must then be removed |
| (c) Parallel + emergency sprint | Fastest defensible path; needs two owners and a shared contract test (REC-023) to stop the trees drifting |

**Owner:** engineering lead.
**If wrong:** choosing (b) without REC-005/006 creates rework proportional to the number of tabs built; choosing (a) alone leaves a console that still cannot be enabled.

---

## RR-003 — What is the break-glass path when the only super-admin is locked out?

**Blocking:** REC-004 (the target-privilege ceiling deliberately removes `ADMIN`'s ability to rescue a root account) and REC-026.

**Why it cannot be settled from the repo:** it is a policy decision about who may hold root and how a lockout is resolved; the code shows only that today the answer is "an ADMIN strips the MFA" (`[PROBE-004]`), which is the hole being closed.

**Provisional position:** REC-004 should ship as specified (caller may never act on a target that outranks them, `SUPER_ADMIN → SUPER_ADMIN` permitted), and the lockout path should be **out-of-band, documented, and audited after the fact** (REC-026).

| Option | Trade-off |
|---|---|
| (a) Two-person rule: two `SUPER_ADMIN`s must approve a root credential reset | Strongest control; requires an approval workflow that does not exist and a minimum of two root holders (an availability dependency) |
| (b) Time-boxed, audited elevation of a named `ADMIN` (e.g. 1 hour, reason required, alerts on use) | Buildable with REC-005's tables; adds a temporary escalation path — the thing REC-004 exists to remove, though audited and narrow |
| (c) Out-of-band DB/Firebase operation by the platform owner, recorded in a runbook within 24h | No new code; relies on process discipline and post-hoc attestation |

**Owner:** security owner + platform owner.
**If wrong:** if (a) is required by policy and (c) ships, the audit trail will have an unexplained gap at exactly the moment it is scrutinised.

---

## RR-004 — Should the role-view simulation exist at all, and may AUDITOR see actor identities?

**Blocking:** REC-018 (role view) and REC-008 (audit trail visibility).

**Why it cannot be settled from the repo:** both are product/policy choices. The code shows the legacy behaviour (super-admin-only switcher, `Admin.jsx:648-676`) and that the new switcher is shown to everyone (`cuba-app-shell.tsx:416-424`), but not whether "view as" is a marketed feature.

**Provisional position:** delete the simulation in favour of REC-014's capability projection; show AUDITOR full actor identity in the audit trail (the role exists to attribute actions).

| Option | Trade-off |
|---|---|
| Keep the simulation, gate it to `SUPER_ADMIN`, make the audit write a precondition | Preserves a demo/support affordance; keeps a feature that changes nothing server-side, which is exactly the misunderstanding to avoid |
| Delete it; capability projection shows the same information truthfully | Removes a misleading affordance; costs demo value |
| Redact actor emails from AUDITOR's audit view | Stronger privacy; weakens the role's purpose (attributing an action to a person) |

**Owner:** product owner + security owner.
**If wrong:** keeping an ungated simulation leaves a UI that implies an enforcement the server does not perform (an INV-5 inversion, §08 §3).

---

## RR-005 — How often are the legacy-only capabilities actually used in production?

**Blocking:** prioritisation within Phase 2 (REC-021 builds up to 10 surfaces; the order should follow real usage).

**Why it cannot be settled from the repo:** there is no product telemetry for the legacy admin SPA anywhere in the tree — no analytics for `/admin`, no request log, no usage table. Legacy route presence proves *capability*, never *demand*. This is the single largest evidence gap in the review and it is stated as such rather than papered over.

**Provisional position:** prioritise by **incident consequence**, not by frequency, for the first pass: audit trail (REC-008) → tenant suspend (REC-007) → feature flags (REC-013) → operator session revocation (REC-020) → then frequency-driven ordering for the content surfaces (REC-021).

**What would settle it:** 30 days of access-log analysis on the legacy host — request counts per `/api/admin/*` and `/api/platform/*` route, plus SPA route entry counts for `/admin/*`. `reference-code/README.md` identifies the origin host, so this is obtainable from the hosting provider's logs.

| Option | Trade-off |
|---|---|
| Incident-consequence ordering (provisional) | Correct under uncertainty for safety-critical levers; may over-invest in low-frequency surfaces (e.g. tenant decommission) |
| Frequency-driven ordering | Efficient for daily operations; risks ranking an incident-critical lever low because it is rare — which is the normal shape of emergency controls |

**Owner:** product owner (with the hosting log pull).
**If wrong:** Phase 2 spends its first sprint on a surface used twice a year while the daily-use surface waits.

---

## RR-006 — Do we implement an application object-storage adapter or formally drop the capability?

**Blocking:** CFG-032, CAP-037 (currently `501 STORAGE_PROVIDER_UNSUPPORTED`).

**Why it cannot be settled from the repo:** it is a commercial/architecture decision (asset hosting cost model and which provider), not a code question.

**Provisional position:** keep the `501`. It is an honest refusal, it is classified OBSOLETE in §03, and it is cited in §07 (DIV-010) as the model for how unimplemented capabilities should present.

| Option | Trade-off |
|---|---|
| Keep `501`, delete the legacy screen permanently | Zero cost; documents a small capability gap |
| Implement an adapter (S3-compatible) behind an interface | Restores upload capability; new credential surface (CFG-032 becomes real) and a new failure mode for exports |
| Delegate to the existing CDN/provider already used by portraits (if any) | Needs verification of what the product uses today — not determinable from the admin plane |

**Owner:** platform owner.
**If wrong:** if storage is genuinely needed for the resume flow, a `501` on a control-plane category is the least of the problems — the flow itself would be failing.

---

## RR-007 — What are the correct retention periods (audit, AI usage, outbox)?

**Blocking:** CFG-013, CFG-014, CFG-015 — the review deliberately did **not** invent numbers as fact; the table marks them "proposed".

**Why it cannot be settled from the repo:** retention is a legal/compliance and storage-cost decision. No retention configuration exists anywhere in the codebase (verified by search), so there is nothing to read.

**Provisional position:** nothing is configured today, which means nothing is ever deleted. Treat that as the current de-facto policy (retain indefinitely) until a decision is recorded — it is at least safe, and it is honest.

| Option | Trade-off |
|---|---|
| Retain indefinitely (status quo) | No data loss; unbounded storage growth and a growing personal-data surface — potentially the larger compliance exposure |
| Fixed defaults (audit 365 d, AI usage 90 d, outbox 30 d) with dashboard override | Operable and auditable; requires a decision owner and a documented legal basis |
| Per-jurisdiction policy | Correct for a global product; substantially more work and needs legal input |

**Owner:** legal/compliance + platform owner.
**If wrong:** picking a retention floor below a statutory minimum is a compliance breach that no code review would catch.

---

## RR-008 — Should configuration support tenant-level overrides, or stay platform-only?

**Blocking:** REC-011's data model (does a settings key carry a `tenant_id`?), and every CFG row scoped `PLATFORM` in §09.

**Why it cannot be settled from the repo:** the platform has tenants (`enterprise_tenant_configurations`) but no evidence that any platform configuration value is intended to vary per tenant. Tenant RBAC already varies per tenant (`customRoles`), which makes the question live rather than theoretical.

**Provisional position:** platform-only for Phase 1–3; the proposed keys in §09 are namespaced (`payments.currency`, `ai.quota.plan.*`) so a `tenant_id` dimension can be added later without renaming.

| Option | Trade-off |
|---|---|
| Platform-only | Simple, auditable, one value to reason about; enterprise customers cannot differ on tax/currency/quota except through entitlements |
| Tenant overrides with platform default + tenant value | Matches how enterprise contracts actually work; doubles the audit model (two before/after pairs), complicates the resolver, and creates a precedence question (env > tenant > platform > default) |
| Tenant overrides only for a named subset (quota, currency, SMS sender) | Middle path; needs the subset decided before the schema is written |

**Owner:** product owner.
**If wrong:** a platform-only schema shipped today becomes a migration on live tenant data later — cheap now, expensive then.

---

## RR-009 — Is `AUDITOR` intended to be read-only across the whole platform, or only for audit data?

**Blocking:** REC-006's manifest (the exact grant set) and REC-008's redaction policy.

**Why it cannot be settled from the repo:** the literal grants `AUDITOR` seven permissions (`auth.js:78-85`), including `users.read` and `payments.read`, so the implemented intent is "read everything relevant to compliance". But the role is denied `audit.read`'s subject matter (the audit trail) by a path-policy accident (RCA-004), so the *implemented* behaviour contradicts the *granted* intent. Which one is authoritative is a policy question.

**Provisional position:** `AUDITOR` = read-only across users, tenants, payments, security, AI usage and audit; no mutation anywhere; audit trail included.

| Option | Trade-off |
|---|---|
| Broad read (provisional) | Fits an external/statutory auditor; personal data visible to a role that may not need it |
| Audit-data only | Minimum necessary; makes the role useless for the reconciliation work auditors actually do |
| Broad read + field-level redaction (emails, IPs, payment identifiers) | Best privacy posture; needs a redaction policy per field and a test per field |

**Owner:** security owner.
**If wrong:** granting broad read to an external auditor is a data-protection finding; granting too little means the audit trail is again unreadable by the role created to read it.

---

## RR-010 — Is the new frontend the only admin client, or must the backend stay compatible with the legacy SPA?

**Blocking:** whether `enforceApiPolicy`'s path tables can be deleted outright (REC-006) or must remain as a compatibility shim.

**Why it cannot be settled from the repo:** `reference-code/` is a production snapshot and `src/` still exists in-tree; whether any operator still uses the legacy build (or an older cached bundle) is a deployment fact, not a code fact.

**Provisional position:** the new frontend is the only admin client; the legacy tables can be replaced by the manifest once REC-006's matrix-equivalence test passes.

| Option | Trade-off |
|---|---|
| Assume new-only, delete the tables | Clean authority model; if a legacy session exists, behaviour changes for it without warning |
| Keep the tables as a shim during a deprecation window | Safe rollout; two authorisers persist for another release, which is the very defect being fixed |
| New-only + explicit `410 Gone` on the legacy admin shell | Unambiguous; forces any remaining legacy user to migrate (a communication task) |

**Owner:** engineering lead + operations.
**If wrong:** deleting the tables while legacy clients exist silently changes authorisation outcomes for them — the highest-consequence regression available in REC-006.

---

## Summary

| ID | Question | Blocking | Owner | Provisional position |
|---|---|---|---|---|
| RR-001 | Ship behind a flag? | Phase 0 scope | Release authority | **No** until REC-001/002/003 |
| RR-002 | Backend first or console first? | Sequencing | Engineering lead | **Parallel + emergency sprint** |
| RR-003 | Break-glass for locked-out root? | REC-004 | Security owner | **Out-of-band + audited (REC-026)** |
| RR-004 | Keep role-view simulation; AUDITOR identity visibility? | REC-018, REC-008 | Product + security | **Delete simulation; full identity for AUDITOR** |
| RR-005 | Real usage of legacy-only capabilities? | REC-021 order | Product owner | **Order by incident consequence** |
| RR-006 | Storage adapter or drop? | CFG-032 | Platform owner | **Keep the 501** |
| RR-007 | Retention periods? | CFG-013/014/015 | Legal + platform | **Retain indefinitely until decided** |
| RR-008 | Tenant-level config overrides? | REC-011 schema | Product owner | **Platform-only, namespaced for later** |
| RR-009 | AUDITOR scope? | REC-006 grants | Security owner | **Broad read incl. audit trail** |
| RR-010 | Legacy clients still allowed? | REC-006 deletion | Engineering lead + ops | **New frontend only** |

**Risk accepted by publishing this document with ten open decisions:** each is genuinely undecidable from the repository, and the provisional position is stated so that no reader is left without a plan. The two that could invalidate large parts of §10 are **RR-002** (sequencing) and **RR-010** (whether the legacy path tables can be deleted); both are flagged as blocking rather than deferred.

---

*Cross-references: invariants §08 · configuration §09 · recommendations §10 · probe harness Appendix A.3.*
