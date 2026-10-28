# Evidence directory guide

Produced by the temporary-environment runtime verification pass
(see `../TEMP-ENVIRONMENT-MANIFEST.md`, `../TEST-EXECUTION-REPORT.md`,
`../BROWSER-VERIFICATION-REPORT.md`, `../FINAL-ACCEPTANCE-REPORT.md`).

| Path | Contents |
|---|---|
| `env/environment.json` | machine-readable capture: OS, kernel, CPU/RAM, Node/npm/Python/gcc, Playwright, axe, Chromium, git revision |
| `logs/` | one file per executed command (stdout+stderr, exit code appended where relevant). `logs/pw/` holds the per-spec Playwright logs. |
| `screenshots/` | 45 full-page PNGs, named `<viewport>__<workflow>.png`, from the audit viewport matrix |
| `artifacts/browser-observations.json` | 45 records: final URL, HTTP status, console errors, page errors, failed requests, axe violations, horizontal-overflow px, screenshot path, duration |
| `artifacts/axe-violation-details.json` | per-node axe detail (CSS target, HTML excerpt, failure summary, contrast ratios) for landing + pricing at 375×667 and 1440×900 |
| `artifacts/migration-fidelity.json` | per-migration result of applying the checked-in migrations to the MySQL 5.7 substitute engine |
| `artifacts/playwright-report.json` | Playwright JSON reporter output |
| `artifacts/playwright-results/` | failure screenshots and `error-context.md` for each failed browser test |

**Pruned on purpose:** Playwright `trace.zip` files (23 files, ~32 MB) were deleted after
the pass to keep the repository lean. They are regenerable with the documented commands
(trace retention is enabled in `tools/playwright.audit.config.ts`), and the failure
screenshots + error contexts that remain are sufficient to locate each failure.

**Nothing here is fabricated:** every artifact is the direct output of a command recorded
in `logs/`. The one artifact set that was discarded for being misleading (five
Playwright baselines accidentally *written* instead of compared) is described in
`../BROWSER-VERIFICATION-REPORT.md` §5.1.
