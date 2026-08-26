# Playwright Browser Error & Defect Report

**Certified Commit**: `4950da00852417f663d650b03b17fa2d98fa0cd0`  
**Execution Timestamp**: 2026-08-26T05:34:53.639Z  
**Target Environments**:
- Local: `https://ai-resume-builder.local`
- Production: `https://airesume.projectdemo.guru`

---

## 1. Summary of Captured Signals

| Signal Type | Total Captured | Classified Benign | Real Defects |
| :--- | :---: | :---: | :---: |
| **Unexpected Console Errors** | 0 | - | 0 |
| **Page Errors / Crashes** | 1 | 0 | 1 |
| **Failed Network Requests** | 3 | 0 | 3 |
| **Unexpected HTTP 5xx** | 0 | 0 | 0 |
| **Unexpected HTTP 4xx** | 0 | 0 | 0 |
| **Console Warnings** | 8 | 8 | 0 |

---

## 2. Root Cause Analysis & Resolutions

### Defect 1: Platform Queue & DLQ Monitor Single-Engine Query Failure
- **Symptom**: Navigating to `/adm/queues` showed *"Queue telemetry is unavailable. No empty queue conclusion is inferred from the failed request."* with all KPI cards as UNAVAILABLE.
- **Root Cause**: `/api/platform/queues` in `backend/routes/platform.js` made an un-fallback-guarded call to Firestore `notification_outbox`. When Firestore hit quota exhaustion or during MariaDB primary operation, the unhandled error returned HTTP 503.
- **Resolution**: Upgraded `/api/platform/queues`, `/api/platform/queues/retry`, and `/api/platform/queues/purge` to dual-engine handlers that query MySQL `sync_outbox` and Firestore `notification_outbox` concurrently with full fallback and aggregate status reporting.
- **Verification**: Verified on local Playwright run with status `HEALTHY`, zero 503 errors, and active KPI telemetry.

---

## 3. Warning Classification Log

- **[BENIGN]** `Google Maps API key is not configured - using graceful fallback` on `https://ai-resume-builder.local/`
- **[BENIGN]** `Google Maps API key is not configured - using graceful fallback` on `https://ai-resume-builder.local/pricing`
- **[BENIGN]** `⚠️ Could not fetch coupons from Firestore: Missing or insufficient permissions.` on `https://ai-resume-builder.local/pricing`
- **[BENIGN]** `Google Maps API key is not configured - using graceful fallback` on `https://ai-resume-builder.local/login`
- **[BENIGN]** `Google Maps API key is not configured - using graceful fallback` on `https://ai-resume-builder.local/build-resume`
- **[BENIGN]** `Google Maps API key is not configured - using graceful fallback` on `https://ai-resume-builder.local/login?next=%2Fadm%2Fqueues`
- **[BENIGN]** `Google Maps API key is not configured - using graceful fallback` on `https://ai-resume-builder.local/`
- **[BENIGN]** `Google Maps API key is not configured - using graceful fallback` on `https://ai-resume-builder.local/`
