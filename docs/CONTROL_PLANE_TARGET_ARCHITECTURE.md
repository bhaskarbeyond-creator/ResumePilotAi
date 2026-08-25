# RESUMEPILOT AI — CONTROL PLANE TARGET ARCHITECTURE
## Unified Operational Nervous System Specification

**Author**: Principal Enterprise & Platform Architect  
**Version**: 2026.3 Target Blueprint  
**Status**: Strategic Architecture Document  

---

## 1. Architectural Philosophy & First Principles

The ResumePilot AI Control Plane is designed around five non-negotiable architectural axioms:

1. **Separation of Control and Data Planes**: The failure, slowness, or unreachability of the Control Plane UI/API must never impair the Application Plane (candidate resume building, job applications, or public resume rendering).
2. **Fail-Closed Security & Explicit Authorization**: UI visibility is never authorization. Every administrative mutation independently enforces server-side JWT verification, RBAC permissions, and TOTP step-up authentication.
3. **Deterministic Governance Over Heuristics**: Autonomous actions operate exclusively within strict, bounded, deterministic policies. AI provides diagnostic assistance, incident summarization, and root-cause hypotheses—never unrestricted write permissions or arbitrary production mutations.
4. **Lossless Data Parity & Reversible Mutations**: Business mutations replicate with 100% losslessness across MySQL primary and Firestore standby. All administrative repairs and remediations must be idempotent, auditable, and reversible where feasible.
5. **No Visual Dashboard Clutter**: Information architecture follows progressive disclosure: high-level status $\to$ correlated incident $\to$ drill-down telemetry $\to$ actionable runbook.

---

## 2. 12-Plane Architectural Layering

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│ 1. GOVERNANCE & COMPLIANCE PLANE (Audit Trail, GDPR, Legal, Retention, Terms)              │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ 2. CONTROL & OBSERVABILITY PLANE (Command Center, Attention, Health, Incidents, Runbooks)  │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ 3. ENTERPRISE & MULTI-TENANCY PLANE (Tenants, Workspaces, Teams, Quotas, Encryption)       │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ 4. IDENTITY & ACCESS PLANE (Firebase Auth, TOTP MFA, RBAC, Operators, Sessions)           │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ 5. DATA & CONTINUOUS SYNC PLANE (MySQL Primary, Firestore Standby, Outbox, Parity Audit)   │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ 6. AI OPERATIONS PLANE (Gemini, NVIDIA, OpenAI, Groq, Latency Matrix, Token FinOps)        │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ 7. BILLING & COMMERCE PLANE (Razorpay, Stripe, Invoices, Subscriptions, Coupon Locks)     │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ 8. COMMUNICATION PLANE (Transactional Email, Notification Outbox, Delivery Workers)        │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ 9. INTEGRATION PLANE (OAuth, S3/Cloud Storage, Job Scraper, Maps, Twilio)                 │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ 10. APPLICATION PLANE (Vite/React SPA, SSR Endpoints, Resume Engine, ATS Simulator)       │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ 11. INFRASTRUCTURE PLANE (Hostinger Linux VPS, PM2 Daemon Supervisor, MariaDB Socket)      │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ 12. DEPLOYMENT PLANE (SCP/SSH Pipeline, Commit SHA Guard, Automated Healthz Probe)         │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Target Module Taxonomy (Unified 10-Console Architecture)

To eliminate administrative fragmentation while avoiding dashboard sprawl, the target Control Plane unifies functionality into **10 Core Operational Consoles**:

```
┌──────────────────────────────────────┬─────────────────────────────────────────────────────┐
│ Target Console Module                │ Consolidated Responsibilities                       │
├──────────────────────────────────────┼─────────────────────────────────────────────────────┤
│ 1. Unified Command Center            │ Platform pulse, environment, Git SHA, active SLOs,  │
│                                      │ active incidents, and global emergency broadcast.   │
├──────────────────────────────────────┼─────────────────────────────────────────────────────┤
│ 2. Incident & Attention Manager      │ Correlated multi-signal incident triage, lifecycle  │
│                                      │ tracking (OPEN->RESOLVED), and runbook triggers.    │
├──────────────────────────────────────┼─────────────────────────────────────────────────────┤
│ 3. Data Integrity & Engine Control   │ Dual database status (MySQL/Firestore), continuous  │
│                                      │ parity audit, sync latency, and safe failover gate. │
├──────────────────────────────────────┼─────────────────────────────────────────────────────┤
│ 4. Queue, DLQ & Outbox Console       │ Notification outbox, enterprise queue, DLQ message  │
│                                      │ payload inspector, and safe replay simulator.       │
├──────────────────────────────────────┼─────────────────────────────────────────────────────┤
│ 5. Tenant & Workspace Governance     │ Multi-tenant lifecycle, workspace isolation, team   │
│                                      │ RBAC, quota buckets, and resource export.          │
├──────────────────────────────────────┼─────────────────────────────────────────────────────┤
│ 6. AI Operations & FinOps Center     │ Multi-provider availability matrix, latency graphs, │
│                                      │ token spend attribution, and fallback toggles.      │
├──────────────────────────────────────┼─────────────────────────────────────────────────────┤
│ 7. Security, MFA & Audit Trail       │ Immutable audit ledger, real-time threat stream,    │
│                                      │ operator session revocation, and IP allowlisting.   │
├──────────────────────────────────────┼─────────────────────────────────────────────────────┤
│ 8. Platform Health & Service DAG     │ Live subsystem probes, API endpoint matrix, and     │
│                                      │ interactive service dependency topology graph.      │
├──────────────────────────────────────┼─────────────────────────────────────────────────────┤
│ 9. Backup & Disaster Recovery Center │ Logical dump verification, SHA-256 integrity logs,  │
│                                      │ automated restore drill pipeline, and RTO/RPO stats.│
├──────────────────────────────────────┼─────────────────────────────────────────────────────┤
│ 10. Platform Operations & Settings   │ Maintenance mode, feature flags, global currencies, │
│                                      │ announcements, and validated system configuration.  │
└──────────────────────────────────────┴─────────────────────────────────────────────────────┘
```

---

## 4. End-to-End Control Plane Mutation Flow & Safety Gate

Every state-mutating operation initiated from the Control Plane must traverse this rigorous 7-stage pipeline:

```
[ Operator Action in React UI ]
             │
             ▼
[ 1. Step-Up Authentication Check ] (Requires TOTP verification if action is classified DESTRUCTIVE)
             │
             ▼
[ 2. RBAC & Scope Authorization ] (Validates exact server permission e.g. system.config.write)
             │
             ▼
[ 3. Dry-Run & Impact Simulation ] (Computes blast radius, affected tenant count, and rollback plan)
             │
             ▼
[ 4. Optimistic Revision Lock ] (Validates expected revision matches current store state)
             │
             ▼
[ 5. Atomic Service Execution ] (Executes mutation within database transaction / CAS lease)
             │
             ▼
[ 6. Post-Mutation Verification ] (Executes immediate synthetic health probe to confirm success)
             │
             ▼
[ 7. Immutable Audit Record ] (Writes actor, role, IP, request ID, before/after state to audit ledger)
```

---

## 5. Control Plane Self-Monitoring & Watchdog

To prevent the monitoring system from failing silently:
1. **Collector Heartbeat Watchdog**: A background timer runs every 60 seconds. If `getHealthSnapshot()` has not updated in $>180$ seconds, the header indicator turns **RED (COLLECTOR_STALE)**.
2. **Audit Writer Resilience**: If writing to `admin_audit_logs` fails, the operation rolls back and aborts (fail-closed audit invariant).
3. **Zero Inferred Health**: When a service probe encounters a network timeout, the status is explicitly reported as `UNKNOWN` or `DEGRADED`—never inferred as `HEALTHY`.
