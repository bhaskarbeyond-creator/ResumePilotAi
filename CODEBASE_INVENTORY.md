# CODEBASE_INVENTORY.md
## Phase A — Repository Discovery and Preservation
**Master Engineering Directive:** MED-001-FINAL  
**Generated At:** 2026-10-14T01:33:00+05:30  
**Authority:** Technical Lead / Executive Engineering Lead (Antigravity)

---

### 1. REPOSITORY IDENTITY & SOURCE CONTROL

- **Repository Name:** `ResumePilotAi` (`IME365`)
- **Active Workspace Directory:** `d:\xampp\htdocs\IME365`
- **Remote Origin URL:** `git@github.com:bhaskarbeyond-creator/ResumePilotAi.git`
- **Active Branch:** `arena/f4651d36-resumepilotai`
- **Upstream Tracking:** `origin/arena/f4651d36-resumepilotai`
- **Head Commit SHA:** `9beb7a3e` (`[CERTIFIED] DIR-106: Fix Menu Bar AI Allowance Meter Display and Resolve Ambiguous Multi-Tenant Governance on /api/ai-usage`)
- **Key Recovery Points & Baselines:**
  - `backup/2026-10-07-master-release` (Certified baseline commit: `9c479ff`)
  - `restore-point/2026-10-02-stable` (Stable rollback anchor)
  - `main` (Production branch anchor)
  - `remotes/origin/takeover/build-resume-rearchitecture-sync`

---

### 2. WORKING TREE STATE & USER CHANGES PRESERVATION

- **Staged Changes:** None
- **Unstaged Modified Files:**
  - `docs/CUBA_10_OUT_OF_10_DEVELOPER_PROMPT.md`: Enhanced with Section 41 & Section 43 Automated Quality Gates (LSP, ESLint, Semgrep AST, Branch Coverage, Playwright DOM traces).
  - `.agents/AGENTS.md`: Enhanced with Section 2.1 Directive Tooling Contract.
  - `package.json`: Registered `"test:dir109"` extension tooling integration test.
  - `extension/README.md`, `extension/contentScript.js`, `extension/popup.html`: Chrome extension updates.
- **Untracked Additions:**
  - `tests/dir109-bridge-ext-tooling.test.mjs`: Bridge extension tooling verification test (Better Todo Tree + Semgrep LSP).
  - `.bridge/evidence/todos-scan.json`: Automated marker scan report.
  - `.bridge/evidence/ext-probe-*.json`: IDE extension diagnostic probes.
- **Preservation Status:** All active user changes preserved verbatim. Zero destructive resets or uncommitted code discards.

---

### 3. ARCHITECTURE, FRAMEWORKS & RUNTIMES

- **Frontend Core:**
  - **Framework:** React 18 (`react`, `react-dom`, `react-router-dom` v6)
  - **Build Engine & Bundler:** Vite 5.x with Rolldown / esbuild minification
  - **Styling Architecture:** Tailwind CSS v4 with `@layer` isolation, Cuba Modern Executive Glassmorphism token hierarchy
  - **Rich Text / Resume Engine:** Lexical (`@lexical/react`), Canvas/PDF export pipeline, High-fidelity DOCX composer (`backend/services/docxComposer.js`)
  - **Portals (4-Portal Architecture):**
    1. Candidate Portal (`/dashboard`, `/build-resume`, `/interview`, `/job-tracker`)
    2. Employer / Recruiter Portal (`/employer`, `/employer/pipeline`)
    3. Enterprise Console (`/enterprise`, `/org/:slug`)
    4. Admin & SuperAdmin Control Plane (`/admin`, `/superadmin`)
- **Backend Core:**
  - **Runtime:** Node.js (v20+ ESM & CJS dual modules)
  - **Server Framework:** Express.js (`backend/server.js`, port 5000 / proxy via Vite)
  - **Database Authority:** MariaDB / MySQL dual-database architecture (`backend/services/db.js`, `aime365` schema, 24+ migrations)
  - **Authentication:** Firebase Auth SDK with native TOTP MFA, same-origin bearer token validation, and RBAC middleware
- **AI Orchestration & Routing:**
  - Multi-provider LLM failover chain: NVIDIA NIM (`meta/llama-3.2-11b-vision-instruct`, `nvidia/nemotron-mini-4b-instruct`), Gemini, Groq, OpenAI
  - Extract-JSON normalization pipeline (`extractJson`) with zero fallback hallucination
- **Browser Extension:**
  - Chrome Manifest V3 extension in `extension/` for automated job applications and profile synchronization

---

### 4. DISCOVERED TEST & VERIFICATION COMMANDS

| Domain | Primary Command | Underlying Engine | Exit Zero Status |
| :--- | :--- | :--- | :---: |
| **Production Build** | `npm run build` | Vite 5.x / Rolldown | **PASS (2.65s)** |
| **Static Linting** | `npm run lint` | ESLint 9+ (`eslint .`) | **PASS (0 errors, 256 test warnings)** |
| **Static Security & Headers** | `npm run test:security:static` | Node test runner + `.htaccess` validator | **PASS (67/67 tests)** |
| **Extension Tooling (DIR-109)** | `npm run test:dir109` | Node test runner (Semgrep + Todo Tree) | **PASS (9/9 tests)** |
| **Cuba Design System** | `npm run test:design-system` | Node test runner (4 Portals & Tokens) | **PASS (142/142 tests)** |
| **51 Resume Templates** | `npm run test:templates` | Node test runner (Cv1 to Cv51 + DOCX) | **PASS (72/72 tests)** |
| **AI Interview Coach** | `npm run test:interview` | Node test runner (`--test-concurrency=1`) | **PASS (31/31 tests)** |
| **Database Authority** | `node --test backend/test/database-authority.test.js` | MariaDB authority & failover guard | **PASS (6/6 tests)** |
| **Full Product Suite** | `npm run test:product` | End-to-end integration suite | Configured in `package.json` |
| **E2E Browser Crawl** | `npm run test:enterprise:e2e` / `playwright test` | Headless Chromium Playwright | Multi-viewport crawl engine |

---

### 5. INSTALLED EXTENSIONS & ENGINEERING TOOLING INVENTORY

- **Autonomous Agent Implementation:**
  - `saoudrizwan.claude-dev` (Cline) — Senior Staff Developer Engine
  - `rooveterinaryinc.roo-cline` (Roo Code)
- **Deep Static Analysis & Code Quality:**
  - `sonarsource.sonarlint-vscode` (SonarLint) — Cognitive complexity & memory leak analyzer
  - `usernamehw.errorlens` (Error Lens) — Inline compiler diagnostics visualizer
  - `dbaeumer.vscode-eslint` (ESLint) — Real-time rule enforcement
  - `Semgrep.semgrep` / bundled `osemgrep-pro.exe` (Semgrep) — AST-level pattern and logic scanner
- **Testing & Diagnostics:**
  - `ms-playwright.playwright` (Playwright Test) — Browser automation & Trace Viewer
  - `firsttris.vscode-jest-runner` (Jest Runner) — Inline test runner
  - `ryanluker.vscode-coverage-gutters` (Coverage Gutters) — LCOV test coverage visualizer
  - `wallabyjs.console-ninja` (Console Ninja) — Real-time runtime log evaluator
- **Data & APIs:**
  - `cweijan.vscode-database-client2` (Database Client) — Direct MariaDB table inspection
  - `humao.rest-client` (REST Client) — Live endpoint verification
