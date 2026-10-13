# NEXT_ENGINEERING_DIRECTIVE.md
## Mandatory Next-Directive Rule (§18)
**Master Engineering Directive:** MED-001-FINAL  
**Date:** 2026-10-14T01:35:30+05:30  
**Authority:** Technical Lead / Executive Engineering Lead (Antigravity)

---

### 1. WHAT HAS BEEN ESTABLISHED

1. **Repository Inventory Complete (`CODEBASE_INVENTORY.md`)**:
   - Source control, branch `arena/f4651d36-resumepilotai`, head commit `9beb7a3e`, and all recovery baselines documented.
   - All active uncommitted working changes preserved.
2. **Empirical Baseline Assessment Complete (`BASELINE_ASSESSMENT.md`)**:
   - Production build compiles cleanly in 2.65s.
   - Static analysis passes with 0 fatal errors.
   - 396 / 396 tests pass across Security Static (67), Extension Tooling (9), Design System (142), 51 Templates (72), Interview Coach (31), Database Authority (6), and 4-Portal Architecture (69).
3. **Master Audit Report Logged (`MASTER_AUDIT_REPORT.md`)**:
   - Concrete actionable findings AUD-001 through AUD-005 identified and ranked by priority.
4. **Subsystem Scorecard Initialized (`SUBSYSTEM_SCORECARD.md`)**:
   - Baseline rating established at **9.65 / 10.0** with clear milestones to reach **10/10 — VERIFIED**.

---

### 2. ACTIVE ACTIONABLE ENGINEERING DIRECTIVE: DIR-001 (DIR-110)

- **Bridge Directive ID:** `DIR-001` (Tracking Project Milestone `DIR-110`)
- **Title:** `Performance & Code Hygiene: BuildResume Bundle Code-Splitting & Zero-Warning Utility Normalization`
- **Priority:** `P1`
- **Status:** `IN_PROGRESS` (Active in Cline ACT Mode)
- **Assigned To:** Senior Staff Developer & Implementation Engine (Cline)
- **Reviewer:** Technical Lead (Antigravity)

#### Objective & Scope
1. **Bundle Optimization (AUD-001):**
   - Introduce dynamic `React.lazy()` / `import()` boundaries for heavyweight resume builder sub-modules in `src/components/Resume/BuildResume/` (such as Preview, Achievements, and Certification modals) to reduce the monolithic 1.27 MB chunk.
2. **Utility Lint Normalization (AUD-003):**
   - Surgically resolve the 38 benign ESLint warnings in `src/utils/autocompleteDirectories.js`, `src/utils/bulletQuality.js`, and `src/utils/candidateContext.js` (prefixing unused parameters with `_`, removing redundant regex escape slashes `\-`).
3. **System Invariants (Protected Surfaces):**
   - Must NOT modify `backend/services/aiRuntime.js` or change any template export contract.
   - Must preserve all 51 template renderers (`Cv1` through `Cv51`).
   - Zero visual or behavioral regression in `/build-resume`.

#### Automated Quality Gates (Acceptance Criteria)
1. `npm run build` exits 0 with reduced bundle chunk sizes.
2. `npm run lint` exits 0 with zero warnings in `src/utils/`.
3. `npm run test:templates` passes 72/72 tests.
4. `npm run test:security:static` passes 67/67 tests.
5. Evidence submitted via `bridge dev submit-evidence` including build logs and lint outputs.
