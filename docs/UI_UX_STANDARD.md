# ResumePilot AI — UI/UX Design System & Standards

> **⚠ FORENSIC AUDIT CORRECTION (2026-08-24) — CSS architecture.**
> `src/cv-templates/css/globalTemplateEnhancements.css` is linked from
> `index.html` and therefore applies on **every** route. It contained four rule
> groups with **unscoped global selectors** carrying `!important`:
>
> ```css
> p, [class*="-description"], [class*="-summary"] { text-align: justify !important; }
> .cv-content, [class*="-content"], .sectionTitle, .rightSection { width:100% !important; max-width:100% !important; }
> h1..h6, [class*="-title"], [class*="-head"] { break-after: avoid !important; }
> section, [class*="item"], [class*="grid"], [class*="-card"] { break-inside: avoid !important; }
> ```
>
> Because they were `!important` they **silently defeated Tailwind's
> `text-left` / `text-center` / `text-right` utilities on every paragraph in the
> application** — Admin, Enterprise, Dashboard, Auth, Blog chrome, modals, toasts.
> `[class*="-content"]` additionally forced full width on `blog-content`,
> `modal-content`, `dashboard-content`, etc.
>
> **Fixed**: all four groups are now scoped to the resume document containers
> every template renders into — `[class*="-board"]`, `[data-cv-board]`,
> `.cv-board`. No template declares `text-align: left|center !important`, so
> template output is unchanged.
>
> **Order-independence clarification.** The prior claim was narrowly true for the
> wrong reason: this sheet is emitted as a separate chunk but is `<link>`-ed
> **statically** in `index.html`, so its leak was **deterministic and always-on,
> not visit-order-dependent**. The genuine order-dependent residue is
> **print-only**: `@media print` rules in lazy chunks (`CoverLetter`, `Cv*`,
> `EnterpriseConsole`) persist in `<head>` for the SPA session, so printing a
> later route hides `nav/header/footer/button/input/textarea`. Screen rendering
> does not depend on visit order, reload, or chunk order.
>
> **Fonts.** Poppins was loaded twice — self-hosted from `/fonts/poppins.css`
> (36 `@font-face` rules) *and* via a render-blocking remote
> `@import url('https://fonts.googleapis.com/css2?family=Poppins…')` in
> `src/tailwind.css`, producing two competing `@font-face` sets whose winner
> depended on load order. The remote import is removed. Accepted consequence:
> weights 100/200 are not self-hosted, so the single `font-extralight` usage
> resolves to 300.


> **Authoritative UI/UX Standard**  
> **Source Commit:** `8c7905f`  
> **Classification:** AUTHORITATIVE SOURCE OF TRUTH

---

## 1. Design Philosophy & Foundations

ResumePilot AI enforces a modern, accessible, enterprise-grade aesthetic designed for responsiveness across devices:

- **Typography**: Inter / Outfit / Outfit Display (Google Fonts) with RTL language support (`ar`, `he`) via `dir="rtl"` dynamic switching in `i18n.js`.
- **Color Palette**:
  - Primary Accent: Indigo / Slate Blue (`#4f46e5` / `#6366f1`)
  - Background Neutral: Slate Dark (`#0f172a`, `#1e293b`) for Console; Slate Light (`#f8fafc`, `#ffffff`) for Candidate Workspace
  - Status Indicators: Emerald (`#10b981` — Healthy/Active), Amber (`#f59e0b` — Warning/Degraded), Rose (`#f43f5e` — Error/Critical)
- **Glassmorphism & Micro-animations**: Tailored backdrop filters (`backdrop-blur-md`), Framer Motion staggered transitions, and non-blocking loading overlays.

---

## 2. Supported Viewport Matrix & Audited Breakpoints

All views must maintain zero horizontal overflow, no clipped text, no overlapping modals, and no inaccessible controls across these tested resolutions:

| Viewport Category | Resolution | Device Profile | Audited Status |
|-------------------|------------|----------------|----------------|
| **Desktop High-DPI** | $1440 \times 900$ | Desktop HD / MacBook Pro 15" | ✅ PASS (Zero Overflow) |
| **Desktop Standard** | $1280 \times 800$ | Standard Laptop Display | ✅ PASS (Zero Overflow) |
| **Tablet Landscape** | $1024 \times 768$ | iPad Pro / iPad Air Landscape | ✅ PASS (Zero Overflow) |
| **Tablet Portrait** | $768 \times 1024$ | iPad / Android Tablet Portrait | ✅ PASS (Zero Overflow) |
| **Large Mobile** | $430 \times 932$ | iPhone 14 / 15 Pro Max | ✅ PASS (Zero Overflow) |
| **Standard Mobile** | $390 \times 844$ | iPhone 14 / 15 | ✅ PASS (Zero Overflow) |
| **Compact Mobile** | $375 \times 667$ | iPhone SE / Compact Devices | ✅ PASS (Zero Overflow) |

---

## 3. UI State Lifecycle Standards

Every interactive module must adhere to the standard 4-state lifecycle:

1. **Loading State**: Animated Skeleton or centered `<Spinner />` with accessible `role="status"` and readable aria labels. Never leave a blank white or empty screen.
2. **Empty State**: Explicit graphic illustration, informative explanation, and a primary Action Button (e.g. "Create your first resume", "Post a job").
3. **Success State**: Clear toast notification or visual badge (`✓ Active on server`), with automatic reset of transient mutation states.
4. **Error State**: Informative, user-friendly error banners with actionable remedies and Retry buttons. Never show raw stack traces or unhandled error boundaries to end users.

---

## 4. Accessibility & Keyboard Support (WCAG 2.1 AA)

- **Command Palette (`Ctrl+K` / `Cmd+K`)**: Global keyboard shortcut in Admin and Dashboard enabling instant navigation to all 31 settings, audit logs, and management views.
- **Focus Management (`RouteFocus.jsx`)**: Automatically shifts keyboard focus to the main page heading on SPA route transitions.
- **Modal Dialogs**: ESC key closes active dialogs; tab key focus is trapped within the open modal context; background body scroll is locked.
