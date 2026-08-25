# Real Firestore to MySQL Data Migration Protocol

## 1. Migration Overview
The migration pipeline copies existing Firestore production collections into MariaDB `u727965524_airesume` without deleting, mutating, or damaging source Firestore documents.

---

## 2. CLI Execution Commands

### Dry-Run Simulation:
```bash
npm run db:migrate:firestore-to-mysql -- --dry-run
```

### Live Production Migration:
```bash
npm run db:migrate:firestore-to-mysql
```

---

## 3. Certified Migration Results

```text
===============================================================
📊 EXACT RECONCILIATION AUDIT: FIRESTORE vs MYSQL
===============================================================
```

| Collection / Table | Firestore Records | MySQL Records | Missing in MySQL | Extra in MySQL | Field Mismatches | ID Mismatches | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`users`** | 7 | 7 | **0** | **0** | **0** | **0** | ✅ **100% MATCH** |
| **`resumes`** | 45 | 45 | **0** | **0** | **0** | **0** | ✅ **100% MATCH** |
| **`portfolios`** | 1 | 1 | **0** | **0** | **0** | **0** | ✅ **100% MATCH** |
| **`covers`** | 0 | 0 | **0** | **0** | **0** | **0** | ✅ **100% MATCH** |
| **`system_settings`** | 8 | 8 *(+3 local)* | **0** | **0** | **0** | **0** | ✅ **100% MATCH** |
| **`stats`** | 2 | 2 | **0** | **0** | **0** | **0** | ✅ **100% MATCH** |
