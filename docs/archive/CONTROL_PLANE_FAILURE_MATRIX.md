# RESUMEPILOT AI — FAILURE-INJECTION & CHAOS MATRIX
## Failure Scenarios, Containment Protocols & Forensic Evidence

**Author**: Principal Security & Reliability Architect  
**Scope**: 18 Critical Failure Scenarios  
**Status**: Comprehensive Chaos Engineering Baseline  

---

| Failure Scenario | Detection Mechanism | Containment Protocol | Recovery Strategy | Verification Method | Escalation Path | Forensic Evidence Logged |
|---|---|---|---|---|---|---|
| **1. Sync Worker Process Crash** | Healthz check missing worker tick ($>10$s) | In-flight mutations safely preserved in `sync_outbox` | PM2 automatically restarts process in $<2$s | Worker heartbeat updates in `/api/healthz` | Alert Attention if crash loops $>3$ times | PM2 exit code, timestamp, stack trace |
| **2. MySQL Primary Database Outage** | UNIX socket error, ping timeout ($>500$ms) | Incoming writes queue in memory or return 503 | Restart MariaDB daemon or trigger emergency failover to Firestore Standby | Synthetic ping returns $<10$ms | P0 Critical incident to Super Admin | MariaDB error log, systemctl journal |
| **3. Cloud Firestore Outage** | Google Cloud API timeout, HTTP 503 | MySQL primary continues normal operation; outbox queues reverse events | Worker holds events in `sync_outbox` until GCP recovers | Continuous parity auditor reaches 100% | Degraded Standby banner in Command Center | Firestore client error code, retry log |
| **4. Host Network Partition** | Inbound HTTP probes fail, ping timeout | Edge CDN (Cloudflare) serves cached static assets | Hostinger network routing re-establishes | `/api/healthz` reachable globally | Automated alert to infrastructure provider | VPS network interface stats |
| **5. Outbox Queue Surge ($>5,000$ jobs)** | Queue depth threshold monitor ($>500$) | Increase batch size to 200; dynamically scale worker tick to 500ms | Drains backlog with monotonic version order | Queue depth returns $<50$ | Attention alert to SRE | Queue depth time-series metrics |
| **6. Poison-Pill Outbox Mutation** | JSON parse exception, attempt count $\ge 5$ | Automatically quarantine mutation to `DEAD_LETTER` | Fix root schema issue and execute audited DLQ replay | Queue resumes processing succeeding jobs | SRE review required for DLQ items | Un-parseable raw payload & stack trace |
| **7. Worker Stale Lease ($>120$s)** | Timestamp predicate `leased_until < NOW()` | Release stuck lock; set state back to `PENDING` | Next worker iteration claims and commits event | Lease timestamp cleared, record processed | SRE alert if same record stalls twice | Record ID, previous worker PID |
| **8. Host Disk Space Saturation ($>85\%$)** | OS disk metric monitor probe | Automated purge of old PM2 logs & outbox prune | Flush temporary files; prune outbox records $>7$d | Disk utilization drops $<70\%$ | P1 Critical alert to SRE | Filesystem `df -h` snapshot |
| **9. Node.js Memory Leak ($>90\%$ heap)** | Platform Health memory telemetry probe | Drop cached in-memory query results | Graceful PM2 zero-downtime cluster reload | Memory usage drops to baseline ($<180$MB) | Alert if memory ramps $>50$MB/min | V8 heap snapshot summary |
| **10. Upstream AI Provider Rate Limit (429)** | Provider HTTP 429 response from NVIDIA/Gemini | Trip circuit breaker for 180s; route to fallback | Automatically switch to secondary AI provider | Resume summary generated in $<1500$ms | Attention banner if all providers degraded | Provider HTTP status & response body |
| **11. Email SMTP Gateway Outage** | SendGrid / Mailgun HTTP 5xx or connection refuse | Notification outbox holds messages in `PENDING` | Worker retries with exponential backoff (1-5x) | Test verification email delivered | Alert if delivery delayed $>5$ minutes | SMTP error response code |
| **12. Payment Gateway Webhook Signature Failure** | Razorpay / Stripe signature validation mismatch | Immediate HTTP 400 rejection; zero database write | Request gateway re-transmission with valid secret | Order transitions to `PAYMENT_VERIFIED` | Security alert for spoofing attempt | Webhook headers, IP, signature hash |
| **13. Brute Force Security Event Spike** | Rate limiter tracks $>10$ failed logins / min | IP temporarily blocked at application middleware | Ban expires after 15-min cooldown | Subsequent valid authentication succeeds | Security Events console logs event | Attacking IP, user agent, timestamps |
| **14. Control Plane UI Unreachability** | Frontend client asset load error | Application core (resumes, public links) unaffected | Purge browser cache or deploy fresh static build | Admin console renders correctly | SRE manual SSH fallback | Browser console error logs |
| **15. Automation Loop / Cascade** | Automation rule triggers $>5$ times in 1 hour | Anti-looping circuit breaker trips; loop halted | Reset automation rule counter after manual review | Normal scheduled execution resumes | Attention alert with rule ID | Execution count & trigger timestamps |
| **16. Policy Engine Evaluation Failure** | Invalid policy schema or syntax exception | Fail closed (deny requested action) | Revert policy definition to last known good revision | Mutation passes policy evaluation | SRE notification | Policy diff and validation error |
| **17. Audit Storage Unavailable** | Write failure to `admin_audit_logs` | Administrative mutation fails closed and aborts | Re-establish database handle | Audit write succeeds | Critical security alert | Local fallback file audit log |
| **18. Configuration File Corruption** | Syntax error in `engine_state.json` | Fallback to safe hardcoded defaults (MySQL primary) | Restore configuration from backup archive | Configuration reloads cleanly | Attention incident created | Corrupted file backup `.bak` |
