# Canonical URL, Query-Parameter & Deep-Link Matrix — `/admin/ai-settings`

Verified in `frontend/tests/engine-integrity.spec.ts` and `frontend/tests/engine-authenticated.spec.ts`.

---

## 1. Canonical Route & Legacy Path Redirects

| Incoming Path | Resolution | Query String Handling |
| --- | --- | --- |
| `/admin/ai-settings` | **Canonical route** — renders `AdminConsolePage` with active tab `ai-settings` | Preserved verbatim |
| `/admin?tab=ai-settings` | Normalized via `replace: true` to `/admin/ai-settings` | Remaining query params (`?subtab=`, `?provider=`, etc.) preserved |
| `/admin?tab=ai` | Legacy alias -> `/admin/ai-settings` | Remaining query params preserved |
| `/admin?tab=aisettings` | Legacy alias -> `/admin/ai-settings` | Remaining query params preserved |
| `/admin?tab=ai_settings` | Legacy alias -> `/admin/ai-settings` | Remaining query params preserved |
| `/admin?tab=aimodels` | Legacy alias -> `/admin/ai-settings` | Remaining query params preserved |
| `/adm` / `/adm/:section` (e.g. `/adm/ai-settings?subtab=metrics`) | `<LegacyRedirect>` (`frontend/src/app/router.tsx`) -> `/admin/ai-settings?subtab=metrics` | Full `location.search` + `location.hash` preserved (`DEF-17`) |
| `/platform` / `/platform/:section` (e.g. `/platform/ai-settings?subtab=discovery&q=llama`) | `<LegacyRedirect>` (`frontend/src/app/router.tsx`) -> `/admin/ai-settings?subtab=discovery&q=llama` | Full `location.search` + `location.hash` preserved (`DEF-17`) |

---

## 2. Query-State Grammar on `/admin/ai-settings`

All filter, subtab, and dialog states synchronize bidirectionally with `useSearchParams` (`replace: true` for filter edits) and survive hard browser reloads (`F5` / `page.reload()`):

| Query Parameter | Accepted Values | Default (Omitted from URL) | Behavior |
| --- | --- | --- | --- |
| `subtab` | Primary: `providers`, `discovery`, `metrics`, `unified-gateway`, `playground`<br>Legacy preserved aliases: `models` (-> `discovery`), `quotas` (-> `metrics`), `gateway` (-> `unified-gateway`), `key-pool` (-> `providers` + opens `key-pool` modal) | `providers` | Activates corresponding `role="tab"` (`aria-selected="true"`) and `role="tabpanel"` |
| `q` | Free-text search string | `""` | Filters provider rows by `id`, `name`, `label`, `defaultModel`, or `type`; also clears when `"Clear filters"` is clicked |
| `provider` | Exact provider ID (e.g. `groq`, `cerebras`, `llamacpp`) | `""` | Filters to matching provider and auto-expands its inline configuration drawer |
| `category` | `all`, `frontier`, `llm`, `search`, `local` (legacy alias `mesh` -> `local`) | `all` | Filters provider catalog by capability group / local runtime |
| `status` | `all`, `configured`, `healthy`, `issues`, `cooldown`, `disabled` | `all` | Filters provider rows by live server-reported status |
| `dialog` | `configure-provider`, `key-pool`, `cooldowns`, `discovery`, `snippets`, `confirm-clear-key`, `confirm-reset-user-quota`, `confirm-reset-all-quotas` | `""` | Opens the corresponding `@radix-ui/react-dialog` modal; Escape / backdrop click clears `dialog` & `target` params cleanly |
| `target` | Provider ID or User UID (paired with confirmation dialogs) | `""` | Scopes destructive confirmation dialogs (`confirm-clear-key`, `confirm-reset-user-quota`) |

---

## 3. Full Deep-Link Matrix (URL × 6 Roles × Direct Load × Hard Refresh × Popup Dialog)

Every cell below is verified automatically in `frontend/tests/engine-authenticated.spec.ts` (`10/10` consecutive flake-gated runs) and `frontend/tests/engine-integrity.spec.ts` (`10/10` consecutive flake-gated runs):

| Deep-Link URL Pattern | `SUPER_ADMIN` (Direct Load + `F5` Reload) | `ADMIN` (Direct Load + `F5` Reload) | `SUPPORT` & `AUDITOR` (Direct Load + `F5` Reload) | `USER` (Direct Load + `F5` Reload) | `UNAUTHENTICATED` (Direct Load + `F5` Reload) | Popup / Dialog State |
| --- | --- | --- | --- | --- | --- | --- |
| `/admin/ai-settings` | Renders `Providers & Keys` (`Runtime model selection`) | Renders `super-admin-restriction-notice` + `AI Quota Governance` (`0` `403`s) | Renders deterministic `admin-tab-forbidden` (`403`) card | Redirects to `/dashboard` | Redirects to `/login?next=%2Fadmin%2Fai-settings` | Closed |
| `/admin/ai-settings?subtab=providers&category=frontier&status=configured&q=groq` | Filters to `Frontier Free Tier` + `Configured` + `groq`; survives `F5` | Scoped `AI Quota Governance` (`0` `403`s) | `admin-tab-forbidden` (`403`) card | Redirects to `/dashboard` | Redirects to `/login?next=...` | Closed |
| `/admin/ai-settings?subtab=providers&provider=groq&dialog=configure-provider` | Expands `groq` row + opens `Configure Provider` `<Dialog>` across `F5`; Escape removes `dialog=` | Scoped `AI Quota Governance` (`0` `403`s; Super-Admin dialog suppressed) | `admin-tab-forbidden` (`403`) card | Redirects to `/dashboard` | Redirects to `/login?next=...` | `Configure Provider` open (`SUPER_ADMIN`) |
| `/admin/ai-settings?subtab=key-pool` | Maps legacy alias -> `Providers & Keys` + opens `Manage key pools` `<Dialog>` | Scoped `AI Quota Governance` | `admin-tab-forbidden` (`403`) card | Redirects to `/dashboard` | Redirects to `/login?next=...` | `Manage key pools` open (`SUPER_ADMIN`) |
| `/admin/ai-settings?subtab=discovery` (`/admin/ai-settings?subtab=models`) | Renders `Models & Fallback Chains` across `F5` | Scoped `AI Quota Governance` | `admin-tab-forbidden` (`403`) card | Redirects to `/dashboard` | Redirects to `/login?next=...` | Optional `?dialog=discovery` / `cooldowns` |
| `/admin/ai-settings?subtab=metrics` (`/admin/ai-settings?subtab=quotas`) | Renders `Quotas & Telemetry` + `AI Quota Governance` across `F5` | Scoped `AI Quota Governance` | `admin-tab-forbidden` (`403`) card | Redirects to `/dashboard` | Redirects to `/login?next=...` | Optional `?dialog=confirm-reset-*` |
| `/admin/ai-settings?subtab=unified-gateway` (`/admin/ai-settings?subtab=gateway`) | Renders `Unified Gateway` with dynamic `${window.location.origin}/v1` | Scoped `AI Quota Governance` | `admin-tab-forbidden` (`403`) card | Redirects to `/dashboard` | Redirects to `/login?next=...` | Optional `?dialog=snippets` |
| `/admin/ai-settings?subtab=playground` | Renders live `Playground` (`/api/v1/chat/completions`) across `F5` | Scoped `AI Quota Governance` | `admin-tab-forbidden` (`403`) card | Redirects to `/dashboard` | Redirects to `/login?next=...` | Closed |
| `/admin?tab=ai`, `?tab=aisettings`, `?tab=ai_settings`, `?tab=aimodels` | Normalizes to `/admin/ai-settings` preserving remaining query params | Scoped `AI Quota Governance` | `admin-tab-forbidden` (`403`) card | Redirects to `/dashboard` | Redirects to `/login?next=...` | Preserves `?dialog=*` |
| `/adm/ai-settings?subtab=metrics` & `/platform/ai-settings?subtab=discovery&q=llama` | `<LegacyRedirect>` -> `/admin/ai-settings?...` with full query string preserved | Scoped `AI Quota Governance` | `admin-tab-forbidden` (`403`) card | Redirects to `/dashboard` | Redirects to `/login?next=...` | Preserves `?dialog=*` |

---

## 4. API Endpoints & Mandatory CAS Contract

| Endpoint | Method | Role | Payload Requirements | Error Contract |
| --- | --- | --- | --- | --- |
| `/api/admin/ai-settings` | `GET` | `SUPER_ADMIN` | None | `401` Unauthenticated, `403` Non-SuperAdmin |
| `/api/admin/ai-settings` | `POST` | `SUPER_ADMIN` | `expectedRevision` (**REQUIRED**, integer >= 0)<br>`settings` / provider inputs<br>`force` (optional, emergency CAS bypass only) | `400 EXPECTED_REVISION_REQUIRED` if `expectedRevision` omitted<br>`409 REVISION_CONFLICT` if revision stale<br>`400 CANNOT_DISABLE_PRIMARY_PROVIDER` |
| `/api/admin/ai/test-provider` | `POST` | `SUPER_ADMIN` | `{ provider: "<id>", apiKey?: "<candidate-key>", model?: "<model>" }` | Rate limited: **10 req/min/user** (`adminAiTestLimiter`)<br>`429 RATE_LIMITED` on 11th request<br>`400 AI_PROVIDER_NOT_CONFIGURED`<br>`422 AI_PROVIDER_AUTHENTICATION_FAILED` |
| `/api/admin/ai/fetch-models` | `POST` | `SUPER_ADMIN` | `{ provider: "<id>", apiKey?: "<candidate-key>" }` | `503 AI_MODELS_FETCH_FAILED` |
| `/api/admin/ai/quota-stats` | `GET` | `ADMIN`, `SUPER_ADMIN` | None | `403` if role not admin |
| `/api/admin/ai/quota-limits` | `POST` | `ADMIN`, `SUPER_ADMIN` | `expectedRevision` (REQUIRED)<br>`basicDailyLimit`, `premiumDailyLimit`, `adminDailyLimit` | `400 AI_QUOTA_REVISION_REQUIRED`<br>`409 AI_QUOTA_CONFLICT` |

