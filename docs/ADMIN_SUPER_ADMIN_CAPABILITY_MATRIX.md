# Admin & Super Admin Capability Matrix

| Feature / Operation | Platform Admin | Super Admin | Tenant Admin (Enterprise) | Consumer User |
| :--- | :---: | :---: | :---: | :---: |
| **Authentication & Access** |
| Access `/adm` Dashboard | ✅ | ✅ | ❌ | ❌ |
| Require Strict MFA for Auth | ❌ | ✅ | ❌ | ❌ |
| Re-Auth on Destructive Actions | ✅ | ✅ | ✅ | ✅ |
| **Global User Management** |
| Search Global Users | ✅ | ✅ | ❌ | ❌ |
| View Global PII/Metadata | ✅ | ✅ | ❌ | ❌ |
| Suspend Global Account | ✅ | ✅ | ❌ | ❌ |
| Delete Global Account | ✅ | ✅ | ❌ | ❌ |
| Elevate user to Platform Admin | ❌ | ✅ | ❌ | ❌ |
| Elevate user to Super Admin | ❌ | ✅ | ❌ | ❌ |
| **Tenant Registry (/adm/tenants)** |
| View All Tenants | ✅ | ✅ | ❌ | ❌ |
| Suspend Tenant | ✅ | ✅ | ❌ | ❌ |
| Reactivate Tenant | ✅ | ✅ | ❌ | ❌ |
| Decommission Tenant (Hard Delete)| ❌ | ✅ | ❌ | ❌ |
| **System Operations (/adm/operations)** |
| View Platform Queues | ✅ | ✅ | ❌ | ❌ |
| View DLQ (Dead Letter Queue) | ✅ | ✅ | ❌ | ❌ |
| Replay DLQ Item | ❌ | ✅ | ❌ | ❌ |
| Flush DLQ | ❌ | ✅ | ❌ | ❌ |
| **Security & Auditing** |
| View Global Audit Logs | ✅ | ✅ | ❌ | ❌ |
| View Security Events | ✅ | ✅ | ❌ | ❌ |
| Modify AI Provider Secrets | ❌ | ✅ | ❌ | ❌ |
| Modify Platform Billing Keys | ❌ | ✅ | ❌ | ❌ |
| **Enterprise / Tenant Isolation** |
| View Tenant Users | ✅ | ✅ | ✅ | ❌ |
| Modify Tenant Workflows | ❌ | ❌ | ✅ | ❌ |
| Access Tenant Outbox | ❌ | ❌ | ✅ | ❌ |
