# UX device matrix — five viewport classes, per-screen evidence

**Status as of 2026-10-27.** The previous revision of this file said *NOT IMPLEMENTED* and was
right for the code it described. Since then the responsive work landed: the tab strip exists with
`role="tablist"` and roving focus, the safe-area inset is applied, high-contrast and print
stylesheets exist, the 101 sub-12px runs are gone, and every interactive control carries a ≥44px
minimum at phone widths. This revision replaces the prediction with three kinds of evidence and
marks which kind each cell has:

| Marker | Meaning | Where it runs |
|---|---|---|
| **S** | Static audit of the JSX — measured in this session, exit code recorded | `frontend/`, now |
| **C** | Code assertion in the Playwright spec — the test exists and is type-clean, executed by the CI `e2e` job | CI job `e2e` (needs Chromium + a served app) |
| **?** | Not observed here. The sandbox cannot download Chromium, so a `C` cell is *asserted*, never *observed*, in this session | — |

**The rule that keeps this honest:** no cell is marked ✅ on the strength of a `C` assertion alone.
✅ means an `S` measurement passed. A `C` cell says "this is proven by a test that runs in CI", and
the CI run — not this document — is where the proof lives. `?` means neither: nothing measured it.

---

## 1. What was measured in this session (S)

```
$ cd frontend && npm run verify:ux
Admin-plane UX audit
  targetSize     0 violation(s)
  textSize       0 violation(s)
  focus          0 violation(s)
  width          0 violation(s)
PASS
Admin-plane colour contrast (WCAG 2.2 AA)
  ... 17 measurements, lowest 3.64:1 (input boundary on the canvas, floor 3:1), lowest text 4.59:1 (floor 4.5:1)
ALL PASS
```

| Deficit named in the mandate | Measured now | Anchor |
|---|---|---|
| 101 sub-12px runs raised to ≥12px | **0** violations of `text-[9px]` / `text-[10px]` / `text-[11px]` | `scripts/ux-audit.mjs` rule 2; the fix landed in the 14 admin tabs |
| All interactive controls ≥44×44 at mobile widths | **0** violations of the class rule; rendered-box proof is `C` | `scripts/ux-audit.mjs` rule 1 (`min-h-11`, `h-11`, `size-11`) + `admin-console-ux.spec.ts:214-245` |
| Safe-area insets | applied on the console container | `console.tsx:210` — `pb-[max(1rem,env(safe-area-inset-bottom))]` |
| High-contrast / forced colours | present | `index.css:476` `@media (prefers-contrast: more)`, `index.css:484` `@media (forced-colors: active)` |
| Reduced motion | present | `index.css:215` |
| Print stylesheet | present, two blocks | `index.css:429` and `index.css:502` |
| Design tokens, no magic numbers in the admin plane | 0 raw pixel widths above 320px outside a scroll container | `scripts/ux-audit.mjs` rule 4 |
| Tab list in the accessibility tree | present, twice (page strip + drawer strip) | `console.tsx` `role="tablist"`; `AdminUsersTab.tsx:678` "User 360 sections" |
| No page-level horizontal scroll (static) | no unscoped fixed width; the rendered check is `C` | `scripts/ux-audit.mjs` rule 4 |

---

## 2. The five classes

Legend for the per-class rows: **S** measured · **C** asserted by a spec test · **?** unverified.

| Criterion | C1 320–480 | C2 481–767 | C3 768–1024 | C4 1025–1440 | C5 1441+ | Evidence |
|---|---|---|---|---|---|---|
| Document has no horizontal scroll | C | C | C | C | C | `admin-console-ux.spec.ts:69` (one test per class: 320/480/768/1024/1441) |
| Every tab reachable by keyboard, roving focus | C | C | C | C | C | `admin-console-ux.spec.ts:69` — `ArrowRight`, `End`, `Home`, focus stays `role="tab"` |
| Tab strip renders and is named | S | S | S | S | S | `console.tsx` `role="tablist"` (grep count 2); spec `:326` asserts a disabled tab explains itself in its **accessible name**, not a `title` |
| axe: zero serious/critical | C | C | C | C | C | `admin-console-ux.spec.ts:98`, WCAG 2.0/2.1/2.2 A+AA tags |
| Visual regression, zero unreviewed diffs | C | C | C | C | C | `admin-console-ux.spec.ts:112` — `toHaveScreenshot` per class, 1 % tolerance. **Baselines are not committed** (generating one needs a browser); see `ADR-009` §"Visual baselines" |
| Controls ≥44px rendered box | C | C | n/a (pointer) | n/a | n/a | `admin-console-ux.spec.ts:214` at 320 and 480; disabled controls and inline links exempt per WCAG 2.2 |
| Text ≥12px | S | S | S | S | S | `ux-audit.mjs` textSize rule: 0 violations |
| Safe-area inset | S | S | n/a | n/a | n/a | `console.tsx:210` |
| Two-column card grids | C | C | C | S `/` C | S `/` C | `grid-cols-1 … sm:grid-cols-2` in the tabs; the `S` part is the class presence, the `C` part is layout at width |
| Data tables scroll inside a labelled region, page does not | C | C | C | C | C | 18 `overflow-x-auto` containers; the page-level assertion in `:69` is what proves the containment |
| Content max-width at desktop | S | S | S | S | S | `console.tsx:210` `max-w-7xl mx-auto` |

---

## 3. The three non-default presentations

| Presentation | Assertion | Evidence |
|---|---|---|
| Dark mode | no horizontal scroll + axe zero serious/critical, at 320px | `admin-console-ux.spec.ts:136-156`, `colorScheme: 'dark'` |
| High contrast (`forced-colors: active`) | same two assertions; the stylesheet rules are at `index.css:476` / `:484` | `admin-console-ux.spec.ts:136-156`, `forcedColors: 'active'` |
| Right-to-left | no overflow + arrow-key roving focus follows the mirrored direction (`ArrowLeft` advances) | `admin-console-ux.spec.ts:158-184`; `dir="rtl"`, `lang="ar"` set before load |
| 200 % text | root font-size doubled, no horizontal scroll, every tab keeps a measurable box | `admin-console-ux.spec.ts:186-212` |
| Reduced motion | CSS-only today (`index.css:215`); no browser assertion | **?** — see `ADR-009` §"Reduced motion" for why this is the one presentation without a `C` |
| Locale number/date formatting | not asserted | **?** — `ADR-009` records it as an open decision rather than a silent gap |

**Why dark and high-contrast need a browser and not the static audit:** `contrast-audit.mjs` reads
the light token palette from `index.css`. A token that was never given a dark counterpart, or a
`forced-colors` user agent override that turns a border transparent, is invisible to a grep and
visible to axe. That is exactly the class of defect these two runs exist to catch.

---

## 4. Keyboard and state coverage, screen by screen

Screens in scope, and what each one has:

| Screen | Keyboard script (focus order, trap, focus return) | States covered |
|---|---|---|
| Login / MFA challenge / MFA enrolment / password reset / session-expired / logout confirmation | **?** — `accessibility.spec.ts` covers the surfaces, but the per-screen focus-order script the mandate asks for is not written | `accessibility.spec.ts` |
| Admin console, 15 tabs | `C` at `:69` for the strip; drawer trap + Escape + focus return at `:247-277` | loading / empty / error / partial at `:279-324` |
| Every drawer and modal (User 360, Provision user, service detail, config edit, announcement compose, key-pool dialogs) | `C` for User 360 only (`:247`). The other drawers share the same `AdminDrawer`/`AdminModal` primitive, so the trap is a property of the primitive — asserted once, not per drawer | `C` via the four-state run |
| Other authenticated screens (dashboard, enterprise, billing, settings) | **?** | **?** |

The row-level truth matters more than a dashboard-average tick: **one drawer is proven keyboard
trapped, the rest are proven to use the same primitive, and the auth screens have no per-screen
keyboard script at all.** That is a written, named gap (`OI-UX-4` in `OPEN-ITEMS.md`), not a
blank cell.

---

## 5. Performance

| Metric | Budget | Status | Evidence |
|---|---|---|---|
| LCP | < 2.5 s | `C` | `admin-console-ux.spec.ts:349` — `PerformanceObserver` with `buffered: true`, asserted < 2500 ms |
| CLS | < 0.1 | `C` | same test, `layout-shift` entries, `hadRecentInput` filtered |
| INP | < 200 ms | `C` (synthetic) | `tests/engine-*.spec.ts` journey; INP needs real interaction, so it is measured on a journey rather than on first paint |
| Lighthouse report attached | required by the mandate | **?** | No Lighthouse run in this sandbox (no Chromium, no `cdn.playwright.dev` egress). `ADR-009` records this as the one deliverable this environment cannot produce and names the command that produces it |
| Lighthouse budgets (perf ≥0.90, a11y 1.0, best-practices ≥0.95, TBT ≤200 ms, ≤700 KB, 4G + 4× CPU) | `lighthouserc` config committed | config only | `lighthouserc.*` — thresholds are declared; the run is the outstanding artefact |

---

## 6. Density modes

**Not implemented, and named as such.** The mandate requires density modes wired to the config
registry. The admin plane has no density control, and `backend/config/registry.js` has no `ui.*`
entry for one. What exists is a *resume-template* density (`smart-layout-families.tsx:57`) which is
a document property, not a console preference, and is not the thing the mandate asked for.

`ADR-009` records this as a deferred item with the reason (a density control is a persisted
preference, and the registry write path requires an audit row, a revision guard and a capability —
i.e. it is a configuration feature, not a CSS toggle), the acceptance criteria, and the trigger. It
is not silently absent: it is the one mandate item in this file with no `S` and no `C`.

---

## 7. Reproducing this file

```bash
cd frontend
npm run verify:ux                 # the S column; exits non-zero on any violation
npx playwright test tests/admin-console-ux.spec.ts --list   # 290 tests across the 5 projects
npx playwright install chromium   # not possible in this sandbox — see ADR-009
npx playwright test tests/admin-console-ux.spec.ts          # the C column, in CI
```

The `S` column is reproducible here and now. The `C` column is reproducible in CI, where the
`e2e` job serves the app and downloads Chromium; every `C` test fails on a violation, so the CI job
is the gate, not this table.
