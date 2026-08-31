# SUPER ADMIN AUDIT — Architecture, Authentication & Security Report

## 1. Account Existence & Storage

- **Account Status**: Verified & Active in MariaDB.
- **Database Table**: `users` table in MariaDB (`ai_resume_builder`).
- **Primary Identifier (UID)**: `OhZdiSIFL7ePA1TMkfu9bnR935D3`
- **Email Address**: Configured via `ADMIN_EMAIL` (`bhaskar.beyond@gmail.com`).
- **Dual Storage Architecture**:
  1. **Firebase Authentication**: Holds identity credentials, password verification, MFA enrollment, and custom claims (`role: 'SUPER_ADMIN'`).
  2. **MariaDB (`users` table)**: Authoritative store for application profile, role (`SUPER_ADMIN`), membership, status, and tenant relations.

---

## 2. Bootstrapping & Provisioning Lifecycle

- **Bootstrap Script**: `backend/reset-pwd.js`
- **Mechanism**:
  - Uses `firebase-admin/auth` with environment credentials (`RESET_SUPERADMIN_EMAIL`, `RESET_ADMIN_EMAIL`).
  - Fetches or provisions the identity record in Firebase Auth.
  - Sets the custom user claim: `{ role: 'SUPER_ADMIN' }`.
  - Synchronizes the role to MariaDB `users` table via `repo.saveUser(uid, { role: 'SUPER_ADMIN' })`.
- **Local / Test Environment**:
  - In non-production preview/test environments, `POST /api/auth/preview-login` issues signed tokens with `SUPER_ADMIN` role when the email matches `PREVIEW_SUPER_ADMIN_EMAILS`.
  - In production (`NODE_ENV === 'production'`), preview login is completely disabled (404), and tokens are strictly verified against Google's public keys.

---

## 3. Roles & Permissions Hierarchy

```text
SUPER_ADMIN (Role)
  ├── Permissions: ['*'] (Wildcard access to all platform resources)
  ├── Access:
  │    ├── Platform Command Center (/adm/dashboard)
  │    ├── Security Events & Auditing (/adm/security, /adm/audit-logs)
  │    ├── Platform Operations & Maintenance (/adm/operations)
  │    ├── Tenant Registry & Multi-Tenancy (/adm/tenants)
  │    ├── User 360 & Operator IAM (/adm/users, /adm/operators)
  │    └── AI Entitlements & Provider Settings (/adm/settings)
  └── MFA Gate:
       └── Destructive control-plane mutations require TOTP Second-Factor (P0 Invariant)
```

---

## 4. Authentication & Authorization Enforcement

### Server-Side Authorization Gates (`backend/security/auth.js`)
- `requireAuth`: Verifies bearer token against Firebase Admin SDK (or HMAC verifier in isolated tests). Populates `req.user = { uid, email, emailVerified, claims }`.
- `isSuperAdmin(user)`: Evaluates `role === 'SUPER_ADMIN' || permissions.has('*')`.
- `requireSuperAdmin`: Rejects non-super-admin callers with `HTTP 403 FORBIDDEN`.
- `requireSuperAdminWithMfa`: Enforces TOTP second-factor (`sign_in_second_factor === true`) and recent authentication age (`auth_time`).

### Security Invariants Verified
1. **No Client-Side Authority**: Super Admin checks are never trusted from client payloads. All administrative endpoints enforce `requireSuperAdmin` on the server.
2. **Self-Demotion & Role Escalation Protection**: Normal users cannot grant themselves administrative claims. Super Admin claims cannot be altered via standard user mutation APIs (`SUPER_ADMIN_PROTECTED`).
3. **MFA Boundary**: In production mode, destructive operations (tenant decommission, secret rotation, maintenance toggle) require verified TOTP second-factor.

---

## 5. Admin UI Gating (`src/components/admin/Admin.jsx`)

- **Role Resolution**: Evaluates `tokenRole === 'SUPER_ADMIN' || permissions.includes('*')`.
- **UI Indicators**: Renders "Super Admin" crown badge and unlocks Control Plane navigation routes (`Command Center`, `Security Events`, `Platform Operations`, `Operator Management`, `Tenant Registry`).
- **MFA Warning Banner**: Displays non-blocking notification if session lacks second-factor challenge, guiding the admin to complete MFA verification for destructive actions.

---

## 6. Verification Results

- **Backend IAM Tests**: `backend/test/operators-iam.test.js` — **PASS** (100%)
- **Super Admin Control Plane Tests**: `tests/superadmin-control-plane.test.mjs` — **PASS** (100%)
- **MFA Security Gates**: `backend/test/totp-mfa-lifecycle.test.js` — **PASS** (100%)
- **Live Role Matrix**: `tests/backend-rbac-expanded.test.cjs` — **PASS** (100%)
