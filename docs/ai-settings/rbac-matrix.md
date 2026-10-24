# Role-Based Access Control (RBAC) Matrix — `/admin/ai-settings`

Verified end-to-end in `frontend/tests/engine-authenticated.spec.ts`, `frontend/tests/engine-security.spec.ts`, and `backend/test/admin-rbac-contract.test.js`.

## 1. Browser Route & UI Surface Matrix (6 Roles)

| Role | `/admin/ai-settings` (+ `?tab=ai*`, `/adm/*`, `/platform/*`) | Credential Vault & 75-Provider Controls | AI Quota Governance Panel | Outbound `/api/admin/ai-settings` Calls |
| --- | --- | --- | --- | --- |
| `SUPER_ADMIN` | **200 Render** — Full AI Multi-Provider Engine v2 UI (or safe-mode rollback panel when `ai_settings_v2_enabled=false`) | **Full Read (masked) + Write** | **Full Read + Write** (MFA / recent-auth honored when enforced) | `GET` + `POST` (`200 OK`) |
| `ADMIN` | **200 Render** — Scoped view with `data-testid="super-admin-restriction-notice"` + AI Quota Governance | **Hidden / Restricted** (no provider keys or router mutation controls mounted) | **Full Read + Write** (`GET /api/admin/ai/quota-stats`, `POST /api/admin/ai/quota-limits`, `POST /api/admin/ai/reset-quota`) | **0 calls** (zero noisy `403` console/network errors) |
| `SUPPORT` | **Deterministic `403` Card** — `data-testid="admin-tab-forbidden"` stays on requested `/admin/*` URL across reloads; `"Return to Allowed Workspace"` navigates to `/admin/support` | Denied | Denied | **0 calls** |
| `AUDITOR` | **Deterministic `403` Card** — `data-testid="admin-tab-forbidden"` stays on requested `/admin/*` URL across reloads; `"Return to Allowed Workspace"` navigates to `/admin/health` | Denied | Denied | **0 calls** |
| `USER` | **Redirect** -> `/dashboard` (`RequireRole` guard) across direct load and hard refresh | Denied | Denied | **0 calls** |
| `UNAUTHENTICATED` / Expired Token | **Redirect** -> `/login?next=<encodedPathAndSearch>` (`RequireRole` + `redirectOn401`) | Denied | Denied | **0 calls** |

---

## 2. Backend API Endpoint Authorization Matrix

| Endpoint | `SUPER_ADMIN` | `ADMIN` | `SUPPORT` | `AUDITOR` | `USER` | `UNAUTH` |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /api/admin/ai-settings` | `200` (masked keys only) | `403` | `403` | `403` | `403` | `401` |
| `POST /api/admin/ai-settings` | `200` / `409` CAS | `403` | `403` | `403` | `403` | `401` |
| `POST /api/admin/ai/test-provider` | `200` | `403` | `403` | `403` | `403` | `401` |
| `ALL /api/admin/ai/fetch-models` | `200` | `403` | `403` | `403` | `403` | `401` |
| `GET /api/admin/ai/quota-stats` | `200` | `200` | `403` | `200` (`audit.read` / `ai.entitlements.manage` per policy) | `403` | `401` |
| `POST /api/admin/ai/quota-limits` | `200` | `200` | `403` | `403` | `403` | `401` |
| `POST /api/admin/ai/reset-quota` | `200` | `200` | `403` | `403` | `403` | `401` |
| `GET /api/admin/operations/feature-flags/ai_settings_v2_enabled` | `200` | `200` (`system.config.read`) | `403` | `403` | `403` | `401` |
| `PUT /api/admin/operations/feature-flags/ai_settings_v2_enabled` | `200` | `403` (`Super Admin` / `feature_flags.manage`) | `403` | `403` | `403` | `401` |
