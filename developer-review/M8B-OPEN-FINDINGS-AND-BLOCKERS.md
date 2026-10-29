# M8B — OPEN FINDINGS AND BLOCKERS

**Source revision:** `69a3ed4`
**Purpose:** re-check the ten capability IDs carried as "previously open" and disposition each one. The earlier list
was **not** assumed to be still valid.

---

## 1. Dispositions

| ID | Capability | Current classification | Disposition | Basis |
|---|---|---|---|---|
| `FP-B05` | Teams + archive/restore | `PARTIAL PARITY`, backend yes, 1/1 file | **VERIFIED DEFECT (narrow) — remediation required** | Backend member add/remove exists with `workspace.members.manage` gates (`enterprise.js:729,738`); the modern tab exposes no member control. Runtime could not reach it: `ENTERPRISE_DISABLED` (M8B T9) |
| `FP-C02` | 71 modular portfolio page blocks | `MISSING`, backend **no**, 72/0 files | **VERIFIED DEFECT — remediation required** | 72 legacy files against 0 modern and no backend. Largest single-file-count loss in the register. Not runtime-testable (client-side) |
| `FP-D07` | Notification centre (bell, poller, routing) | `PARTIAL PARITY`, backend yes, 4/4 | **VERIFIED, KEEP OPEN** | Inventory parity (4/4) with a known poller defect recorded as DISC-053. Even file counts are not behavioural parity — see §3 |
| `FP-D12` | Dashboard-v2 element library | `PARTIAL PARITY`, backend yes, 28/18 | **VERIFIED DEFECT — remediation required** | 28 legacy files → 18 modern: a 36 % file loss on a shared element library |
| `FP-D13` | Candidate shell, AI briefing, job matches | `PARTIAL PARITY`, backend yes, 16/2 | **VERIFIED DEFECT — remediation required** | 16 → 2 files: the worst proportional loss in domain D |
| `FP-F07` | Job discovery with map view | `MISSING`, backend **partial**, 3/1 | **VERIFIED DEFECT — remediation required** | Map view and location autocomplete absent; backend only partial |
| `FP-G11` | Marketing site | `PARTIAL PARITY`, 3/3 declared | **VERIFIED DEFECT + MEASUREMENT DEFECT** | Declared corpus is "legacy 3 files" but the marketing module contains **15** `.jsx` components (`find src/components/Marketing -name '*.jsx' \| wc -l` → 15). Four stateful modules were lost into a 0-`useState` page (M8A B4). The row needs a recount, not just a reclassification |
| `FP-G21` | AI interview coach | `PARTIAL PARITY`, 2/1 | **VERIFIED DEFECT — remediation required** | Question generation survives; the voice stack is gone. See `FP-D02` |
| `FP-G23` | Cross-cutting hooks (pollers, AI usage) | `PARTIAL PARITY`, 11/2 | **KEEP OPEN — and ID now reserved** | Still open. **Critical:** M8A proposed reusing this ID for a *new* finding; that collision is corrected to `FP-G27` (see reconciliation §3.1) |
| `FP-G24` | In-app support surface + validation modals | `PARTIAL PARITY`, 3/5 | **UNSUPPORTED as a loss** | Modern has **more** files than legacy (3 → 5). Any "loss" claim here rests on labels, not files; no lost capability was demonstrated. **No action beyond keeping the row** |

### 1.1 Summary

| Disposition | Count |
|---|---:|
| Verified defect — remediation required | 6 (`FP-B05`, `FP-C02`, `FP-D12`, `FP-D13`, `FP-F07`, `FP-G21`) |
| Verified defect **plus** measurement defect | 1 (`FP-G11`) |
| Verified, keep open | 1 (`FP-D07`) |
| Unsupported as a loss | 1 (`FP-G24`) |
| Open, and the subject of an ID collision correction | 1 (`FP-G23`) |

---

## 2. `FP-D02` — mic capture + waveform (carried separately)

`MISSING`, backend n/a, legacy 2 / modern 0. **Verified defect.** M8A established by repo-wide search that
`getUserMedia|AudioContext|SpeechRecognition|speechSynthesis|MediaRecorder` appear **zero** times in `frontend/src`.
M8B confirmed the same search and adds that the legacy stack is 2,178 lines across three files. Provenance
upgraded from `EQUIVALENCE_LEAD` to **adjudicated absence**.

---

## 3. Why file-count parity is not capability parity

`FP-D07` is `PARTIAL PARITY` at **4/4 files**. A reader could conclude it is fine. It is not, for two reasons that
M8A and M8B both demonstrate:

1. A file can exist and still be wrong (DISC-053's poller defect lives inside a "present" file).
2. A file count says nothing about behaviour — the same lesson as `FP-G24`, where modern has *more* files and no
   demonstrable loss, and `FP-G11`, where a 5× undercount hid four lost interactive modules.

**No capability in this list is marked closed on the strength of a file count, a component name, a route
declaration or a shared helper.** Each row above carries either a behavioural argument or remains open.

---

## 4. Blockers, with exact prerequisites

| Blocker | Blocks | Prerequisite to clear it |
|---|---|---|
| **No MariaDB/MySQL** (`3306 ECONNREFUSED`) | rate-limit-gated routes (contact, messaging create), invoice/ledger reads, profile CAS resolution, any durability claim | a supported database service on 3306 in an isolated environment; migrations run **only** there |
| **No Firebase identity** (`app/invalid-credential`) | MFA factor disable (`503 IDENTITY_DIRECTORY_UNAVAILABLE`) | provider credentials, or an identity-directory test double — `TEST_AUTH_HMAC_SECRET` authenticates requests but supplies no directory |
| **No browser** (Chromium unobtainable) | every `browser e2e` row: contact UI, queue UI, CMS renderer, blog reader UI, billing console, blog/cover-letter editors, marketing interactivity, voice engine | a Playwright Chromium binary; the repo already ships `playwright.audit.config.ts` and `audit-browser-verification.spec.ts` |
| **Enterprise disabled** (`ENTERPRISE_DISABLED`) | `FP-B05` member management runtime, tenant-scoped rows | tenant provisioning + enterprise configuration enabled in a disposable store |
| **Messaging module disabled** (`MODULE_DISABLED`) | employer messaging persistence (`FP-F03`) | `public_config.modules.enableMessagesModule: true` written through a supported settings category (`POST /api/admin/settings/public_config` rejects the payload shape) |
| **No provider credentials** | settlement behaviour for Stripe/PayPal/Razorpay | sandbox credentials — **none are available and none were invented** |
| **No legacy runtime** | any "legacy did X at runtime" claim | the legacy app is not deployable in this environment; legacy evidence is source-only, permanently |

---

## 5. Findings raised by M8B itself

| New finding | Severity | Statement |
|---|---|---|
| **Test-double divergence** | P2 | `InMemoryRepository.getCustomPageBySlug` / `getCustomPages` ignore their `options` argument, while `MySQLRepository` applies `WHERE published = 1`. Any acceptance run in in-memory mode **cannot validate CMS visibility**, and can produce a *false pass* or a *false product defect*. Recorded as DISC-056 |
| **Corpus attribution defect** | P2 | 53 rows measure bare directories; 18 rows share 8 corpora; 1.86× double counting. `M8B-FP-A14-FP-A15-RECONSTRUCTION.md` |
| **`SUPPORTED` without evidence** | P2 | `parity-endpoint-audit.cjs:105-108` grades rows with zero endpoints `SUPPORTED`; 3 `FULL` rows affected (`FP-C06`, `FP-E04`, `FP-E13`) |
| **Proposed-ID collisions** | P2 | M8A issued `FP-G22`/`FP-G23` which already existed; corrected to `FP-G26`/`FP-G27` |
| **Register schema non-uniformity** | P3 | only 23 of 55 findings carry a `Verification status`; the other 32 have no recorded evidence class. No closure state is recorded at all — only `Closure condition` (closes-when) |
| **Profile CAS inconsistency** | P3, unresolved | create at `expectedRevision: 0` → `409 STALE_WRITE` while `GET` → `404`. Attribution between product and in-memory double is **not established** |

---

## 6. What should become a separate remediation mandate

This mandate is audit-only and implements nothing. The following are ready to be issued as remediation work,
ordered by risk:

1. **Checkout fabricated success** (`FS-M8A-01`) — fabricates an order number, an invoice number and
   "PAID (Verified Server Entitlement)" on payment failure. Highest risk: it asserts a financial state.
2. **Contact form false success** (`FS-M8A-02` / `FP-G26`) — reports delivery with no request; the backend endpoint
   is complete and unused.
3. **Queue console fabrication** (`FS-M8A-05` / `FP-A20`) — invented SES stack trace with false file:line frames,
   shown precisely when telemetry is down.
4. **CMS renderer disconnection** (`FS-M8A-03` / `FP-G10`) — admin publishing works; the public renderer never
   reads it and unknown slugs serve privacy-policy content.
5. **Blog reader** (`FS-M8A-04` / `FP-G09`) — wrong URL, swallowed error, ignored `:slug`.
6. **Test-double parity** (DISC-056) — make `InMemoryRepository` honour `publishedOnly`, or make acceptance runs
   refuse to assert visibility in in-memory mode. Without this, subsequent runtime evidence carries a known
   false-positive/false-negative.
7. **Corpus re-attribution** — rebuild the 18 shared-corpus rows and the 53 bare-directory rows from
   capability-scoped file lists.
