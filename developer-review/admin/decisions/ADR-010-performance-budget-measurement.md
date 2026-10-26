# ADR-010 — The performance budget is enforced in CI with real Chrome; the Lambda Chromium cannot measure it

**Status:** Accepted · **Date:** 2026-10-27 · **Commit:** `[REC-020|UX-003]`
**Invariants:** the 10/10 UX bar (LCP < 2.5 s, INP < 200 ms, CLS < 0.1 on throttled 4G, mid-tier device)

## Context

The remediation sandbox has no Playwright browser (the CDN is unreachable). This round found a
Chromium that *is* installable from the npm registry — `@sparticuz/chromium` ships a compressed
Lambda build, and its `al2023.tar.br` companion supplies the missing `libnspr4`/`libnss3`:

```bash
cd frontend && npm i --no-save @sparticuz/chromium
node -e "const z=require('zlib'),f=require('fs');f.writeFileSync('/tmp/al2023.tar', z.brotliDecompressSync(f.readFileSync('node_modules/@sparticuz/chromium/bin/al2023.tar.br')))"
mkdir -p /tmp/al2023 && tar -xf /tmp/al2023.tar -C /tmp/al2023
LD_LIBRARY_PATH=/tmp/al2023/lib PLAYWRIGHT_CHROMIUM_EXECUTABLE=/tmp/chromium npx playwright test tests/auth-screens-ux.spec.ts
```

That runs, and it is what produced the committed auth baselines and the axe results in
`UX-DEVICE-MATRIX.md`. It is a **headless shell in `--single-process` mode**, and it cannot capture
screenshots — Lighthouse reports `NO_SCREENSHOTS` for `speed-index`, which leaves the whole
`performance` category unscored and reduces LCP to a Lantern estimate computed from an incomplete
dependency graph.

The proof that the number is not a measurement: it returned **2708.765 ms, 2708.791 ms and
2708.755 ms** across three different builds — one with a 230 KB blocking bundle, one with the
bundles split, and one with a static boot shell in the HTML. A real LCP cannot be stable to a
millisecond across three different payloads.

## Decision

1. **The budget gate is `frontend/lighthouserc.cjs`, run by the `lighthouse` job in
   `.github/workflows/quality-gate.yml`** on every pull request. It asserts, per page class
   (`/`, `/login`, `/blog`, `/pricing`): LCP ≤ 2500 ms, CLS ≤ 0.1, TBT ≤ 200 ms (the lab proxy for
   INP), `performance-budget` ≥ 0.9, and the per-page-class resource budgets in
   `budgets/per-page-class.json`. A miss fails the job — there is no `continue-on-error`.
2. **The authenticated console's vitals are asserted live** in `admin-console-ux.spec.ts:349` with a
   `PerformanceObserver` on the real page (LCP, CLS), because LHCI cannot sign in.
3. **Numbers from the Lambda Chromium are recorded as indicative, never as budget evidence.** The
   repo artefact `frontend/developer-review-artefacts/lighthouse-login-mobile-4g.json` is committed
   with that label so the next reader sees the raw data and the caveat together.
4. **What that run *can* attest is kept**: accessibility **1.00**, best-practices **0.96**, SEO
   **1.00** — all DOM-derived, all reproduced by the axe runs, and the two defects it found were
   fixed (see below).

## The defects the run found, and the repairs

| Finding | Repair | File |
|---|---|---|
| `heading-order`: the page's only heading above the card title was an `sr-only` `h1`, so the card's `h3` skipped a level | the card title is a real `h2` | `src/pages/auth/login.tsx` |
| One render-blocking stylesheet requested **eight Google Font families** for every visitor; the UI face was in the same request as seven document-template faces | split in two: UI face deferred, template faces `media="print" onload="this.media='all'"`, `<noscript>` fallback for both | `index.html` |
| The sign-in route was a lazy chunk, so LCP waited for entry → chunk discovery → parse | the login page is imported eagerly (it is the first screen for every unauthenticated visitor) | `src/app/router.tsx` |
| 230 KB of script before any pixel | a static boot shell in the document (canvas colour, brand mark, title, card-sized placeholder, dark-scheme variant) that React replaces on mount; no layout shift because the placeholder matches the card's size | `index.html` |
| `robots.txt` missing (SEO 0.91) | added | `public/robots.txt` |

Measured after the repairs on the same Lambda Chromium: accessibility 0.98 → **1.00**, SEO 0.91 →
**1.00**, best-practices 0.96 unchanged, document + shell 2 KB, total transfer 264 KB. The LCP
*estimate* did not move, which is the evidence that it is not measuring the changes.

## Alternatives considered

1. **Report the Lighthouse number as if it were measured.** Rejected: the identical-to-a-millisecond
   value across three payloads is proof it is not. It would also have been a *worse* number than the
   truth (2.71 s vs a budget of 2.5 s), so it would have failed the release for an artefact of the
   instrument.
2. **Tune `--throttling` until the number passes.** Rejected outright: that is lowering the gate.
3. **Drop the performance row from the completion report.** Rejected: the budget is enforced in CI;
   dropping the row would hide where.
4. **Ship a full Chrome instead of the Lambda shell.** Not reachable: `storage.googleapis.com` and
   `cdn.playwright.dev` are both blocked, and there is no `apt` egress.

## Rollback

Revert the four payload changes (fonts split, eager login import, boot shell, `robots.txt`) — they
are independent of each other and each commit message names its own file. The LHCI assertions are
untouched by this ADR; they were already in the repository and stay the gate.
