# Super Admin Control Plane Data Source & Degradation Matrix

## Screen-by-Screen Data Source Breakdown

| Control Plane Module | Route | Primary Expected Source | Actual Runtime Source | Standby Source | Failure Behavior (Quota Limited) | UI State |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Command Center** | `/admin/command-center` | MariaDB (`u727965524_airesume`) | MariaDB | Firestore Standby | Served 100% by MariaDB; zero disruption | Live Metrics & Graphs |
| **Admin Audit Logs** | `/admin/audit-logs` | Firestore `admin_audit_logs` | Firestore | Outbox Mirror | HTTP 200 `{ degraded: true, quotaLimited: true }` | Amber Status Card + Safe Retry |
| **Audit Statistics** | `/admin/audit-logs` | Firestore `admin_audit_logs` | Firestore | Outbox Mirror | HTTP 200 `{ degraded: true, sampleSize: 0 }` | Graceful zeroed metric tiles |
| **Security Events** | `/admin/security` | Firestore `security_audit_logs` | Firestore | Outbox Mirror | HTTP 200 `{ degraded: true, quotaLimited: true }` | Amber Status Card + Safe Retry |
| **User Directory** | `/admin/users` | MariaDB `users` | MariaDB | Firebase Auth | Served 100% by MariaDB; zero disruption | Live User Table |
| **Platform Health** | `/admin/health` | Memory / Express Probes | Memory / Express | None | Served 100% from Node memory | Green Health Badges |
| **Tenant Management** | `/admin/tenants` | MariaDB `enterprise_tenants` | MariaDB | Firestore | Served 100% by MariaDB | Live Tenant Cards |
| **Subscription Orders** | `/admin/billing` | MariaDB `subscriptions` | MariaDB | Stripe/Razorpay | Served 100% by MariaDB | Live Billing Ledger |
| **Email Templates** | `/admin/email-templates` | MariaDB `email_templates` | MariaDB | Default Templates | Served 100% by MariaDB | Live Template Editor |
| **AI Settings** | `/admin/ai-settings` | MariaDB `system_settings` | MariaDB | Env Defaults | Served 100% by MariaDB | Live Provider Config |
| **Payment Settings** | `/admin/payment-settings`| MariaDB `system_settings` | MariaDB | Env Defaults | Served 100% by MariaDB | Live Gateway Config |
| **Platform Version** | `/api/platform/version` | Process Git Identity | In-Memory Object | None | 100% Resilient; 0 DB dependency | Live Commit & Service |
