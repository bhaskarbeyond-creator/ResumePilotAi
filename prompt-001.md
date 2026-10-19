# 🏛️ IME365 EXECUTIVE ENGINEERING DIRECTIVE: RESUMES & MASTER CV
## Mandatory Git Synchronization, Deep Architectural Audit (Old vs. New) & High-Fidelity Enhancement

**Author / Authority:** Antigravity Suite (Executive Engineering Lead & Release Gatekeeper)  
**Assigned Implementer:** Senior Staff Remote Developer  
**Priority:** P0 (Critical Production Fidelity & Candidate Experience)  
**Target Workspace:** `d:\xampp\htdocs\IME365`  
**Governing Directive:** DIR-008 (`.bridge/directives/DIR-008.json`)  
**Designated Branch:** `main` (or `arena/f4651d36-resumepilotai`)  
**Designated Baseline Commit:** `5b72cba8` (Code Engine Baseline) / `HEAD`  

---

### 🚨 STEP 0: MANDATORY GIT SYNCHRONIZATION GATE (DO NOT SKIP)

In the previous development cycle, work was performed on a divergent/uncoordinated commit, causing merge collisions and orphaned progress. **You are strictly forbidden from writing a single line of code until you have verified your branch and commit status.**

Run the following commands in your shell and verify the exact output:

```bash
# 1. Fetch latest changes from remote
git fetch origin

# 2. Checkout the synchronized branch (main or arena)
git checkout main
git pull origin main

# 3. PRE-FLIGHT VERIFICATION ASSERTION:
git log -1 --oneline
# Must show the latest verified commit (includes prompt-001.md & 5b72cba8 code engine)

git status -uno
# MUST output:
# On branch main
# Your branch is up to date with 'origin/main'.
# nothing to commit, working tree clean
```

> ⚠️ **Verification Gate:** Verify that your working tree is clean and points to the synchronized commit. Do not proceed with any implementation until confirmed.

---

### 🎯 OBJECTIVE: AUDIT, COMPARE (OLD VS. NEW) & ENHANCE "[RESUMES & MASTER CV]"

The user experience in `/dashboard/resumes` is the centerpiece of the candidate portal. 
You must perform an exhaustive **Old vs. New** forensic comparison between the legacy React codebase and the new React 18/Tailwind/Cuba frontend, identify all regression gaps, and implement targeted enhancements.

---

### 🔍 FILE INVENTORY & AUDIT SCOPE

#### 1. Legacy Baseline References (Read-Only Comparison Target):
- `src/components/Dashboard/DashboardResumes/DashboardResumes.jsx` (Legacy hub: rows, metrics, operations, modals)
- `src/cv-templates/cv1/` through `src/cv-templates/cv51/` (Legacy 51 templates, `.jsx` and `.scss`)
- `src/components/TemplateRenderer.jsx` & `src/utils/templateRegistry.js`
- `src/components/BuildResume/PreviewModal.jsx` & `src/components/Dashboard/ShareModal/ShareModal.jsx`
- `src/utils/atsScore.js` & `src/utils/resumeData.js`

#### 2. New Active Frontend Implementation (Enhancement Target):
- `frontend/src/pages/dashboard/resumes.tsx` (Current Resumes & Master CV hub)
- `frontend/src/components/layout/cuba-app-shell.tsx` (Sidebar navigation, breadcrumbs, app bar)
- `frontend/src/components/ui/preview-modal.tsx` (Centered A4 preview modal with zoom/print/DOCX)
- `frontend/src/components/resume/smart-resume-document.tsx` (Multi-page A4 document renderer)
- `frontend/src/lib/smart-partitioner.ts` (Greedy A4 page budgeting & continuation headers)
- `frontend/src/lib/template-catalog.ts` (100 ATS templates + 4 cover letters metadata)
- `frontend/src/pages/export/cv-renderer.tsx` (Export route `/export/CvX/:id/en`)

---

### 📊 COMPARATIVE AUDIT MATRIX: OLD VS. NEW

You must audit each of these 6 dimensions and deliver enhancements matching our target standard:

| Dimension | Legacy System (`src/`) | Current Frontend (`frontend/src/`) | Your Required Enhancement |
|---|---|---|---|
| **1. Master CV Concept** | Dedicated banner linking to `/dashboard/settings?tab=Profile`. Understood as the single source of truth for new resume initialization. | Present in `resumes.tsx`, but missing real-time synchronization indicator (e.g. "Last synced with Master Profile: [Date]"). | Add master profile sync indicator, avatar preview of candidate, and clear 1-click CTA to update master profile data. |
| **2. Template Visual Specificity** | 51 bespoke `.scss` files. Each template had custom header geometry, gradient lines (e.g. Cv34), circular avatar rings, and percentage meters. | Collapsed into 5 generic archetypes. All banner templates look like identical dark boxes. | Extend `template-catalog.ts` and `smart-resume-document.tsx` with per-template micro-tokens (triple gradient rules, avatar rings, checkmark badges, skill progress bars with `%`). Match the thumbnail cards in `/public/templates/CvX.JPG`! |
| **3. Live Preview & Multi-Page A4** | Single-page continuous flow that clipped content off the bottom of the page upon printing. | `SmartResumeDocument` + `smart-partitioner.ts` with greedy multi-page packing and continuation headers. | Verify that `PreviewModal` in `resumes.tsx` centers discrete A4 sheets, zoom controls (50% to 150%) work smoothly, and Print dialog triggers browser print cleanly. |
| **4. Data Integrity & Auth Gate** | Redux/Context with mixed mock data fallbacks. | Fixed initial state to `null` instead of `FALLBACK_RESUME`, but `/export` route must support unauthenticated public view tokens. | Zero Alex Morgan fallback. Ensure authentic candidate records flow cleanly into both `PreviewModal` and `/export/CvX/:id/en`. |
| **5. Resume Operations** | Duplicate, Rename, Delete, Share, Export DOCX/PDF. Legacy delete had accessible confirmation dialog. | Actions exist in dropdown menu, but need verification that backend MariaDB APIs (`post('/resumes')`, `del('/resumes/:id')`) execute without optimistic desync. | Verify full CRUD cycle: Create Draft, Rename, Duplicate (clones with "Copy of..."), Delete (with destructive confirmation dialog), Share (generates public link). |
| **6. ATS Scoring & Metrics** | Client-side deterministic `calculateAtsScore` with category breakdowns. | 4 metric cards at top (Total Resumes, Ready to Apply >= 80%, Developing, Unique Templates) + ATS readiness badges. | Ensure score colors are strictly aligned: Green (>=80% Ready), Amber (60-79% Developing), Slate (<60% Starting). Filter tabs must accurately filter by readiness tier. |

---

### 🛠️ IMPLEMENTATION ENHANCEMENT DIRECTIVES

1. **Template Specificity Injection (DIR-008 Compliance):**
   - Inspect `Cv34`, `Cv1`, `Cv4`, and `Cv25` in `src/cv-templates/`.
   - Update `smart-resume-document.tsx` so `Cv34` renders its signature **white header container with the 5px triple-gradient line** (`#6c5ce7 -> #0f766e -> #fd79a8`), circular avatar with teal border, and skill progress bars with numerical `%` readouts.
   - Ensure `Cv1` renders its executive bordered profile card.
   - Ensure `Cv4` renders its Harvard centered classic typography.
2. **Master CV Hub Polish:**
   - Elevate the **Master CV — Master Profile Data** hero banner in `resumes.tsx` with Cuba executive glassmorphic styling, candidate photo/initials avatar, and quick stats on master profile completeness.
3. **Rich Text Formatting & Date Alignment:**
   - Wrap all descriptions in `RichTextContent` (DOMPurify) so raw Lexical HTML strings like `<p class="editor-paragraph">` NEVER leak to the DOM.
   - Right-align all dates (`ml-auto shrink-0`) across employment and education entries.
4. **Interactive Controls & Keyboard Navigation:**
   - Ensure all modal dialogs (Preview, Share, Rename, Delete) support `Escape` key dismissal and trap focus appropriately (WCAG 2.1 AA).

---

### 🧪 VERIFICATION & ACCEPTANCE GATES

Before submitting your evidence, you must execute and prove the following:

1. **TypeScript Typecheck:**
   ```bash
   cd frontend
   npx tsc --noEmit
   # Must exit with code 0 (ZERO errors)
   ```
2. **Production Bundle Build:**
   ```bash
   npm run build
   # Must compile cleanly under 4.0s
   ```
3. **Playwright E2E Verification:**
   ```bash
   node ../scripts/verify_resumes_surface.mjs
   node ../scripts/verify_deep_links_all_devices.mjs
   # All tests must pass (100% green)
   ```
4. **Visual Proof:**
   - Capture DOM snapshots and full-page screenshots of `/dashboard/resumes` and `PreviewModal` showing real candidate data (not Alex Morgan).

---

### 📋 EVIDENCE SUBMISSION PROTOCOL

Submit your completed implementation and evidence through the AI Bridge CLI:

```bash
# 1. Update directive status
bridge dev submit-evidence \
  --directive DIR-008 \
  --summary "Completed Resumes & Master CV Old vs New audit and high-fidelity template enhancement." \
  --testResults "tsc: pass, vite build: pass (8.4s), playwright resumes: pass"

# 2. Wake the Lead Supervisor for Gatekeeper Review
bridge dev wake-lead \
  --directive DIR-008 \
  --reason "Evidence submitted for Resumes & Master CV enhancement"
```

**Quality Bar:** Production-ready, zero synthetic data, zero raw HTML leakage, 100% visual parity with legacy template designs.
