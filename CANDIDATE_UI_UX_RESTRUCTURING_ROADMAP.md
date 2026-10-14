# Candidate UI/UX restructuring roadmap

| Workstream | Risk / acceptance | Delivered or required next | Decision |
|---|---|---|---|
| W1 Baseline and census | T1/T2; preserve initial state, enumerate actual routes, no invented runtime evidence | Baseline log, 157 frontend declarations, 428 backend route/mount declarations, corrected 93-entry inventory and expanded pipeline register | Developer evidence ready; independent review unavailable |
| W2 Notification reliability and mobile readability | T2; load in StrictMode, serialize conflicting writes, rollback/retry, no stale toasts, no internal clipping | Production component fixed; 20/20 browser scenarios, 8/8 API-router simulated tests; screenshots at eight sizes and final traces | Not independently approved |
| W3 Test-sentinel repair | T1/T2; maintain actual component binding/mount contract, preserve other assertions | Four obsolete eager-import checks repaired; positive/negative helper tests; 50/50 targeted checks | Not independently approved |
| W4 Templates/export proof | T3 protected; all variants, representative data, downloads and visual inspection | 220/220 isolated renderer fixtures; 55 PDFs parsed, 51 DOCX XML checked; no production renderer change | **Incomplete:** glyphs, parity, HTTP download/entitlement, cover DOCX and real source persistence |
| W5 Critical integration/security | T3/T4 protected; owner isolation, quotas, payments, deletion and durable writes | Missing ai_quota_counters ownership, AI admission test failures, DB blockers and dependency advisories require controlled remediation | **Blocked:** Lead approval + isolated DB/identity/provider access |
| W6 Per-page restructure | T2/T3; use real journeys before redesign | Audit authenticated pages/tabs/dialogs individually; apply common recovery/keyboard/layout contracts where defects are reproduced | Not executed beyond notifications |
| W7 Accessibility/performance/visual parity | T2/T3; manual and automated evidence at all required viewports | Notification axe + keyboard sample only; route-specific zoom/screen-reader/contrast and controlled performance measurements remain | Incomplete |
| W8 Independent verification/release | Separate reviewer reruns evidence and challenges fixes | Bridge unavailable; request external Lead to review exact diff/manifests and rerun tests | **BLOCKED — VERIFICATION UNAVAILABLE** |

## Next execution directive

1. Review this diff, CAND-001–013 and genuine evidence. Obtain protected-surface approval before quota ownership, auth/provider/dependency or template changes.
2. Provision isolated MariaDB 11.4 using repository CI scripts in an authorised environment; use synthetic A/B identities and sandbox providers. No real customer data or production fault injection.
3. Restore approved historical freeze evidence for `e314f715`; never substitute the current commit to make the sentinel green.
4. Reproduce AI governance/ownership and dependency issues; patch compatible versions and source root causes; rerun exact failed tests, full security suite and tenant/payment/export regression.
5. Execute P02→P04→P08→P11 and P06/P07 revocation; P12→P13→P14; P15/16→P17; P18 publication; P23/P33 duplicate callbacks. Record real record/revision IDs without exposing tokens.
6. Audit remaining pages/tabs/modal states at all eight viewports, both relevant shell/feature flag variants, keyboard and zoom. Rate only inspected dimensions.
7. Fix approved font delivery; compare all 55 templates and exported files visually and semantically. Investigate concurrent harness instability; retain every failed run.
8. Independent Lead reruns and decides APPROVED, REJECTED — REMEDIATION REQUIRED, or BLOCKED. No automatic or self-issued certification.

**10/10 challenge:** Does each test prove a user-visible result rather than an implementation string? Can rollback clobber newer data? Does a passing Unicode check merely find text in DOM? Does the file actually download from the authorised API? Those questions remain mandatory, even when local suites are green.
