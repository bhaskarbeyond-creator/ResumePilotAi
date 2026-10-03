DIR-006 UNIFIED FUNNEL - FINAL EVIDENCE
Generated: 2026-10-03T07:04:43.7767527+05:30

STACK (live only, no mocks/interception):
  Vite   http://localhost:3000  -> 200
  API    http://localhost:8080  -> 200  authoritativeDatabase=MARIADB owner=MARIADB mode=NORMAL
  Proxy  http://localhost:3000/api/health -> 200 MARIADB

PLAYWRIGHT: 7 passed / 0 failed (48.0s) EXIT=0 -- machine-verified via JSON reporter.
  Stage 0            PASS  SPA serves; /api proxied to live MariaDB
  Stage 1            PASS  hero CTA "Build My Resume - Free"; 6 featured templates; signup handoff modal
  Stage 2            PASS  5 builder steps mount; Generate Executive Bio ctl; ATS surfaces=4
  Stage 3            PASS  /jobs -> /jobs/portal/job-air-23 -> JobApplicationModal + 1-Click Quick Pitch
  Stage 4            PASS  /employer/applicants; 25 owned requisitions; honest 0-row pipeline
  Stage 5            PASS  STRICT CBT mode + AI Role + 15 min + start enabled
  Cross-portal       PASS  5 routes: no PEM / bearer / rptest token in DOM
  Defect counters per stage: console=0 pageErrors=0 failedApi=0 (zero maintenance-guard hits)

REGRESSIONS (no product breakage):
  npm run test:product          EXIT=0  (0 not-ok)
  npm run test:security:static  EXIT=0  (0 not-ok)

BUILD GATE: npm run build -> built in 3.32s (wall 3.98s), ERROR_COUNT=0  [target <4s MET]

FROZEN INVARIANTS:
  git diff over src/components/templates (51 Cv*.jsx), src/components/Resume
  (TemplateRenderer, exportService, docxParityMatrix), src/utils (atsScore.js) = EMPTY (diff 0).
  git status src backend => NO PRODUCT SOURCE CHANGES.

DELIVERABLES (new files only):
  tests/e2e/dir006-funnel.spec.js   7-stage funnel spec
  tests/e2e/dir006-session.mjs      real Firebase ID token minter
  playwright.dir006.config.js        live-stack config (trace off)

ROOT CAUSES FOUND AND FIXED THIS SESSION:
  1. Spec file corruption - Stage 1/3 bodies truncated, orphaned tails after the final
     });, plus a missing test.beforeAll hook. Rebuilt; braces balanced, ESLint 0 errors.
  2. Playwright trace retain-on-failure stalled EVERY page.goto against the live Vite
     HMR module graph (180s timeout). Proven by controlled bisect: identical spec+config
     passes in 2.6s with trace off, times out with tracing on. Set trace: off.
  3. Session could not authenticate: the app runs against the REAL Firebase project,
     so the synthetic harness token was rejected (400s) and every route fell back to the
     landing page. Replaced with a genuine ID token via firebase-admin
     signInWithCustomToken (aud=ai-resume-builder-424cf).
  4. Selectors were guessed, not verified. Crawled the real DOM for all 5 stages
     (/jobs landing + portal cards, interview mode/role/duration controls, hidden mobile
     nav button) and retargeted every assertion to the verified control.

SCRATCH CLEANUP: removed 184 passXX/dir005-/dir006-* scripts from .bridge/ and the orphaned
DIR-005 git worktree .bridge/wt-base (162MB, 0 tracked files) via git worktree remove --force
+ prune. .bridge/ now holds only bridge.json, ledger.jsonl, state.json.

NOTE FOR GATEKEEPER: Stage 4 renders 0 applicant rows because the authoritative DB has 0
applications. That is the honest empty state (zero fabrication), so the in-modal recruiter
resume-preview path could not be exercised with real applicant data. Additionally,
EmployerApplicantPipeline.jsx imports no TemplateRenderer and exposes no in-modal resume
preview control - a real product gap vs the directive acceptance criterion. Raised as a
follow-up rather than fabricated.
