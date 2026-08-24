# Forensic UI Control Census Report: Real-DOM vs Source AST

## Executive Summary
This document provides the authoritative, forensic breakdown comparing the legacy source-level AST/regex findings (2,052 records) against the authentic **Real-DOM Control Census** discovered from the live, running React application in a real Chromium browser environment.

---

## 1. Core Architectural Principle: REAL DOM > SOURCE AST

In web application testing and certification, source-level text matches or AST nodes do **not** constitute proof that an interactive control exists in the user experience:
- **Unmounted / Unrouted Components**: Source files such as `src/App.jsx` contained count button JSX fragments that were never rendered by `src/main.jsx` (which renders `Welcome.jsx` at `/`), yet were erroneously assigned control IDs (`CTRL-0001`) in the legacy census.
- **Dead Code & Fragment Duplication**: Subcomponents rendered multiple times or dead branch conditionals in source files artificially inflated the finding count.
- **Runtime Authority**: The running React DOM in a real browser session (with auth token resolution and CSS layout calculation) is the sole source of truth for interactive UI controls.

---

## 2. Forensic Reconciliation: Source Findings vs Rendered DOM Controls

| Metric Category | Count | Classification | Certification Usability |
| :--- | :--- | :--- | :--- |
| **Legacy AST/Regex Source Matches** | 2,052 | `LEGACY_INVALID / SYNTHETIC` | ❌ Disallowed (Quarantined) |
| **Total Raw DOM Observations (across 8 roles)** | 2,039 | `REAL_BROWSER_OBSERVATIONS` | ℹ️ Reference Context |
| **Unique Authoritative Real-DOM Controls** | **1,716** | `UNIQUE_REAL_RENDERED_CONTROLS` | ✅ **Authoritative Census Target** |
| **Distinct Reachable Routes / State Sub-Views** | 68 | `REAL_ROUTE_STATES` | ✅ Validated |
| **Roles Audited** | 8 | `AUTHENTICATED_ROLE_SURFACES` | ✅ Multi-Role Validated |

---

## 3. Multi-Role Reachability & Visibility Distribution

The 1,716 controls were crawled and audited across 8 deterministic authentication roles:
1. **`ANONYMOUS` (Guest / Public)**: Public homepage, login, features, pricing, public jobs, blog, shared resumes, public portfolio view, terms & privacy (374 unique controls).
2. **`USER` (Authenticated Candidate)**: Resume Builder 12 steps, Cover Letter builder, User Dashboard, Settings, Messages, Favorites, AI Interview Coach, Portfolios, Applied Jobs, Job Tracker, Job Matching (317 unique controls).
3. **`ADMIN` (Platform Administrator)**: Admin Dashboard, Users Manager, System Settings, Messages, Reviews, Trusted By, Employer Applications, Jobs Manager, Company Management, Blog Management, Landing Pages, Phrases (411 unique controls).
4. **`SUPER_ADMIN` (Elevated Admin with TOTP MFA)**: Audit Logs, Platform Queues, Tenant Registry, Platform Security, Platform Operations, Attention Alerts, System Health, Platform Operators (322 unique controls).
5. **`ENTERPRISE_ADMIN` (Tenant Admin)**: Enterprise Command Center, Talent Pool, Users & IAM, Teams, Workspaces, Roles & RBAC, AI Workspace & Quotas, Security & M2M, Usage & Credits, Email Templates, Audit Logs, Support Access, Organization Settings (247 unique controls).
6. **`ENTERPRISE_MEMBER`**: Enterprise Overview, Resumes, Assigned Teams, Workspaces (75 unique controls).
7. **`EMPLOYER`**: Employer Jobs Management, Company Profiles, Candidate Review (69 unique controls).
8. **`AUDITOR`**: Compliance Audit Logs, Read-Only Security Trails (77 unique controls).

---

## 4. Legacy Evidence Quarantine Status

All 12 legacy synthetic evidence files and generators have been quarantined into [`test-results/LEGACY_EVIDENCE_QUARANTINE.json`](file:///d:/xampp/htdocs/ai-resume-builder/test-results/LEGACY_EVIDENCE_QUARANTINE.json) with zero contribution allowed to the certification pass metrics.
