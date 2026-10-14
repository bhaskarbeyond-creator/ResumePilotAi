# NEXT_ENGINEERING_DIRECTIVE.md
## Mandatory Next-Directive Rule (S18)
**Master Engineering Directive:** MED-001-FINAL
**Date:** 2026-10-14T03:45:00+05:30
**Authority:** Technical Lead / Executive Engineering Lead (Antigravity)

---

### 1. WHAT HAS BEEN ESTABLISHED (MED re-audit cycle)

1. **DIR-110 / DIR-111 certified frozen** (`0e88b448`, `72db1a19`): BuildResume 1.27MB->81kB; `src/utils` 0 lint warnings; interview suite 31/31 with zero act() warnings.
2. **DIR-112 (8-viewport UI/UX mastery) COMPLETE on `https://ime365.local`**:
   - 224 route x viewport combinations across public/candidate/employer/admin portals: **zero horizontal overflow** after remediation, zero console errors, zero failed requests (paced sweep), zero blank pages.
   - Two live defects found and fixed during the audit:
     - **AUD-006 (P1)**: `/dashboard/cover-letters` crashed with unhandled promise rejections on API 429/5xx. Fixed: guarded `loadSavedLetters` + honest error card with retry (`role="alert"`, `aria-live`). Regression tests 2/2 (live browser, forced 429).
     - **AUD-007 (P1)**: transient 130px horizontal overflow on `/employer/messages` at 1440px caused by the shared full-screen `Spinner` (`width:100%`, `min-height:100vh`) inside in-page Suspense fallbacks. Fixed: added `Spinner inline` mode and applied it at all 7 in-page fallback sites (employer portals, dashboard, blog). Re-sweep confirms 0 overflow.
3. **AUD-005 verified closed** (IDE bridge tag parity already configured).
4. **Baseline refreshed**: 398/398 automated tests green; build 2.5-3.0s; XAMPP stack healthy (Apache 80/443, MySQL 3306, managed Node API 8080).

### 2. WHAT REMAINS UNRESOLVED

| ID | Severity | Item | Owner |
| :--- | :---: | :--- | :--- |
| MED-B-01 | P3 | Boot settle ~2.5s on authenticated reloads — `public-config` is fetched with `cache: 'no-store'` on every load; consider TTL-cached warm config with background refresh | STAFF_DEVELOPER |
| MED-B-02 | P3 | Admin chunk ~1.03MB remains monolithic — lazy-split heavy admin tabs | STAFF_DEVELOPER |
| DIR-113 | P0 | Master Production Seal: full-system integration crawl, manifest sealing, release certification | STAFF_DEVELOPER -> Gatekeeper |

### 3. NEXT REQUIRED ACTION — DIR-113 (Master Production Seal)

1. Run `npm run test:security:static`, `test:templates`, `test:design-system`, `test:interview`, `test:dir109`, database-authority + four-portal suites and capture logs.
2. Run the paced 8-viewport sweep end-to-end (final run) and capture the zero-defect summary.
3. Verify manifest consistency (`npm run test:manifest-consistency`) and security headers (`npm run security:headers:check`).
4. Verify working tree contains only this cycle's changes; confirm frozen surfaces (cv templates, `backend/services/aiRuntime.js`, `TemplateRenderer.jsx`, template registry) `git diff = 0`.
5. Update `SUBSYSTEM_SCORECARD.md`, `RELEASE_READINESS_REPORT.md`; submit release evidence for Gatekeeper certification.

### 4. EVIDENCE SUPPORTING THIS CONCLUSION

- `.bridge/evidence/med001-viewport-audit-ime365.log` — full 224-combo crawl.
- `.bridge/evidence/med001-final-sweep.log` — paced full sweep (1 transient overflow found -> fixed).
- `.bridge/evidence/med001-resweep-1440-1920.log` + `med001-resweep-mobile.log` — post-fix re-sweeps.
- `.bridge/evidence/med001-429-verify.mjs` — forced-429 verification (0 page errors + error card).
- `tests/med001-cover-letter-429-regression.test.mjs` — 2/2 pass.

### 5. ACCEPTANCE CRITERIA FOR DIR-113

- All suites exit 0; final paced sweep: 0 overflow / 0 console errors / 0 page errors / 0 blanks.
- Frozen surfaces diff = 0.
- Gatekeeper certification recorded on the bridge.

