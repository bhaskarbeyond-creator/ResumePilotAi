# IME365 — Autonomous AI Career Intelligence Platform

A unified full-stack career platform featuring an AI Resume Builder (51 responsive templates, DOCX & PDF exports), AI Cover Letter Generator, AI Portfolio Builder, AI Interview Coach & CBT Simulator, Job Portal with candidate intelligence, and an Enterprise Multi-Tenant Console.

---

## 🏗️ Architecture Overview

- **Frontend**: React 18, Vite, Vanilla CSS with responsive design system, Rolldown bundling, i18n multi-language localization.
- **Backend**: Node.js (Express 5), MariaDB / MySQL authoritative database (78 relational tables), Firebase Admin (authentication & identity only).
- **AI Engine**: Multi-provider dynamic routing cascade with automated failover (NVIDIA NIM, Google Gemini, OpenAI, Groq, OpenRouter, DeepSeek).
- **Document Generation**: High-fidelity OOXML (.docx) via `docx` library and pixel-perfect PDF rendering via Playwright / Chrome headless.
- **Hosting & Web Server**: Apache 2.4 (VirtualHost on `https://ime365.local/` with reverse proxy to Node.js backend on `127.0.0.1:8080`).

---

## 📁 Repository Structure

```
IME365/
├── backend/            # Node.js Express backend server
│   ├── database/       # MariaDB schema, connection pool, migrations
│   ├── enterprise/     # Multi-tenancy, quotas, audit, outbox, AES-256-GCM encryption
│   ├── routes/         # REST API routes (auth, resumes, AI, jobs, admin, billing)
│   ├── services/       # AI routing, document export, email, telemetry
│   └── test/           # Comprehensive backend test suite (820+ unit & integration tests)
├── src/                # React / Vite frontend application
│   ├── components/     # UI components (BuildResume, Dashboard, JobsListings, Admin, etc.)
│   ├── utils/          # Client utilities, candidate context, export helpers
│   └── locales/        # Multi-language translation dictionaries
├── public/             # Static assets, fonts, icons, manifest
├── dist/               # Production build output (served by Apache / LiteSpeed)
├── docs/               # Production specifications and runbooks
│   ├── FINAL_API_INVENTORY.md      # Authoritative API endpoint specifications
│   ├── PRODUCTION_RUNBOOK.md       # Operational runbook and recovery procedures
│   └── SAFE_PRODUCTION_WORKFLOW.md # Production release and deployment protocols
└── tests/              # Frontend, security, and end-to-end test suites
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: v20 or v22+
- **MariaDB / MySQL**: Active on port 3306 with database `ai_resume_builder`
- **Apache** (Local): Configured with `httpd-vhosts.conf` for `ime365.local`

### 1. Environment Configuration

Ensure `.env` files are configured:
- Root: `.env` (Firebase client credentials, API base URL)
- Backend: `backend/.env` (Database credentials, AI provider keys, JWT secrets)

### 2. Run the Development Servers

```bash
# Terminal 1: Start Backend (Port 8080)
cd backend
npm run dev

# Terminal 2: Start Frontend (Vite Port 5173 or through Apache https://ime365.local)
npm run dev
```

### 3. Build for Production

```bash
# Compile optimized frontend assets into dist/
npm run build
```

### 4. Run Test Suites

```bash
# Run backend tests
cd backend && npm test

# Run static security and integrity tests
npm run test:security:static
```

---

## 🔒 Security & Governance

- Zero API secret exposure to client bundles.
- Firebase Auth session integrity with strict role-based access control (RBAC).
- MariaDB transactional outbox with HMAC-SHA256 tamper-evident logging.
- Client-side content sanitization preventing XSS across all user-generated content and resumes.
