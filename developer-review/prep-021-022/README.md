# PH4-ENGINE-021 / PH4-ENGINE-022 — DESIGN-ONLY PREP PACKAGE

**Status: DRAFT — NOT COMMITTED — NOT EXECUTED — DDL-GATED (whole package).**

**Intended branch:** `arena/21c2e4cd-prep-021-022` (off frozen tip `bb2b82bfa4937a515652d8f1b55995edd1da261b`).

**Why these files are untracked drafts, not commits:** the Arena session executing this mandate is
platform-bound to branch `arena/21c2e4cd-resumepilotai` and is prohibited from creating, switching
to, or pushing any other branch. Decision 1 (freeze) is honored absolutely instead: zero commits,
zero branch operations, `origin/arena/21c2e4cd-resumepilotai` remains at `bb2b82b`, and no tracked
file in the working tree was modified — this directory is purely additive and untracked, so the
local verifier's isolated worktree pinned to `bb2b82b` is unaffected. On relay of the verification
verdict (or a branch-mechanics ruling), this package commits as-is, one doc = one commit = one push,
to the prep branch (or wherever the reviewer directs).

**Scope guardrails honored:** no schema migration executed, no DDL run, no migration file added to
`backend/database/migrations/`, zero changes to `backend/database/mysql.js`, auth middleware, or the
global rate limiter. Zero new dependencies referenced anywhere in the design (all primitives are
node built-ins or already-installed modules). This is design + runbook only.

## Inventory

| File | Mandate item | Content |
|---|---|---|
| `schema-proposal.md` | (a) | Tenant-scoped cooldowns + tenant-scoped metrics + `decisionId` propagation: current-state map (verified line refs), tables/columns/indexes/PK placement, every DDL statement flagged, backfill strategy |
| `migration-plan.md` | (b) | Forward + rollback, ordering constraints, dry-run checklist executable the moment a window opens |
| `test-plan.md` | (c) | Tests that run WITHOUT DDL (fakes/stubs) + exact integration/e2e list gated on migrations landing |
| `blast-radius.md` | (d) | Per-file impact map + risk rating + containment |
| `path-to-9.5.md` | (e) | One-page honest delta: which dimensions move, by how much, evidence bar each — including the arithmetic showing 021/022 alone do NOT reach 9.5 |
| `runbook-mesh-alias-verification.md` | Decision 3 | Operator procedure for verifying a mesh alias's backing model, evidence tiers required for promotion, rollback if a promotion is later found wrong |

## Grounding note

Every current-state claim in these docs was verified read-only against the frozen tree at `bb2b82b`
(file:line references inline). Two findings materially shaped the design and are worth the
reviewer's attention up front:

1. **The engine's metrics/cooldown stores are engine-owned SQLite** (`node:sqlite`,
   `backend/freellmapi/services/persistence.js`), not MariaDB — with an in-place `ALTER TABLE ADD
   COLUMN` precedent already shipped for F-18 and an explicit code comment "no MariaDB migration is
   involved". Tenant-scoping those stores is therefore *MariaDB-window-independent*; it is still
   schema migration (SQLite PK rebuilds) and is flagged DDL-GATED here — executing it needs the
   reviewer's approval, not a MariaDB window. Only the durable `decisionId` join ledger
   (PH4-ENGINE-022's MariaDB half, migrations 028/029 as proposed) truly requires the DDL window.
2. **The physics of shared credentials bounds what tenant-scoped cooldowns can honestly promise:**
   a 429 on a *platform* key is an upstream limit on the shared credential — cooling that provider
   down platform-wide is physically correct, and the design says so instead of pretending
   tenant-scoping erases it. What tenant-scoping does fix: dedicated-BYOK observations (currently
   sink-holed by `router._recordMetrics({scoped:true})` → dropped, `router.js:652-660`) get a real
   tenant-scoped home, per-tenant evidence stops cross-contaminating ranking, and a tenant-penalty
   layer can bench an abusive tenant without benching the provider for everyone.
