# Security Review — AI Multi-Provider Engine (`/admin/ai-settings`)

Verified automatically by `frontend/tests/engine-security.spec.ts`, `backend/test/ai-admin.test.js`, `backend/test/ai-routing-security.test.js`, and `backend/test/admin-rbac-contract.test.js`.

---

## 1. Threat Model & Mitigations (STRIDE)

| Threat Category | Attack / Leak Vector | Control Implemented | Automated Verification |
| --- | --- | --- | --- |
| **Information Disclosure (`DEF-01`)** | API responses or DOM badges leaking leading API key prefixes | `maskApiKey()` in `backend/services/aiAdmin.js` emits strictly non-reversible `'••••••••' + last4` (or `'••••••••'` for `<8`-char secrets; multi-key pools append `' +N'` count only). Zero prefix characters ever leave the server. | `engine-security.spec.ts` (`/^•{8,}[A-Za-z0-9]{4}$/`), `ai-admin.test.js` |
| **Secret Re-Transmission (`DEF-03`)** | Browser retaining typed key in React state and re-sending `apiKey` during post-save probes | `singleKeyDrafts`, `poolKeyDrafts`, and modal secret inputs are cleared immediately upon `POST /api/admin/ai-settings` save; `probeStoredProvider` sends `{ provider }` only, resolving stored vault/env keys server-side. | `engine-security.spec.ts` (`expect(body).toEqual({ provider: 'cerebras' })`) |
| **DOM / Storage Persistence (`DEF-04`)** | Plaintext keys echoed into `localStorage`, `sessionStorage`, URL params, or pre-save pool chips | Multi-key pool drafts render an integer count badge (`"2 key(s) staged for server vault"`) with zero key substrings; zero secret values are ever written to `localStorage`, `sessionStorage`, or `searchParams`. | `engine-security.spec.ts` full DOM + storage + network listener scan |
| **Conflict Replay Exposure (`DEF-11`)** | `409 REVISION_CONFLICT` retry state holding plaintext `*ApiKey` / `*ApiKeys` fields in memory | `commitSettingsPatch` strips all `/ApiKey\|ApiKeys/i` keys before storing `safeRetryPayload` in `revisionConflict` state. | `AdminAiSettingsTab.tsx`, `engine-integrity.spec.ts` |
| **Elevation of Privilege (`DEF-06`, `DEF-12`)** | `ADMIN`, `SUPPORT`, `AUDITOR`, or `USER` reading/mutating provider vault keys | Backend `requireSuperAdmin` enforces `403` on `/api/admin/ai-settings`, `/api/admin/ai/test-provider`, and `/api/admin/ai/fetch-models` (`401` when unauthenticated). Frontend scopes `ADMIN` to Quota Governance only and renders `admin-tab-forbidden` for `SUPPORT`/`AUDITOR`. | `engine-authenticated.spec.ts`, `engine-security.spec.ts`, `admin-rbac-contract.test.js` |
| **SSRF / Embedded URL Credentials** | Operator or attacker pasting `https://user:pass@host/v1` custom endpoint | Backend `aiAdmin.js` rejects URLs containing embedded `username`/`password` credentials fail-closed (`400`) and validates HTTP/HTTPS scheme. | `ai-admin.test.js` (`test #9`) |
| **Tampering / Lost Updates (`DEF-11`)** | Concurrent Super-Admin tabs overwriting each other's settings silently | MariaDB `SELECT ... FOR UPDATE` compares `expectedRevision` against `system_settings.revision`, returning `409 REVISION_CONFLICT` unless explicit `force: true` overwrite is confirmed, and writes `security_audit_logs`. | `engine-integrity.spec.ts`, `ai-admin.test.js` |
| **Repository Credential Hygiene (`[SWOT-T]`)** | Realistic provider key prefixes accidentally committed in tests or docs | All tests and docs use synthetic `fixture-*` tokens (`fixture-sec-audit-single-secret-Z9X8`); zero `AIza*`, `sk-proj-*`, or `sk-ant-*` literals exist anywhere in git diff. | `grep -rnE` pre-commit check (`0` matches) |

---

## 2. Hard-Fail Network Leak Listener (`engine-security.spec.ts`)

`attachSecretLeakDetector(page, forbiddenSecrets)` attaches synchronous/async listeners to both `page.on('request')` and `page.on('response')`, inspecting:

1. Every request URL and response URL
2. Every request header map and response header map
3. Every `POST`/`PUT`/`PATCH` request body (`req.postData()`)
4. Every JSON, HTML, JavaScript, or text response body (`await res.text()`)

Across initial load, row expansion, Key Pool dialog inspection, hard page reload, and stored-key connection probes, **0 leaks** (`expect(leaks).toEqual([])`) were detected across all 5 viewport projects (`mobile`, `tablet`, `desktop`, `laptop`, `4k`).

---

## 3. Phase 1 → Phase 2 → Phase 3 Security Progression

| Security Control Domain | Phase 1 Audit Finding (`c0f76a0`) | Phase 2 Remediation (`1968cd7` + `10d6a2c`) | Phase 3 Automated Gate Proof (`02f5972`) |
| --- | --- | --- | --- |
| **API Key Masking (`DEF-01`)** | `maskApiKey()` exposed prefix characters of stored credentials in `GET /api/admin/ai-settings`. | Hardened `maskApiKey()` in `backend/services/aiAdmin.js` to return `'••••••••' + last4` only (`'••••••••'` for `<8` chars); added `credentialSources` (`mariadb-secret-store` vs `environment`). | `ai-admin.test.js` (`test #11`, `#12`) + `engine-security.spec.ts` (`DOM mask regex (/^•{8,}[A-Za-z0-9]{4}$/)...`, `10/10` flake-gated). |
| **Post-Save Probe Hygiene (`DEF-03`)** | Browser retained typed `apiKey` in React state and re-transmitted it on `POST /api/admin/ai/test-provider`. | Cleared all single/pool/modal key drafts immediately upon save; `probeStoredProvider` sends `{ provider }` only. | `engine-security.spec.ts` (`Post-save test-provider sends { provider } only...`, `10/10` flake-gated). |
| **Pre-Save Pool Draft Chips (`DEF-04`)** | Multi-key pool draft rendered raw key substrings in DOM badges prior to save. | Replaced chip previews with count-only badge (`"N key(s) staged for server vault"`). | `engine-security.spec.ts` full DOM text + Web Storage scan (`0` secret substrings). |
| **6-Role RBAC Isolation (`DEF-06`, `DEF-12`)** | `ADMIN` triggered noisy `403` fetches against `/api/admin/ai-settings`; `SUPPORT`/`AUDITOR` lacked deterministic `403` UI. | Scoped `ADMIN` strictly to `/api/admin/ai/quota-*` + read-only flag check (`0` `ai-settings` calls); rendered `admin-tab-forbidden` card for `SUPPORT`/`AUDITOR`. | `engine-authenticated.spec.ts` & `engine-security.spec.ts` across all 6 roles (`10/10` flake-gated). |
| **Concurrent Write Integrity (`DEF-11`)** | Concurrent admin saves risked silent lost updates or cached `*ApiKey` retry state. | Enforced `expectedRevision` -> `409 REVISION_CONFLICT` (`SELECT ... FOR UPDATE`), stripped `/ApiKey\|ApiKeys/i` from retry state, added `Reload Latest` / `Overwrite Remote`. | `engine-integrity.spec.ts` 2-browser-context CAS test (`10/10` flake-gated). |
| **Emergency Kill-Switch** | No zero-restart way to isolate `/admin/ai-settings` UI during an incident. | Registered `ai_settings_v2_enabled` (`requiresRestart: false`) in `featureFlagService.js` + MariaDB `system_settings` (`feature_flags`). | `engine-security.spec.ts` runtime OFF -> ON toggle without Express restart (`10/10` flake-gated). |

---

## 4. Known Legitimate Plaintext Transmission Points

### Pre-Save Provider Probe (`handleModalProbeBeforeSave`)

| Property | Value |
| --- | --- |
| **Endpoint** | `POST /api/admin/ai/test-provider` |
| **Frontend function** | `useProviderMutations.handleModalProbeBeforeSave()` |
| **When** | User clicks "Test Key" in Configure Provider dialog **before** saving the key to the vault |
| **What is transmitted** | `{ provider: "<id>", apiKey: "<candidate-key>" }` — the in-flight candidate key, not a stored key |
| **Transport** | HTTPS-only in production (Express binds HTTP locally; TLS terminates at reverse proxy) |
| **Server-side handling** | `testAiProvider()` uses the candidate key for a single upstream handshake, then discards it. Key is never written to DB, never written to `admin_audit_logs.metadata`, never logged to stdout/stderr. |
| **Rate limiting** | `adminAiTestLimiter` — `admin-ai-test` namespace, 300/min prod, SuperAdmin coarse-tier bypass. |
| **Audit logging** | `sanitizeAuditValue()` redacts any field matching `/apikey/i` at both write-time (line 193) and read-time (line 220) in `adminAudit.js`. |
| **Contrast with post-save probe** | After save, `probeStoredProvider()` sends `{ provider }` only — the server resolves the stored vault key server-side. This was the original DEF-03 fix. |

**Automated verification:**

- `engine-security.spec.ts`: "Pre-save probe transmits candidate key, post-save probe sends `{provider}` only" — network body assertions
- `engine-security.spec.ts`: "Pre-save probe candidate key is NOT persisted in admin_audit_logs" — DB row absence assertion
- `ai-admin.test.js`: `sanitizeAuditValue` redacts `apiKey` field in audit metadata

### CSP Header

`POST /api/admin/ai-settings` and related endpoints return `Content-Security-Policy: script-src 'self'` via existing CSP middleware. Verified by `engine-security.spec.ts` response-header assertion.

---

## 5. Decomposed Module Security Surface (Post-Refactor)

After decomposition into `frontend/src/components/admin/ai-settings/`, the security-critical code paths are:

| Concern | File | Function |
| --- | --- | --- |
| Pre-save probe (candidate key transmission) | `hooks/useProviderMutations.ts` | `handleModalProbeBeforeSave()` |
| Post-save probe (vault-only, zero key) | `hooks/useProviderMutations.ts` | `probeStoredProvider()` |
| Secret draft clearing | `hooks/useProviderMutations.ts` | `handleRowSaveKey()` — clears `singleKeyDrafts` and `poolKeyDrafts` |
| Pool draft display | `providers/ProviderRowExpanded.tsx` | Count-only badge, zero key substrings |
| CAS conflict recovery | `hooks/useRevisionConflict.ts` | Strips `/ApiKey\|ApiKeys/i` from retry payload |
| RBAC gate | `hooks/useRoleGate.ts` | Returns `isSuperAdmin` from session |
| Feature flag kill-switch | `hooks/useFeatureFlag.ts` | `ai_settings_v2_enabled` runtime toggle |
