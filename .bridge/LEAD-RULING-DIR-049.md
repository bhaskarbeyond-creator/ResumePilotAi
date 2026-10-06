# LEAD SUPERVISOR SPECIFICATION & RE-VERIFICATION DIRECTIVE (DIR-049)
**Date:** 2026-10-07T00:02:40+05:30  
**From:** Antigravity (Executive Engineering Lead & Release Gatekeeper)  
**To:** Cline (Senior Staff Developer & Implementation Engine)  
**Directive:** DIR-049 (Master Universal Platform Re-Verification & Second Certification — 2nd Review across DIR-001 through DIR-048)  
**Status:** ISSUED (Awaiting Developer Implementation & Verification Plan)

---

## 1. MANDATE & SCOPE
The User has requested an authoritative, exhaustive **Second Certification and 2nd Review** across the entire IME365 codebase against all previously completed directives (`DIR-001` through `DIR-048`).

As the Senior Staff Developer, you are charged with independently executing the full re-verification matrix, capturing logs, checking frozen baselines, and submitting the verifiable evidence package.

---

## 2. RE-VERIFICATION WORKSTREAMS FOR CLINE:

### Workstream 1: Security & Static Sentinel Audit
- Run: `npm run test:security:static`
- Criteria: 67/67 tests PASS. Zero leaked credentials in tracked files. Canonical Apache `.htaccess` and public discovery (`robots.txt`, `sitemap.xml`) match policies.

### Workstream 2: Backend Core & Integration Matrix
- Run: `npm --prefix backend test`
- Criteria: 892/892 tests PASS. Super Admin P0 TOTP MFA enforcement, MariaDB transactional outbox, master-key AES-256-GCM envelope encryption, and export pipeline authorization contracts.

### Workstream 3: Frontend Product Suite & Concurrency Discipline
- Run: `npm run test:product`
- Run: `npm run test:interview` (note: run interview suite with `--test-concurrency=1` to prevent multi-tab takeover test race conditions)
- Criteria: 100% test pass across Candidate, Employer, Enterprise, and Admin consoles.

### Workstream 4: Cuba Design System & 4-Portal Architecture
- Run: `npm run test:design-system`
- Criteria: 141/141 tests PASS. Verify token integration, responsive layout gutters (`max-w-7xl`), and zero simulated numbers.

### Workstream 5: Hermetic Playwright Browser UAT
- Run: `npm run test:dir048:browser`
- Criteria: 8/8 PASS across 375px mobile, 768px tablet, and 1280px desktop. Zero native browser dialogs (live dialog trap) and zero `Invalid Date` strings in DOM.

### Workstream 6: Build Budget & Static Analysis
- Run: `npm run build` (confirm clean bundle compilation with Vite)
- Run: `npm run lint` (confirm 0 errors)

### Workstream 7: Frozen Baselines Audit
- Audit git diffs against certified freeze commits:
  - `git diff e314f715 -- backend/services/aiRuntime.js` (must be 0 bytes)
  - 51 resume templates and DOCX export pipeline integrity intact.

---

## 3. NEXT IMMEDIATE STEPS:
1. Submit your implementation plan:
   ```powershell
   bridge dev plan --directive DIR-049 --projectDir "D:\xampp\htdocs\IME365" --summary "<Re-verification plan summary>" --steps "S1 Security audit; S2 Backend suite; S3 Product & interview suites; S4 Design system suite; S5 Playwright UAT; S6 Build & Lint; S7 Freeze diffs; S8 Evidence submission"
   ```
2. Lead Supervisor will review and approve plan immediately for ACT mode.
3. Execute the full test battery, capture logs, and submit evidence via `bridge dev submit-evidence`.
