# Local Developer Admin + Super Admin live certification runbook

This runbook is intentionally exact and conservative. It does not claim PASS from source tests. Run from a trusted machine with access to the deployed origin and a dedicated certification identity. Never commit credentials or paste them into a report.

## 0. Preconditions and safety

```sh
cd /path/to/ResumePilotAi
git fetch origin main
git status --short --branch
git rev-parse HEAD
git rev-parse origin/main
node --version
npm --version
```

Use a clean checkout of the exact release candidate. Record the SHA before deployment and do not certify a different backend/frontend pair.

```sh
export PROD_BASE_URL='https://your-production-host'
export FIREBASE_API_KEY='your Firebase Web API key'
export SUPERADMIN_EMAIL='dedicated-superadmin@example.com'
export SUPERADMIN_PASSWORD='supplied-out-of-band'
export ADMIN_EMAIL='dedicated-admin@example.com'
export ADMIN_PASSWORD='supplied-out-of-band'
export USER_EMAIL='dedicated-user@example.com'
export USER_PASSWORD='supplied-out-of-band'
export EXPECTED_SHA="$(git rev-parse HEAD)"
```

For scripts that use `LIVE_CERT_*` names:

```sh
export LIVE_CERT_BASE_URL="$PROD_BASE_URL"
export LIVE_CERT_SUPERADMIN_EMAIL="$SUPERADMIN_EMAIL"
export LIVE_CERT_SUPERADMIN_PASSWORD="$SUPERADMIN_PASSWORD"
export LIVE_CERT_ADMIN_EMAIL="$ADMIN_EMAIL"
export LIVE_CERT_ADMIN_PASSWORD="$ADMIN_PASSWORD"
```

## 1. Production identity and SHA

```sh
EXPECTED_SHA="$EXPECTED_SHA" PROD_BASE_URL="$PROD_BASE_URL" \
  node scripts/verify-production-identity.mjs
```

Expected evidence:

- HTTPS origin reachable;
- `/healthz`, `/api/healthz`, `/api/platform/version` report the expected SHA;
- served HTML contains matching `data-build-sha`;
- no public availability secret leak;
- API count is compared only if `EXPECTED_API_COUNT` is deliberately supplied.

## 2. Baseline health and readiness

```sh
curl --fail-with-body --silent --show-error "$PROD_BASE_URL/healthz"
curl --fail-with-body --silent --show-error "$PROD_BASE_URL/api/healthz"
curl --silent --show-error "$PROD_BASE_URL/readyz" || true
curl --silent --show-error "$PROD_BASE_URL/api/readyz" || true
curl --fail-with-body --silent --show-error "$PROD_BASE_URL/api/service-availability"
```

`readyz` may be non-200 when Firebase is not ready; record the body. Do not translate `NOT_READY` to PASS.

## 3. API inventory and non-2xx reasons

Regenerate the source manifest only from the tested checkout:

```sh
npm run inventory:api
```

Then run authenticated safe probes:

```sh
PROD_BASE_URL="$PROD_BASE_URL" \
FIREBASE_API_KEY="$FIREBASE_API_KEY" \
ADMIN_EMAIL="$ADMIN_EMAIL" ADMIN_PASSWORD="$ADMIN_PASSWORD" \
SUPERADMIN_EMAIL="$SUPERADMIN_EMAIL" SUPERADMIN_PASSWORD="$SUPERADMIN_PASSWORD" \
node scripts/verify-api-inventory-live.mjs
```

The verifier skips parameterised/destructive routes and requires evidence for every non-2xx response. A 404/500/501/502/503 without a code, dependency, or documented disposition is FAIL—not an allow-list entry.

## 4. Platform health and command center

```sh
PROD_BASE_URL="$PROD_BASE_URL" \
FIREBASE_API_KEY="$FIREBASE_API_KEY" \
SUPERADMIN_EMAIL="$SUPERADMIN_EMAIL" SUPERADMIN_PASSWORD="$SUPERADMIN_PASSWORD" \
ADMIN_EMAIL="$ADMIN_EMAIL" ADMIN_PASSWORD="$ADMIN_PASSWORD" \
node scripts/verify-platform-health-live.mjs
```

Inspect `test-results/platform-health-live.json` for:

- state/configuration vocabulary;
- reason/remediation on every actionable service;
- no non-operational service claiming healthy;
- no unavailable metric rendered as zero;
- API matrix equals its enumerated endpoints;
- Admin projection hides host/process diagnostics;
- anonymous health requests return 401/403.

## 5. Configuration and feature flags

```sh
curl --silent --show-error -H "Authorization: Bearer $SUPERADMIN_ID_TOKEN" \
  "$PROD_BASE_URL/api/platform/configuration" > /tmp/platform-configuration.json
curl --silent --show-error -H "Authorization: Bearer $SUPERADMIN_ID_TOKEN" \
  "$PROD_BASE_URL/api/platform/feature-flags" > /tmp/platform-flags.json
```

Obtain `SUPERADMIN_ID_TOKEN` without storing it in the repository. Or use the authenticated Admin/Super Admin script:

```sh
PROD_BASE_URL="$PROD_BASE_URL" FIREBASE_API_KEY="$FIREBASE_API_KEY" \
SUPERADMIN_EMAIL="$SUPERADMIN_EMAIL" SUPERADMIN_PASSWORD="$SUPERADMIN_PASSWORD" \
ADMIN_EMAIL="$ADMIN_EMAIL" ADMIN_PASSWORD="$ADMIN_PASSWORD" \
ALLOW_DESTRUCTIVE=0 node scripts/verify-admin-superadmin-live.mjs
```

Verify `ENTERPRISE_TENANCY_ENABLED` includes value, source, impact, dependencies, restart requirement, last changed, changed by, and audit event. Verify the JSON does not contain a provider secret or private key.

## 6. Authentication, RBAC, MFA, and reauthentication

```sh
# Read-only authenticated certification
PROD_BASE_URL="$PROD_BASE_URL" FIREBASE_API_KEY="$FIREBASE_API_KEY" \
SUPERADMIN_EMAIL="$SUPERADMIN_EMAIL" SUPERADMIN_PASSWORD="$SUPERADMIN_PASSWORD" \
ADMIN_EMAIL="$ADMIN_EMAIL" ADMIN_PASSWORD="$ADMIN_PASSWORD" \
node scripts/verify-admin-superadmin-live.mjs

# Browser authorization + MFA/re-auth/error/responsive checks
npx playwright test --config=playwright.live-admin.config.js
```

Manually confirm:

- anonymous `/adm` redirects to login;
- ordinary user cannot mount the Admin shell;
- Admin can read allowed control-plane surfaces;
- Admin receives 403 for maintenance, feature flag control, provider tests, operator changes, tenant decommission/rename, role assignment, and permanent user deletion;
- Super Admin without a second factor receives `SUPER_ADMIN_MFA_REQUIRED` in production;
- stale Super Admin receives `RECENT_AUTH_REQUIRED` and the UI retries only after Firebase reauthentication;
- revoking a role/disable revokes refresh tokens.

## 7. Secret handling, including Razorpay

Use the Super Admin UI at **Settings → Subscriptions & Gateways**.

1. Record configured/source/masked status; never copy raw values.
2. Save non-secret pricing/toggle changes with all secret inputs blank.
3. Reload; assert configured state and a masked value remain.
4. Enter a replacement secret; save; reload; assert only the mask/status changed.
5. Click **Clear** and save; assert Firestore-only credential becomes `NOT_CONFIGURED`.
6. Attempt to clear an environment-managed credential; assert HTTP 409 and no mutation.
7. Use the provider test control; assert `success` is shown only after the backend response.
8. Inspect browser local/session storage, network response bodies, application logs, and audit detail; raw secrets must be absent.

The API contract is:

```text
blank/masked field      => PRESERVE
new non-masked value    => REPLACE
clearSecrets[provider]  => explicit CLEAR (Firestore only)
raw secret in response  => FAIL
```

Repeat the same lifecycle for AI, SMTP/fallback/IMAP, Twilio, OAuth, storage, Paytm, PhonePe, PayPal, and Stripe settings. Environment-managed credentials are status-only and require deployment changes.

## 8. Tenant CRUD and detail

Read-only first:

```sh
PROD_BASE_URL="$PROD_BASE_URL" FIREBASE_API_KEY="$FIREBASE_API_KEY" \
SUPERADMIN_EMAIL="$SUPERADMIN_EMAIL" SUPERADMIN_PASSWORD="$SUPERADMIN_PASSWORD" \
ADMIN_EMAIL="$ADMIN_EMAIL" ADMIN_PASSWORD="$ADMIN_PASSWORD" \
node scripts/verify-crud-live.mjs
```

For disposable mutations, use a dedicated certification window:

```sh
export TEST_USER_EMAIL="zz-cert-user-$(date +%s)@example.invalid"
export TEST_USER_PASSWORD='supplied-out-of-band'
PROD_BASE_URL="$PROD_BASE_URL" FIREBASE_API_KEY="$FIREBASE_API_KEY" \
SUPERADMIN_EMAIL="$SUPERADMIN_EMAIL" SUPERADMIN_PASSWORD="$SUPERADMIN_PASSWORD" \
ADMIN_EMAIL="$ADMIN_EMAIL" ADMIN_PASSWORD="$ADMIN_PASSWORD" \
TEST_USER_EMAIL="$TEST_USER_EMAIL" TEST_USER_PASSWORD="$TEST_USER_PASSWORD" \
ALLOW_DESTRUCTIVE=1 node scripts/verify-crud-live.mjs
```

The script creates only disposable `zz-cert-*` resources, reads them back, checks tenant detail sections, renames, suspends, reactivates, decommissions, suspends/activates a disposable user, assigns a non-Super role, and cleans up the disposable user. A tenant in `DELETING` remains subject to the configured retention worker; record its id and cleanup status.

Manually verify tenant detail shows: Overview, Users, Memberships, Usage, Plan, Security, M2M, Audit, Activity, Configuration. Verify rename changes the table and drawer after reload, slug remains immutable, and every mutation has an audit event.

## 9. User CRUD and audit

```sh
# User directory and user-specific audit are exercised by the CRUD script/UI.
PROD_BASE_URL="$PROD_BASE_URL" FIREBASE_API_KEY="$FIREBASE_API_KEY" \
SUPERADMIN_EMAIL="$SUPERADMIN_EMAIL" SUPERADMIN_PASSWORD="$SUPERADMIN_PASSWORD" \
ADMIN_EMAIL="$ADMIN_EMAIL" ADMIN_PASSWORD="$ADMIN_PASSWORD" \
ALLOW_DESTRUCTIVE=0 node scripts/verify-crud-live.mjs
```

Confirm separately with an Admin account that role selectors and permanent Delete are hidden/disabled; replay the request with curl/browser devtools and verify server-side 403. Confirm Admin cannot grant/revoke `SUPER_ADMIN`, suspend/change membership of a Super Admin, or decommission tenants.

## 10. Platform health, queues, payments, notifications, OAuth, workers

```sh
# Health collector and API matrix
node scripts/verify-platform-health-live.mjs
# Browser deep-link and responsive coverage
npx playwright test --config=playwright.live-admin.config.js
```

Open:

- `/adm/dashboard` for command center signals/recommendations;
- `/adm/health` for service detail and API Matrix;
- `/adm/queues` for bounded outbox/DLQ sample and Super Admin retry;
- `/adm/operations` for encryption, backup capability, maintenance, announcements;
- `/adm/security` for security audit events;
- `/adm/settings?tab=emailSettings` for SMTP/DNS/test state;
- `/adm/settings?tab=socialAuthSettings` for OAuth status/callbacks;
- `/adm/settings?tab=aiSettings` for provider status/tests/quota;
- `/adm/settings?tab=subscriptionsSettings` for payment state/tests.

A provider that is disabled/not configured/unavailable must say so with a reason/remediation, not show an unexplained API error.

## 11. Responsive UI matrix

The Playwright suite checks all six dimensions. For a manual visual spot check:

```sh
for size in '1440 900' '1280 800' '1024 768' '768 1024' '430 932' '375 667'; do
  echo "Check viewport: $size"
done
npx playwright test --config=playwright.live-admin.config.js --grep 'responsive|all first-class navigation|settings'
```

Check no horizontal overflow, overlapping sidebar, off-screen drawers/dropdowns, hidden actions, broken table scrolling, or inaccessible dialogs.

## 12. Backup and rollback

Before deployment, make a remote backup using the approved deployment process and verify it:

```sh
export BACKUP_PATH='/absolute/path/to/pre-deploy-backup.tar.gz'
export ROLLBACK_SHA='known-good-full-40-char-sha'
BACKUP_PATH="$BACKUP_PATH" ROLLBACK_SHA="$ROLLBACK_SHA" PROD_BASE_URL="$PROD_BASE_URL" \
  node scripts/verify-backup-rollback.mjs
```

Do not execute rollback as part of certification. If rollback is necessary:

```sh
git fetch origin
git checkout "$ROLLBACK_SHA"
npm ci --no-audit --no-fund
npm --prefix backend ci --no-audit --no-fund
npm run build
# deploy backend + dist from this SHA using the approved transport
pm2 restart ecosystem.config.js --update-env
EXPECTED_SHA="$ROLLBACK_SHA" PROD_BASE_URL="$PROD_BASE_URL" node scripts/verify-production-identity.mjs
PROD_BASE_URL="$PROD_BASE_URL" FIREBASE_API_KEY="$FIREBASE_API_KEY" SUPERADMIN_EMAIL="$SUPERADMIN_EMAIL" SUPERADMIN_PASSWORD="$SUPERADMIN_PASSWORD" node scripts/verify-platform-health-live.mjs
```

Restore Firestore/application snapshots only through the approved Enterprise backup restore workflow. Never manually edit tenant partitions during an incident.

## 13. Local regression suite

```sh
npm test
npm run test:security
npm run test:product
npm run test:enterprise
npm run test:enterprise:all
npm run build
npm run lint
npm run audit:production
```

Record command, exact SHA, environment (without secrets), start/end time, result JSON, and any FAIL/PARTIAL/BLOCKED/UNVERIFIED item. Do not change documentation to turn an unrun live check into PASS.
