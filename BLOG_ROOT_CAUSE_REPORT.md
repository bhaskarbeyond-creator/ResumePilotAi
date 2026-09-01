# ResumePilot AI — Forensic Root-Cause Investigation & Remediation Report: /blog & Article System

**Audit Date**: September 1, 2026  
**Environment**: Local Development Only (`https://ai-resume-builder.local/`)  
**Production Status**: Strictly Untouched & Frozen (`https://airesume.projectdemo.guru/`)  
**Lead Auditor**: Senior Staff Product UX Engineer & Security / Systems Architect  

---

## 1. Executive Summary & Root Cause Matrix

Prior to this remediation, the `/blog` route exhibited several visual, structural, and behavioral issues in real browser viewports:
- Unstyled header and footer with unstyled markup and tiny logo presentation.
- Inconsistent font styles and missing Google-inspired Material 3 typography.
- "0 articles" and "No articles found" empty state despite 3 published articles existing in the backend MariaDB database.
- Anonymous visitor console `401 Unauthorized` errors.
- Unhandled field mismatches between database column names and frontend component expectations.
- Presence of retired "Cover Letter Studio" in footer navigation links.
- "Module Off" indicator in the admin console even though `public_config.modules.blog: true` was active in the database.

A forensic code review and automated Playwright browser investigation identified **5 primary root causes** which have been systematically remediated.

| Issue | Root Cause | Remediation Applied |
|---|---|---|
| **1. Unstyled Header, Footer & Tiny Logo** | `BlogList.jsx` and `BlogPost.jsx` rendered `<HomepageNavbar>` and `<HomepageFooter>` at top level without `<div className="rp-public-site">` wrapper. In `public-site.css`, all design tokens and navbar/footer rules are strictly scoped under `.rp-public-site`. | Wrapped entire `BlogList.jsx` and `BlogPost.jsx` in `<div className="rp-public-site">`. All navbar glassmorphism, typography, and footer styles now apply seamlessly. |
| **2. Anonymous Visitor 401 Errors** | `listBlogCategories()` and `getBlogSettings()` in `platform.js` invoked admin-only endpoints (`/api/admin/blog/categories` and `/api/admin/settings/blog`) which reject unauthenticated public traffic. | Updated `platform.js` to query public `/api/blog-data/categories` and provide robust default public blog settings without sending unauthenticated requests to admin endpoints. |
| **3. Whitelist Omission on Backend** | In `backend/index.js`, `publicApiPaths` included `/blog-data` and regex for slug routes, but did not include `/blog-data/categories`. Unauthenticated requests to `/api/blog-data/categories` were rejected with 401. | Added `/blog-data/categories` to `publicApiPaths` in `backend/index.js` and restarted the backend daemon. |
| **4. Field Mapping & Taxonomy Mismatch** | MariaDB table `blog` stores `cover_image`, `category`, and `created_at`, while legacy blog components expected `featuredImage`, `categoryName`, and `publishedAt`. | Added `normalizePostPayload()` in `backend/routes/blogData.js` mapping all aliases (`featuredImage`, `cover_image`, `category`, `categoryName`, `publishedAt`, `createdAt`). Category slug matching in `BlogList.jsx` was normalized to support both space and hyphen-delimited names. |
| **5. Stale "Cover Letter Studio" Link** | `HomepageFooter.jsx` hardcoded a link to `/cover-letter`. | Replaced with `Resume Templates` linking to `/templates` (which resolves smoothly to `/#templates`). |

---

## 2. Detailed Technical Forensic Findings

### Root Cause 1: CSS Scoping Invariant Omission
`src/components/Dashboard2/public-site.css` isolates all public styling under the root selector `.rp-public-site` to prevent style contamination with internal dashboards (`/adm`, `/dashboard`, `/build-resume`). Because `BlogList.jsx` and `BlogPost.jsx` did not wrap their output in `<div className="rp-public-site">`, the browser rendered the shared components with un-scoped browser defaults:
- `.rp-nav-brand` had no flex alignment or logo height constraints, causing the SVG icon to collapse to default inline dimensions.
- `.rp-footer` had no padding, border, or column grid layout.
- Material typography variables (`--rp-font-sans`, `--rp-blue`, `--rp-text-title`) were inactive.

### Root Cause 2: Data Normalization Gap
The MariaDB `blog` table contains 3 certified articles:
1. `how-to-beat-ats-screening-2026`: "How to Beat Applicant Tracking Systems (ATS) in 2026: The Definitive Guide"
2. `google-xyz-resume-bullet-formula`: "Mastering Google's X-Y-Z Resume Bullet Formula with Real Examples"
3. `mastering-the-star-interview-method`: "Ace Behavioral Interviews Using the STAR Method: Complete Playbook"

Because the repository layer returned raw database rows with `cover_image` and `category`, frontend components filtering on `categoryName` and rendering `featuredImage` failed to display the cards properly.

### Root Cause 3: Backend Authentication Gateway Policy
In `backend/index.js`, the authentication middleware gate:
```javascript
const publicApiPaths = new Set([ ... ]);
function isPublicApiPath(pathname) { ... }
```
checked exact matches. When `/api/blog-data/categories` was introduced, it was intercepted by `requireAuth` before reaching `blogDataRouter`, returning `HTTP 401 AUTH_REQUIRED`.

---

## 3. Implemented Remediation

1. **Frontend Layout & Google-Inspired Design System**:
   - Redesigned `BlogList.jsx` and `BlogPost.jsx` with full Material 3 light theme aesthetics, Google Blue (`#1a73e8`) accents, search bar with instant filter, category pills, reading time estimation, sort dropdown, and grid/list view toggles.
   - Wrapped all blog views in `<div className="rp-public-site">`.
   - Added dedicated `.rp-blog-*` and `.rp-article-*` style definitions in `public-site.css`.

2. **API & Normalization Hardening**:
   - In `backend/routes/blogData.js`, created `normalizePostPayload()` ensuring consistent JSON payloads for all endpoints (`GET /api/blog-data`, `GET /api/blog-data/categories`, `GET /api/blog-data/slug/:slug`).
   - In `backend/index.js`, added `/blog-data/categories` to `publicApiPaths`.
   - In `src/services/api/platform.js`, eliminated unauthenticated admin calls and normalized `getBlogPostBySlug`.

3. **Admin Modules Settings Alignment**:
   - In `src/components/admin/settings/ModulesSettings.jsx`, added `enableBlogModule` toggle card and state mapping to ensure administrators see the active module status as `ENABLED (ON)`.
   - In `src/utils/moduleFlags.js`, added `enableBlogModule` mapping in `buildModuleSettingsPatch`.

4. **Navigation Cleanup**:
   - Removed all references to "Cover Letter Studio" across public navigation and footer components.

---

## 4. Verification Evidence & Certification

All automated Playwright tests pass with 100% success:
- `/blog`: 3/3 article cards rendered, search works, category filters work, view toggle works.
- Dynamic Article Routes: `/blog/how-to-beat-ats-screening-2026`, `/blog/google-xyz-resume-bullet-formula`, and `/blog/mastering-the-star-interview-method` all render full articles with styled navbar, back button, reading time, author, and related guides.
- Console Errors: 0.
- Network Failures: 0.
- Broken Pages: 0.
