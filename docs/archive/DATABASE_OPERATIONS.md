# Database Operations & Maintenance Runbook

## 1. Credentials & Configuration
- **Database Engine**: MariaDB 10.11+ / MySQL 8.0+
- **Hostinger Database**: `u727965524_airesume`
- **User**: `u727965524_airesume`
- **Host**: `127.0.0.1:3306` (Hostinger Loopback)
- **Active Table Count**: 30 Tables (InnoDB utf8mb4)

---

## 2. Common Administrative Operations

### Inspect Active Engine State:
```bash
curl -H "Authorization: Bearer <ADMIN_TOKEN>" https://airesume.projectdemo.guru/api/admin/database-settings
```

### Trigger On-Demand Outbox Replication:
```bash
curl -X POST -H "Authorization: Bearer <ADMIN_TOKEN>" https://airesume.projectdemo.guru/api/admin/database-settings/sync-now
```

### Run Live Parity Verification:
```bash
curl -X POST -H "Authorization: Bearer <ADMIN_TOKEN>" https://airesume.projectdemo.guru/api/admin/database-settings/verify-parity
```

### Switch Active Database Engine:
```bash
curl -X POST -H "Authorization: Bearer <ADMIN_TOKEN>" -H "Content-Type: application/json" -d '{"engine":"mysql"}' https://airesume.projectdemo.guru/api/admin/database-settings
```
