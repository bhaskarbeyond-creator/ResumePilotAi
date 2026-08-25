# RESUMEPILOT AI — MAXIMUM-EXTENT GAP REGISTER
## Comprehensive Control Plane Defect, Enhancement & Opportunity Ledger

**Audit Baseline**: Commit `9a2dfbb` (`production-final-2026-08-26`)  
**Status**: Read-Only Architecture Gap Discovery  

---

### GAP-01: Fragmented Database & Data Integrity Navigation
- **Domain**: Data Plane / Database Governance
- **Module**: `DatabaseSettings.jsx` / `PlatformOperations.jsx` / `PlatformHealth.jsx`
- **Severity**: **P2 (Medium)**
- **Current State**: Database metrics, active engine switcher, failover logs, and parity checks are split across three different admin tabs.
- **Desired State**: A single consolidated **Data Integrity Center** displaying MySQL primary status, Firestore standby status, real-time sync latency graphs, continuous parity percentage, outbox event depth, and verified failover gates in one screen.
- **Evidence**: `DatabaseSettings.jsx` handles engine switching; `PlatformOperations.jsx` shows backup status; `PlatformHealth.jsx` shows database ping latency.
- **Risk**: Operator confusion during high-stress database incidents; switching between tabs increases mean time to resolve (MTTR).
- **Impact**: Operator efficiency and rapid diagnostic capability.
- **Recommendation**: Unify database telemetry into a dedicated `Data Integrity & Engine Control` view.
- **Automation Opportunity**: Automatic background parity auditing and outbox queue draining.
- **Self-Healing Opportunity**: Stale lease recovery and transient socket reconnection.
- **Predictive Opportunity**: Forecasting table row growth and sync divergence velocity.
- **AI Opportunity**: Natural language explanations of replication lag spikes.
- **Security Impact**: Centralizes failover authorization and step-up TOTP verification in one audited console.
- **Tenant Impact**: Zero tenant disruption.
- **Dependencies**: `backend/routes/databaseAdmin.js`, `backend/database/syncManager.js`.
- **Complexity**: Low to Medium.
- **Priority**: **NEXT**.
- **Test Requirement**: Verify consolidated API payload returns 100% of telemetry in $<50$ms.

---

### GAP-02: Isolated Alerting Without Root-Cause Incident Correlation
- **Domain**: Observability / Incident Management
- **Module**: `PlatformAttention.jsx` / `backend/routes/platform.js`
- **Severity**: **P1 (High)**
- **Current State**: Attention alerts trigger on individual service thresholds (e.g. database latency high, queue backlog high, email delivery failed) as disconnected items.
- **Desired State**: Correlated Incident Engine that clusters related telemetry anomalies into a unified Incident with state lifecycle (`OPEN` $\to$ `TRIAGED` $\to$ `MITIGATING` $\to$ `RESOLVED`), timeline, affected blast radius, and associated runbooks.
- **Evidence**: `PlatformAttention.jsx` displays an array of flat attention cards without parent incident grouping.
- **Risk**: Alert fatigue for operators; difficulty pinpointing true root cause when a downstream failure generates multiple secondary alerts.
- **Impact**: SRE MTTR and platform reliability governance.
- **Recommendation**: Implement incident aggregation logic in `backend/services/incidentManager.js` that groups alerts sharing common dependency roots.
- **Automation Opportunity**: Automatic incident creation, severity assignment, and resolution when metrics normalize.
- **Self-Healing Opportunity**: Automated execution of pre-approved safe mitigation runbooks.
- **Predictive Opportunity**: Anomaly detection flagging abnormal metric correlations before threshold breach.
- **AI Opportunity**: Automated incident title generation, symptom summarization, and draft postmortem synthesis.
- **Security Impact**: Distinguishes security incidents (e.g., brute force attack) from operational infrastructure failures.
- **Tenant Impact**: Lists specific tenant IDs impacted by the incident.
- **Dependencies**: `backend/services/platformHealth.js`.
- **Complexity**: Medium.
- **Priority**: **NEXT**.
- **Test Requirement**: Simulate Firestore latency $\to$ verify single correlated incident created instead of 3 isolated alerts.

---

### GAP-03: Lack of Dedicated AI Operations & Cost Governance Center
- **Domain**: AI Plane / LLM Operations
- **Module**: `AISettings.jsx` / `backend/routes/ai.js`
- **Severity**: **P2 (Medium)**
- **Current State**: Administrators configure AI provider API keys (Gemini, NVIDIA, OpenAI, Groq) and models in `AISettings.jsx`, but cannot visualize real-time provider latency, error rates, token burn rates, or failover events.
- **Desired State**: Dedicated **AI Operations Center** providing:
  1. Live availability & latency matrix for all configured providers.
  2. Trailing 24h / 7d / 30d token consumption and financial spend charts.
  3. Spend attribution by tenant, user tier, and feature (Resume, Cover Letter, ATS, Interview Coach).
  4. Manual 1-click provider circuit breaker and fallback priority toggle.
- **Evidence**: `AISettings.jsx` provides form inputs for keys and models, but telemetry is only visible in raw server logs.
- **Risk**: Undetected provider degradation or unexpected API token billing overages.
- **Impact**: FinOps visibility, AI service resilience, and user experience.
- **Recommendation**: Create `backend/services/aiObservability.js` and frontend `PlatformAiOps.jsx`.
- **Automation Opportunity**: Automatic provider failover on consecutive HTTP 429 / 503 responses.
- **Self-Healing Opportunity**: Dynamic model downscaling when primary model experiences high queue delay.
- **Predictive Opportunity**: Token quota exhaustion prediction based on user velocity.
- **AI Opportunity**: Meta-analysis of generation prompt effectiveness and quality benchmarking.
- **Security Impact**: Tracks suspicious prompt injection attempts and abnormal token spikes per IP/UID.
- **Tenant Impact**: Enforces atomic tenant-level AI quota limits.
- **Dependencies**: `backend/services/aiRuntime.js`.
- **Complexity**: Medium.
- **Priority**: **NEXT**.
- **Test Requirement**: Provider failover simulation under simulated HTTP 503 response.

---

### GAP-04: Absence of Interactive Service Catalog & Dependency Blast Radius
- **Domain**: Infrastructure / Architecture
- **Module**: `PlatformHealth.jsx`
- **Severity**: **P3 (Low)**
- **Current State**: Services are listed as independent items (API, MySQL, Firestore, Worker, Email, AI, Storage) without visual topological dependency edges.
- **Desired State**: Interactive **Service Catalog & Dependency Graph** illustrating:
  - Component upstream callers and downstream dependencies.
  - Critical path topology.
  - Live health status per node with color-coded status rings.
  - Blast-radius simulator (e.g. "If Email Service is down, User Registration continues with queued verification; Password Reset fails immediately").
- **Evidence**: `PlatformHealth.jsx` renders vertical cards for individual services.
- **Risk**: Junior operators may not appreciate the systemic impact of restarting a specific daemon or changing a provider.
- **Impact**: Operator situational awareness and operational safety.
- **Recommendation**: Implement a lightweight Mermaid/SVG DAG component in `PlatformHealth.jsx`.
- **Automation Opportunity**: Dynamic graph edge weighting based on live request throughput.
- **Self-Healing Opportunity**: Automatic routing around degraded non-critical dependencies.
- **Predictive Opportunity**: Cascading failure prediction.
- **AI Opportunity**: Natural language querying of architectural dependencies.
- **Security Impact**: Highlights unencrypted inter-service communication channels.
- **Tenant Impact**: Identifies shared single points of failure across enterprise tenants.
- **Dependencies**: `backend/services/platformHealth.js`.
- **Complexity**: Low.
- **Priority**: **LATER**.
- **Test Requirement**: Verify graph renders accurately across all 12 platform services.

---

### GAP-05: Manual Disaster Recovery Drill & Verification Testing
- **Domain**: Resilience / Business Continuity
- **Module**: `PlatformOperations.jsx` / `backend/enterprise/tenantBackup.js`
- **Severity**: **P2 (Medium)**
- **Current State**: Logical MySQL and Firestore backups are generated and SHA-256 verified, but full end-to-end restore drills into a temporary sandbox are executed manually.
- **Desired State**: **Automated DR Drill Pipeline**:
  - Scheduled weekly background restore simulation into an isolated temporary schema.
  - Verification of table row counts, foreign key integrity, and SHA-256 sample record checksums.
  - Automated generation of DR Readiness Score and RTO/RPO compliance certificate.
- **Evidence**: `getBackupStatus()` returns filesystem timestamps and sizes, but does not perform synthetic restore verification.
- **Risk**: Silent corruption of backup archives discovered only during an actual disaster.
- **Impact**: Guaranteed business continuity and audit compliance.
- **Recommendation**: Implement `scripts/dr-readiness-drill.mjs` callable via authenticated Control Plane API.
- **Automation Opportunity**: Scheduled cron execution with automated tear-down of temporary test databases.
- **Self-Healing Opportunity**: Immediate alerting and re-attempt upon corrupted backup detection.
- **Predictive Opportunity**: Backup size growth and storage volume exhaustion forecasting.
- **AI Opportunity**: Automated DR post-test report generation.
- **Security Impact**: Validates backup decryption keys without exposing secrets in logs.
- **Tenant Impact**: Proves byte-for-byte tenant isolation recovery.
- **Dependencies**: `backend/enterprise/tenantBackup.js`, MySQL mysqldump utilities.
- **Complexity**: Medium.
- **Priority**: **NEXT**.
- **Test Requirement**: End-to-end simulated dry-run restore of full database schema in $<30$ seconds.

---

### Summary of Additional Identified Gaps (GAP-06 to GAP-15):

| ID | Domain | Module | Severity | Summary | Priority |
|---|---|---|---|---|---|
| **GAP-06** | Identity / Auth | `PlatformOperators.jsx` | P2 | Platform operator session management lacks granular IP CIDR allowlisting. | **NEXT** |
| **GAP-07** | Queues / DLQ | `PlatformQueues.jsx` | P2 | Notification and enterprise queues lack a unified visual DLQ message payload inspector with JSON diff viewer. | **NEXT** |
| **GAP-08** | Security | `PlatformSecurity.jsx` | P2 | Security event stream lacks automated geo-IP enrichment and suspicious velocity anomaly triggers. | **NEXT** |
| **GAP-09** | Configuration | `Settings.jsx` | P3 | System settings lack visual side-by-side JSON diff preview before saving revisions. | **LATER** |
| **GAP-10** | Tenant Governance | `PlatformTenants.jsx` | P3 | Tenant decommissioning lacks automated zip export of tenant resources before permanent deletion. | **LATER** |
| **GAP-11** | FinOps | `ordersManagement` | P3 | Financial reporting lacks real-time MRR (Monthly Recurring Revenue) cohort tracking. | **LATER** |
| **GAP-12** | Observability | `PlatformHealth.jsx` | P3 | Metrics lack automated percentile distribution ($P_{50}, P_{95}, P_{99}$) for API request latencies. | **LATER** |
| **GAP-13** | Release Mgt | `AdminHeader.jsx` | P4 | Header shows current Git SHA but lacks 1-click deployment history timeline and release notes modal. | **ENHANCEMENT** |
| **GAP-14** | Compliance | `gdprLegalSettings` | P3 | GDPR data export requests require manual script execution instead of 1-click admin processing. | **LATER** |
| **GAP-15** | SEO / Content | `geoSeoSettings` | P4 | Indian Geo-SEO keyword performance lacks automated Google Search Console API ingestion. | **ENHANCEMENT** |
