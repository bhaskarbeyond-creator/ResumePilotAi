# ResumePilot AI — Production Operations Handover

> [!CAUTION]
> The direct-SCP procedure formerly documented here is retired. Standard releases and rollbacks must use the restricted, approval-gated process in [`SAFE_PRODUCTION_WORKFLOW.md`](./SAFE_PRODUCTION_WORKFLOW.md); that runbook also defines the restricted break-glass exception. Never use a key shared in chat, `sshpass`, trust-on-first-use, or direct extraction into live directories.

## 1. Executive Summary & Certified Release Baseline

- **Authoritative Certified Baseline SHA**: `86b0197118d0761ed32061fcbdcb3da3daa7bdcb`
- **Remote `origin/main` SHA**: `86b0197118d0761ed32061fcbdcb3da3daa7bdcb`
- **Live Production URL**: `https://airesume.projectdemo.guru`
- **Master Evidence Artifact Hash (SHA-256)**: `3936d1ef8aecf37301d5f85d5efb59074ff967a09224f122da2ebab02afe053e`
- **Authoritative Control Census**: 1,716 Unique Real-DOM Controls (0 Synthetic, 0 Quarantined in Certified Ledger)
- **Execution Evidence**: 1,716 Physical Playwright Browser Passes (100.00% Green, 0 Failures)
- **Regression Test Coverage**: 373 / 373 Automated Unit/Integration Tests Passing (100%)
- **Anti-Fraud Probes**: 12 / 12 Negative Adversarial Mutation Probes Passing (100%)
- **Rollback Target SHA**: `3b877611ef4f488ea9b398696b97061d15bfdcba`

> [!IMPORTANT]
> **2,052 legacy source findings are quarantined and are not part of the authoritative runtime control census.**
> The baseline is frozen. Future modifications must execute the full automated verification pipeline before any production deployment.

---

## 2. Deployment Procedure

Use **Actions → Production release** from `main`, select `deploy`, provide the current full `main` SHA, and type `DEPLOY`. The protected `production` environment supplies reviewer approval and the dedicated forced-command SSH identity. The workflow repeats tests, builds with environment-managed public frontend configuration, stages the release, and verifies production independently.

Bootstrap, key rotation, required settings, and break-glass instructions are in [`SAFE_PRODUCTION_WORKFLOW.md`](./SAFE_PRODUCTION_WORKFLOW.md).

---

## 3. Rollback Procedure & Emergency Instructions

Use the same **Production release** workflow, select `rollback`, provide a known-good full SHA already in `main` history, and type `ROLLBACK`. Current trusted delivery tooling rebuilds the historical app revision. Do not check out and directly copy an old `dist/` tree into the webroot.

---

## 4. Required Environment Variables

### Frontend (`.env`)
- `VITE_FIREBASE_KEY`: Firebase web API key.
- `VITE_FIREBASE_DOMAIN`: Firebase authentication domain.
- `VITE_FIREBASE_PROJECT_ID`: Firebase project ID.
- `VITE_FIREBASE_STORAGE_BUCKET`: Storage bucket identifier.
- `VITE_ENTERPRISE_TENANCY_ENABLED`: `true` (enables enterprise multi-tenant modules).

### Backend (`backend/.env`)
- `PORT`: `5000` (or host assigned port).
- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`: Service account credentials.
- `GEMINI_API_KEY`, `NVIDIA_API_KEY`, `OPENROUTER_API_KEY`: Server-side AI provider credentials (never echoed to client).
- `SESSION_SECRET`: Cryptographic session secret for TOTP MFA and cookies.

---

## 5. Health Checks & Production Monitoring

| Endpoint | Method | Expected Output | Purpose |
| :--- | :--- | :--- | :--- |
| `https://airesume.projectdemo.guru/api/healthz` | `GET` | `{"status":"ok","services":{...}}` | Overall backend & subsystem health check |
| `https://airesume.projectdemo.guru/api/service-availability` | `GET` | `{"success":true,"auth":{...},"payments":{...}}` | Third-party provider availability |
| `https://airesume.projectdemo.guru/api/settings/public` | `GET` | `{"error":{"code":"AUTH_REQUIRED"}}` | Verifies route security gate & unauthenticated block |
| `https://airesume.projectdemo.guru/` | `GET` | `HTTP 200 OK` | Public application homepage availability |

---

## 6. Continuous Integration & Verification Commands

```bash
# Automated regression suite
npm test

# Anti-fraud mutation proofs (12/12)
node --test tests/evidence-engine-anti-fraud.test.mjs

# Real-DOM crawl & census discovery
node scripts/crawl-real-dom-census.mjs

# Master real-browser control execution
node tests/real-control-execution-suite.mjs

# Independent forensic acceptance audit
node scripts/independent-acceptance-audit.mjs

# Production asset compilation
npm run build
```

---

## 7. Known Operational Risks & Safeguards

1. **Third-Party AI Outages**:
   - *Safeguard*: System contains automatic fallback cascade across Gemini, NVIDIA NIM (`meta/llama-3.2-11b-vision-instruct`), and OpenRouter (`meta-llama/llama-3.3-70b-instruct:free`).
2. **Firestore Offline / Connectivity Drops**:
   - *Safeguard*: Handlers use structured try/catch fallbacks with local draft preservation (`resumePersistence.js`) preventing user data loss during brief network hiccups.
3. **MFA Re-Authentication Gate**:
   - *Safeguard*: Sensitive operation gates require fresh tokens for destructive account deletions while preserving standard admin settings workflow without repetitive popups.

---

## 8. Release Process Governance

Every future release must adhere to the linear release workflow:

$$\text{CODE CHANGE} \longrightarrow \text{UNIT/INTEGRATION TEST} \longrightarrow \text{BUILD} \longrightarrow \text{REAL-BROWSER REGRESSION} \longrightarrow \text{EVIDENCE INTEGRITY} \longrightarrow \text{DEPLOY} \longrightarrow \text{PRODUCTION VERIFICATION}$$

**FINAL STATUS: CERTIFIED BASELINE FROZEN — READY FOR NORMAL PRODUCTION OPERATION.**
