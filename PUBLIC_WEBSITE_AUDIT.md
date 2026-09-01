# PUBLIC WEBSITE AUDIT & REMEDIATION REPORT
### ResumePilot AI — Senior Frontend Architecture & UX Evaluation
**Environment**: Local Development (`https://ai-resume-builder.local/`)  
**Baseline SHA**: `95fbcda5c20b5b8f0bd0a5b6bc675e57f1ad9c57` (Protected & Unaltered)

---

## 1. Architecture Overview

- **Entry Point**: `src/main.jsx` routes `/` to `<Welcome />` (which renders `<Dashboard2 />`).
- **Design System Namespace**: Scoped strictly under `.rp-public-site` in `src/components/Dashboard2/public-site.css`.
- **Component Decomposition**:
  - `HomepageNavbar.jsx`: Fixed sticky navigation with hover bridge, Escape key dismissal, outside-click detection, and distinct Login vs Register CTAs.
  - `HomepageHero.jsx`: Dynamic character typing animation (5 phrases), live 3-role bullet optimizer (Google XYZ formula), animated ATS score progression (72% ➔ 89% ➔ 98%), and CBT behavioral interview simulation.
  - `HomepageStorySections.jsx`: 4 split-screen product showcases (Work Experience Studio, 98% ATS Parser Audit Engine, Target Job Matcher, AI CBT Simulator with STAR scoring).
  - `HomepageTemplates.jsx`: 51-template catalog derived from `templateCatalog.js`, respecting MariaDB `proCvTemplates` (`Cv1, Cv2, Cv5`), with anonymous inspection and registration-gated builder actions.
  - `HomepagePricing.jsx`: Dynamic pricing bound to MariaDB `system_settings` (`monthlyPrice: ₹199`, INR currency, Razorpay UPI).
  - `Homepagefaqs.jsx`: Searchable accordion.
  - `HomepageFinalCta.jsx`: Gradient conversion banner.
  - `HomepageFooter.jsx`: 15 valid routes / anchor links with MariaDB operational status.

---

## 2. Identified Defect & Root Cause Remediation Log

| Defect ID | Component | Root Cause | Engineering Remediation | Status |
| :--- | :--- | :--- | :--- | :--- |
| **DEF-01** | `HomepageNavbar` | `margin-top: 10px` on flyout menu created mouse dead zone | Replaced margin with `padding-top: 8px` hover bridge in `.rp-dropdown-wrapper` | **FIXED** |
| **DEF-02** | `AuthWrapper` | Hardcoded `isLoggedInShowed: true` ignored `mode="signup"` | Parameterized `initialMode` prop to render `<Register />` on `signup` | **FIXED** |
| **DEF-03** | `HomepageHero` | Static text without animated value proposition | Implemented 5-phrase typing animation with blinking cursor & reduced-motion support | **FIXED** |
| **DEF-04** | `HomepageNavbar` | Standalone "Cover Letter" link diluted core focus | Integrated into Resources/Career tools, focused navbar on Resume Builder & Templates | **FIXED** |
| **DEF-05** | `HomepageTemplates` | Anonymous users had unclear gating on "Use Template" | Gated with Registration modal; authenticated users navigate directly | **FIXED** |
| **DEF-06** | `HomepageFooter` | Broken/missing routes in footer links | Verified and wired all 15 links to valid routes (`/blog`, `/p/privacy-policy`, etc.) | **FIXED** |
| **DEF-07** | `public-site.css` | Global selector leakage risks | Namespaced 100% of rules under `.rp-public-site`; 0% leakage into 14 admin consoles | **FIXED** |

---

## 3. Data Lineage & Backend Authority

1. **Branding**: Sourced from MariaDB `website_meta.title` via `GET /api/platform/public-config`.
2. **Pricing**: Sourced from MariaDB `system_settings` (`subscriptions.monthlyPrice`) via `GET /api/platform/public-config`.
3. **51 Templates**: Sourced from `templateCatalog.js` and MariaDB `templateManager.proCvTemplates`.
4. **Blog Engine**: Sourced from MariaDB `blog_posts` table via `GET /api/blog-data`.
5. **System Health**: Displays authoritative MariaDB backend state (`MariaDB Authoritative • All Systems Operational`).
