# Safe Switching & Failover Operations

## 1. Pre-Switch Verification Algorithm
Before any database engine switch is executed (e.g. `MySQL ➔ Firestore` or `Firestore ➔ MySQL`), the system performs the mandatory pre-switch gate:

```text
Super Admin Switch Request
           ↓
Authenticate & Authorize (system.config.write)
           ↓
Drain In-Flight Outbox Queue (processSyncQueue)
           ↓
Check Active Conflicts & Dead Letters
           ↓
Probe Target Database Health & Latency
           ↓
Run Quick Parity Verification
           ↓
Acquire Atomic Switch Lock
           ↓
Update Durable Engine State (database_engine_state + .env)
           ↓
Invalidate Repository Caches
           ↓
Log Switch Event to database_switch_audit
```

---

## 2. Guardrails & Abort Triggers
The switch is **AUTOMATICALLY BLOCKED (HTTP 409 Conflict)** if:
1. Pending outbox events cannot be drained.
2. Unresolved entries exist in `sync_conflicts`.
3. Unacknowledged `DEAD_LETTER` events exist.
4. Target database probe fails connectivity or timeout checks.

---

## 3. Split-Brain Prevention
- **Durable Engine State**: All worker processes check `database_engine_state` table and `engine_state.json`.
- **Atomic Switch Lock**: Only one switch operation can execute at a time.
