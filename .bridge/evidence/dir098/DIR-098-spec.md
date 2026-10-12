# ANTIGRAVITY EXECUTIVE DIRECTIVE — DIR-098
## Master UI/UX Transformation Programme — Phase One: Discovery, Baseline Evidence & Acceptance-Gate Scaffolding

# SECTION 1 — EXECUTIVE MANDATE
Establish complete, evidence-based scope for the platform-wide UI/UX transformation and the acceptance-gate scaffolding every later phase reconciles against. Objective: 100% of discovered in-scope routes inventoried, baselined, and gated. Outcome: an authoritative review-unit inventory, a baseline screenshot set, a machine-checkable acceptance harness (`npm run test:ux-gates`), and a seeded defect/task register.

# SECTION 2 — ABSOLUTE MODE RESTRICTIONS: PLAN MODE VS ACT MODE
PLAN MODE: reconnaissance and plan submission only; no code edits. ACT MODE (only after Lead approval): surgical implementation, tests, and XAMPP-served Playwright DOM crawls. Escalation: blockers raised via `bridge dev ask`; escalation policy 30 minutes BLOCKED.

# SECTION 3 — PRE-FLIGHT REPOSITORY AND WORKSPACE VERIFICATION
Workspace: `D:\xampp\htdocs\IME365`, branch `arena/f4651d36-resumepilotai`. Baseline preservation: `src/cv-templates/` git diff must be exactly 0 bytes. Toolchain: Node/Vite build (`npm run build`), ESLint (`npm run lint`), node:test suites, Playwright. Servers strictly via XAMPP (Apache 80/443, MySQL 3306).

# SECTION 4 — NON-NEGOTIABLE PROJECT INVARIANTS
4.1 Protected: `src/cv-templates/**`, `docs/contracts/**`, `src/styles/cuba-tokens.css`, `src/styles/cuba-print.css`, `src/styles/template-pagination.css` (0-byte diff). 4.2 Real MariaDB data only; zero mocks/fabrication in production paths. 4.3 Cuba design-system tokens only; zero arbitrary hex. 4.4 Preserve existing functionality, API contracts, auth, RBAC. 4.5 Zero horizontal overflow 320–1920; build < 4.0s. 4.6 Server-only secrets; zero plaintext credentials. 4.7 Violations block acceptance.

# SECTION 5 — AUTHORITATIVE REFERENCES AND PARITY REQUIREMENTS
Precedence: `.bridge/project.json` (Master Manifest) > `.bridge/references/*.png` (visual references) > existing certified tests. Parity: candidate dashboard and `/build-resume` reference screenshots; Cuba M3 design tokens.

# SECTION 6 — MANDATORY INVESTIGATION AND COVERAGE
6.1 Enumerate every route in `src/main.jsx` (58) and every dashboard surface (candidate 27, admin 24, enterprise/employer/org, public). 6.2 Map shared components and dependencies. 6.3 Audit behaviour and interaction states (13 categories). 6.4 Trace end-to-end dependencies (API, state, persistence). 6.5 Coverage accounting: every route maps to a review unit; no omissions.

# SECTION 7 — QUALITY, RESPONSIVENESS, ACCESSIBILITY, AND NON-FUNCTIONAL REQUIREMENTS
7.1 Visual consistency + layout quality. 7.2 Responsive validation across 320/375/768/1024/1280/1440/1920 with zero overflow. 7.3 WCAG 2.1 AA (contrast ≥ 4.5:1, touch ≥ 44x44px, unique landmarks, focus-visible). 7.4 Performance: sub-100ms render budget, build < 4.0s.

# SECTION 8 — DATA INTEGRITY, STATE MANAGEMENT, AND EDGE CASES
Verify real-data wiring; loading/empty/error/offline/permission-denied/quota-exceeded/stale/partial/success states on every route; honest empty states, no synthetic placeholders.

# SECTION 9 — TEST STRATEGY AND ACCEPTANCE REQUIREMENTS
Existing suites remain green (`npm test` exit 0). New `npm run test:ux-gates` covers responsive overflow, a11y, and inventory completeness. Every review unit requires an evidence-backed score ≥ 98/100. Statuses: PASS/FAIL/BLOCKED/NOT EXECUTED — never report blocked/unexecuted as passed.

# SECTION 10 — REQUIRED FORENSIC AND ENGINEERING DELIVERABLES
Inventory JSON, baseline screenshot set, defect register, task register, evidence index, updated scorecards, blocker register, directive history.

# SECTION 11 — SEVERITY, PRIORITISATION, AND IMPLEMENTATION SEQUENCING
P0 security/data-integrity → P1 major functionality/navigation → P2 usability/a11y/responsive → P3 polish. Batches are independently verifiable; a lower priority never permits acceptance below 98/100.

# SECTION 12 — REQUIRED FINAL RESPONSE AND COMPLETION REPORT
Report exact commands + exit codes, orthogonal status (Executed vs Blocked), evidence classification, git HEAD + `src/cv-templates/` 0-byte verification, and the defect resolution log.

# SECTION 13 — MANDATORY BRIDGE PLAN SUBMISSION AND TOOL EXECUTION GOVERNANCE
Submit the plan with `bridge dev plan --directive DIR-098 --projectDir "D:\xampp\htdocs\IME365" --summary "<...>" --steps "S1;S2"`, then `bridge dev submit-evidence`. Emit heartbeats ≤ 480s.

# SECTION 14 — FINAL EXECUTIVE INSTRUCTION
Investigate first; baseline before change; root-cause over symptom-patching; validate every materially affected surface; never fabricate evidence; never approve below 98/100; on completion the Lead generates the next directive (Phase Two: screenshot-first defect remediation by severity).
