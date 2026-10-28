# Test Inventory

**Discovery method:** `find` counts by directory; no test was executed in this session
(see `ENVIRONMENT-GAPS.md` EG-001).

| Location | Count | Notes |
|---|---:|---|
| `backend/test/*.test.js` | 164 | Backend unit/integration tests (Node test runner or similar — runner not identified by name in this session) |
| `backend/enterprise-test/` | 25 | Separate enterprise/multi-tenancy test suite, split from the general backend suite — consistent with `package.json` root script `"test:enterprise": "npm --prefix backend run test:enterprise"` being a distinct command from `"test:backend"` |
| `frontend/tests/*.spec.ts` | 21 | Playwright specs (general suite) |
| (candidate-specific) | not separately counted | `frontend/package.json` has a dedicated `"test:candidate": "playwright test -c playwright.candidate.config.ts"` script, and `frontend/tests/candidate/` exists as a subdirectory — implies a separate, candidate-journey-focused Playwright project not folded into the 21-file general count above |

**Total test files directly counted in this session: 210** (164 + 25 + 21), **not
including** the `test:payments` script's underlying test files (referenced in
`package.json` as `"test:payments": "npm --prefix backend run test:payments"` but the
specific file count for this subset was not separately isolated from the 164 backend
total — it is likely a subset, not additional, but this was not confirmed) and not
including the uncounted `frontend/tests/candidate/` file count.

**Claimed pass count (from the audited repo's own prior documentation, NOT independently
re-executed by this audit):** `developer-review/HANDOVER-CLOSURE-2026-10-28.md` states
`npm --prefix backend test (1,356/1,356 passed)` and
`developer-review/ceiling-table-r17.md` separately states "suite 1334/1334 fail-0 skip-0
at tip." These two numbers (1,356 vs 1,334) are **not identical**, both sourced from
documents inside the audited repository's own `developer-review/` folder, dated close
together (2026-10-26 ceiling table vs. 2026-10-28 closure doc). This discrepancy was
**not investigated further in this session** — flagged here as a candidate for
`UNVERIFIED-SUSPICIONS.md` in a follow-up pass (not formally added as UVS-006 in this
session due to time budget, but explicitly flagged here so it is not lost): it could
simply reflect ~22 new tests added between 10-26 and 10-28 (a mundane explanation
consistent with the one intervening HEAD-adjacent commit being a bug fix that plausibly
added regression tests), or it could indicate inconsistent self-reporting across the
project's own audit documents. **Neither this audit nor the cited documents' authors ran
these counts in front of this engagement — both numbers are `UNVERIFIED` from this
audit's own perspective; this audit did not execute `npm test` itself (see EG-001).**

## Negative-findings statement

**What was searched:** File counts by `find`. **What this does NOT establish:** Test
*quality* (assertion strength, flakiness, coverage percentage by line/branch — no
coverage tool was run), nor whether the claimed pass counts above are currently
reproducible on the exact commit this audit inspected (`537e298`) — the cited pass counts
are dated at or before `49e82c2`/`4a76767`, both ancestors of, but not identical to, HEAD
`537e298`. **RUNTIME VERIFICATION DEFERRED** for all pass/fail claims.
