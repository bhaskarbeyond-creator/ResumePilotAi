# RESUMEPILOT AI — CONTROL PLANE SELF-HEALING ARCHITECTURE
## Autonomous Remediation, Bounded Resilience & Safety Policy

**Author**: Principal Reliability & Systems Architect  
**Version**: 2026.3 Specification  
**Status**: Authoritative Architectural Standard  

---

## 1. Core Principles of Autonomous Self-Healing

Self-healing in ResumePilot AI is governed by the **Principle of Non-Destructive Bounded Autonomy**:

> *The system is authorized to autonomously recover transient operational failures (leases, retries, connections, failovers between equivalent stateless providers) where the action is proven idempotent, reversible, and non-destructive.*
> 
> *All destructive operations (database promotion, hard failover, tenant decommissioning, mass data pruning, financial adjustments, and credential modifications) STRICTLY REQUIRE HUMAN SUPER ADMIN AUTHORIZATION.*

---

## 2. Classification Matrix: Autonomous vs. Human-Gated

```
┌────────────────────────────────────────────────────────┬──────────────────────────────────────────┐
│ FULLY AUTONOMOUS (Safe Self-Healing)                   │ HUMAN SUPER ADMIN GATED (MFA Required)   │
├────────────────────────────────────────────────────────┼──────────────────────────────────────────┤
│ • Stale worker CAS lease reclamation (>120s)           │ • MySQL <-> Firestore Primary Promotion  │
│ • Transient DB connection pool re-establishment       │ • Emergency Database Failover (<100% par)│
│ • Notification outbox exponential backoff retry (1-5x) │ • Tenant Decommissioning or Hard Deletion│
│ • Poison-pill outbox message DLQ quarantine            │ • Bulk Dead-Letter Queue (DLQ) Purge     │
│ • Outbox synced event retention pruning (>7 days)      │ • Financial Invoice Void / Transaction Adj│
│ • AI Provider automatic failover (NVIDIA -> Gemini)    │ • Super Admin Role Grant / Permissions   │
│ • In-memory cache invalidation on config update        │ • Master AES-256 Encryption Key Rotation │
└────────────────────────────────────────────────────────┴──────────────────────────────────────────┘
```

---

## 3. Autonomous Self-Healing Control Loops

### 3.1. Stale Outbox CAS Lease Recovery
- **Trigger**: Worker crashes midway through processing an outbox batch, leaving records in `PROCESSING` state.
- **Condition**: `state = 'PROCESSING' AND leased_until < NOW()`.
- **Policy**: Reset lease lock and increment `attempt_count`.
- **Execution**:
  ```sql
  UPDATE sync_outbox 
  SET state = 'PENDING', leased_by = NULL, leased_until = NULL, attempt_count = attempt_count + 1 
  WHERE state = 'PROCESSING' AND leased_until < NOW() AND attempt_count < 5;
  ```
- **Verification**: Next worker tick successfully claims and processes records.
- **Audit**: Logged as `SELF_HEAL_LEASE_RECLAIM` in system event log.

---

### 3.2. AI Provider Circuit Breaking & Graceful Failover
- **Trigger**: Primary AI provider (e.g. NVIDIA NIM) returns 3 consecutive HTTP 429 (Rate Limit) or HTTP 503 (Unavailable) responses within 60 seconds.
- **Condition**: Consecutive failure threshold $\ge 3$.
- **Policy**: Trip circuit breaker for 180 seconds; route subsequent generations to configured secondary provider (e.g. Google Gemini 1.5 Pro).
- **Verification**: Secondary provider delivers completion in $<2000$ms.
- **Escalation**: If secondary also fails, return graceful degraded fallback error to client with zero application crash.
- **Audit**: Logged in `admin_audit_logs` as `AI_PROVIDER_FAILOVER_TRIPPED`.

---

### 3.3. Poison-Pill Outbox Quarantine (DLQ Transition)
- **Trigger**: A corrupted or un-parseable outbox mutation repeatedly throws fatal exceptions.
- **Condition**: `attempt_count >= 5`.
- **Policy**: Move record state to `DEAD_LETTER` with exact error message and stack trace. Prevent infinite retry loop blocking the queue.
- **Verification**: Queue continues processing subsequent valid messages without delay.
- **Escalation**: Attention indicator increments; SRE alerted via dashboard.
- **Audit**: Immutable DLQ record preserved with full original payload.

---

## 4. Remediation Escalation & Anti-Flapping Safeguards

To prevent remediation loops and cascading storms:
1. **Exponential Jitter**: All automated retries calculate backoff as:
   $$T_{\text{wait}} = \min(60000, 1000 \times 2^{\text{attempt}} + \text{rand}(0, 1000))$$
2. **Remediation Cooldown**: An autonomous healing action (such as cache clearing or worker restart) cannot execute more than twice in any 10-minute window.
3. **Emergency Brake (Circuit Open)**: If autonomous self-healing fails to resolve an anomaly within 3 cycles, the autonomous loop shuts down and raises a **P1 Critical Attention Incident** for human operator intervention.
