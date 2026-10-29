# Capability Subfeature Register (Mandate 7)

**Revision:** `a7d08a2fa67b44aefe4692405b470fa6b174d29f` · **Generated:** 2026-10-29T07:20:48.474Z (generator clock, UTC) · **Generator:** `developer-review/tools/capability-subfeature-audit.cjs`
**Machine-checkable twin:** `Evidence/artifacts/capability-subfeatures.json`

## 1. Purpose and method

Every capability row is decomposed into (A) the *distinctive* subfeature classes its legacy source
exercised and (B) its user-visible action inventory — handler names and rendered labels. Distinctive
classes exclude structural idioms (loose `onClick` counts, `isLoading` booleans, `aria-*` density), because
those measure JSX-versus-hooks style rather than capability. A missing class or a legacy-only label is a
**lead that a reviewer must resolve in source**; it is never itself a finding and never changes a
classification.

| auditStatus | meaning | rows |
|---|---|---:|
| `EQUIVALENCE_LEAD` | a class is absent from the row but present elsewhere, or 1–5 legacy actions are unaccounted for | 41 |
| `ADJUDICATED` | leads read by hand in M7 and closed with a recorded disposition (see Evidence/adjudications-m7.json) | 40 |
| `SIGNAL_CLEAN` | every distinctive legacy class and action has a modern counterpart in the row | 21 |
| `DEEP_READ_M6` | read line-by-line in M6, with legacy→modern→backend→persistence tables | 10 |
| **total** | | **112** |

Across the 112 rows the tool extracted **487** distinctive subfeature rows and found
**50** rows still hold at least one unaccounted legacy action or label after
cross-row accounting; **8** further rows looked divergent until the action was
traced to another capability row, and **312** individual actions were
re-attributed that way.

**Attribution rule:** an action counts as a lead only if it appears in the legacy corpora of <= 2 rows. Without it the numbers were dominated by broad legacy
attribution (a row pointing at `src/components/admin` inherits every sibling capability's handlers), which
is the same false-positive mechanism recorded in `FEATURE-DEPTH-EVIDENCE-REGISTER.md` §6.

## 2. Absent-class histogram

_No distinctive class is absent from the whole modern tree._ Every class the legacy tree exercised has
at least one occurrence somewhere in `frontend/src`; the losses are therefore *per capability*, not
per class, and are recorded row by row in §3 and adjudicated in `M7-CAPABILITY-CLOSURE.md`.

## 3. Per-capability subfeature detail

### Domain A

#### `FP-A01` — Platform KPI dashboard (users, resumes, applications, AI generations, storage)

**Classification:** `PARTIAL PARITY` · **auditStatus:** `SIGNAL_CLEAN` · **backend:** yes · **files:** legacy 1 / modern 2 · **actions:** legacy 0 handlers / 10 labels → modern 1 / 6

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| pagination / cursor / load-more | 11 | 5 | 269 | `present` |

#### `FP-A02` — KPI fabricated fallback values shown when the stats endpoint returns nothing

**Classification:** `MOCK / FABRICATED STATE` · **auditStatus:** `SIGNAL_CLEAN` · **backend:** yes · **files:** legacy 0 / modern 1 · **actions:** legacy 0 handlers / 0 labels → modern 0 / 5

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| _no distinctive legacy subfeature class_ | 0 | 0 | 0 | `n/a` |

#### `FP-A03` — Subsystem health catalogue (28 services, latency, remediation hints)

**Classification:** `PARTIAL PARITY` · **auditStatus:** `EQUIVALENCE_LEAD` · **backend:** yes · **files:** legacy 3 / modern 1 · **actions:** legacy 2 handlers / 7 labels → modern 3 / 2

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| tabular data | 2 | 0 | 48 | `elsewhere-in-app` |
| search | 5 | 0 | 180 | `elsewhere-in-app` |
| filtering | 34 | 1 | 435 | `present` |
| pagination / cursor / load-more | 4 | 1 | 269 | `present` |
| dialog / drawer | 1 | 5 | 307 | `present` |
| client-side authorization gate | 2 | 1 | 81 | `present` |

_Integrity risk in modern files:_ `fakeSuccess` ×1

#### `FP-A04` — Health fallback claims (invented latency, "99.8%" delivery, "100% Enforced" isolation) displayed when no telemetry arrives

**Classification:** `MOCK / FABRICATED STATE` · **auditStatus:** `SIGNAL_CLEAN` · **backend:** yes · **files:** legacy 0 / modern 1 · **actions:** legacy 0 handlers / 0 labels → modern 3 / 2

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| _no distinctive legacy subfeature class_ | 0 | 0 | 0 | `n/a` |

_Integrity risk in modern files:_ `fakeSuccess` ×1

#### `FP-A05` — Security event stream / audit viewer

**Classification:** `MOCK / FABRICATED STATE` · **auditStatus:** `SIGNAL_CLEAN` · **backend:** yes · **files:** legacy 2 / modern 1 · **actions:** legacy 1 handlers / 29 labels → modern 7 / 18

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| tabular data | 4 | 4 | 48 | `present` |
| search | 13 | 2 | 180 | `present` |
| filtering | 9 | 2 | 435 | `present` |
| pagination / cursor / load-more | 9 | 3 | 269 | `present` |
| dialog / drawer | 6 | 7 | 307 | `present` |
| CSV export | 3 | 1 | 3 | `present` |

_Integrity risk in modern files:_ `fixtures` ×4

#### `FP-A06` — Operator roster + force-revoke sessions

**Classification:** `MOCK / FABRICATED STATE` · **auditStatus:** `EQUIVALENCE_LEAD` · **backend:** yes · **files:** legacy 1 / modern 1 · **actions:** legacy 3 handlers / 5 labels → modern 7 / 18

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| tabular data | 2 | 4 | 48 | `present` |
| filtering | 16 | 2 | 435 | `present` |
| pagination / cursor / load-more | 13 | 3 | 269 | `present` |
| dialog / drawer | 8 | 7 | 307 | `present` |
| client-side authorization gate | 6 | 0 | 81 | `elsewhere-in-app` |

_Integrity risk in modern files:_ `fixtures` ×4

#### `FP-A07` — IP blocklist / deny rules

**Classification:** `MOCK / FABRICATED STATE` · **auditStatus:** `SIGNAL_CLEAN` · **backend:** partial · **files:** legacy 1 / modern 1 · **actions:** legacy 0 handlers / 12 labels → modern 7 / 18

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| tabular data | 2 | 4 | 48 | `present` |
| filtering | 5 | 2 | 435 | `present` |
| pagination / cursor / load-more | 7 | 3 | 269 | `present` |
| dialog / drawer | 5 | 7 | 307 | `present` |

_Integrity risk in modern files:_ `fixtures` ×4

#### `FP-A08` — Platform announcements publisher

**Classification:** `MOCK / FABRICATED STATE` · **auditStatus:** `EQUIVALENCE_LEAD` · **backend:** yes · **files:** legacy 68 / modern 1 · **actions:** legacy 102 handlers / 353 labels → modern 7 / 18

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| tabular data | 38 | 4 | 48 | `present` |
| search | 64 | 2 | 180 | `present` |
| filtering | 156 | 2 | 435 | `present` |
| pagination / cursor / load-more | 207 | 3 | 269 | `present` |
| dialog / drawer | 61 | 7 | 307 | `present` |
| CSV export | 5 | 1 | 3 | `present` |
| JSON export | 16 | 0 | 14 | `elsewhere-in-app` |
| PDF / DOCX export | 5 | 0 | 18 | `elsewhere-in-app` |
| bulk selection | 7 | 0 | 7 | `elsewhere-in-app` |
| client-side authorization gate | 150 | 0 | 81 | `elsewhere-in-app` |

_Actions traced to another capability row (not losses):_ `onReply()`→FP-A19, `onStatus()`→FP-A19, "All dates"→FP-A01


_Integrity risk in modern files:_ `fixtures` ×4

#### `FP-A09` — Marketing content: phrases, reviews, trusted-by logos, landing pages

**Classification:** `MOCK / FABRICATED STATE` · **auditStatus:** `EQUIVALENCE_LEAD` · **backend:** yes · **files:** legacy 4 / modern 1 · **actions:** legacy 9 handlers / 11 labels → modern 5 / 8

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| filtering | 3 | 4 | 435 | `present` |
| pagination / cursor / load-more | 2 | 0 | 269 | `elsewhere-in-app` |

_Integrity risk in modern files:_ `fixtures` ×4

#### `FP-A10` — At-risk attention inbox / platform insights

**Classification:** `MOCK / FABRICATED STATE` · **auditStatus:** `EQUIVALENCE_LEAD` · **backend:** yes · **files:** legacy 1 / modern 1 · **actions:** legacy 0 handlers / 2 labels → modern 2 / 1

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| pagination / cursor / load-more | 1 | 0 | 269 | `elsewhere-in-app` |

_Integrity risk in modern files:_ `fixtures` ×1

#### `FP-A11` — Employer application + job posting moderation

**Classification:** `MOCK / FABRICATED STATE` · **auditStatus:** `DEEP_READ_M6` · **backend:** yes · **files:** legacy 2 / modern 1 · **actions:** legacy 0 handlers / 15 labels → modern 4 / 1

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| tabular data | 4 | 4 | 48 | `present` |
| search | 12 | 0 | 180 | `elsewhere-in-app` |
| filtering | 8 | 1 | 435 | `present` |
| pagination / cursor / load-more | 2 | 2 | 269 | `present` |

_Integrity risk in modern files:_ `fixtures` ×2, `fakeSuccess` ×3

#### `FP-A12` — Platform tenant registry (list tenants, quotas, suspend)

**Classification:** `MISSING` · **auditStatus:** `EQUIVALENCE_LEAD` · **backend:** yes · **files:** legacy 1 / modern 1 · **actions:** legacy 9 handlers / 20 labels → modern 4 / 1

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| tabular data | 2 | 4 | 48 | `present` |
| search | 8 | 0 | 180 | `elsewhere-in-app` |
| filtering | 12 | 1 | 435 | `present` |
| pagination / cursor / load-more | 26 | 2 | 269 | `present` |
| dialog / drawer | 5 | 7 | 307 | `present` |
| JSON export | 1 | 0 | 14 | `elsewhere-in-app` |
| client-side authorization gate | 8 | 0 | 81 | `elsewhere-in-app` |

_Integrity risk in modern files:_ `fixtures` ×2, `fakeSuccess` ×3

#### `FP-A13` — Company management (verification, documents, quotas)

**Classification:** `MOCK / FABRICATED STATE` · **auditStatus:** `EQUIVALENCE_LEAD` · **backend:** partial · **files:** legacy 1 / modern 1 · **actions:** legacy 0 handlers / 5 labels → modern 4 / 1

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| tabular data | 2 | 4 | 48 | `present` |
| search | 5 | 0 | 180 | `elsewhere-in-app` |
| filtering | 6 | 1 | 435 | `present` |

_Integrity risk in modern files:_ `fixtures` ×2, `fakeSuccess` ×3

#### `FP-A14` — Coupon / promo-code administration

**Classification:** `MISSING` · **auditStatus:** `EQUIVALENCE_LEAD` · **backend:** yes · **files:** legacy 35 / modern 0 · **actions:** legacy 30 handlers / 164 labels → modern 0 / 0

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| tabular data | 14 | 0 | 48 | `elsewhere-in-app` |
| search | 10 | 0 | 180 | `elsewhere-in-app` |
| filtering | 28 | 0 | 435 | `elsewhere-in-app` |
| pagination / cursor / load-more | 100 | 0 | 269 | `elsewhere-in-app` |
| dialog / drawer | 18 | 0 | 307 | `elsewhere-in-app` |
| CSV export | 1 | 0 | 3 | `elsewhere-in-app` |
| JSON export | 10 | 0 | 14 | `elsewhere-in-app` |
| PDF / DOCX export | 5 | 0 | 18 | `elsewhere-in-app` |
| client-side authorization gate | 87 | 0 | 81 | `elsewhere-in-app` |

#### `FP-A15` — Refunds, invoices, payment orders administration

**Classification:** `MISSING` · **auditStatus:** `EQUIVALENCE_LEAD` · **backend:** yes · **files:** legacy 35 / modern 0 · **actions:** legacy 30 handlers / 164 labels → modern 0 / 0

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| tabular data | 14 | 0 | 48 | `elsewhere-in-app` |
| search | 10 | 0 | 180 | `elsewhere-in-app` |
| filtering | 28 | 0 | 435 | `elsewhere-in-app` |
| pagination / cursor / load-more | 100 | 0 | 269 | `elsewhere-in-app` |
| dialog / drawer | 18 | 0 | 307 | `elsewhere-in-app` |
| CSV export | 1 | 0 | 3 | `elsewhere-in-app` |
| JSON export | 10 | 0 | 14 | `elsewhere-in-app` |
| PDF / DOCX export | 5 | 0 | 18 | `elsewhere-in-app` |
| client-side authorization gate | 87 | 0 | 81 | `elsewhere-in-app` |

#### `FP-A16` — SMTP/IMAP + transactional email template settings

**Classification:** `PARTIAL PARITY` · **auditStatus:** `DEEP_READ_M6` · **backend:** yes · **files:** legacy 35 / modern 2 · **actions:** legacy 30 handlers / 164 labels → modern 6 / 9

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| tabular data | 14 | 0 | 48 | `elsewhere-in-app` |
| search | 10 | 0 | 180 | `elsewhere-in-app` |
| filtering | 28 | 3 | 435 | `present` |
| pagination / cursor / load-more | 100 | 16 | 269 | `present` |
| dialog / drawer | 18 | 0 | 307 | `elsewhere-in-app` |
| CSV export | 1 | 0 | 3 | `elsewhere-in-app` |
| JSON export | 10 | 0 | 14 | `elsewhere-in-app` |
| PDF / DOCX export | 5 | 0 | 18 | `elsewhere-in-app` |
| client-side authorization gate | 87 | 0 | 81 | `elsewhere-in-app` |

#### `FP-A17` — User manager, User360 drawer, session revoke

**Classification:** `PARTIAL PARITY` · **auditStatus:** `EQUIVALENCE_LEAD` · **backend:** yes · **files:** legacy 4 / modern 1 · **actions:** legacy 27 handlers / 58 labels → modern 9 / 38

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| tabular data | 2 | 2 | 48 | `present` |
| search | 8 | 6 | 180 | `present` |
| filtering | 10 | 7 | 435 | `present` |
| pagination / cursor / load-more | 18 | 6 | 269 | `present` |
| dialog / drawer | 11 | 10 | 307 | `present` |
| CSV export | 1 | 0 | 3 | `elsewhere-in-app` |
| JSON export | 2 | 1 | 14 | `present` |
| bulk selection | 2 | 0 | 7 | `elsewhere-in-app` |
| client-side authorization gate | 13 | 0 | 81 | `elsewhere-in-app` |

_Integrity risk in modern files:_ `fixtures` ×1, `fakeSuccess` ×4

#### `FP-A18` — Bulk user operations (multi-select, bulk role change, bulk removal)

**Classification:** `MISSING` · **auditStatus:** `EQUIVALENCE_LEAD` · **backend:** partial · **files:** legacy 3 / modern 0 · **actions:** legacy 27 handlers / 47 labels → modern 0 / 0

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| tabular data | 2 | 0 | 48 | `elsewhere-in-app` |
| search | 8 | 0 | 180 | `elsewhere-in-app` |
| filtering | 10 | 0 | 435 | `elsewhere-in-app` |
| pagination / cursor / load-more | 13 | 0 | 269 | `elsewhere-in-app` |
| dialog / drawer | 11 | 0 | 307 | `elsewhere-in-app` |
| CSV export | 1 | 0 | 3 | `elsewhere-in-app` |
| JSON export | 2 | 0 | 14 | `elsewhere-in-app` |
| bulk selection | 2 | 0 | 7 | `elsewhere-in-app` |
| client-side authorization gate | 7 | 0 | 81 | `elsewhere-in-app` |

#### `FP-A19` — Support / help-desk tickets

**Classification:** `MOCK / FABRICATED STATE` · **auditStatus:** `DEEP_READ_M6` · **backend:** yes · **files:** legacy 68 / modern 1 · **actions:** legacy 102 handlers / 353 labels → modern 2 / 2

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| tabular data | 38 | 0 | 48 | `elsewhere-in-app` |
| search | 64 | 6 | 180 | `present` |
| filtering | 156 | 6 | 435 | `present` |
| pagination / cursor / load-more | 207 | 2 | 269 | `present` |
| dialog / drawer | 61 | 0 | 307 | `elsewhere-in-app` |
| CSV export | 5 | 0 | 3 | `elsewhere-in-app` |
| JSON export | 16 | 0 | 14 | `elsewhere-in-app` |
| PDF / DOCX export | 5 | 0 | 18 | `elsewhere-in-app` |
| bulk selection | 7 | 1 | 7 | `present` |
| client-side authorization gate | 150 | 0 | 81 | `elsewhere-in-app` |

_Actions traced to another capability row (not losses):_ "All dates"→FP-A01


_Integrity risk in modern files:_ `fixtures` ×1, `fakeSuccess` ×2

#### `FP-A20` — Job queues, DLQ, outbox, cache, backups (operations console)

**Classification:** `PARTIAL PARITY` · **auditStatus:** `DEEP_READ_M6` · **backend:** yes · **files:** legacy 5 / modern 2 · **actions:** legacy 12 handlers / 17 labels → modern 7 / 4

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| tabular data | 2 | 2 | 48 | `present` |
| filtering | 8 | 2 | 435 | `present` |
| pagination / cursor / load-more | 11 | 6 | 269 | `present` |
| dialog / drawer | 3 | 3 | 307 | `present` |
| JSON export | 2 | 0 | 14 | `elsewhere-in-app` |
| client-side authorization gate | 23 | 0 | 81 | `elsewhere-in-app` |

_Integrity risk in modern files:_ `fixtures` ×2, `fakeSuccess` ×5

#### `FP-A21` — Platform settings, feature flags, maintenance, encryption/backup status

**Classification:** `PARTIAL PARITY` · **auditStatus:** `EQUIVALENCE_LEAD` · **backend:** yes · **files:** legacy 35 / modern 1 · **actions:** legacy 30 handlers / 164 labels → modern 4 / 7

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| tabular data | 14 | 0 | 48 | `elsewhere-in-app` |
| search | 10 | 0 | 180 | `elsewhere-in-app` |
| filtering | 28 | 3 | 435 | `present` |
| pagination / cursor / load-more | 100 | 16 | 269 | `present` |
| dialog / drawer | 18 | 0 | 307 | `elsewhere-in-app` |
| CSV export | 1 | 0 | 3 | `elsewhere-in-app` |
| JSON export | 10 | 0 | 14 | `elsewhere-in-app` |
| PDF / DOCX export | 5 | 0 | 18 | `elsewhere-in-app` |
| client-side authorization gate | 87 | 0 | 81 | `elsewhere-in-app` |

#### `FP-A22` — Dedicated audit-log browser with filters and export

**Classification:** `MISSING` · **auditStatus:** `EQUIVALENCE_LEAD` · **backend:** yes · **files:** legacy 1 / modern 0 · **actions:** legacy 1 handlers / 21 labels → modern 0 / 0

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| tabular data | 2 | 0 | 48 | `elsewhere-in-app` |
| search | 13 | 0 | 180 | `elsewhere-in-app` |
| filtering | 4 | 0 | 435 | `elsewhere-in-app` |
| pagination / cursor / load-more | 2 | 0 | 269 | `elsewhere-in-app` |
| dialog / drawer | 1 | 0 | 307 | `elsewhere-in-app` |
| CSV export | 3 | 0 | 3 | `elsewhere-in-app` |

#### `FP-A23` — Admin command palette + entity search

**Classification:** `MISSING` · **auditStatus:** `EQUIVALENCE_LEAD` · **backend:** partial · **files:** legacy 2 / modern 0 · **actions:** legacy 2 handlers / 1 labels → modern 0 / 0

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| filtering | 2 | 0 | 435 | `elsewhere-in-app` |
| pagination / cursor / load-more | 1 | 0 | 269 | `elsewhere-in-app` |
| dialog / drawer | 1 | 0 | 307 | `elsewhere-in-app` |
| client-side authorization gate | 1 | 0 | 81 | `elsewhere-in-app` |

#### `FP-A24` — Public pricing, plan comparison and checkout

**Classification:** `PARTIAL PARITY` · **adjudication:** `NO_CHANGE` · **auditStatus:** `ADJUDICATED` · **backend:** yes · **files:** legacy 6 / modern 3 · **actions:** legacy 11 handlers / 9 labels → modern 5 / 15

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| tabular data | 4 | 2 | 48 | `present` |
| filtering | 2 | 0 | 435 | `elsewhere-in-app` |
| pagination / cursor / load-more | 68 | 20 | 269 | `present` |
| dialog / drawer | 2 | 9 | 307 | `present` |

_Adjudication (M7, hand-read):_ Order creation exists (axios POST /api/razorpay/create-order and /api/paypal/create-order at checkout-modal.tsx:346/348); the unaccounted handlers belong to the marketing pricing wizard's step navigation, which the modern public page implements inline.

_Verified by:_ frontend/src/pages/billing/checkout-modal.tsx:346-348

_Unaccounted legacy actions (leads):_ `handleCloseAuthModal()`, `handleModulesUpdate()`, `handleOpenAuthModal()`, `handlePublicNextStep()`, `handlePublicPreviousStep()`, `onErrorHandler()`


_Actions traced to another capability row (not losses):_ `createOrder()`→app, `onApprove()`→app, `onCancel()`→app


#### `FP-A25` — AI provider / gateway administration (provider CRUD, key pool, quotas, discovery, playground, unified gateway)

**Classification:** `PARTIAL PARITY` · **auditStatus:** `SIGNAL_CLEAN` · **backend:** yes · **files:** legacy 2 / modern 44 · **actions:** legacy 11 handlers / 26 labels → modern 21 / 34

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| tabular data | 2 | 4 | 48 | `present` |
| filtering | 1 | 24 | 435 | `present` |
| pagination / cursor / load-more | 2 | 23 | 269 | `present` |
| JSON export | 5 | 2 | 14 | `present` |
| client-side authorization gate | 25 | 24 | 81 | `present` |

_Actions traced to another capability row (not losses):_ `saveAdminAiSettings()`→app


#### `FP-A26` — Admin console shell and tab routing

**Classification:** `PARTIAL PARITY` · **auditStatus:** `EQUIVALENCE_LEAD` · **backend:** yes · **files:** legacy 2 / modern 1 · **actions:** legacy 9 handlers / 16 labels → modern 1 / 1

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| filtering | 8 | 1 | 435 | `present` |
| pagination / cursor / load-more | 13 | 1 | 269 | `present` |
| dialog / drawer | 1 | 0 | 307 | `elsewhere-in-app` |
| JSON export | 1 | 0 | 14 | `elsewhere-in-app` |
| client-side authorization gate | 13 | 4 | 81 | `present` |

### Domain B

#### `FP-B01` — Enterprise console shell + context switching

**Classification:** `PARTIAL PARITY` · **adjudication:** `NO_CHANGE` · **auditStatus:** `ADJUDICATED` · **backend:** yes · **files:** legacy 8 / modern 2 · **actions:** legacy 6 handlers / 24 labels → modern 3 / 3

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| filtering | 14 | 2 | 435 | `present` |
| pagination / cursor / load-more | 1 | 0 | 269 | `elsewhere-in-app` |
| dialog / drawer | 5 | 0 | 307 | `elsewhere-in-app` |
| JSON export | 1 | 0 | 14 | `elsewhere-in-app` |
| client-side authorization gate | 2 | 7 | 81 | `present` |

_Adjudication (M7, hand-read):_ The lead names are covered by `lib/session-security.ts`, which performs `reauthenticateWithCredential` (`:112`) for step-up, and by the session-expiry flow that routes to /login. No missing action.

_Verified by:_ frontend/src/lib/session-security.ts:19,112; frontend/src/components/layout/app-shell.tsx:89

_Unaccounted legacy actions (leads):_ `handleInteractiveReauth()`, `handleSignInAgain()`


_Actions traced to another capability row (not losses):_ "Sign In Again"→FP-A01, "Sign Out / Logout"→FP-A05


_Integrity risk in modern files:_ `clientStorage` ×8

#### `FP-B02` — Member directory, invitations, single-member removal, CSV export

**Classification:** `PARTIAL PARITY` · **adjudication:** `SUBFEATURE_LOSS` · **auditStatus:** `ADJUDICATED` · **backend:** yes · **files:** legacy 1 / modern 1 · **actions:** legacy 10 handlers / 12 labels → modern 10 / 16

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| tabular data | 2 | 2 | 48 | `present` |
| search | 5 | 6 | 180 | `present` |
| filtering | 8 | 2 | 435 | `present` |
| pagination / cursor / load-more | 1 | 1 | 269 | `present` |
| dialog / drawer | 3 | 11 | 307 | `present` |
| CSV export | 1 | 1 | 3 | `present` |
| bulk selection | 3 | 0 | 7 | `elsewhere-in-app` |
| client-side authorization gate | 2 | 2 | 81 | `present` |

_Adjudication (M7, hand-read):_ Directory, invitation and single-member removal exist. The two residual leads are real: there is no workspace-assignment action in the modern tab (`workspaces` is read from context at `EnterpriseUsersTab.tsx:61` and never assigned), and account status is edited through the member-edit dialog (`:126`) rather than the legacy per-row toggle, which is a UX difference, not a loss. Recorded loss: per-member workspace assignment.

_Verified by:_ frontend/src/components/enterprise/EnterpriseUsersTab.tsx:61,126

_Unaccounted legacy actions (leads):_ `handleToggleStatus()`, `handleWorkspaceAssign()`


_Actions traced to another capability row (not losses):_ `handleResendInvitation()`→app, "You cannot remove yourself"→FP-D03


#### `FP-B03` — Bulk member actions with per-member partial-failure reporting

**Classification:** `MISSING` · **adjudication:** `NO_CHANGE` · **auditStatus:** `ADJUDICATED` · **backend:** partial · **files:** legacy 1 / modern 0 · **actions:** legacy 10 handlers / 12 labels → modern 0 / 0

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| tabular data | 2 | 0 | 48 | `elsewhere-in-app` |
| search | 5 | 0 | 180 | `elsewhere-in-app` |
| filtering | 8 | 0 | 435 | `elsewhere-in-app` |
| pagination / cursor / load-more | 1 | 0 | 269 | `elsewhere-in-app` |
| dialog / drawer | 3 | 0 | 307 | `elsewhere-in-app` |
| CSV export | 1 | 0 | 3 | `elsewhere-in-app` |
| bulk selection | 3 | 0 | 7 | `elsewhere-in-app` |
| client-side authorization gate | 2 | 0 | 81 | `elsewhere-in-app` |

_Adjudication (M7, hand-read):_ MISSING stands. There is no bulk member action surface at all, so per-member partial-failure reporting has nothing to report through; the lead names are inherited from the legacy bulk-selection component.

_Verified by:_ grep for bulk/selectAll in frontend/src/components/enterprise/*.tsx (no bulk action handlers)

_Unaccounted legacy actions (leads):_ `handleToggleStatus()`, `handleWorkspaceAssign()`


_Actions traced to another capability row (not losses):_ `handleInvite()`→FP-B02, `handleResendInvitation()`→app, "All roles"→FP-A01, "Click to retry invitation dispatch"→FP-A03, "Close membership details"→FP-A25, "Current active workspace"→FP-A17 … (14 total)


#### `FP-B04` — Roles & permissions matrix

**Classification:** `PARTIAL PARITY` · **adjudication:** `NO_CHANGE` · **auditStatus:** `ADJUDICATED` · **backend:** yes · **files:** legacy 1 / modern 1 · **actions:** legacy 3 handlers / 7 labels → modern 4 / 2

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| tabular data | 2 | 2 | 48 | `present` |
| search | 7 | 6 | 180 | `present` |
| filtering | 12 | 2 | 435 | `present` |
| pagination / cursor / load-more | 4 | 3 | 269 | `present` |
| dialog / drawer | 2 | 5 | 307 | `present` |
| bulk selection | 1 | 1 | 7 | `present` |
| client-side authorization gate | 3 | 0 | 81 | `elsewhere-in-app` |

_Adjudication (M7, hand-read):_ Role deletion exists as `handleDeleteCustomRole` (`:280`); the lead is a rename, not a loss. Partial parity stands for the permission-matrix differences already recorded in M6.

_Verified by:_ frontend/src/components/enterprise/EnterpriseRolesTab.tsx:280

_Unaccounted legacy actions (leads):_ `handleDeleteRole()`


_Actions traced to another capability row (not losses):_ `handleSaveRole()`→app, `toggleCategory()`→app, "RECRUITER"→FP-A01


#### `FP-B05` — Teams + archive/restore

**Classification:** `PARTIAL PARITY` · **auditStatus:** `DEEP_READ_M6` · **backend:** yes · **files:** legacy 1 / modern 1 · **actions:** legacy 7 handlers / 8 labels → modern 3 / 2

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| tabular data | 2 | 0 | 48 | `elsewhere-in-app` |
| search | 7 | 0 | 180 | `elsewhere-in-app` |
| filtering | 5 | 0 | 435 | `elsewhere-in-app` |
| dialog / drawer | 5 | 3 | 307 | `present` |
| undo / restore | 2 | 0 | 19 | `elsewhere-in-app` |
| client-side authorization gate | 10 | 2 | 81 | `present` |

_Unaccounted legacy actions (leads):_ `handleSaveLead()`


_Actions traced to another capability row (not losses):_ `handleCreateTeam()`→app, `handleRestore()`→app


#### `FP-B06` — Workspaces + archive/restore

**Classification:** `FULL PARITY` · **auditStatus:** `EQUIVALENCE_LEAD` · **backend:** yes · **files:** legacy 1 / modern 1 · **actions:** legacy 6 handlers / 5 labels → modern 5 / 4

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| tabular data | 2 | 0 | 48 | `elsewhere-in-app` |
| filtering | 3 | 3 | 435 | `present` |
| dialog / drawer | 4 | 8 | 307 | `present` |
| undo / restore | 2 | 0 | 19 | `elsewhere-in-app` |
| client-side authorization gate | 13 | 3 | 81 | `present` |

_Actions traced to another capability row (not losses):_ `handleRestore()`→app


#### `FP-B07` — Tenant lifecycle (suspend / reactivate) from the enterprise platform tab

**Classification:** `FULL PARITY` · **adjudication:** `NO_CHANGE` · **auditStatus:** `ADJUDICATED` · **backend:** yes · **files:** legacy 1 / modern 1 · **actions:** legacy 2 handlers / 7 labels → modern 1 / 1

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| tabular data | 2 | 2 | 48 | `present` |
| search | 7 | 5 | 180 | `present` |
| filtering | 2 | 1 | 435 | `present` |
| dialog / drawer | 1 | 0 | 307 | `elsewhere-in-app` |

_Adjudication (M7, hand-read):_ Lead item 'Regulated' is a label string in the legacy tenant taxonomy, not an action. Suspend/reactivate call the live POST operations at `enterprise-api.ts:606/611`. FULL PARITY stands.

_Verified by:_ frontend/src/lib/enterprise-api.ts:603-615

_Unaccounted legacy actions (leads):_ "Regulated"


_Actions traced to another capability row (not losses):_ "Lowercase letters, digits, and hyphens"→app


#### `FP-B08` — Enterprise audit trail with CSV export

**Classification:** `PARTIAL PARITY` · **adjudication:** `NO_CHANGE` · **auditStatus:** `ADJUDICATED` · **backend:** yes · **files:** legacy 1 / modern 1 · **actions:** legacy 4 handlers / 30 labels → modern 1 / 2

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| tabular data | 2 | 2 | 48 | `present` |
| search | 6 | 6 | 180 | `present` |
| filtering | 18 | 3 | 435 | `present` |
| pagination / cursor / load-more | 18 | 1 | 269 | `present` |
| dialog / drawer | 4 | 3 | 307 | `present` |
| CSV export | 1 | 1 | 3 | `present` |

_Adjudication (M7, hand-read):_ `handleExportCsv` exists (`EnterpriseAuditTab.tsx:65,145`), so the export action is present. What the export contains is a separate, already-recorded defect: the tab renders a fabricated audit JSON (DISC-014/DISC-015), so the CSV serialises invented rows. No new loss; the lead is closed with a pointer, not a new finding.

_Verified by:_ frontend/src/components/enterprise/EnterpriseAuditTab.tsx:65,145

_Unaccounted legacy actions (leads):_ `handleCopyDeepLink()`, `handleExportJson()`


_Actions traced to another capability row (not losses):_ `downloadAnchor()`→app, "Dismiss investigation link"→FP-B11, "Execution outcome"→FP-A05


#### `FP-B09` — Enterprise resumes + PDF rendering

**Classification:** `PARTIAL PARITY` · **adjudication:** `SUBFEATURE_LOSS` · **auditStatus:** `ADJUDICATED` · **backend:** yes · **files:** legacy 2 / modern 2 · **actions:** legacy 10 handlers / 27 labels → modern 5 / 7

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| tabular data | 6 | 2 | 48 | `present` |
| search | 8 | 6 | 180 | `present` |
| filtering | 9 | 11 | 435 | `present` |
| pagination / cursor / load-more | 13 | 1 | 269 | `present` |
| dialog / drawer | 5 | 5 | 307 | `present` |
| CSV export | 1 | 0 | 3 | `elsewhere-in-app` |
| JSON export | 1 | 0 | 14 | `elsewhere-in-app` |
| PDF / DOCX export | 4 | 0 | 18 | `elsewhere-in-app` |
| print | 1 | 2 | 9 | `present` |
| bulk selection | 1 | 0 | 7 | `elsewhere-in-app` |
| client-side authorization gate | 3 | 2 | 81 | `present` |

_Adjudication (M7, hand-read):_ Enterprise resume review has no DOCX/PDF export of its own: `grep -n 'docx'` in EnterpriseResumesTab.tsx and EnterpriseResumePdfModal.tsx returns 0, and the legacy row's per-candidate export (handleDocx) has no counterpart. Selection (`toggleSelectCandidate`) is a naming difference — the tab uses checkbox state — but the export is a real loss. Corroborates FP-F11's recorded 'no resume download from the candidate drawer'.

_Verified by:_ frontend/src/components/enterprise/EnterpriseResumesTab.tsx; frontend/src/components/enterprise/EnterpriseResumePdfModal.tsx

_Unaccounted legacy actions (leads):_ `handleDocx()`, `toggleSelectCandidate()`


_Actions traced to another capability row (not losses):_ `handleDuplicate()`→app, "Edit in Smart Composer"→FP-E03, "New Version"→FP-A03


#### `FP-B10` — AI quota rings + enterprise AI controls

**Classification:** `PARTIAL PARITY` · **auditStatus:** `EQUIVALENCE_LEAD` · **backend:** yes · **files:** legacy 3 / modern 2 · **actions:** legacy 4 handlers / 3 labels → modern 4 / 1

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| filtering | 1 | 0 | 435 | `elsewhere-in-app` |
| pagination / cursor / load-more | 2 | 4 | 269 | `present` |
| chart / visualisation | 1 | 1 | 9 | `present` |

#### `FP-B11` — Usage, email, security, support, settings tabs

**Classification:** `PARTIAL PARITY` · **auditStatus:** `SIGNAL_CLEAN` · **backend:** yes · **files:** legacy 7 / modern 8 · **actions:** legacy 14 handlers / 17 labels → modern 14 / 7

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| tabular data | 10 | 8 | 48 | `present` |
| filtering | 26 | 5 | 435 | `present` |
| pagination / cursor / load-more | 6 | 9 | 269 | `present` |
| dialog / drawer | 9 | 11 | 307 | `present` |
| JSON export | 1 | 1 | 14 | `present` |
| chart / visualisation | 2 | 1 | 9 | `present` |
| client-side authorization gate | 19 | 18 | 81 | `present` |

_Actions traced to another capability row (not losses):_ `handleSuspend()`→app, `handleTemplateChange()`→app


_Integrity risk in modern files:_ `fakeSuccess` ×1, `clientStorage` ×4

### Domain C

#### `FP-C01` — Puck-based drag-and-drop portfolio page editor

**Classification:** `MISSING` · **adjudication:** `CONFIRMED_MISSING` · **auditStatus:** `ADJUDICATED` · **backend:** partial · **files:** legacy 2 / modern 0 · **actions:** legacy 15 handlers / 12 labels → modern 0 / 0

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| search | 3 | 0 | 180 | `elsewhere-in-app` |
| filtering | 3 | 0 | 435 | `elsewhere-in-app` |
| pagination / cursor / load-more | 4 | 0 | 269 | `elsewhere-in-app` |
| dialog / drawer | 10 | 0 | 307 | `elsewhere-in-app` |
| chart / visualisation | 28 | 0 | 9 | `elsewhere-in-app` |

_Adjudication (M7, hand-read):_ No Puck editor anywhere in the modern tree (0 hits for puck/Puck outside portfolio-document.ts comments). The modern portfolio builder composes from a canonical document model, not a block editor, so drag-and-drop free-form page composition is genuinely absent. Duplicate/load-template actions have no modern counterpart either.

_Verified by:_ grep -rl 'puck|Puck' frontend/src; frontend/src/pages/portfolio/builder.tsx:144-160

_Unaccounted legacy actions (leads):_ `handleDuplicatePortfolio()`, `handleLeaveBuilder()`, `handleLoadPortfolio()`, `handleLoadTemplate()`, `handleNewPortfolio()`, `handlePuckChange()`, `handleReloadPortfolioConflict()`, `handleRenamePortfolio()`, `handleSaveConflictAsCopy()`, `handleSaveDraft()`, `handleToggleVisibility()`, `handleWelcomeGuideDismiss()`


_Actions traced to another capability row (not losses):_ `openTemplates()`→app, "Back to Homepage"→FP-E17, "Choose a portfolio template"→FP-A24, "Close portfolio manager"→FP-A16, "Continue Editing"→FP-D03 … (11 total)


#### `FP-C02` — 71 modular portfolio page blocks (About1-6, Experience1-2, Education1-2, Contact1-4, Awards1-2, …)

**Classification:** `MISSING` · **auditStatus:** `EQUIVALENCE_LEAD` · **backend:** no · **files:** legacy 72 / modern 0 · **actions:** legacy 3 handlers / 23 labels → modern 0 / 0

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| filtering | 32 | 0 | 435 | `elsewhere-in-app` |
| pagination / cursor / load-more | 46 | 0 | 269 | `elsewhere-in-app` |
| chart / visualisation | 112 | 0 | 9 | `elsewhere-in-app` |

_Unaccounted legacy actions (leads):_ `handleEmailClick()`, `handleResumeDownload()`, "Twitter"


_Actions traced to another capability row (not losses):_ `toggleMobileMenu()`→app, "Contact Me"→FP-A11, "Download CV"→FP-A03, "Download.CV()"→FP-A03, "Get Started"→FP-A24 … (22 total)


#### `FP-C03` — WebCV Studio (layout ladder, template presets, template utils)

**Classification:** `MISSING` · **adjudication:** `CONFIRMED_MISSING` · **auditStatus:** `ADJUDICATED` · **backend:** partial · **files:** legacy 6 / modern 0 · **actions:** legacy 5 handlers / 8 labels → modern 0 / 0

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| search | 3 | 0 | 180 | `elsewhere-in-app` |
| filtering | 10 | 0 | 435 | `elsewhere-in-app` |
| pagination / cursor / load-more | 7 | 0 | 269 | `elsewhere-in-app` |
| dialog / drawer | 7 | 0 | 307 | `elsewhere-in-app` |
| chart / visualisation | 7 | 0 | 9 | `elsewhere-in-app` |

_Adjudication (M7, hand-read):_ WebCV Studio's layout ladder and template presets are not implemented; the modern builder starts from the canonical document and the shared 100-id template catalogue, which is a different mechanism (5 archetypes), not an equivalent studio.

_Verified by:_ frontend/src/pages/portfolio/builder.tsx:144-160, frontend/src/lib/template-catalog.ts

_Unaccounted legacy actions (leads):_ `handleStartBlank()`, `handleSwitchTemplate()`, `handleUseResume()`, "Open full &#8599;"


_Actions traced to another capability row (not losses):_ `saveTimer()`→app, "Configuration inspector (scrollable)"→FP-A03, "Live preview"→FP-A05, "Portfolio title"→FP-A16, "Preview viewport"→FP-D03


#### `FP-C04` — Editing portfolios created by the legacy editor

**Classification:** `MISSING` · **adjudication:** `SUBFEATURE_LOSS` · **auditStatus:** `ADJUDICATED` · **backend:** yes · **files:** legacy 1 / modern 2 · **actions:** legacy 15 handlers / 12 labels → modern 1 / 17

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| search | 3 | 0 | 180 | `elsewhere-in-app` |
| filtering | 3 | 15 | 435 | `present` |
| pagination / cursor / load-more | 4 | 5 | 269 | `present` |
| dialog / drawer | 10 | 5 | 307 | `present` |
| chart / visualisation | 28 | 0 | 9 | `elsewhere-in-app` |

_Adjudication (M7, hand-read):_ Create/load/save/conflict-reload are real and better than legacy (optimistic revision + reload-on-conflict). Two legacy actions have no counterpart: duplicate an existing portfolio, and switch template after creation (the modern template is chosen at creation only).

_Verified by:_ frontend/src/pages/portfolio/builder.tsx:144-160,405-420,509-517; legacy src/components/PortfolioBuilder/PortfolioBuilder.jsx:784,1059

_Unaccounted legacy actions (leads):_ `handleDuplicatePortfolio()`, `handleLeaveBuilder()`, `handleLoadPortfolio()`, `handleLoadTemplate()`, `handleNewPortfolio()`, `handlePuckChange()`, `handleReloadPortfolioConflict()`, `handleRenamePortfolio()`, `handleSaveConflictAsCopy()`, `handleSaveDraft()`, `handleToggleVisibility()`, `handleWelcomeGuideDismiss()`


_Actions traced to another capability row (not losses):_ `openTemplates()`→app, "Back to Homepage"→FP-E17, "Skip Tutorial"→FP-D03


#### `FP-C05` — Public portfolio rendering + slug availability + publish

**Classification:** `FULL PARITY` · **auditStatus:** `SIGNAL_CLEAN` · **backend:** yes · **files:** legacy 1 / modern 6 · **actions:** legacy 0 handlers / 1 labels → modern 1 / 31

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| filtering | 1 | 17 | 435 | `present` |

_Actions traced to another capability row (not losses):_ "Go Home"→FP-B01


#### `FP-C06` — Portfolio template gallery with palettes

**Classification:** `MISSING` · **adjudication:** `CONFIRMED_MISSING` · **auditStatus:** `ADJUDICATED` · **backend:** n/a · **files:** legacy 7 / modern 3 · **actions:** legacy 0 handlers / 22 labels → modern 0 / 13

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| filtering | 44 | 9 | 435 | `present` |
| pagination / cursor / load-more | 9 | 4 | 269 | `present` |
| dialog / drawer | 1 | 8 | 307 | `present` |

_Adjudication (M7, hand-read):_ The named modular blocks (Distinctions & Milestones, Leadership & Career Trajectory, Notes From Collaborators) do not exist in the modern portfolio components (0 hits), which is the same finding as FP-C02: the 71-block library was replaced by a canonical document model with a fixed set of sections. Two rows, one cause; recorded separately because they are separate capability rows.

_Verified by:_ grep in frontend/src/components/portfolio + frontend/src/pages/portfolio → 0 hits

_Unaccounted legacy actions (leads):_ "Distinctions & Milestones", "Leadership & Career Trajectory", "Notes From Collaborators"


_Actions traced to another capability row (not losses):_ "Academic Credentials & Governance"→FP-D03, "Board & Professional Credentials"→FP-A24, "Endorsements"→FP-D03, "Recommendations & Endorsements"→FP-D03


#### `FP-C07` — Portfolio gallery / showcase

**Classification:** `FULL PARITY` · **auditStatus:** `EQUIVALENCE_LEAD` · **backend:** yes · **files:** legacy 1 / modern 2 · **actions:** legacy 0 handlers / 6 labels → modern 2 / 4

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| search | 9 | 1 | 180 | `present` |
| filtering | 4 | 6 | 435 | `present` |
| chart / visualisation | 1 | 0 | 9 | `elsewhere-in-app` |

### Domain D

#### `FP-D01` — Live voice interview (TTS question delivery + pacing)

**Classification:** `MISSING` · **adjudication:** `SUBFEATURE_LOSS` · **auditStatus:** `ADJUDICATED` · **backend:** yes · **files:** legacy 2 / modern 1 · **actions:** legacy 6 handlers / 22 labels → modern 1 / 6

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| filtering | 9 | 0 | 435 | `elsewhere-in-app` |
| pagination / cursor / load-more | 36 | 1 | 269 | `present` |
| dialog / drawer | 4 | 4 | 307 | `present` |
| print | 1 | 0 | 9 | `elsewhere-in-app` |
| chart / visualisation | 1 | 0 | 9 | `elsewhere-in-app` |

_Adjudication (M7, hand-read):_ Snippet insertion and a 'new interview' action from the live panel have no counterpart (`grep -n 'snippet|newInterview'` in live-interview-panel.tsx and interview-coach.tsx → 0). The voice interview itself is present; the loss is limited to snippet reuse and restart, which corroborates the FP-D03 losses (export/print/download).

_Verified by:_ frontend/src/components/interview/live-interview-panel.tsx; frontend/src/pages/dashboard/interview-coach.tsx

_Unaccounted legacy actions (leads):_ `handleInsertSnippet()`, `handleNewInterview()`


_Actions traced to another capability row (not losses):_ `handleRetake()`→app, "Open your resume facts and career metrics"→FP-D03, "Print / Save PDF"→FP-B09, "Test & Enable"→FP-A03


#### `FP-D02` — Microphone capture + live audio waveform

**Classification:** `MISSING` · **auditStatus:** `EQUIVALENCE_LEAD` · **backend:** n/a · **files:** legacy 2 / modern 0 · **actions:** legacy 2 handlers / 0 labels → modern 0 / 0

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| chart / visualisation | 1 | 0 | 9 | `elsewhere-in-app` |

_Actions traced to another capability row (not losses):_ `toggleAudio()`→app, `toggleVideo()`→app


#### `FP-D03` — Interview session UI (question flow, transcript, scoring)

**Classification:** `PARTIAL PARITY` · **adjudication:** `SUBFEATURE_LOSS` · **auditStatus:** `ADJUDICATED` · **backend:** yes · **files:** legacy 6 / modern 16 · **actions:** legacy 20 handlers / 52 labels → modern 67 / 253

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| search | 8 | 56 | 180 | `present` |
| filtering | 30 | 139 | 435 | `present` |
| pagination / cursor / load-more | 104 | 48 | 269 | `present` |
| dialog / drawer | 18 | 65 | 307 | `present` |
| print | 2 | 4 | 9 | `present` |
| chart / visualisation | 2 | 2 | 9 | `present` |

_Adjudication (M7, hand-read):_ Question flow, live session and scoring exist. Lost: print/export of a finished interview, snippet insertion, and session download — the modern page has no download/export path at all (grep for download/export in interview-coach.tsx returns only option text).

_Verified by:_ frontend/src/pages/dashboard/interview-coach.tsx (no print/download/export); legacy src/components/Interview/*: handlePrint, exportInterview, downloadSlug

_Unaccounted legacy actions (leads):_ `deleteAllHistory()`, `downloadSlug()`, `handleDownloadStar()`, `handleInsertSnippet()`, `onHistoryStorage()`


_Actions traced to another capability row (not losses):_ `createTabId()`→app, `handleRegenerate()`→app, `handleRetake()`→app, `handleSelectRole()`→app, `onSessionStorage()`→app, "Got it"→FP-A16, "Markdown (.md)"→FP-A01


_Integrity risk in modern files:_ `fakeSuccess` ×1, `clientStorage` ×6

#### `FP-D04` — Candidate command palette (⌘K) with fuzzy entity search

**Classification:** `MISSING` · **adjudication:** `CONFIRMED_MISSING` · **auditStatus:** `ADJUDICATED` · **backend:** partial · **files:** legacy 5 / modern 0 · **actions:** legacy 4 handlers / 5 labels → modern 0 / 0

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| filtering | 9 | 0 | 435 | `elsewhere-in-app` |
| pagination / cursor / load-more | 6 | 0 | 269 | `elsewhere-in-app` |
| dialog / drawer | 2 | 0 | 307 | `elsewhere-in-app` |
| client-side authorization gate | 3 | 0 | 81 | `elsewhere-in-app` |

_Adjudication (M7, hand-read):_ No command palette: 0 hits for CommandPalette/cmdk in frontend/src and no Cmd/Ctrl+K binding anywhere (only Ctrl+S in two builders). This corroborates the M6 downgrade of FP-G01.

_Verified by:_ grep -rln 'CommandPalette|cmdk' frontend/src; grep for metaKey in layout + dashboard

_Unaccounted legacy actions (leads):_ `onInputKeyDown()`, `runCopilotAction()`, `submitCopilotPrompt()`, "Commands"


_Actions traced to another capability row (not losses):_ "AI career actions"→FP-A17, "Command surface mode"→FP-A01


#### `FP-D05` — Copilot assistant (mascot, prompt builder, action registry)

**Classification:** `PARTIAL PARITY` · **auditStatus:** `EQUIVALENCE_LEAD` · **backend:** yes · **files:** legacy 3 / modern 1 · **actions:** legacy 0 handlers / 0 labels → modern 3 / 1

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| filtering | 6 | 5 | 435 | `present` |
| chart / visualisation | 1 | 0 | 9 | `elsewhere-in-app` |

#### `FP-D06` — Candidate HUD overlay

**Classification:** `MISSING` · **auditStatus:** `EQUIVALENCE_LEAD` · **backend:** n/a · **files:** legacy 1 / modern 0 · **actions:** legacy 0 handlers / 0 labels → modern 0 / 0

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| filtering | 1 | 0 | 435 | `elsewhere-in-app` |

#### `FP-D07` — Notification centre (bell, unread poller, routing)

**Classification:** `REPLACED BY EQUIVALENT` · **auditStatus:** `EQUIVALENCE_LEAD` · **backend:** yes · **files:** legacy 4 / modern 4 · **actions:** legacy 4 handlers / 4 labels → modern 3 / 22

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| filtering | 16 | 22 | 435 | `present` |
| dialog / drawer | 2 | 1 | 307 | `present` |
| JSON export | 2 | 1 | 14 | `present` |

_Unaccounted legacy actions (leads):_ `runOnce()`


_Integrity risk in modern files:_ `clientStorage` ×4

#### `FP-D08` — User-selectable UI density

**Classification:** `MISSING` · **auditStatus:** `SIGNAL_CLEAN` · **backend:** n/a · **files:** legacy 1 / modern 0 · **actions:** legacy 0 handlers / 0 labels → modern 0 / 0

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| _no distinctive legacy subfeature class_ | 0 | 0 | 0 | `n/a` |

#### `FP-D09` — Candidate dashboard home, next-steps onboarding, applied-jobs tracker

**Classification:** `PARTIAL PARITY` · **adjudication:** `NO_CHANGE` · **auditStatus:** `ADJUDICATED` · **backend:** yes · **files:** legacy 16 / modern 7 · **actions:** legacy 22 handlers / 32 labels → modern 10 / 43

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| search | 19 | 4 | 180 | `present` |
| filtering | 37 | 9 | 435 | `present` |
| sorting | 22 | 0 | 17 | `elsewhere-in-app` |
| pagination / cursor / load-more | 54 | 6 | 269 | `present` |
| dialog / drawer | 17 | 9 | 307 | `present` |
| JSON export | 1 | 1 | 14 | `present` |
| PDF / DOCX export | 22 | 0 | 18 | `elsewhere-in-app` |
| drag & drop | 4 | 0 | 13 | `elsewhere-in-app` |
| chart / visualisation | 2 | 1 | 9 | `present` |

_Adjudication (M7, hand-read):_ Dashboard home, onboarding and applied-job surfaces exist; most unaccounted handlers belong to sibling rows (interview, resume builder, settings). Genuinely lost: resend-verification and interview export/download, both recorded against FP-D03 and the auth row rather than here.

_Verified by:_ frontend/src/pages/dashboard/overview.tsx, applied-jobs.tsx, interview-coach.tsx

_Unaccounted legacy actions (leads):_ `handleCopyClick()`, `handleResendVerification()`, `handleSocialClick()`, `handleTrackInKanban()`, `onStageKeyDown()`, `openInterviewScheduler()`, `openJobUrl()`


_Actions traced to another capability row (not losses):_ `exportInterview()`→FP-G20, `openCoverLetter()`→app, `openEditor()`→app, `runDownload()`→app, `saveInterview()`→FP-G20, "Homepage"→FP-E17, "Not scheduled"→FP-A05, "Pipeline analytics"→FP-A16, "Upgrade to Premium"→FP-A24


_Integrity risk in modern files:_ `clientStorage` ×1

#### `FP-D10` — Guided "next steps" onboarding checklist

**Classification:** `MISSING` · **auditStatus:** `EQUIVALENCE_LEAD` · **backend:** n/a · **files:** legacy 1 / modern 0 · **actions:** legacy 0 handlers / 1 labels → modern 0 / 0

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| filtering | 2 | 0 | 435 | `elsewhere-in-app` |
| pagination / cursor / load-more | 1 | 0 | 269 | `elsewhere-in-app` |

#### `FP-D12` — Dashboard-v2 element library (stats, activity, profile display, resumes/covers lists)

**Classification:** `PARTIAL PARITY` · **auditStatus:** `EQUIVALENCE_LEAD` · **backend:** yes · **files:** legacy 28 / modern 18 · **actions:** legacy 10 handlers / 23 labels → modern 68 / 266

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| search | 11 | 57 | 180 | `present` |
| filtering | 32 | 142 | 435 | `present` |
| pagination / cursor / load-more | 23 | 74 | 269 | `present` |
| dialog / drawer | 6 | 62 | 307 | `present` |
| PDF / DOCX export | 3 | 6 | 18 | `present` |
| chart / visualisation | 4 | 3 | 9 | `present` |
| client-side authorization gate | 12 | 10 | 81 | `present` |

_Unaccounted legacy actions (leads):_ `handleMobileToggle()`, `handleNotificationsUpdated()`, `handleProfileUpdate()`


_Actions traced to another capability row (not losses):_ `handleResize()`→app, `toggleNavGroup()`→app, "Privacy"→FP-A16


_Integrity risk in modern files:_ `fakeSuccess` ×1, `clientStorage` ×10

#### `FP-D13` — Candidate shell, AI career briefing, top job matches, executive rail, progress charts

**Classification:** `PARTIAL PARITY` · **auditStatus:** `EQUIVALENCE_LEAD` · **backend:** yes · **files:** legacy 16 / modern 2 · **actions:** legacy 4 handlers / 21 labels → modern 1 / 30

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| filtering | 17 | 5 | 435 | `present` |
| pagination / cursor / load-more | 6 | 4 | 269 | `present` |
| dialog / drawer | 1 | 0 | 307 | `elsewhere-in-app` |
| chart / visualisation | 2 | 1 | 9 | `present` |

_Unaccounted legacy actions (leads):_ `handleGuidanceSubmit()`, "Subscription renewal needs attention"


_Actions traced to another capability row (not losses):_ `submitPrompt()`→app, `toggleSaved()`→app


#### `FP-D14` — Payment grace-period / dunning banner

**Classification:** `MISSING` · **adjudication:** `NO_CHANGE` · **auditStatus:** `ADJUDICATED` · **backend:** partial · **files:** legacy 2 / modern 0 · **actions:** legacy 0 handlers / 2 labels → modern 0 / 0

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| filtering | 1 | 0 | 435 | `elsewhere-in-app` |
| pagination / cursor / load-more | 1 | 0 | 269 | `elsewhere-in-app` |

_Adjudication (M7, hand-read):_ MISSING stands and is positively confirmed: no dunning, grace-period or renewal banner exists; the only `renew` references are enterprise session renewal in `EnterpriseSecurityTab.tsx`.

_Verified by:_ grep -rln 'renew|Renew' frontend/src → only EnterpriseSecurityTab.tsx

_Unaccounted legacy actions (leads):_ "Subscription renewal needs attention"


_Actions traced to another capability row (not losses):_ "Update payment method"→FP-B02


#### `FP-D15` — Saved jobs / favourites

**Classification:** `FULL PARITY` · **auditStatus:** `SIGNAL_CLEAN` · **backend:** yes · **files:** legacy 1 / modern 4 · **actions:** legacy 3 handlers / 2 labels → modern 2 / 7

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| filtering | 10 | 19 | 435 | `present` |

#### `FP-D11` — Candidate⇄employer messaging

**Classification:** `PARTIAL PARITY` · **auditStatus:** `EQUIVALENCE_LEAD` · **backend:** yes · **files:** legacy 3 / modern 6 · **actions:** legacy 1 handlers / 0 labels → modern 5 / 9

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| filtering | 4 | 7 | 435 | `present` |
| pagination / cursor / load-more | 9 | 13 | 269 | `present` |
| chart / visualisation | 3 | 0 | 9 | `elsewhere-in-app` |

### Domain E

#### `FP-E01` — Guided multi-step resume builder (Form/Boards/Actions steps)

**Classification:** `PARTIAL PARITY` · **adjudication:** `SUBFEATURE_LOSS` · **auditStatus:** `ADJUDICATED` · **backend:** yes · **files:** legacy 61 / modern 8 · **actions:** legacy 121 handlers / 162 labels → modern 46 / 126

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| search | 79 | 17 | 180 | `present` |
| filtering | 199 | 74 | 435 | `present` |
| sorting | 14 | 0 | 17 | `elsewhere-in-app` |
| pagination / cursor / load-more | 211 | 39 | 269 | `present` |
| dialog / drawer | 71 | 38 | 307 | `present` |
| PDF / DOCX export | 15 | 3 | 18 | `present` |
| file upload | 3 | 2 | 2 | `present` |
| drag & drop | 7 | 2 | 13 | `present` |
| chart / visualisation | 71 | 3 | 9 | `present` |
| bulk selection | 13 | 5 | 7 | `present` |
| undo / restore | 9 | 0 | 19 | `elsewhere-in-app` |

_Adjudication (M7, hand-read):_ The builder is real and richer in places than legacy (autosave with snapshot, live ATS scoring, bullet impact analyzer at :2336-2370, import/parse). Lost: per-edit/AI undo history, add-custom-section, passive-opener fixer and quick-metric injection (all legacy BulletPointsEditor features), and an explicit 'complete resume' gate.

_Verified by:_ frontend/src/pages/dashboard/resume-builder.tsx:2336-2370,647-660,2600-2620; legacy src/components/Form/BulletPointsEditor.jsx:389-482

_Unaccounted legacy actions (leads):_ `exportTypeToResume()`, `handleBreadcrumbNavigate()`, `handleCompleteResume()`, `handleDocxDownload()`, `handleEnhanceAll()`, `handleExitBuilder()`, `handleFixPassiveOpener()`, `handleInjectQuickMetric()`, `handleMonthChange()`, `handleNativeMonthChange()`, `handlePublishForReview()`, `handleResumeClick()`, `handleStepClick()`, `handleTemplateSelect()`, `handleUndo()`, `handleYearChange()`, `openFindingsCount()`, `saveConflictRef()`, "Ex: 01/04/1964", "Next &raquo;", "Spoken Interaction", "Undo AI enhancement or edit"


_Actions traced to another capability row (not losses):_ `handleEscapeKey()`→app, `openFindings()`→app, `saveInFlightRef()`→app, `saveTimerRef()`→app, `toggleFavorite()`→app, "Gender"→FP-E04, "Listening"→FP-D03


_Integrity risk in modern files:_ `fakeSuccess` ×1

#### `FP-E02` — Template catalogue volume (51 legacy cv dirs)

**Classification:** `PARTIAL PARITY` · **auditStatus:** `DEEP_READ_M6` · **backend:** n/a · **files:** legacy 73 / modern 2 · **actions:** legacy 0 handlers / 0 labels → modern 0 / 0

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| filtering | 35 | 9 | 435 | `present` |
| pagination / cursor / load-more | 2 | 0 | 269 | `elsewhere-in-app` |
| chart / visualisation | 4 | 0 | 9 | `elsewhere-in-app` |

#### `FP-E03` — Structurally distinct template layouts (design diversity)

**Classification:** `PARTIAL PARITY` · **auditStatus:** `EQUIVALENCE_LEAD` · **backend:** n/a · **files:** legacy 73 / modern 2 · **actions:** legacy 0 handlers / 0 labels → modern 0 / 1

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| filtering | 35 | 17 | 435 | `present` |
| pagination / cursor / load-more | 2 | 0 | 269 | `elsewhere-in-app` |
| chart / visualisation | 4 | 0 | 9 | `elsewhere-in-app` |

#### `FP-E04` — ATS score with per-section breakdown and job-description targeting

**Classification:** `FULL PARITY` · **auditStatus:** `EQUIVALENCE_LEAD` · **backend:** partial · **files:** legacy 1 / modern 3 · **actions:** legacy 0 handlers / 0 labels → modern 0 / 5

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| filtering | 1 | 39 | 435 | `present` |
| pagination / cursor / load-more | 3 | 0 | 269 | `elsewhere-in-app` |
| chart / visualisation | 1 | 0 | 9 | `elsewhere-in-app` |

_Integrity risk in modern files:_ `clientStorage` ×5

#### `FP-E05` — Server-side ATS audit (authoritative score from backend)

**Classification:** `UNVERIFIED` · **auditStatus:** `EQUIVALENCE_LEAD` · **backend:** no · **files:** legacy 1 / modern 1 · **actions:** legacy 0 handlers / 0 labels → modern 0 / 5

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| filtering | 1 | 1 | 435 | `present` |
| pagination / cursor / load-more | 3 | 0 | 269 | `elsewhere-in-app` |
| chart / visualisation | 1 | 0 | 9 | `elsewhere-in-app` |

#### `FP-E06` — Profile photo crop / zoom

**Classification:** `PARTIAL PARITY` · **adjudication:** `PARTIAL_EQUIVALENT` · **auditStatus:** `ADJUDICATED` · **backend:** yes · **files:** legacy 20 / modern 1 · **actions:** legacy 84 handlers / 85 labels → modern 33 / 112

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| search | 27 | 7 | 180 | `present` |
| filtering | 115 | 45 | 435 | `present` |
| pagination / cursor / load-more | 113 | 24 | 269 | `present` |
| dialog / drawer | 23 | 18 | 307 | `present` |
| file upload | 1 | 1 | 2 | `present` |
| drag & drop | 2 | 0 | 13 | `elsewhere-in-app` |
| chart / visualisation | 9 | 1 | 9 | `present` |
| bulk selection | 3 | 0 | 7 | `elsewhere-in-app` |
| undo / restore | 2 | 0 | 19 | `elsewhere-in-app` |

_Adjudication (M7, hand-read):_ Crop/zoom is absent (no crop UI, no canvas transform anywhere). Photo upload itself exists in the resume builder (base64 data URL, 5 MB guard) so the row's parent capability is not wholly missing — but the named capability (crop/zoom) is.

_Verified by:_ frontend/src/pages/dashboard/resume-builder.tsx:2600-2620

_Unaccounted legacy actions (leads):_ `handleCrop()`, `handleSize()`, `onMouseMove()`, `onMouseUp()`, `onTouchEnd()`, `onTouchMove()`, `onTouchStart()`, "Apply Crop"


_Actions traced to another capability row (not losses):_ `handleReset()`→app, `onMouseDown()`→app


_Integrity risk in modern files:_ `fakeSuccess` ×1

#### `FP-E07` — QR code generation for shares / MFA enrolment

**Classification:** `MISSING` · **adjudication:** `CONFIRMED_MISSING` · **auditStatus:** `ADJUDICATED` · **backend:** partial · **files:** legacy 5 / modern 0 · **actions:** legacy 52 handlers / 119 labels → modern 0 / 0

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| tabular data | 2 | 0 | 48 | `elsewhere-in-app` |
| filtering | 80 | 0 | 435 | `elsewhere-in-app` |
| pagination / cursor / load-more | 145 | 0 | 269 | `elsewhere-in-app` |
| dialog / drawer | 16 | 0 | 307 | `elsewhere-in-app` |
| JSON export | 2 | 0 | 14 | `elsewhere-in-app` |
| PDF / DOCX export | 1 | 0 | 18 | `elsewhere-in-app` |
| file upload | 2 | 0 | 2 | `elsewhere-in-app` |
| drag & drop | 2 | 0 | 13 | `elsewhere-in-app` |
| chart / visualisation | 7 | 0 | 9 | `elsewhere-in-app` |
| bulk selection | 1 | 0 | 7 | `elsewhere-in-app` |
| undo / restore | 1 | 0 | 19 | `elsewhere-in-app` |

_Adjudication (M7, hand-read):_ No QR generation anywhere (0 hits for qrcode/QRCode). MFA enrolment exists as a server-backed factor list in settings, but the QR enrolment artefact the legacy feature produced does not.

_Verified by:_ grep -rln 'qrcode|QRCode' frontend/src; frontend/src/components/settings/security-panel.tsx:189-196

_Unaccounted legacy actions (leads):_ `handleAccountSubmit()`, `handleCopyBio()`, `handleCrop()`, `handleDeleteAccountConfirmed()`, `handleDisableTotpConfirmed()`, `handleEnhanceWorkDescriptionWithAi()`, `handleFocusGap()`, `handleGlobalEscape()`, `handleImageUpload()`, `handlePreferencesSave()`, `handleSaveAndNext()`, `handleSendVerificationEmail()`, `handleSize()`, `handleStartTotpSetup()`, `handleStepperKeyDown()`, `handleVerifyAndEnableTotp()`, `handleWriteAiSummary()`, `onMouseMove()`, `onMouseUp()`, `onTouchEnd()`, `onTouchMove()`, `onTouchStart()`, `runProfileAi()`, "Apply Crop"


_Actions traced to another capability row (not losses):_ `handleApplyCoupon()`→FP-A24, `handleRemoveCoupon()`→FP-A24, `handleReset()`→app, `onMouseDown()`→app, `removeCustomSection()`→app, `removeCustomSectionItem()`→app, "Add Another Achievement"→FP-C04, "Add Another Custom Section"→FP-A25, "Add Another Reference"→FP-C04, "Add Award / Achievement"→FP-C04 … (46 total)


#### `FP-E08` — Public share links / share modal

**Classification:** `FULL PARITY` · **adjudication:** `NO_CHANGE` · **auditStatus:** `ADJUDICATED` · **backend:** yes · **files:** legacy 36 / modern 2 · **actions:** legacy 106 handlers / 127 labels → modern 3 / 1

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| search | 36 | 0 | 180 | `elsewhere-in-app` |
| filtering | 163 | 0 | 435 | `elsewhere-in-app` |
| sorting | 4 | 0 | 17 | `elsewhere-in-app` |
| pagination / cursor / load-more | 165 | 2 | 269 | `present` |
| dialog / drawer | 63 | 9 | 307 | `present` |
| PDF / DOCX export | 13 | 0 | 18 | `elsewhere-in-app` |
| file upload | 2 | 0 | 2 | `elsewhere-in-app` |
| drag & drop | 4 | 0 | 13 | `elsewhere-in-app` |
| chart / visualisation | 65 | 1 | 9 | `present` |
| bulk selection | 3 | 0 | 7 | `elsewhere-in-app` |
| undo / restore | 2 | 0 | 19 | `elsewhere-in-app` |

_Adjudication (M7, hand-read):_ Every unaccounted action in this row is a resume-builder action inherited through the legacy scope `src/components/BuildResume` (the whole builder directory), including the share/publish flow itself: legacy handlePublishForReview is the publication toggle that the modern app implements in lib/share-publication.ts (:41/:52/:73) plus share-modal.tsx. The builder actions are adjudicated on FP-E01. The row's own capability — clipboard share link, publish, unpublish, public viewer — is present, honest about failure and server-backed, which is why FULL PARITY stands.

_Verified by:_ frontend/src/lib/share-publication.ts:41,52,73; frontend/src/components/ui/share-modal.tsx; legacy src/components/BuildResume/BuildResume.jsx:1060

_Unaccounted legacy actions (leads):_ `exportTypeToResume()`, `handleAddCustomSection()`, `handleBreadcrumbNavigate()`, `handleCompleteResume()`, `handleDocxDownload()`, `handleExitBuilder()`, `handleManualSave()`, `handlePublishForReview()`, `handleStepClick()`, `handleTemplateSelect()`, `openCustomSectionDialog()`, `openFindingsCount()`, `saveConflictRef()`, "ATS Career Readiness Companion"


_Actions traced to another capability row (not losses):_ `handleEscapeKey()`→app, `openFindings()`→app, `saveInFlightRef()`→app, `saveTimerRef()`→app, `toggleFavorite()`→app, "Add Custom Section"→FP-A01, "Add section"→FP-A01, "Builder actions"→FP-A09, "Close ATS Drawer"→FP-A17 … (21 total)


#### `FP-E09` — Cover letters

**Classification:** `FULL PARITY` · **adjudication:** `NO_CHANGE` · **auditStatus:** `ADJUDICATED` · **backend:** yes · **files:** legacy 74 / modern 2 · **actions:** legacy 0 handlers / 35 labels → modern 8 / 21

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| filtering | 40 | 12 | 435 | `present` |
| pagination / cursor / load-more | 2 | 1 | 269 | `present` |
| dialog / drawer | 16 | 7 | 307 | `present` |
| print | 3 | 3 | 9 | `present` |
| chart / visualisation | 4 | 0 | 9 | `elsewhere-in-app` |

_Adjudication (M7, hand-read):_ Lead item 'Telegram' is a template/label string, not an action. Cover-letter create/edit/export are present and reachable. FULL PARITY stands.

_Verified by:_ frontend/src/pages/dashboard/cover-letter-builder.tsx

_Unaccounted legacy actions (leads):_ "Telegram"


_Actions traced to another capability row (not losses):_ "LinkedIn"→FP-A11, "WhatsApp"→FP-E08


#### `FP-E16` — Export access guard (plan-gated export routes)

**Classification:** `PARTIAL PARITY` · **auditStatus:** `SIGNAL_CLEAN` · **backend:** yes · **files:** legacy 3 / modern 2 · **actions:** legacy 0 handlers / 0 labels → modern 1 / 0

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| _no distinctive legacy subfeature class_ | 0 | 0 | 0 | `n/a` |

#### `FP-E17` — Document rendering surface (page composer, template renderer, public resume)

**Classification:** `FULL PARITY` · **auditStatus:** `SIGNAL_CLEAN` · **backend:** yes · **files:** legacy 5 / modern 3 · **actions:** legacy 3 handlers / 6 labels → modern 6 / 8

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| filtering | 16 | 9 | 435 | `present` |
| PDF / DOCX export | 2 | 3 | 18 | `present` |

_Integrity risk in modern files:_ `clientStorage` ×3

#### `FP-E11` — DOCX export with ZIP magic-byte validation

**Classification:** `PARTIAL PARITY` · **auditStatus:** `SIGNAL_CLEAN` · **backend:** yes · **files:** legacy 1 / modern 2 · **actions:** legacy 0 handlers / 0 labels → modern 12 / 39

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| PDF / DOCX export | 4 | 4 | 18 | `present` |

_Integrity risk in modern files:_ `clientStorage` ×9

#### `FP-E12` — Server-rendered PDF export

**Classification:** `PARTIAL PARITY` · **adjudication:** `NO_CHANGE` · **auditStatus:** `ADJUDICATED` · **backend:** yes · **files:** legacy 3 / modern 2 · **actions:** legacy 3 handlers / 0 labels → modern 12 / 39

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| PDF / DOCX export | 8 | 4 | 18 | `present` |

_Adjudication (M7, hand-read):_ Verified statically, not left open. DOCX export is real and duplicated in two modern surfaces (resumes.tsx:497 and preview-modal.tsx:168 → POST /api/export-docx). PDF: there is no PDF route anywhere in backend/ (`grep -E '(app|router)\.(get|post)\('` over backend for 'pdf' returns nothing) and no headless-browser service (no puppeteer/chromium module). So the modern server-rendered export is DOCX-only — PARTIAL PARITY stands, and the lead is closed as a format loss rather than an unresolved question.

_Verified by:_ frontend/src/pages/dashboard/resumes.tsx:497; backend grep for pdf routes/services → 0

_Unaccounted legacy actions (leads):_ `downloadResumeDocx()`, `downloadResumeExport()`


_Actions traced to another capability row (not losses):_ `downloadResumePdf()`→app


_Integrity risk in modern files:_ `clientStorage` ×9

#### `FP-E13` — Smart resume layout engine (section partitioner, 5 layouts, themed rendering)

**Classification:** `FULL PARITY` · **auditStatus:** `SIGNAL_CLEAN` · **backend:** n/a · **files:** legacy 23 / modern 4 · **actions:** legacy 0 handlers / 4 labels → modern 0 / 1

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| filtering | 26 | 18 | 435 | `present` |
| chart / visualisation | 8 | 2 | 9 | `present` |

#### `FP-E14` — Bullet-point quality/health cards and role health checks

**Classification:** `PARTIAL PARITY` · **adjudication:** `RECLASSIFY_PARTIAL` · **auditStatus:** `ADJUDICATED` · **backend:** no · **files:** legacy 2 / modern 3 · **actions:** legacy 12 handlers / 4 labels → modern 38 / 118

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| filtering | 21 | 50 | 435 | `present` |
| pagination / cursor / load-more | 12 | 36 | 269 | `present` |
| drag & drop | 3 | 0 | 13 | `elsewhere-in-app` |
| undo / restore | 7 | 0 | 19 | `elsewhere-in-app` |

_Adjudication (M7, hand-read):_ The row was MISSING, but the modern builder ships a 'Bullet Polish' tab with a real-time impact analyzer (active verbs / metrics / outcomes, strength score with Strong/Moderate/Needs Metrics bands, progress bar) at resume-builder.tsx:2336-2390, plus power-verb insertion and an AI bullet copilot (components/resume/role-ai-copilot-modal.tsx, FormattingToolbar). What is absent is the per-bullet editor's drag-reorder, undo, passive-opener fixer and quick-metric injection. Behaviourally this is a narrower implementation, not an absence: PARTIAL PARITY.

_Verified by:_ frontend/src/pages/dashboard/resume-builder.tsx:2336-2390; frontend/src/components/ui/formatting-toolbar.tsx:118-180; frontend/src/components/resume/role-ai-copilot-modal.tsx:43-210

_Unaccounted legacy actions (leads):_ `handleEnhanceAll()`, `handleFixPassiveOpener()`, `handleInjectQuickMetric()`, `handleUndo()`, "Undo AI enhancement or edit"


_Actions traced to another capability row (not losses):_ `handleDragEnd()`→app, `handleDragStart()`→app


_Integrity risk in modern files:_ `fakeSuccess` ×1

#### `FP-E15` — Free-tier watermark + export entitlement gating

**Classification:** `PARTIAL PARITY` · **auditStatus:** `SIGNAL_CLEAN` · **backend:** yes · **files:** legacy 2 / modern 2 · **actions:** legacy 0 handlers / 0 labels → modern 3 / 7

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| _no distinctive legacy subfeature class_ | 0 | 0 | 0 | `n/a` |

#### `FP-E10` — AI writing aids (grammar check, summary, import)

**Classification:** `PARTIAL PARITY` · **auditStatus:** `EQUIVALENCE_LEAD` · **backend:** yes · **files:** legacy 2 / modern 3 · **actions:** legacy 9 handlers / 5 labels → modern 10 / 13

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| filtering | 14 | 8 | 435 | `present` |
| pagination / cursor / load-more | 7 | 5 | 269 | `present` |
| dialog / drawer | 4 | 15 | 307 | `present` |
| PDF / DOCX export | 2 | 1 | 18 | `present` |
| file upload | 1 | 1 | 2 | `present` |
| drag & drop | 2 | 2 | 13 | `present` |
| chart / visualisation | 9 | 0 | 9 | `elsewhere-in-app` |

### Domain F

#### `FP-F01` — Employer portal shell with tabbed workspace

**Classification:** `PARTIAL PARITY` · **auditStatus:** `EQUIVALENCE_LEAD` · **backend:** yes · **files:** legacy 12 / modern 1 · **actions:** legacy 11 handlers / 40 labels → modern 4 / 11

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| tabular data | 2 | 4 | 48 | `present` |
| search | 3 | 7 | 180 | `present` |
| filtering | 8 | 6 | 435 | `present` |
| pagination / cursor / load-more | 9 | 14 | 269 | `present` |
| dialog / drawer | 8 | 4 | 307 | `present` |
| PDF / DOCX export | 8 | 0 | 18 | `elsewhere-in-app` |
| print | 1 | 0 | 9 | `elsewhere-in-app` |
| client-side authorization gate | 7 | 0 | 81 | `elsewhere-in-app` |

#### `FP-F02` — Applicant pipeline (kanban + list, stage transitions)

**Classification:** `PARTIAL PARITY` · **auditStatus:** `DEEP_READ_M6` · **backend:** yes · **files:** legacy 12 / modern 2 · **actions:** legacy 11 handlers / 40 labels → modern 6 / 17

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| tabular data | 2 | 4 | 48 | `present` |
| search | 3 | 7 | 180 | `present` |
| filtering | 8 | 7 | 435 | `present` |
| pagination / cursor / load-more | 9 | 14 | 269 | `present` |
| dialog / drawer | 8 | 17 | 307 | `present` |
| PDF / DOCX export | 8 | 0 | 18 | `elsewhere-in-app` |
| print | 1 | 1 | 9 | `present` |
| client-side authorization gate | 7 | 0 | 81 | `elsewhere-in-app` |

#### `FP-F03` — Employer candidate messaging / send-message dialog

**Classification:** `MOCK / FABRICATED STATE` · **auditStatus:** `DEEP_READ_M6` · **backend:** yes · **files:** legacy 2 / modern 1 · **actions:** legacy 1 handlers / 3 labels → modern 4 / 11

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| dialog / drawer | 3 | 4 | 307 | `present` |

#### `FP-F04` — Employer onboarding wizard

**Classification:** `MISSING` · **auditStatus:** `SIGNAL_CLEAN` · **backend:** partial · **files:** legacy 1 / modern 0 · **actions:** legacy 0 handlers / 1 labels → modern 0 / 0

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| _no distinctive legacy subfeature class_ | 0 | 0 | 0 | `n/a` |

#### `FP-F05` — Job creation / requisition editor

**Classification:** `FULL PARITY` · **auditStatus:** `EQUIVALENCE_LEAD` · **backend:** yes · **files:** legacy 12 / modern 1 · **actions:** legacy 11 handlers / 40 labels → modern 7 / 10

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| tabular data | 2 | 0 | 48 | `elsewhere-in-app` |
| search | 3 | 0 | 180 | `elsewhere-in-app` |
| filtering | 8 | 6 | 435 | `present` |
| pagination / cursor / load-more | 9 | 1 | 269 | `present` |
| dialog / drawer | 8 | 2 | 307 | `present` |
| PDF / DOCX export | 8 | 0 | 18 | `elsewhere-in-app` |
| print | 1 | 0 | 9 | `elsewhere-in-app` |
| client-side authorization gate | 7 | 0 | 81 | `elsewhere-in-app` |

#### `FP-F06` — Company profile + team seats

**Classification:** `PARTIAL PARITY` · **auditStatus:** `DEEP_READ_M6` · **backend:** yes · **files:** legacy 12 / modern 2 · **actions:** legacy 11 handlers / 40 labels → modern 5 / 7

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| tabular data | 2 | 2 | 48 | `present` |
| search | 3 | 0 | 180 | `elsewhere-in-app` |
| filtering | 8 | 0 | 435 | `elsewhere-in-app` |
| pagination / cursor / load-more | 9 | 1 | 269 | `present` |
| dialog / drawer | 8 | 8 | 307 | `present` |
| PDF / DOCX export | 8 | 0 | 18 | `elsewhere-in-app` |
| print | 1 | 0 | 9 | `elsewhere-in-app` |
| client-side authorization gate | 7 | 0 | 81 | `elsewhere-in-app` |

_Integrity risk in modern files:_ `fixtures` ×1

#### `FP-F07` — Job discovery with map view and location autocomplete

**Classification:** `MISSING` · **auditStatus:** `EQUIVALENCE_LEAD` · **backend:** partial · **files:** legacy 3 / modern 1 · **actions:** legacy 4 handlers / 0 labels → modern 1 / 5

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| _no distinctive legacy subfeature class_ | 0 | 0 | 0 | `n/a` |

_Unaccounted legacy actions (leads):_ `handleOptionClick()`, `handlePlaceSelect()`


#### `FP-F08` — Regional job hubs / landing pages

**Classification:** `PARTIAL PARITY` · **adjudication:** `NO_CHANGE` · **auditStatus:** `ADJUDICATED` · **backend:** yes · **files:** legacy 4 / modern 1 · **actions:** legacy 8 handlers / 0 labels → modern 0 / 5

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| search | 6 | 11 | 180 | `present` |
| filtering | 3 | 1 | 435 | `present` |
| pagination / cursor / load-more | 2 | 1 | 269 | `present` |
| dialog / drawer | 1 | 0 | 307 | `elsewhere-in-app` |

_Adjudication (M7, hand-read):_ Regional hub pages exist and call /api/public/geo/regions/{kind}/{slug} (UI-REACHABLE); the unaccounted handlers belong to the main job board row (FP-F10).

_Verified by:_ frontend/src/pages/jobs/regional-hub.tsx:57-77

_Unaccounted legacy actions (leads):_ `handleAuthButtonClick()`, `handleBrowseJobs()`, `handleJobSearch()`, `handlePostJob()`, `handleViewAllCompanies()`, `handleViewAllJobs()`


#### `FP-F11` — Employer dashboard: companies management, job editing, application modals, rejection reasons

**Classification:** `PARTIAL PARITY` · **adjudication:** `NO_CHANGE` · **auditStatus:** `ADJUDICATED` · **backend:** yes · **files:** legacy 7 / modern 7 · **actions:** legacy 26 handlers / 11 labels → modern 15 / 35

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| search | 23 | 7 | 180 | `present` |
| filtering | 29 | 13 | 435 | `present` |
| sorting | 4 | 0 | 17 | `elsewhere-in-app` |
| pagination / cursor / load-more | 10 | 16 | 269 | `present` |
| dialog / drawer | 15 | 34 | 307 | `present` |
| PDF / DOCX export | 2 | 0 | 18 | `elsewhere-in-app` |

_Adjudication (M7, hand-read):_ Job delete (useDeleteJob), application status change (PATCH /job-applications/:id/status) and rejection reasons (CandidateReviewDrawer employerNotes) all exist; the remaining handlers are the employer portal's tab shell (FP-F01).

_Verified by:_ frontend/src/hooks/use-api-hooks.ts:297-310; frontend/src/components/employer/CandidateReviewDrawer.tsx:84,252

_Unaccounted legacy actions (leads):_ `handleArrayChange()`, `handleCloseModal()`, `handleDeleteCompany()`, `handleDeleteJob()`, `handleDownloadResume()`, `handleEditJob()`, `handleJobClick()`, `handleJobUpdated()`, `handleLocationChange()`, `handleMessageChange()`, `openRejectionModal()`, `removeArrayItem()`, `toggleApplicationExpansion()`, `toggleCompanyExpansion()`, `toggleJobExpansion()`


_Actions traced to another capability row (not losses):_ `handleSendEmail()`→app, `handleUpdateApplicationStatus()`→app


_Integrity risk in modern files:_ `fixtures` ×1

#### `FP-F10` — Job listing browse/filter UI (beyond maps and autocomplete)

**Classification:** `PARTIAL PARITY` · **adjudication:** `SUBFEATURE_LOSS` · **auditStatus:** `ADJUDICATED` · **backend:** yes · **files:** legacy 21 / modern 2 · **actions:** legacy 47 handlers / 67 labels → modern 4 / 8

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| search | 30 | 12 | 180 | `present` |
| filtering | 45 | 4 | 435 | `present` |
| sorting | 9 | 0 | 17 | `elsewhere-in-app` |
| pagination / cursor / load-more | 55 | 1 | 269 | `present` |
| dialog / drawer | 21 | 0 | 307 | `elsewhere-in-app` |

_Adjudication (M7, hand-read):_ Real loss of filter depth. Legacy JobFilters offered ~15 industry categories, experience level (entry/mid/senior/executive), work mode (on-site/hybrid/remote) and 'Reset all'; the modern portal exposes only three job types (JOB_TYPES: All/Full-time/Part-time/Contract/Internship/Remote), a location text box and free-text search, with no reset and no paging. The listing fetch itself targets `/jobs`, which no backend operation serves (DISC-043), so the page surfaces an error rather than results.

_Verified by:_ frontend/src/pages/jobs/portal.tsx:54-81; legacy src/components/JobsListings/JobFilters.jsx:42, JobSearchBar.jsx:46

_Unaccounted legacy actions (leads):_ `handleApplyClick()`, `handleArrayChange()`, `handleAuthButtonClick()`, `handleBrowseJobs()`, `handleCloseCreateJobModal()`, `handleCloseFavorites()`, `handleCloseJobApplicationModal()`, `handleCloseModal()`, `handleCoverLetterChange()`, `handleFilterChange()`, `handleGoToCompanies()`, `handleJobCreated()`, `handleLocationChange()`, `handleOpenFavorites()`, `handleOpenJobApplication()`, `handlePlaceSelect()`, `handlePostJob()`, `handleQuickFilter()`, `handleQuickFilterClick()`, `handleSaveAsDraft()`, `handleShowResumeSelector()`, `handleSuggestionClick()`, `handleToggleFavoriteWithRefresh()`, `handleViewAllCompanies()`, `handleViewAllJobs()`, `handleViewDetails()`, `handleViewDetailsAndClose()`, `removeArrayItem()`, `removeSpecificFilter()`, `toggleFilterSection()`, `toggleSavedJob()`, "Media & Entertainment", "Terms and Conditions"


_Actions traced to another capability row (not losses):_ `handleResumeSelect()`→app, `handleShare()`→app, `handleShowPreview()`→app, "Agriculture"→FP-E04, "Construction"→FP-E04, "Consulting"→FP-F06, "Education"→FP-A24 … (31 total)


_Integrity risk in modern files:_ `fakeSuccess` ×1

#### `FP-F09` — Employer dashboard analytics

**Classification:** `UNVERIFIED` · **auditStatus:** `EQUIVALENCE_LEAD` · **backend:** partial · **files:** legacy 13 / modern 1 · **actions:** legacy 11 handlers / 40 labels → modern 4 / 11

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| tabular data | 2 | 4 | 48 | `present` |
| search | 3 | 7 | 180 | `present` |
| filtering | 8 | 6 | 435 | `present` |
| pagination / cursor / load-more | 9 | 14 | 269 | `present` |
| dialog / drawer | 8 | 4 | 307 | `present` |
| PDF / DOCX export | 8 | 0 | 18 | `elsewhere-in-app` |
| print | 1 | 0 | 9 | `elsewhere-in-app` |
| client-side authorization gate | 7 | 0 | 81 | `elsewhere-in-app` |

### Domain G

#### `FP-G01` — Cuba application shell (nav, header, popovers, a11y)

**Classification:** `PARTIAL PARITY` · **adjudication:** `NO_CHANGE` · **auditStatus:** `ADJUDICATED` · **backend:** n/a · **files:** legacy 2 / modern 2 · **actions:** legacy 6 handlers / 10 labels → modern 2 / 18

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| filtering | 2 | 3 | 435 | `present` |
| dialog / drawer | 10 | 1 | 307 | `present` |

_Adjudication (M7, hand-read):_ Shell navigation is expressed as routes and `navigate()` calls rather than named click handlers (`app-shell.tsx:89` is the only imperative navigation; the nav itself renders router links). The two leads are legacy handler names, not lost actions. The previously recorded PARTIAL stands on the command palette absence (FP-D04).

_Verified by:_ frontend/src/components/layout/app-shell.tsx:66,89,304; frontend/src/app/router.tsx

_Unaccounted legacy actions (leads):_ `handleNavClick()`, `onMobileNavigate()`


_Actions traced to another capability row (not losses):_ `onToggleTheme()`→app


_Integrity risk in modern files:_ `clientStorage` ×4

#### `FP-G02` — Cuba design-system primitives (30 components)

**Classification:** `REPLACED BY EQUIVALENT` · **adjudication:** `NO_CHANGE` · **auditStatus:** `ADJUDICATED` · **backend:** n/a · **files:** legacy 52 / modern 13 · **actions:** legacy 15 handlers / 44 labels → modern 13 / 19

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| filtering | 51 | 0 | 435 | `elsewhere-in-app` |
| pagination / cursor / load-more | 9 | 26 | 269 | `present` |
| dialog / drawer | 35 | 19 | 307 | `present` |
| JSON export | 1 | 1 | 14 | `present` |
| chart / visualisation | 2 | 1 | 9 | `present` |
| client-side authorization gate | 3 | 0 | 81 | `elsewhere-in-app` |

_Adjudication (M7, hand-read):_ Theme toggle, nav handling and the app shell exist (useTheme in app-shell.tsx); the copilot actions moved to the AI surfaces (FP-D04/D09 rows). REPLACED BY EQUIVALENT stands.

_Verified by:_ frontend/src/components/layout/app-shell.tsx:34,66,304

_Unaccounted legacy actions (leads):_ `handleNavClick()`, `onMobileNavigate()`, `runCopilotAction()`, `submitCopilotPrompt()`, `toggleCubaShell()`, "Ada Lovelace", "Commands"


_Actions traced to another capability row (not losses):_ `onSignOut()`→FP-G01, `onToggleTheme()`→app, `toggleRead()`→FP-D07, "Accessibility guards"→app, "Account"→FP-A01, "Badges"→FP-A09, "Cards"→FP-A01 … (17 total)


_Integrity risk in modern files:_ `clientStorage` ×3

#### `FP-G03` — Internationalisation (16 locales, ~1,011 translation keys)

**Classification:** `MISSING` · **auditStatus:** `SIGNAL_CLEAN` · **backend:** n/a · **files:** legacy 1 / modern 0 · **actions:** legacy 0 handlers / 0 labels → modern 0 / 0

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| _no distinctive legacy subfeature class_ | 0 | 0 | 0 | `n/a` |

#### `FP-G04` — Product analytics (GA4 / gtag)

**Classification:** `MISSING` · **auditStatus:** `SIGNAL_CLEAN` · **backend:** n/a · **files:** legacy 1 / modern 0 · **actions:** legacy 1 handlers / 0 labels → modern 0 / 0

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| _no distinctive legacy subfeature class_ | 0 | 0 | 0 | `n/a` |

_Actions traced to another capability row (not losses):_ `handleConsent()`→app


#### `FP-G05` — Per-route SEO metadata (title, description, canonical, structured data)

**Classification:** `MISSING` · **adjudication:** `NO_CHANGE` · **auditStatus:** `ADJUDICATED` · **backend:** no · **files:** legacy 4 / modern 0 · **actions:** legacy 2 handlers / 0 labels → modern 0 / 0

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| filtering | 3 | 0 | 435 | `elsewhere-in-app` |

_Adjudication (M7, hand-read):_ MISSING stands for per-route metadata: only the public portfolio sets `document.title`; no helmet/title hook exists anywhere. Site-level title/description/logo editing does exist (`AdminSettingsTab.tsx:853-881`) but that is one metadata document, not per-route SEO with canonical and structured data.

_Verified by:_ grep for useDocumentTitle|Helmet|document.title in frontend/src; frontend/src/components/admin/AdminSettingsTab.tsx:853-881

_Unaccounted legacy actions (leads):_ `handleMetadataUpdate()`, `removeMeta()`


#### `FP-G06` — Service worker / offline shell

**Classification:** `MISSING` · **adjudication:** `NO_CHANGE` · **auditStatus:** `ADJUDICATED` · **backend:** n/a · **files:** legacy 2 / modern 0 · **actions:** legacy 1 handlers / 0 labels → modern 0 / 0

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| _no distinctive legacy subfeature class_ | 0 | 0 | 0 | `n/a` |

_Adjudication (M7, hand-read):_ MISSING stands and is now positively confirmed: zero service-worker registrations anywhere (`grep -rn serviceWorker frontend/src` → 0). Lazy routes wrapped in Suspense plus an ErrorBoundary (`app/router.tsx`) is error handling for code-splitting, not an offline shell — a chunk that cannot be fetched still fails.

_Verified by:_ grep -rn 'serviceWorker\|registerSW' frontend/src index.html; frontend/src/app/router.tsx (lazy + Suspense + ErrorBoundary)

_Unaccounted legacy actions (leads):_ `handleChunkError()`


#### `FP-G07` — Toast / notification feedback primitives

**Classification:** `PARTIAL PARITY` · **auditStatus:** `SIGNAL_CLEAN` · **backend:** n/a · **files:** legacy 1 / modern 1 · **actions:** legacy 0 handlers / 0 labels → modern 3 / 2

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| _no distinctive legacy subfeature class_ | 0 | 0 | 0 | `n/a` |

_Integrity risk in modern files:_ `fakeSuccess` ×2

#### `FP-G08` — Auth flows: OAuth sign-in, 2FA, forced password change

**Classification:** `PARTIAL PARITY` · **adjudication:** `NO_CHANGE` · **auditStatus:** `ADJUDICATED` · **backend:** yes · **files:** legacy 6 / modern 1 · **actions:** legacy 2 handlers / 9 labels → modern 5 / 5

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| pagination / cursor / load-more | 6 | 0 | 269 | `elsewhere-in-app` |
| dialog / drawer | 7 | 0 | 307 | `elsewhere-in-app` |
| JSON export | 4 | 0 | 14 | `elsewhere-in-app` |
| chart / visualisation | 4 | 1 | 9 | `present` |
| client-side authorization gate | 4 | 0 | 81 | `elsewhere-in-app` |

_Adjudication (M7, hand-read):_ The lead `handleResetPassword` has a modern equivalent: the reset-password page and its request flow under `pages/auth`. Partial parity stands on the already-recorded differences (forced password change).

_Verified by:_ frontend/src/pages/auth (reset-password page); grep handleResetPassword has no modern match because the handler is inlined

_Unaccounted legacy actions (leads):_ `handleResetPassword()`


_Actions traced to another capability row (not losses):_ `handleError()`→app, "Close Modal"→FP-A03


#### `FP-G09` — Blog authoring + public blog

**Classification:** `MISSING` · **adjudication:** `SUBFEATURE_LOSS` · **auditStatus:** `ADJUDICATED` · **backend:** yes · **files:** legacy 7 / modern 3 · **actions:** legacy 18 handlers / 69 labels → modern 6 / 17

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| tabular data | 2 | 2 | 48 | `present` |
| search | 10 | 14 | 180 | `present` |
| filtering | 27 | 10 | 435 | `present` |
| sorting | 4 | 0 | 17 | `elsewhere-in-app` |
| pagination / cursor / load-more | 22 | 5 | 269 | `present` |
| dialog / drawer | 17 | 7 | 307 | `present` |
| bulk selection | 5 | 0 | 7 | `elsewhere-in-app` |
| undo / restore | 5 | 0 | 19 | `elsewhere-in-app` |

_Adjudication (M7, hand-read):_ Confirmed loss of the rich authoring actions: the modern editor has a plain `excerpt` input (`pages/blog/editor.tsx:284-286`) and no insert-image, insert-link or auto-excerpt action anywhere in the file. This is the front-end half of DISC-039; the back-end half is that all of the editor's four requests target unregistered paths.

_Verified by:_ frontend/src/pages/blog/editor.tsx:284-286 (no image/link toolbar)

_Unaccounted legacy actions (leads):_ `handleAutoExcerpt()`, `handleInsertImage()`, `handleInsertLink()`


_Actions traced to another capability row (not losses):_ `handleShare()`→app, "Blockquote"→FP-G15, "Bullet List"→FP-A09, "Heading 1"→FP-C04, "Heading 2"→FP-C04 … (15 total)


_Integrity risk in modern files:_ `fixtures` ×1, `fakeSuccess` ×1

#### `FP-G10` — CMS custom pages / landing page rendering

**Classification:** `PARTIAL PARITY` · **adjudication:** `SUBFEATURE_LOSS` · **auditStatus:** `ADJUDICATED` · **backend:** yes · **files:** legacy 17 / modern 2 · **actions:** legacy 16 handlers / 37 labels → modern 1 / 24

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| tabular data | 2 | 0 | 48 | `elsewhere-in-app` |
| search | 8 | 0 | 180 | `elsewhere-in-app` |
| filtering | 6 | 0 | 435 | `elsewhere-in-app` |
| pagination / cursor / load-more | 16 | 0 | 269 | `elsewhere-in-app` |
| dialog / drawer | 8 | 0 | 307 | `elsewhere-in-app` |
| PDF / DOCX export | 10 | 0 | 18 | `elsewhere-in-app` |

_Adjudication (M7, hand-read):_ The modern CMS page renders a hardcoded dictionary of five legal pages (CMS_PAGES) at pages/cms/index.tsx:145-200; there is no admin authoring, no language switching and no meta editing, all of which the legacy CMS had. Server-side page storage still exists (/public/custom-pages) but the UI no longer edits it.

_Verified by:_ frontend/src/pages/cms/index.tsx:1-150; backend public/custom-pages route

_Unaccounted legacy actions (leads):_ `handleCloseAuthModal()`, `handleDropdownEnter()`, `handleDropdownLeave()`, `handleHashClick()`, `handleLanguageChange()`, `handleMetaUpdate()`, `handleOpenAuthModal()`, `handlePrimaryCta()`, `handleSecondaryCta()`, `handleStartBuilding()`, `handleUseTemplate()`, "American Express", "JCB", "Mastercard"


_Actions traced to another capability row (not losses):_ `handleScroll()`→app, `handleSignIn()`→app, "Log In"→FP-A01, "Select Language"→FP-A09, "Visa"→FP-E02


#### `FP-G11` — Marketing site: welcome, features, FAQ, about, contact, legal

**Classification:** `PARTIAL PARITY` · **auditStatus:** `EQUIVALENCE_LEAD` · **backend:** n/a · **files:** legacy 3 / modern 3 · **actions:** legacy 3 handlers / 6 labels → modern 2 / 21

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| filtering | 4 | 1 | 435 | `present` |
| pagination / cursor / load-more | 3 | 0 | 269 | `elsewhere-in-app` |
| dialog / drawer | 1 | 0 | 307 | `elsewhere-in-app` |

_Unaccounted legacy actions (leads):_ `handleDismissSuccess()`


#### `FP-G12` — Privacy consent banner + cookie policy surface

**Classification:** `MISSING` · **adjudication:** `NO_CHANGE` · **auditStatus:** `ADJUDICATED` · **backend:** n/a · **files:** legacy 1 / modern 0 · **actions:** legacy 2 handlers / 1 labels → modern 0 / 0

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| pagination / cursor / load-more | 2 | 0 | 269 | `elsewhere-in-app` |
| dialog / drawer | 1 | 0 | 307 | `elsewhere-in-app` |

_Adjudication (M7, hand-read):_ MISSING stands: no consent banner, cookie preferences or privacy-choices modal exists (`grep -rn 'privacyChoices\|cookieConsent'` → only an unrelated admin settings string).

_Verified by:_ grep -rn 'privacyChoices|PrivacyChoices|cookieConsent' frontend/src

_Unaccounted legacy actions (leads):_ `openPrivacyChoicesModal()`


_Actions traced to another capability row (not losses):_ "Privacy policy"→FP-A16


#### `FP-G13` — Entitlements / plan-gating data model

**Classification:** `PARTIAL PARITY` · **auditStatus:** `EQUIVALENCE_LEAD` · **backend:** partial · **files:** legacy 2 / modern 0 · **actions:** legacy 0 handlers / 0 labels → modern 0 / 0

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| client-side authorization gate | 1 | 0 | 81 | `elsewhere-in-app` |

#### `FP-G15` — Shared utility library (42 modules: formatting, validation, download, OAuth resolvers, print)

**Classification:** `REPLACED BY EQUIVALENT` · **adjudication:** `NO_CHANGE` · **auditStatus:** `ADJUDICATED` · **backend:** n/a · **files:** legacy 43 / modern 36 · **actions:** legacy 13 handlers / 0 labels → modern 12 / 0

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| tabular data | 2 | 0 | 48 | `elsewhere-in-app` |
| filtering | 129 | 108 | 435 | `present` |
| pagination / cursor / load-more | 9 | 8 | 269 | `present` |
| PDF / DOCX export | 12 | 2 | 18 | `present` |
| client-side authorization gate | 2 | 0 | 81 | `elsewhere-in-app` |

_Adjudication (M7, hand-read):_ The utility library was replaced by a different set of modules; the unaccounted helpers are billing/document helpers that belong to the billing row (invoice download is client-generated at checkout-modal.tsx:356-390). No row-scope loss.

_Verified by:_ frontend/src/pages/billing/checkout-modal.tsx:356-390

_Unaccounted legacy actions (leads):_ `createResumeRecoveryEnvelope()`, `downloadResumeDocx()`, `downloadResumeExport()`, `downloadTextFile()`, `printAuthoritativeBillingDocument()`, `printAuthoritativeCreditNote()`, `printAuthoritativeInvoice()`, `removeHistoryEntry()`, `runAdminDiagnostics()`


_Actions traced to another capability row (not losses):_ `downloadResumePdf()`→app, `printWindow()`→app


_Integrity risk in modern files:_ `clientStorage` ×41

#### `FP-G16` — Typed API service layer (client, resumes, covers, jobs, portfolios, blog, platform, users, databaseAdmin)

**Classification:** `REPLACED BY EQUIVALENT` · **adjudication:** `NO_CHANGE` · **auditStatus:** `ADJUDICATED` · **backend:** yes · **files:** legacy 23 / modern 4 · **actions:** legacy 73 handlers / 0 labels → modern 4 / 0

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| search | 3 | 0 | 180 | `elsewhere-in-app` |
| filtering | 23 | 6 | 435 | `present` |
| pagination / cursor / load-more | 1 | 8 | 269 | `present` |
| JSON export | 82 | 3 | 14 | `present` |
| PDF / DOCX export | 5 | 0 | 18 | `elsewhere-in-app` |
| bulk selection | 1 | 0 | 7 | `elsewhere-in-app` |
| client-side authorization gate | 4 | 0 | 81 | `elsewhere-in-app` |

_Adjudication (M7, hand-read):_ The typed service layer exists (lib/enterprise-api.ts, lib/messages.ts, hooks/use-api-hooks.ts). The unaccounted create/delete helpers are endpoints of capabilities that are themselves missing (blog), which is recorded on those rows, not on the service layer.

_Verified by:_ frontend/src/lib/enterprise-api.ts, frontend/src/hooks/use-api-hooks.ts

_Unaccounted legacy actions (leads):_ `createBlogCategory()`, `createUserSupportTicket()`, `deleteBlogCategory()`, `deleteJobByAdmin()`, `deleteUserAccountPermanently()`, `deleteUserByAdmin()`, `exportUserDataJSON()`, `handleResponseFailure()`, `removeCategoryByName()`, `removeFromFavourites()`, `removePageByName()`, `removePhraseFromCategory()`, `removeResumeCurrent()`, `removeSkillFromUser()`, `removeUserAiEntitlement()`, `removeUserTenant()`


_Actions traced to another capability row (not losses):_ `createAbortController()`→app, `createAdminUser()`→app, `createBlogPost()`→app, `createCompany()`→app, `createConversation()`→app, `createJobPosting()`→app … (24 total)


_Integrity risk in modern files:_ `clientStorage` ×2

#### `FP-G17` — Geo / location datasets, autocomplete directories, job-location helpers

**Classification:** `MISSING` · **auditStatus:** `EQUIVALENCE_LEAD` · **backend:** partial · **files:** legacy 3 / modern 0 · **actions:** legacy 0 handlers / 0 labels → modern 0 / 0

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| filtering | 11 | 0 | 435 | `elsewhere-in-app` |
| JSON export | 1 | 0 | 14 | `elsewhere-in-app` |

#### `FP-G18` — Structured data / JSON-LD for public pages

**Classification:** `MISSING` · **auditStatus:** `EQUIVALENCE_LEAD` · **backend:** no · **files:** legacy 1 / modern 0 · **actions:** legacy 0 handlers / 0 labels → modern 0 / 0

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| filtering | 4 | 0 | 435 | `elsewhere-in-app` |

#### `FP-G19` — TOTP / MFA secret provisioning helpers

**Classification:** `PARTIAL PARITY` · **auditStatus:** `SIGNAL_CLEAN` · **backend:** yes · **files:** legacy 2 / modern 16 · **actions:** legacy 0 handlers / 0 labels → modern 71 / 255

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| filtering | 1 | 139 | 435 | `present` |
| pagination / cursor / load-more | 8 | 47 | 269 | `present` |

_Integrity risk in modern files:_ `fakeSuccess` ×1, `clientStorage` ×6

#### `FP-G20` — Job application tracker

**Classification:** `FULL PARITY` · **adjudication:** `NO_CHANGE` · **auditStatus:** `ADJUDICATED` · **backend:** yes · **files:** legacy 2 / modern 7 · **actions:** legacy 9 handlers / 7 labels → modern 6 / 17

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| search | 3 | 7 | 180 | `present` |
| filtering | 8 | 13 | 435 | `present` |
| dialog / drawer | 3 | 21 | 307 | `present` |
| drag & drop | 4 | 11 | 13 | `present` |

_Adjudication (M7, hand-read):_ Both leads are equivalent behaviour, not losses: the job URL opens through a real anchor (`tracker-entry.tsx:87-89`), and stage movement is a native `<select>` (`:156-166`) with drag-and-drop on the board (`:35`), so no bespoke key handler is needed. FULL PARITY stands.

_Verified by:_ frontend/src/components/job-tracker/tracker-entry.tsx:87-89,156-166,35

_Unaccounted legacy actions (leads):_ `onStageKeyDown()`, `openJobUrl()`


_Actions traced to another capability row (not losses):_ `openCoverLetter()`→app, "Not scheduled"→FP-A05, "Pipeline analytics"→FP-A16


#### `FP-G21` — AI interview coach / role-based question generation

**Classification:** `PARTIAL PARITY` · **auditStatus:** `DEEP_READ_M6` · **backend:** yes · **files:** legacy 2 / modern 1 · **actions:** legacy 2 handlers / 0 labels → modern 0 / 0

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| filtering | 23 | 0 | 435 | `elsewhere-in-app` |
| pagination / cursor / load-more | 1 | 0 | 269 | `elsewhere-in-app` |

_Unaccounted legacy actions (leads):_ `downloadTextFile()`, `removeHistoryEntry()`


_Integrity risk in modern files:_ `clientStorage` ×3

#### `FP-G22` — Data models, runtime conf and React context scaffolding

**Classification:** `REPLACED BY EQUIVALENT` · **adjudication:** `NO_CHANGE` · **auditStatus:** `ADJUDICATED` · **backend:** n/a · **files:** legacy 7 / modern 37 · **actions:** legacy 2 handlers / 0 labels → modern 12 / 0

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| JSON export | 1 | 5 | 14 | `present` |

_Adjudication (M7, hand-read):_ REPLACED BY EQUIVALENT holds. The lead is `createLocalAuth`, a legacy module scaffold name; the modern tree has real modules under src/lib and src/app instead. No user-facing action is involved.

_Verified by:_ frontend/src/lib, frontend/src/app

_Unaccounted legacy actions (leads):_ `createLocalAuth()`


_Actions traced to another capability row (not losses):_ `createNullAuth()`→app


_Integrity risk in modern files:_ `clientStorage` ×41

#### `FP-G23` — Cross-cutting hooks (unread pollers, AI token usage, AI engine status, service availability, dialogs)

**Classification:** `PARTIAL PARITY` · **auditStatus:** `EQUIVALENCE_LEAD` · **backend:** yes · **files:** legacy 11 / modern 2 · **actions:** legacy 6 handlers / 0 labels → modern 0 / 0

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| dialog / drawer | 16 | 0 | 307 | `elsewhere-in-app` |

_Unaccounted legacy actions (leads):_ `createUnreadMessagesPoller()`, `runOnce()`


_Actions traced to another capability row (not losses):_ `handleConfirm()`→FP-E01, `handleError()`→app, `toggleAudio()`→app, `toggleVideo()`→app


#### `FP-G24` — In-app support surface and input validation modals

**Classification:** `PARTIAL PARITY` · **auditStatus:** `EQUIVALENCE_LEAD` · **backend:** yes · **files:** legacy 3 / modern 5 · **actions:** legacy 8 handlers / 11 labels → modern 5 / 13

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| search | 10 | 9 | 180 | `present` |
| filtering | 8 | 17 | 435 | `present` |
| pagination / cursor / load-more | 25 | 4 | 269 | `present` |
| dialog / drawer | 8 | 2 | 307 | `present` |

_Unaccounted legacy actions (leads):_ `createTicketButtonRef()`, `createTicketDialogRef()`, `createTicketSubjectRef()`


_Actions traced to another capability row (not losses):_ "Close resume validation"→FP-A24


#### `FP-G25` — App bootstrap, route focus management, global spinner

**Classification:** `REPLACED BY EQUIVALENT` · **adjudication:** `NO_CHANGE` · **auditStatus:** `ADJUDICATED` · **backend:** n/a · **files:** legacy 4 / modern 10 · **actions:** legacy 2 handlers / 2 labels → modern 2 / 5

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| pagination / cursor / load-more | 1 | 0 | 269 | `elsewhere-in-app` |
| JSON export | 2 | 0 | 14 | `elsewhere-in-app` |
| print | 1 | 0 | 9 | `elsewhere-in-app` |
| client-side authorization gate | 3 | 6 | 81 | `present` |

_Adjudication (M7, hand-read):_ REPLACED BY EQUIVALENT holds: bootstrap is `main.tsx` + `app/router.tsx` with Suspense fallbacks and an ErrorBoundary; the leads (`handleChunkError`, `handleLanguageChanged`) are names for behaviour the router implements inline. Route-focus management remains unverified (U-G05), unchanged from M6.

_Verified by:_ frontend/src/main.tsx, frontend/src/app/router.tsx

_Unaccounted legacy actions (leads):_ `handleChunkError()`, `handleLanguageChanged()`


_Integrity risk in modern files:_ `clientStorage` ×2

#### `FP-G14` — Misc legacy orphans (Front, initailisation, Analytics, variables.scss)

**Classification:** `UNVERIFIED` · **auditStatus:** `SIGNAL_CLEAN` · **backend:** no · **files:** legacy 5 / modern 0 · **actions:** legacy 0 handlers / 0 labels → modern 0 / 0

| subfeature class | legacy | modern (row) | modern (app) | verdict |
|---|---:|---:|---:|---|
| _no distinctive legacy subfeature class_ | 0 | 0 | 0 | `n/a` |

