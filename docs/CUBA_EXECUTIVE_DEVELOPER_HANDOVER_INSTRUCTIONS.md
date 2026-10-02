# IME365 — Cuba Executive UI/UX Master Developer Brief & Execution Directive
**Version:** 1.0.0 (Production-Certified)  
**Author:** Lead AI Software Architect & System Reviewer  
**Target Developer:** Senior Frontend / Full-Stack Engineer  
**Status:** Ready for Execution & Implementation  

---

## 1. Executive Mission & Context

You are tasked with executing the final, production-grade UI/UX transformation of **IME365** across its four primary portal surfaces:
1. **Candidate Workspace** (`/dashboard`, `/dashboard/resumes`, `/dashboard/jobs`, `/dashboard/interviews`, etc.)
2. **Recruiter / Employer Portal** (`/employer`, `/employer/jobs`, `/employer/applicants`, etc.)
3. **Enterprise Organization Console** (`/org/:slug`, `/org/:slug/users`, `/org/:slug/ai`, etc.)
4. **Platform Admin Command Center** (`/admin/dashboard`, `/admin/health`, etc.)

The design standard is **100% authentic Cuba Modern Executive Glassmorphism**, directly inspired by the official Cuba dashboard suite (`dashboardTemplate/cuba-tailwind` and `cuba-react-next`). 

### Core Product Positioning:
> **IME365 is an elite, AI-native Career & Executive Intelligence Platform.**  
> It must NOT look or feel like a generic CRM, flat Bootstrap dashboard, or cheap admin template. It must inspire total trust, executive polish, and modern intelligence.

---

## 2. Hard Invariants (Zero Exceptions)

Before touching a single file, memorize these absolute system invariants:

1. **Resume Templates & ATS Engine are 100% FROZEN (`git diff = 0`)**:
   - Never modify `src/components/Resume/docxParityMatrix.js`, `TemplateRenderer.jsx`, `exportService.js`, `atsScore.js`, or any of the 51 resume templates (`src/components/templates/Cv*.jsx`).
   - All 51 templates, ATS scoring math, DOCX high-fidelity export, and PDF rendering must remain untouched.
2. **Zero Simulated Latency & Zero Fabricated Telemetry**:
   - Never inject artificial `setTimeout` delays or mock metrics where live APIs exist.
   - If an endpoint returns loading or an empty array, render the authentic loading/empty state. Never synthesize fake users, fake companies, or fake revenue.
3. **Strict Rollout Safety (§49)**:
   - All Cuba portal shells must support backward compatibility and opt-in toggles (`isCubaShellEnabled()`, query params `?cuba=1` / `?cuba=0`, and `localStorage`).
   - Default shell components must initialize with `React.useState(false)` on first paint to avoid silent hydration mismatch or unauthenticated bypass.
4. **Security & Token Protection (§34, §7)**:
   - Secret API keys (NVIDIA, Gemini, OpenAI) and tokens must never appear in client bundles, logs, or unmasked DOM elements.
   - Never weaken or alter Firebase Auth, TOTP MFA gates, or RBAC route guards (`RequireTabPerm`, `RequireAuthenticated`).

---

## 3. Key Observations & Lessons from Playwright Audits

During our end-to-end browser inspections and Playwright audits, several critical findings were documented. Study these carefully to avoid repeating visual and structural defects:

### Observation A: Stat Card Overlap & Layout Breakdown
- **Defect Discovered:** Placing the circular dashed icon bubble, count value, metric label, and trend pill in a single horizontal row caused badges (e.g. `Market Ready`, `Drills available`) to collide and superimpose directly over metric numbers (`78%`, `Ready`) on viewport widths under 1400px.
- **Root Cause:** Narrow card columns (250px–320px) cannot accommodate 4 inline elements horizontally.
- **Mandatory Pattern:** Use a **2-row vertical stack**:
  - **Top Row (Header):** Circular dashed icon bubble on the left (`w-10 h-10 rounded-full border border-dashed flex items-center justify-center`) + Trending badge pill on the right (`px-2.5 py-0.5 rounded-full text-xs font-semibold`).
  - **Bottom Row (Data):** Metric value (`text-3xl font-bold font-rubik tracking-tight`), uppercase metric label (`text-xs font-medium uppercase tracking-wider text-cuba-muted`), and hint text (`text-xs text-cuba-subtext truncate`).

### Observation B: Resume Cards & Button Modernization
- **Defect Discovered:** Generic black/slate buttons (`bg-slate-900`) and a clunky 4-button vertical stack made the candidate workspace feel like a cheap generic template.
- **Mandatory Pattern:**
  - Container: `rounded-[15px] border border-cuba-line bg-cuba-card shadow-[0_9px_20px_rgba(46,35,94,0.07)] hover:shadow-[0_14px_28px_rgba(46,35,94,0.12)] hover:-translate-y-1 transition-all duration-300`.
  - Buttons: Use Cuba primary button (`.cuba-btn-primary`: violet gradient `#7366ff` -> `#5949d6`, hover glow, active scale) and outline button (`.cuba-btn-outline`).
  - Action Layout: Full-width `Edit Resume` CTA + 2-column export row (`PDF` and `Word`) + `Share Resume` subtle button.

### Observation C: Tailwind v4 Token Compatibility
- **Technical Gotcha:** Tailwind v4 in this repository processes CSS via `@theme` directives and native CSS variables in `src/styles/cuba-tokens.css`, rather than legacy `tailwind.config.js` colors.
- **Mandatory Pattern:** Always utilize Cuba utility classes and tokens defined in `src/styles/cuba-tokens.css`:
  - `bg-cuba-canvas`, `bg-cuba-card`, `border-cuba-line`, `text-cuba-text`, `text-cuba-muted`, `text-cuba-primary`.
  - `.cuba-widget-texture`: Wave texture background from `/images/dashboard/widget-bg.png`.
  - `.cuba-btn-primary`, `.cuba-btn-outline`, `.cuba-btn-secondary`.

### Observation D: Accessibility Landmark Collisions
- **Defect Discovered:** Multiple `<nav>` elements without accessible names caused Playwright's `getByRole('navigation')` to throw strict-mode violation errors.
- **Mandatory Pattern:** Every portal navigation bar MUST include an explicit `aria-label`:
  - Candidate: `<nav aria-label="Candidate workspace navigation">`
  - Recruiter: `<nav aria-label="Employer navigation">`
  - Enterprise: `<nav aria-label="Organization navigation">`
  - Admin: `<nav aria-label="Platform admin navigation">`

---

## 4. Google-Inspired Color Schema & Authentic Cuba Tokens (NO RANDOM COLORS)

> 🎨 **STRICT COLOR RULE:** Absolutely **NO RANDOM COLORS** (no arbitrary purples, random neon greens, uncurated hexes, or generic `bg-slate-900`). Every single color across all 4 portals must strictly follow the **Google Material 3 / Google Workspace / Google Cloud** canonical color system, mapped to semantic Cuba executive roles.

### A. Google-Inspired Canonical Semantic Palette:

| Semantic Role | Google Reference | Light Mode Hex | Dark Mode Hex | Soft Background Tint (Light) | Purpose / Usage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Primary Action** | Google Blue (M3 / Cloud) | `#1a73e8` / `#0b57d0` | `#8ab4f8` | `rgba(26, 115, 232, 0.08)` (`#e8f0fe`) | Primary buttons, active nav pills, focus rings |
| **AI / Gemini Signature** | Google Gemini Aurora | `linear-gradient(135deg, #1a73e8 0%, #7c3aed 100%)` | `linear-gradient(135deg, #8ab4f8 0%, #b388ff 100%)` | `rgba(124, 58, 237, 0.08)` | AI Career Briefing, AI status badge, AI coach |
| **Success / Verified** | Google Green 600 | `#1e8e3e` (`#34a853`) | `#81c995` | `rgba(30, 142, 62, 0.10)` (`#e6f4ea`) | Market Ready, healthy badges, pass benchmarks |
| **Warning / Attention** | Google Yellow / Amber | `#b06000` (`#f9ab00`) | `#fdd663` | `rgba(249, 171, 0, 0.12)` (`#fef7e0`) | Action needed, pending verification, medium score |
| **Danger / Critical** | Google Red 600 | `#d93025` (`#ea4335`) | `#f28b82` | `rgba(217, 48, 37, 0.10)` (`#fce8e6`) | Errors, destructive actions, DLQ alerts, low score |
| **Info / Secondary** | Google Cyan / Deep Sky | `#0b57d0` | `#a8c7fa` | `rgba(11, 87, 208, 0.08)` | System info, neutral discovery pills |

### B. Google Workspace Neutral Surfaces & Typography:
- **Canvas Background (Light):** `#f8fafd` / `#f4f5f9` (Google Workspace light neutral canvas; never stark `#fff` or blinding grey).
- **Card / Elevated Surface (Light):** `#ffffff` with Google/Cuba subtle outline (`#dadce0` / `#dfe3ee`) and elevation `0 1px 3px rgba(60,64,67,0.08), 0 4px 8px rgba(60,64,67,0.05)`.
- **Canvas Background (Dark):** `#131314` / `#1d1e26` (Google Gemini dark surface; deep, eye-friendly charcoal).
- **Card / Elevated Surface (Dark):** `#1e1f20` / `#262932` with dark outline (`#3c4043` / `#2f3341`).
- **High-Emphasis Ink (Text):** `#202124` (Light) / `#f1f3f4` (Dark) — guaranteed >= 7:1 contrast ratio.
- **Medium-Emphasis Ink (Muted Text):** `#5f6368` (Light) / `#9aa0a6` (Dark) — guaranteed >= 4.5:1 WCAG AA.

### C. Typography Standards:
- **Headings & Metric Numbers:** `Rubik, sans-serif` (`font-rubik`) — clean, geometric, executive feel.
- **Body & Controls:** `Roboto, sans-serif` (`font-roboto`) — official Google typography standard.

### D. Authentic Dashboard Visual Assets:
All 10 authentic Cuba images are present in `public/images/dashboard/`:
- `widget-bg.png`: Subtle organic wave pattern for stat card backgrounds.
- `cartoon.svg`: Sitting character with laptop for candidate welcome hero.
- `folder.png`, `folder1.png`, `bg-1.png`, `bg-2.png`, `bg-3.png`, `profile.png`, `purchase1.png`, `papernote.jpg`.

---

## 5. Scope of Work (What the Developer Must Do)

### Task 1: Complete Sub-page Polish Across Candidate Workspace
- **Target Files:**
  - `src/components/Dashboard/DashboardHomepage/DashboardHomepage.jsx`
  - `src/components/Dashboard/DashboardPortfolios/DashboardPortfolios.jsx`
  - `src/components/Dashboard/DashboardInterviews/DashboardInterviews.jsx`
  - `src/components/JobsListings/MainJobListings.jsx` & `JobCard.jsx`
- **Requirements:**
  1. Verify all cards use the Cuba card elevation (`rounded-[15px]`, `border-cuba-line`, subtle shadow).
  2. Replace any lingering `bg-slate-900`, `bg-black`, or raw Tailwind generic colors with Cuba semantic tokens.
  3. Ensure filter pills, search bars, and dropdown menus match the rounded-full Cuba executive design.

### Task 2: Recruiter / Employer Portal Elevation
- **Target Files:**
  - `src/components/EmployerPortal/EmployerPortal.jsx`
  - `src/components/EmployerPortal/CubaEmployerPortal.jsx`
  - `src/components/EmployerPortal/components/*`
- **Requirements:**
  1. Verify the 4 overview stat cards match the 2-row layout with zero badge collisions.
  2. Polish the Requisitions table and Applicant ATS Pipeline with rounded Cuba table styling and soft badge tones.
  3. Ensure company registration and job posting modals use Cuba glassmorphic headers and backdrop blurs.

### Task 3: Enterprise Organization Console Polish
- **Target Files:**
  - `src/enterprise/EnterpriseConsole.jsx`
  - `src/enterprise/CubaEnterpriseConsole.jsx`
  - `src/enterprise/components/*`
- **Requirements:**
  1. Polish the AI Quota Usage ring ensuring it never renders fabricated usage or zero on loading.
  2. Align IAM member tables, team drawers, and security posture cards with Cuba border and spacing conventions.

### Task 4: Responsive & Mobile Excellence
- Test and verify layouts across 5 canonical breakpoints:
  - Mobile (375px)
  - Mobile Landscape / Tablet (768px)
  - Small Laptop (1024px)
  - Desktop (1280px)
  - Ultra-Wide (1920px)
- Requirements: Zero horizontal scrolling, proper drawer collapse on mobile, touch-friendly CTA hit targets (minimum 44x44px).

---

## 6. Verification Pipeline & Mandatory Commands

You must run the following exact verification commands and ensure **100% pass rates (0 failures, 0 errors)** before submitting:

```bash
# 1. Run all Cuba design system & portal unit tests (147+ tests must pass)
node --test tests/cuba-design-system.test.mjs tests/cuba-candidate-portal.test.mjs tests/cuba-employer-portal.test.mjs tests/cuba-enterprise-console.test.mjs tests/cuba-admin-console.test.mjs tests/cuba-public-and-certification.test.mjs

# 2. Run the Playwright 4-Portal End-to-End Suite (20/20 must pass)
npx playwright test tests/four-portal-e2e.spec.js

# 3. Run the Static Security & Architecture Test Suite (44+ tests must pass)
npm run test:security:static

# 4. Run the 51 Frozen Template Quality Gate (Must remain 100% unregressed)
node --test tests/template-data.test.mjs tests/template-render.test.mjs tests/template-quality-gate.test.mjs tests/template-differentiation.test.mjs

# 5. Build the Production Vite Bundle (Must exit code 0)
npm run build

# 6. Capture Authorized Playwright Visual Audit Screenshots
node scripts/playwright-cuba-audit.mjs
```

---

## 7. Mandatory Runtime Screenshot Inspection & Forensic Visual Audit Protocol

> ⚠️ **CRITICAL WARNING:** Running `scripts/playwright-cuba-audit.mjs` and seeing `Exit code 0` is NOT enough! You MUST physically open/view each captured PNG image file in `test-results/cuba-audit-screenshots/` during runtime to inspect the rendered UI with your own eyes before requesting review.

For **EVERY** generated screenshot, execute this mandatory 6-point forensic inspection:

1. **Overlap & Collision Forensics**:
   - Inspect every stat card: ensure badges (e.g. `Market Ready`, `Drills available`, `2 in workspace`) NEVER overlap or collide with metric numbers (`78%`, `Ready`, `2`).
   - Inspect header action bars: ensure buttons and status badges have minimum 12px horizontal breathing room.
2. **Text Clipping & Truncation Forensics**:
   - Check card headers, metric sub-labels, and requisition rows for unexpected ellipses (`...`) or clipped text.
   - Verify that tables and cards do not trigger unwanted horizontal scrollbars.
3. **Color & Theme Authenticity**:
   - **Light Mode (`02-dashboard-overview-light.png`):** Canvas background must be `#f4f5f9`, cards `#ffffff`, borders `#f0f2f8`, primary buttons Cuba violet gradient (`#7366ff` -> `#5949d6`).
   - **Dark Mode (`02-dashboard-overview-dark.png`):** Canvas must be deep navy `#1d1e26`, cards `#262932`, borders `#2f3341`, text readable with high contrast.
   - **Zero Generic Slates:** Confirm NO `bg-slate-900` or raw black buttons remain on candidate or recruiter screens.
4. **Authentic Asset Rendering**:
   - Candidate Hero: The character vector illustration (`cartoon.svg`) must render cleanly.
   - Dynamic Analog Clock: The clock face widget must render with dynamic hour, minute, and second hands displaying the actual live time.
   - Stat Cards: The subtle organic wave texture (`widget-bg.png`) must be visible in card backgrounds.
5. **Real-Data & State Honesty**:
   - Ensure zero placeholder/synthetic text is rendered when live data is available.
   - If a metric is 0 or loading, verify it shows authentic 0 or loading skeleton, never a fabricated mock value.
6. **Responsive Layout Discipline**:
   - Check that grids collapse cleanly from 4-columns to 2-columns and 1-column without content squishing.

---

## 8. Submission Contract (Required Evidence for Senior Review)

When you complete your implementation, you must submit a **Structured Handover Report** containing the following evidence:

```markdown
### 📋 Developer Task Completion Handover & Review Request

#### 1. Objectives Completed
- [x] [Specific feature / visual component polished]
- [x] [Specific component updated to Cuba design tokens]
- [x] [Responsive viewport validated]

#### 2. Test & Verification Proofs
- **Cuba Unit Test Suites**: `147 / 147 passed` (Output snippet + execution time)
- **Playwright E2E 4-Portal Suite**: `20 / 20 passed` (Output snippet + execution time)
- **Static Security Suite**: `44 / 44 passed` (Output snippet)
- **Template Frozen Gate**: `Zero regressions across all 51 templates`
- **Vite Production Build**: `Exit code 0` (Build bundle size + time)

#### 3. Runtime Forensic Visual Inspection Evidence
- **Confirmation:** Confirmed that all PNGs in `test-results/cuba-audit-screenshots/` were physically opened and inspected at runtime.
- **Screenshot Inspection Findings:**
  - `02-dashboard-overview-light.png`:
    - Overlap Check: Verified zero badge/metric collisions in all 4 stat cards (icon & badge top row, numbers bottom row).
    - Asset Check: Verified dynamic clock hands show real time, cartoon vector illustration renders crisp.
    - Color Check: Verified `#f4f5f9` canvas, elevated card shadow, Cuba violet `#7366ff` action buttons.
  - `02-dashboard-overview-dark.png`:
    - Contrast Check: Verified deep navy `#1d1e26` canvas, clear `#262932` card borders, high text readability.
  - `02-dashboard-resumes-grid-light.png`:
    - Button Check: Verified `.cuba-btn-primary` violet gradient buttons, clean 2-column export actions (PDF/Word), no black slate buttons.
  - `04-recruiter-employer-portal.png`:
    - Table & Cards: Verified 4 stat cards, clean requisitions rows, no horizontal overflow.
  - `05-platform-admin-command-center.png`:
    - Telemetry Check: Verified genuine platform metrics, health score indicators (`98 HEALTH`, `5 RISK`), zero fake data.
  - `06-dashboard-jobs.png`:
    - Search & Filter: Verified rounded-full filter pills, job card tags, search input alignment.
  - `07-enterprise-console.png`:
    - Ring & Tenant: Verified AI quota ring renders honest measured data, tenant badge and tabs render clean.

#### 4. Files Modified (with exact git diff --stat)
- Provide exact output of `git diff --stat`.
- Confirm `git diff src/components/Resume/` and template files are strictly 0.

#### 5. Known Trade-Offs or Open Items for Senior Architect Review
- [Any specific design decision or trade-off you want reviewed]
```

---
*Follow this brief to the letter. Once submitted with complete evidence, the Lead Architect will perform the final review and certify production release.*
