# Database Parity Verification Engine

## 1. Parity Engine Overview
The Database Parity Engine compares logical records between Google Cloud Firestore and Hostinger MariaDB across multiple dimensions:
- Record Counts
- Primary Keys & Document IDs
- Revisions & Version Monotonicity
- Timestamps
- Ownership Constraints (UID scoping)
- Deterministic Content Hashes (SHA-256)

---

## 2. CLI Execution
```bash
npm run db:verify
```

---

## 3. Automated Contract Tests
```bash
npm run test:db-parity
npm run test:db-switch
npm run test:db-sync
npm run test:db-failover
```
