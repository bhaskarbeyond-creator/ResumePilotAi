# Dual-Database Architecture Specification: Firestore + MySQL/MariaDB

## 1. Architectural Overview

ResumePilot AI employs a pluggable, high-resilience **Dual-Database Architecture** designed to support both Google Cloud Firestore and Hostinger / Cloud MySQL/MariaDB with zero loss of functionality.

```text
                               APPLICATION CLIENT
                                (React 19 / Vite)
                                       │
                                       ▼
                             API / SERVICE LAYER
                         (Authenticated Bearer Token)
                                       │
                                       ▼
                               REPOSITORY FACTORY
                       (backend/repositories/index.js)
                                       │
                 ┌─────────────────────┴─────────────────────┐
                 │                                           │
                 ▼                                           ▼
        FIRESTORE REPOSITORY                         MYSQL REPOSITORY
    (Google Cloud NoSQL Store)                  (Hostinger InnoDB utf8mb4)
                 │                                           │
                 └─────────────────────┬─────────────────────┘
                                       │
                                SUPER ADMIN
                           DB CONTROLLER & SWITCH
                                       │
                     ┌─────────────────┴─────────────────┐
                     │                                   │
              FIRESTORE MODE                        MYSQL MODE
          (Reads/Writes: Firestore)             (Reads/Writes: MySQL)
```

---

## 2. Core Design Invariants

1. **Firestore Preservation & Fallback**:
   - The Firestore schema, collections, documents, subcollections, and security rules remain 100% untouched.
   - Firestore remains available at all times as an immediate fallback.
2. **Strict Mode Separation**:
   - In `FIRESTORE MODE`: Application operations read and write to Firestore.
   - In `MYSQL MODE`: Application operations read and write to MySQL.
3. **Zero Browser-Direct DB Execution in MySQL Mode**:
   - The frontend communicates via standard authenticated REST API routes (`/api/resumes`, `/api/portfolios`, `/api/covers`, `/api/jobs-data`, `/api/blog-data`, `/api/cms-pages`, `/api/notifications-data`, `/api/users-data`).
4. **Relational + JSON Hybrid Schema**:
   - Complex nested structures (employments, educations, skills, projects, certifications, etc.) are stored in MySQL `JSON` columns, eliminating brittle relational impedance while preserving high query performance on top-level columns (`user_id`, `status`, `title`, `updated_at`).
5. **Hostinger & MariaDB Compatibility**:
   - Engine: `InnoDB`
   - Charset: `utf8mb4` with `utf8mb4_unicode_ci` collation
   - Connection Pooling: Configured with `waitForConnections: true`, `connectionLimit: 15`, keepalive, and optional SSL.

---

## 3. Super Admin Engine Switcher Workflow

1. **Super Admin Access**: Gated behind `SUPER_ADMIN` / `system.config.write` RBAC authorization.
2. **Pre-Flight Connectivity Check**:
   - When switching to MySQL: Executes `SELECT 1 AS alive, VERSION() AS version` to ensure the host is reachable.
   - When switching to Firestore: Verifies Firestore client initialization and connectivity.
   - If target is unreachable: The switch fails immediately with a descriptive HTTP 400 error and records a `FAILED` entry in the audit ledger.
3. **Atomic State Persistence**:
   - Updates `backend/database/engine_state.json` via atomic rename.
   - Logs immutable record to `database_switch_audit` table.
   - Emits structured event to backend logger.

---

## 4. Entity Mapping Reference

| Domain Entity | Firestore Path | MySQL Table | Schema Type |
| :--- | :--- | :--- | :--- |
| **Users** | `users/{uid}` | `users` | Relational + `extra_data` JSON |
| **Resumes** | `users/{uid}/resumes/{resumeId}` | `resumes` | Relational + 13 JSON Array columns |
| **Public Resumes** | `pb/{resumeId}` | `public_resumes` | Relational + `object` MEDIUMTEXT |
| **Portfolios** | `users/{uid}/portfolios/{id}` | `portfolios` | Relational + `data` JSON |
| **Covers** | `users/{uid}/covers/{id}` | `covers` | Relational + `data` JSON |
| **Favourites** | `users/{uid}/favourites/{id}` | `favourites` | Relational + `data` JSON |
| **Jobs** | `jobs/{jobId}` | `jobs` | Relational + `requirements`, `skills` JSON |
| **Applications** | `applications/{appId}` | `applications` | Relational with Foreign Keys |
| **Job Tracker** | `users/{uid}/jobTracker/{id}` | `job_tracker` | Relational + `notes` TEXT |
| **Companies** | `companies/{companyId}` | `companies` | Relational + `description` TEXT |
| **Blog Posts** | `blog/{postId}` | `blog` | Relational + `tags` JSON |
| **Custom Pages** | `custom_pages/{pageId}` | `custom_pages` | Relational + `content` MEDIUMTEXT |
| **Trusted By** | `trusted_by/{brandId}` | `trusted_by` | Relational |
| **Reviews** | `reviews/{reviewId}` | `reviews` | Relational |
| **Notifications** | `notifications/{uid}/userNotifications/{id}` | `notifications` | Relational + `data` JSON |
| **Contact Messages**| `contact/{msgId}` | `contact_messages` | Relational |
| **System Settings** | `settings/{category}` | `system_settings` | `category` PK + `data` JSON |
| **Global Stats** | `data/stats` | `stats` | `id` PK + `data` JSON |
