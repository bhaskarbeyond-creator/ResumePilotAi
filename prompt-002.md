# IME365 — Final 10/10 Autonomous Engineering Directive
## Legacy-to-Modern UI Parity, Dashboard Expansion, Real-Backend Validation, Responsive Testing & Incremental Delivery

**Project:** IME365 — Interview Made Easy  
**Execution mode:** Autonomous remote development  
**Directive type:** Continuation of existing implementation; no unnecessary rebuilds  
**Incoming commit:** `679af6be` (ancestor of branch HEAD)  
**Development branch:** `arena/8a774228-resumepilotai`  
**Reference branch:** `main`  
**Reported initial state:** `origin/arena/8a774228-resumepilotai` and `origin/main` are synchronized  
**Legacy reference:** `src/` (Read-only behavioral specification)  
**Active modern frontend:** `frontend/src/` (React 19 + TypeScript target)  
**Backend:** Node.js 20+, Express 5.2.1, MariaDB/MySQL (Port 8080 / 3306)  
**Frontend stack:** React 19, TypeScript, Vite, Tailwind CSS v4, Radix UI, TanStack Query/Table, Lucide React, Cuba M3 Executive Glassmorphic design system  
**Primary objective:** Integrate the incoming changes, systematically compare and enhance the legacy and modern application, validate real backend behavior and persistence, test all applicable deep links and interactive workflows across five responsive layouts, and deliver every completed surface through verified incremental commits and pushes.

---

# 1. Executive mandate

Continue from the existing remote developer's completed work and the additional changes pushed by the local developer.

Your first task is to verify and safely integrate commit `679af6be`. After integration, conduct a forensic comparison of the legacy application and the modern frontend, identify the highest-priority incomplete dashboard surface, implement the necessary improvements, validate the complete frontend-to-backend data flow, and prove functionality using Playwright.

Continue autonomously through the remaining authorized dashboard surfaces.

Do not stop after producing an audit, implementing one page, generating screenshots, or passing a production build.

The final outcome must be a modern, reliable, maintainable application that:

- Improves upon the legacy UI without losing valid existing functionality.
- Uses the established Cuba M3 Executive Glassmorphic design system consistently.
- Implements real interactions rather than decorative or fake controls.
- Displays real backend data accurately.
- Persists mutations correctly.
- Enforces authentication, authorization, and user-data isolation.
- Supports direct navigation and refresh on applicable deep links.
- Handles dialogs, forms, dropdowns, popovers, and confirmation flows correctly.
- Works across all five specified responsive layouts.
- Meets applicable WCAG 2.1 AA accessibility requirements.
- Has no known critical defects in the verified scope.
- Produces reproducible automated test results and reviewable evidence.
- Preserves existing developer work and repository history.
- Is delivered through meaningful incremental commits and verified pushes.

**Implement the application, not merely the appearance of the application.**

# 2. Mandatory first step: verify and integrate `679af6be`

The incoming commit is:

`679af6be`

The reported branch state is:

| Branch | Reported remote HEAD | Intended role |
|---|---|---|
| `origin/arena/8a774228-resumepilotai` | Synchronized | Authorized development branch |
| `origin/main` | Synchronized | Reference branch |

These are reported facts that must be verified against the actual repository. Do not assume the remote workspace has already received the changes.

## 2.1 Establish an independent workspace

Use the authorized remote developer's independent workspace.

The user's local directory:

`D:\xampp\htdocs\IME365`

is reference-only and must not be modified.

Do not overwrite or modify the user's local application, XAMPP configuration, local database, Apache configuration, certificates, environment variables, running services, or files.

Record:

- Independent workspace path.
- Repository root.
- Configured remotes.
- Current branch and upstream.
- Local and remote HEAD SHAs.
- Working-tree status.
- Existing uncommitted work.
- Last completed development milestone.

## 2.2 Inspect and fetch

Run appropriate, non-destructive Git commands:

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

Verify that:

1. `679af6be` resolves to the expected commit.
2. `origin/arena/8a774228-resumepilotai` contains the expected update.
3. `origin/main` has the reported relationship to the feature branch.
4. The remote workspace is on the correct development branch.
5. No existing work will be lost by integrating the update.

If the branches are not synchronized, investigate their histories and document the discrepancy. Do not assume that two branches are identical because their abbreviated SHAs were previously reported as equal.

## 2.3 Review the incoming change

The reported changes in `679af6be` include:

- Automated distribution synchronization through `scripts/sync-dist.mjs`, wired into the frontend build.
- Removal of internal template IDs, template names, versions, categories, and diagnostic labels from production-facing template sidebars and footers.
- Regeneration of 100 HTML template evidence artifacts in `docs/templates/evidence/`.

Verify these claims in the actual diff.

Inspect:

- Build-script behavior and destination paths.
- `frontend/package.json`.
- Template rendering and footer/sidebar components.
- All 100 template proof artifacts.
- API clients and backend contracts.
- Routing and navigation.
- Authentication and authorization.
- Existing tests and fixtures.
- Dependency and configuration changes.

Do not blindly trust generated evidence. Confirm that the artifacts correspond to the current renderers and actual implementation.

## 2.4 Safely integrate

- Preserve existing work.
- Do not blindly run `git reset --hard`, `git clean -fd`, or force-push.
- Do not rewrite shared history.
- Do not discard uncommitted changes.
- If the target commit is already an ancestor of HEAD, verify that its changes are present rather than applying them again.
- If histories have diverged, reconcile them deliberately and safely.
- Test the resulting workspace after integration.

Record the full SHA of the resulting HEAD and the integration method.

**No new feature work may begin until commit integration and baseline validation have been recorded.**

# 3. Protected build-output boundary

The frontend build invokes `scripts/sync-dist.mjs` to synchronize generated frontend assets into Apache's DocumentRoot (`dist/`).

Before running the build:

1. Read the complete script.
2. Identify how the destination path is calculated.
3. Resolve the source and destination to absolute paths.
4. Verify that the destination is inside the independent workspace or another explicitly authorized remote-development directory.
5. Verify that the script cannot overwrite the user's local `D:\xampp\htdocs\IME365` directory or unrelated files.
6. Inspect whether it deletes, cleans, or replaces existing destination content.
7. Verify that required output files are generated before synchronization.
8. Check that symlinks or path traversal cannot redirect writes outside the authorized destination.
9. Confirm that the script does not copy environment secrets or development configuration into production assets.

If the script writes to an unauthorized external directory, stop before running the destructive portion. Correct the script or use an approved isolated build destination and document the change.

Do not remove the distribution-sync functionality merely to avoid risk. Make it safe and preserve the intended workflow.

After validating the boundary, run the baseline build and record the actual result.

# 4. Technology stack and architecture contracts

Use the actual established architecture:

- **Modern frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, Radix UI, TanStack Query/Table, Lucide React.
- **Modern design system:** Cuba M3 Executive Glassmorphic standards and existing design tokens (`bg-surface`, `text-ink`, `border-border`).
- **Legacy reference:** React 18 JSX and SCSS components in `src/`.
- **Backend:** Node.js 20+ with Express 5.2.1, located at `backend/index.js`, expected to listen on port `8080`.
- **Database:** MariaDB/MySQL, expected on port `3306`, accessed through `mysql2`.
- **Migrations:** `backend/migrations/`.
- **Authentication:** Firebase Admin SDK with Bearer token validation (`Authorization: Bearer <token>`).
- **Reverse proxy:** Apache/PHP `api/index.php`, forwarding `/api/*` to `http://127.0.0.1:8080/api`.

Verify actual runtime versions, package manifests, routes, database configuration, authentication middleware, and scripts before relying on these assumptions.

## 4.1 Authentication invariant

Never confuse Firebase `auth_time`, which represents the original authentication time, with `iat`, which represents the token issue time.

Preserve the established authentication behavior. Do not weaken token validation, session checks, authorization, or expiry handling to make browser tests pass.

## 4.2 Strict legacy isolation & anti-copy-paste mandate

The legacy `src/` tree is a **read-only behavioral and visual reference**.

Do not copy-paste legacy JSX, SCSS, or complete legacy components into `frontend/`.

Reimplement the required functionality natively using the modern React 19, TypeScript, Tailwind CSS v4, Radix UI, and Cuba M3 architecture.

Shared behavior may be reproduced where necessary, but implementation must follow the modern frontend's existing abstractions and contracts.

Enforce this through code review, TypeScript strict checks (`npx tsc -b`), appropriate architecture checks, and production-build validation.

## 4.3 Shared components

Audit shared components before changing them, including:

`frontend/src/components/layout/cuba-app-shell.tsx`

Also inspect the real API client, route definitions, design tokens, shared forms, dialog primitives, table components, and notification infrastructure.

Before changing shared code, identify its consumers and plan regression tests for affected surfaces.

# 5. Forensic audit: legacy versus modern UI

Conduct a systematic comparison of the old and new application.

Inspect the actual source, run the application, and verify behavior in a browser. Reading a component file alone does not establish feature completeness.

## 5.1 Required comparison dimensions

For every applicable page, examine:

- Route and navigation behavior.
- Page structure and information hierarchy.
- Typography, spacing, alignment, and density.
- Cards, tables, badges, controls, and visual consistency.
- Forms, validation, and error messages.
- Search, filter, sorting, and pagination.
- Dialogs, popovers, dropdowns, and confirmation flows.
- Backend data sources and API contracts.
- Create, update, delete, and other mutations.
- Loading, empty, partial-data, success, and failure states.
- Authentication and authorization.
- Deep links, route parameters, and refresh behavior.
- Responsive behavior across all five viewport profiles.
- Keyboard interaction, focus management, and accessibility.
- Browser console errors and failed network requests.
- Existing tests, missing tests, and regression risks.

## 5.2 Required audit matrix

Create a page-by-page comparison matrix containing:

| Field | Required evidence |
|---|---|
| Surface | Page or feature name |
| Legacy route | Actual old route |
| Legacy file | Actual `src/` file |
| Modern route | Actual current route |
| Modern file | Actual `frontend/src/` file |
| Existing behavior | Verified features and workflows |
| Discrepancies | Specific differences and defects |
| Backend integration | Actual Express endpoint(s) |
| Persistence | Verified or unverified status |
| Deep links | Actual routes and parameters tested |
| Responsive findings | Results for all five profiles |
| Severity | P0, P1, P2, or P3 |
| Planned changes | Specific implementation work |
| Verification | Commands, browser tests, and evidence |
| Status | Not started, in progress, passed, blocked, or failed |

Severity definitions:

- **P0:** Critical security, data-integrity, application-blocking, or mandatory release defect.
- **P1:** Major broken functionality, important workflow failure, or serious responsive defect.
- **P2:** Significant usability, consistency, or non-critical functional defect.
- **P3:** Minor polish, refinement, or low-impact improvement.

Commit and push the initial audit and prioritized plan before beginning substantial surface work.

# 6. Autonomous dashboard candidate queue

After integrating the incoming update and establishing the baseline, inspect the actual application state and choose the next highest-value incomplete surface.

The initial priority queue is:

1. **Cover Letters & Builder**
   - `frontend/src/pages/dashboard/cover-letters.tsx`
   - `frontend/src/pages/dashboard/cover-letter-builder.tsx`
2. **ATS Score Analytics**
   - `frontend/src/pages/dashboard/ats-score.tsx`
3. **Job Tracker**
   - `frontend/src/pages/dashboard/job-tracker.tsx`
4. **AI Interview Coach**
   - `frontend/src/pages/dashboard/interview-coach.tsx`
5. **Messages & Chat**
   - `frontend/src/pages/dashboard/messages.tsx`
6. **Notifications Hub**
   - `frontend/src/pages/dashboard/notifications.tsx`
7. **Saved Favorites**
   - `frontend/src/pages/dashboard/favourites.tsx`
8. **AI Career Assistant**
   - `frontend/src/pages/dashboard/ai-assistant.tsx`
9. **Account, Security & Settings**
   - `frontend/src/pages/dashboard/settings.tsx`
10. **Help Desk & Support**
    - `frontend/src/pages/dashboard/support.tsx`
11. **Overview Dashboard**
    - `frontend/src/pages/dashboard/overview.tsx`
12. **Resumes & Master CV**
    - `frontend/src/pages/dashboard/resumes.tsx`
    - `frontend/src/pages/dashboard/resume-builder.tsx`
13. **Public Portfolio**
    - `frontend/src/pages/portfolio/`

These paths are expected starting points. Verify them against the repository's actual files and router.

## 6.1 Deferred scope

Also maintain a deferred backlog for these potentially separate surfaces:

- Job Intelligence.
- Browse Job Portal.
- Subscription & Plans.
- Security & 2FA Hub as a distinct workflow, if not fully covered by Settings.
- Master Profile as a distinct workflow, if not fully covered by Resumes & Master CV.

Do not silently exclude these surfaces if they are part of the authorized application scope. Record whether each is implemented, integrated into another surface, intentionally deferred, or not found in the current codebase.

## 6.2 Selection rules

Before selecting a candidate:

1. Inspect its current implementation and legacy equivalent.
2. Determine whether recent commits already changed it.
3. Check prior completion reports and existing tests.
4. Identify dependencies on shared components, APIs, authentication, and schemas.
5. Review severity and user impact.
6. Prefer the highest-value surface that can be completed and verified coherently.
7. Avoid duplicating completed work.
8. Fix shared blockers first where this is safer and more efficient.

Record the reason for selecting each surface. After finishing and verifying it, move to the next candidate autonomously.

Do not ask the user to select every subsequent page.

# 7. Surface implementation lifecycle

For every selected surface, execute the complete workflow.

## Step A — Establish the baseline

- Start the frontend and backend using the repository's actual scripts.
- Confirm the frontend is available on the expected development port, normally `4000`.
- Confirm the backend is available on the expected port, normally `8080`.
- Confirm the database connection and required migrations.
- Inspect legacy and modern implementations.
- Capture baseline screenshots.
- Enumerate controls, routes, dialogs, and API calls.
- Record console errors and network failures.
- Run relevant existing tests.

Use authorized test accounts and data. Never expose production credentials or personal data.

## Step B — Build the functional inventory

Document the user's goal, page sections, available actions, form fields, validation rules, backend operations, expected persisted effects, error states, access-control requirements, and responsive expectations.

## Step C — Implement the improvements

Make focused, maintainable changes that improve:

- Information hierarchy.
- Cuba M3 visual consistency.
- Typography, spacing, and information density.
- Clear primary and secondary actions.
- Search, filters, sorting, and pagination where relevant.
- Form validation and accessible error messages.
- Loading, empty, success, and failure states.
- Modal, popover, and dropdown behavior.
- Responsive navigation and layouts.
- Keyboard accessibility.
- Real data refresh and mutation behavior.
- Error recovery.
- Elimination of dead controls and fake interactions.

Do not add decorative features that do not support the user's actual workflow.

## Step D — Verify real behavior and persistence

Execute critical user journeys in a browser.

Verify the expected API call, backend response, resulting UI state, and persisted side effect. Reload or revisit the page to confirm the saved state is correct.

## Step E — Compare and retest

Capture updated screenshots. Compare them against the legacy baseline and new design criteria. Resolve unintended visual regressions and rerun affected tests.

**Intentional visual improvements are not regressions.** Document intentional changes and ensure they preserve valid business behavior, accessibility, and user expectations.

## Step F — Commit and push

Commit the completed, tested work using Section 13. Verify the remote push before beginning the next substantial workstream.

# 8. Real backend integration and data integrity

A visually polished page with fake data, hard-coded success messages, or nonfunctional controls fails acceptance.

Validate the complete data path:

`UI → frontend/src/lib/api-client.ts → Bearer authentication → Express route → business logic → MariaDB/MySQL → response envelope → UI state`

Verify the actual endpoint paths and contracts from the codebase.

## Required checks

- Each implemented feature uses the correct backend endpoint.
- Request and response structures match the real contract.
- Authentication and authorization are enforced server-side.
- User ownership and tenant isolation work correctly where applicable.
- Loading, timeout, cancellation, retry, and error behavior are appropriate.
- Creates, updates, and deletes persist correctly.
- Changes remain correct after a full page reload.
- Search, filters, sorting, and pagination reflect real data.
- Dashboard metrics agree with their source records.
- Empty and partial datasets render correctly.
- Missing or malformed fields do not crash the page.
- Mutations invalidate or refresh relevant cached data.
- Backend validation errors are communicated correctly.
- Unauthorized users cannot access protected records.
- One user's data cannot leak into another user's session.
- Database migrations and schema changes are correct when required.
- Errors do not result in false success messages.

## Fixtures and mocks

- Use real backend integration for end-to-end acceptance tests.
- Use mocks for isolated unit tests or genuinely unavailable external dependencies.
- Clearly label mocked tests and simulated responses.
- Never present fixtures as live production data.
- Never bypass authentication to make a browser test pass.
- Never populate production records with dummy data merely to improve a screenshot.

If credentials, database access, or an external provider are unavailable, complete safe independent work and report the precise limitation. Do not claim the real-backend test passed.

# 9. Five-layout responsive testing

Playwright coverage must include all five required responsive profiles.

| Profile | Viewport | Required focus |
|---|---:|---|
| Large desktop | 1920 × 1080 | Wide-screen hierarchy, alignment, density |
| Standard laptop | 1366 × 768 | Primary workflow, vertical rhythm |
| Tablet | 1024 × 768 | Adaptive columns, sidebar, touch usability |
| Mobile | 390 × 844 | Stacked layouts, mobile navigation, dialogs |
| Small mobile | 320 × 568 | Minimum-width usability and overflow |

Use the existing Playwright configuration and approved browser/device emulation. Record the actual viewport and browser for every run.

## 9.1 Required coverage at every profile

For each applicable surface, test:

- Initial route load and layout rendering.
- Sidebar, top navigation, and responsive drawer.
- Primary and secondary actions.
- Forms, field validation, and submissions.
- Search, filtering, sorting, and pagination.
- Modal, dropdown, popover, and confirmation behavior.
- Open, close, cancel, confirm, and Escape behavior where applicable.
- Keyboard navigation and focus management.
- Deep-link entry and direct refresh.
- Browser back and forward navigation.
- Loading, empty, error, and success states.
- Console errors and unexpected network failures.
- Text wrapping, horizontal overflow, and off-screen controls.
- Applicable API mutations and resulting UI state.

For every critical workflow, verify at least one successful path and one relevant validation or failure path across the five-profile test matrix.

For data-mutating workflows, verify persistence after reload at each profile where the workflow is applicable. For destructive and security-sensitive workflows, use authorized test data and verify the intended outcome.

Do not substitute five screenshot-only checks for five responsive behavioral tests.

## 9.2 Responsive quality criteria

Inspect:

- Unintended horizontal scrolling.
- Clipped text, buttons, and form fields.
- Overlapping cards and controls.
- Unusable tables or navigation.
- Dialogs whose actions fall off-screen.
- Hidden content without a usable alternative.
- Inadequate touch targets.
- Broken scrolling or sticky elements obscuring content.
- Mispositioned popovers and dropdowns.
- Desktop-only behavior on mobile.
- Excessive whitespace or cramped layouts.
- Incorrect page heights and viewport calculations.

Capture before-and-after screenshots at the five profiles.

The acceptance target is **zero critical responsive defects and zero unintended overflow in the verified scope**. Document any intentional horizontal scrolling or product-approved layout exception.

# 10. Deep links, routes, modals, and popups

## 10.1 Deep-link inventory

Discover actual routes from the router, navigation, links, and legacy implementation.

Test applicable routes with:

- Direct URL entry.
- Required path and query parameters.
- Refresh on the target route.
- Navigation from the dashboard.
- Browser back and forward.
- Missing or malformed parameters.
- Unauthorized access.
- Deleted or unavailable records.
- Invalid identifiers.
- Correct 404, forbidden, empty, and error states.
- Correct redirects where intentionally configured.

Do not invent routes or mark nonexistent routes as supported. Record canonical routes and intentional redirects.

## 10.2 Modal and popup testing

For each relevant dialog, popover, dropdown, and confirmation flow, verify:

1. The correct trigger opens the expected interface.
2. It is visible and correctly positioned.
3. It displays the correct real data.
4. Inputs and validation behave correctly.
5. Primary and secondary actions execute the intended operation.
6. Cancel and close controls work.
7. Escape dismisses the dialog where supported.
8. Focus enters the dialog and returns to the trigger.
9. Focus remains within modal content when appropriate.
10. Background scrolling behaves correctly.
11. Failed API operations do not falsely report success.
12. Mobile dialogs remain fully usable at 390px and 320px.
13. Destructive actions require appropriate confirmation.
14. Reopening the dialog does not display stale or incorrect state.

Do not add unnecessary nested dialogs merely to increase test coverage.

# 11. Backend, database, and frontend quality gates

Discover the repository's actual scripts and test infrastructure before defining commands. Do not assume every package has the same scripts or that every test file exists.

## 11.1 Incoming-change baseline

After reviewing the build-sync script and verifying its destination is safe, run the production build and available template regression checks.

The following are known test candidates; verify the files exist and use the repository's actual commands:

```bash
cd frontend
npm run build
npx tsc -b
```

```bash
node --test \
  tests/test-footer-sidebar-cleanliness.mjs \
  tests/dir008-template-deep-dives.test.mjs \
  tests/template-production-render.test.mjs
```

Run these from the repository root, adjusting paths only after verifying the actual file locations.

Record each command's actual exit code, result, and output summary.

## 11.2 Frontend gates

- TypeScript strict build: zero errors.
- Production build: successful.
- Relevant unit and integration tests: passing.
- No unresolved imports or missing assets in the changed scope.
- No new React key warnings.
- No new controlled/uncontrolled input warnings.
- No unhandled runtime exceptions.
- No unhandled promise rejections.
- No newly introduced relevant console warnings.
- No broken internal navigation in the validated scope.

## 11.3 Backend gates

Inspect the actual backend package scripts, routes, middleware, database configuration, migrations, and tests.

Run all applicable:

- Backend unit tests.
- Express route and integration tests.
- Authentication and authorization tests.
- Request/response validation tests.
- Database connection checks.
- Migration validation.
- Read/write persistence tests.
- User ownership and data-isolation tests.
- Error handling and invalid-input tests.

Verify at least one representative real-data read and one authorized write/read-back operation for each changed data domain where applicable.

Use a safe test database and authorized test account. Never run destructive tests against production data.

## 11.4 End-to-end gates

Run Playwright across the five responsive profiles for each completed surface.

Verify:

- Critical user journeys.
- Real backend interaction.
- Persistence after reload.
- Deep-link behavior.
- Dialog and popup behavior.
- Responsive navigation and layout.
- Keyboard and accessibility behavior.
- Authorization boundaries where applicable.
- No critical console or network errors.

## 11.5 Warnings and failures

The target is zero known preventable errors and warnings in the changed and tested scope.

Record separately:

- Pre-existing warnings.
- Newly introduced warnings.
- Warnings resolved.
- Remaining relevant warnings.
- Environment-generated warnings.
- Failed tests.
- Blocked tests.
- Tests that did not execute.

Do not disable logging, weaken assertions, or suppress meaningful warnings to obtain a passing result.

## 11.6 Performance

Measure build and relevant runtime performance rather than assuming they meet a target.

Record actual build duration, command, and environment. Optimize when practical without sacrificing correctness or test coverage.

Do not claim zero bugs across the entire application simply because a subset of tests passes. The defensible acceptance standard is zero known critical defects in the verified scope, with all mandatory acceptance tests passing.

# 12. Accessibility and interaction quality

Target WCAG 2.1 AA for the applicable UI.

Verify:

- Semantic headings and landmarks.
- Accessible names for controls.
- Visible keyboard focus.
- Logical keyboard navigation.
- Dialog focus entry, containment, and restoration.
- Appropriate Escape behavior.
- Form labels and validation announcements.
- Sufficient text and interactive-state contrast.
- Status messages accessible to assistive technologies.
- Touch target usability.
- Reduced-motion preferences where applicable.
- Screen-reader-friendly button and field descriptions.

Use automated accessibility tests and manual keyboard review. Do not claim complete WCAG conformance solely from automated scanning.

# 13. Mandatory incremental commits and pushes

All application changes must be made on the authorized development branch:

`arena/8a774228-resumepilotai`

The `main` branch is **reference-only for this task**. Do not push application changes directly to `main` unless an authorized maintainer explicitly approves a different workflow.

## 13.1 Milestone sequence

- **C0 — Incoming update:** Verify `679af6be`, inspect the diff, integrate safely, and record baseline results.
- **C1 — Audit:** Commit the comparison matrix, route inventory, severity assessment, and prioritized plan.
- **C2 — Shared infrastructure:** Commit completed shared component, design-system, routing, accessibility, or test infrastructure improvements.
- **C3 onward — Surface delivery:** Commit and push each completed, tested dashboard surface separately.
- **C-final — Regression and evidence:** Commit the final acceptance summaries, verified test reports, and release documentation.

Split large changes into smaller meaningful commits when this improves reviewability. Do not create empty commits or artificial checkpoints.

## 13.2 Before every commit

- Inspect `git status`.
- Review the complete diff.
- Run the relevant tests.
- Check for secrets, credentials, personal data, debug statements, generated clutter, and unrelated changes.
- Confirm the staged files match the intended scope.
- Use an accurate, descriptive commit message.

## 13.3 Before every push

1. Fetch the latest authorized remote state.
2. Verify the branch and upstream.
3. Confirm the current branch is `arena/8a774228-resumepilotai`.
4. Inspect concurrent work and any divergence.
5. Reconcile changes safely.
6. Rerun affected tests if integration changes code.
7. Push without force.
8. Fetch again.
9. Verify that the remote branch contains the pushed commit.
10. Record the full SHA and confirmation.

If a push is rejected, investigate and safely reconcile the cause. Do not force-push or overwrite another developer's work.

## 13.4 Suggested commit messages

```text
docs(ui-audit): compare legacy and modern dashboard surfaces
fix(responsive): correct shared navigation and overflow
feat(cover-letters): complete persisted builder workflows
feat(ats-analytics): connect scoring to real backend data
fix(job-tracker): correct mutation and persistence behavior
fix(modals): restore keyboard dismissal and focus handling
test(ui): verify five responsive profiles and deep links
test(backend): validate authorization and data persistence
docs(quality): publish verified surface acceptance results
```

Use only messages that accurately describe the actual changes.

# 14. Regression protection

Every change must preserve existing functionality outside its intended scope.

Before modifying shared code:

- Identify all consumers.
- Review the current component and design-system contracts.
- Identify likely regressions.
- Add relevant tests.
- Test the selected surface and representative dependent surfaces.

After shared-component changes, rerun all affected regression tests.

Distinguish intentional visual redesign from genuine regression:

- **Intentional improvement:** A documented design change that improves usability and preserves required functionality.
- **Unintended regression:** A broken workflow, lost information, inconsistent state, inaccessible control, unauthorized access, incorrect data, or defective layout introduced by a change.

The requirement is **zero unintended visual or functional regressions**, not identical screenshots between the old and new designs.

Do not fix a frontend problem by breaking the backend. Do not conceal a backend defect with a frontend-only workaround.

# 15. Evidence and deliverables

Maintain reviewable artifacts in the repository's established documentation structure.

Required deliverables:

- Incoming commit review and integration record.
- Baseline test report.
- Legacy-versus-modern comparison matrix.
- Route and deep-link inventory.
- Candidate selection rationale.
- Surface completion ledger.
- Before-and-after screenshots.
- Five-layout Playwright results for every completed surface.
- Modal and popup test results.
- Backend and database validation results.
- Console and network diagnostics.
- Accessibility findings.
- Regression results.
- Commit and push ledger.
- Remaining issues and blockers.
- Final release report.

For each completed surface, record:

1. Legacy and modern routes.
2. Relevant legacy and modern files.
3. Discrepancies discovered.
4. Changes implemented.
5. Backend endpoints and data flows verified.
6. Persistence checks performed.
7. Main workflows tested.
8. Deep links tested.
9. Modal and popup tests.
10. Five viewport results.
11. Test counts and actual pass/fail/blocked status.
12. Screenshots and evidence paths.
13. Commit SHA and push confirmation.
14. Remaining issues.

Screenshots and test reports must come from actual executions. Do not fabricate results.

# 16. Definition of done for each surface

A surface is complete only when all applicable requirements pass.

- [ ] Legacy and modern implementations inspected.
- [ ] Discrepancies documented.
- [ ] Modern UI improvements implemented.
- [ ] Required features and actions function correctly.
- [ ] Correct backend endpoints are used.
- [ ] Real data is displayed accurately.
- [ ] Applicable mutations persist.
- [ ] Data remains correct after reload.
- [ ] Loading, empty, success, and failure states work.
- [ ] Deep links and refresh work.
- [ ] Modals, popovers, forms, and confirmation flows work.
- [ ] Authorization and sensitive-data boundaries are verified.
- [ ] Playwright tests pass at 1920 × 1080.
- [ ] Playwright tests pass at 1366 × 768.
- [ ] Playwright tests pass at 1024 × 768.
- [ ] Playwright tests pass at 390 × 844.
- [ ] Playwright tests pass at 320 × 568.
- [ ] Critical workflows include success and failure/validation paths.
- [ ] Relevant persistence checks pass.
- [ ] No critical unintended visual defects remain.
- [ ] No new relevant runtime errors or warnings remain.
- [ ] Relevant frontend and backend regression tests pass.
- [ ] Accessibility checks are completed for the applicable scope.
- [ ] Evidence is captured and documented.
- [ ] Changes are committed and pushed.
- [ ] The remote commit SHA is verified.

If a criterion cannot be executed, label it blocked or unverified. Do not mark the surface fully complete.

# 17. Autonomous continuation protocol

Repeat the following cycle until the authorized scope is complete:

1. Verify repository state and incoming changes.
2. Audit the next highest-value incomplete surface.
3. Record the selection rationale.
4. Implement modern UI/UX improvements.
5. Validate real backend integration.
6. Test persistence and data correctness.
7. Verify deep links and modal workflows.
8. Run Playwright at all five viewport profiles.
9. Review console, network, accessibility, and visual results.
10. Fix failures and rerun affected tests.
11. Update the comparison and acceptance matrices.
12. Commit and push the completed work.
13. Verify the remote SHA.
14. Move to the next candidate.

Continue autonomously without asking the user to select every page.

If a critical dependency or external service is unavailable, continue independent work and document the exact blocker. Do not report blocked checks as passed.

# 18. Final report and certification

At the end of the authorized work, provide the following.

## A. Repository status

- Independent workspace path.
- Incoming commit `679af6be` verification and integration method.
- Initial and final full commit SHAs.
- Final development branch and upstream.
- Reference branch relationship.
- Commit-by-commit delivery ledger.
- Push verification for each milestone.
- Final working-tree status.

## B. UI/UX status

- Surfaces audited.
- Surfaces enhanced.
- Surfaces fully verified.
- Surfaces remaining.
- Most significant legacy-versus-modern discrepancies.
- Intentional design improvements.
- Remaining defects and severity.

## C. Backend and data status

- Endpoints and data flows verified.
- Backend test results.
- Database connection and migration results.
- Read/write persistence results.
- Authentication and authorization results.
- User-data isolation results.
- External dependencies not verified.

## D. Browser status

- Playwright results by surface.
- Results for all five responsive profiles.
- Deep-link coverage.
- Modal and popup coverage.
- Console and network diagnostics.
- Accessibility findings.
- Screenshots and evidence locations.
- Failed, blocked, and unexecuted tests.

## E. Final certification

Use exactly one status:

**PASS — VERIFIED**

All mandatory acceptance criteria for the declared scope pass with evidence. No known critical defects remain in that scope, all required tests executed successfully, and the changes are committed and pushed.

**PARTIAL — BLOCKED**

Some work is complete, but required checks could not execute or unresolved requirements remain. List each blocker and its impact.

**FAIL — NOT ACCEPTED**

Critical functionality, data integrity, authorization, responsive behavior, or mandatory tests fail.

Never claim the entire application is bug-free solely because selected pages pass. Clearly state the exact surfaces, workflows, and integrations verified.

# Final execution instruction

Begin immediately with Git synchronization.

Fetch and inspect `679af6be`. Verify the reported branch relationship. Safely integrate the incoming update into the independent remote workspace, verify the distribution-sync script's write boundary, and run the baseline build and applicable template tests.

Then perform the forensic legacy-versus-modern audit, select the next incomplete dashboard surface autonomously, and carry it through implementation, real-backend validation, database persistence testing, deep-link and modal verification, five-layout Playwright testing, regression checks, evidence capture, and incremental commit/push.

Continue to the next candidate after each completed and verified workstream.

Preserve all previous work. Never push application changes directly to `main` without explicit authorization. Do not modify the user's local environment. Do not use fake production data, hide warnings, skip failures, or report unverified behavior as working.

**Deliver a progressively improved, genuinely functional, backend-connected, responsive, tested, and evidence-backed IME365 application—not merely an audit, a redesigned static interface, or a passing build.**
