# ResumePilot AI — Engineering Documentation Hub

> **Last Updated**: 2026-08-30 | **Status**: MariaDB Authoritative | **Head**: `043697715d52441bd8dc7cd6e96cf8b8f5369527`

Welcome to the central documentation index for ResumePilot AI. This document is designed for remote developers, QA engineers, and architects to quickly locate authoritative specifications, active audits, operational runbooks, and implementation queues.

---

## 🎯 Primary Authoritative Documents (Fresh August 2026 Forensics)

All remote developers must reference these **7 core documents** as the single source of truth for the platform's current state:

| # | Document | Location | Purpose |
|---|---|---|---|
| 1 | **Architecture Flowchart** | [`architecture-flowchart.md`](../architecture-flowchart.md) | High-level system context, auth flows, RBAC hierarchy, database diagrams, and worker lifecycles. |
| 2 | **Whole-Platform Forensic Audit** | [`docs/WHOLE_PLATFORM_FORENSIC_AUDIT.md`](./WHOLE_PLATFORM_FORENSIC_AUDIT.md) | 60+ feature status matrix, system invariants, SWOT analysis, and the ground-truth status table. |
| 3 | **Whole-Platform Gap Register** | [`docs/WHOLE_PLATFORM_GAP_REGISTER.md`](./WHOLE_PLATFORM_GAP_REGISTER.md) | Prioritized catalog of 31 gaps (P0 to P3) with root causes, technical impact, and developer assignments. |
| 4 | **Enterprise Scorecard & Roadmap** | [`docs/FINAL_ENTERPRISE_SCORECARD.md`](./FINAL_ENTERPRISE_SCORECARD.md) | Executive scores across 31 dimensions (Overall: 7.8/10), risk register, and remediation plan. |
| 5 | **AI Infrastructure & Grounding Audit** | [`docs/AI_INFRASTRUCTURE_AUDIT.md`](./AI_INFRASTRUCTURE_AUDIT.md) | 6-provider cascade, prompt grounding validators, daily quota persistence, and retired endpoints. |
| 6 | **UI/UX & Wizard Evaluation** | [`docs/UI_UX_FORENSIC_AUDIT.md`](./UI_UX_FORENSIC_AUDIT.md) | Page-by-page inventory, 13-step Resume Builder deep-dive (7.3/10), accessibility audit (5/10), and design system review. |
| 7 | **Orphan Code & Cleanup Audit** | [`docs/ORPHAN_CODE_CLEANUP_AUDIT.md`](./ORPHAN_CODE_CLEANUP_AUDIT.md) | 12 orphan candidate files, false-positive safety checks, and 4-wave cleanup schedule. |

---

## 🛠️ Active Operational Runbooks & Production Specs

These documents are actively used by the CI/CD pipeline, operational scripts, and deployment routines:

- [`docs/SAFE_PRODUCTION_WORKFLOW.md`](./SAFE_PRODUCTION_WORKFLOW.md) — Production release and deployment protocol.
- [`docs/PRODUCTION_RUNBOOK.md`](./PRODUCTION_RUNBOOK.md) — Operational maintenance, recovery, and service management.
- [`docs/FINAL_API_INVENTORY.md`](./FINAL_API_INVENTORY.md) — Authoritative endpoint inventory.
- [`docs/ci-templates/`](./ci-templates/) — CI/CD workflows (`security-ci.yml`, `codeql.yml`).

---

## 📦 Directory Structure & Taxonomy

```
ResumePilotAi/
├── architecture-flowchart.md          # 🌟 ROOT: System Architecture & Mermaid Diagrams
├── docs/
│   ├── README.md                      # 📖 THIS FILE: Central Documentation Hub
│   ├── WHOLE_PLATFORM_FORENSIC_AUDIT.md # 📋 Feature Status & SWOT Analysis
│   ├── WHOLE_PLATFORM_GAP_REGISTER.md # 🚨 Prioritized Implementation Gaps (P0-P3)
│   ├── FINAL_ENTERPRISE_SCORECARD.md  # 🏆 Enterprise Readiness Scorecard
│   ├── AI_INFRASTRUCTURE_AUDIT.md     # 🤖 AI Providers, Grounding & Quotas
│   ├── UI_UX_FORENSIC_AUDIT.md        # 🎨 UX, Design Systems & A11y
│   ├── ORPHAN_CODE_CLEANUP_AUDIT.md   # 🧹 Dead Code & Staged Removal Plan
│   ├── SAFE_PRODUCTION_WORKFLOW.md    # 🚀 Production Deployment Rules
│   ├── PRODUCTION_RUNBOOK.md          # 🔧 Platform Operations & Maintenance
│   ├── FINAL_API_INVENTORY.md         # 📡 API Endpoint Reference
│   ├── ci-templates/                  # ⚙️ CI Workflows
│   ├── enterprise-visual-audit/       # 🖼️ Visual Evidence & UI Artifacts
│   └── archive/                       # 🗄️ Historical Certifications & Past Freeze Reports (242 files)
```

---

## 🚀 Immediate Implementation Queue for Remote Developers

When picking up development on this repository, work in the following order:

1. **P1 Observability**: Add structured JSON logging (Winston or Pino) across Express routes.
2. **P1 Architecture**: Split `backend/index.js` (5,979 lines) and `BuildResume.jsx` (137KB) into modular domain sub-components.
3. **P1 Reliability**: Enable PM2 cluster mode for multi-core scalability.
4. **P2 Accessibility**: Implement automated a11y testing (axe-core) for compliance.
5. **P2 Performance**: Address large bundle sizes through code splitting.

---

## ✅ Recent Fixes (August 2026 Audit)

| Issue | Fix | Impact |
|-------|-----|--------|
| GAP-001: Committed dev keys | Keys removed from tracking, `.gitignore` updated | Security |
| GAP-002: Missing ErrorBoundary | Created `src/components/ErrorBoundary.jsx`, wrapped app root | Reliability |
| GAP-031: Lint warnings | Fixed unnecessary regex escapes | Code quality |

---

## 📊 Current Test Status

| Suite | Tests | Pass | Fail | Skip | Duration |
|-------|-------|------|------|------|----------|
| Security Static | 44 | 44 | 0 | 0 | 9.1s |
| Backend | 537 | 513 | 0 | 24 | 30.3s |
| Product | ~200+ | All | 0 | 0 | 28.6s |
| Lint | 0 warnings | - | - | - | 15.5s |
| Build | Success | - | - | - | 4.4s |

---

## 🔒 Security Posture

- ✅ No committed secrets (`.gitignore` covers all `.env` files and key files)
- ✅ Firebase Auth identity-only (MariaDB authoritative for application data)
- ✅ OAuth PKCE flow with state binding
- ✅ Rate limiting (global, auth, AI, export, messaging)
- ✅ CORS with explicit allowlist
- ✅ Helmet security headers
- ✅ Input validation and XSS sanitization
- ✅ SQL injection prevention (parameterized queries)
- ✅ CSRF protection
- ✅ Request ID correlation

---

## 🤖 AI Grounding & Factuality

ResumePilot AI implements industry-leading AI grounding validation:

- **Source-of-truth rules**: AI can only rewrite facts explicitly present in user-provided data
- **Citation enforcement**: Every AI-generated item must include a verbatim source excerpt
- **Protected claim families**: Credentials, achievements, leadership, and measured outcomes require source evidence
- **Quantity validation**: AI cannot introduce numbers, percentages, or metrics absent from source
- **Identifier validation**: AI cannot introduce named entities absent from source
- **Provider cascade**: 6 AI providers with automatic failover
- **Source-preserving fallback**: When all providers fail, returns original user text (never fabricated content)

---

## 📈 Enterprise Scorecard

**Overall Score: 7.8/10** (up from 6.3/10)

| Category | Score |
|----------|-------|
| Architecture | 8/10 |
| Backend | 8/10 |
| Frontend | 7/10 |
| API | 8/10 |
| Database | 9/10 |
| Authentication | 9/10 |
| Authorization | 8/10 |
| Security | 8/10 |
| AI Infrastructure | 8/10 |
| AI Grounding | 9/10 |
| AI Factuality | 9/10 |
| Testing | 8/10 |
| CI/CD | 8/10 |
| Documentation | 8/10 |

See [`docs/FINAL_ENTERPRISE_SCORECARD.md`](./FINAL_ENTERPRISE_SCORECARD.md) for complete details.
