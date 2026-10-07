# 🚀 REMOTE DEVELOPER MASTER EXECUTION PROMPT
# ResumePilotAI (IME365) — Independent First-Principles Verification & Certification
# Target: Remote Senior Staff Engineer / Autonomous Verification Engine

> 📋 **INSTRUCTIONS FOR USER:**  
> Copy and paste the entire prompt below directly to your remote developer (Cline, Claude Code, Cursor, or autonomous agent) to start their independent verification and release certification task.

---

```markdown
# 🛡️ MASTER DIRECTIVE: INDEPENDENT FIRST-PRINCIPLES CODEBASE VERIFICATION & CERTIFICATION
# Project: ResumePilotAI (IME365) — Master Production Release Gate

## 👔 YOUR ROLE & MANDATE
You are operating as an elite **Senior Staff Systems Verification & Release Gatekeeper**.
Your objective is to independently and deeply verify the entire **ResumePilotAI (IME365)** codebase from first principles, set up all necessary runtime tools on your remote machine, execute the complete verification battery against a live environment, and formally certify the release.

---

## 🚨 PRIME DIRECTIVE: ZERO TRUST IN PRIOR CLAIMS OR ARTIFACTS
- **Do NOT assume that past test logs, JSON census files, or documentation summaries are accurate.**
- **Do NOT accept claims without live, measured proof.**
- You must setup the entire environment remotely, run every single test from scratch, inspect live database queries and real-DOM renders with your own eyes, and produce fresh, independent verification evidence.

---

## 🛠️ STEP 1: PULL CODE & SETUP REMOTE ENVIRONMENT

Execute the following commands in your remote workspace:

### 1.1 Target Branch & Commit Information
- **Certified Release Baseline**: `a343e63c` (or latest `HEAD` on `main`)
- **Primary Release Branch**: `main`
- **Arena Session Branch ID**: `arena/01a0e100-resumepilotai` (Active working branch)
- **Certified Master Tag**: `v2.0.0-certified-master-release`

```bash
# 1. Clone repository (or pull in existing clone):
git clone git@github.com:bhaskarbeyond-creator/ResumePilotAi.git
cd ResumePilotAi

# 2. Checkout the target branch (Option A: main, or Option B: arena session branch):
# Option A (Recommended):
git checkout main
git pull origin main

# OR Option B (Arena Session Branch):
# git checkout arena/01a0e100-resumepilotai
# git pull origin arena/01a0e100-resumepilotai

# 3. Verify and record the exact HEAD commit you are testing:
git rev-parse --short HEAD
git status
```

### 1.2 Install Required Dependencies & Playwright
```bash
# 1. Install frontend workspace dependencies
npm install

# 2. Install backend dependencies
npm --prefix backend install

# 3. Install Playwright browser binaries with system dependencies
npx playwright install --with-deps
```

### 1.3 Setup & Verify Live Database (MariaDB / MySQL)
The integration test suites require a live, running database. Mock databases are strictly prohibited:
1. Ensure **MariaDB 10.5+** or **MySQL 8.0+** is running on port `3306`.
2. Create database `aime365` (charset `utf8mb4`, collation `utf8mb4_unicode_ci`):
   ```sql
   CREATE DATABASE IF NOT EXISTS aime365 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```
3. Run all migrations in `backend/database/migrations/` (001 through 024):
   ```bash
   node backend/database/runMigrations.js
   ```
4. Verify database connectivity:
   ```bash
   node -e "const mysql = require('mysql2/promise'); mysql.createConnection({host:'127.0.0.1',port:3306,user:'root',password:process.env.DB_PASSWORD||'',database:'aime365'}).then(()=>console.log('✓ MARIADB CONNECTION VERIFIED ON 3306')).catch(e=>{console.error('✗ DB ERROR:',e.message); process.exit(1);})"
   ```

---

## 🧪 STEP 2: RUN THE COMPLETE 8-STREAM INDEPENDENT VERIFICATION BATTERY

Run each stream in sequence and capture complete console output logs:

### Stream 1: Security Static Sentinels & Canonical Discovery Policy
```bash
npm run test:security:static
```
- **Acceptance Gate**: **67 / 67 PASS, 0 failures**.
- **Checks**: Canonical `.htaccess` security headers, `robots.txt`/`sitemap.xml`, zero secrets in tracked tree, XSS sanitization, native TOTP MFA guards, unlayered-CSS isolation.

### Stream 2: Backend Core & Integration Matrix (Live MariaDB)
```bash
npm --prefix backend test
```
- **Acceptance Gate**: **892 / 892 PASS, 0 failures** on live MariaDB.
- **Checks**: Transactional outbox, master-key AES-256-GCM envelope encryption, P0 TOTP MFA freshness checks, tenant isolation, IDOR export boundaries.

### Stream 3: Frontend Product Suite Matrix
```bash
npm run test:product
```
- **Acceptance Gate**: **729 / 729 PASS, 0 failures** across all 58 product suites.
- **Checks**: Candidate workspace, ATS applicant review, enterprise organization console, admin command center, resume builder 11-step completion, zero-fabrication assertions.

### Stream 4: AI Interview Coach & Audio/Voice CBT Simulator
```bash
npm run test:interview -- --test-concurrency=1
```
- **Acceptance Gate**: **31 / 31 PASS, 0 failures**.
- **Checks**: Multi-tab session takeover, duration bounds, refresh recovery pointers, text fallback, role/type question deduplication.

### Stream 5: Cuba Executive Design System & 4 Portals
```bash
npm run test:design-system
```
- **Acceptance Gate**: **141 / 141 PASS, 0 failures**.
- **Checks**: Google Material 3 / Cuba glassmorphic design tokens across Candidate, Employer, Org, and Admin portals; unique nav `aria-label` landmarks; honest AI telemetry ring.

### Stream 6: Hermetic Playwright Real-DOM Browser Crawl
```bash
npm run test:dir048:browser
```
- **Acceptance Gate**: **8 / 8 PASS, 0 failures** across 375px mobile, 768px tablet, and 1280px desktop viewports.
- **Checks**: Zero native dialogs (`window.alert/confirm/prompt`); zero `"Invalid Date"`, `NaN`, or `undefined` strings in any portal DOM; uniform gutters; axe-core WCAG 2.1 AA in light AND dark mode.

### Stream 7: Production Vite Bundle & Static Linting
```bash
npm run build
npm run lint
```
- **Acceptance Gate**: Vite build **EXIT 0**; ESLint **0 fatal errors** (advisory warnings permitted).

### Stream 8: Protected Frozen Invariants & Baseline Audits
```bash
# 1. Verify aiRuntime.js has 0-byte diff against certified baseline e314f715:
git diff e314f715 -- backend/services/aiRuntime.js

# 2. Verify all 51 resume templates and 4 cover letters:
node scripts/dir047-template-census.mjs

# 3. Verify zero simulated latency offenders:
node scripts/dir047-latency-census.mjs
```
- **Acceptance Gate**: `aiRuntime.js` diff is strictly 0 bytes; 51 CVs and 4 covers matched with 0 unmatched; 0 simulated latency offenders.

---

## 🔒 ABSOLUTE NON-NEGOTIABLE INVARIANTS
1. **Never modify `backend/services/aiRuntime.js`**: Must maintain 0-byte diff vs `e314f715`.
2. **Never modify the 51 resume templates** in `src/components/templates/Cv*.jsx`.
3. **Never synthesize fake telemetry or mock databases**: All integration checks must test authentic runtime behavior.
4. **Never leak secrets**: No plaintext tokens in client code or logs.

---

## 📋 STEP 3: SUBMIT YOUR INDEPENDENT CERTIFICATION REPORT

When all 8 streams pass 100% green on your remote machine, provide a formal certification handover report using the template below:

```markdown
### 📋 Remote Master Verification & Certification Report

#### 1. Remote Environment Setup
- **OS / Host**: [e.g. Ubuntu 22.04 LTS / Windows Server]
- **Node Runtime**: [e.g. v20.18.0]
- **Database**: [MariaDB 10.11 on 3306 — 24 migrations applied]
- **Playwright**: [All browser engines installed & verified]
- **Git Commit Tested**: [e.g. 51f6347f]

#### 2. Independent Test Execution Proofs
- **Stream 1 (Static Security)**: `67 / 67 PASS` (Execution time)
- **Stream 2 (Backend Core Matrix)**: `892 / 892 PASS` on live MariaDB
- **Stream 3 (Frontend Product)**: `729 / 729 PASS` across 58 suites
- **Stream 4 (Interview Coach)**: `31 / 31 PASS` with `--test-concurrency=1`
- **Stream 5 (Cuba Design System)**: `141 / 141 PASS` across 4 portals
- **Stream 6 (Playwright Browser UAT)**: `8 / 8 PASS` real-DOM headless crawl
- **Stream 7 (Production Build & Lint)**: Build EXIT 0, ESLint 0 fatal errors
- **Stream 8 (Frozen Invariants)**: `aiRuntime.js` 0-byte diff, 51 templates verified, 0 latency offenders

#### 3. Formal Certification
- [x] All 8 verification streams executed and passed independently from first principles.
- [x] Zero regressions, zero dead routes, zero native dialogs, and zero token leakage.
- [x] Codebase officially certified 10/10 production ready.
```
```
