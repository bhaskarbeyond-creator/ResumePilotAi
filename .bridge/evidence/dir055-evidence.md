# DIR-055 — Evidence Pack

**Directive:** DIR-055 — Unified Executive Builder Header ("Best of Both Worlds") & Real Interactive Notifications Pipeline
**Status at submission:** IN_PROGRESS → all 12 steps executed
**Project:** IME365 (`D:\xampp\htdocs\IME365`)

---

## 1. Step ledger

| Step | Deliverable | Status | Proof |
|---|---|---|---|
| S1 | Pure `resolveNotificationHref` module (type → real mounted route) | DONE | `src/components/cuba/resolveNotificationHref.js` |
| S2 | `M3NotificationCenter` rebuilt: derived routes, per-row read toggle, mark-all-read, kind icons, honest timestamps, dead footer removed | DONE | `src/components/cuba/M3NotificationCenter.jsx` |
| S3 | Owner-scoped `POST /api/notifications-data/mark-all-read` | DONE | `backend/routes/notificationsData.js` |
| S4 | `hideTopBar` prop + stop passing the dead `onOpenAll` | DONE | `CubaAppShell.jsx`, `CubaCandidateShell.jsx` |
| S5 | `hideTopBar` driven by `isApplicationShellRoute(location.pathname)` — the predicate's FIRST production consumer | DONE | `CubaCandidateShell.jsx:413` |
| S6 | `BuildResume` top bar → Cuba glass surface (`cuba-glass` + `shadow-cuba-xl` + `cuba-focusable`), every legacy control retained, 11-step ribbon intact | DONE | `BuildResume.jsx:1778`, `:1993` |
| S7 | Builder header self-hosts `M3NotificationCenter` + `M3UserMenu` sourced from `AuthContext` | DONE | `BuildResume.jsx` (imports + right rail) |
| S8 | All UX states: `CubaSkeleton` / `CubaEmptyState` / `CubaErrorState` + optimistic mark-read with rollback | DONE | `M3NotificationCenter.jsx` |
| S9 | Guarded dry-run-by-default remediation script (`--uid` mandatory, `--apply` gated, never deletes, no fabrication) | DONE | `scripts/dir055-remediate-notifications.mjs` |
| S10 | Unit suites: `tests/dir055-notifications.test.mjs` + `tests/dir055-builder-header.test.mjs` | DONE | 33/33 |
| S11 | Playwright e2e: `playwright.dir055.config.js` + `tests/e2e/dir0055-builder-notifications.spec.js` | DONE | 7 passed / 1 skipped / 0 failed |
| S12 | Gates + this evidence pack | DONE | below |

---

## 2. Gate results

| Gate | Command | Result |
|---|---|---|
| Unit (notifications) | `node --test tests/dir055-notifications.test.mjs` | **23/23 pass, 0 fail** |
| Unit (builder header) | `node --test tests/dir055-builder-header.test.mjs` | **10/10 pass, 0 fail** |
| E2E (real DOM) | `npx playwright test --config=playwright.dir055.config.js` | **7 passed, 1 skipped, 0 failed** |
| Regression | `node --test` (dir055 + lifecycle + build-resume-shell + design-system + candidate-portal) | **80/80 pass, 0 fail** |
| Lint | `eslint` on every changed file | **0 errors** (pre-existing warnings only) |
| Build | `npm run build` | **exit 0** |

---

## 3. E2E acceptance criteria

| AC | Assertion | Result |
|---|---|---|
| AC-1 | Exactly ONE **top bar** on a builder route (`header.sticky.top-0`), and it is the builder's | PASS |
| AC-2 | Top bar is `cuba-glass` + `shadow-cuba-xl`, no `bg-white/95`; Dashboard exit, editable title, template pill, Preview, Download all visible | PASS |
| AC-3 | The 11-step ribbon renders exactly 11 labelled steps and carries the glass surface | PASS |
| AC-4 | ATS pill opens the drawer | SKIPPED — ATS module flag is off in this fixture (recorded, not asserted) |
| AC-5 | `M3NotificationCenter` + `M3UserMenu` live INSIDE the single top bar; the menu shows the REAL authenticated email | PASS |
| AC-6 | ZERO dead hrefs: 2 rows are real `<button>`s with `data-navigable="true"` and one navigates; the unknown type renders as a `div`, not a dead button | PASS |
| AC-7 | Mark-all-read decrements the bell badge 2 → 0 and the badge element disappears | PASS |
| AC-8 | 0 console errors, 0 native dialogs, exactly 1 top bar at 375 / 768 / 1280 | PASS |

---

## 4. Defects found and fixed DURING certification

1. **`_settingsSource` was missing from the e2e public-config fixture.** `main.jsx:402` gates the
   ENTIRE app on `/^mariadb(?:$|-)/.test(publicConfig._settingsSource)`. Without it every test
   rendered the "Service temporarily unavailable" maintenance screen. The fixture now serves
   `_settingsSource: 'mariadb-authoritative'`.

2. **REAL PRODUCT BUG — the builder title could vanish.** `truncate` sets `overflow:hidden`, which
   makes a flex item's automatic minimum size resolve to **0**. Once the right rail gained the
   notification + identity controls (S7), the resume title was squeezed to a zero-size box and
   disappeared at 1280px. Fixed with explicit floors (`min-w-[5rem]` on the button,
   `min-w-[6rem]` on its container) and pinned by a regression test.

3. **Assertion defect (mine).** "Exactly one header" was measured as `page.locator('header')`, but
   `BuildResume/components/StepShell.jsx:69` legitimately renders a per-step CARD heading as a
   `<header>`. The assertion now targets the top bar (`header.sticky.top-0`), which is what the
   double-header defect was actually about.

4. **Assertion defect (mine).** `getByRole('button', { name: 'Preview' })` was a strict-mode
   violation — a footer also renders a "Preview" button. All header assertions are now scoped to
   the top bar.

---

## 5. Honest limitations

- **AC-4 is skipped, not passed.** The ATS module flag is off in the hermetic fixture, so the ATS
  drawer could not be exercised. It is recorded rather than asserted, so a module flag can never
  masquerade as a regression.
- **The S9 remediation script was DRY-RUN only.** It was proven against live MariaDB
  (17/17 placeholder rows resolvable, 0 fabricated) but `--apply` was deliberately NOT executed:
  it mutates live data and that is the Lead/user's call. See
  `.bridge/evidence/dir055-s9-remediation-dryrun.txt`.
- **The e2e suite is hermetic** (fixture-served `/api/*`), so it proves the UI contract, not the
  live backend. The live backend contract is covered by the unit suites + the S9 dry run.
