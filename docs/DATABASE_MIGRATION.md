# Firestore to MySQL Migration Operations Guide

## 1. Prerequisites & Environment Configuration

Ensure your `.env` (or `backend/.env`) has the MySQL connection parameters configured:

```env
# Database Abstraction Layer
DB_ENGINE=firestore # or mysql

# MySQL / MariaDB Connection Parameters (Hostinger / Dedicated / Local)
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=u123456789_resumepilot
DB_PASSWORD=YourStrongDatabasePassword123!
DB_NAME=u123456789_resumepilot_db
DB_SSL=false # Set to true if connecting via SSL on Hostinger/Cloud
```

---

## 2. Initializing MySQL Schema

To create or verify all tables, indexes, foreign keys, and constraints on Hostinger / MySQL:

```bash
# Option A: Run via Super Admin UI
Navigate to Admin Dashboard > Settings > Dual Database Engine > Click "Verify / Initialize Schema"

# Option B: Run via MySQL CLI / phpMyAdmin
Import backend/database/schema.sql directly into your MySQL database
```

---

## 3. Running Data Migration

The migration tool reads from Firestore, transforms documents into relational MySQL records, and writes them with exact ID preservation.

### Dry-Run Simulation (Zero Writes)
To test the migration without modifying MySQL:
```bash
npm run db:migrate:firestore-to-mysql -- --dry-run
```

### Live Migration Execution
To execute the one-way transfer from Firestore to MySQL:
```bash
npm run db:migrate:firestore-to-mysql
```

### Key Migration Invariants:
- **Zero Firestore Modification**: Firestore collections and documents are NEVER updated or deleted during migration.
- **Idempotent**: Can be safely re-run multiple times without creating duplicate records (`INSERT ... ON DUPLICATE KEY UPDATE`).
- **Data Integrity**: JSON arrays (employments, educations, skills) and nested maps are validated and preserved intact.

---

## 4. Hostinger MariaDB / MySQL Setup

1. Log into your **Hostinger hPanel**.
2. Navigate to **Databases** > **MySQL Databases**.
3. Create a new database (e.g. `u123456789_resumepilot`) and user.
4. Set collation to `utf8mb4_unicode_ci`.
5. In **phpMyAdmin**, click **Import** and upload `backend/database/schema.sql`.
6. Update `backend/.env` with your Hostinger database credentials.
7. Restart your Node.js PM2 process:
   ```bash
   pm2 restart ai-resume-backend
   ```
8. Go to the **Admin Dashboard > Dual Database Engine** to confirm the live MySQL connection indicator shows `Connected`.
