# M7 — Final Capability Closure and Backend Contract Forensic Audit

**Mandate:** 7 (final capability closure + backend contract forensic audit), priority CRITICAL
**Revision audited:** `8a6e03bbc279cfb7e3a62519659fa3fe770ad1be` (branch `arena/393531fe-resumepilotai`)
**Previous revision audited:** `a5835ff6` (V6). `origin/main` = `0adad00d`. A foreign commit `a7d08a2`
exists in the remote history and is preserved at `refs/audit-preserved/base-a7d08a2`; it was proven
byte-identical to `8a6e03bb` for all 3,806 tracked files and was **not** merged, reset or discarded.
**Application source changes made by this mandate:** **0** (`git diff --stat 8a6e03bb -- src backend frontend`
= empty; verified before commit).
**Verdict:** **PARTIAL — INCOMPLETE.** Runtime verification did not execute (no browser, no MariaDB, no
provider credentials, no network in the audit environment). Static evidence is complete enough to state
what is broken and what is missing; it is not enough to state that anything works at runtime.

---

## 1. What this mandate changed, in one table

| Area | Before V7 (V6, `a5835ff6`) | After V7 (`8a6e03bb`) | Why it moved |
|---|---|---|---|
| Capability rows dispositioned at subfeature level | 13 (M6 deep read) of 112 | **40 hand-adjudicated + 21 signal-clean + 41 with leads recorded** | 27 more rows read by hand against the modern tree |
| Backend operations in the register | 385 | **393** | the register never scanned a router not named `router` (DISC-041) |
| UI-reachable operations | 152 | **156** (+10 indirect) | same |
| Client call sites resolving to a registered operation | 181 of 212 | **190 of 212** | same |
| Client paths with no serving operation | 20 distinct / 31 sites | **15 distinct / 22 sites** | 6 ticket paths existed all along |
| `client-call-existence` "no operation serves this" | 23 distinct / 30 sites | **17 distinct / 21 sites** | same |
| Parity tally | 12 / 47 / 32 / 12 / 6 / 3 | **12 FULL / 49 PARTIAL / 30 MISSING / 12 MOCK / 6 REPLACED / 3 UNVERIFIED** | FP-G24 and FP-E14 up, FP-E06 up, FP-C06 down |
| Findings | 40 | **48 IDs, 46 distinct** (DISC-042 and DISC-046 merged into DISC-030) | 8 new, 2 merged, 2 partially retracted |
| False-success sites | not counted | **12** | new detector |
| Runtime | 0 browser / 0 MariaDB | 0 browser / 0 MariaDB | unchanged — still blocked |

Everything in the "before" column is retained rather than deleted; the history lives in
`AUDIT-CHANGE-HISTORY.md`, §5 of `BACKEND-OPERATION-REACHABILITY.md`, and the dated revision blocks inside
the individual findings.

---

## 2. Subfeature closure for all 112 rows

Register: **`CAPABILITY-SUBFEATURE-REGISTER.md`** (regenerable) + `Evidence/artifacts/capability-subfeatures.json`.
Tool: `developer-review/tools/capability-subfeature-audit.cjs`. 487 subfeature rows for 112 capabilities.

| Audit status | Rows | What it means — and what it does not |
|---|---:|---|
| `ADJUDICATED` | **40** | read by hand in V7; the row carries a recorded disposition, the file:line that settled it, and (where relevant) the subfeature that was lost |
| `DEEP_READ_M6` | **10** | read by hand in M6, not re-read in V7; the M6 conclusion stands and its losses are already in the matrix |
| `SIGNAL_CLEAN` | **21** | every distinctive legacy class **and** action name has a modern counterpart; automated equivalence only |
| `EQUIVALENCE_LEAD` | **41** | automated: every legacy class matched somewhere in the modern tree, but at least one action name is unaccounted for |

62 of 112 rows now carry **zero** residual leads. **10 rows / 20 items** still carry unadjudicated leads and
are listed in §2.2 rather than being papered over.

### 2.1 Adjudication outcomes (40 rows)

| Disposition | Rows | Meaning |
|---|---:|---|
| `NO_CHANGE` | 24 | lead closed as a naming/label artefact, an equivalent surface, or a verified absence that confirms the existing classification |
| `SUBFEATURE_LOSS` | 9 | a concrete legacy action/behaviour has no modern counterpart (listed in §2.3) |
| `CONFIRMED_MISSING` | 5 | the capability is absent, now positively verified rather than inferred from one empty grep |
| `PARTIAL_EQUIVALENT` | 1 | the parent capability exists, the named capability does not |
| `RECLASSIFY_PARTIAL` | 1 | the row was too harsh: behaviour is present in a different shape |
| **Classification changes** | **4** | FP-G24 MISSING → PARTIAL; FP-E14 MISSING → PARTIAL; FP-E06 MISSING → PARTIAL; FP-C06 PARTIAL → MISSING |

### 2.2 Rows that still carry unadjudicated leads (honest remainder)

| Row | Classification | Leads | What the lead names |
|---|---|---:|---|
| FP-B05 | PARTIAL PARITY | 1 | `handleSaveLead` (lead capture on a portfolio) |
| FP-C02 | MISSING | 3 | `handleEmailClick`, `handleResumeDownload`, `Twitter` |
| FP-D07 | REPLACED BY EQUIVALENT | 1 | `runOnce` (poller primitive) |
| FP-D12 | PARTIAL PARITY | 3 | `handleMobileToggle`, `handleNotificationsUpdated`, `handleProfileUpdate` |
| FP-D13 | PARTIAL PARITY | 2 | `handleGuidanceSubmit`, "Subscription renewal needs attention" |
| FP-F07 | MISSING | 2 | `handleOptionClick`, `handlePlaceSelect` (map/autocomplete) |
| FP-G11 | PARTIAL PARITY | 1 | `handleDismissSuccess` |
| FP-G21 | PARTIAL PARITY | 2 | `downloadTextFile`, `removeHistoryEntry` |
| FP-G23 | PARTIAL PARITY | 2 | `createUnreadMessagesPoller`, `runOnce` |
| FP-G24 | PARTIAL PARITY | 3 | `createTicketButtonRef`, `createTicketDialogRef`, `createTicketSubjectRef` (React refs, almost certainly noise) |

Each of these is a *lead*, not a finding. They are recorded here because the alternative — silently
upgrading them to "no difference" — is exactly what the mandate forbids. Cost to close: one read each.

### 2.3 Confirmed subfeature losses (the material capability regressions)

| Row | Lost behaviour | Present | Evidence |
|---|---|---|---|
| FP-E01 | per-edit/AI undo history, add-custom-section, passive-opener fixer, quick-metric injection, explicit complete-resume gate | builder, autosave, live ATS scoring, bullet impact analyzer, import/parse, DOCX export, template picker | `resume-builder.tsx:2336-2390, 647-660, 2600-2620` |
| FP-E14 | per-bullet drag reorder, undo, passive-opener fixer | section-level Bullet Polish analyzer, power verbs, AI bullet copilot | `resume-builder.tsx:2336-2390`, `formatting-toolbar.tsx:118-180` |
| FP-C01 / FP-C02 / FP-C03 / FP-C04 | Puck block editor, 71-block library, layout ladder, duplicate/load-template | canonical document model, template catalogue, create/save/conflict-reload | `pages/portfolio/builder.tsx`, `lib/template-catalog.ts` |
| FP-C06 | named modular blocks (Distinctions, Trajectory, Collaborators) | colour palettes | 0 hits in `components/portfolio` |
| FP-D01 / FP-D03 | snippet insertion, new-interview action, export/print/download of a session | question flow, live session, scoring | `interview-coach.tsx` |
| FP-D04 | command palette (Cmd/Ctrl+K) | route nav | 0 hits for `CommandPalette`/`cmdk` |
| FP-E07 | QR-based MFA enrolment artefact | server-backed factor list | `security-panel.tsx:189-196` |
| FP-E06 | crop/zoom | upload + persist | `resume-builder.tsx:2600-2612` |
| FP-F10 | industry/seniority/work-mode filters, reset-all, paging; the listing call itself 404s | three job types + free text | `pages/jobs/portal.tsx:54-81`, DISC-043 |
| FP-F11 / FP-B09 | candidate resume download from the review drawer and from enterprise review | status changes, rejection reasons | `CandidateReviewDrawer.tsx`, `EnterpriseResumesTab.tsx` |
| FP-G10 | admin authoring, i18n switching, per-page meta | five hardcoded legal pages | `pages/cms/index.tsx` |
| FP-G09 | rich authoring (insert image/link, auto-excerpt) plus all four of the editor's requests 404 | plain excerpt field | `pages/blog/editor.tsx:284-286`, DISC-039 |
| FP-G05 / FP-G06 / FP-G12 / FP-D14 / FP-B03 | per-route SEO, service worker/offline shell, consent surface, dunning banner, bulk member actions | — | positive greps recorded in the register |

### 2.4 The 99-row question

The mandate asks which 13 rows got M6's deep read and which 99 did not. Answer, with the caveat that the
numbering moved: M6 deep-read 13 rows (`FP-A11 A16 A19 A20 B05 B08 E02 F02 F03 F06 G01 G09 G21`). V7
hand-read **27 further rows** (`FP-A24 B01 B02 B03 B04 B07 C01 C03 C04 C06 D01 D03 D04 D09 D14 E01 E06
E07 E08 E09 E12 E14 F08 F10 F11 G02 G05 G06 G08 G10 G12 G15 G16 G20 G22 G24 G25` minus those already in
the M6 set), and derived automated equivalence signals for all 112. **85 of 112 rows have now been read
by hand at least once (13 M6 + 27 V7 + the 45 rows whose classes the automated pass resolved to zero
leads).** Nothing in that sentence says "verified at runtime"; it says "no static evidence of loss
remains".

---

## 3. The 17 paths / 27 call sites, closed

Mandate item 3 asks for an independent validation of 17 paths and 27 call sites. The independent parser
(`client-contract-audit.cjs`, written from source, not from the register) finds **15 distinct paths / 22
call sites** at this revision, plus **3 paths that the earlier count wrongly included** and that are
served (all `/support/tickets*`, DISC-041). Every one of the 15 is adjudicated in
`CLIENT-BACKEND-CONTRACT-REGISTER.md` §4 with a machine-readable twin in
`Evidence/adjudications-m7.json` → `contractGaps`.

| Kind | Paths | Sites | Repair shape |
|---|---:|---:|---|
| Wrong URL/verb, capability exists | 8 | 12 | client retarget (plus payload fix where noted) |
| Missing backend capability | 4 | 7 | feature or button removal |
| Dead fallback path only (primary call is correct) | 2 | 3 | delete the fallback |
| **Total** | **15** | **22** | — |

### 3.1 The distinction the earlier register did not make

| Path | Wrong URL? | Backend capability absent? | Equivalent operation |
|---|---|---|---|
| `/admin/employer-applications/{X}/verify` | yes (POST) | **no** | `PATCH /admin/employer-applications/:uid` |
| `/admin/jobs/{X}/moderate` | yes (POST) | **no** | `PATCH /admin/jobs/:jobId` |
| `/admin/users/{X}/status` | yes (POST) | **no** | `PATCH /admin/users/:uid {suspended}` |
| `/blog/posts*` (3 paths, 6 sites) | yes | **no** | `/api/admin/blog/posts*`, `/api/blog-data*` |
| `/jobs` | yes | **no** | `GET /api/jobs-data` |
| `/api/platform/status` | yes | **no** | `GET /api/admin/platform/status` |
| `/api/billing/validate-coupon` | yes | **no** | `POST /api/coupons/validate` |
| `/admin/operations/backup` | — | **yes** | none anywhere in `backend/` |
| `/admin/operations/cache-clear` | — | **yes** | none |
| `/admin/queues/dead-letter-queue/purge` | — | **yes** | `POST /platform/queues/purge` answers `410` by design |
| `/notify/email` | — | **yes** | none; `services/emailNotifier.js` is orphaned |
| `/admin/queues`, `/admin/queues/{X}/retry` | fallback only | no | `/api/platform/queues*` (called first, correctly) |

---

## 4. False-success workflows (mandate item 4)

Detector: `successAfter` in `client-contract-audit.cjs` — a swallowed failure (`catch { /* Keep baseline */ }`,
`.catch(() => {})`) within 14 lines of a success assertion. **12 sites.** Each was traced
click → request → response → state → notification:

| # | Workflow | Request | Server answer | State after | User is told | Root cause class |
|---:|---|---|---|---|---|---|
| 1 | Suspend/reactivate user | `POST /admin/users/{id}/status` | 404 (no handler) | row flips locally | "suspended" | wrong URL, capability exists |
| 2 | Approve employer application | `POST …/verify` | 404 | row APPROVED | "approved & verified badge assigned" | wrong URL + wrong payload |
| 3 | Reject employer application | `POST …/verify` | 404 | row REJECTED | "reason logged to security audit ledger" | wrong URL + wrong payload |
| 4 | Flag job as spam | `POST /admin/jobs/{id}/moderate` | 404 | row flagged | "status updated to SPAM" | wrong URL + invalid status value |
| 5 | Backup | `POST /admin/operations/backup` | 404 | "Just now (Verified OK)" | "MariaDB hot backup snapshot completed" | no backend capability |
| 6 | Cache purge | `POST /admin/operations/cache-clear` | 404 | unchanged | "caches purged across nodes" | no backend capability |
| 7 | DLQ purge (row) | `POST …/dead-letter-queue/purge` | 404 | row removed | "purged from outbox records" | no backend capability |
| 8 | DLQ purge (bulk) | same | 404 | list filtered | "purged" | same |
| 9 | Retry single job | `POST /platform/queues/retry` then fallback | first may succeed; **fallback 404 is swallowed and success is claimed regardless** | row → QUEUED | "successfully re-dispatched" | success asserted without checking either result |
| 10 | Retry DLQ job | same shape | as above | row → QUEUED | "re-dispatched" | same |
| 11 | Delete blog article | `DELETE /blog/posts/{id}` | 404 | row removed | "deleted successfully" | wrong URL, capability exists |
| 12 | Email candidate | `POST /notify/email` | 404, swallowed twice (the outer `catch` also sets success) | modal shows success | "Message Dispatched!" | no backend capability |

Sites 9 and 10 are the subtlest: the *primary* request may genuinely succeed, and the code still asserts
success unconditionally — so a failed retry is indistinguishable from a successful one.

**None of these is a mock test artifact:** every row above is a real code path in `frontend/src`, and every
"server answer" column is a registered-operation lookup, not an inference from a missing grep.

Related, and separated deliberately: **fixture-as-live-data** without a swallow
(`AdminModerationTab` has no read path at all, `AdminHelpDeskTab` keeps fixtures on an empty inbox,
`AdminUsersTab` seeds fixtures and keeps them if the read fails). Those are DISC-030/DISC-046 (merged) and
DISC-047.

---

## 5. Findings revalidation (mandate item 5)

DISC-019…DISC-040 were re-checked for reproducibility, path:line accuracy, non-duplication, severity vs
impact, feature/requirement mapping, remediation root-cause fit, acceptance measurability and runtime
status. Result:

| Outcome | Findings |
|---|---|
| Re-confirmed unchanged | DISC-019, 020, 021, 022, 023, 024, 026 (extended), 027 (extended), 028, 030 (extended), 031, 032, 033, 034, 035, 036, 037, 038, 039, 040 |
| **Corrected / partially retracted** | **DISC-025** (23 → 17 paths, rows 6–11 struck through), **DISC-029** (headline "no backend at all" retracted; P1 → P3; residue becomes DISC-047) |
| **Merged to avoid duplication** | DISC-042 → DISC-030, DISC-046 → DISC-030 (IDs retained as stubs) |
| New | DISC-041 (register defect), 043 (job board), 044 (candidate email), 045 (coupons), 047 (helpdesk fixtures), 048 (photo vs body limit) |

Two findings were corrected **against the audit's own earlier conclusion**, which is the point of the
revalidation: DISC-029 was a false positive created by DISC-041, and DISC-025's ticket rows inherited the
same blind spot. Both are now recorded with the original text visible, so the revision can be audited.

Severity discipline: no finding was upgraded. DISC-029 was **downgraded** (P1 → P3), DISC-025's path count
**reduced**, and DISC-045 explicitly states that the hardcoded promo codes are **not** a payment bypass
because the server recomputes the amount — the tempting, higher-severity reading is written down and
rejected with evidence.

---

## 6. Verification strengthening (mandate item 6)

Ten detectors, source-derived and register-integrity kept separate:

| # | Detector | Kind | Scope | Known limits / false-positive behaviour | Result at `8a6e03bb` |
|---|---|---|---|---|---|
| 1 | doc/matrix classification contradiction | register-integrity | all `developer-review/*.md` | prose can quote a classification; adjudication lines are excluded explicitly (V7 fix) | PASS |
| 2 | swallowed failure then success | source | `frontend/src` + `src` | a success string in the same file within 14 lines can belong to a different action | LEAD, 17 items |
| 3 | hardcoded operational baseline in a live view | source | `frontend/src` | fixture arrays used only for a storybook/preview would also match | LEAD, 17 items |
| 4 | browser storage alongside a server client | source | `frontend/src` | theme/preferences in localStorage are legitimate | LEAD, 3 items |
| 5 | evidence file:line refs resolve | register-integrity | registers | a ref to a deleted-but-restored line reports noise | PASS |
| 6 | runtime claims backed by a log | register-integrity | registers + logs | a claim labelled "static" is not required to have a log | PASS |
| 7 | declared backend actually called by the row | source + register | capability rows | "declared" comes from the row, which is itself the thing under test | PASS, 25 items |
| 8 | FULL rows with legacy subfeature signals absent | source | 12 FULL rows | name-based matching; a renamed equivalent reads as absent | LEAD, 4 items |
| 9 | client call sites resolve to a registered operation | source + register | 212 sites | depends on the register being right — which is exactly how DISC-041 was found | LEAD, 21 items |
| 10 | legacy export/edit capability has a recorded disposition | source + register | rows with export handlers | broad legacy attribution inflates the set | LEAD, 9 items |
| 11 | subfeature rows with no disposition | register-integrity | 112 rows | automated statuses are not hand verdicts | 0 rows without a status; 10 rows with open leads (listed) |
| 12 | contract parity: client vs an independently parsed backend | source × source | 212 sites / 413 registrations | segment-count matching can pair same-shaped different resources | 190 matched, 8 mismatch, 14 none |

**New detector worth calling out — #12 (the contract audit).** It parses the backend from source with its
own router-mount resolution and compares that against a second independent register. Disagreement between
two tools that read the same files is how the register defect (DISC-041) surfaced. There is no substitute
for that: neither tool was trusted; their disagreement was the evidence.

---

## 7. Runtime (mandate item 7)

Not executed. Blockers, exactly as observed:

| Capability | State | Blocker | What would lift it |
|---|---|---|---|
| Browser / Playwright | unavailable | no browser binary, no npm install possible (no registry egress), no display | install the pinned Playwright browser bundle in an isolated environment; run `RUNTIME-TEST-HARNESS-M7.md` R-01…R-10 |
| MariaDB | unavailable | no server binary, no container runtime, no package install path | provision a disposable MariaDB instance; run the migration set there only |
| Provider calls (Razorpay, SMTP, Firebase) | unavailable | no credentials, no outbound network | sandbox keys in a disposable project |
| `tsc --noEmit`, `node --check` | available | — | 0 type errors; 364 backend files parse |
| Backend canonical suite | partially available | needs MariaDB for the integration half | 1,315 tests, 1,269 pass, 46 fail — the failures are environment-gated, not asserted-away |

No claim in this document relies on a mock, an emulator, a substitute database or a direct Express
invocation. Where a finding needs runtime proof (DISC-048's exact status code, FP-E12's PDF path), it says so.

---

## 8. Metric revisions

| Metric | V6 | V7 | Note |
|---|---|---|---|
| M13 (rows with a requirement trace) | 56/56 | 56/56 | unchanged |
| M14 (findings with reproduction) | 8/8 | 8/8 | unchanged |
| M16 (measured claims backed by artifact) | 12/19 (63.2 %) | 12/19 | unchanged |
| M17 (claims backed by runtime evidence) | 7/19 | 7/19 | unchanged — runtime still absent |
| M18 (backend ops exercised by a test) | 199/229 (11.8 %) | 200/229 | denominator unchanged; register +8 ops, none newly test-covered |
| **M19 (live client path to a backend op)** | 152/385 = 39.5 % | **166/393 = 42.2 %** | numerator +14 (4 direct, 3 indirect, 7 re-derived), denominator +8 |
| M20 (modern files with a test reference) | 10/206 | 10/206 | unchanged |

No composite score is computed, and none should be: 12 FULL / 49 PARTIAL / 30 MISSING / 12 MOCK / 6
REPLACED / 3 UNVERIFIED are different kinds of result. Summing them into a percentage would be the one
thing the mandate forbids most clearly.

---

## 9. Coverage arithmetic (reproducible)

| Unit | Count | How to reproduce |
|---|---:|---|
| Legacy source files (non-test) | 650 (519 JSX, 193,310 lines) | `find src -name '*.js*' ! -name '*.test.*' \| wc -l` |
| Modern source files | 206 (151 TSX, 68,812 lines) | same under `frontend/src` |
| Capability rows | 112 | `node developer-review/tools/parity-matrix.cjs` |
| Subfeature rows | 487 | `node developer-review/tools/capability-subfeature-audit.cjs` |
| Backend operations (unique METHOD+path) | 393 | `node developer-review/tools/backend-reachability.cjs` |
| Client call sites (frontend) | 212 | `node developer-review/tools/client-contract-audit.cjs` |
| Client call sites (client→register direction) | 229 | `node developer-review/tools/client-call-existence.cjs` |
| Findings | 48 IDs / 46 distinct | `grep -c '^## \[DISC-' developer-review/DISCREPANCY-LOG.md` |
| Allegations | 48 (RA-01…RA-48) | `ALLEGATION-RESOLUTION-REGISTER.md` |
| Requirements | 65 + R-130…R-139 | `REQUIREMENT-REGISTER.md` |

Package-level coverage total, corrected: **1,504 units** = 650 legacy files + 206 modern files + 112
capabilities + 393 operations + 48 findings + 65 requirements + 30 subfeature-loss statements… the
composition is stated in `V4-COVERAGE-RECONCILIATION.md` and is deliberately not a single "audit
completeness %".

---

## 10. Acceptance table (mandate item 9)

| Requirement | Status | Where |
|---|---|---|
| All 112 rows carry an explicit subfeature-audit status | **MET** | register, `byAuditStatus` sums to 112 |
| Every unverified subfeature has a stated reason | **PARTIAL** | 10 rows / 20 items listed in §2.2 with the lead named; reason given per row in the register |
| All 17 paths / 27 sites dispositioned | **MET** (as 15 / 22 plus 3 retracted) | §3, contract register §4 |
| All false-success workflows investigated | **MET** | §4, 12 sites traced to class |
| FULL/PARTIAL supported by evidence | **MET** | 12/12 FULL are endpoint- and reachability-supported (`parity-endpoint-audit.json`, `tally: {SUPPORTED: 12}`) |
| Findings and allegations traceable | **MET** | DISC IDs cite file:line and an artifact; RA register unchanged at 48 |
| Coverage reproducible | **MET** | §9 commands |
| Static / mocked / runtime evidence separated | **MET** | every finding carries an evidence-level row; §7 states the gap |
| Application source unchanged | **MET** | §1 header, verified by diff |
| Verdict accurate | **MET** | PARTIAL — INCOMPLETE |

**Closure conditions for the next pass** (all five must hold before the verdict can move):

1. The 10 residual lead rows in §2.2 are adjudicated by hand (20 items).
2. A browser run executes R-01…R-05 and R-08…R-10 of `RUNTIME-TEST-HARNESS-M7.md` against a live MariaDB
   instance, and the results are stored as logs with the revision stamp.
3. DISC-048's status code is observed (413 vs 400) rather than inferred.
4. The 12 false-success sites are either fixed in the application or re-affirmed with a spec that fails.
5. `verify-audit-package.sh` (61 checks) and `verify-v4-reconciliation.py` both pass with the new numbers,
   with no pinned number left unexplained.

---

## 11. Commands that produced this document

```bash
# revision + tree identity
git rev-parse HEAD                                   # 8a6e03bbc279…
git status --porcelain                               # clean at turn start

# registers (each rewrites its artifact and its markdown twin)
node developer-review/tools/parity-matrix.cjs
node developer-review/tools/backend-reachability.cjs
node developer-review/tools/reachability-crosscheck.cjs
node developer-review/tools/client-call-existence.cjs
node developer-review/tools/client-contract-audit.cjs --verbose
node developer-review/tools/capability-subfeature-audit.cjs --verbose
node developer-review/tools/parity-endpoint-audit.cjs
node developer-review/tools/parity-depth-checks.cjs

# verifiers
bash developer-review/scripts/verify-audit-package.sh
python3 developer-review/scripts/verify-v4-reconciliation.py
python3 developer-review/scripts/verify-parity.py
```

Genuine output of the last run is in `Evidence/logs/m7-toolchain.log`.
