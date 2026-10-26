# UX device matrix — five viewport classes

**Status: NOT IMPLEMENTED. This document records the measured current state, the
acceptance criteria for each class, and the exact work required. It does not claim
any class is verified, because no browser run was performed in this environment.**

That is the single largest gap in this pass. The backend authority layer is done and
proven (§`SECURITY-AND-RBAC-PROOF.md`); the responsive/accessibility work the brief
asked for is *specified and measured* here, not delivered. Pretending otherwise
would be the one thing this engagement has consistently refused to do.

**How the current state was measured** (all reproducible from `frontend/`):

```bash
grep -rn "safe-area" src | wc -l                                   # 0
grep -rn "min-h-\[44px\]\|min-h-11\|h-11" src/components/admin src/pages/admin | wc -l   # 0
grep -rn "dark:" src | wc -l                                       # 265
grep -rn "prefers-contrast\|forced-colors" src | wc -l             # 0
grep -rn "overflow-x-auto" src/components/admin src/pages/admin | wc -l   # 18
grep -rn "text-\[10px\]\|text-\[11px\]" src/components/admin/*.tsx | wc -l # 101
grep -rn "focus:ring\|focus-visible" src/components/admin/*.tsx | wc -l   # 12
grep -c "@media" src/index.css                                     # 2 (reduced-motion, print)
```

---

## 1. The five classes and what each one requires

| Class | Width | Primary use | What "done" means |
|---|---|---|---|
| C1 | 320–480 px | phone, one hand | Everything reachable with the thumb; **no page-level horizontal scroll**; every control ≥ 44 × 44 px; data tables scroll *inside* a labelled region; primary action in the bottom third |
| C2 | 481–767 px | large phone / small tablet | Same as C1 plus two-column card grids where content allows |
| C3 | 768–1024 px | tablet, portrait | Persistent navigation visible; tables may show 4–5 columns without scrolling |
| C4 | 1025–1440 px | laptop | Full console: sidebar + content; no sticky overlap; density comfortable |
| C5 | 1441 px+ | desktop / wall display | Content max-width so line length stays readable; telemetry grids use the extra width rather than stretching cards |

**Cross-cutting, all classes:** WCAG 2.2 AA · keyboard-only operability · 200 %
zoom and 200 % text without loss of function · dark, high-contrast and reduced-motion
modes · design tokens (no raw hex in components) · density modes · print stylesheet ·
LCP < 2.5 s, INP < 200 ms, CLS < 0.1.

---

## 2. Measured state, class by class

Legend: ✅ met and measured · ⚠️ partially met · ❌ not met · **?** not verified (no
browser run) — an honest `?` is better than an invented tick.

| Criterion | C1 320–480 | C2 481–767 | C3 768–1024 | C4 1025–1440 | C5 1441+ | Evidence |
|---|---|---|---|---|---|---|
| Layout container adapts | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | `console.tsx:163` — `p-4 lg:p-6 xl:p-8 space-y-6 max-w-7xl mx-auto`. Padding only changes at `lg`/`xl`; there is no step between 320 and 1024 |
| No page-level horizontal scroll | ? | ? | ? | ? | ? | 18 `overflow-x-auto` containers; three tables declare `min-w-[700px]` (`AdminBlogManagementTab.tsx:212`, `AdminModerationTab.tsx:246`, and one more). At 320 px the *container* must be the scroll owner; nothing asserts that the page is not. **Not verified.** |
| Touch targets ≥ 44 px | ❌ | ❌ | n/a | n/a | n/a | **0** explicit 44 px targets in any admin component. Controls inherit `px-3 py-1.5 text-xs` (~26–30 px tall) |
| Navigation discoverable | ❌ | ❌ | ⚠️ | ✅ | ✅ | The console renders **no tab list**: `console.tsx:205-225` renders only the active tab, and `handleSelectTab` is only called from inside a tab. The app shell (`cuba-app-shell.tsx:314-318`) links to three destinations (`/admin`, `/admin/support`, `/admin/health`); the other eleven tabs are reachable only by typing the URL |
| Safe-area insets respected | ❌ | ❌ | n/a | n/a | n/a | `safe-area` appears **0** times in `src/` |
| Text ≥ 12 px at default zoom | ❌ | ❌ | ⚠️ | ⚠️ | ⚠️ | **101** uses of `text-[10px]`/`text-[11px]` across the 14 admin tabs |
| Dark mode | ✅ | ✅ | ✅ | ✅ | ✅ | 265 `dark:` variants; tokens in `index.css:94+` |
| High-contrast / forced-colors | ❌ | ❌ | ❌ | ❌ | ❌ | `prefers-contrast` and `forced-colors` appear **0** times |
| Reduced motion | ✅ | ✅ | ✅ | ✅ | ✅ | `index.css:189` `@media (prefers-reduced-motion: reduce)` |
| Print | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | `index.css:376` `@media print`, but no admin surface is designed for paper (no page-break control, tables overflow) |
| Visible keyboard focus | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | 12 `focus-visible`/`ring` occurrences across ~2 500 lines of admin UI |
| 200 % zoom without loss | ? | ? | ? | ? | ? | Not verified; the fixed `min-w-[700px]` tables are the likely failure |
| Keyboard-only operability | ? | ? | ? | ? | ? | No roving-tabindex or `role="tablist"` exists, so there is nothing to arrow through; `console.tsx` contains **1** `aria-*` attribute (`aria-label` on `<main>`, line 178) and one `role="alert"` |
| Design tokens only | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | `ink`/`brand`/`border` tokens are used widely, but raw `min-w-[700px]` and `text-[10px]` are hard-coded values |
| Density modes | ❌ | ❌ | ❌ | ❌ | ❌ | No density toggle or compact token set |
| LCP < 2.5 s / INP < 200 ms / CLS < 0.1 | ❌ | ❌ | ❌ | ❌ | ❌ | **No performance assertion exists anywhere** in the repository |

### 2.1 Viewport meta and zoom

`frontend/index.html:5` sets `width=device-width, initial-scale=1.0`. There is no
`maximum-scale` and no `user-scalable=no`, so pinch-zoom and 200 % zoom are not
blocked by the document. Good baseline; it does not prove the layout survives it.

### 2.2 What the existing tests do and do not cover

`frontend/tests/engine-responsive.spec.ts` and its snapshot directory exist, and
`frontend/tests/accessibility.spec.ts` exists. Neither was executed in this session
(they need a running API and a browser). They are the natural home for the
assertions this matrix demands; today they cover the candidate engine and the public
pages, not the admin console.

---

## 3. Work required, in dependency order

| ID | Work | Files | Acceptance criteria | Effort |
|---|---|---|---|---|
| `OI-UX-1` | Tab navigation that exists on every width | `frontend/src/pages/admin/console.tsx` | A `role="tablist"` with `aria-selected`, arrow-key roving focus, and a horizontally scrollable strip on C1/C2 that does not scroll the page; every one of the 15 tabs reachable without typing a URL; Playwright: tab bar present at 320 px, no `document.scrollingElement.scrollWidth > clientWidth` | M |
| `OI-UX-2` | 44 px touch targets | 14 admin tab components | Every interactive element ≥ 44 × 44 px at ≤ 768 px (utility class, not per-site patching); axe-core reports 0 `target-size` violations | M |
| `OI-UX-3` | Performance budget | `frontend/tests/performance.spec.ts` (new), CI job | Lighthouse CI asserts LCP < 2.5 s, INP < 200 ms, CLS < 0.1 on `/admin` at C1 and C4; the job fails the build | S |
| `OI-UX-4` | Safe-area + viewport units | `index.css`, shell | `env(safe-area-inset-*)` on fixed/sticky chrome; `100dvh` instead of `100vh`; verified at C1 on a notched-device emulation | S |
| `OI-UX-5` | Type scale floor | admin tabs | No `text-[10px]`/`text-[11px]`; a token (`--text-2xs`) with a minimum of 12 px; 200 % zoom run recorded | M |
| `OI-UX-6` | Contrast / forced-colors | `index.css` | `@media (forced-colors: active)` and a high-contrast theme; axe-core 0 contrast violations at AA on all 15 tabs | M |
| `OI-UX-7` | Focus visibility | all admin components | `:focus-visible` on every interactive element; keyboard walk-through of all 15 tabs recorded | S |
| `OI-UX-8` | Density modes + print | tokens, `index.css` | `data-density="comfortable\|compact"`; print rules per admin surface (hide nav, avoid page breaks inside cards, table headers repeat) | M |
| `OI-UX-9` | Visual regression for the console | `frontend/tests/` | One snapshot per tab at C1/C3/C5 (45 images), reviewed, committed | M |

**Sequencing rationale:** `OI-UX-1` first. Every other class of work is judged
against screens that today cannot be reached at all on a phone, so measuring C1
behaviour of a tab a phone user cannot open measures nothing.

---

## 4. What this document must not be read as

- It is **not** a claim that the console is responsive. Tailwind's `sm:`/`md:`/`lg:`
  utilities are used widely and probably degrade acceptably, but "probably" is not a
  measurement, and the specific failures listed above (no tab list, no 44 px
  targets, no safe-area, sub-12 px text) are structural, not cosmetic.
- It is **not** a WCAG 2.2 AA conformance claim. Two of the AA criteria are already
  visibly unmet (2.5.8 target size is advisory in 2.2 AA via 44 px, and 1.4.3
  contrast is unmeasured), and conformance requires an audit of every screen.
- It **is** a specification precise enough that a frontend engineer can execute it
  without re-deriving the requirements, which is what the brief actually asked of
  the documentation.
