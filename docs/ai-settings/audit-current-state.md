# Phase 1 Current-State Audit & Stack Confirmation — `/admin/ai-settings` ("AI Multi-Provider Engine")

**Baseline Commit Audited:** `c0f76a0ffef3c31aa4f03e03c79b7aac194db91d` (`origin/main`)  
**Target Branch:** `arena/98467c65-resumepilotai`  
**Audit Date:** 2026-10-24

---

## 1. Repository & Stack Confirmation (Reference Admin Page & Locked Versions)

All Phase 2 and Phase 3 work adheres strictly to the **SAME STACK HARD RULE** (`0` packages added, upgraded, or removed; `0`-byte diff across all `package.json` and `package-lock.json` files).

- **Reference Admin Shell & Sibling Pages Inspected:**
  - `frontend/src/pages/admin/console.tsx` (`AdminConsolePage` — authoritative 13-tab admin workspace router, RBAC gate, and Cuba shell integration)
  - `frontend/src/components/admin/AdminSettingsTab.tsx` (authoritative home for `resumeImportEnabled` platform module toggle)
  - `frontend/src/components/admin/AdminOperationsTab.tsx` (authoritative UI pattern for `feature_flags` runtime toggles)

| Layer | Locked Package / Module | Manifest Version (`package.json`) | Role in `/admin/ai-settings` |
| --- | --- | --- | --- |
| Frontend UI Runtime | `react` / `react-dom` | `^19.2.8` | Component tree, controlled state, hooks |
| Build & Typecheck | `vite` / `typescript` / `oxlint` | `^8.3.0` / `~6.0.2` / `^1.81.0` | Bundler, strict TS compiler (`tsc -b --noEmit`), linter |
| Styling & Design Tokens | `tailwindcss` / `@tailwindcss/vite` | `^4.3.3` / `^4.3.3` | Utility classes + platform Cuba CSS custom properties |
| Accessible Modal Primitive | `@radix-ui/react-dialog` | `^1.3.1` | All 5 operational dialogs + 3 destructive confirmation dialogs (`DEF-18`) |
| Iconography | `lucide-react` | `^1.59.0` | Consistent 16px/20px stroke icons |
| Routing & Deep Links | `react-router-dom` | `^7.18.4` | `/admin/ai-settings`, legacy aliases, `useSearchParams` URL sync |
| HTTP Client | `axios` (`@/lib/api-client`) | `^1.20.0` | Authenticated `/api/*` requests with relative browser URLs |
| Backend Server & DB | `express` / `mysql2` | `5.2.1` / `^3.24.2` | REST control plane + MariaDB `system_settings` (`FOR UPDATE` CAS) |
| In-Process AI Router | `backend/freellmapi` | `75`-provider registry | Multi-provider routing, key-pool rotation, cooldowns, discovery |
| E2E & Accessibility Gate | `@playwright/test` / `@axe-core/playwright` | `^1.50.1` / `^4.10.0` | Multi-viewport E2E, visual regression, WCAG 2.1 AA audits |

---

## 2. File-by-File Baseline Findings (`c0f76a0`) & Reconciled Line Counts (`B1`)

Raw baseline measurements verified directly via `git show c0f76a0:<path> | wc -l -w -c`:

1. **`frontend/src/components/admin/AdminAiSettingsTab.tsx` (`c0f76a0`: `2,914` lines / `9,906` words / `139,963` bytes -> rebuilt `10d6a2c`: `3,596` lines / `10,363` words / `146,820` bytes; `+682` lines / `+23.40%` single-file line growth, `+4.61%` words)**
   - Contained duplicated provider-configuration surfaces (inline row fields competing with custom hand-rolled `div[role="dialog"]` overlays lacking focus traps, `aria-labelledby`, Escape return-focus, and body scroll lock).
   - Held hardcoded `http://localhost:8000/v1` gateway URLs (`DEF-14`), static Playground placeholder (`DEF-15`), `window.confirm` prompts (`DEF-18`), and silent `.catch(() => {})` handlers (`DEF-23`).
   - Omitted the MariaDB AI Quota Governance controls (`Basic`, `Premium`, `Enterprise`, `Admin` daily limits + per-user/global quota resets) from `src/components/admin/settings/AiSettings.jsx` (`1,580` lines / `6,622` words) (`DEF-05`, `DEF-06`).
2. **`frontend/src/components/admin/AdminAiSettingsTab.tsx.fixed` (`c0f76a0`: `3,949` lines / `12,963` words / `198,634` bytes — DEAD ARTIFACT)**
   - Stale committed backup copy in `frontend/src/components/admin/`; permanently deleted in Phase 2a (`1968cd7`, `DEF-19`), reducing combined `AdminAiSettingsTab*` lines from `6,863` (`2,914 + 3,949`) to `3,596` (**`47.60%` reduction**).
3. **`frontend/src/pages/admin/console.tsx` & `frontend/src/app/router.tsx`**
   - `<LegacyRedirect>` dropped `location.search` when redirecting `/adm/*` and `/platform/*` to `/admin/*` (`DEF-17`).
   - `SUPPORT` and `AUDITOR` deep links to `/admin/ai-settings` silently bounced tabs instead of rendering a deterministic `403` view (`DEF-12`).
   - Legacy `?tab=ai`, `?tab=aisettings`, `?tab=ai_settings`, and `?tab=aimodels` aliases were incomplete (`DEF-16`).
4. **`backend/services/aiAdmin.js`, `backend/index.js` & `backend/services/featureFlagService.js`**
   - `maskApiKey()` revealed leading prefix characters instead of strict non-reversible `••••••••<last4>` (`DEF-01`).
   - Non-legacy providers among the 75-provider registry did not round-trip `enabled: false` / `disabled: true`, custom `baseUrl`, `temperature` `[0, 2]`, or `maxTokens` `[256, 8192]` consistently (`DEF-08`, `DEF-09`, `DEF-20`).
   - `ai_settings_v2_enabled` runtime feature flag was not registered in `backend/services/featureFlagService.js` or readable by `ADMIN` callers.

---

## 3. Master Defect Ledger (`DEF-01` .. `DEF-24`)

Every closed defect (`DEF-01` .. `DEF-23`) maps 1:1 to a committed automated Playwright test in `docs/ai-settings/verification-report.md` Section 4.

| ID | Severity | Summary | Disposition |
| --- | --- | --- | --- |
| `DEF-01` | Critical | Backend `maskApiKey` leaked secret prefix characters instead of `••••••••<last4>` | **Closed** (`1968cd7`) |
| `DEF-02` | High | `credentialSource` (`mariadb-secret-store` vs `environment`) not surfaced per row | **Closed** (`1968cd7`, `10d6a2c`) |
| `DEF-03` | Critical | Post-save `Test Connection` re-sent plaintext `apiKey` in request body | **Closed** (`10d6a2c`) |
| `DEF-04` | High | Multi-key pool draft rendered secret substrings in DOM chips before save | **Closed** (`10d6a2c`) |
| `DEF-05` | High | Legacy MariaDB AI Quota Governance missing from v2 `/admin/ai-settings` | **Closed** (`10d6a2c`) |
| `DEF-06` | High | `ADMIN` role fired `403` against `/api/admin/ai-settings` instead of clean role-scoped view | **Closed** (`1968cd7`, `10d6a2c`) |
| `DEF-07` | High | `POST /api/admin/ai/test-provider` `{ success: false }` treated as HTTP-200 green | **Closed** (`1968cd7`, `10d6a2c`) |
| `DEF-08` | High | `enabled: false` / `disabled: true` lost on reload for non-legacy registry providers | **Closed** (`1968cd7`, `10d6a2c`) |
| `DEF-09` | Medium | Custom `baseUrl` override not persisted/cleared (`'none'`) across reloads | **Closed** (`1968cd7`, `10d6a2c`) |
| `DEF-10` | Medium | Configured providers sorted alphabetically beneath unconfigured entries | **Closed** (`10d6a2c`) |
| `DEF-11` | High | `409 REVISION_CONFLICT` lacked explicit Reload Latest / Force Overwrite UX | **Closed** (`1968cd7`, `10d6a2c`) |
| `DEF-12` | High | `SUPPORT` / `AUDITOR` deep links lacked deterministic `403` forbidden panel | **Closed** (`10d6a2c`) |
| `DEF-13` | Medium | URL filter state (`?provider`, `?category`, `?status`, `?q`, `?dialog`) not synced | **Closed** (`10d6a2c`) |
| `DEF-14` | High | Hardcoded `localhost:8000` gateway URLs broke proxied/remote browser origins | **Closed** (`10d6a2c`) |
| `DEF-15` | Medium | Playground tab did not execute real `/api/v1/chat/completions` inference | **Closed** (`10d6a2c`) |
| `DEF-16` | Medium | Legacy `?tab=ai\|aisettings\|ai_settings\|aimodels` and `?subtab=key-pool` aliases incomplete | **Closed** (`10d6a2c`) |
| `DEF-17` | Medium | `<LegacyRedirect>` (`/adm/*`, `/platform/*`) stripped query parameters | **Closed** (`10d6a2c`) |
| `DEF-18` | High | Hand-rolled `div[role="dialog"]` & `window.confirm()` violated WCAG 2.1 AA modal semantics | **Closed** (`10d6a2c`) |
| `DEF-19` | Low | Dead 3,949-line `AdminAiSettingsTab.tsx.fixed` file tracked in repository | **Closed** (`1968cd7`) |
| `DEF-20` | Medium | Temperature `[0..2]` and Max Tokens `[256..8192]` clamped inconsistently | **Closed** (`1968cd7`, `10d6a2c`) |
| `DEF-21` | Medium | Pre-save modal `Test Key Before Saving` ignored `{ ok: false }` payloads | **Closed** (`10d6a2c`) |
| `DEF-22` | Medium | Discovery error states overwrote previously discovered models | **Closed** (`10d6a2c`) |
| `DEF-23` | Medium | Silent `catch {}` blocks hid API failures on user-initiated actions | **Closed** (`10d6a2c`) |
| `DEF-24` | Low (External) | Headless sandbox blocks outbound `fonts.googleapis.com` (`ERR_CONNECTION_CLOSED`) | **Logged External** (allow-listed narrowly in E2E console hygiene) |

---

## 4. Phase 4 — Post-Decomposition Module Architecture

The 3,625-line `AdminAiSettingsTab.tsx` monolith has been decomposed into `frontend/src/components/admin/ai-settings/`:

- **Orchestrator**: `ai-settings/AdminAiSettingsTab.tsx` — 89 lines (budget: < 300); root re-export: 5 lines
- **Largest leaf**: `context/AiSettingsContext.tsx` — 440 lines (budget: < 500)
- **Total leaves**: 42 files across 10 directories
- **Zero behavior change**: All `data-testid` attributes preserved, all existing tests pass at `--retries=0`

Full module tree, subtab-to-file mapping, and state architecture documented in [`module-map.md`](./module-map.md).

### P0 Enable/Disable Fix (applied before decomposition)

The `resolveExplicitEnableToggle` precedence inversion in `backend/services/aiAdmin.js` was fixed (`c2e08dc7`). Legacy merged fields (`openaiEnabled`, `anthropicEnabled`, etc.) no longer silently override the `enabledProviders` object for the 75-provider registry. A primary-provider guard prevents disabling the active routing provider without reassigning first.
