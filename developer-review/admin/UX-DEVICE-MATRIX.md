# UX device matrix — per-cell evidence, five device classes

**Status:** final round, 2026-10-27 · branch `arena/55faaf92-resumepilotai`

Every cell is **S**, **C** or **?**, and each `?` has an `OPEN-ITEMS.md` entry with a provisional
decision and a reversal trigger. There are no prose ticks.

| Marker | Meaning | Where it ran |
|---|---|---|
| **S** | Static audit of the source — measured in this session, exit code recorded | `npm run verify:ux` |
| **C** | Browser assertion in a committed Playwright spec, executed in CI (`e2e` job). Auth-screen `C` cells were **also executed locally** this round with `@sparticuz/chromium` (`ADR-010`) | `npm run test:ux:auth`, `admin-console-ux.spec.ts` |
| **?** | Neither measured nor asserted. Always paired with an OI entry | — |

**Reading rule that keeps this honest:** an `S` cell is a measurement; a `C` cell is an assertion
whose execution belongs to a named job; a `?` cell is an admission. No cell is ticked on prose.

---

## 0. What was measured this round

```bash
cd frontend && npm run verify:ux
Admin-plane UX audit
  targetSize     0 violation(s)
  textSize       0 violation(s)
  focus          0 violation(s)
  width          0 violation(s)
PASS
Admin-plane colour contrast (WCAG 2.2 AA)
  ... 17 pairs, lowest text 4.59:1 (floor 4.5:1), lowest non-text 3.64:1 (floor 3:1)
ALL PASS

cd frontend && LD_LIBRARY_PATH=/tmp/al2023/lib PLAYWRIGHT_CHROMIUM_EXECUTABLE=/tmp/chromium \
  npm run test:ux:auth
  21 passed, 2 skipped   (the two skips are OI-UX-11: they need a configured Firebase project)
```

**The audit was repaired this round** (`D-035-1`). Its regex could not see a JSX opening tag whose
attributes start on the next line, so most controls had never been inspected. With that fixed the
same files reported 114 target-size and 100 focus findings, and the text rule found 22
`text-[10px]`/`text-[11px]` uses the previous "0 violations" claim had missed. The rules are now
based on what actually guarantees the bar:

| Guarantee | Where it is declared | How a regression is caught |
|---|---|---|
| Every control ≥ 44 px at phone widths | `src/index.css` — `@media (max-width: 767px)` sets `min-height: 44px` on button/`[role=button]`/`[role=tab]`/`summary`/`select`/text inputs/textarea, `min-width: 44px` on buttons and tabs; inline sentence links exempt per WCAG 2.2 2.5.8 | static: an element that pins an explicit sub-44 px height fails `ux-audit`; rendered: measured box at 320/480 in both specs |
| Visible focus everywhere | `src/index.css:208` `:focus-visible` (2 px `--color-brand-500`, 2 px offset) | static: an element that removes the ring without a replacement fails `ux-audit`; contrast: 5.16:1 measured |
| No text below 12 px | `text-xs` floor | static: `text-[9px]`/`text-[10px]`/`text-[11px]` refused (22 found and fixed) |
| No horizontal page scroll | containment: tables scroll inside `overflow-x-auto` | rendered: `documentElement.scrollWidth ≤ clientWidth + 1` per class |

---

## 1. Auth screens — the previously empty column, now populated

Spec: `frontend/tests/auth-screens-ux.spec.ts` · baselines:
`frontend/tests/auth-screens-ux.spec.ts-snapshots/` (10 PNGs, committed) · local runner: `npm run test:ux:auth`

| Screen | Keyboard | Visual baseline | axe (serious/critical) | States | Evidence |
|---|---|---|---|---|---|
| **Sign in** `/login` | **S** + **C** — skip link → brand link → email → password → reveal → forgot → submit; skip link measured ≥44 px once focused; focus ring present | **S** — 5 classes: `auth-login-{320,480,768,1024,1441}` | **S** — 0 at all five classes | error, offline — both committed as `auth-login-error-480`, `auth-login-offline-480` | `auth-screens-ux.spec.ts:103-160` |
| **Create account** (mode of the same route) | **C** — same form, heading changes to `h2` "Create your IME365 account" | **C** — covered by the mode switch test | **C** — same DOM | — | `:164` |
| **Reset password** (mode) | **C** — reached by "Forgot password?", submit is "Send reset link" | **C** | **C** | — | `:164` |
| **MFA challenge** | **?** — `OI-UX-11`. The Firebase SDK needs a project to raise `MFA_REQUIRED`; with no `VITE_FIREBASE_API_KEY` the SDK rejects locally and no request is made, so the mocked REST payload is never consumed | **?** — `OI-UX-11` | **?** | not reached | skip recorded in the spec with the reason |
| **MFA enrolment** (settings panel behind auth) | **?** — `OI-UX-10` (authenticated low-traffic screens) | **?** | **?** | — | `src/components/settings/security-panel.tsx` |
| **Session-expired** | **?** — `OI-UX-10`. There is no dedicated screen: a 401 redirects to `/login`, so the *screen* is sign-in, which is covered | n/a | n/a | — | `src/lib/` 401 handling |
| **Logout confirmation** | **C** — `account-panel.tsx:277` renders it; the surface is behind auth | **?** — `OI-UX-10` | **?** | — | — |

## 2. Admin console — 15 tabs

Spec: `frontend/tests/admin-console-ux.spec.ts` · runner: `npm run test:ux:admin`

| Criterion | C1 320 | C2 480 | C3 768 | C4 1024 | C5 1441 | Evidence |
|---|---|---|---|---|---|---|
| No horizontal page scroll | C | C | C | C | C | `:69` |
| Tab strip roving focus (`ArrowRight`/`Home`/`End`) | C | C | C | C | C | `:69` |
| axe zero serious/critical | C | C | C | C | C | `:98` |
| Visual baseline | ? | ? | ? | ? | ? | `OI-UX-9` — the spec calls `toHaveScreenshot`; **no admin baselines are committed** because the console needs the backend + MariaDB to render its tab list, which this sandbox does not have (the auth baselines do not need it). Command to close: `npm run test:ux:admin -- --update-snapshots` against a running backend |
| Rendered 44 px boxes at 320/480 | C | C | n/a | n/a | n/a | `:214` |
| Drawer focus trap, Escape, focus return | C | — | — | C | — | `:247` |
| Four data states (loading/empty/error/partial) | C | — | — | — | — | `:279` |
| Disabled tab explains itself in its accessible name | C | C | C | C | C | `:326` |
| Configuration census states provenance | C | — | — | C | — | `:339` |
| LCP/CLS on the real page | C | C | C | C | C | `:349` |

## 3. Presentations

| Presentation | Auth screens | Admin console | Evidence |
|---|---|---|---|
| Dark mode | **S** — baseline `auth-login-dark-320`, axe 0 | **C** — `:136` | `colorScheme: 'dark'` |
| High contrast (`forced-colors`) | **S** — baseline `auth-login-high-contrast-320`, axe 0 | **C** — `:136` | `forcedColors: 'active'` |
| RTL | **S** — baseline `auth-login-rtl-320`, no overflow | **C** — `:158` | `dir="rtl"`, `lang="ar"` |
| 200 % text | **S + C** — no loss of content or function; fields fillable, submit in viewport | **C** — `:186` | WCAG 1.4.4 is *no loss*, not *no scroll*; reflow is the 320 px class |
| Reduced motion | **S** — `index.css:215`; no assertion possible without pinning timing | **S** | `ADR-009` §Reduced motion |
| Print | **S** — `index.css:429`, `:502` | **S** | — |
| Locale number/date formatting | **?** — `OI-UX-12` | **?** | provisional decision + trigger in the OI |

## 4. Performance

| Metric | Budget | Auth (local, Lambda Chromium) | Gate |
|---|---|---|---|
| LCP | < 2.5 s | **estimate 2.71 s — not a measurement** (`NO_SCREENSHOTS`, Lantern estimate identical to the millisecond across three different payloads) | LHCI `largest-contentful-paint` ≤ 2500 ms, `lighthouse` CI job; in-page observer in `admin-console-ux.spec.ts:349` for the console |
| CLS | < 0.1 | **0** (measured, stable) | LHCI ≤ 0.1 |
| TBT / INP proxy | ≤ 200 ms | **0** | LHCI ≤ 200 ms |
| Accessibility score | 1.0 | **1.00** | LHCI + axe at 5 classes |
| Best practices | ≥ 0.95 | **0.96** | LHCI |
| SEO | — | **1.00** | LHCI |
| Transfer | ≤ 700 KB | **264 KB** | `budgets/per-page-class.json` |

Raw artefact: `frontend/developer-review-artefacts/lighthouse-login-mobile-4g.json` (labelled
indicative; `ADR-010` explains why the LCP field in it is not evidence).

**Four defects this run found and the repairs** — eight Google Font families in one render-blocking
stylesheet; a `heading-order` violation from `h3` under an `sr-only` `h1`; the sign-in route as a
lazy chunk; no paint before 230 KB of script. All four are fixed (`ADR-010` §repairs).

## 5. Touch, keyboard and zoom — the numbers

| Check | Result | Evidence |
|---|---|---|
| Controls ≥ 44 px at 320 px, auth | 0 undersized after the sweep (11 were) | `auth-screens-ux.spec.ts:248` |
| Controls ≥ 44 px at 480 px, auth | 0 undersized | same |
| Controls ≥ 44 px rendered, console | C, per class | `admin-console-ux.spec.ts:214` |
| Tab order, auth | skip link → brand → email → password → … | `:139`, asserted as positions |
| Password reveal operable by keyboard | **S** — Enter toggles, `aria-label` flips Show/Hide | `:154` |
| Password reveal target size | **S** — was 32 px, axe `target-size` flagged it, now `size-11` | `login.tsx:537` |
| Skip link ≥ 44 px when focused | **S** | `:139` |
| 200 % text overflow | **S** — was 433 px wide at 320 (two-column grids + rem padding) → grids stack `grid-cols-1 sm:grid-cols-2`, card padding `px-4 sm:px-5`, label row wraps | `login.tsx` |

## 6. Density modes

**PARTIAL — formal deferral, not an oversight.** No `ui.*` registry entry, no console control. The
mandate's acceptance criteria are a testable checklist in `ADR-009` §"Density modes", with a named
owner and three reversal triggers. `OI-UX-8` carries both conditions.

## 7. Running these gates yourself

```bash
# static, no browser, ~1 s
cd frontend && npm run verify:ux

# auth screens, needs any Chromium build (no backend, no MariaDB)
cd frontend && npm i --no-save @sparticuz/chromium
node -e "const z=require('zlib'),f=require('fs');f.writeFileSync('/tmp/al2023.tar',z.brotliDecompressSync(f.readFileSync('node_modules/@sparticuz/chromium/bin/al2023.tar.br')))"
mkdir -p /tmp/al2023 && tar -xf /tmp/al2023.tar -C /tmp/al2023
LD_LIBRARY_PATH=/tmp/al2023/lib PLAYWRIGHT_CHROMIUM_EXECUTABLE=/tmp/chromium npm run test:ux:auth

# admin console, needs the backend + MariaDB (the console reads its capability census)
cd frontend && npm run test:ux:admin

# performance budgets, needs real Chrome
cd frontend && npm run perf:budgets
```
