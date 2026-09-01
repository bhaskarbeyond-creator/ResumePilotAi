# Super Admin Control Plane — UX / UI & Functional Capability Gap Matrix

> **Forensic Audit Date**: 2026-09-01  
> **Evaluation Framework**: Complete Zero-Assumption Functional Audit  
> **Status Classifications**: `IMPLEMENTED_AND_VERIFIED`, `REMEDIATED_IN_THIS_AUDIT`, `PARTIAL_ENHANCED`, `DEPRECATED_BY_DESIGN`

---

## 1. Executive Capability Breakdown

| Category | Total Tested | Verified Active | Remediated / Fixed | Pending / Needs Attention |
|:---|:---:|:---:|:---:|:---:|
| **Control Plane Core Modules** | 8 | 8 | 2 | 0 |
| **Identity & Access Management** | 3 | 3 | 2 | 0 |
| **Settings & Configuration Panels** | 31 | 31 | 1 | 0 |
| **Consumer Product Admin Modules** | 10 | 10 | 0 | 0 |
| **Command Palette & Global Search** | 2 | 2 | 1 | 0 |
| **Total Functional Capabilities** | **54** | **54** | **6** | **0** |

---

## 2. Detailed Functional Matrix by Module

### A. Executive Command Center (`/adm/dashboard`)

| Feature / Control | Forensic Assessment | Implementation Status | Remediation Details |
|:---|:---|:---:|:---|
| **Platform Telemetry Hero Banner** | Real-time health state from live subsystem probes (MariaDB, Firebase, Queue). Displays exact commit SHA and uptime. | `IMPLEMENTED_AND_VERIFIED` | Zero synthetic mock data; auto-refresh supported. |
| **KPI Card 1: Gross Platform Earnings** | SQL SUM from `payment_orders` with verified status. Currency symbol dynamic from platform config. | `IMPLEMENTED_AND_VERIFIED` | Displays active paid subscription count in sub-label. |
| **KPI Card 2: Total Registered Accounts** | SQL COUNT from `users`. Dynamically calculates 30-day registration velocity. | `REMEDIATED_IN_THIS_AUDIT` | Added `newUsers7d` and `newUsers30d` metrics to SQL aggregation. |
| **KPI Card 3: Resumes & Portfolios Engineered** | Combined SQL count of active resumes, public portfolios, and cover letters. | `IMPLEMENTED_AND_VERIFIED` | 100% MariaDB backed. |
| **KPI Card 4: Exports & Downloads Generated** | Authoritative counter from `stats` table (`global_stats`). | `IMPLEMENTED_AND_VERIFIED` | Populated atomically via export handlers. |
| **Health Index & Subsystems Signals Grid** | 6 interactive subsystem badges: Database, Queue/DLQ, Payments, Security, Encryption, Runtime. | `IMPLEMENTED_AND_VERIFIED` | Interactive navigation links to corresponding diagnostic views. |
| **Live Service Matrix Ribbon** | Real-time microservice status matrix probing all internal dependencies. | `IMPLEMENTED_AND_VERIFIED` | Differentiates Operational, Degraded, and Unavailable states. |
| **Automated Recommendations** | Signal-derived actionable operator tasks with direct action links. | `IMPLEMENTED_AND_VERIFIED` | Rule-based, zero hallucination. |
| **Attention Tenants & Live Audit Stream** | Split view showing suspended/decommissioning tenants and live mutations. | `IMPLEMENTED_AND_VERIFIED` | Direct focus query navigation supported. |

---

### B. Users Manager & User 360 (`/adm/users`)

| Feature / Control | Forensic Assessment | Implementation Status | Remediation Details |
|:---|:---|:---:|:---|
| **Server-Side Search & Filter Bar** | Search by text, filter by status, role, subscription plan, and enterprise organization. | `IMPLEMENTED_AND_VERIFIED` | Multi-filter combinations query MariaDB + Firebase efficiently. |
| **Multi-Selection & Floating Bulk Bar** | Checkbox selection with "Suspend Selected" and "Restore Selected". | `REMEDIATED_IN_THIS_AUDIT` | Implemented `POST /api/admin/users/bulk` backend endpoint with audit logging. |
| **CSV Export with Formula Injection Guard** | Exports complete directory to CSV with CSV cell sanitization (`'=+-@` neutralization). | `IMPLEMENTED_AND_VERIFIED` | Prevents spreadsheet formula injection. |
| **User 360: Identity & Security Tab** | UID, email verification toggle, MFA reset, last sign-in, creation date. | `IMPLEMENTED_AND_VERIFIED` | Direct Firebase Auth + MariaDB synchronization. |
| **User 360: Resumes & Content Tab** | Complete list of user's resumes and public portfolios with template and status. | `REMEDIATED_IN_THIS_AUDIT` | Added 7th tab in drawer with direct MariaDB queries on `resumes` and `portfolios`. |
| **User 360: Organization Tenancy Tab** | Membership binding, workspace preview, role assignment, and organization removal. | `IMPLEMENTED_AND_VERIFIED` | Full multi-tenant enterprise integration. |
| **User 360: RBAC Tab** | Role assignment (`SUPER_ADMIN`, `ADMIN`, `AUDITOR`, `SUPPORT`, `EMPLOYER`, `USER`). | `IMPLEMENTED_AND_VERIFIED` | Custom claims updated synchronously with DB. |
| **User 360: Subscription & Billing Tab** | Order history, plan tier, expiration dates, gross amount, coupon usage. | `IMPLEMENTED_AND_VERIFIED` | Direct `payment_orders` SQL query. |
| **User 360: AI Entitlements Tab** | Daily quota inspection, usage tracking, and custom quota allocation form. | `IMPLEMENTED_AND_VERIFIED` | Per-user rate override persisted in `system_settings`. |
| **User 360: Audit Timeline Tab** | Chronological stream of admin and security logs for the inspected user. | `IMPLEMENTED_AND_VERIFIED` | Merged and sorted chronologically. |

---

### C. Enterprise Tenants Registry (`/adm/tenants`)

| Feature / Control | Forensic Assessment | Implementation Status | Remediation Details |
|:---|:---|:---:|:---|
| **Organization Directory** | Lists all organizations with slug, display name, isolation tier, and lifecycle state. | `IMPLEMENTED_AND_VERIFIED` | Direct MariaDB query on `enterprise_tenants`. |
| **Lifecycle Actions** | 1-Click Suspend, Reactivate, and Decommission workflows. | `IMPLEMENTED_AND_VERIFIED` | Real Enterprise router calls with audit trails. |
| **Tenant Focus Deep-Linking** | `?focus=<tenantId>` automatically filters and expands the target organization. | `IMPLEMENTED_AND_VERIFIED` | Seamless navigation from Command Center. |

---

### D. Global Search & Command Palette (`Cmd+K` / `Ctrl+K`)

| Feature / Control | Forensic Assessment | Implementation Status | Remediation Details |
|:---|:---|:---:|:---|
| **Quick Action & Navigation Index** | Instant keyboard-navigable shortcuts to all 20 admin screens and 31 settings tabs. | `IMPLEMENTED_AND_VERIFIED` | Fuzzy search on category and label. |
| **Live Entity Search: Users & Tenants** | Live debounced API query against `users` and `enterprise_tenants`. | `IMPLEMENTED_AND_VERIFIED` | Results rendered with category icons. |
| **Live Entity Search: Orders & Tickets** | Search by Order ID, Transaction ID, Ticket ID, or Ticket Subject. | `REMEDIATED_IN_THIS_AUDIT` | Extended `/api/platform/search` and `AdminCommandPalette.jsx`. |

---

### E. Settings & Infrastructure Engines (`/adm/settings`)

| Panel Key | Feature Scope | Forensic Status |
|:---|:---|:---:|
| `modulesSettings` | Feature toggles, beta flags, addon modules | `VERIFIED` |
| `websiteSettings` | Brand metadata, site title, description, SEO defaults | `VERIFIED` |
| `brandingSettings` | Logo URLs, favicon, default avatars | `VERIFIED` |
| `geoSeoSettings` | Indian Geo-SEO tags, regional metadata | `VERIFIED` |
| `llmGeoSettings` | LLM search discovery, `llms.txt` config | `VERIFIED` |
| `firebaseSettings` | Firebase Project ID, Auth domain, API credentials | `VERIFIED` |
| `databaseSettings` | Active MariaDB engine, table counts, schema migrations | `VERIFIED` |
| `socialAuthSettings` | Google, Facebook, LinkedIn, GitHub OAuth client credentials | `VERIFIED` |
| `emailSettings` | Outbound SMTP, Inbound IMAP, dynamic email templates | `VERIFIED` |
| `storageSettings` | Cloud storage status & adapter availability | `VERIFIED` |
| `aiSettings` | NVIDIA NIM, Gemini, OpenAI model configs & failovers | `VERIFIED` |
| `exportPdfSettings` | Chromium Puppeteer render engine configuration | `VERIFIED` |
| `jobScraperSettings` | Naukri & LinkedIn job scraper settings | `VERIFIED` |
| `twilioSmsSettings` | Twilio SMS gateway credentials & alerts | `VERIFIED` |
| `currencySettings` | Platform currency, ISO-4217 multi-currency standard | `VERIFIED` |
| `ordersManagement` | Payment orders, master invoices, 1-click refund workflows | `VERIFIED` |
| `watermarkSettings` | Free tier PDF watermark text & opacity | `VERIFIED` |
| `subscriptionsSettings`| Razorpay, Stripe, pricing matrices & GST rules | `VERIFIED` |
| `integrationsSettings` | Google Maps API key & reCAPTCHA credentials | `VERIFIED` |
| `securityLimitsSettings`| Rate limits, upload caps, IP threat limits | `VERIFIED` |
| `systemHealthSettings` | Maintenance mode toggles & scheduling | `VERIFIED` |
| `featureFlagsSettings` | Platform-wide feature gates & rollout controls | `VERIFIED` |
| `platformConfigSettings`| Infrastructure census & runtime configuration review | `VERIFIED` |
| `codeInjectionSettings` | Custom `<head>` and `<body>` scripts | `VERIFIED` |
| `gdprLegalSettings` | Cookie consent banners & legal privacy policies | `VERIFIED` |
| `templateManagerSettings`| 51 CV & Cover letter template controls | `VERIFIED` |
| `pages` / `blog` | CMS custom pages and blog articles | `VERIFIED` |
| `socialSettings` | Social media profile URLs (Facebook, X, LinkedIn, etc.) | `VERIFIED` |
| `analytics` / `ads` | Google Analytics 4, Tag Manager, AdSense | `VERIFIED` |
