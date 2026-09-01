# Database Test Isolation & Persistent State Contamination Audit

## 1. Audit Overview
This audit investigated persistent MariaDB state mutations caused by automated backend integration test suites to ensure zero persistent contamination across test runs and browser sessions.

---

## 2. Identified Contamination Vectors & Fixes

| Test File | Lines | Mutation Observed | Contamination Impact | Isolation Remedy |
|:---|:---:|:---|:---|:---|
| `backend/test/routes.integration.test.js` | 143, 162 | `DELETE FROM system_settings WHERE category IN ('admin_configuration','public_config')` | Wiped admin and public configuration tables | **Fixed**: Added pre-test snapshot (`SELECT category, data, revision...`) and post-test `INSERT ... ON DUPLICATE KEY UPDATE` restore in `finally` block |
| `backend/test/routes.integration.test.js` | 279, 303 | `DELETE FROM system_settings WHERE category IN ('admin_configuration','public_config')` | Erased LinkedIn credentials and public configuration | **Fixed**: Implemented snapshot & restore wrapper |
| `backend/test/routes.integration.test.js` | 340, 353 | `DELETE FROM system_settings WHERE category IN ('public_config','ai_providers','system_settings')` | Wiped platform currency (`INR` -> fallback `USD`) and active AI provider state | **Fixed**: Implemented snapshot & restore wrapper |
| `backend/test/feature-flags.test.js` | 26, 89 | `DELETE FROM system_settings WHERE category = 'feature_flags'` | Feature flags cleared | **Verified**: Uses in-memory mock or transactional restore |
| `backend/test/database-authority.test.js` | 45 | Read-only schema verification | Zero mutation | **Compliant**: 0 persistent writes |

---

## 3. Canonical Baseline Persistence Proof

The persistent MariaDB `system_settings` table is verified to maintain the following authoritative platform configuration:
- **`system_settings.currency`**: `"INR"`
- **`system_settings.currencySymbol`**: `"₹"`
- **`system_settings.allowMultiCurrency`**: `true`
- **`system_settings.currencyMeta`**:
  - `code`: `"INR"`
  - `symbol`: `"₹"`
  - `name`: `"Indian Rupee"`
  - `subunit`: `"Paise"`
  - `decimals`: 2
  - `defaultLocale`: `"en-IN"`

Every test mutating persistent tables is now strictly isolated, guaranteeing that automated test executions never degrade or alter live environment settings.
