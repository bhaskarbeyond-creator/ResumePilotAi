# IME365 — Autonomous UI/UX Parity, Dashboard Expansion & Full-Stack Validation Directive

**Project:** IME365 — Interview Made Easy  
**Execution mode:** Autonomous remote development  
**Task type:** Continuation of existing work; do not restart or overwrite prior implementation  
**Incoming update:** Local developer's latest pushed commit `679af6be`  
**Target branches:** `origin/arena/8a774228-resumepilotai` & `origin/main` (both in sync at `679af6be`)  
**Primary objective:** Pull the latest changes, reconcile workspace, compare legacy `src/` vs modern `frontend/src/` UI, enhance dashboard surfaces autonomously, validate real Node.js/Express/MariaDB backend integration, and prove functionality using Playwright across five responsive layouts and all applicable deep links.

---

## 1. Executive mandate

Continue from the existing remote developer's completed work and the additional changes made by the local developer.

The local developer has pushed commit:

`679af6be`

Your first responsibility is to **fetch, inspect, and safely integrate this update** into your independent remote development workspace. Do not begin new feature implementation until the incoming changes have been verified.

### What `679af6be` delivered (Context):
1. **Automated Dist Sync:** Added `scripts/sync-dist.mjs` wired into `frontend/package.json` (`npm run build`) so compiling the frontend automatically mirrors assets into Apache's DocumentRoot (`dist/`).
2. **Executive Resume Cleanliness:** Completely stripped all internal template IDs (e.g. `Cv2`), template names (e.g. `Nordic Slate`), versions, categories, and diagnostic tags (e.g. `Verified ATS`) from sidebars and footers across all 100 templates. Footers now cleanly render solely `[Candidate Name] ... Page X of Y`.
3. **Evidence Artifacts:** Regenerated all 100 HTML template proofs in `docs/templates/evidence/`.

After integration, autonomously select the next highest-value dashboard surface in `frontend/src/pages/dashboard/`, compare its legacy (`src/`) and current implementations, identify discrepancies, implement improvements, validate backend persistence with real data, and execute browser tests.

Continue to the next candidate surface after each completed and verified workstream. Do not stop after producing an audit, fixing one page, or generating screenshots.

The overall goal is to make the new IME365 experience:

- Visually stronger and more modern than the legacy UI (adhering to Cuba M3 Executive Glassmorphic standards).
- Functionally complete, with working actions and meaningful feedback.
- Consistent across every applicable route and deep link.
- Correctly connected to the backend.
- Accurate in displaying and persisting real data.
- Responsive across all five required layout profiles.
- Accessible (WCAG 2.1 AA), reliable, secure, and free of preventable runtime errors.
- Supported by actual Playwright execution results and reviewable evidence.

**Preserve all previously completed work. Extend and improve it rather than rebuilding it unnecessarily.**

---

## 2. Mandatory first step: integrate commit `679af6be`

The expected incoming change is `679af6be`. Treat this as the target commit to verify, not as proof that the remote workspace has already integrated it.

### 2.1 Establish the independent workspace

Use your independent remote workspace. Do not modify the user's local working directory:

`D:\xampp\htdocs\IME365`

The local directory is reference-only. Do not access it as a writable workspace, overwrite its files, or change its XAMPP configuration, local database, certificates, environment variables, or running services.

Record:

- Independent workspace path.
- Repository root.
- Configured remote URLs.
- Current branch and upstream.
- Current local HEAD.
- Current remote HEAD.
- Working-tree status.
- Last completed remote-development milestone.

### 2.2 Fetch and inspect

Use safe Git inspection and fetching commands:

```bash
git rev-parse --show-toplevel
git remote -v
git status --short --branch
git branch -vv
git fetch origin
git log -10 --oneline --decorate origin/arena/8a774228-resumepilotai
git show --stat --oneline 679af6be
git show --format=fuller --no-ext-diff 679af6be
```

Verify that `679af6be` resolves to the expected commit on `origin/arena/8a774228-resumepilotai` and `origin/main`.

Inspect the incoming diff for:

- New features and UI changes.
- Modified routes and navigation.
- Changes to shared components (`frontend/src/components/resume/`).
- API clients, backend routes, schemas, and data contracts.
- Authentication, authorization, and session handling.
- Test changes and new test fixtures.
- Dependency or configuration changes.

### 2.3 Safely integrate the update

- Preserve legitimate remote changes and local work in your workspace.
- Never blindly use `git reset --hard`, `git clean -fd`, force-push, or history rewriting.
- Do not discard uncommitted work to make the incoming commit fit.
- If the target commit is already an ancestor of the current HEAD, verify that its changes are present rather than applying it again.
- If branches have diverged, inspect and safely reconcile the histories.
- Resolve conflicts deliberately and test the resulting code.

After integration, verify:

```bash
git status --short --branch
git log -5 --oneline --decorate
git merge-base --is-ancestor 679af6be HEAD
```

Run baseline checks before further implementation:

```bash
# 1. Verify frontend build
cd frontend && npm run build

# 2. Run template cleanliness and regression suite
node --test ../tests/test-footer-sidebar-cleanliness.mjs ../tests/dir008-template-deep-dives.test.mjs ../tests/template-production-render.test.mjs
```

**Do not proceed with feature work until the incoming update has been inspected, safely integrated, and baseline validation results have been recorded.**

---

## 3. Technology stack & architecture contracts

Adhere strictly to the established IME365 architecture:

* **Active Modern Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, Radix UI, TanStack Query & Table, Lucide React icons, and Cuba M3 Executive Glassmorphic styling located in `frontend/`.
* **Legacy Reference Codebase:** React 18 JSX & SCSS components located in `src/`.
* **Backend Runtime:** **Node.js (v20+) with Express 5.2.1** located in `backend/index.js` (listening on port `8080`).
* **Database & Persistence:** **MariaDB / MySQL** (port 3306) accessed via `mysql2` connection pool, with database migrations in `backend/migrations/`.
* **Authentication Architecture:** Firebase Admin SDK (`firebase-admin`) with Bearer token validation (`Authorization: Bearer <token>`). Invariant: Never confuse Firebase `auth_time` (original login) with `iat` (token refresh).
* **Reverse Proxy:** Apache / PHP reverse proxy (`api/index.php`) forwarding `/api/*` to `http://127.0.0.1:8080/api`.

---

## 4. Forensic audit: legacy (`src/`) vs modern (`frontend/src/`)

Conduct a structured comparison of the legacy application and the current IME365 implementation.

Do not assume that a route, component, screenshot, or previous report accurately describes the current code. Inspect the actual source and execute the application.

### Inspect every applicable layer

For each candidate surface, examine:

1. Legacy route, page, components, styling, and interactions in `src/`.
2. Current route and page implementation in `frontend/src/`.
3. Shared shell: `frontend/src/components/layout/cuba-app-shell.tsx`.
4. Data-fetching logic, `frontend/src/lib/api-client.ts`, query/cache state, and backend contracts in `backend/routes/`.
5. Forms, validation, modals, dropdowns, popovers, confirmation dialogs, and notifications.
6. Loading, empty, partial-data, success, error, unauthorized, and offline states where applicable.
7. Deep-link behavior and refresh handling.
8. Responsive behavior at all five required layout profiles.
9. Keyboard navigation, focus management, semantic markup, and accessibility (WCAG 2.1 AA).
10. Existing tests, missing tests, console output, and network failures.

### Required audit output

Create a page-by-page comparison matrix with:

| Field | Required content |
|---|---|
| Surface | Page or dashboard feature |
| Legacy file | `src/...` path |
| Modern file | `frontend/src/...` path |
| Existing behavior | Verified features and workflows |
| Discrepancies | Concrete differences and defects |
| Data integration | Express endpoint (`/api/...`) |
| Deep links | Routes and parameters tested |
| Responsive issues | Findings across five layouts |
| Severity | P0, P1, P2, or P3 |
| Implementation plan | Specific surgical changes |
| Verification | Tests and evidence required |
| Status | Not started, in progress, passed, blocked, or failed |

---

## 5. Candidate dashboard surfaces & priority ledger

After integrating `679af6be` and recording baseline results, select the next candidate surface in `frontend/src/pages/dashboard/`:

1. **Cover Letters & Builder:** `frontend/src/pages/dashboard/cover-letters.tsx` & `cover-letter-builder.tsx`
2. **ATS Score Analytics:** `frontend/src/pages/dashboard/ats-score.tsx`
3. **Job Tracker:** `frontend/src/pages/dashboard/job-tracker.tsx`
4. **AI Interview Coach:** `frontend/src/pages/dashboard/interview-coach.tsx`
5. **Messages & Chat:** `frontend/src/pages/dashboard/messages.tsx`
6. **Notifications Hub:** `frontend/src/pages/dashboard/notifications.tsx`
7. **Saved Favorites:** `frontend/src/pages/dashboard/favourites.tsx`
8. **AI Career Assistant:** `frontend/src/pages/dashboard/ai-assistant.tsx`
9. **Account, Security & Settings:** `frontend/src/pages/dashboard/settings.tsx`
10. **Help Desk & Support:** `frontend/src/pages/dashboard/support.tsx`
11. **Overview Dashboard:** `frontend/src/pages/dashboard/overview.tsx`
12. **Resumes & Master CV:** `frontend/src/pages/dashboard/resumes.tsx` & `resume-builder.tsx`
13. **Public Portfolio:** `frontend/src/pages/portfolio/`

### Selection rules

Before choosing a surface:

- Inspect its current implementation and legacy equivalent.
- Determine whether recent commits already changed it.
- Check existing completion reports and tests.
- Identify dependencies on shared components, APIs, schemas, and authentication.
- Prefer the highest-value surface that can be completed and validated coherently.
- Avoid duplicating work already completed and verified.

Document why the selected surface is the best next candidate. Then implement, test, commit, and push the completed work before selecting the next surface.

**Continue autonomously through the candidate list. Do not ask the user to choose each subsequent page.** Stop only when the authorized scope is complete or a genuine blocker prevents safe progress.

---

## 6. End-to-end surface implementation requirements

For each selected dashboard surface, follow this complete lifecycle:

### Step A — Establish the baseline
- Run the application (`npm --prefix frontend run dev` on port 4000, `node backend/index.js` on port 8080).
- Inspect the legacy and current pages.
- Capture baseline screenshots.
- Enumerate all interactive controls, deep links, and API routes.
- Record current runtime, console, and network errors.

### Step B — Build the functional inventory
Document user goals, page sections, actions, validation rules, dialogs, loading/empty states, error boundaries, and responsive expectations.

### Step C — Implement the improvements
Make focused, production-quality changes:
- Information hierarchy adhering to Cuba M3 Executive Glassmorphism.
- Consistent typography, spacing, cards, tables, badges, and controls.
- Clear primary and secondary actions.
- Functional loading, empty, and error recovery states.
- Accessible forms, visible focus rings, and screen-reader labels.
- Removal of dead controls and fake interactions.

### Step D — Verify behavior & persistence
Execute all primary user journeys and edge cases in the browser. Verify that creates, updates, and deletes persist in MariaDB and survive full page reloads.

### Step E — Compare and retest
Capture the updated UI, compare it against legacy baseline, verify zero visual regressions, and run relevant test suites.

### Step F — Commit and push
Commit and push using the protocol in Section 11, then continue to the next candidate.

---

## 7. Backend integration and real-data correctness

**A visually polished frontend with fake data or nonfunctional controls does not pass acceptance.**

Audit the complete path:

`UI → API client (api-client.ts) → Bearer Auth → Express route (backend/routes/) → Business logic → MariaDB (mysql2) → Response Envelope → UI State`

### Required checks
- Confirm each feature calls the authentic Express endpoint in `backend/routes/`.
- Validate request/response JSON schemas.
- Enforce Bearer token authorization and user/tenant isolation.
- Check loading, cancellation, retries, timeouts, and error states.
- Ensure mutations persist and refresh correctly.
- Never present static JSON arrays or dummy mocks as live production data.
- Never bypass authentication to make UI flows appear functional.

---

## 8. Five-layout responsive testing matrix

Run Playwright browser tests across all five required responsive layout profiles for each surface:

| Profile | Viewport | Primary objective |
|---|---:|---|
| Large desktop | 1920 × 1080 | Wide-screen layout, information density, alignment |
| Standard laptop | 1366 × 768 | Primary desktop workflow and vertical rhythm |
| Tablet | 1024 × 768 | Adaptive columns, sidebar collapse, touch targets |
| Mobile | 390 × 844 | Mobile navigation, stacked cards, dialogs, forms |
| Small mobile | 320 × 568 | Minimum-width behavior, text wrapping, zero horizontal scroll |

### Every profile must test:
- Initial route load and layout rendering.
- Sidebar, top navigation, and responsive drawer behavior.
- Form inputs, validation messages, and submit buttons.
- Modals, dropdowns, popovers, and confirmation dialogs.
- Dialog open, close, cancel, confirm, and `Escape` behavior.
- Focus movement and keyboard accessibility.
- Zero unintended horizontal scrollbars (`overflow-x`).
- Console errors and network failures.

---

## 9. Deep links, routes, modals, and popups

### Deep-link inventory
Test applicable routes with:
- Direct URL entry with required path and query parameters.
- Page refresh (`F5`) on target deep links.
- Browser back and forward navigation.
- Missing, invalid, or unauthorized parameter handling.
- Graceful 404 / empty state fallbacks.

### Modal and popup testing
For each dialog, popover, or dropdown:
1. Trigger opens the modal cleanly.
2. Focus moves into the modal and is trapped appropriately.
3. Inputs function and validation is enforced.
4. Primary and secondary actions execute correct API mutations.
5. Close button and `Escape` key dismiss the dialog.
6. Focus restores to the triggering element upon dismissal.
7. Background body scroll is locked while the dialog is open.
8. The dialog remains fully usable and visible on mobile (390px) and small mobile (320px).

---

## 10. Quality gates & zero-warning standard

The target is zero known preventable errors and warnings in the changed scope:

* **TypeScript:** `npx tsc -b` inside `frontend/` must pass with **0 errors**.
* **Production Build:** `npm --prefix frontend run build` must build cleanly and sync to `dist/`.
* **Runtime Exceptions:** Zero unhandled exceptions or promise rejections in tested journeys.
* **React Warnings:** Zero missing key warnings, zero controlled/uncontrolled input warnings.
* **Playwright Tests:** 100% passing for all acceptance test suites.

---

## 11. Mandatory incremental commits and pushes

After integrating `679af6be`, preserve existing commit history and continue using the authorized feature branch.

Do not accumulate all work into one giant commit.

### Required commit sequence:
- **C0 — Incoming update:** Verify and record integration of `679af6be`.
- **C1 — Audit:** Commit the old/new UI comparison matrix and prioritized plan.
- **C2 — Shared infrastructure:** Commit reusable design, routing, or component fixes.
- **C3 onward — Surface-by-surface delivery:** Commit and push each completed, tested surface.
- **C-final — Regression and release evidence:** Commit final documentation and test summaries.

### Before every push:
- Verify branch (`arena/8a774228-resumepilotai` or `main`).
- Run `npm --prefix frontend run build`.
- Run relevant test suites.
- Push cleanly without `--force`.
- Verify remote SHA.

---

## 12. Final deliverables & evidence report

Maintain and publish:

- Incoming commit review and integration record.
- Baseline test report.
- Legacy-versus-new UI comparison matrix.
- Surface selection rationale and completion ledger.
- Before-and-after screenshots across viewports.
- Five-layout Playwright test results per completed surface.
- Console and network diagnostics.
- Commit and push ledger.

---

# Final execution instruction

**Begin now with Git synchronization.** Fetch and inspect the incoming commit `679af6be`, safely integrate it into your independent remote workspace, record the baseline, and run the existing test suite:

```bash
git fetch origin
git log -1 origin/arena/8a774228-resumepilotai
cd frontend && npm run build
node --test ../tests/test-footer-sidebar-cleanliness.mjs ../tests/dir008-template-deep-dives.test.mjs
```

Then perform the forensic UI/UX comparison, choose the next candidate dashboard surface autonomously, and carry it through implementation, real-backend validation, deep-link and modal verification, five-layout Playwright testing, regression testing, evidence capture, and incremental commit/push.

Continue to the next candidate after each completed workstream.
