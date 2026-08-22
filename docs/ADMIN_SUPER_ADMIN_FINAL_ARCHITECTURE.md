# Admin & Super Admin Final Architecture

## 1. Overview
The Administrative Console (`/adm`) serves as the global control plane for the AI Resume Builder platform. Unlike the Enterprise console (`/enterprise`) which operates strictly within the context of a single tenant, the Admin console spans the global database, orchestrating multi-tenant lifecycles, global AI governance, DLQ (Dead Letter Queue) playback, and top-level user role management.

## 2. Core Subsystems

### 2.1 Identity & Authorization Boundary
- **Provider**: Firebase Authentication.
- **Custom Claims Model**: `isSuperAdmin` (globally bound) vs `Admin` (platform-level).
- **MFA Policy**: Destructive actions (tenant decommission, account deletion) dynamically require a verified TOTP Second Factor, evaluated at the request timestamp (`auth_time`).
- **Context Segregation**: The Admin boundary is strictly separated from the Enterprise `tenantContext.js` to prevent privilege escalation via workspace ID injection.

### 2.2 Global Dashboard & Telemetry
- Exposes `healthScore`, `riskScore`, and system degradation states.
- Re-aggregates Firestore metrics (total users, payments, queue lengths).

### 2.3 Operations & Queue Planes
- **Queue Monitor**: Reads directly from `/platform/queues`, distinct from the Enterprise outbox.
- **DLQ Management**: Authorized Super Admins can invoke DLQ re-enqueue hooks for failed system emails and payment webhooks.

### 2.4 Security & Audit Logs
- Every mutation via `/api/admin/*` triggers `recordAdminAuditLog`.
- Logs are strictly immutable, storing `action`, `resource`, `severity`, and `outcome`.

## 3. UI/UX Architecture
- Follows the established design tokens of the Enterprise platform (Slate/Indigo palette, responsive Sidebar, Command Palette).
- Rendered via React Router (`/adm/*`) under `AdminProvider`.

## 4. Production Constraints
- **Deployment Topology**: PM2 Node.js Backend + Vite SPA Frontend.
- **Database**: Cloud Firestore.
- **Scale Out**: Stateless API endpoints, reliant on Firestore for locks/leases.
