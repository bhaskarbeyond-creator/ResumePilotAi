# 🏛️ MANDATE 21 — LAYOUT FAMILY ROOT CAUSE ANALYSIS & GEOMETRY GOVERNANCE

**Project:** IME365 — Interview Made Easy  
**Scope:** Architectural archetypes across all 100 Resume Templates  

---

## 1. Layout Family Archetype Distribution

| Archetype Name | Template Count | Key Characteristics | Column Geometry | Inner Sidebar Width |
|---|:---:|---|:---:|:---:|
| **MODERN_SPLIT** | 26 | Left sidebar (photo, contacts, skills, certs) + Right main body | 34% Sidebar / 66% Main (3624 / 7035 dxa) | 3344 dxa (3624 - 280) |
| **EXECUTIVE_BANNER** | 21 | Full-width hero banner header + 2-column split body | 100% Header + 34% / 66% Body | 3344 dxa |
| **TECH_GRID** | 21 | Structured technical rail + badge-based skills and projects | 32% Rail / 68% Content (3410 / 7249 dxa) | 3130 dxa |
| **COMPACT_EURO** | 14 | European chronological timeline + concise left metadata | 28% Left / 72% Right (2984 / 7675 dxa) | 2704 dxa |
| **MINIMAL_ATS** | 22 | Single-column linear layout, pure ATS parser optimization | 100% Single Column (10659 dxa) | N/A (Full Width) |

---

## 2. Root Cause Analysis of Alignment Defects

### RCA 1: Nested Table Width Overflow in Split Sidebars
- **Symptom:** In DOCX exports, nested certification and reference cards overflowed the 34% sidebar column by 3600+ dxa, causing Word to expand the left column and shrink the main employment body.
- **Root Cause:** `buildCertificationsBlock` defaulted to `CONTENT_WIDTH` (10659 dxa) because `options.contentWidth` was not passed by `buildSidebarStack`.
- **Correction:** Implemented `sidebarInnerWidth(style)` helper in `docxExport.js` and explicitly passed `contentWidth: sideWidth` into `buildCertificationsBlock` and `buildReferencesBlock`.
- **Verification:** Regression test assertion `nested table width <= sidebar width` verified in `docx-export.test.js`.

### RCA 2: Support Chat Balloon Visual Overlap
- **Symptom:** Live chat balloon overlapping page footers, obscuring page numbers and contact links.
- **Root Cause:** Chat widget lacked print/preview isolation media queries and container-scoped suppression.
- **Correction:** Added `#support-chat-balloon, [data-widget="support-chat"], .chat-floating-widget { display: none !important; }` in `resume-builder.css` and print stylesheets.
- **Verification:** Playwright DOM crawl verified zero widget presence on preview modals and print views.

### RCA 3: Continuation Header Document Type Ambiguity
- **Symptom:** Resumes rendered 'Curriculum Vitae' on Page 2 continuation headers.
- **Root Cause:** `ResumePageComposer.tsx` lacked template ID category discrimination.
- **Correction:** Implemented explicit ID check: `const isCv = tmplId.startsWith('Cv10') && parseInt(tmplId.replace(/\D/g, ''), 10) >= 101;`
- **Verification:** Verified 100 resume templates output 'Resume' and 4 CV templates output 'Curriculum Vitae'.
