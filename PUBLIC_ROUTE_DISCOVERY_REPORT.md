# ResumePilot AI — Public Route Discovery & Inventory Report

**Audit Date**: September 1, 2026  
**Environment**: Local Development Only (`https://ai-resume-builder.local/`)  
**Production Status**: Untouched & Frozen (`https://airesume.projectdemo.guru/`)  

---

## 1. Route Discovery Methodology

To ensure 100% test coverage and zero dead links across the entire public marketing application:
1. Automated Playwright DOM spider traversed all anchor elements (`<a href="...">`) and React Router links (`<Link to="...">`) starting from `/`.
2. Extracted and normalized internal paths, eliminating external protocols and tracking parameters.
3. Spidered the `/blog` index to discover all published dynamic article slugs from MariaDB.
4. Crawled legal/policy alias routes (`/p/*`, `/terms`, `/privacy`, `/cookies`, `/about`).
5. Audited career resource entry points (`/jobs/*`, `/portfolios`, `/pricing`, `/contact`, `/templates`).

---

## 2. Complete Inventory of Discovered Routes (32 Destinations)

| # | Route URI | Page Category | Component Handler | Target State |
|---|---|---|---|---|
| 1 | `/` | Homepage | `src/components/Dashboard2/DashboardHomepage.jsx` | Full Google-inspired Landing Page |
| 2 | `/blog` | Career Knowledge Hub | `src/components/Blog/BlogList/BlogList.jsx` | Blog Index with search/filters |
| 3 | `/pricing` | Commercial Plans | `src/components/Plans/Plans.jsx` | Monthly/Annual/Lifetime Tiers |
| 4 | `/contact` | Support & Inquiries | `src/components/Contact/Contact.jsx` | Interactive Contact Form |
| 5 | `/p/privacy-policy` | Legal Policy | `src/components/CustomePage/CustomePage.jsx` | Authoritative Privacy Document |
| 6 | `/p/terms-of-service` | Legal Agreement | `src/components/CustomePage/CustomePage.jsx` | Authoritative Terms of Service |
| 7 | `/p/cookie-policy` | Legal Compliance | `src/components/CustomePage/CustomePage.jsx` | Cookie Policy Document |
| 8 | `/p/about-us` | Company Info | `src/components/CustomePage/CustomePage.jsx` | About ResumePilot AI |
| 9 | `/features` | Product Capabilities | `src/components/Features/Features.jsx` | Core Feature Overview |
| 10 | `/jobs` | Job Portal Landing | `src/components/Jobs/JobsLanding.jsx` | Career Search Engine |
| 11 | `/jobs/portal` | Job Portal Main | `src/components/Jobs/MainJobListings.jsx` | Job Board Listings |
| 12 | `/jobs/browse` | Job Directory | `src/components/Jobs/MainJobListings.jsx` | Category Browse Portal |
| 13 | `/jobs/categories` | Job Taxonomy | `src/components/Jobs/MainJobListings.jsx` | Role Classifications |
| 14 | `/portfolios` | Portfolio Gallery | `src/components/Portfolios/PortfoliosGallery.jsx` | Web Portfolio Directory |
| 15 | `/login` | Authentication Gate | `src/components/AuthWrapper/AuthWrapper.jsx` | Sign In Modal / Form |
| 16 | `/sign-up` | Authentication Gate | `src/components/AuthWrapper/AuthWrapper.jsx` | Registration Modal / Form |
| 17 | `/templates` | Template Catalog | `src/components/Dashboard2/DashboardHomepage.jsx#templates` | 51 ATS Resume Templates |
| 18 | `/faq` | Help Center | `src/components/Dashboard2/DashboardHomepage.jsx#faqs` | Frequently Asked Questions |
| 19 | `/faqs` | Help Center Alias | `src/components/Dashboard2/DashboardHomepage.jsx#faqs` | Frequently Asked Questions |
| 20 | `/plans` | Pricing Alias | `src/components/Plans/Plans.jsx` | Pricing & Subscription Plans |
| 21 | `/career-resources` | Knowledge Alias | `src/components/Blog/BlogList/BlogList.jsx` | Career Blog Hub |
| 22 | `/privacy` | Legal Alias | `src/components/CustomePage/CustomePage.jsx` | Privacy Policy Redirect |
| 23 | `/terms` | Legal Alias | `src/components/CustomePage/CustomePage.jsx` | Terms of Service Redirect |
| 24 | `/cookies` | Legal Alias | `src/components/CustomePage/CustomePage.jsx` | Cookie Policy Redirect |
| 25 | `/about` | Company Alias | `src/components/CustomePage/CustomePage.jsx` | About Us Redirect |
| 26 | `/about-us` | Company Alias | `src/components/CustomePage/CustomePage.jsx` | About Us Redirect |
| 27 | `/enterprise` | Enterprise Portal | `src/components/Enterprise/EnterpriseConsole.jsx` | Multi-Tenant Workspace Gate |
| 28 | `/portfolio/builder` | Portfolio Creation | `src/components/Portfolio/PortfolioBuilder.jsx` | Interactive Portfolio Studio |
| 29 | `/blog/how-to-beat-ats-screening-2026` | Dynamic Article | `src/components/Blog/BlogPost/BlogPost.jsx` | ATS Screening Guide |
| 30 | `/blog/google-xyz-resume-bullet-formula` | Dynamic Article | `src/components/Blog/BlogPost/BlogPost.jsx` | Google X-Y-Z Formula Guide |
| 31 | `/blog/mastering-the-star-interview-method` | Dynamic Article | `src/components/Blog/BlogPost/BlogPost.jsx` | STAR Behavioral Interview Guide |
| 32 | `/#faqs` | Anchor Section | `src/components/Dashboard2/DashboardHomepage.jsx#faqs` | Smooth Scroll FAQ Section |

---

## 3. Discontinued / Retired Routes Quarantined

- **`/cover-letter`**: Completely removed from all public headers, footers, dropdowns, and cards. (Internal resume builder integration remains intact without polluting public navigation).
- **`/cms-pages` / `/cms-pages/*`**: Contractually returns `HTTP 410 GONE` per certified data abstraction layer specifications.
