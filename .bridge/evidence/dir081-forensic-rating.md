# DIR-081 — Candidate Suite Forensic Rating, SWOT & RCA

**Scope:** all 15 Candidate Suite surfaces. **Method:** static AST/token forensics on the
real files (`cuba-` design-token usage vs legacy `slate/gray/blue/indigo/rose/purple`
utilities, responsive breakpoint count, Cuba primitive adoption), plus control-flow
inspection of every loading / empty / error guard. No fabricated numbers.

## 1. Independent TRUE rating (unflinching)

The external reviewer's **2/10 is not defensible**: the shell (sidebar, header, brand
block, ⌘K palette, notification centre, favourites, notifications workspace) is genuinely
M3/Cuba after DIR-072→DIR-080, the build is 2.78s, and 223+ pinned tests pass. But **10/10
is equally indefensible**: 8 of 15 page *bodies* are still legacy. The honest composite is
**6.2 / 10**, with a sharp split: **chrome ≈ 8.5/10, page bodies ≈ 6.0/10, weakest five
pages ≈ 4.0–5.0/10**.

| # | Page | Primary file | cuba- | slate | gray | legacy colour | breakpoints | Cuba primitives | TRUE rating |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Overview | `Dashboard/DashboardHomepage/DashboardHomepage.jsx` | 29 | 99 | 19 | 78 | 83 | 0 | **7.5** |
| 2 | Resumes | `Dashboard/ResumesList/ResumesList.jsx` (+`BuildResume/BuildResume.jsx`) | 0 (8) | 6 (140) | 0 | 6 (94) | **0** (38) | 0 | **6.5** |
| 3 | Cover Letters | `Dashboard/CoversList/CoversList.jsx` (+`CoverLetter/CoverLetter.jsx`) | 0 (60) | 0 | 0 | 6 | **0** | 0 | **4.5** |
| 4 | Portfolios | `Dashboard/DashboardPortfolios/DashboardPortfolios.jsx` | 13 | 51 | 3 | 4 | 16 | 0 | **6.0** |
| 5 | Favorites | `Dashboard/DashboardFavourites/DashboardFavourites.jsx` | 14 | 0 | 0 | 0 | 3 | **6** | **8.5** |
| 6 | Notifications | `Dashboard/DashboardNotifications/DashboardNotifications.jsx` | 22 | 0 | 0 | 0 | 2 | **15** | **8.5** |
| 7 | Jobs | `JobsListings/MainJobListings.jsx` (+`JobCard.jsx`) | 14 (3) | 33 (43) | 0 | 20 (45) | 11 (9) | 0 | **6.0** |
| 8 | Job Tracker | `AppliedJobs/JobTracker.jsx` | 81 | 0 | 0 | 0 | 18 | 0 | **6.5**¹ |
| 9 | Submitted Applications | `AppliedJobs/AppliedJobs.jsx` | 124 | 0 | 0 | 0 | 26 | 0 | **6.5**¹ |
| 10 | Interview Coach | `Dashboard/DashboardInterviews/DashboardInterviews.jsx` | **1** | **361** | 0 | **378** | 104 | 0 | **4.0** |
| 11 | Messages | `Dashboard/DashboardMessages/DashboardMessages.jsx` | 45 | 0 | 1 | 0 | **1** | 0 | **6.0** |
| 12 | Plans | `Billing/Plans/Plans.jsx` | 301 | 0 | 0 | 0 | 22 | 0 | **7.5** |
| 13 | Master Profile | `Dashboard/DashboardSettings/DashboardSettings.jsx` | **0** | **748** | 0 | **489** | 156 | 0 | **4.5** |
| 14 | Security & 2FA | `Dashboard/DashboardSettings/DashboardSettings.jsx` (Account pane) | **0** | **748** | 0 | **489** | 156 | 0 | **4.5**² |
| 15 | Support | `Dashboard/DashboardSupport/DashboardSupport.jsx` | **0** | 112 | 0 | 71 | 19 | 0 | **5.0** |

¹ The token styling is clean, but the three full-page guards make every non-happy state a
blank page (§3.1) — the styling score is offset by the catastrophic state handling.
² Plus the hard navigation defect (§3.3): this page can never be highlighted.

**Composite: 6.2/10.** Ceiling is set by the five legacy bodies (Interview Coach 4.0,
Cover Letters 4.5, Master Profile 4.5, Security 4.5, Support 5.0).

## 2. SWOT

**Strengths** — Cuba chrome (shell/header/brand block/sidebar/drawer/tab bar) is authentic
M3 and now coherent (DIR-072→080); Favorites and Notifications are the reference
implementation (real `CubaPageHeader` + `CubaEmptyState`, honest empty copy, zero legacy
utilities); Job Tracker / Applied Applications have clean token usage (81 / 124 `cuba-`, 0
legacy colour utilities); Plans is fully tokenised (301 `cuba-`); the design-system
primitives already exist (`CubaPageHeader`, `CubaStatCard`, `CubaSkeleton`, `CubaErrorState`,
`CubaEmptyState`, `CubaModal`) so no new primitives are needed.

**Weaknesses** — 13 of 15 pages hand-roll their own header (`<CubaPageHeader>` appears in
only `DashboardFavourites.jsx:319` and `DashboardNotifications.jsx:163`); **zero** page body
uses `CubaSkeleton`/`CubaStatCard`/`CubaErrorState`; Interview Coach is a legacy page in a
Cuba shell (1 vs 378); Settings/Profile/Security is the largest legacy surface (748 slate,
489 legacy colour, 0 cuba, 5,873 lines); Cover Letters and Resumes have **0 responsive
breakpoints**; Messages has **1**; there is no split-view anywhere in the suite.

**Opportunities** — adopt one shared page frame so loading/empty/error states compose

## 3. RCA — the five named deficiencies, verified

### 3.1 CONFIRMED — Job Tracker & Submitted Applications catastrophic layout collapse
Both components render their page header, stat row, filters and board **inside the single
main return**, but place their three state guards *before* it, so every non-happy state
replaces the entire page body with a bare element:

* `JobTracker.jsx:506` — `if (!user?.uid) return <main className="p-8 text-center" …>Sign in to use your private job tracker.</main>` → whole page = one line of text.
* `JobTracker.jsx:507-511` — `if (loading) return <main className="flex min-h-64 items-center justify-center" aria-busy="true">… Loading job tracker…` → no skeleton, no header, no board; a 256px-tall centred string on an otherwise empty page.
* `JobTracker.jsx:512-519` — `if (loadError) return <main className="flex min-h-64 items-center justify-center px-4">… {loadError} … Try again` → the board, stats, filters and header all vanish.
* `AppliedJobs.jsx:255-270` (loading), `:273-289` (no user), `:291-304` (`loadError`) — same three full-page replacements (`<main className="min-h-screen bg-cuba-canvas flex items-center justify-center px-4">`).

This is exactly the reviewer's "4/10 blank screen on loadError early-return". The shell
chrome survives, so the user sees a correctly framed page with an **empty body**.
`setLoadError('Your job tracker could not be loaded.')` (`JobTracker.jsx:195`) is also a
content-free message — no cause, no correlation id, no recovery path beyond retry.

### 3.2 CONFIRMED (partially stale claim) — empty states
* **Favorites — already fixed.** `DashboardFavourites.jsx:19` imports `CubaEmptyState`; `:105-115` defines real per-tab copy (`EMPTY_COPY`); `:244-248` renders it with a primary action. OK.
* **Notifications — already fixed.** `DashboardNotifications.jsx:13` imports `CubaEmptyState`; `:231` renders it. OK.
* **Portfolios — NOT fixed.** `DashboardPortfolios.jsx:418-427` still renders a raw emoji + `<h3 className="text-lg font-medium text-slate-900">` + `text-slate-600` copy, with no `CubaEmptyState`, no illustration, and no secondary action. Worse, a genuine load failure only fires a toast (`:80` `showToast('error', …'loadError')`) and sets an empty array (`:78`), so **a failed read is rendered as "you have no portfolios"** — a false empty state that tells the user their data is gone. FAIL.

**Verdict:** the blanket "empty-state wastelands" claim is stale for two of three pages but
correct for Portfolios, and it hides a real correctness bug (false empty state).

### 3.3 CONFIRMED — `navigationState.js` query bug: Security highlights Profile
Exact chain:
1. `candidateNavigation.js:59` `{ id: 'profile', label: 'Master Profile Data', to: '/dashboard/settings?tab=Profile' }`
2. `candidateNavigation.js:60` `{ id: 'security', label: 'Security & 2FA Hub', to: '/dashboard/settings?tab=Security' }`
3. `navigationState.js:10` `pathOf = (to) => String(to||'').split('?')[0]…` → **both collapse to `/dashboard/settings`**.
4. `navigationState.js:31` `if (target === base) return item;` returns the **first** match in declaration order → `profile` (line 59) always wins.
5. Therefore `/dashboard/settings?tab=Security` highlights **Master Profile Data**, and `security` can *never* be highlighted.

The destinations themselves are genuinely distinct — `DashboardSettings.jsx:381-403` maps
`?tab=Security|2fa` → the Account pane with `pendingScrollRef = 'totp-security-hub'`
(`:391`) and `?tab=Profile` → the Profile pane (`:392-394`) — so only the highlighter is
wrong. `tests/cuba-candidate-portal.test.mjs:115-125` covers `/dashboard/interview`,
`/build-resume/heading`, `/dashboard2` and `/employer/jobs` but **never exercises a
query-differentiated path**, which is why the defect survived.

instead of replacing the page; a query-aware active-item resolver fixes the whole class of
"wrong nav item highlighted" bugs; split-view at `lg+` converts ~50% wasted desktop width
into working surface for Messages and Cover Letters; token sweeps are mechanical and

### 3.4 CONFIRMED — desktop density gaps + missing split-view (Cover Letters, Messages)
* **Cover Letters** — `CoversList.jsx` contains **0** `sm:`/`md:`/`lg:`/`xl:` classes and **0**
  `cuba-` tokens, uses legacy `bg-indigo-600` / `bg-rose-600` and a `<span className="name">`
  hook, and has **no preview pane**. On a 1680px desktop the list renders as one narrow
  column with ~60% of the viewport empty. (`CoverLetter/CoverLetter.jsx` is tokenised — 60
  `cuba-` — but also has **0** breakpoints.)
* **Messages** — `DashboardMessages.jsx` has **1** breakpoint and **0** grid usage; the
  thread is a conditional swap driven by `selectedConversation` (`:41`, `:132`), so the list
  and the thread are **never side by side**. Reading a conversation at desktop width occupies
  one full-width column and the user loses list context.

### 3.5 CONFIRMED — legacy non-Cuba styling in `PortfolioGallery.jsx`
`PortfolioGallery.jsx:70` `bg-gray-50` · `:72` `bg-white shadow-sm` · `:75` `text-gray-900` ·
`:76` `text-gray-600` · `:86`,`:93` `border-gray-300 focus:ring-blue-500` · `:110`
`border-blue-600` · `:48-56` `bg-blue-100 text-blue-800` / `bg-gray-800 text-white` /
`bg-purple-100 text-purple-800` / `bg-slate-100 text-slate-800`. **Zero** `cuba-` tokens,
no `CubaPageHeader`/`CubaSkeleton`/`CubaErrorState`, no dark-mode support (hardcoded
`bg-gray-50`/`bg-white`), and a hardcoded `max-w-7xl` (1280px) cap that wastes desktop
width. Failures are swallowed to `console.error` (`:34-38`) with no user-visible state.

## 4. Systemic findings beyond the five named items
1. **Page-frame drift** — `<CubaPageHeader>` is used by only 2 of 15 pages
   (`DashboardFavourites.jsx:319`, `DashboardNotifications.jsx:163`); the other 13 hand-roll
   headers, so titles, spacing and action slots differ page to page.
2. **No page-level telemetry polish** — `CubaSkeleton`, `CubaStatCard` and `CubaErrorState`
   appear in **0** page bodies, so the "native visuals and real-time telemetry" the reviewer
   asked for exists only in the shell.
3. **Interview Coach is the worst surface** — 1 `cuba-` vs 378 legacy colour + 361 slate
   utilities across 2,927 lines (`DashboardInterviews.jsx`).
4. **Settings/Profile/Security is the largest legacy surface** — 0 `cuba-` vs 748 slate +
   489 legacy colour utilities across 5,873 lines (`DashboardSettings.jsx`).
5. **Resumes has no responsive markup of its own** — `ResumesList.jsx` has 0 breakpoints
   (the builder has 38 but 94 legacy colour utilities).
6. **Overview body is still legacy** — 78 legacy colour + 99 slate utilities below the new
   hero/rail (which is why the page scores 7.5 rather than 9+).

## 5. PHASE 2 — target architecture to reach 10/10 on every page
1. **One page frame** (`CubaPageFrame` = `CubaPageHeader` + persistent content region) so
   loading / empty / error compose *inside* the frame and never replace the page.
2. **Query-aware active-item resolution** in `navigationState.js` so every
   `?tab=`-differentiated destination highlights correctly.
3. **Split-view at `lg+`** for Messages (list + thread) and Cover Letters (list + live
   `Cover1` preview).
4. **Token parity** — every page body at 0 legacy colour utilities, 0 `slate/gray`, with
   `cuba-` tokens, dark-mode parity and `rounded-cuba-*` elevation.
5. **Page-level telemetry** — `CubaStatCard` + `CubaSkeleton` on every data page so the
   first paint is native rather than blank.
6. **Honest state machine** — a failed read is an `CubaErrorState`, never a false empty state.

testable; `cv-templates/cover1/Cover1` is already imported (`CoversList.jsx:8`) so a live
cover preview needs no new component.

**Threats** — the legacy surfaces are large (`DashboardSettings.jsx` 460 KB / 5,873 lines;
`DashboardInterviews.jsx` 201 KB / 2,927 lines), so a big-bang rewrite risks regressing
proven behaviour; frozen baselines (`src/cv-templates`) and the DIR-047/055/072–080 pins
must stay diff 0; several legacy pages are class components; silent `catch → toast` paths
mask real failures (§3.2) and would hide regressions from the test bar.
