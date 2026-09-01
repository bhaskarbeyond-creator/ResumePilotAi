# PUBLIC WEBSITE ROUTE MATRIX & DESTINATION AUDIT
**Environment**: `https://ai-resume-builder.local/`  
**Test Framework**: Playwright Real-Browser Verification Engine

| Route Path | Destination Component | Auth Level | Purpose | HTTP / Render Status | Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/` | `<Welcome />` ➔ `<Dashboard2 />` | Public | Primary Landing Page & Showcase | **200 OK / PASS** | Rendered `.rp-public-site` |
| `/blog` | `<BlogList />` | Public | Career Blog Listing & Search | **200 OK / PASS** | Title: "Blog", API: `/api/blog-data` |
| `/blog/:slug` | `<BlogPost />` | Public | Article Detail & Career Guides | **200 OK / PASS** | Dynamic slug rendering |
| `/p/privacy-policy` | `<CustomePage />` | Public | Legal: Privacy Policy | **200 OK / PASS** | MariaDB Custom Page |
| `/p/terms-of-service` | `<CustomePage />` | Public | Legal: Terms of Service | **200 OK / PASS** | MariaDB Custom Page |
| `/p/cookie-policy` | `<CustomePage />` | Public | Legal: Cookie Policy | **200 OK / PASS** | MariaDB Custom Page |
| `/contact` | `<Contact />` | Public | Support & Inquiries Desk | **200 OK / PASS** | Contact Form rendered |
| `/portfolio/builder` | `<PortfolioBuilder />` | Protected | Web Portfolio Studio | **200 OK / PASS** | `RequireAuthenticated` Gate |
| `/enterprise` | `<EnterpriseConsole />` | Protected | Enterprise Multi-Tenant Workspace | **200 OK / PASS** | `RequireAuthenticated` Gate |
| `/build-resume/*` | `<BuildResume />` | Protected | 51-Template Resume Studio Engine | **200 OK / PASS** | `RequireAuthenticated` Gate |
| `/dashboard` | `<Dashboard />` | Protected | User Account & Resume Library | **200 OK / PASS** | `RequireAuthenticated` Gate |
| `/adm` | `<Admin />` | Protected | Super Admin Governance Suite | **200 OK / PASS** | `RequireAuthenticated` Gate |
