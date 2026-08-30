# RESUMEPILOT AI — OPERATIONAL RUNBOOK CATALOG
## Standard Operating Procedures & Incident Response Runbooks

**Author**: Principal SRE & Operations Lead  
**Scope**: 12 Mission-Critical Operational Runbooks  
**Status**: Production Standard  

---

### RB-01: `WorkerDown` (Sync or Notification Daemon Stopped)
- **Symptom**: Outbox queue depth growing; health indicator reports worker offline; PM2 process missing.
- **Diagnosis**: Check PM2 process list via `pm2 status` or Control Plane `/api/platform/health`. Inspect `error.log`.
- **Evidence**: `pm2 status airesume-backend` returns `errored` or `stopped`.
- **Prerequisites**: SSH access to production host or Super Admin access to Platform Operations console.
- **Safe Action**: Trigger PM2 restart via `pm2 restart airesume-backend` or via authenticated Control Plane trigger.
- **Forbidden Action**: Do NOT kill database processes or truncate outbox tables.
- **Verification**: Check `/api/healthz` returns `status: ok` and sync heartbeat updates within 5 seconds.
- **Escalation**: If process crash loops $>3$ times, inspect disk space and database UNIX socket permissions.

---

### RB-02: `QueueBacklog` (Notification or Sync Outbox Spikes)
- **Symptom**: Queue depth exceeds 500 messages; processing latency $>30$ seconds.
- **Diagnosis**: Determine if bottleneck is downstream provider rate limiting (e.g. Mailgun/SendGrid SMTP or Firestore write quota).
- **Safe Action**: Check error counts in `sync_outbox` / `notification_outbox`. Verify network reachability.
- **Forbidden Action**: Do NOT execute bulk purge of `PENDING` queue.
- **Verification**: Queue depth shows negative derivative ($d(\text{depth})/dt < 0$) over 3 consecutive minutes.
- **Escalation**: Increase worker batch size or notify upstream provider of throughput surge.

---

### RB-03: `StaleLease` (Mutations Stuck in `PROCESSING`)
- **Symptom**: Outbox records remain locked in `PROCESSING` state with elapsed time $>120$s.
- **Diagnosis**: Worker node crashed or terminated mid-batch without releasing CAS lease lock.
- **Safe Action**: Trigger autonomous lease reclaim via Control Plane or execute automated query:
  ```sql
  UPDATE sync_outbox SET state = 'PENDING', leased_by = NULL, leased_until = NULL WHERE state = 'PROCESSING' AND leased_until < NOW();
  ```
- **Verification**: Stuck records transition back to `PENDING` and are immediately consumed by active worker.

---

### RB-04: `FirestoreUnavailable` (Standby Cloud Latency / Outage)
- **Symptom**: Firestore read/write latency $>2000$ms or HTTP 503 from Google Cloud Firestore.
- **Diagnosis**: Check Google Cloud Status Dashboard for Firestore multi-region incident.
- **Safe Action**: MySQL primary continues serving 100% of user traffic normally. Outbox records accumulate safely in MySQL `sync_outbox` with durable persistence.
- **Forbidden Action**: Do NOT attempt to switch primary database to Firestore while it is degraded!
- **Verification**: When GCP recovers, worker automatically drains pending outbox events with zero data loss.

---

### RB-05: `MySQLUnavailable` (Primary Relational Socket Failure)
- **Symptom**: Database health probe fails; API returns `503 DATABASE_UNAVAILABLE`.
- **Diagnosis**: Check MariaDB service status via `systemctl status mariadb` on host. Inspect disk space.
- **Safe Action**: 
  1. Restart MariaDB service: `sudo systemctl restart mariadb`.
  2. If MySQL storage hardware is unrecoverable, initiate Super Admin **Emergency Failover** to Firestore Standby from Control Plane.
- **Verification**: `/api/healthz` returns HTTP 200 OK.

---

### RB-06: `SyncDivergence` (Parity Percentage $<100\%$)
- **Symptom**: `/api/database/verify-parity` reports parity $<100\%$ or conflict count $>0$.
- **Diagnosis**: Inspect `sync_conflicts` table for specific record IDs and conflicting timestamps.
- **Safe Action**: Trigger manual entity reconciliation for diverging entity (e.g. re-sync specific user resume).
- **Forbidden Action**: Do NOT overwrite MySQL data with older Firestore timestamp without inspecting revision.
- **Verification**: Continuous parity audit returns 100%.

---

### RB-07: `NotificationBacklog` (Email Delivery Delays)
- **Symptom**: User verification emails or password reset OTPs delayed $>60$s.
- **Diagnosis**: Check Mailgun / SMTP gateway queue and bounce logs.
- **Safe Action**: Check API key validity; retry failed messages via Control Plane `PlatformQueues.jsx`.
- **Verification**: Test email sent and delivered in $<5$ seconds.

---

### RB-08: `DiskPressure` (Host Storage Utilisation $>80\%$)
- **Symptom**: Hostinger disk usage alert $>80\%$.
- **Diagnosis**: Inspect `/var/log`, PM2 logs, and MySQL binary logs using `du -sh /*`.
- **Safe Action**: 
  1. Flush PM2 logs: `pm2 flush`.
  2. Execute outbox retention prune: `/api/database/prune-outbox`.
  3. Rotate older backup archives to remote cold storage.
- **Forbidden Action**: Do NOT delete live MariaDB `.ibd` tablespace files directly!

---

### RB-09: `MemoryPressure` (Node.js Heap $>90\%$)
- **Symptom**: Platform Health reports Node.js heap usage $>90\%$.
- **Diagnosis**: Inspect memory leak indicators in long-running streaming routes or PDF rendering pipelines.
- **Safe Action**: Graceful zero-downtime PM2 reload: `pm2 reload airesume-backend`.
- **Verification**: Heap memory resets to baseline ($<180$MB).

---

### RB-10: `HighErrorRate` (API HTTP 5xx Surge)
- **Symptom**: HTTP 5xx error rate $>1\%$ over 5-minute rolling window.
- **Diagnosis**: Check `/adm/security` and `/adm/attention` for recent deployment or provider failures.
- **Safe Action**: If caused by recent deployment, trigger immediate instant rollback to previous Git SHA.
- **Verification**: Error rate drops below 0.01%.

---

### RB-11: `BackupFailure` (Daily Scheduled Backup Fails)
- **Symptom**: `getBackupStatus()` reports last backup $>24$ hours old or SHA-256 mismatch.
- **Diagnosis**: Check available disk space and mysqldump execution permissions.
- **Safe Action**: Trigger immediate on-demand manual backup from Control Plane.
- **Verification**: New backup archive created, checksummed, and verified.

---

### RB-12: `ProviderOutage` (LLM Upstream HTTP 5xx/429)
- **Symptom**: Resume generation or interview coach failing with upstream AI provider timeout.
- **Diagnosis**: Inspect AI provider latency matrix in Control Plane.
- **Safe Action**: Toggle active default provider to fallback candidate (e.g. switch NVIDIA NIM $\to$ Gemini 1.5 Flash).
- **Verification**: AI summary generation succeeds in $<1000$ms.
