# IME365 100% Platform-Wide UI/UX Transformation Blueprint
## Enterprise Cuba Modern Executive Glassmorphism + AI-Native Career Intelligence Platform

**Document Version:** 4.0.0 (Synchronized Master Architecture Specification)  
**Status:** Certified Architecture & Execution Specification  
**Authority:** Governed by `docs/CUBA_10_OUT_OF_10_DEVELOPER_PROMPT.md` (54-Section Master Directive)  
**Scope:** 100% Complete IME365 Ecosystem (Public Frontend + Creation Workspaces + 4 Authenticated Portals)  
**Selected Presentation Standard:** **Cuba Modern Executive Glassmorphism (Vibrant Indigo & Adaptive Obsidian)**  
**Reference Source Assets:** `D:\xampp\htdocs\IME365\dashboardTemplate\` (`cuba-tailwind` & `cuba-react-next`)

---

## 1. Selected Best Presentation Standard

The **Cuba Modern Executive Glassmorphism** variant is the platform's definitive presentation standard.

### 1.1 Core Visual Identity
- **Primary Accent**: Signature Electric Indigo (`#7366ff`) paired with soft royal gradient (`linear-gradient(135deg, #7366ff 0%, #5949d6 100%)`).
- **Semantic Accents**:
  - Success / ATS High: Fresh Emerald (`#65c15c`)
  - Info / Actions: Electric Sky (`#40b8f4`)
  - Warning / Alert: Warm Amber (`#f3d04f`)
  - Danger / Error: Vivid Crimson (`#ff4c52`)
  - Highlight / Premium: Radiant Rose (`#f73164`)
- **Surfaces & Elevation**:
  - Light Canvas: Soft crisp pearl (`#f8f9fa`) with white (`#ffffff`) card elevations.
  - Dark Canvas: Deep adaptive obsidian (`#15181f`) with elevated card slate (`#1e222d`).
  - Card Architecture: `rounded-2xl border border-gray-100 dark:border-gray-800/80 shadow-sm hover:shadow-md transition-all duration-200`.
  - App Bars & Headers: Frosted glassmorphism (`backdrop-blur-md bg-white/85 dark:bg-[#1e222d]/85 border-b border-gray-100 dark:border-gray-800`).
- **Typography & Rhythm**:
  - Heading Font: Geometric & modern sans-serif (`Inter`, `Rubik`, or system sans).
  - High typographic hierarchy, clean letter-spacing (`tracking-tight` on headings), muted meta labels (`text-gray-500 text-xs font-medium uppercase tracking-wider`).
- **Micro-Interactions**:
  - Micro-lift hover animations (`hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200 ease-out`).
  - Live glowing status indicators (pulsing beacon dots on active sessions, queues, and alerts).
  - Shimmer skeleton loaders during asynchronous data fetching.

### 1.2 The AI-Native Experience Layer (Unmistakable AI Sensory Signatures)
1. **Ambient AI Aurora & Glowing Borders**: Radial violet/cyan ambient glows (`linear-gradient(135deg, rgba(115, 102, 255, 0.12), rgba(64, 184, 244, 0.12))`) with iridescent border highlights on all AI generation widgets.
2. **AI Telemetry & Model Status Pill**: Top navigation features an active `✦ AI Engine Online` beacon. Latency (e.g. `240ms`) is displayed **ONLY** when derived from real telemetry; never fabricated or hardcoded.
3. **Real Streaming Synthesis**: Where the backend streams output, render progressively with a dynamic cursor (`|`). No simulated fake typewriter dumps. Clearly distinguish: Thinking, Generating, Completed, Failed.
4. **Living Voice AI Orb**: The Live Interview Coach visualizer features a dynamic, breathing radial orb reflecting real microphone states (Idle, Listening, User Speaking, AI Thinking, AI Speaking, Error).
5. **Personalized AI Career Briefing**: The candidate dashboard welcome banner serves as an actionable career briefing. All data (match scores, job counts) must be dynamically derived; never hardcoded.
6. **AI Command Spotlight (`Cmd+K`)**: Global search bar spotlights quick AI actions (`✦ Tailor Resume for URL`, `✦ Start Voice Mock Interview`, `✦ Audit ATS Keywords`).

---

## 2. Universal Information Architecture & Easy Standard Navigation Framework

Every authenticated portal is housed inside the **Single Universal App Shell (`CubaAppShell.jsx`)**:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ TOP HEADER (Glassmorphic, Sticky, Height: 70px)                                        │
│ [☰ Toggle]  Breadcrumbs: Portal > Section > Page    [🔍 Search Cmd+K]  [🔔] [🌓] [👤 Profile] │
├────────────────────────┬───────────────────────────────────────────────────────────────┤
│ SIDEBAR (Width: 260px) │ MAIN CONTENT STAGE (Max-Width: 7xl, Responsive Padding: px-6) │
│                        │                                                               │
│ 🏢 Workspace Switcher   │ ┌───────────────────────────────────────────────────────────┐ │
│ [Candidate / Recruiter/│ │ Page Header: Title + Subtitle           [+ Primary Action]│ │
│  Enterprise / Admin]   │ └───────────────────────────────────────────────────────────┘ │
│                        │                                                               │
│ ▼ MAIN                 │ ┌──────────────┬──────────────┬──────────────┬──────────────┐ │
│  • Overview            │ │ Stat Card 1  │ Stat Card 2  │ Stat Card 3  │ Stat Card 4  │ │
│                        │ └──────────────┴──────────────┴──────────────┴──────────────┘ │
│ ▼ APPLICATIONS         │                                                               │
│  • Resumes & CV        │ ┌─────────────────────────────┬─────────────────────────────┐ │
│  • Cover Letters       │ │ Main Content Widget / Chart │ Data Table / Activity Stream│ │
│  • Interview Coach     │ │                             │                             │ │
│                        │ └─────────────────────────────┴─────────────────────────────┘ │
│ ▼ SETTINGS             │                                                               │
│  • Profile & Security  │                                                               │
└────────────────────────┴───────────────────────────────────────────────────────────────┘
```

### 2.1 The Standardized Cuba Sidebar Specification
1. **Dimensions**: Desktop width `260px` (standard) / `72px` (collapsed icon-only mode). Mobile: Slide-in overlay drawer with backdrop blur.
2. **Unified Workspace / Persona Switcher**: Top selector showing active persona (`Candidate`, `Recruiter`, `Enterprise Admin`, `SuperAdmin`). 1-click switching between authorized portals.
3. **Structured Category Sections**: Categorized with clean, muted uppercase headers (`OVERVIEW`, `WORKSPACE`, `INTELLIGENCE`, `SECURITY & SYSTEM`).
4. **Active State Highlight**: Signature Cuba Indigo pill background (`bg-[#7366ff] text-white shadow-sm font-semibold rounded-xl`).
5. **Real-Time Notification Badges**: Pill chips indicating unread messages, new applicants, or pending approvals.
6. **Accordion Sub-Menus**: Smooth expandable sub-items for multi-step tools or settings.

### 2.2 The Standardized Cuba Top Header Specification
1. **Height & Position**: Sticky `h-[70px]`, frosted glassmorphism (`backdrop-blur-md bg-white/85 dark:bg-[#1e222d]/85 border-b border-gray-100 dark:border-gray-800`).
2. **Left Column**: Sidebar toggle button (`Feather` menu icon) + Dynamic Breadcrumbs.
3. **Center Column**: Global Command Palette trigger input (`Cmd+K`).
4. **Right Column**: Live API health beacon, Dark/Light mode toggle, Notification bell with pulse, Persona badge, User Profile dropdown.

### 2.3 The Standardized Main Content Stage Specification
1. **Universal Page Header**: H1 Title (`text-2xl font-bold tracking-tight text-gray-900 dark:text-white`) + Subtitle description (`text-sm text-gray-500 mt-1`) + Right-aligned primary CTA slot.
2. **Strict Grid & Gutter Alignment**: `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8`, 12-column responsive layout (`gap-6`), 4px Tailwind spacing scale.

---

## 3. Tier-by-Tier 1:1 Component Transformation Mapping

### 3.1 Tier 1: Public Frontend & Marketing Presentation
| Module | Source Files | Cuba Reference | High-Impact Visual Transformation |
| :--- | :--- | :--- | :--- |
| **Public Navbar** | `src/components/Front/Header.jsx` | `cuba-tailwind/template/assets/post_css/` | Sticky glassmorphic navbar with logo, dynamic navigation links, theme toggle, and Cuba gradient CTA buttons ("Build My Resume", "Sign In"). |
| **Landing Hero** | `src/components/Front/Hero.jsx` | `cuba-tailwind/template/index.html` | Ultra-clean hero section with subtle gradient glow, animated value proposition, live stats pill, and interactive resume preview mockup. |
| **Feature Grid** | `src/components/Features/` | `cuba-tailwind/template/basic-card.html` | 3D-feel feature cards with Cuba soft-tint icon bubbles, clean typography, and hover micro-lifts. |
| **Template Showcase** | `src/components/cv-templates/` | `cuba-tailwind/template/product-grid.html` | Filterable template browser with category pills (Modern, Executive, Creative, Tech), hover zoom effect, and 1-click preview modal. |
| **Pricing Matrix** | `src/components/Billing/` | `cuba-tailwind/template/pricing.html` | Elevated tiered pricing cards with "Popular" gradient badge, feature checklists with emerald checkmarks, and instant checkout trigger. |
| **Auth Modals / Pages** | `src/components/auth/` | `cuba-tailwind/template/login.html` & `register_wizard.html` | Clean centered auth card with social OAuth pills, floating labels, password visibility toggle, and instant error shake feedback. |
| **Public Footer** | `src/components/Front/Footer.jsx` | `cuba-tailwind/template/assets/` | Structured 4-column footer with newsletter signup, platform links, security badges, and theme switcher. |

### 3.2 Tier 2: Product Builder Shells & Creation Workspaces
| Module | Source Files | Cuba Reference | High-Impact Visual Transformation |
| :--- | :--- | :--- | :--- |
| **Resume Builder Shell** | `src/components/BuildResume/BuildResume.jsx` | `cuba-tailwind/template/register_wizard.html` & `project-details.html` | Sleek 11-step progress stepper with completed checkmarks, sticky action header (Download, Preview, AI Score), and smooth step transitions. |
| **Cover Letter Builder** | `src/components/CoverLetter/` | `cuba-tailwind/template/quilleditor.html` | Split-screen workspace: AI generation prompt controls on the left, live unclipped A4 document preview on the right. |
| **Portfolio & WebCV Builder**| `src/components/PortfolioBuilder/` | `cuba-tailwind/template/user-profile.html` | Modern block-based portfolio builder with drag-and-drop handles, theme palette picker, and live responsive preview switch (Desktop/Mobile). |
| **Job Search Explorer** | `src/components/JobsListings/` | `cuba-tailwind/template/candidates.html` | Clean job search bar with filter drawers, verified employer badges, salary tag chips, and 1-click AI application modal. |

### 3.3 Tier 3: Candidate Dashboard & Employer Portal
| Module | Source Files | Cuba Reference | High-Impact Visual Transformation |
| :--- | :--- | :--- | :--- |
| **Candidate Shell** | `src/components/Dashboard/DashboardMain/` | `cuba-react-next/src/layouts/` | Unified collapsible sidebar with category headers, top search/notification bar, and personalized `WelcomeCard` banner. |
| **Candidate Stats** | `src/components/Dashboard/stats/` | `cuba-react-next/src/components/dashboard/default/StatCard.tsx` | 4 `CubaStatCard` widgets with animated `CountUp` numbers, trend badges, and SVG icon bubbles. |
| **Resume Manager** | `src/components/Dashboard/ResumesList/` | `cuba-tailwind/template/project-list.html` | Grid of resume cards with miniature previews, ATS score ring indicators, and clean action dropdowns. |
| **Interview Coach** | `src/components/Dashboard/DashboardInterviews/`| `cuba-tailwind/template/chat.html` | Session launcher with difficulty selector, live Voice AI Orb visualizer, and structured evaluation transcript cards. |
| **Employer Portal** | `src/components/EmployerPortal/` | `cuba-react-next/src/components/dashboard/hr/` (`dashboard-11.html`) | HR analytics suite, live job posting manager table with status toggles, and split-pane applicant review drawer. |

### 3.4 Tier 4: Enterprise Console & SuperAdmin Control Plane
| Module | Source Files | Cuba Reference | High-Impact Visual Transformation |
| :--- | :--- | :--- | :--- |
| **Enterprise Shell** | `src/enterprise/EnterpriseConsole.jsx` | `cuba-react-next/src/components/dashboard/projects/` | Organization switcher, plan badge, AI quota radial progress ring, and departmental workspace cards. |
| **SuperAdmin Shell** | `src/components/Admin/Admin.jsx`, `sidebar.jsx`| `cuba-react-next/src/components/dashboard/analytics/` (`dashboard-10.html`)| High-density executive console with dark/light mode toggle, command palette (`Cmd+K`), and live platform telemetry. |
| **User 360 Manager** | `src/components/Admin/usersManager/` | `cuba-tailwind/template/user-list.html` | Enterprise data table with faceted role filters, multi-select batch actions, and slide-in `User360Drawer`. |
| **Settings Grid** | `src/components/Admin/settings/` | `cuba-tailwind/template/settings.html` | Tabbed card configuration panels with secret masking, provider test indicators, and instant save feedback. |
| **Platform Health** | `src/components/Admin/health/PlatformHealth.jsx`| `cuba-react-next/src/components/dashboard/analytics/` | Live service health grid with response latency meters, database query metrics, and outbox queue monitor. |

---

## 4. Centralized Shared Component Library (`src/components/common/cuba/`)

1. **`CubaAppShell.jsx`**: Master layout wrapper for all authenticated views.
2. **`CubaSidebar.jsx`**: Universal collapsible navigation sidebar with workspace switcher, category headers, active route pills, and accordion groups.
3. **`CubaHeader.jsx`**: Glassmorphic sticky header bar with sidebar toggle, breadcrumbs, search bar, notification drawer trigger, theme switch, and user profile menu.
4. **`CubaPageHeader.jsx`**: Standardized page title header with title, subtitle, breadcrumb trail, and action button slot.
5. **`CubaCard.jsx`**: Universal container with header slots, action menus, subtle borders, and dark mode support.
6. **`CubaStatCard.jsx`**: Metric card with animated counter, icon tint, and percentage trend pill.
7. **`CubaTable.jsx`**: Data table with integrated search, filter chips, zebra striping, row hover, and pagination.
8. **`CubaBadge.jsx`**: Soft-tint status pill (`primary`, `success`, `warning`, `danger`, `info`).
9. **`CubaButton.jsx`**: Primary, secondary, outline, and icon buttons with loading states.
10. **`CubaModal.jsx` & `CubaDrawer.jsx`**: Accessible modal and sliding drawer dialogs with backdrop blur.
11. **`CubaInput.jsx`, `CubaSelect.jsx`, `CubaTextarea.jsx`**: Modern form inputs with floating labels and error states.
12. **`CubaTabs.jsx`**: Animated pill and underline tab switches.
13. **`CubaSkeleton.jsx`**: Shimmer loading skeletons for asynchronous states.
14. **`CubaEmptyState.jsx` & `CubaErrorState.jsx`**: Actionable empty and error views.

---

## 5. Performance Budgets & Accessibility Contracts

### 5.1 Performance Budgets (§39)
- **LCP**: < 2.5s at mobile p75
- **INP**: < 200ms
- **CLS**: < 0.1
- **Initial JS Bundle Delta**: $\le$ +10% versus baseline
- **Per-route Lazy Chunk**: $\le$ 250KB gzipped
- **Dependency Rule**: No new dependency > 50KB gzipped without documented justification.

### 5.2 Modal & Drawer Accessibility Contract (§14 & §35)
Every modal and drawer must implement:
- Semantic dialog role (`role="dialog"`, `aria-modal="true"`)
- Accessible title (`aria-labelledby`)
- Escape key listener
- Focus trap and focus restoration to trigger element
- Body scroll locking (`overflow: hidden`)
- Outside-click backdrop dismissal
- Mobile-responsive sizing without viewport clipping

---

## 6. Non-Negotiable System Invariants (§7 & §8)

1. **Business Logic & State Preservation**:
   - `useAuth()`, `AdminContext`, `EnterpriseContext`, and Firebase Auth JWT handling must remain identical.
   - All backend API payloads and REST routes must remain untouched.
2. **Template Fidelity Guarantee**:
   - The 51 resume templates and DOCX export pipeline (`TemplateRenderer`, `docxParityMatrix`) must remain visually and functionally intact.
3. **Quality Gates & Defect Classification (§43 & §45)**:
   - **P0 = 0** and **P1 = 0**.
   - `npm run test:security` must pass 100%.
   - `npm run test:product` must pass 100%.
   - `npm run build` must compile with zero Vite/ESLint errors.
