# Feature-Depth Evidence Register (V6)

**Audit revision:** branch `arena/393531fe-resumepilotai`, V5 head `a5835ff6693d272505a4e1dfdd3a8faa95b824c4` (V6 works on top of it; every V6 finding is recorded against that revision in §3–§5).
**Comparison checkpoint:** `cccd35a5dac62efa5ead2c309a0fc60b201f9b08` (still an ancestor of HEAD).
**Mode:** read-only. Application source, manifests, lockfiles, deployment config and DB schema are **untouched** by this pass; `git diff --stat` over the whole branch outside `developer-review/` is **0 files**.
**Generator of record:** `developer-review/tools/parity-matrix.cjs` (capability rows) + `developer-review/tools/parity-depth-checks.cjs` (depth detectors) + `developer-review/tools/parity-endpoint-audit.cjs` (endpoint support).

This register exists because a capability row is an *aggregate*, and an aggregate can hide a removed subfeature. Every row below is traceable in five steps: **legacy source → modern UI → backend operation → persistence → test/verification level**. Rows are keyed by stable finding IDs (`RA-nn` for allegation adjudications, `DISC-nn` for defects); no prior row was renumbered or deleted.

---

## 1. Method and evidence levels

| Level | Meaning | Used for |
|---|---|---|
| `L1 STATIC` | Source read at the cited line, both trees | every row in §3 |
| `L2 CALLCHAIN` | Request path traced from UI call site → client helper → route registration → handler | §3 rows with a backend column |
| `L3 PERSISTENCE` | Traced to a table/repository write, or explicitly shown to be memory-only | §3 "persistence" column |
| `L4 RUNTIME` | Executed in this sandbox | **not achieved for the browser** (no MariaDB, no Playwright; see §8) |

Rules that govern every row:
- **Behaviour, not names.** A component with the old name and no behaviour counts as absent (e.g. `AdminHelpDeskTab` renders a ticket list with no ticket backend).
- **A route definition is not a capability.** Presence in the register says a handler exists; it says nothing about reachability, authorization or whether a client calls it.
- **A mock is not a workflow.** Data seeded from `DEFAULT_*`/`INITIAL_*` arrays and rendered as live is recorded as fabricated, not partial.
- **Absence of a retirement decision ≠ retirement.** `INTENTIONAL RETIREMENT` remains applied **zero** times; nothing in the repository (ADR, changelog, commit message) documents these removals.
- **Unverified stays unverified.** Where the browser could not be exercised, the row says so rather than inferring success.

---

## 2. Dispositions

### 2.1 The eight mandated allegations

| # | Allegation | Disposition | Row | Evidence anchor |
|---|---|---|---|---|
| 1 | `FP-B05` teams member drawer removed | `CONFIRMED — absent` | PARTIAL (was FULL) | legacy drawer `src/enterprise/components/EnterpriseTeamsTab.jsx:9-145`; modern tab has `memberCount` only `EnterpriseTeamsTab.tsx:223`; backend members routes alive `backend/routes/enterprise.js:720/729/738` |
| 2 | `FP-B08` audit JSON export / cursor / deep links removed | `CONFIRMED — narrowed` | PARTIAL (was FULL) | legacy JSON export `EnterpriseAuditTab.jsx:174-178`, deep link `:184-200`, cursor `:140/159`; modern single fetch `limit:100` `EnterpriseAuditTab.tsx:42`, client-side filter `:55-63`, CSV only `:85-92` |
| 3 | `FP-A20` hardcoded queue jobs + error swallowing | `CONFIRMED — partially` | PARTIAL (unchanged) | real list `platform.js:465-495`; fixtures `AdminQueuesTab.tsx:48,55-105`; `catch { /* Keep baseline */ }` `:158-160`; DLQ purge/retry to unregistered paths `:204-212, 262-268, 285-290` |
| 4 | `FP-E02` 51 CV templates collapsed to 5 archetypes | `CONFIRMED` | PARTIAL (was FULL) | 51 dirs + 4 covers, 55 `.scss`, 13,041 JSX / 19,655 SCSS; modern 100 ids over 5 archetypes (`template-catalog.ts`), 19 families (`template-layouts.ts:155-161`), 6 bespoke specs (`:233`), 3,254 lines total |
| 5 | `FP-F03` employer messaging fixtures | `CONFIRMED — scoped` | MOCK (was PARTIAL) | fixtures `pages/employer/portal.tsx:145-185`, state-only send `:233-247`; real client `lib/messages.ts` used only by `pages/dashboard/messages.tsx` |
| 6 | `FP-G09` TipTap editor replaced by Markdown textarea | `CONFIRMED` | MISSING (unchanged) | legacy 1,631 lines, 12 TipTap extensions `BlogEditor.jsx:3-15`; modern `<textarea>` `pages/blog/editor.tsx:268/290-293/352`; whole blog path `/blog/posts` unregistered |
| 7 | `FP-A16` SMTP/IMAP/template editors/bounce logs removed | `CONFIRMED` | PARTIAL (unchanged) | legacy 1,839 lines / 5 tabs `EmailSmtpSettings.jsx:29`; modern 348 lines / 4 operations `AdminEmailSmtpTab.tsx:75-114`; 8 email operations SERVER-ONLY |
| 8 | `FP-G21` voice interview coach removed | `CONFIRMED — total` | PARTIAL (was FULL) | legacy 2,432 audio lines (`LiveVoiceEngine.js` 233, `LiveAudioWaveform.jsx` 254, `LiveInterviewSession.jsx` 1,691, `useInterviewMedia.js` 254); modern audio-API hits in `frontend/src`: **0** |

### 2.2 Additional downgrades found by the sweep (not alleged)

| Row | Was | Now | Why |
|---|---|---|---|
| `FP-F06` Company profile + team seats | FULL | PARTIAL | `TeamSeats.tsx:36/74` seeds `INITIAL_TEAM`; invite appends to state only, no HTTP call, success message shown |
| `FP-G01` Cuba shell a11y | FULL | PARTIAL | Cmd/Ctrl+K palette (787 legacy lines) has no modern counterpart; mobile drawer lost Escape, focus trap and focus restore |
| `FP-F02` Applicant pipeline | FULL | PARTIAL | pipeline + stage PATCH real; drawer email POSTs unregistered `/notify/email` and reports success; hiring preferences are state-only |
| `FP-A19` Support / help-desk | PARTIAL | MOCK | no ticket backend exists at all; fixtures rendered as live, replies "sent" |
| `FP-A11` Moderation queue | PARTIAL | MOCK | queue is a fixture; verify/moderate POST to unregistered paths and show success |

Resulting mix (112 rows): **12 FULL · 47 PARTIAL · 32 MISSING · 12 MOCK/FABRICATED · 6 REPLACED · 3 UNVERIFIED**. Per domain: A 26 (0/9/6/11), B 11 (2/8/1), C 7 (2/1/4), D 15 (1/6/7/1R), E 17 (5/8/3/1U), F 11 (1/6/2/1M/1U), G 25 (1/9/9/5R/1U).

---

## 3. Subfeature evidence rows

Each table row is one user-visible subfeature. "Test" records how the claim was checked, never a test that was not run.

### 3.1 `FP-B05` — Team member management (RA-36)

| Subfeature | Legacy | Modern | Backend op | Persistence | Verdict | Test |
|---|---|---|---|---|---|---|
| List teams | `EnterpriseTeamsTab.jsx` | `EnterpriseTeamsTab.tsx` list | `GET /enterprise/teams` | MariaDB via repository | present | L1/L2 |
| Create / rename team | same | same | `POST/PATCH /enterprise/teams` | persisted | present | L1/L2 |
| Archive / restore | absent in legacy | `archiveTarget` flow | `POST /{id}/archive`, `/{id}/restore` | persisted | **modern exceeds legacy** | L1/L2 |
| List team members | `:13` drawer `:9` | — | `GET /enterprise/teams/{id}/members` (UNREACHABLE) | n/a | **removed** | L1/L2 |
| Add member | `:36` (permission-gated `:12`) | — | `POST /{id}/members` (UNREACHABLE) | n/a | **removed** | L1/L2 |
| Remove member (confirm) | `:62` | — | `DELETE /{id}/members/{principal}` (UNREACHABLE) | n/a | **removed** | L1/L2 |
| Member count badge | — | `:223` `t.memberCount` | from team payload | read-only | present | L1 |

Note: workspace membership *is* still manageable in the modern tree through `enterpriseApi.updateMembership` (`EnterpriseWorkspacesTab.tsx:83-110`), which is why `FP-B06` is **not** downgraded — the equivalent exists via a tenant-level route, not the workspace-members subresource. A count is not a substitute for assign/remove on teams, where no equivalent exists.

### 3.2 `FP-B08` — Enterprise audit trail (RA-37)

| Subfeature | Legacy | Modern | Backend op | Persistence | Verdict | Test |
|---|---|---|---|---|---|---|
| Read events | `:159` | `:42` `limit:100` | `GET /enterprise/audit` | read | present | L1/L2 |
| Server-side filters (severity/action/actor/date) | `:128-142` | client-side on one page `:55-63` | supports `severity,action,actor,since,until` `enterprise.js:652-662` | read | **removed (server filters unused)** | L1/L2 |
| Cursor pagination / Load more | `:140/159/165` | — | `cursor` supported | read | **removed** | L1/L2 |
| CSV export | `:206` | `:85-92` (formula-injection safe) | client-side | n/a | present, improved | L1 |
| JSON export | `:174-178` | — | n/a | n/a | **removed** | L1 |
| Shareable deep link | `:184-200` | — | n/a | n/a | **removed** | L1 |

Consequence: the visible set is the newest 100 events; anything older is unreachable in the UI even though the API can serve it, and a compliance export cannot be reproduced from a link.

### 3.3 `FP-E02` — Template catalogue (RA-39)

| Property | Legacy | Modern | Verdict | Test |
|---|---|---|---|---|
| Template directories | 51 `cvN` + 4 `coverN` | 100 catalogue ids | ids preserved | L1 (parse) |
| Structural archetypes | 51 bespoke layouts | 5 (`modern-split` 26, `minimal-ats` 21, `executive-banner` 20, `tech-grid` 20, `compact-euro` 13) | **reduced 51 → 5** | L1 |
| Layout families | per-template SCSS | 19 families `template-layouts.ts:155-161` | reduced | L1 |
| Bespoke per-template layouts | 51 | 6 `SPECIAL_SPECS` (`Cv1,Cv4,Cv25,Cv34,Cv40,Cv51`) | **reduced** | L1 |
| Styling volume | 55 SCSS / 19,655 lines | 3,254 total modern template lines | reduced | L1 (`wc -l`) |
| Cover-letter templates | `cover1..4` dirs | 4 inline letter templates in `cover-letter-builder.tsx:147-370`; **0** cover entries in the catalogue | equivalent rendering, outside catalogue | L1 |
| Render/export per id | per-template route | single renderer, all ids resolve | present | L1 |

The allegation said "51 templates became 5". Precisely: 100 ids remain and every id renders, but they are generated from **5 structures × 19 families**, so distinct *designs*, not distinct *entries*, collapsed.

### 3.4 `FP-A16` — Email administration (RA-40)

| Subfeature | Legacy (`EmailSmtpSettings.jsx`) | Modern (`AdminEmailSmtpTab.tsx`) | Backend op | Reachability | Verdict |
|---|---|---|---|---|---|
| SMTP host/port/user/password | `:29` tab `smtp` | `:75` GET settings | `GET /email/admin/settings` | UI-REACHABLE | present |
| Save SMTP | same | `:89-95` POST | `POST /email/admin/save-smtp` | UI-REACHABLE | present |
| Test connection | `:95-98` | `:98-104` | `POST /email/admin/test-connection` | UI-REACHABLE | present |
| DNS deliverability | present | `:76` GET | `GET /email/admin/deliverability` | UI-REACHABLE | present |
| Inbound IMAP config + test | `:52-68`, tab `imap` | — | `POST /email/admin/test-imap` `email.js:1930` | SERVER-ONLY | **removed from UI** |
| Transactional template toggles (~20) | `:69-92` | — | `POST /email/admin/save-template-customization` `:1515` | SERVER-ONLY | **removed** |
| Template editor / custom templates | tab `templates` | — | `GET/POST /email/templates` `:2087-2088`, `/admin/custom-templates` `:1516` | SERVER-ONLY | **removed** |
| Desktop/mobile preview + category filter + search | `:100-104` | — | n/a (client) | n/a | **removed** |
| Outbox / bounce logs, resend | tab `logs` | — | `GET /email/logs` `:2034`, `/email/resend` | SERVER-ONLY | **removed** |
| Circuit breaker status/reset | tab `deliverability` | — | `:1420`, `:1433` | SERVER-ONLY | **removed** |

The modern tab's own header (`:5-10`) documents that `/api/admin/email/*` must not be used; that explains the routing, not the missing 8 subfeatures.

### 3.5 `FP-G21` — Interview coach (RA-41)

| Subfeature | Legacy | Modern | Verdict |
|---|---|---|---|
| Question generation | `roleInterviewGenerator.js` | `interview-coach.ts:176` `POST /generate-interview` | present |
| Live session + turns | `LiveInterviewSession.jsx` (1,691) | `/live-interview/sessions*` typed UI | present (text) |
| Speech synthesis with voice ranking | `LiveVoiceEngine.js:118-209` | none | **removed** |
| Microphone capture + recording | `hooks/useInterviewMedia.js:1-254` | none | **removed** |
| Waveform / level meter | `LiveAudioWaveform.jsx` (254) | none | **removed** |
| Built-in practice bank | `interviewCoach.js` | `PRACTICE_BANK:132`, `CBT_BANK:197-233` | present (fixtures by design, labelled practice) |
| Audio API usage in modern tree | — | `SpeechRecognition|MediaRecorder|getUserMedia|speechSynthesis|AudioContext` → **0 hits** | — |

### 3.6 `FP-G09` — Blog authoring (RA-38)

| Subfeature | Legacy `BlogEditor.jsx` (1,631) | Modern `pages/blog/editor.tsx` (461) | Verdict |
|---|---|---|---|
| Rich text | TipTap StarterKit | `<textarea>` + "Markdown supported" `:268, :290-293` | **removed** |
| Tables | Table/Row/Header/Cell `:3-15` | — | **removed** |
| Images / cover upload | Image ext + cover flow | second `<textarea>` `:352` | **removed** |
| Colour / highlight / underline | Color, Highlight, TextStyle, Underline | — | **removed** |
| Text alignment | TextAlign | — | **removed** |
| Sanitisation | `sanitizeBlogHtml`, `sanitizeImageUrl` | n/a (no HTML) | removed with the feature |
| Data path | `/blog-data*` (registered) | `/blog/posts*` — **not registered** | **broken** |

### 3.7 `FP-F03` — Employer messaging (RA-38 / DISC-032)

| Subfeature | Legacy | Modern | Verdict |
|---|---|---|---|
| Thread list | `EmployerCandidateMessages.jsx` | `portal.tsx:145-185` hardcoded 3 threads | fabricated |
| Send message | `SendMessageDialog.jsx` → API | `portal.tsx:233-247` `setState` only | **local-only** |
| Persistence across reload | server | none | **absent** |
| Real messaging stack (candidate side) | — | `lib/messages.ts` → `/messages/conversations`, `/messages/send`, used by `pages/dashboard/messages.tsx` | present elsewhere, unused here |
| Candidate email from the ATS drawer | — | `CandidateReviewDrawer.tsx:159` `POST /notify/email` (unregistered) + success | **broken + fabricated success** |

### 3.8 `FP-A20` — Operations console (RA-42)

| Subfeature | Legacy | Modern | Backend | Verdict |
|---|---|---|---|---|
| Queue list from server | `src/components/admin/queues` | `AdminQueuesTab.tsx:138` `GET /platform/queues` | `platform.js:465` | real |
| Baseline when server fails | — | keeps `DEFAULT_QUEUES`/`INITIAL_JOBS` (`:48`, `:55-105`) silently | — | **fabricated fallback** |
| Re-dispatch queue | legacy retry | `:173` `POST /platform/queues/retry` (real) with dead fallback `/admin/queues/{name}/retry` | `platform.js:504` | works, fallback dead |
| DLQ purge | legacy purge | `:204-212` `POST /admin/queues/dead-letter-queue/purge` + `.catch(()=>{})` + success | **none** (server has `POST /platform/queues/purge` → **410 Gone**) | **dead + fake success** |
| DLQ retry-all | legacy | `:262-268`, `:285-290` same shape | **none** | **dead + fake success** |
| Backup / cache clear | legacy | `AdminOperationsTab.tsx:122/136` `POST /admin/operations/{backup,cache-clear}` | **none** | **dead + fake success** |
| Feature flags | legacy | `AdminOperationsTab` real calls | `adminPlatformOperations.js:576+` | present |

---

## 4. Fixture and fake-success sweep (DISC-026 … DISC-031)

| Component | Fixture / behaviour | Line | Server truth | Classification |
|---|---|---|---|---|
| `AdminHelpDeskTab.tsx` | `DEFAULT_TICKETS` rendered as live; replies/status "succeed" | `:47,117,128,135,157,188` | no ticket router anywhere in `backend/` | MOCK (FP-A19) |
| `AdminBlogManagementTab.tsx` | `INITIAL` posts; delete removes row + "deleted successfully" | `:97,126,131` | `/admin/blog/posts` exists, `/blog/posts` does not | broken data path (FP-G09) |
| `AdminModerationTab.tsx` | `DEFAULT_APPLICATIONS/JOBS`; verify/moderate to unregistered paths | `:58,108,152,167,184` | `PATCH /admin/employer-applications/:uid` only | MOCK (FP-A11) |
| `AdminQueuesTab.tsx` | `INITIAL_JOBS` incl. `job_dlq_99182` + synthetic stack trace; `// Keep baseline` | `:48,55-105,158-160` | `/platform/queues` returns real rows | PARTIAL + fabricated fallback |
| `AdminUsersTab.tsx` | `DEFAULT_USERS` (`usr_001 alex.rivera@example.com`) as initial state; status toggle dead | `:68,142,179,206` | `GET /admin/users` real; `/{id}/status` not registered | PARTIAL (fixture on failure) |
| `AdminSecurityTab.tsx` | `INITIAL_EVENTS/OPERATORS/AUDITS/ANNOUNCEMENTS` | `:68,136,143,150,159-181` | no matching read call in file | fabricated view |
| `AdminAttentionTab.tsx` | `DEFAULT_SIGNALS` | `:31` | none | fabricated view |
| `AdminContentMarketingTab.tsx` | `INITIAL_PHRASES/REVIEWS/TRUSTED/PAGES` | `:66,74,80,88` | none | fabricated view |
| `TeamSeats.tsx` | `INITIAL_TEAM` + invite modal appends to state | `:36,74` | `/enterprise/teams` exists, unused here | LOCAL-ONLY (FP-F06) |
| `portal.tsx` (employer) | messaging fixtures; hiring preferences state-only | `:145-185,233-247,251` | messaging stack exists elsewhere | MOCK (FP-F03) |

`AdminSecurityTab`, `AdminAttentionTab`, `AdminContentMarketingTab` and `TeamSeats` were **not** previously classified; they are recorded as new leads in §6 and expanded into DISC-029…DISC-031 rather than silently re-labelled, because the affected capability rows (`FP-A21`, `FP-A23`, `FP-F06`) carry other real subfeatures.

---

## 5. Client call sites with no registered operation (DISC-027)

Detector: `parity-depth-checks.cjs` check 9. 30 call sites over **19 distinct paths**; each verified against `backend/` by direct grep, not against the register alone.

| Client path | Sites | Backend truth | Consequence |
|---|---|---|---|
| `/admin/employer-applications/{id}/verify` | 2 | `PATCH /admin/employer-applications/:uid` only | moderation decision never applied |
| `/admin/jobs/{id}/moderate` | 1 | moderation via `resilientMutations` only | same |
| `/admin/users/{id}/status` | 1 | `PATCH /admin/users/:id` exists | suspend/activate never applied |
| `/admin/support/tickets` | 2 | **none** | help desk list always 404 → fixtures |
| `/admin/support/tickets/{id}` | 2 | **none** | status change fake |
| `/admin/support/tickets/{id}/messages` | 2 | **none** | replies fake |
| `/support/tickets` | 2 | **none** | candidate help centre dead |
| `/support/tickets/{id}/messages` | 1 | **none** | dead |
| `/admin/queues` (fallback only) | 1 | `/platform/queues` | harmless fallback |
| `/admin/queues/{queue}/retry` (fallback only) | 1 | `/platform/queues/retry` | harmless fallback |
| `/admin/queues/dead-letter-queue/purge` | 2 | `/platform/queues/purge` → **410 Gone** | dead + fake success |
| `/admin/queues/dead-letter-queue/retry` | 2 | **none** | dead + fake success |
| `/admin/operations/backup` | 1 | **none** | dead + fake success |
| `/admin/operations/cache-clear` | 1 | **none** | dead + fake success |
| `/blog/posts` | 3 | `/admin/blog/posts` | prefix bug: blog admin + public blog always 404 |
| `/blog/posts/{id}` | 3 | `/admin/blog/posts/{id}` | same |
| `/platform/status` | 1 | `/admin/platform/status` | enterprise BYOK status never loads |
| `/billing/validate-coupon` | 1 | `POST /coupons/validate` | promo codes always rejected |
| `/notify/email` | 1 | **none** (`notify/user-signup` only) | recruiter email never sent, success shown |

Two of the 19 (`/admin/queues*` fallbacks) are benign because the primary call succeeds; they are listed for completeness and excluded from the defect count (**17 defective paths, 27 defective sites**).

---

## 6. Detector output and its false positives

`node developer-review/tools/parity-depth-checks.cjs` → `Evidence/artifacts/parity-depth-checks.json`:

| # | Check | Status | Items |
|---|---|---|---|
| 1 | doc/matrix classification contradiction | PASS | 0 |
| 2 | swallowed failure followed by success | LEAD | 17 |
| 3 | hardcoded operational baseline retained on error | LEAD | 17 |
| 4 | browser storage beside a server client | LEAD | 3 |
| 5 | `file:line` evidence refs resolve | PASS | 0 bad of 100+ refs |
| 6 | runtime claims backed by a log | PASS | 0 missing |
| 7 | declared backend actually called (2 import hops) | PASS | 0 uncalled / 24 via imports |
| 8 | FULL rows with legacy subfeature signals absent | LEAD | 4 |
| 9 | client calls resolve to a registered operation | LEAD | 30 |
| 10 | legacy export/edit capability has a disposition | LEAD | 10 |

**Adjudicated false positives (kept in the artifact, excluded from findings):**

- **Check 8, 4 leads — all resolved as attribution breadth.** `FP-E08` (16,941 legacy lines = the whole `BuildResume` tree), `FP-E09` (`preview` *does* exist — `cover-letter-builder.tsx:396` `view: 'edit' | 'preview'`; the keyword regex required `preview[A-Z]`), `FP-E17` (`pages/export/*` is the export surface; legacy "a11y" signals belong to the composer), `FP-F05` (`export`/`search` come from sibling `EmployerPortal` files, not the job editor). No row was downgraded on this evidence.
- **Check 10, 10 leads — mostly domain bleed.** Legacy `src/services` and `src/components/admin/settings` are shared by many capabilities; `exportPdf`/`printAuthoritativeInvoice` belong to billing, not to `FP-A16`/`FP-A21`. Real residual: `FP-E08` and `FP-F05` have no recorded disposition for the download helpers (`downloadResumePdf/Docx`) — tracked as DISC-040 rather than a row change, because those rows' own scope is share/editor.
- **Check 2, 17 leads — 4 are correct behaviour.** `pages/dashboard/favourites.tsx:134` catches and then shows an *error* notice (not success); `AdminOperationsTab:122` "Just now (Verified OK)" is a health display. Only leads where a success state follows a swallowed failure are treated as defects (DISC-026).
- **Check 3, 17 leads — empty arrays are not fixtures.** Only arrays containing invented records are findings; `INITIAL_TEAM`/`DEFAULT_USERS`/`DEFAULT_TICKETS`/`DEFAULT_APPLICATIONS`/`DEFAULT_JOBS`/`DEFAULT_SIGNALS`/`INITIAL_*` security & marketing sets qualify.

---

## 7. Metrics (separate, non-aggregable)

Every metric carries numerator, denominator, exclusions, formula and source. **No composite score is published** and none of these may be added together: they measure different things.

| ID | Metric | Numerator | Denominator | Exclusions | Formula | Source |
|---|---|---|---|---|---|---|
| M13 | Subfeatures re-verified at line level in this pass | 74 | 74 adjudicated subfeatures in §3 | subfeatures with no legacy counterpart | 74/74 | this register §3 |
| M14 | Allegations dispositioned | 8 | 8 | — | 8/8 | §2.1 |
| M15 | FULL rows challenged | 12 | 12 | rows already PARTIAL/MISSING | 12/12 | `parity-endpoint-audit.json` |
| M16 | FULL rows that survived challenge | 12 | 19 (V5 FULL rows) | 7 downgraded, listed in §2.2 | 12/19 = 63.2 % | `feature-parity.json` |
| M17 | Rows downgraded on subfeature evidence | 7 | 19 V5 FULL rows | `FP-A11`, `FP-A19` were PARTIAL → MOCK | 7/19 = 36.8 % | §2 |
| M18 | Client call sites resolving to a registered op | 199 | 229 | 30 dead (19 paths); 2 benign fallbacks | 199/229 = 86.9 % | `client-call-existence.json` |
| M19 | Backend operations reachable from the UI | 152 | 385 | SERVER-ONLY/EXTERNAL excluded from *numerator only*, not denominator | 152/385 = 39.5 % | `backend-reachability.json` |
| M20 | Fabricated-state components identified | 10 | 206 modern files | files with no live data view | 10/206 (context only) | §4 |

M18's exclusion note matters: the 2 benign fallbacks are dead code, not broken features, so the defect rate over *user-visible actions* is 27/229 = 11.8 %, and that number is **not** comparable to M18.

---

## 8. What is NOT covered (explicit incompleteness)

1. **Browser runtime: 0 %.** No Playwright, no MariaDB in this sandbox. Every "the tab strips the member drawer" claim is static; no screenshot, no HAR, no console capture exists. `dist/` is untracked, so the served bundle cannot be tied to HEAD.
2. **Deep read coverage.** 112 capability rows were re-read at the row level, but only the 8 alleged + 5 swept rows were read subfeature-by-subfeature (74 subfeatures). The remaining 99 rows have **not** had every button traced; their subfeatures are only as good as V5's evidence.
3. **Authorization.** RBAC was read for team/workspace member routes (`enterprise.js:720/729/738`) and audit (`:652`); it was not re-audited for the 17 dead paths (moot — they 404).
4. **Persistence checks are static.** "Persists" means a repository write was traced in backend source; nothing was written to a database.
5. **Two allegations rest partly on absence.** `FP-G21` (voice) and `FP-F03` (messaging fixtures) are proven absent/fixture in the modern tree, but a *third-party* embedded widget or a sibling app could provide them outside this repository; none was found by grep.

---

## 9. Reproduce

```bash
node developer-review/tools/parity-matrix.cjs             # 112 rows, 12 FULL / 47 PARTIAL / 32 MISSING / 12 MOCK / 6 REPLACED / 3 UNVERIFIED
node developer-review/tools/parity-endpoint-audit.cjs     # 12/12 FULL rows endpoint-supported, all 112 rows checked
node developer-review/tools/parity-depth-checks.cjs       # 10 checks: 4 PASS, 6 LEAD with adjudications above
node developer-review/tools/backend-reachability.cjs      # 385 ops / 7 classes
bash  developer-review/scripts/verify-audit-package.sh    # 61/61
python3 developer-review/scripts/verify-v4-reconciliation.py  # 16/16
```

Every artifact named above is committed under `developer-review/Evidence/artifacts/`; no generated file is hand-edited.
