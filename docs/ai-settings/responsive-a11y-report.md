# Responsive Layout, WCAG 2.1 AA Accessibility & Visual Baseline Report

Verified by committed Playwright suites `frontend/tests/engine-responsive.spec.ts`, `frontend/tests/engine-integrity.spec.ts`, `frontend/tests/engine-authenticated.spec.ts`, and `frontend/tests/engine-security.spec.ts` (`02f5972`).

---

## 1. Multi-Viewport Matrix (`frontend/playwright.config.ts`)

Existing platform projects (`mobile-iphone-se`, `tablet-ipad-portrait`, `small-laptop`, `standard-desktop`, `ultrawide-desktop`) are preserved intact alongside the 5 Phase 3 certification projects:

| Project Name | Viewport (`W × H`) | Horizontal Overflow (`scrollWidth <= innerWidth + 1`) | Primary CTA Above the Fold (`y + h <= H`) | All 5 Radix Modals Fit (`x >= 0`, `x + w <= W + 1`) | `@axe-core/playwright` (`critical` + `serious`) | Visual Baselines (`maxDiffPixelRatio: 0.01`) |
| --- | --- | --- | --- | --- | --- | --- |
| `mobile` | `360 × 640` | **Pass** (all 5 subtabs + expanded row + 5 modals) | **Pass** (`Save All Changes` `y + h <= 640` without scroll) | **Pass** (`Configure Provider` + 4 modals fit `<= 360px`) | **0 critical, 0 serious** | **5/5 PNGs Pass** |
| `tablet` | `768 × 1024` | **Pass** | **Pass** (`Save All Changes` + `Configure Provider` `<= 1024`) | **Pass** | **0 critical, 0 serious** | **5/5 PNGs Pass** |
| `desktop` | `1280 × 800` | **Pass** | **Pass** (`Save All Changes` + `Configure Provider` `<= 800`) | **Pass** | **0 critical, 0 serious** | **5/5 PNGs Pass** |
| `laptop` | `1920 × 1080` | **Pass** | **Pass** (`Save All Changes` + `Configure Provider` `<= 1080`) | **Pass** | **0 critical, 0 serious** | **5/5 PNGs Pass** |
| `4k` | `3840 × 2160` | **Pass** | **Pass** (`Save All Changes` + `Configure Provider` `<= 2160`) | **Pass** | **0 critical, 0 serious** | **5/5 PNGs Pass** |

---

## 2. Radix Dialog & Keyboard Accessibility Verification (`DEF-18`)

All hand-rolled `div[role="dialog"]` overlays and `window.confirm` browser alerts were replaced with `@radix-ui/react-dialog` (`Dialog`, `DialogContent`, `DialogTitle`, `DialogDescription`):
1. **`Configure Provider`** (`?dialog=configure-provider`) — auto-focuses key input when platform selected, supports `Provider key`, `Multi-key pool`, and `Custom endpoint` tabs.
2. **`Manage key pools`** (`?dialog=key-pool`) — inspects active masked pool counts and vault/environment provenance.
3. **`Manage cooldowns`** (`?dialog=cooldowns`) — inspects rate-limited provider cooldown timers.
4. **`Discover models`** (`?dialog=discovery`) — triggers live model discovery per provider with retry/stale preservation.
5. **`Integration snippets`** (`?dialog=snippets`) — renders focusable (`tabIndex={0}`, `role="region"`) `cURL`, TypeScript, and Python snippets using dynamic `window.location.origin`.
6. **Destructive Confirmations** (`Remove Stored Key`, `Reset User Quota`, `Reset All Daily Quotas`) — accessible Radix confirmation dialogs with explicit Cancel/Confirm buttons (zero `window.confirm`).

Committed assertions in `engine-integrity.spec.ts` (`lines 325–378`) verify on every dialog (`10/10` consecutive flake-gated runs):
- Non-empty `aria-labelledby` pointing to a rendered heading
- Background document `aria-hidden` isolation + `document.body` scroll lock (`overflow: hidden`)
- `Escape` key dismissal returning keyboard focus to the exact trigger button (`document.activeElement`)
- Top-left `(4, 4)` backdrop click dismissal

---

## 3. Shell & Component WCAG 2.1 AA Fixes Retained (`10d6a2c`)

- **`frontend/src/components/layout/ai-quota-badge.tsx` (`2 +-`) & `cuba-app-shell.tsx` (`4 +-`)**: Replaced overriding `aria-label` attributes on multi-span header buttons with inline `<span className="sr-only">` prefixes so WCAG 2.5.3 `label-content-name-mismatch` passes with `0` violations across every authenticated admin route while preserving `/^Account menu for/` accessible names.
- **Scrollable `<pre>` code blocks (`AdminAiSettingsTab.tsx`)**: Added `tabIndex={0}`, `role="region"`, and descriptive `aria-label` so Axe `scrollable-region-focusable` passes at `360×640`.

---

## 4. Committed Visual Regression Baselines (25 Snapshots)

Stored under `frontend/tests/engine-responsive.spec.ts-snapshots/`:
- `ai-settings-providers-{mobile,tablet,desktop,laptop,4k}-linux.png`
- `ai-settings-discovery-{mobile,tablet,desktop,laptop,4k}-linux.png`
- `ai-settings-metrics-{mobile,tablet,desktop,laptop,4k}-linux.png`
- `ai-settings-unified-gateway-{mobile,tablet,desktop,laptop,4k}-linux.png`
- `ai-settings-playground-{mobile,tablet,desktop,laptop,4k}-linux.png`
