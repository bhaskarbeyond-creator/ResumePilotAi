# Admin + Super Admin live verification status

**Status at audit time:** `INCOMPLETE / NOT VERIFIED`
**Reason:** this sandbox has no production Firebase credentials and cannot reach the production origin. No live PASS is claimed.

## Local Developer commands

```sh
# From the repository root
export PROD_BASE_URL=https://your-production-host
export FIREBASE_API_KEY='...'
export SUPERADMIN_EMAIL='...'
export SUPERADMIN_PASSWORD='...'
export ADMIN_EMAIL='...'
export ADMIN_PASSWORD='...'

EXPECTED_SHA=$(git rev-parse HEAD) node scripts/verify-production-identity.mjs
node scripts/verify-platform-health-live.mjs
node scripts/verify-api-inventory-live.mjs
node scripts/verify-admin-superadmin-live.mjs
node scripts/verify-crud-live.mjs
LIVE_CERT_BASE_URL="$PROD_BASE_URL" \
  LIVE_CERT_SUPERADMIN_EMAIL="$SUPERADMIN_EMAIL" \
  LIVE_CERT_SUPERADMIN_PASSWORD="$SUPERADMIN_PASSWORD" \
  LIVE_CERT_ADMIN_EMAIL="$ADMIN_EMAIL" \
  LIVE_CERT_ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  npx playwright test --config=playwright.live-admin.config.js
```

## Evidence expected

Each script writes a JSON file under ignored `test-results/`:

- `production-identity.json`: backend SHA, frontend `data-build-sha`, TLS/cache, health.
- `platform-health-live.json`: service states, remediation, API matrix reconciliation, Admin projection, anonymous rejection.
- `api-inventory-live.json`: each safe probe and every non-2xx explanation.
- `admin-superadmin-live.json`: read surfaces, RBAC, health truthfulness, optional tenant lifecycle.
- `crud-live.json`: disposable tenant/user create/read/update/decommission/cleanup when explicitly enabled.
- Playwright report/traces/screenshots: UI, settings, authorization, errors, responsive layout.

## Required live assertions

- backend and frontend SHA equal the tested commit;
- `/adm` and `/admin` reach the same authenticated shell;
- Admin can read allowed surfaces but receives 403 for Super Admin mutations;
- Super Admin MFA and recent-auth challenges are enforced server-side;
- `ENTERPRISE_TENANCY_ENABLED` shows current source, impact, dependency, restart rule, and audit metadata;
- Razorpay save → reload → configured/masked → replacement → explicit clear behaves consistently;
- no raw secret appears in UI, API, browser storage, logs, or audit;
- tenant/user mutations persist and appear after read-back with audit events;
- platform health returns evidence-backed state; unknown is not healthy;
- no unexplained 404/500/501/502/503; disabled/not-configured responses carry codes and remediation;
- all six required viewports have no horizontal overflow.
