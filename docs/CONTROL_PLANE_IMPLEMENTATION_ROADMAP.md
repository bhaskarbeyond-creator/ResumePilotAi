# RESUMEPILOT AI — CONTROL PLANE IMPLEMENTATION ROADMAP
## Phased Implementation Sequence, Value Metrics & Do-Not-Build Governance

**Author**: Principal Enterprise & Platform Architect  
**Version**: 2026.3 Strategic Blueprint  
**Status**: Execution Roadmap  

---

## 1. Phased Implementation Sequence

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│ PHASE 1: NOW (High Value, Low Risk, Architectural Consolidation)                           │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ • Unify Database Management into single "Data Integrity Center" (GAP-01)                  │
│ • Unify Notification Outbox & Enterprise Queue into single DLQ Inspector (GAP-07)          │
│ • Implement Automated 7-Day Outbox Synced Retention Pruner Daemon (GAP-01)                │
│ • Add Live Replication Latency P50/P95 Histogram in Control Plane (GAP-01)                │
│ • Implement Granular IP CIDR Allowlisting for Platform Operators (GAP-06)                  │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ PHASE 2: NEXT (Proactive Governance & AI Observability)                                    │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ • Implement Correlated Multi-Signal Incident Engine in Attention Module (GAP-02)           │
│ • Build Dedicated AI Operations & Token FinOps Center (GAP-03)                             │
│ • Deploy Automated Weekly Synthetic Disaster Recovery Restore Drill Pipeline (GAP-05)     │
│ • Add Geo-IP Enrichment & Velocity Threat Scoring to Security Events (GAP-08)             │
│ • Implement Tenant Resource Export ZIP Packager before Decommissioning (GAP-10)           │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ PHASE 3: LATER (Advanced Architecture & Compliance Automation)                             │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ • Interactive Service Catalog & Dependency Blast Radius Graph (GAP-04)                     │
│ • Side-by-Side Visual JSON Diff Preview for System Settings (GAP-09)                       │
│ • Real-time MRR Cohort & Subscription Retention FinOps Analytics (GAP-11)                  │
│ • Automated 1-Click GDPR Candidate Data Export & Erasure Pipeline (GAP-14)                 │
│ • In-App Release Changelog & Deployment History Timeline Modal (GAP-13)                    │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ PHASE 4: OPTIONAL / FUTURE (Predictive Scaling)                                            │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ • Linear Regression Telemetry Forecasting (Disk Saturation & Token Depletion)             │
│ • Indian Geo-SEO Automated Google Search Console API Keyword Sync (GAP-15)                 │
│ • Multi-Region Edge Asset Caching Performance Benchmarking                                │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 🚫 DO-NOT-BUILD LIST (Forbidden Architectural Anti-Patterns)

The following proposals are **EXPLICITLY REJECTED** as unnecessary complexity or high-risk anti-patterns for ResumePilot AI:

```
┌──────────────────────────────────────┬─────────────────────────────────────────────────────┐
│ Prohibited Item                      │ Architectural Rationale for Rejection               │
├──────────────────────────────────────┼─────────────────────────────────────────────────────┤
│ 1. Active/Active Multi-Master DB     │ Introduces distributed split-brain reconciliation   │
│    Clustering                        │ complexity without business justification. Current  │
│                                      │ MySQL Primary + Firestore Standby delivers 100%     │
│                                      │ uptime, <15ms latency, and zero data loss.          │
├──────────────────────────────────────┼─────────────────────────────────────────────────────┤
│ 2. Unrestricted AI Autonomous Write  │ Severe security hazard. AI must never execute raw   │
│    Agent (Shell / SQL Direct Access) │ SQL, shell commands, or arbitrary production        │
│                                      │ mutations. AI is limited to analysis & advisory.    │
├──────────────────────────────────────┼─────────────────────────────────────────────────────┤
│ 3. Microservice / Kubernetes Rewrite │ Massive operational overhead. Current monolith runs │
│    of Backend Runtime                │ at 0% CPU and 172MB RAM on PM2 with zero latency.   │
├──────────────────────────────────────┼─────────────────────────────────────────────────────┤
│ 4. Automatic Unverified Database     │ Dangerous. Failover must remain strictly gated by   │
│    Failover                          │ 100% parity proof or explicit operator override.    │
├──────────────────────────────────────┼─────────────────────────────────────────────────────┤
│ 5. Duplicate Relational Mirroring of │ Violates tenant cryptographic boundary. Enterprise  │
│    Firestore-Native Enterprise Plane │ resources use AES-256-GCM envelope encryption and   │
│                                      │ are designed to remain Firestore-native.           │
└──────────────────────────────────────┴─────────────────────────────────────────────────────┘
```

---

## 3. Measurable Business & Operational Value Metrics

| Enhancement Group | Primary Operational Metric Improved | Baseline Today | Target Post-Roadmap |
|---|---|---|---|
| **Data Integrity Center** | Mean Time to Diagnose (MTTD) DB Issues | 4.5 minutes | $<30$ seconds |
| **Correlated Incident Engine** | SRE Alert Fatigue & Duplicate Triage | 12 discrete alerts/incident | 1 unified incident |
| **AI Operations & FinOps** | Unplanned LLM Token Overages | Occasional surprises | 0 overages (budget alerts at 80%) |
| **Automated DR Drills** | Verified Recovery Time Objective (RTO) | 45 minutes (manual) | $<5$ minutes (automated) |
| **Automated Outbox Pruning** | Outbox Table Disk Footprint Growth | Linear unbounded growth | Constant bound ($<7$ days retained)|
