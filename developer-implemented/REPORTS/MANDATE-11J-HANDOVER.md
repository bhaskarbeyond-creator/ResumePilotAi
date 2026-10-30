# MANDATE 11J — Handover Report
**Developer 3 · Web CV & Portfolio Builder Studio · Public showcase, gallery & custom domains · Candidate settings test alignment**

| | |
|---|---|
| Repository | `bhaskarbeyond-creator/ResumePilotAi` |
| Baseline (`§6`) | `4dd5525423ed9fd2c65aba0c3529b9e81267823f` — present and an ancestor of the work (`BASELINE_IS_ANCESTOR`) |
| Branch used | `arena/9d98cdf2-resumepilotai` — **deviation**: the preferred `arena/mandate11j-portfolio-showcase-builder` could not be created in this session (§5.1) |
| Commit message | `feat(portfolio): web cv builder, public showcase, custom domains, and candidate test alignment` |
| Files | exactly **13** — 9 modified, 4 added (§2) |
| Gates | **4 / 4 executed, 4 / 4 passed**; Workstream C runtime verification is **BLOCKED** (§4) |
| Verdict | **PARTIAL — PASS on Workstreams A and B and on all four mandated gates; BLOCKED on Workstream C runtime verification; two documented environment deviations (branch, Node 20) and one backend privacy limitation that is out of scope to fix** |

---

## 1. Executive summary

The Web CV & Portfolio Builder Studio is implemented and verified end to end against the real frontend modules: persistent private drafts on the real `/api/portfolios` contract, a canonical document engine, five section-visibility flags that never delete content, a responsive split-screen editor with a desktop/mobile live preview, optimistic concurrency with the three mandated conflict resolutions, and the module-disabled banner. The public surface is implemented too: `/portfolio/:slug` from the server's public projection with strict DTO sanitising and per-portfolio SEO metadata (`${seoTitle} · IME365`, restored on navigation), the `/portfolios` gallery with URL-synced `q` + `template` filters, and the share dialog with copy/QR/social plus a custom-domain dialog that reports only what the backend actually supports (a TXT ownership record — no invented CNAME/A target).

Two things are **not** finished, and they are called out rather than glossed over:

1. **Workstream C could not be executed.** The two aligned tests in `frontend/tests/candidate/settings.spec.ts` were rewritten against the real component behaviour, type-check and enumerate, but the suite is documented as "real stack only: UI :4000 → Express :8080 → MariaDB bridge", which this sandbox cannot run. They are *not* reported as passing.
2. **Section visibility is enforced at render and client-serialisation time, not in the server's public payload.** The backend public projection copies `data.canonical` verbatim, so a scripted consumer of `GET /api/portfolios/public/:slug` can still read a hidden section's content (never an authentication bypass, but a disclosure the candidate explicitly asked to hide). Fixing it requires a backend change, which this mandate forbids.

Everything else below is executed evidence, not intent.

---

## 2. File boundary audit (exactly 13 files)

All paths are relative to the repository root. Nothing outside this list changed; `git status --short` lists exactly these 13 (plus this report and the evidence directory, which are deliverables, not code).

**Modified (9)**

| File | Change |
|---|---|
| `frontend/src/pages/portfolio/builder.tsx` | List + rewritten editor: draft creation with an idempotency guard and a persisted-response check, revision-checked save with a stale-response sequence guard, conflict alert offering **Keep local & overwrite / Inspect remote changes / Discard changes and reload latest version**, conflict dialog, 2-column editor + live preview with `device` desktop/mobile (375 px frame), visibility controls, share/publish/custom-domain/unpublish flows, module-disabled state, non-Web-CV fallback |
| `frontend/src/pages/portfolio/gallery.tsx` | `q` clipped to 120 chars, `template` validated against `PORTFOLIO_TEMPLATES`, unknown values ignored, filters in the URL |
| `frontend/src/pages/portfolio/public-portfolio.tsx` | Per-portfolio metadata with full restore on navigation, visibility projection of the public DTO, empty-content notice, not-found/error states |
| `frontend/src/lib/portfolio.ts` | API client + custom-domain client + self-contained QR encoder; `PORTFOLIO_ID_PATTERN`, `portfolioSaveEnvelope` (revision must be a safe non-negative integer), `sanitizePublicPortfolioDto` (allowlist + visibility projection, drops `userId`/`revision`/billing/address), `CUSTOM_DOMAIN_ROUTING_SUPPORTED`/`_NOTE` |
| `frontend/src/lib/portfolio-document.ts` | `PortfolioVisibility`, `normalizeVisibility`/`visibilityOf`/`defaultVisibility`, `buildDocument` (persists flags in `canonical` and at the document top level), `canonicalWithVisibility`, `hasHiddenSections`, `documentWithVisibility`, `compareCanonical` |
| `frontend/src/components/portfolio/portfolio-view.tsx` | Applies `canonicalWithVisibility` itself, so no rendering path can show a hidden section |
| `frontend/src/components/portfolio/portfolio-dialogs.tsx` | New `ConflictDialog` (both versions, difference table, three resolutions, Escape = decide later) and rewritten `CustomDomainDialog` (server-issued TXT record, real verification status, explicit "no CNAME/A routing") |
| `frontend/src/components/portfolio/portfolio-editor-fields.tsx` | `VisibilityControls` (five labelled checkboxes with descriptions) |
| `frontend/tests/candidate/settings.spec.ts` | Only the 409-conflict test and the deletion-token steps (§3.3) |

**Added (4)**

| File | Why |
|---|---|
| `frontend/src/components/portfolio/share-publication.tsx` | `SharePublicationDialog`, `socialShareTargets`, `mailShareHref` — public URL, copy with honest failure, QR from the displayed URL, publication status |
| `frontend/tests/mandate11j.config.ts` | Playwright config: one Vite dev server (port 4017), `workers: 1`, preview-identity auth, optional Chromium executable/args overrides |
| `frontend/tests/mandate11j.spec.ts` | 29-scenario E2E suite (§4.2) |
| `developer-implemented/TESTS/unit/mandate11j-contracts.test.mjs` | 45-test Node contract suite over the real modules |

**Untouched, on purpose:** `backend/**` (read-only per mandate), `frontend/src/pages/resumes.tsx`, `frontend/src/lib/resume-view-model.ts`, resume template components, job-application-tracker files, `login.tsx`, `frontend/src/components/settings/**`, shared config, all `package.json` files, and the candidate suite's other files.

---

## 3. Workstream status

### 3.1 Workstream A — Web CV & Portfolio Builder Studio — **implemented, verified**

| Requirement | Status | Evidence |
|---|---|---|
| Persistent private drafts over real `GET/POST /api/portfolios` | DONE | E2E 1–2; contract tests for the save envelope |
| Idempotent creation, persisted response validated before the editor opens | DONE | `creatingRef` guard + `saved.id === id && saved.revision >= 1` check; E2E 2 asserts one POST and one row |
| Canonical engine `buildDocument` / `canonicalFromResume` / `normalizeCanonical` / `documentWithVisibility` | DONE | 24 contract tests |
| 5 visibility flags, content never deleted when hidden | DONE | `canonicalWithVisibility` returns arrays/blank strings and never mutates; `buildDocument` always persists the full `canonical`; E2E 3–4 |
| Responsive split-screen + desktop/mobile preview of the real public component | DONE | `lg:grid-cols-2` editor/preview, stacked below `lg`, 375 px frame with `data-preview-width`; E2E 6 |
| Optimistic concurrency `{id, title, theme, data, expectedRevision}` + 409 handling | DONE | `portfolioSaveEnvelope` rejects a non-integer revision (so `null`/`''` can never be read as "create"); 409 → conflict state, nothing overwritten; E2E 7–10 |
| Three explicit resolutions | DONE | Keep local & overwrite (saves against `conflict.remote.revision`, refetches and re-offers the dialog on a second 409), Inspect remote changes (`compareCanonical` table), Discard changes & reload latest version (fetches at decision time) |
| Stale async response protection | DONE | `saveSeq` sequence guard on every save/reload path |
| Module-disabled 403 + exact banner sentence | DONE | Banner text "The portfolio module is currently disabled by system administration."; only 403 **+** `PORTFOLIO_MODULE_DISABLED` is treated as disabled (E2E 11–13) |

### 3.2 Workstream B — Public portfolio, gallery, share & custom domains — **implemented, verified**

- `/portfolio/:slug` reads `GET /api/portfolios/public/:slug`, re-projects it through `sanitizePublicPortfolioDto` (allowlist; ownership/revision/billing/street-address fields dropped), and renders through the same `PortfolioView` the builder previews with. Title is `${seoTitle} · IME365`, with `description`, `og:*`, `twitter:card` and `rel=canonical` written through DOM APIs (never `innerHTML`) and restored when the route changes (E2E 15–17).
- `/portfolios` gallery: `q` (≤120 chars) and `template` (validated against the template list) live in the URL, survive reload/back/forward, and an unknown `template` is ignored (E2E 18–20).
- Share dialog: public URL only for a server-confirmed published record + slug; copy reports success only when `navigator.clipboard.writeText` resolved and announces failure otherwise; QR encodes exactly the displayed URL; LinkedIn/X/WhatsApp/email links are encoded and carry only the public title (E2E 21–24).
- QR: a self-contained byte-mode encoder (versions 1–13, ECC-L, penalty-based mask selection) lives inside the 13 allowlisted files — no new dependency, no new component file. Verified bit-for-bit against the independent Python `qrcode` library for 7 payloads (`qr-oracle-vs-python-qrcode.txt`, `ALL MATCH`).
- Custom domain: registration goes to `POST /api/portfolios/:id/custom-domain`, the dialog shows the server-issued TXT record, and "Check verification now" calls the real `POST …/custom-domain/verify`; Pending / Verified / Failed / Expired come only from the server. **Routing:** the backend verifies ownership with a TXT record only and returns no CNAME/A target, so the dialog says `CNAME / A routing is not available` with an explanation rather than printing an invented host (`CUSTOM_DOMAIN_ROUTING_SUPPORTED = false`; E2E 25–27).

### 3.3 Workstream C — Candidate settings test alignment — **updated, NOT executed (BLOCKED)**

Only the two named tests changed; every other security test in the file is untouched.

1. **409 conflict test** (`Master Profile › keeps the edits on a save conflict and requires an explicit resolution`). The previous version asserted controls that do not exist ("Discard changes" / "Load the newer version") and expected a merge-on-retry, so it could not pass against the shipped component. It now mirrors the real contract in `components/settings/profile-panel.tsx`: the conflict is announced ("changed in another tab or device"), a heading "Changed in another tab or device" appears, the local edit survives and the server value is intact, a second Save click sends **no** request and asks for an explicit resolution, "Review differences" opens the real comparison table showing both values without writing, "Keep my edits and overwrite" posts only the dirty field against the revision the server reported, and "Discard my edits and load the newer version" loads the newest version and writes nothing. One step of the old test was **not** kept as written: it expected a retry to merge the untouched field automatically, which the component does not do (a save while the conflict is unresolved is refused). That step was replaced by the equivalent proof through the real control — keep-local writes only the dirty field on top of the reported revision and the other tab's field survives — so the coverage is preserved without asserting behaviour the app does not have. Every unrelated and every security assertion in the file is untouched.
2. **Deletion `DELETE` token test**. Added a step that captures the deletion request and asserts the session token is sent as a bearer credential, that the page sends the same header, and that the request is the token-authenticated API call (`POST /api/account/delete` — the endpoint the app uses; the mandate's "DELETE" names the operation). The real deletion and the retry now also assert `authorization: Bearer <token>`, and the existing checks (typed `DELETE`, focus, `aria-invalid`, "no deletion request was ever sent for candidate A") are unchanged.

**Why it is not claimed as passing:** the suite requires the real Express + MariaDB stack, which is unavailable here. What *was* run: `tsc` over the whole `frontend/tests` tree → 0 errors, `oxlint` → 0 warnings/0 errors, and `playwright test -c playwright.candidate.config.ts --list` → the tests enumerate (`candidate-suite-enumeration.txt`).

---

## 4. Gates, evidence and what they prove

Full detail: `developer-implemented/EVIDENCE/mandate11j/EVIDENCE-REPORT.md`.

| Gate | Result |
|---|---|
| 1 · Lint (`oxlint`) | **PASS** — 0 warnings, 0 errors, 270 files |
| 2 · Build (`tsc -b && vite build && sync-dist`) | **PASS** — built in 2.04 s, 355 files synced |
| 3 · `node --test …11j-contracts.test.mjs` | **PASS** — 45 tests, 45 pass, 0 fail |
| 4 · Playwright (`tests/mandate11j.config.ts`) | **PASS** — 29 passed |

Not proven by this evidence: candidate-suite execution, backend behaviour, DNS verification, and anything on staging or production. The E2E run uses the local Vite dev server with a route-mocked API; it is a browser-level proof of the frontend contract, not of the deployed system.

---

## 5. Deviations, blockers and minimum additional authorization

### 5.1 Branch deviation (needs a decision, not code)
The mandate asks for `arena/mandate11j-portfolio-showcase-builder`. This session is bound to the branch `arena/9d98cdf2-resumepilotai` and may not create or switch branches, so the work is committed there with the mandated message. **Minimum action to comply:** someone with branch permissions creates `arena/mandate11j-portfolio-showcase-builder` from `main` and cherry-picks the single commit (or merges this branch into it); no code changes are needed.

### 5.2 Node 20 requirement not met (environment)
The mandate specifies Node 20 ESM `node --test`. This sandbox runs **Node v22.22.3**, and the contract suite depends on Node's TypeScript type stripping (`module.registerHooks`), which Node 20 does not provide. Options, in order of preference: (a) run the gate under Node 22 and amend the mandate's runtime line; (b) authorize a transpiling step in the test file (needs a new dev dependency or a checked-in transformer) so the same 45 tests run on Node 20. No manifest was modified, per the mandate.

### 5.3 Workstream C runtime verification (environment)
The candidate suite needs the real stack (UI :4000 → Express :8080 → MariaDB bridge). **Minimum authorization to unblock:** permission to run `npm --prefix backend test` plus the MariaDB test bridge in an environment that has it, then
`cd frontend && npx playwright test -c playwright.candidate.config.ts -g "save conflict|deletion"`.
Until then the two tests stay "aligned, unexecuted".

### 5.4 Browser provisioning (resolved, documented)
`npx playwright install chromium` cannot download here and `apt` has no `libnspr4`/`libnss3`. The gate uses the repository's own `@sparticuz/chromium` binary with its shared libraries on `LD_LIBRARY_PATH`, exposed through the config's `PLAYWRIGHT_CHROMIUM_EXECUTABLE`/`PLAYWRIGHT_CHROMIUM_ARGS` hooks. Nothing in the shipped app depends on that workaround.

### 5.5 Pre-existing staleness in a file outside the allowlist (not changed)
`frontend/tests/candidate/portfolio.spec.ts` targets an earlier builder than even the baseline provides (it expects a "Copy link" button in the builder header, an "Unpublish" label, a "Publish again?" dialog and a "QA portfolio" creation flow). It is already stale at `4dd5525…` and is outside the 13-file boundary, so it was not edited. One contract it depends on **was preserved deliberately**: after a 409 the page still renders a `role="alert"` banner containing "This portfolio changed elsewhere" with a button whose accessible name matches "Reload latest version" ("Discard changes and reload latest version"), fully in the viewport. **Minimum authorization to fix:** add that file to the allowlist for a follow-up.

---

## 6. Security and privacy findings

**F-11J-1 — Hidden portfolio sections are still present in the server's public payload (severity: MEDIUM, backend, out of scope).**
`backend/repositories/MySQLRepository.js#_publicPortfolioProjection` copies `data.canonical` verbatim, so when a candidate hides Experience/Education/Projects/Skills/Contact, the content (including email and phone when contact is hidden) is still returned by `GET /api/portfolios/public/:slug` and its alias `/api/public/portfolios/:slug`. There is no authentication bypass — the record is published — but the candidate's explicit "hide this" choice is not honoured in the payload.
*What this change does:* the app never holds or renders that data — `sanitizePublicPortfolioDto` drops it at the client boundary, `canonicalWithVisibility` is applied in the public page **and** inside `PortfolioView`, and E2E 16 asserts the rendered page shows none of it even though the fixture payload contains it. Cached JavaScript state is therefore clean too.
*What only the backend can do:* apply the same five flags inside `_publicPortfolioProjection` (drop hidden arrays, blank hidden contact fields) before the allowlist copy. That is a ~6-line change in a read-only area of this mandate, so it is reported, not applied.

**F-11J-2 — No custom-domain routing target is configured (informational).**
Ownership is proven by a TXT record; no CNAME/A target exists in the backend or the repository. The UI states this; it does not fabricate a target. Visitors reach a custom domain only once infrastructure adds routing.

**F-11J-3 — Public DTO allowlist holds (verified).**
Contract tests assert `userId`, `user_id`, `revision`, `billing`, GSTIN, `extra_data`, street address and postal code never survive the client projection, and that an unpublished record resolves to `404 PORTFOLIO_NOT_FOUND` rather than a distinguishable "draft exists" answer.

**No secrets, tokens or personal data were introduced** in code, tests or evidence; test identities are synthetic (`*.example.test`), and the preview token in the E2E fixture is a locally generated `rptest.` value that never leaves the mocked route.

---

## 7. Handover notes and next steps

**Run the gates**
```bash
# 1 + 2
npm --prefix frontend run lint
npm --prefix frontend run build

# 3  (Node >= 22.6 — see §5.2)
node --test developer-implemented/TESTS/unit/mandate11j-contracts.test.mjs

# 4  (needs a Chromium; the env vars are only for sandboxes without one)
cd frontend && npx playwright test -c tests/mandate11j.config.ts
```

**Ordered follow-ups**
1. Create/publish the preferred branch and re-attach the commit (§5.1).
2. Run the candidate suite where MariaDB exists, and confirm the two aligned tests (§5.3).
3. Decide on Node 20 (§5.2) — amend the mandate or authorize a transform step.
4. Backend follow-up ticket for F-11J-1 (hidden sections in the public payload) and, separately, custom-domain routing.
5. Optional cleanup ticket for `frontend/tests/candidate/portfolio.spec.ts`, which is stale at baseline (§5.5).

**Known behaviours worth keeping in mind when extending this area**
- Visibility flags are persisted **twice** (inside `canonical.visibility` and at the document top level) so older readers and newer readers both see them; `normalizeVisibility` treats missing/unknown values as *visible*, so a legacy document can never accidentally hide content.
- A hidden section is never deleted; `buildDocument` always writes the full `canonical`, which is why the builder can restore it and why F-11J-1 needs a server-side fix rather than a storage change.
- The conflict alert is the primary surface (announced immediately, keyboard reachable); the dialog is opened explicitly through "Inspect remote changes". Escape in the dialog is "decide later" — it never resolves a conflict implicitly.
- `savePortfolio` refuses a revision that is not a safe non-negative integer; `0` means *create* and nothing else may be coerced to `0`.
