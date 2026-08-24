# Final Control Execution Report — Truthful

**Generated:** 2026-08-24T19:33:11.203Z · **SHA:** 464436b18a786d3a0f5d14b8f545db5154a5cca0

This report replaces the previous `2,052 / 2,052 PROVEN` document, which is not backed by browser evidence.

## Executed in this audit (real Chromium)

| Suite | Result | Nature |
|---|---|---|
| real-browser-master-execution.mjs | 250 checks / 250 PASS | 93 clicks, 40 fills, 13 selects, 49 reloads; assertions are weak and not census-linked |
| test-enterprise-browser.mjs | 28 / 28 PASS | real interactions against stateful page.route fixture |
| export-e2e-real-browser.test.mjs | 3 / 11 PASS | 8 failures |
| real-browser-batch1-homepage.mjs | 54 / 10 | 10 failures |
| real-browser-batch2-resume-builder.mjs | 5 / 21 | 21 failures |
| real-browser-batch3-admin.mjs | 13 / 28 | 28 failures |
| test-interview-coach-browser.mjs | FAILED | CBT header visibility |

Failed checks in this sandbox (root causes not all diagnosed because the relevant product features require a live backend): feature/plan card render (mock payload shape), blog render, navbar visibility at mobile/desktop viewports, resume-builder template selector, admin controls, and PDF print-media rendering.

## Control-level accounting

- Discovered: 2,052 (AST source census)
- Real DOM controls observed during crawl: 217 (69 distinct signatures)
- Strict REAL_BROWSER_PASS records: 0
- Synthetic ledger PASS records: 2,052
- Remaining / not verified: 2,052
- Blocked: 0
- Failed suite checks observed: 68

See `test-results/FINAL_EXECUTION_RECONCILIATION.json` for the machine-readable record.
