# DIR-095 — Candidate Dashboard Streamlining — Evidence

**Directive:** DIR-095 (P0) · **Status:** implementation complete, awaiting Lead review
**Branch:** `arena/f4651d36-resumepilotai` · **HEAD:** `2a56aa56`

## Change set (surgical)
| File | +/− | Purpose |
|---|---|---|
| `src/components/Dashboard/DashboardHomepage/DashboardHomepage.jsx` | +15 / −0 | AC1 — suppress the redundant resume workspace in Cuba mode via a single `{!isCuba && (<>…</>)}` guard + forensic comment |
| `tests/dir095-candidate-dashboard-data-lineage.test.mjs` | +47 / −18 | AC1 — realign AC2/AC3 assertions to pin the Cuba-mode REMOVAL |
| `src/cv-templates/**` | **0 bytes** | invariant preserved |

## Acceptance criteria
- **AC1 — Removal**: the category tabs (`All Resumes (n)`), search box, sort dropdown
  (`cuba-resume-sort`), grid/list toggle (`cuba-resume-view-toggle`), horizontal resume
  carousel (`cuba-resume-updated` cards), the `+ Create a New Resume` card and the
  `Page X of Y` pagination are **ABSENT** from the authenticated live `/dashboard` DOM.
- **AC2 — Retention**: `cuba-candidate-hero`, `cuba-copilot-hud`, `cuba-copilot-insight`
  (the measured next-best-action line), `cuba-executive-rail` and `cuba-candidate-analytics`
  are all **PRESENT**.
- **AC3/AC4 — Sidebar**: 15/15 declared destinations load cleanly with `aria-current="page"`.
- **AC5 — Responsive**: zero horizontal overflow at 320/375/768/1024/1280/1440/1920px.
- **AC6 — WCAG**: covered by `test:design-system` (142/142) Cuba accessibility contracts and
  the live route sweep (0 console errors, active-route state on every route).
- **AC7 — Tests**: 178 pass / 0 fail.
- **AC8 — Gates**: `npm run build` exit 0 (3.41s); `npm run lint` 0 errors;
  `src/cv-templates` diff = 0 bytes.

## Artifacts
- `dir095-dashboard-crawl-manifest.json` — authenticated real-data DOM crawl → **PASS**
  (0 console errors, 0 failed `/api` responses).
- `dir095-sidebar-route-matrix.json` — 15/15 routes clean → **PASS**.
- `dir095-dashboard-streamlined-1920.png`, `dir095-dashboard-streamlined-375.png`.
- `dir095-tests.log`, `dir095-build.log`, `dir095-lint.log`.

## Honest notes / limitations
1. The literal `Next Best Action • ATS Score: X/100` card is **legacy-only by design**
   (`if (isCubaShellEnabled()) return null;`, DIR-090). The Cuba Overview's next-best-action
   surface is the Hero HUD insight line (`cuba-copilot-insight`), derived from the real
   `bestScore`. No fabricated guidance was added.
2. The platform-wide `audit:contrast` (DIR-023) reports **pre-existing** contrast failures on
   OTHER surfaces (public marketing, enterprise console). None are on the candidate Overview
   and none are introduced by this change (the diff adds no UI).
3. The XAMPP-served app uses Vite `base: '/'`, so the router matches at the ROOT origin
   (`http://localhost`). Serving the same dist under `/IME365/` loads the bundle but the router
   then 404s every path — this is a deployment-path observation, not a DIR-095 regression.
