# Admin & Super Admin Gap Analysis

## 1. Identified Infrastructure Gaps

### 1.1 Deployment Automation
- **Current State**: Code is pushed to `main`, but physical deployment to Hostinger requires manual PM2 restart and Git pull commands via SSH. No CI/CD pipeline executes deployment autonomously.
- **Target State**: Fully automated CI/CD pipeline (e.g., GitHub Actions) that builds, tests, and deploys the Node.js backend and Vite frontend to the live server on tag releases.
- **Gap**: Missing `.github/workflows/deploy.yml` or a similar webhook-based deploy script on the live server.

### 1.2 Automated Production Rollback
- **Current State**: Rollback requires manually checking out a previous Git commit via SSH and restarting PM2. No physical database backups are automatically created prior to deployment.
- **Target State**: Atomic zero-downtime deployments (Blue/Green) with automated Firestore snapshot backups pre-deployment.
- **Gap**: Missing deployment orchestrator and Firestore export scripts (`gcloud firestore export`).

### 1.3 Live E2E Testing Pipeline
- **Current State**: E2E tests (`superadmin-adm.spec.js`) utilize local Firebase emulators and mock JWTs. Live E2E validation requires manual credentials and cannot execute automatically against the `https://airesume.projectdemo.guru` domain without exposing static super-admin credentials to the repository.
- **Target State**: CI pipeline executes a Playwright suite against a live staging slot using injected, temporary Service Account tokens before shifting traffic to production.
- **Gap**: Lack of a dedicated staging environment and ephemeral test identity provisioning.

## 2. Identified Application Gaps

### 2.1 Complete DLQ Inspection UI
- **Current State**: The backend handles DLQ item replay logic, and the dashboard reports dead letters. However, deep-inspection of the exact payload of a failed message inside the DLQ is limited in the UI.
- **Target State**: Admin UI allows full JSON inspection and manual edit of DLQ payloads before forced re-enqueuing.
- **Gap**: `PlatformQueues.jsx` lacks a JSON editor modal for dead letter items.

### 2.2 Global Rate Limiting
- **Current State**: The backend depends on Firebase Auth and standard Node.js request handling.
- **Target State**: Strict IP-based or UID-based rate limiting on global `Admin` endpoints to prevent heavy read-scraping of user directories.
- **Gap**: Missing `express-rate-limit` configuration or Redis-backed API gateway for the Admin control plane.
