# ResumePilot AI — Engineering Documentation Hub

> **Last Updated**: 2026-08-30 | **Status**: MariaDB Authoritative | **Head**: Synchronized with `origin/main`

Welcome to the central documentation index for ResumePilot AI. This document is designed for remote developers, QA engineers, and architects to quickly locate authoritative specifications, active audits, operational runbooks, and implementation queues.

---

## 🎯 Primary Authoritative Documents (Fresh August 2026 Forensics)

All remote developers must reference these **7 core documents** as the single source of truth for the platform's current state:

| # | Document | Location | Purpose |
|---|---|---|---|
| 1 | **Architecture Flowchart** | [`architecture-flowchart.md`](file:///d:/xampp/htdocs/ai-resume-builder/architecture-flowchart.md) | High-level system context, auth flows, RBAC hierarchy, database diagrams, and worker lifecycles. |
| 2 | **Whole-Platform Forensic Audit** | [`docs/WHOLE_PLATFORM_FORENSIC_AUDIT.md`](file:///d:/xampp/htdocs/ai-resume-builder/docs/WHOLE_PLATFORM_FORENSIC_AUDIT.md) | 60+ feature status matrix, system invariants, SWOT analysis, and the ground-truth status table. |
| 3 | **Whole-Platform Gap Register** | [`docs/WHOLE_PLATFORM_GAP_REGISTER.md`](file:///d:/xampp/htdocs/ai-resume-builder/docs/WHOLE_PLATFORM_GAP_REGISTER.md) | Prioritized catalog of 30 open gaps (P0 to P3) with root causes, technical impact, and developer assignments. |
| 4 | **Enterprise Scorecard & Roadmap** | [`docs/FINAL_ENTERPRISE_SCORECARD.md`](file:///d:/xampp/htdocs/ai-resume-builder/docs/FINAL_ENTERPRISE_SCORECARD.md) | Executive scores across 19 dimensions (Overall: 6.3/10), risk register, and 35–57 day tech debt remediation plan. |
| 5 | **AI Infrastructure & Grounding Audit** | [`docs/AI_INFRASTRUCTURE_AUDIT.md`](file:///d:/xampp/htdocs/ai-resume-builder/docs/AI_INFRASTRUCTURE_AUDIT.md) | 6-provider cascade, prompt grounding validators, daily quota persistence, and retired endpoints. |
| 6 | **UI/UX & Wizard Evaluation** | [`docs/UI_UX_FORENSIC_AUDIT.md`](file:///d:/xampp/htdocs/ai-resume-builder/docs/UI_UX_FORENSIC_AUDIT.md) | Page-by-page inventory, 13-step Resume Builder deep-dive (7.3/10), accessibility audit (4/10), and design system review. |
| 7 | **Orphan Code & Cleanup Audit** | [`docs/ORPHAN_CODE_CLEANUP_AUDIT.md`](file:///d:/xampp/htdocs/ai-resume-builder/docs/ORPHAN_CODE_CLEANUP_AUDIT.md) | 12 orphan candidate files, false-positive safety checks, and 4-wave cleanup schedule. |

---

## 🛠️ Active Operational Runbooks & Production Specs

These documents are actively used by the CI/CD pipeline, operational scripts, and deployment routines:

- [`docs/SAFE_PRODUCTION_WORKFLOW.md`](file:///d:/xampp/htdocs/ai-resume-builder/docs/SAFE_PRODUCTION_WORKFLOW.md) — Production release and deployment protocol.
- [`docs/PRODUCTION_RUNBOOK.md`](file:///d:/xampp/htdocs/ai-resume-builder/docs/PRODUCTION_RUNBOOK.md) — Operational maintenance, recovery, and service management.
- [`docs/FINAL_API_INVENTORY.md`](file:///d:/xampp/htdocs/ai-resume-builder/docs/FINAL_API_INVENTORY.md) — Authoritative endpoint inventory.
- [`docs/I18N_UI_STRING_INVENTORY.json`](file:///d:/xampp/htdocs/ai-resume-builder/docs/I18N_UI_STRING_INVENTORY.json) — UI string census for localization.
- [`docs/ci-templates/`](file:///d:/xampp/htdocs/ai-resume-builder/docs/ci-templates/) — CI/CD workflows (`security-ci.yml`, `codeql.yml`).

---

## 📦 Directory Structure & Taxonomy

```
ai-resume-builder/
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
│   └── archive/                       # 🗄️ Historical Certifications & Past Freeze Reports
```

---

## 🚀 Immediate Implementation Queue for Remote Developers

When picking up development on this repository, work in the following order:

1. **P0 Security**: Remove committed `dev_key` and `dev_key.pub` from root, update `.gitignore`, and rotate key.
2. **P0 Frontend**: Wrap the React application root with a top-level `ErrorBoundary` component.
3. **P1 Observability**: Add structured JSON logging (Winston or Pino) across Express routes.
4. **P1 Architecture**: Split `backend/index.js` (5,979 lines) and `BuildResume.jsx` (137KB) into modular domain sub-components.
5. **P1 Reliability**: Enable PM2 cluster mode for multi-core scalability.
