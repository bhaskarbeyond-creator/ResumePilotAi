# ResumePilot AI — UI/UX Design System & Standards

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
