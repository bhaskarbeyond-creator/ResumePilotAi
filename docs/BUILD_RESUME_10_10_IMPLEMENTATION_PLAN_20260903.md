# Build Resume — 10/10 Product Excellence Implementation Plan
**Document**: `docs/BUILD_RESUME_10_10_IMPLEMENTATION_PLAN_20260903.md`  
**Date**: September 3, 2026  
**Auditor**: Senior Principal Architect · Head of Product UX · Principal AI Engineer · ATS Systems Specialist  
**Target Commit**: Post-Audit Implementation on `takeover/build-resume-rearchitecture-sync`  
**Status**: Authoritative Architectural Plan (Execution Blueprint)  

---

## 1. Targeted Architectural Enhancements

To advance the product from **8.1 / 10** to **9.5+ / 10**, we target 5 high-impact ergonomic, cognitive, and AI quality refinements strictly within the `BuildResume` module boundary:

### Enhancement 1: Milestone Phase Grouping & Jump Navigation
- **Target File**: `src/components/BuildResume/BuildResume.jsx`
- **Problem**: 12 flat steps create visual fatigue and require repeated arrow scrolling on tablet viewports.
- **Design Specification**:
  - Group steps into 4 clear milestone phases:
    1. **Basics**: Personal Info (`heading`), Summary (`summary`)
    2. **Core Career**: Work History (`work-history`), Education (`education`), Skills (`skills`)
    3. **Evidence**: Projects (`projects`), Certifications (`certifications`), Achievements (`achievements`), Languages (`languages`), Custom (`custom`), References (`references`)
    4. **Finalize**: Review & Export (`review`)
  - Render an instant Jump Dropdown on the ribbon allowing 1-click navigation to any section without horizontal scrolling.

### Enhancement 2: Mobile Dual-Header Scroll Contraction
- **Target File**: `src/components/BuildResume/BuildResume.jsx`
- **Problem**: Sticky Topbar (57px) + Stepper Ribbon (49px) consumes ~106px of vertical height on mobile viewports.
- **Design Specification**:
  - Track scroll direction on viewports `< 768px`.
  - When scrolling down, smoothly hide the stepper ribbon (`-translate-y-full opacity-0 pointer-events-none`) so the candidate gains 49px of vertical typing room.
  - When scrolling up or focusing an input, immediately restore the ribbon.

### Enhancement 3: Bulk-Skill Paste Ingestion Parser
- **Target File**: `src/components/BuildResume/steps/SkillsStep.jsx`
- **Problem**: Candidates pasting comma-separated skills (e.g. from LinkedIn or an existing resume) get a single malformed tag.
- **Design Specification**:
  - Intercept `onPaste` on the skill input.
  - If text contains commas or newlines, split by `[,;\n]+`, sanitize tokens, filter out duplicates, and batch-append each skill individually.

### Enhancement 4: Positive ATS Reinforcement in StepGuide
- **Target File**: `src/components/BuildResume/components/StepGuide.jsx`
- **Problem**: When a candidate completes all section criteria, the right-hand guide rail collapses into dead white space.
- **Design Specification**:
  - When `gaps.length === 0` and section score is optimal, display a calm, high-trust reinforcement card:
    `"Section optimized for ATS & screening ✓"` with bullet points summarizing verified strengths (e.g. *"Complete dates and organization listed"*, *"Action verbs detected"*).

### Enhancement 5: Context-Tailored Dynamic Question Framing
- **Target File**: `src/components/BuildResume/components/AiPromptCard.jsx`
- **Problem**: In sparse entries, the QuestionsPanel asks generic questions without echoing the candidate's declared role.
- **Design Specification**:
  - Dynamically inject the role title into question labels (e.g. *"What were your core day-to-day responsibilities as [Role]?"*).

---

## 2. Strict Boundary Protection & Invariants

```
Feature Boundary (ALLOWED TO ENHANCE):
  ├── src/components/BuildResume/BuildResume.jsx
  ├── src/components/BuildResume/steps/SkillsStep.jsx
  ├── src/components/BuildResume/components/StepGuide.jsx
  ├── src/components/BuildResume/components/AiPromptCard.jsx
  └── tests/build-resume-10-10-product-excellence.test.mjs

Strictly Protected (ZERO TOUCH):
  ├── backend/**/* (Enterprise, security, AI runtime frozen)
  ├── database / migrations / schemas (Untouched)
  ├── src/components/AppShell, Dashboard, Admin (Untouched)
  ├── Stripe / billing / subscriptions (Untouched)
  └── CV / DOCX renderers (Cv1–Cv51 untouched)
```

---

## 3. Verification & Acceptance Strategy

1. **Unit & Logic Guard**:
   - `node --test tests/build-resume-10-10-product-excellence.test.mjs` (New comprehensive suite).
   - `node --test tests/build-resume-completion-state.test.mjs` (11/11 pass).
2. **Product & Static Security Guard**:
   - `npm run test:product` (441/441 pass).
   - `npm run test:security:static` (44/44 pass).
3. **Backend Guard**:
   - `npm --prefix backend test` (652/652 pass).
4. **Browser & Adversarial Journey Guard**:
   - `node tests/build-resume-rearchitecture-browser.mjs` (48/48 checks pass across 6 viewports).
   - Full validation across Doctor, Dentist, Lawyer, Pilot, Chef, and novel arbitrary roles.
5. **Build Compilation**:
   - `npm run build` (Clean Vite build under 2.5s).
