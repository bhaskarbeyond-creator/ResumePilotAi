# M8A — PARITY REGISTER DELTA

**Source revision:** `888c2e5`
**Status:** **PROPOSED — NOT APPLIED.** This mandate was instructed to prove claims from source before changing
severity labels or registers. No row in `CAPABILITY-SUBFEATURE-REGISTER.md`, `FEATURE-PARITY-MATRIX.md`,
`feature-parity.json` or `capability-subfeatures.json` was edited by M8A.

**Rule enforced:** existing IDs are preserved. New IDs are issued only for genuinely distinct findings. Merges and
narrowings are recorded rather than double-counted.

---

## 1. New rows (5)

| New ID | Capability | Domain | Proposed classification | Evidence anchor |
|---|---|---|---|---|
| `FP-A27` | Master Profile career repository — 11 sections, per-section ATS gap engine, actionable tips | Admin/candidate settings | `MISSING` (backend yes) | `DashboardSettings.jsx:327,67-253,270,5348,93,98` vs `settings.tsx:26,28-33` + `account-settings.ts:39-52`; `computeGaps`/`atsTip` = 0 hits in `frontend/src` |
| `FP-A28` | Bidirectional resume ⇄ profile sync | Candidate | `PARTIAL PARITY` | `SyncProfileModal.jsx:1-40` vs `resume-builder.tsx:3867-3897`; no section push |
| `FP-A29` | Candidate billing / subscription console | Candidate | `MISSING` (backend yes) | `SubscriptionModal.jsx:9,68-72,162-232`, `platform.js:356-368` vs `account-panel.tsx:53,240`; `/api/payment-orders` = 0 modern refs |
| `FP-G22` | Contact form false success | Growth | `MOCK / FABRICATED STATE` | `cms/index.tsx:234-247` vs working `index.js:2360-2385` |
| `FP-G23` | Cover-letter rich-text editing | Candidate | `MISSING` | `SimpleTextarea.jsx:4,7-9` + `ActionCoverFilling.jsx:122` vs `cover-letter-builder.tsx:33,903,918,966`; no lexical dependency |

**Why not merged into existing rows:** `FP-A24` covers *public* pricing/checkout, `FP-A14`/`FP-A15` cover *admin* coupon
and refund surfaces. None of them covers a candidate-facing console, so `FP-A29` is distinct rather than duplicate.
`FP-A27`/`FP-A28`/`FP-G22`/`FP-G23` have no plausible existing parent.

---

## 2. Corrections to existing rows (12)

| Row | Current | Proposed action | Rationale (source) |
|---|---|---|---|
| `FP-A14` | `MISSING` · `EQUIVALENCE_LEAD` · legacy 35 / modern 0 | **RE-MEASURE — evidence invalid** | Subfeature table is **numerically identical** to `FP-A15` (`14/10/28/100/18/1/10/5/87`). Two unrelated capabilities cannot share a measured distribution. At least one row is a template clone. |
| `FP-A15` | `MISSING` · `EQUIVALENCE_LEAD` · legacy 35 / modern 0 | **RE-MEASURE — evidence invalid; keep classification** | Same duplicate. The *classification* is corroborated independently (`subscriptionsSettings.jsx` 2,993 lines vs no modern operator UI), but the *table* is not a measurement. |
| `FP-G19` | `PARTIAL PARITY` · `SIGNAL_CLEAN` · "legacy 0 handlers / 0 labels" | **CORRECT to evidence-backed loss** | `DashboardSettings.jsx:487,1077-1100` and `platform.js:1337-1352` are a real TOTP enrolment surface. `filtering`/`pagination` subfeature classes marked `present` are parser artifacts, not TOTP provisioning. Also record `platform.js:1399` login-history stub. |
| `FP-G08` | `PARTIAL PARITY` · `NO_CHANGE` · `ADJUDICATED` | **ADD limitation** | Modern factor list/disable real and audit-logged; **enrolment/QR/recovery absent**. `ADJUDICATED` overstates confidence for a row that omits enrolment. |
| `FP-G10` | `PARTIAL PARITY` · `SUBFEATURE_LOSS` | **RECLASSIFY toward false-success** | Renderer performs **no fetch** (`cms/index.tsx:38`) and falls back to privacy-policy (`:148`) while admin CRUD exists (`index.js:6621,6630,6658`). Disconnected API + wrong-content display. |
| `FP-G09` | `MISSING` · `SUBFEATURE_LOSS` | **SPLIT into 3 findings + authoring regression** | Reader: wrong URL `/blog/posts`, swallowed error, ignored `:slug`. Authoring: Tiptap → textarea (`BlogEditor.jsx:827-984` vs `editor.tsx:290,352`). API availability is separate. |
| `FP-G11` | `PARTIAL PARITY` · legacy **3** files / modern 3 | **RECOUNT** | Legacy marketing set is **15** `.jsx` components. Four stateful modules lost into a **0-`useState`** landing page. The file count is wrong by 5×. |
| `FP-B05` | `PARTIAL PARITY` · `NO_CHANGE` · `ADJUDICATED` | **ADD subfeature loss** | Backend member add/remove exists with `workspace.members.manage` gates (`enterprise.js:729,738`); modern UI has no member surface. Team management itself is present — do not widen to "teams missing". |
| `FP-F03` | **`MOCK / FABRICATED STATE`** | **DOWNGRADE the claim** | Legacy used real `createConversation`/`sendMessage` (`SendMessageDialog.jsx:5`); backend persists 6 `/api/messages` routes. `MOCK` is unsupported. Narrow to the missing employer-side initiation entry point. |
| `FP-A20` | `PARTIAL PARITY` · `DEEP_READ_M6` | **ADD 5 defects** | Fabricated SES stack trace (`AdminQueuesTab.tsx:67-69`); hardcoded baseline retained after failed load (`:154-156`); retry has no failure path (`:164-196`); purge now **410** (`platform.js:543`); fallback `/admin/queues` does not exist. |
| `FP-G21` | `PARTIAL PARITY` · `SUBFEATURE_LOSS` | **ADD TTS subfeature** | `LiveVoiceEngine.js:54-209` speechSynthesis voice selection and pacing is lost and is named by **no** row. |
| `FP-D02` | `MISSING` · `EQUIVALENCE_LEAD` · modern 0 | **UPGRADE provenance to adjudicated** | Repo-wide search for `getUserMedia\|AudioContext\|SpeechRecognition\|speechSynthesis\|MediaRecorder` in `frontend/src` returns **0**. Absence is proven, not a lead. |

---

## 3. No change (2)

| Row | Why no change |
|---|---|
| `FP-B08` | Claim C2 (SIEM JSON + deep links) is **falsified**. Legacy export is `text/csv` only (`AdminAuditLogs.jsx:100`). The row's CSV framing is accurate. Record the falsification so the claim is not re-raised. |
| `FP-A24` | Public pricing/comparison/checkout is covered; the dossier's A3 concerns the *candidate console*, which is issued as `FP-A29` rather than overloading this row. |

---

## 4. Duplicate handling — explicit

| Candidate duplicate | Resolution |
|---|---|
| D1 (admin financial back-office) vs `FP-A15` | **MERGED.** D1 adds no new finding. Bucket **4**, not a new row. |
| A3 (candidate billing) vs `FP-A24`/`A14`/`A15` | **NOT merged.** Different actor (candidate vs admin) and different surface. Issued as `FP-A29`. |
| B3 reader defects vs `FP-G09` | **NOT a new capability** — recorded as three defects *inside* the corrected `FP-G09`. |
| D3 authoring vs `FP-G09` | **SPLIT** from the reader defects; one row may not carry two independent losses with different provenance. |
| C1 members vs `FP-B05` | **NOT a new row** — subfeature loss added to `FP-B05`. |

**Double-count check:** no capability is counted in both a new row and a corrected row. Every new ID has a distinct
actor-and-surface, verified against the existing register before issuance.

---

## 5. Effect on totals — recorded, **not applied**

| Dimension | Now | After corrections |
|---|---:|---:|
| Rows | — | **+5** |
| Rows re-opened from `ADJUDICATED` | — | **2** (`FP-A14`, `FP-A15`) |
| Classifications changed | — | **3** (`FP-G10` → false-success, `FP-F03` → narrowed, `FP-D02` → adjudicated) |
| Parity histogram | 13 FULL / 51 PARTIAL / 28 MISSING / 12 MOCK / 5 REPLACED / 3 UNVERIFIED = 112 | recalculated **from registers**, not hand-set |
| Findings | 53 / 55 IDs | unchanged by evidence work |
| Coverage | 1,544 | unchanged until registers are edited |

**No expected count was altered to make any verifier pass.** The five new findings (`FP-A27`, `FP-A28`, `FP-A29`,
`FP-G22`, `FP-G23`) and the twelve corrections are evidence obligations for the correction step, not a re-scoring.

---

## 6. False-success ledger additions

| ID | Surface | Layer |
|---|---|---|
| `FS-M8A-01` | Checkout fabricates order/invoice numbers and PAID status on failure | modern |
| `FS-M8A-02` | Contact form reports success with no request | modern |
| `FS-M8A-03` | CMS renders hardcoded content and serves privacy-policy for unknown slugs | modern |
| `FS-M8A-04` | Blog reader swallows 404 into a permanent empty state | modern |
| `FS-M8A-05` | Queue console renders fabricated SES trace and stale baseline after failed load | modern |

Cross-reference: `M8A-FALSE-SUCCESS-AND-MOCK-DATA.md`. These extend, and do not replace, the 12 sites / 11 paths already
recorded in the false-success inventory.
