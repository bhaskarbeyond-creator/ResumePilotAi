# ResumePilot AI — CSS Architecture, Rendering & Design System Audit

**Audit Date**: September 1, 2026  
**Environment**: Local Development (`https://ai-resume-builder.local/`)  
**Design Paradigm**: Google Material 3 Inspired Clean Modern SaaS  
**Primary Stylesheet**: `src/components/Dashboard2/public-site.css`  

---

## 1. CSS Scoping & Isolation Architecture

To ensure complete isolation between the public marketing website and internal authenticated dashboards (`/adm`, `/dashboard`, `/build-resume`, `/cv/*`), all public styles are scoped under the root selector:

```css
.rp-public-site {
  --rp-font-sans: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --rp-blue: #1a73e8;
  --rp-blue-hover: #1557b0;
  --rp-blue-subtle: #e8f0fe;
  --rp-text-title: #0f172a;
  --rp-text-body: #475569;
  --rp-text-muted: #64748b;
  --rp-surface-bg: #ffffff;
  --rp-surface-border: #e2e8f0;
  --rp-radius-sm: 8px;
  --rp-radius-md: 12px;
  --rp-radius-lg: 16px;
  --rp-radius-xl: 24px;
  --rp-radius-full: 9999px;
  --rp-elev-1: 0 1px 3px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.03);
  --rp-elev-2: 0 4px 12px rgba(0, 0, 0, 0.06), 0 2px 4px rgba(0, 0, 0, 0.04);
  --rp-elev-3: 0 12px 24px -4px rgba(0, 0, 0, 0.08), 0 4px 8px -2px rgba(0, 0, 0, 0.04);
}
```

### Invariant Verification
- **Dashboard Integrity**: Internal dashboards (`/adm`, `/dashboard`, `/build-resume`) do NOT render `.rp-public-site`, completely preventing unintended style overrides or CSS leakage.
- **Public Page Consistency**: Every public route (`/`, `/blog`, `/blog/:slug`, `/pricing`, `/contact`, `/p/*`) renders `<div className="rp-public-site">`, inheriting full Google Material design tokens, glassmorphism, responsive navigation, and typography.

---

## 2. Visual Quality & Aesthetics

1. **Modern Typography**: Clear font hierarchy using Google Font Inter with carefully tuned line heights (1.25 for titles, 1.6 for body, 1.8 for articles).
2. **Harmonious Palette**: Light, airy Google-inspired surfaces with subtle radial glows (`radial-gradient(circle at 50% 20%, rgba(232, 240, 254, 0.7) 0%, rgba(248, 250, 253, 0) 70%)`).
3. **Interactive Micro-Animations**:
   - Card lift on hover (`transform: translateY(-4px); box-shadow: var(--rp-elev-3)`).
   - Dropdown smooth fade-in (`animation: rpDropdownFadeIn 0.18s cubic-bezier(0.16, 1, 0.3, 1)`).
   - Search box focus ring expansion (`box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.15)`).

---

## 3. Responsive Breakpoint & Viewport Metrics

| Breakpoint Target | Viewport Width | Navigation Bar | Content Grid | Horizontal Overflow |
|---|---|---|---|---|
| Desktop QHD / 4K | ≥ 1440px | Full Desktop Header | 3-Column Grid (`repeat(3, 1fr)`) | 0px (No overflow) |
| Desktop HD | 1200px – 1439px | Full Desktop Header | 3-Column Grid (`repeat(3, 1fr)`) | 0px (No overflow) |
| Tablet Landscape | 992px – 1199px | Desktop Header | 2-Column Grid (`repeat(2, 1fr)`) | 0px (No overflow) |
| Tablet Portrait | 768px – 991px | Mobile Drawer Trigger | 2-Column Grid (`repeat(2, 1fr)`) | 0px (No overflow) |
| Mobile Phone | < 768px | Mobile Drawer Trigger | 1-Column Stack (`1fr`) | 0px (No overflow) |
