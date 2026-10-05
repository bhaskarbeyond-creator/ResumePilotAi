# ResumePilotAI (IME365) — Master Directives & Scope Alignment Roadmap

**Architecture Reference:** AI Collaboration Bridge v3.0.0  
**Status as of:** 2026-10-05  
**Active Production Directives:** 30 Core Directives (28 Certified Frozen + 1 In Progress + 1 Master UAT)  

---

## 🏛️ Executive Scope Architecture

The engineering directives for ResumePilotAI have been consolidated and 100% aligned into a streamlined architecture:

```
┌────────────────────────────────────────────────────────────────────────┐
│ PHASE 1: Core Platform & 4 Portals Transformation (28 Directives)     │
│ [DIR-001 through DIR-026, DIR-040, DIR-046]                           │
│ STATUS: 100% APPROVED_FROZEN (Sealed in Git Release Commits)          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ PHASE 2: Production Hardening, Testing & Universal UAT (2 Directives)  │
│                                                                        │
│ 1. DIR-031 (P1): Public Marketing, Secondary Pages & SEO Re-Audit    │
│    STATUS: IN_PROGRESS (Active in Cline ACT mode)                      │
│                                                                        │
│ 2. DIR-047 (P0): Master Full-Platform Testing & Universal UAT 10/10   │
│    (4 Portals, 68 Routes, Security, WCAG, E2E Playwright Crawl & Seal) │
│    STATUS: ISSUED (Auto-activates upon DIR-031 completion)             │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ PHASE 3: Post-Launch Enterprise Expansion Backlog (7 Directives)       │
│ [DIR-027, DIR-028, DIR-035, DIR-036, DIR-037, DIR-038, DIR-039]      │
│ STATUS: BACKLOG (Scheduled for post-v10 production expansion)          │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 🎯 Phase 2: Active Production Testing & UAT Pipeline

| Directive | Priority | Category | Status | Unified Scope & Deliverables |
|---|---|---|---|---|
| **`DIR-031`** | **P1** | Public Marketing & Funnels | **`IN_PROGRESS`** | Canonical origin resolution in robots.txt/sitemap.xml, contact form validation, non-blocking error states, zero simulated latency. |
| **`DIR-047`** | **P0** | **SWOT-Backed Master UAT & E2E Seal** | **`ISSUED`** (Next) | **Unified Master Testing & UAT Directive covering 100% of platform:**<br>• **[S] Strengths:** Zero-diff regression tests on 28 frozen modules, 51 resume templates, dual-DB sync.<br>• **[W] Weaknesses:** Remediation of locale key drift, elimination of simulated `setTimeout`, DOM unmount style cleanups.<br>• **[O] Opportunities:** Automated 68-Route Playwright crawl across 5 viewports, Node.js visual pixel diffing (`bridge visual-diff`), unified 4-portal customer journey.<br>• **[T] Threats:** Penetration testing multi-tenant isolation, zero-secret scanner, XSS sanitization, WCAG 2.1 AA.<br>• **[Certification]:** Final release commit hash sealed in `CERTIFIED_FREEZE_MANIFEST.json`. |

*Note: Previous piecemeal re-audit directives (`DIR-029`, `DIR-030`, `DIR-032`, `DIR-033`, `DIR-034`) have been consolidated directly into `DIR-047` to guarantee 100% coverage in a single unified, SWOT-governed UAT pass.*

---

## 📦 Phase 1: Foundation, AI Engines & 4 Portals
*28 Directives — 100% Certified & Frozen (`APPROVED_FROZEN`)*

* **`DIR-001` to `DIR-006`**: Cuba UI/UX Transformation, Sub-Surfaces, Secondary Pages, Zero-FOUC, Semantic Purge, User Funnel.
* **`DIR-007` to `DIR-010`**: Recruiter ATS Pipeline, In-Modal Resume Review, Enterprise 12 Modules, Candidate Dashboard Overhaul.
* **`DIR-011` to `DIR-017`**: Universal AppHeader, Admin System Console, AI Interview Coach & Audio CBT, AI Cover Letters, SuperAdmin Cloud Controls, Security Center.
* **`DIR-018` to `DIR-026`**: Global Billing & Razorpay/Stripe Checkout, Web CV Studio, Job Kanban, AI ⌘K Copilot, Payment Webhooks, Dark Mode WCAG, Geo-SEO Engine, Universal Link Crawler, In-App Messaging.
* **`DIR-040`**: Zero-Trust Security Hardening, Rate Limiting & OWASP Top 10 Shield.
* **`DIR-046`**: DIR-001 Certification Gap Closure (7/7 Playwright Hermetic Test Suite).

---

## 🚀 Phase 3: Post-Launch Enterprise Expansion Roadmap
*7 Directives — Scheduled for Post-v10 Backlog*

* **`DIR-027`**: Job Portal Clean Architecture & Scraper Purge (Pure Direct Board).
* **`DIR-028`**: Platform-Wide Dead Code & Test Hygiene Purge.
* **`DIR-035`**: Multi-Provider Transactional Email & Webhook Engine (SendGrid/Resend/SMTP).
* **`DIR-036`**: Real-Time Collaborative Resume Editing (WebSockets Delta Sync).
* **`DIR-037`**: Autonomous System Observability, OpenTelemetry APM & RUM Tracing.
* **`DIR-038`**: Offline-First PWA Support & ServiceWorker Resume Cache.
* **`DIR-039`**: Recruiter AI Vector Embedding Candidate Matching.
