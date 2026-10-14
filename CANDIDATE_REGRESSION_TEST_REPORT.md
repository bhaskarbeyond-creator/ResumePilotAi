# Candidate regression test report — 2026-10-14

## Executed checks (do not sum overlapping suites)

Evidence files are relative to `artifacts/candidate-audit-20261014/`. Initial root-only dependency runs are retained but superseded by the fully installed baseline. No failing test was deleted, skipped or assertion-disabled.

| Command / layer | Baseline | Latest executed result | Evidence / interpretation |
|---|---|---|---|
| `npm run test:product` first chained stage | 729 pass / 734, 5 fail | **735 pass / 736, 1 fail**, 0 skipped | `baseline-product-installed.log`, `final-product.log`; 4 stale binding tests corrected, 2 helper negative/positive tests added. Remaining frozen Git reference unavailable. Command still exits 1. |
| `npm run test:security` frontend/static stage | 67/67 pass | **67/67 pass**, 0 skipped | `*-security*.log` first TAP summary |
| Same command, backend stage | 823 pass / 881, 58 fail | **831 pass / 889, 58 fail**, 0 skipped | `baseline-security-installed.log`, `final-security.log`; 8 new notification router checks pass; pre-existing failure count unchanged. Not a security pass. |
| `npm run test:templates` | Executed separately because product chain stopped | **72/72 pass**, 0 skipped | `templates.log`; includes per-template source/server render/domain checks, not live downloads |
| Explicit downstream product stages: template-render, template-production-render, portfolio-templates, dir054-shared-poller | Would not run after failed product stage | **27/27 pass**, 0 skipped | `downstream-product.log`; explicit run preserves coverage otherwise hidden by `&&` |
| Targeted builder sentinel/domain + helper tests | Four stale import assertions failed in baseline | **50/50 pass**, 0 skipped | `builder-sentinel-retest.log`; AST exact binding + mount checks; other assertions preserved |
| Adjacent notification/navigation/account tests | Existing suites | **27/27 pass**, 0 skipped | `adjacent-regression.log`; static/unit, not authenticated page navigation |
| New notification HTTP router contract | New | **8/8 pass**, 0 skipped | `notification-api-contract.log`; real router, simulated identity/SQL; includes parent test |
| `npm run test:candidate:notifications` | Browser before 15/20 | Node **10/10** (8 router + 2 helper), browser **20/20**, 0 skipped | `final-notifications.log`, `after/results.json`; real Chromium/component/client, simulated HTTP |
| Template browser/output audit | Initial 165/220 due test cleanup bug | **220/220 final isolated**, 0 skipped | `template-isolated-retest.log`, `templates/manifest.json`; intermediate 216/220 concurrent run retained. Four fixtures × 55 variants. |
| Targeted ESLint `--max-warnings 0` | Added gate | PASS, zero warnings | `targeted-lint.log`; all changed application/test/JSX harness/inventory files; final rerun required after any edit |
| `npm run lint` whole repository | exit 0; 243 warnings | exit 0; **243 warnings**, 0 errors | `final-lint.log`; warning-free mandate remains unmet |
| `npm run build` | success, Vite 9.22s under concurrent load | success, Vite 15.14s under concurrent load | `final-build.log`; direct-eval/large-chunk warnings; not comparable benchmark and not 4s budget pass |
| `npm audit --omit=dev --json` | Newly executed gate | FAIL: root **57** graph findings (15 high, 40 moderate, 2 low) | `dependency-audit-root.json`; production-graph advisory count is not exploit count; unreachable Firebase data modules need reachability review |
| `npm --prefix backend audit --omit=dev --json` | Newly executed gate | FAIL: backend **10** graph findings (1 critical, 6 high, 3 moderate) | `dependency-audit-backend.json`; critical proxy-addr, high nodemailer and other findings. No blind downgrade/force fix. |
| `git diff --check` | clean | PASS at final reconciliation | No whitespace errors; protected source diff separately checked |

## Requirements → tests → defects → decision

| Requirement | Route/component / pipeline | Scenario/test | Evidence | Defect / fix | Lead decision |
|---|---|---|---|---|---|
| Recoverable, accurate notification UI | DashboardNotifications / P21 | strict-mode-load; malformed-load; load retry | before/after results, final traces | CAND-001/004 lifecycle generation/error contract | BLOCKED independent review |
| No duplicate/conflicting read mutations | notification page/router / P21 | held row/bulk, same-tick clicks, 401/403/429/500, API owner scope | browser/API logs and traces | CAND-002 ref locks + exclusive bulk | BLOCKED real DB + reviewer |
| Correct, non-stale success feedback | DashboardMain callback / P21 | bulk toast contract, unmount | browser traces | CAND-003 positional signature + lifecycle guard | BLOCKED reviewer |
| Responsive readable messages | notification row / P21 | 8 widths, span/document clipping, filter/read | 16 before/after viewport screenshots | CAND-005 wrapping + target sizes | BLOCKED full-shell/zoom review |
| All template variants accounted | renderer / P10–11 | 55×4 fixtures, PDF parse/name, CV DOCX XML/name/employment | manifest + outputs/screenshots | No protected template edit; glyph gap remains | BLOCKED full downloads/glyph/parity |
| Valid builder binding regression | BuildResume→Preview→TemplateRenderer; step routes / P04/10 | AST binding/mount, negative mutation examples | 50/50 targeted log | CAND-006 test architecture correction | BLOCKED reviewer |
| Data ownership and tenant admission | database/AI / P09/36 | ownership and AI suites | 58 failures log | CAND-008/009; protected changes not approved | BLOCKED approval/infrastructure |

## Blocked, unexecuted and not-applicable accounting

- Complete live critical cross-pipeline journeys: **0 accepted**; 12 journey groups listed in E2E report are partial/unverified. Those groups are not the final exhaustive requirement denominator.
- Required historical surface viewport accounting: notifications 8/8 component cases; remaining 92×8 = **736 unverified combinations**, plus unenumerated modal/query states. No skip is counted as a pass.
- Full independent Lead decisions: **0 approvals** across 8 roadmap workstreams.
- Type checking: no root/backend TypeScript project/typecheck script established for touched JS/JSX surfaces; no `tsc` pass claimed. Dedicated Semgrep/coverage percentage was not run; existing security suite is not a substitute for a complete security audit.
- Live MariaDB migration/transaction/isolation, real identity/OAuth/MFA, provider/payment/export end-to-end, WCAG manual/screen-reader/zoom, Web Vitals and complete visual parity: blocked/unexecuted; no denominator-normalized pass percentage assigned.

## Reproduction

Run locked root/backend installs, then `npm run audit:candidate:inventory`, `npm run test:candidate:notifications`, `npm run audit:candidate:templates`, `npm run test:templates`, full product/security/lint/build. Browser binaries and Linux libraries come from the locked `@sparticuz/chromium` package; foreground servers and contexts close in finally. Test caches are isolated per browser suite. Provider/network responses are deliberately simulated only at documented boundaries. Keep failed-run logs and do not promote a favourable rerun to proof of universal stability.

## Latest harness recheck

The final two browser suites were run simultaneously with separate Vite caches: notifications **20/20** and templates **220/220** passed (`notification-cache-isolated-final.log`, `template-cache-isolated-final.log`). This adds one successful concurrent recheck, not a conclusive reconstruction of the earlier Cover4 exception. Failed manifests/logs remain retained.
