# DIR-008 — release gate report

Generated: 2026-10-19T23:04:41.679Z
Branch: `arena/8a774228-resumepilotai`  Commit: `f58b9942dfe58f1b1c5cddece612e55c27d3a5d4`
Environment: Node v22.22.3, linux x64

**Totals:** 24/24 suites passed, 169 tests passed, 0 failed.

| Suite | Layer | Tests | Failures | Exit | Duration | Status |
| --- | --- | --- | --- | --- | --- | --- |
| layout-engine | unit | 9 | 0 | 0 | 5.3 s | PASS |
| template-evidence | static | 6 | 0 | 0 | 1.0 s | PASS |
| field-robustness | unit | 5 | 0 | 0 | 2.9 s | PASS |
| print-and-docx | integration | 6 | 0 | 0 | 0.3 s | PASS |
| template-deep-dives | unit | 7 | 0 | 0 | 1.5 s | PASS |
| legacy-parity | static | 5 | 0 | 0 | 0.1 s | PASS |
| demo-data-guard | static | 3 | 0 | 0 | 0.1 s | PASS |
| master-profile | unit | 16 | 0 | 0 | 1.6 s | PASS |
| dashboard-metrics | unit | 8 | 0 | 0 | 1.6 s | PASS |
| preview-modal-a11y | static | 7 | 0 | 0 | 0.1 s | PASS |
| sharing-contract | static | 13 | 0 | 0 | 0.7 s | PASS |
| resume-crud-ui | static | 5 | 0 | 0 | 1.5 s | PASS |
| rich-text-and-dates | unit | 6 | 0 | 0 | 1.0 s | PASS |
| employer-resume-access | integration | 5 | 0 | 0 | 0.1 s | PASS |
| resumes-hub-ux | static | 7 | 0 | 0 | 0.1 s | PASS |
| export-client | unit | 10 | 0 | 0 | 0.1 s | PASS |
| xss | static | 4 | 0 | 0 | 0.6 s | PASS |
| backend-public-share | backend | 7 | 0 | 0 | 1.2 s | PASS |
| backend-resume-crud | backend | 5 | 0 | 0 | 1.1 s | PASS |
| backend-docx-export | backend | 19 | 0 | 0 | 1.4 s | PASS |
| backend-docx-parity | backend | 6 | 0 | 0 | 4.8 s | PASS |
| backend-cross-app-share | backend | 10 | 0 | 0 | 1.2 s | PASS |
| typescript | static | — | 0 | 0 | 0.4 s | PASS |
| production-build | build | — | 0 | 0 | 2.3 s | PASS |

## Blocked evidence (not executed)

| Evidence | Requirement | Reason |
| --- | --- | --- |
| browser-e2e | R-41 | No browser binary: Playwright install fails (CDN ECONNRESET); Chromium bundle lacks libnspr4 in this image. |
| visual-screenshots | R-41 | Depends on browser-e2e; template evidence therefore uses SSR markup + structural assertions. |
| server-pdf | R-29 | Puppeteer PDF requires the same missing Chromium; print CSS is verified, PDF bytes are not produced. |
| axe-wcag | R-34 | Automated axe audit requires a browser; static a11y contracts pass, AA contrast is unverified in situ. |

Every PASS row is the observed exit status and test counts of the command in this environment. BLOCKED rows were not executed and are never reported as passing.
