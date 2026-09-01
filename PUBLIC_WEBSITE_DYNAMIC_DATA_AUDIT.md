# PUBLIC WEBSITE DYNAMIC DATA BINDING & LINEAGE AUDIT
**Environment**: `https://ai-resume-builder.local/`  
**Backend Port**: `http://127.0.0.1:8080` (MariaDB Authoritative)

| Dataset | DB Source / Table | Backend API Endpoint | React Component | Rendered DOM Value | Audit Result | Lineage Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Pro Subscription Pricing** | MariaDB `system_settings` (`public_config.subscriptions.monthlyPrice`) | `GET /api/platform/public-config` | `<HomepagePricing />` | `#rp-pricing-pro-value` ➔ `₹199 / month (INR)` | **PASS** | MariaDB ➔ API ➔ React ➔ DOM |
| **Active Payment Gateways** | MariaDB `system_settings` (`razorpayEnabled`, `stripeEnabled`) | `GET /api/platform/public-config` | `<HomepagePricing />` | Encrypted Checkout via Razorpay UPI / Cards | **PASS** | MariaDB ➔ API ➔ React ➔ DOM |
| **Platform Branding Title** | MariaDB `system_settings` (`website_meta.title`) | `GET /api/platform/public-config` | `<HomepageNavbar />`, `<HomepageFooter />` | `.rp-nav-title` ➔ `"ResumePilot AI"` | **PASS** | MariaDB ➔ API ➔ React ➔ DOM |
| **Pro Template Configuration** | MariaDB `system_settings` (`templateManager.proCvTemplates`) | `GET /api/platform/public-config` | `<HomepageTemplates />` | 3 Gold PRO Badges on `Cv1`, `Cv2`, `Cv5` | **PASS** | MariaDB ➔ API ➔ React ➔ DOM |
| **Database Operational Health** | MariaDB `system_settings` (`_settingsSource`) | `GET /api/platform/public-config` | `<HomepageFooter />` | `#rp-footer-status` ➔ `"MariaDB Authoritative • All Systems Operational"` | **PASS** | MariaDB ➔ API ➔ React ➔ DOM |
| **51 ATS Template Catalog** | `src/utils/templateCatalog.js` (51 Formats) | `TEMPLATE_CATALOG` | `<HomepageTemplates />` | 6 diverse cards on landing + 51 in catalog | **PASS** | Catalog ➔ React ➔ DOM |
| **Blog Feed Engine** | MariaDB `blog_posts` table | `GET /api/blog-data` | `<BlogList />` | `/blog` route connected to backend post API | **PASS** | MariaDB ➔ API ➔ React ➔ DOM |
| **Git / Platform Release Identity** | Backend Runtime Release Verifier | `GET /api/platform/version` | Platform Verifier | `commitSha: "95fbcda5c20b5b8..."`, `aligned: true` | **PASS** | Git Engine ➔ API ➔ DOM |
