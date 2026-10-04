# 🚀 MASTER ENGINEERING HANDOVER & EXECUTION DIRECTIVE
# ResumePilotAI (IME365) — 40 Production Directives (DIR-001 → DIR-040)
# Target: Autonomous Execution, Verification & Continuous Release

---

## 👔 YOUR ROLE & AUTONOMOUS MANDATE

You are operating as an **Autonomous Senior Staff Software Engineer & Release Lead**. You have full technical ownership to implement, verify, harden, and release the complete **ResumePilotAI (IME365)** platform.

You are expected to **work 100% autonomously**:
- Do **not** pause between directives waiting for manual instructions.
- Work through the directives catalog in `remote-directives/` (`DIR-001.json` through `DIR-040.json`).
- Autonomously discover, triage, and remediate edge cases, unhandled errors, UI inconsistencies, and missing optimizations.
- **Maintain a non-negotiable 10/10 quality bar** on every component, API route, and test suite.

---

## 📌 3 CORE RULES OF ENGAGEMENT

```
Rule 1: PULL CODE & SETUP ENVIRONMENT FIRST
        Pull the latest commits from GitHub, configure dependencies, start services,
        and verify that baseline tests pass before editing code.

Rule 2: PUSH TO GITHUB AFTER EVERY SINGLE VERIFIED DIRECTIVE
        Never batch multiple directives. Complete one directive → run full verification suite →
        update directive status to APPROVED_FROZEN → commit with [freeze] → git push immediately.

Rule 3: WORK CONTINUOUSLY & AUTONOMOUSLY
        Pick the next directive from remote-directives/, plan, implement, crawl/verify,
        push, and proceed directly to the next without waiting.
```

---

## 🛠️ STEP 1: PULL CODE & SETUP YOUR ENVIRONMENT

### 1.1 Pull the Latest Repository State
Both `main` and `arena/01a0e100-resumepilotai` are fully synchronized with all 40 directives.

```bash
# If cloning fresh:
git clone git@github.com:bhaskarbeyond-creator/ResumePilotAi.git
cd ResumePilotAi

# If updating an existing checkout:
git fetch origin
git checkout main
git pull origin main

# Confirm that remote-directives/ contains all 40 directives:
ls remote-directives/
# Output must show: DIR-001.json through DIR-040.json, README.md, REMOTE_DEVELOPER_PROMPT.md
```

### 1.2 Install Dependencies
```bash
# Install frontend dependencies
npm install

# Install backend dependencies
cd backend
npm install
cd ..
```

### 1.3 Environment Configuration
Copy sample environment files if not already present:
```bash
# Ensure .env or .env.local exists in root and backend/
cp .env.example .env
cp backend/.env.example backend/.env
```

### 1.4 Database & Migrations
The authoritative database is **MariaDB** (MySQL-compatible).
- Database migrations are located in: `backend/database/migrations/` (migrations `001` through `020`).
- Ensure MariaDB is running and migrations are applied:
```bash
cd backend
npm run migrate # or apply SQL scripts 001-020 sequentially
cd ..
```

### 1.5 Launch Local Services
```bash
# Terminal 1: Backend Express Server (Port 8080)
cd backend && node index.js

# Terminal 2: Frontend Vite Dev Server (Port 3000)
npm run dev
```

### 1.6 Verify Clean Baseline Before Modifying Code
Run this verification suite to ensure your environment is clean:
```bash
# 1. Invariant check (must output 0 bytes):
git diff e314f715 -- src/cv-templates/ backend/services/aiRuntime.js

# 2. Static security suite (must be 67/67 PASS, 0 fail):
npm run test:security:static

# 3. Production bundle build (must succeed in < 4.0s):
npm run build
```

---

## 🚨 STRICT PRODUCTION INVARIANTS (NON-NEGOTIABLE)

| Invariant | Description | Verification Command |
|---|---|---|
| **INV-1: Frozen Baseline** | `src/cv-templates/` and `backend/services/aiRuntime.js` are certified frozen. Never modify. | `git diff e314f715 -- src/cv-templates/ backend/services/aiRuntime.js` (Must be empty) |
| **INV-2: Real MariaDB Data** | No fake, mocked, or placeholder data in production UI. All jobs, stats, and metrics must be live MariaDB queries. | Verify API routes return database rows |
| **INV-3: Zero Secret Leakage** | Never expose API keys (NVIDIA, OpenAI, Stripe, Razorpay) or JWT secrets in client bundles, DOM, URLs, or logs. | `npm run test:security:static` |
| **INV-4: Cuba Design Tokens** | All UI styling must use tokens from `src/styles/cuba-tokens.css`. No raw hex codes or ad-hoc classes. | `npm run test:design-system` |
| **INV-5: Zero FOUC & Flash** | Zero theme inversion flashes on reload. CLS < 0.05. WCAG 2.1 AA contrast compliance. | `node --test tests/dir023-contrast-tokens.test.mjs` |

---

## 🔄 STEP-BY-STEP DIRECTIVE EXECUTION & PUSH WORKFLOW

For **every single directive** (`DIR-001` through `DIR-040`), execute this exact lifecycle:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. READ SPEC       Open remote-directives/DIR-XXX.json. Inspect spec, ACs,  │
│                    and invariants.                                          │
│                                                                             │
│ 2. IMPLEMENT       Make surgical, minimal, high-quality code changes in     │
│                    src/ or backend/. Apply Cuba design tokens.              │
│                                                                             │
│ 3. TEST & CRAWL    Execute tests: npm run test:security:static,             │
│                    npm run build, Playwright/E2E, and real browser check.   │
│                                                                             │
│ 4. UPDATE JSON     Update remote-directives/DIR-XXX.json AND                 │
│                    .bridge/directives/DIR-XXX.json:                         │
│                    - status: "APPROVED_FROZEN"                              │
│                    - qualityRating: "10/10"                                 │
│                    - append test evidence to evidence array.                │
│                                                                             │
│ 5. COMMIT & PUSH   git add .                                                │
│                    git commit -m "feat(<scope>): DIR-XXX <title> [freeze]"   │
│                    git push origin main                                     │
│                    (and git push origin arena/01a0e100-resumepilotai)       │
│                                                                             │
│ 6. NEXT DIRECTIVE  Immediately proceed to next directive. Do not wait.     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📋 COMPLETE CATALOG OF ALL 40 DIRECTIVES (10/10 SPECS)

Every directive JSON is located in `remote-directives/DIR-XXX.json` and mirrored in `.bridge/directives/DIR-XXX.json`.

### 🏛️ GROUP 1: CERTIFIED CORE FOUNDATIONS (DIR-001 → DIR-023) — AUDIT & HARDEN
*Independently audit each surface, verify responsive design (375px, 768px, 1440px), fix any hidden regressions, and record evidence.*

| ID | Priority | Rating | Directive Title | File Path | Focus Surface |
|:---|:---:|:---:|:---|:---|:---|
| **DIR-001** | **P0** | **10/10** | Cuba Executive UI/UX Master Transformation across 4 Portals | `remote-directives/DIR-001.json` | Candidate, Recruiter, Enterprise, and Admin shells; glassmorphism consistency. |
| **DIR-002** | **P1** | **10/10** | Candidate Sub-Surfaces, ContextSwitcher & Command Palette Deep Polish | `remote-directives/DIR-002.json` | Sub-tabs, instant ContextSwitcher, slide-over preview drawer, ⌘K search. |
| **DIR-003** | **P1** | **10/10** | Public Secondary Pages & Marketing Header Harmonization | `remote-directives/DIR-003.json` | About, Pricing, Features, FAQ, Legal pages; sticky glass header blur & scroll-spy. |
| **DIR-004** | **P0** | **10/10** | Zero-FOUC Architecture & Instant Theme/Font Hydration Pipeline | `remote-directives/DIR-004.json` | Pre-paint blocking theme script (<5ms), font preloads, CLS < 0.05. |
| **DIR-005** | **P2** | **10/10** | Semantic Marketing Consolidation & Dashboard2 Legacy Residue Purge | `remote-directives/DIR-005.json` | Complete removal of `/dashboard2` legacy code; clean routing redirects. |
| **DIR-006** | **P1** | **10/10** | Unified End-to-End User Funnel & Cross-Portal Conversion Verification | `remote-directives/DIR-006.json` | Signup → onboarding → resume builder → dashboard → checkout conversion flow. |
| **DIR-007** | **P0** | **10/10** | Recruiter ATS Pipeline Overhaul & In-Modal Candidate Resume Review System | `remote-directives/DIR-007.json` | 5-stage drag-drop Kanban, quick preview modal, candidate scorecards. |
| **DIR-008** | **P0** | **10/10** | Enterprise Organization Dashboard & 12 Console Modules Deep Overhaul | `remote-directives/DIR-008.json` | All 12 Enterprise modules, strict multi-tenant isolation, role delegation. |
| **DIR-009** | **P0** | **10/10** | Candidate Dashboard 10/10 Overhaul, Duplicate Banner Purge & Cuba Tokens | `remote-directives/DIR-009.json` | Purge duplicate banners; metrics cards (score, views, applications). |
| **DIR-010** | **P0** | **10/10** | Recruiter Portal & ATS Candidate Pipeline 10/10 Overhaul | `remote-directives/DIR-010.json` | Recruiter navigation, candidate pipeline views, in-modal rating. |
| **DIR-011** | **P1** | **10/10** | Google M3 Universal AppHeader & Command Surface across All Dashboards | `remote-directives/DIR-011.json` | AppHeader parity across all 4 roles; notification drawer & live badges. |
| **DIR-012** | **P1** | **10/10** | Platform Admin System Console, Super Admin Role Simulator & Security Audit | `remote-directives/DIR-012.json` | Safe impersonation simulator, persistent return bar, diagnostic telemetry. |
| **DIR-013** | **P1** | **10/10** | AI Interview Coach & Audio/Voice CBT Simulator 10/10 Overhaul | `remote-directives/DIR-013.json` | WebAudio API, speech synthesis/recognition, STAR behavioral matrix scoring. |
| **DIR-014** | **P1** | **10/10** | AI Cover Letter Builder & Multi-Format Generator 10/10 Overhaul | `remote-directives/DIR-014.json` | Multi-format cover letter generation, ATS keywords, PDF/DOCX export. |
| **DIR-015** | **P0** | **10/10** | SuperAdmin Platform Settings 10/10 Overhaul & Google Cloud Control Center | `remote-directives/DIR-015.json` | AI model orchestration settings, SWOT analysis, feature flag toggles. |
| **DIR-016** | **P1** | **10/10** | Omitted Cross-Portal Surfaces & Navigation Completeness Freeze | `remote-directives/DIR-016.json` | Enterprise Platform Provisioner tab, Candidate Favorites modal restoration. |
| **DIR-017** | **P0** | **10/10** | Candidate Account & Security Command Center 10/10 Overhaul | `remote-directives/DIR-017.json` | TOTP MFA with QR setup, active session revocation, account deletion safety. |
| **DIR-018** | **P1** | **10/10** | Global Billing, Pricing & Checkout Experience 10/10 Overhaul (INR ₹) | `remote-directives/DIR-018.json` | INR (₹) formatting, GST invoice computation, Razorpay/Stripe checkout. |
| **DIR-019** | **P1** | **10/10** | Digital Portfolio & Web CV Studio 10/10 Overhaul (Vanity Slugs) | `remote-directives/DIR-019.json` | Live customizer, `/u/:username` vanity routing, OpenGraph social cards. |
| **DIR-020** | **P1** | **10/10** | Interactive Job Application Kanban Tracker & Career Intelligence Suite | `remote-directives/DIR-020.json` | 5-stage application tracker, interview calendar sync, cover letter link. |
| **DIR-021** | **P1** | **10/10** | Omnipresent ⌘K AI Career Copilot & Universal Command Surface | `remote-directives/DIR-021.json` | Global keyboard command palette, context-aware prompts, multi-model execution. |
| **DIR-022** | **P0** | **10/10** | Payment Webhook Reconciler, Multi-Gateway Ledger & Entitlement Sentinel | `remote-directives/DIR-022.json` | Webhook signature verification, idempotent ledger, subscription drift defense. |
| **DIR-023** | **P1** | **10/10** | Universal Dark Mode Contrast Auditor & Real-DOM WCAG 2.1 AA Scanner | `remote-directives/DIR-023.json` | Real-DOM contrast matrix across all 74 routes; zero-bleed token enforcement. |

---

### ⚡ GROUP 2: ACTIVE CORE DIRECTIVES (DIR-024 → DIR-034) — IMPLEMENT & CERTIFY

| ID | Priority | Rating | Directive Title | File Path | Implementation Focus |
|:---|:---:|:---:|:---|:---|:---|
| **DIR-024** | **P1** | **10/10** | Autonomous Geo-SEO Engine & Schema.org JSON-LD Career Landing System | `remote-directives/DIR-024.json` | Regional hubs (`/jobs/in/:state`, `/jobs/city/:city`), Schema.org JSON-LD, `/llms.txt`. |
| **DIR-025** | **P0** | **10/10** | Universal Link Crawler, Route Completeness & Zero-404 Navigation Freeze | `remote-directives/DIR-025.json` | Deep crawl of all routes, mount missing sub-routes, zero broken links, 404 fallback. |
| **DIR-026** | **P1** | **10/10** | Real-Time In-App Candidate & Recruiter Messaging 10/10 Overhaul | `remote-directives/DIR-026.json` | Candidate ↔ Recruiter messaging, `enableMessagesModule` gating, unread badges. |
| **DIR-027** | **P1** | **10/10** | Job Portal Clean Architecture & External Scraper Deprecation | `remote-directives/DIR-027.json` | Purge Naukri scraper; rebrand admin modules; pure direct-hiring board. |
| **DIR-028** | **P2** | **10/10** | Platform-Wide Orphaned Code, Dead Tests & File Hygiene 10/10 Overhaul | `remote-directives/DIR-028.json` | Dry-run quarantine, remove dead code/files, verify zero runtime regressions. |
| **DIR-029** | **P1** | **10/10** | Phase 2 Second Review — Enterprise & Recruiter Portals (DIR-001, 7, 8, 10) | `remote-directives/DIR-029.json` | Systematic re-audit of all 12 Enterprise modules and Recruiter ATS Kanban. |
| **DIR-030** | **P1** | **10/10** | Phase 2 Second Review — Candidate Workspace & Navigation (DIR-002, 4, 9, 11) | `remote-directives/DIR-030.json` | Re-audit Candidate Dashboard, AppHeader, resume builder wizard, zero-FOUC. |
| **DIR-031** | **P1** | **10/10** | Phase 2 Second Review — Public Marketing & Funnels (DIR-003, 5, 6) | `remote-directives/DIR-031.json` | Re-audit public secondary pages, verify registration funnel, Lighthouse >= 90. |
| **DIR-032** | **P1** | **10/10** | Phase 2 Second Review — Admin Console, Settings & Security (DIR-012, 15, 16, 17) | `remote-directives/DIR-032.json` | Re-audit SuperAdmin console, Role Simulator, TOTP MFA, session revocation. |
| **DIR-033** | **P0** | **10/10** | Phase 2 Second Review — AI Engines & Billing (DIR-013, 14, 18, 19, 20) | `remote-directives/DIR-033.json` | Re-audit Voice CBT Simulator, Cover Letter AI, billing ledger, portfolio studio. |
| **DIR-034** | **P0** | **10/10** | Universal 10/10 Master Production Certification & Release Freeze | `remote-directives/DIR-034.json` | Full 68-route Real-DOM crawl, Core Web Vitals audit, cryptographic seal. |

---

### 🚀 GROUP 3: SYSTEM ENHANCEMENT DIRECTIVES (DIR-035 → DIR-040) — MAXIMUM SYSTEM POTENTIAL

| ID | Priority | Rating | Directive Title | File Path | High-Value Enhancements |
|:---|:---:|:---:|:---|:---|:---|
| **DIR-035** | **P1** | **10/10** | Automated Email & Webhook Notification Engine with Multi-Provider Failover | `remote-directives/DIR-035.json` | Resend → SendGrid → SMTP failover; Cuba email HTML templates; .ics calendar invites; HMAC-signed webhooks; user preference center. |
| **DIR-036** | **P1** | **10/10** | Real-Time Collaborative Resume Editing & Live Recruiter Feedback Loop | `remote-directives/DIR-036.json` | Live reviewer presence cursors; SSE/WebSocket delta sync; in-line comment annotations with 1-click suggestion accept; snapshot rollback. |
| **DIR-037** | **P1** | **10/10** | Autonomous System Observability, OpenTelemetry Tracing & Client RUM | `remote-directives/DIR-037.json` | Client Core Web Vitals via non-blocking sendBeacon; React Error Boundary reports; X-Correlation-ID propagation; sub-20ms `/health`. |
| **DIR-038** | **P2** | **10/10** | Offline-First PWA Support & ServiceWorker Resume Cache Engine | `remote-directives/DIR-038.json` | PWA manifest; ServiceWorker caching; IndexedDB resume draft auto-save on keystroke (zero work loss during network drop); background sync. |
| **DIR-039** | **P1** | **10/10** | Recruiter AI Candidate Sourcing, Smart Boolean Search & Semantic Profile Matcher | `remote-directives/DIR-039.json` | Semantic natural language + Boolean queries; interactive Skill Gap Radar chart; custom talent pools; Bias-Free Blind Screening mode. |
| **DIR-040** | **P0** | **10/10** | Zero-Trust Security Hardening, Dynamic Rate Limiting & OWASP Top 10 Shield | `remote-directives/DIR-040.json` | Enterprise CSP headers with nonces; sliding-window rate limiting; recursive XSS/SQLi/prototype sanitizer; startup secret vault linter. |

---

## 💡 AUTONOMOUS ENHANCEMENT DISCOVERY MANDATE

As Senior Staff Engineer, you have **open architectural authority** to enhance the codebase beyond the explicit text of any directive:

- **If you find an unstyled component**: Tokenize it using `cuba-tokens.css`.
- **If you find an unhandled API error**: Add try/catch, log correlation ID, and return clean JSON.
- **If you find a test gap**: Write a new unit or integration test in `tests/`.
- **If you find a performance bottleneck**: Add memoization, optimize SQL queries, or split bundles.
- **If you find a missing translation**: Add keys across all 16 locales in `src/locales/`.

Every improvement you make strengthens the platform. Document your enhancements in the directive's `evidence` array and push your commits.

---

## 🏁 FINAL CHECKLIST BEFORE DECLARING PLATFORM COMPLETE

- [ ] All 40 directives in `remote-directives/` marked `APPROVED_FROZEN` with `10/10` quality ratings
- [ ] All 40 directives synchronized in `.bridge/directives/`
- [ ] `git diff e314f715 -- src/cv-templates/ backend/services/aiRuntime.js` is strictly 0 bytes
- [ ] `npm run test:security:static` passes 67/67 tests (0 failures)
- [ ] `npm run build` completes cleanly in < 4.0s
- [ ] Zero simulated, mocked, or synthetic data in production paths
- [ ] Zero secret or API credential leakage across all bundles and logs
- [ ] Full 68-route crawl passes with 100% interactive controls verified
- [ ] WCAG 2.1 AA accessibility compliance across all surfaces
- [ ] Every directive committed with `[freeze]` and pushed to GitHub (`main` and `arena` branches)

---

**You have full mandate. Pull the latest code, start your local stack, pick your first directive, execute with precision, push after every freeze, and deliver world-class production excellence.**
