# OLD vs NEW Comparison Matrix & UX Simplifications — `/admin/ai-settings`

**Summary Disposition:** `16/16` surfaces verified — **`13` `exceeds`**, **`3` `parity`**, **`0` `missing`**.

---

## 1. OLD vs NEW Capability Comparison Matrix (`0` `missing`)

This matrix compares legacy `src/components/admin/settings/AiSettings.jsx` (`1,580` lines) + baseline `AdminAiSettingsTab.tsx` (`c0f76a0`, `2,914` lines) against the rebuilt v2 `AdminAiSettingsTab.tsx` (`10d6a2c`, `3,596` lines).

| Capability / Surface | OLD (`AiSettings.jsx` + `c0f76a0` Baseline) | NEW (`10d6a2c` Rebuilt v2) | Disposition | Automated Proof |
| --- | --- | --- | --- | --- |
| Runtime Selection Mode (`auto`, `quality`, `speed`, `balanced`, `manual`) | Present in `c0f76a0`; `manual`-only in legacy `AiSettings.jsx` | Persisted in MariaDB `system_settings.ai` with header bar selector | **`parity`** | `engine-integrity.spec.ts`, `engine-authenticated.spec.ts` |
| Automatic Failover Mesh Toggle (`enableFallback`) | Present | Inline header checkbox persisted via CAS | **`parity`** | `engine-authenticated.spec.ts` |
| Resume Import Feature Toggle (`resumeImportEnabled`) | Linked to Platform Settings in `AiSettings.jsx`; duplicated in `c0f76a0` | Single authoritative home in `/admin/settings` with direct header deep link | **`parity`** | `AdminAiSettingsTab.tsx`, `engine-responsive.spec.ts` |
| Manual Pinned Provider + Live Discovered Model Pin | Partial (6 legacy providers or static fallback model IDs) | All 75 providers + authoritative live `/api/admin/ai/fetch-models` catalog | **`exceeds`** | `engine-integrity.spec.ts`, `engine-authenticated.spec.ts` |
| Collapsible Generation Tuning (`temperature`, `maxTokens`) | Always-expanded sliders clamped to `[0..1]` | Collapsed-by-default header popover (`0.00..2.00`, `256..8192`) | **`exceeds`** | `engine-authenticated.spec.ts`, `ai-admin.test.js` |
| 75-Provider Registry + Search (`?q=`) + Category (`?category=`) + Status (`?status=`) | 6 providers in `AiSettings.jsx`; unsorted / non-URL-synced in `c0f76a0` | Configured-first sort + full bidirectional URL query sync across reloads | **`exceeds`** | `engine-integrity.spec.ts` |
| Single-Key & Multi-Key Pool Vault Storage + Masking | Prefix-leaking mask, no credential provenance badge | Strict `/^•{8,}[A-Za-z0-9]{4}$/` mask + `MariaDB Vault` / `Server Env` badge | **`exceeds`** | `engine-security.spec.ts`, `ai-admin.test.js` |
| Per-Provider Enable/Disable Persistence (`75` providers) | Broken on reload for non-legacy providers (`DEF-08`) | `enabledProviders` / `disabledProviders` persisted across all 75 providers | **`exceeds`** | `engine-authenticated.spec.ts`, `ai-admin.test.js` |
| Custom OpenAI-Compatible `baseUrl` Override + Clear (`'none'`) | Local providers only; embedded URL creds not guarded | Modal `Custom endpoint` tab + inline row drawer + fail-closed URL cred guard | **`exceeds`** | `engine-authenticated.spec.ts`, `ai-admin.test.js` |
| Stored-Key Connection Probe (`POST /api/admin/ai/test-provider`) | Re-transmitted plaintext `apiKey`; `{ success: false }` shown green | `{ provider }`-only payload + strict `{ ok, success }` error surfacing | **`exceeds`** | `engine-security.spec.ts`, `engine-integrity.spec.ts` |
| Operational Modals (Configure, Key Pools, Cooldowns, Discovery, Snippets) | Hand-rolled `div[role="dialog"]` + `window.confirm()` (`DEF-18`) | `@radix-ui/react-dialog` with focus trap, `aria-labelledby`, Escape & `?dialog=` | **`exceeds`** | `engine-integrity.spec.ts`, `engine-responsive.spec.ts` |
| Unified OpenAI-Compatible Gateway (`${window.location.origin}/v1`) | Hardcoded `http://localhost:8000/v1` (`DEF-14`) | Dynamic `window.location.origin` + focusable copy/export config | **`exceeds`** | `engine-authenticated.spec.ts` |
| Interactive Inference Playground (`POST /api/v1/chat/completions`) | Static mock output (`DEF-15`) | Live authenticated router completion with model, latency, and error telemetry | **`exceeds`** | `engine-authenticated.spec.ts` |
| MariaDB AI Daily Quota Governance (`Basic`, `Premium`, `Enterprise`, `Admin` + Reset) | Present in `AiSettings.jsx`; **missing** from `c0f76a0` (`DEF-05`) | Consolidated into v2 `Quotas & Telemetry` + scoped `ADMIN` workspace (`0` `403`s) | **`exceeds`** | `engine-authenticated.spec.ts` |
| Optimistic Concurrency Control (`expectedRevision` / `409 REVISION_CONFLICT`) | Silent overwrite / unrecoverable `409` (`DEF-11`) | CAS conflict banner with `Reload Latest` and `Overwrite Remote` (`force: true`) | **`exceeds`** | `engine-integrity.spec.ts` |
| Runtime Feature-Flag Rollback (`ai_settings_v2_enabled`) | Absent | Zero-restart runtime safe-mode card via MariaDB `feature_flags` | **`exceeds`** | `engine-security.spec.ts` |

---

## 2. Eight UX & Workflow Simplifications (Before vs After Metrics)

> **Line-Count Honesty Note (`B1`):** Single-file LOC in `AdminAiSettingsTab.tsx` grew by **`+682` lines (`+23.40%`, `2,914` -> `3,596`; `+4.61%` words, `9,906` -> `10,363`)** because the single module absorbed `AiSettings.jsx`'s MariaDB Quota Governance (`DEF-05`), `ADMIN` scoped mode (`DEF-06`), `409` CAS conflict resolution (`DEF-11`), `ai_settings_v2_enabled` rollback UI, live Playground (`DEF-15`), and 8 accessible Radix `<Dialog>` trees (`DEF-18`), while combined `AdminAiSettingsTab*` footprint fell **`47.60%`** (`6,863` -> `3,596` after deleting dead `3,949`-line `AdminAiSettingsTab.tsx.fixed`) and consolidated `AdminAiSettingsTab.tsx + AiSettings.jsx` footprint fell **`19.98%`** (`4,494` -> `3,596`). Accordingly, UX simplification is measured below purely by **rendered surface density, operator click-paths, and cognitive load** — never by claiming single-file LOC shrinkage.

| # | Simplification Item | Before (`c0f76a0` + `AiSettings.jsx`) | After (`10d6a2c` v2 UI) | Concrete UX / Workflow Metric |
| --- | --- | --- | --- | --- |
| 1 | **Single Provider Onboarding Flow** | 3 competing entry points (quick-add strip, separate `key-pool` subtab, and custom overlay) | 1 canonical `Configure Provider` Radix modal (`Provider key`, `Multi-key pool`, `Custom endpoint` tabs) + inline row drawer | **3 competing credential forms -> 1 unified modal + row drawer** (`?subtab=key-pool` preserved as deep-link alias) |
| 2 | **Primary Subtab Consolidation** | 6+ top-level subtabs + separate legacy `AiSettings.jsx` screen | 5 primary subtabs (`Providers & Keys`, `Models & Fallback Chains`, `Quotas & Telemetry`, `Claude Code & Agents`, `Playground`) | **2 separate admin screens + 6 subtabs -> 1 screen with 5 task-oriented subtabs** |
| 3 | **Collapsed-by-Default Generation Tuning** | Always-visible Temperature & Max Tokens slider cards pushing provider table below the fold | Compact header button `Tuning (0.70 · 2048 tok)` expanding on demand | **~140px vertical header height saved; primary CTA `Save All Changes` visible above the fold at `360×640` (`y + h <= 640px`)** |
| 4 | **Configured-First Provider Triage** | 75 providers listed in static catalog order; active keys buried beneath unconfigured entries | Deterministic sort: Configured/Enabled first -> Healthy -> Issues -> Alphabetical, paired with `Configured` / `Issues` quick chips | **0-scroll immediate visibility of all active/broken providers out of 75** (`DEF-10`) |
| 5 | **Progressive Row Disclosure** | Dense multi-input cards rendered simultaneously for every visible provider row | Compact 1-line summary row (`Name`, `Status`, `••••••••last4`, `Vault/Env`, `Enable` switch, `Expand` chevron) | **Per-row collapsed interactive controls reduced from 7+ inputs to 2 (`Switch` + `Expand`)** |
| 6 | **De-Duplicated `resumeImportEnabled` Toggle** | Toggle duplicated across both `/admin/settings` and `/admin/ai-settings` | Single authoritative toggle in `/admin/settings`, referenced via inline header `<Link to="/admin/settings">` | **2 conflicting toggle locations -> 1 authoritative source of truth** |
| 7 | **Role-Scoped `ADMIN` Governance View** | `ADMIN` loaded full Super-Admin UI and hit `403` errors on `/api/admin/ai-settings` | Dedicated `super-admin-restriction-notice` + interactive `AI Quota Governance` card | **`403` API errors on `ADMIN` page load reduced from `>=1` to `0`** (`DEF-06`) |
| 8 | **Accessible Modal & Confirmation System** | 5 hand-rolled `div[role="dialog"]` overlays + blocking `window.confirm()` alerts | 8 `@radix-ui/react-dialog` components with Escape, backdrop click, scroll lock, focus return, and `?dialog=` URL state | **`window.confirm` calls: `0`; critical/serious WCAG 2.1 AA violations across 5 viewports: `0`** (`DEF-18`) |
