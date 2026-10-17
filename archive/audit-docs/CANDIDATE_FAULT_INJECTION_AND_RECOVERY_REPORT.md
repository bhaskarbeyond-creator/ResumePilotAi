# Candidate fault injection and recovery report

**Environment:** isolated foreground Vite/Chromium harness, synthetic notification records. Browser uses actual DashboardNotifications and platform.apiJson; Playwright intercepts notification HTTP requests only, and blocks outbound requests. Separate HTTP tests exercise the real Express notification router with test identity and an SQL-contract double. Neither setup proves live Firebase/MariaDB/provider operation. No production failures were injected.

Evidence root: `artifacts/candidate-audit-20261014/`. Baseline `before/results.json`, final `after/results.json`; final traces `after/<scenario>.zip`. Backend contract log `notification-api-contract.log`. A–L below refer to the directive's scenario classes.

| Fault ID / P-21 scenario | Injection | Expected result | Baseline actual → final actual | Integrity, visible state and recovery |
|---|---|---|---|---|
| FI-01 K/L | React StrictMode setup→cleanup→setup | Current load completes; obsolete response cannot commit | Stuck loading → PASS | Real component lifecycle guarded by generation; two rows render. Database not involved. CAND-001 |
| FI-02 H/I | Two synchronous row clicks; hold PATCH open | One PATCH; row busy; bulk disabled | Bulk remained enabled → PASS | Ref-based duplicate lock and per-row pending state; completion re-enables control. CAND-002 |
| FI-03 H/I | Two synchronous bulk clicks; hold POST open | One POST; row controls disabled; correct toast | Rows remained enabled → PASS | Bulk lock prevents snapshot rollback from racing a row mutation; toast positional contract asserted. Simulated reload confirms response read-back. CAND-002/003 |
| FI-04 K | Unmount while POST is held, then complete | No stale completion toast; remount loads current rows | Stale toast → PASS | Parent side effect now lifecycle-guarded. CAND-003 |
| FI-05 C | PATCH 401 | Roll back read state, show error, recover manually | PASS → PASS | Error is visible, no success claim; retry and simulated reload work. Does not test actual token refresh. |
| FI-06 D | PATCH 403 | Roll back, expose denial, no hidden success | PASS → PASS | Same; this is HTTP fault handling, not proof of real authorisation. |
| FI-07 E/G | PATCH 429 | Roll back, no retry storm, manual retry | PASS → PASS | No automatic mutation retry; manual retry succeeds. Server quota accounting/backoff not exercised. |
| FI-08 E/G | PATCH 500 | Roll back, retain rows, retry | PASS → PASS | No false read success; simulated read-back verified. |
| FI-09 E/G/I | Bulk POST 500 | Restore snapshot with no concurrent row write | Rollback sample passed; race existed → PASS | Exclusive bulk operation now makes snapshot restoration safe within this mounted page. Multi-tab/server concurrency remains unverified. |
| FI-10 E/G | GET 500 then successful retry | Error, not empty inbox; retry loads | PASS → PASS | CubaErrorState offers recovery; two records appear. |
| FI-11 B/E | HTTP 200 with missing notifications array | Contract error, not “caught up” | False empty success → PASS | Envelope rejected; explicit retryable error. Arbitrary malformed records within an array not yet exhaustively validated. CAND-004 |
| FI-12 J | 330-character unbroken message and long Unicode title at 8 viewports | No concealed message clipping, working filter/toggle | Width-only check passed but screenshot clipped → stronger check PASS | Message span itself measured after fix; missing script fonts separately recorded. CAND-005 |
| FI-13 B/D | HTTP router invalid id/body/extra owner field and A→B mutation | 400/404, no unrelated SQL mutation | New tests, no baseline comparison → PASS | SQL-contract double requires both id and owner predicate; real relational access still blocked. |
| FI-14 E/G | SQL-contract double throws private diagnostic on write/list | Sanitized 500, unchanged state, successful retry | New tests → PASS | No private diagnostic in response; simulated stored records unchanged on failure. |
| FI-15 H | Repeated bulk router POST | Idempotent result; B unchanged | New test → PASS | Second updated count is zero; not durable DB replay proof. |

**Counts:** 20/20 final notification browser scenarios (includes 8 viewport cases and 1 axe/keyboard sample), 8/8 Node HTTP-contract tests including their parent, zero skipped in those runs. Fault rows summarize multiple assertions and are not a second independent test denominator. Initial browser suite 15/20; baseline missing Chromium shared libraries was a harness-startup blocker resolved using the locked npm browser's bundled libraries.

## Not injected / not verified

Database crash/transaction rollback, actual Firebase expiry, live provider failures, payment duplicate charges, export HTTP failures, worker crash/reclaim, resumable uploads, multi-tab concurrency, browser refresh during an in-flight real write, and provider malformed content across every AI path remain unverified. Stalled indefinitely pending fetch/timeout is not covered by the 500/held-request tests: held requests were explicitly released. No timeout-recovery claim is made.

**10/10 challenge:** An HTTP 200 fixture is not durable persistence; a 403 fixture is not a permission audit. The separate router contract tests improve local coverage but do not close those release gates. Lead verification: **BLOCKED — VERIFICATION UNAVAILABLE**.
