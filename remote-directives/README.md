# 🛡️ RESUMEPILOTAI (IME365) — REMOTE MASTER DIRECTIVE
# Autonomous Independent Verification & Production Certification Protocol
**Directive ID:** `DIR-REMOTE-MASTER-001` · **Quality Rating:** `10/10`  
**Governing Authority:** Executive Engineering Leadership (Antigravity)  
**Target Engineer:** Remote Senior Staff Developer / Lead Verification Engineer

---

## 📌 1. EXECUTIVE MISSION & ZERO-TRUST MANDATE

Welcome, Senior Staff Engineer. This repository contains the complete production-grade codebase for **ResumePilotAI (IME365)**.

### ⚠️ THE PRIME MANDATE: ZERO TRUST IN PRIOR ARTIFACTS
> **Do NOT assume or accept past documentation, test summaries, or historical evidence files as given truth.**  
> You are commissioned to act as an **independent, adversarial auditor and release certifier**. You must clone/pull the updated code, setup your own local runtime and database from scratch, execute every single verification stream with your own eyes and tools, and independently prove that the platform is 100% production-ready.

---

## 🛠️ 2. REMOTE ENVIRONMENT & TOOLING SETUP

Follow these exact steps to set up your remote verification environment:

### 2.1 Clone / Pull the Latest Code
- **Latest Commit SHA**: `86a3baf6` (`86a3baf64c41b07d40d4851a6fc43009707f3e5d`)
- **Primary Release Branch**: `main`
- **Arena Session Branch ID**: `arena/01a0e100-resumepilotai` (Active working branch)
- **Certified Master Tag**: `v2.0.0-certified-master-release`

```bash
# Clone fresh or fetch the latest commits:
git clone git@github.com:bhaskarbeyond-creator/ResumePilotAi.git
cd ResumePilotAi

# Checkout Option A (Recommended main):
git checkout main
git pull origin main

# OR Checkout Option B (Arena session branch):
# git checkout arena/01a0e100-resumepilotai
# git pull origin arena/01a0e100-resumepilotai

# Verify you are on the authoritative certified commit:
git rev-parse --short HEAD # Must output: 86a3baf6
git status
```

### 2.2 Install Runtime Dependencies
```bash
# 1. Install frontend / workspace dependencies
npm install

# 2. Install backend dependencies
npm --prefix backend install

# 3. Install Playwright browser binaries and OS dependencies
npx playwright install --with-deps
```

### 2.3 Configure and Start Live Database (MariaDB / MySQL)
The platform strictly forbids mock databases in its integration suites. You must have a live database instance:
1. Ensure **MariaDB 10.5+** or **MySQL 8.0+** is running on port `3306`.
2. Create the target database (default: `aime365` or as configured in `backend/.env`):
   ```sql
   CREATE DATABASE IF NOT EXISTS aime365 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```
3. Run all migration scripts in sequence from `backend/database/migrations/`:
   ```bash
   # Run migration runner or apply migrations 001 through 024
   node backend/database/runMigrations.js
   ```
4. Verify database connectivity:
   ```bash
   node -e "const mysql = require('mysql2/promise'); mysql.createConnection({host:'127.0.0.1',port:3306,user:'root',password:process.env.DB_PASSWORD||'',database:'aime365'}).then(()=>console.log('MARIADB CONNECTED OK')).catch(e=>console.error('DB ERR',e.message))"
   ```

### 2.4 Verify Environment Configuration
Ensure `.env` in the root and `backend/.env` exist and contain necessary development variables:
- `PORT=8080`
- `DB_HOST=127.0.0.1`, `DB_PORT=3306`, `DB_USER=root`, `DB_NAME=aime365`
- `JWT_SECRET` (minimum 32-byte string)

---

## 🧪 3. INDEPENDENT 8-STREAM VERIFICATION PIPELINE

Execute the following 8 verification streams sequentially. Every stream must exit code `0` with zero failures:

### Stream 1: Static Security & Sentinels (67 / 67 PASS)
```bash
npm run test:security:static
```
- **What it verifies:** Canonical Apache `.htaccess` headers, `robots.txt`/`sitemap.xml` public discovery policies, credential leakage scanner, XSS sanitization, native TOTP MFA guards, unlayered-CSS isolation.

### Stream 2: Backend Core & Integration on Live MariaDB (892 / 892 PASS)
```bash
npm --prefix backend test
```
- **What it verifies:** Live transactional outbox, AES-256-GCM envelope master-key encryption, P0 TOTP MFA freshness checks, tenant isolation, IDOR export boundaries, rate-limiting.

### Stream 3: Frontend Product Suite (729 / 729 PASS)
```bash
npm run test:product
```
- **What it verifies:** Candidate workspace, ATS applicant review, enterprise organization console, platform admin command center, resume builder 11-step completion, and zero-fabrication assertions across all 58 product test suites.

### Stream 4: AI Interview Coach & Audio/Voice CBT Simulator (31 / 31 PASS)
```bash
npm run test:interview -- --test-concurrency=1
```
- **What it verifies:** Multi-tab session takeover, duration bounds, refresh recovery pointers, text fallback, and role/type interview deduplication.  
*(Note: Always pass `--test-concurrency=1` to prevent simulated multi-tab BroadcastChannel collision).*

### Stream 5: Cuba Executive Design System & 4 Portals (141 / 141 PASS)
```bash
npm run test:design-system
```
- **What it verifies:** Candidate, Employer, Enterprise, and Admin consoles rendered in authentic Google Material 3 / Cuba glassmorphic tokens; unique navigation `aria-label` landmarks; honest AI telemetry ring (zero fake numbers).

### Stream 6: Hermetic Playwright Real-DOM Browser Crawl (8 / 8 PASS)
```bash
npm run test:dir048:browser
```
- **What it verifies:** Headless browser real-DOM crawl across 375px (mobile native bottom-bar), 768px (tablet compact rail), 1024px, and 1280px (full desktop); live dialog traps confirming **ZERO native dialogs** (`window.alert/confirm/prompt`); zero `"Invalid Date"`, `NaN`, or `undefined` strings in any portal DOM; axe-core WCAG 2.1 AA in light AND dark modes.

### Stream 7: Production Vite Bundle & Static Linter Gate (0 ERRORS)
```bash
npm run build
npm run lint
```
- **What it verifies:** Vite bundle builds clean assets with correct chunk splitting; ESLint reports **0 fatal errors** (advisory warnings permitted).

### Stream 8: Protected Frozen Invariants & Baseline Audits
```bash
# 1. aiRuntime.js must have 0-byte diff against certified commit e314f715
git diff e314f715 -- backend/services/aiRuntime.js

# 2. Template census: all 51 resume templates and 4 cover letters must be matched
node scripts/dir047-template-census.mjs

# 3. Latency census: zero simulated setTimeout/latency offenders
node scripts/dir047-latency-census.mjs
```

---

## 🔒 4. NON-NEGOTIABLE INVARIANTS

1. **INV-1 (aiRuntime.js Freeze)**: `backend/services/aiRuntime.js` is certified and gatekeeper-locked. Never modify it without explicit supervisory instruction (`git diff e314f715` must be 0 bytes).
2. **INV-2 (Template & ATS Parity)**: All 51 resume templates (`src/components/templates/Cv*.jsx`) and 4 cover letters must remain untouched.
3. **INV-3 (Zero Synthetic Telemetry)**: Never fake metrics, latency delays, or placeholder counts. Always render genuine state.
4. **INV-4 (Zero Plaintext Secrets)**: API keys and secret tokens must never appear in client bundles, logs, or unmasked DOM elements.

---

## 📋 5. CERTIFICATION & HANDOVER REPORT TEMPLATE

Once all 8 streams pass with 100% green integrity on your remote machine, submit your certification report:

```markdown
### 📋 Remote Master Verification & Certification Report

#### 1. Remote Environment
- **Node Version**: [e.g., v20.18.0]
- **Database**: [MariaDB 10.11 on 3306 — 24 migrations applied]
- **Playwright**: [Browsers installed and verified]
- **Git Commit**: [e.g., db2a7087]

#### 2. Verification Battery Results
- **S1 (Static Security)**: `67 / 67 PASS` (Output snippet + time)
- **S2 (Backend Core Matrix)**: `892 / 892 PASS` on live MariaDB
- **S3 (Frontend Product)**: `729 / 729 PASS` across 58 suites
- **S4 (Interview Coach)**: `31 / 31 PASS` with `--test-concurrency=1`
- **S5 (Cuba Design System)**: `141 / 141 PASS` across 4 portals
- **S6 (Playwright Browser UAT)**: `8 / 8 PASS` real-DOM headless crawl
- **S7 (Build & Lint)**: Vite build EXIT 0, ESLint 0 fatal errors
- **S8 (Frozen Invariants)**: `aiRuntime.js` 0-byte diff, 51 templates verified, 0 latency offenders

#### 3. Formal Certification
- [x] All 8 streams independently verified from real runtime evidence
- [x] Zero regressions or unauthorized file modifications
- [x] Officially certified 10/10 production ready
```
