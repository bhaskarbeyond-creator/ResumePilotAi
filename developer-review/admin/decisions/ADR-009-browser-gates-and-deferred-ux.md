# ADR-009 — Browser-observable UX gates run in CI; two mandate items are deferred with criteria

**Status:** Accepted · **Date:** 2026-10-27 · **Commit:** `[REC-019]`
**Invariants:** INV-1 (every Must/Should capability reachable) · the 10/10 UX bar.

## Context

Step 4 asks for per-screen evidence across five device classes: visual regression at every
breakpoint in light, dark, RTL and high-contrast; axe with zero serious/critical findings; keyboard
scripts; Lighthouse LCP/INP/CLS on throttled 4G; committed screenshots; state coverage; 200 % zoom
and text. Almost all of that needs a **rendered page**.

This environment cannot render one. Chromium is not installed, and Playwright downloads browsers
from `cdn.playwright.dev`, which is not reachable from the sandbox (egress is limited to the
package registries and GitHub). Every "run the browser" instruction in the mandate therefore has
one of two honest outcomes: assert it in a spec that CI executes, or record it as not produced.

Pretending a spec passed is the failure mode this ADR exists to prevent. A green table written from
memory is worse than a red one: it removes the reason to run the job.

## Decision

1. **The browser assertions are code, and they are in the spec.** `tests/admin-console-ux.spec.ts`
   now covers, per device class (320, 480, 768, 1024, 1441): document-level horizontal overflow,
   roving tab-strip focus (`ArrowRight`/`Home`/`End`), axe (WCAG 2.0/2.1/2.2 A+AA), and a visual
   baseline. It adds: dark and `forced-colors` runs at 320 px, an RTL run with mirrored arrow-key
   semantics, a 200 % text run, rendered 44 px target measurement at 320 and 480, a drawer focus
   trap with Escape and focus-return, and the four data states driven at the network layer.
   `npx playwright test tests/admin-console-ux.spec.ts --list` reports **290 tests** across the
   configured projects; the file is type-clean under `tsc --strict` and 0/0 under `oxlint`.
2. **The CI `e2e` job is the executor and therefore the gate.** It already exists in
   `.github/workflows/quality-gate.yml`: MariaDB service, migrations, `playwright install
   chromium`, `admin-console-ux.spec.ts` + `accessibility.spec.ts`, report upload. There is no
   `continue-on-error` and no `|| true` anywhere in it.
3. **`UX-DEVICE-MATRIX.md` marks every cell with the evidence class it actually has** — `S`
   (static audit, measured here), `C` (spec assertion, executed in CI), `?` (neither). No cell is a
   tick on the strength of prose.

## The items that remain unproduced here, and why that is recorded rather than hidden

**Visual baselines are not committed.** `toHaveScreenshot` compares against a PNG. A baseline can
only be produced by a browser run, so committing one from this environment would mean committing a
file nobody rendered. The policy is therefore:

- The first CI run of the `e2e` job on a branch fails with "snapshot does not exist" — by design,
  because an unbaselined screenshot is not a regression check.
- The baseline is produced by one deliberate run with `--update-snapshots` on a branch whose diff
  is reviewed by a human before merge. That is the "zero unreviewed diffs" requirement read
  literally: a diff that nobody looked at is what the requirement forbids, and a machine-generated
  baseline on the first run is exactly such a diff.
- After that, any pixel change beyond the 1 % tolerance fails the job.

**Lighthouse.** Not run here, and the mandate asks for an attached report. The budgets are declared
(`lighthouserc.*`: perf ≥ 0.90, a11y 1.0, best-practices ≥ 0.95, LCP ≤ 2500 ms, CLS ≤ 0.1, TBT
≤ 200 ms, ≤ 700 KB, 4G + 4× CPU) and the in-page Core Web Vitals assertion covers LCP and CLS on
the real console at `admin-console-ux.spec.ts:349`. The Lighthouse artefact itself is outstanding:
`npx lhci autorun --collect.url=http://localhost:4173/admin` on a machine with Chrome. Recorded in
`OPEN-ITEMS.md` as `OI-UX-3`, not in the matrix as a pass.

**Reduced motion has no browser assertion.** `index.css:215` honours
`prefers-reduced-motion: reduce`, and the console's only transition is a token colour change that
is not load-bearing. A spec assertion would have to prove the *absence* of a transition, which
Playwright cannot do reliably across engines without pinning timing; the CSS rule is the guarantee.
This is the one presentation with an `S` and no `C`, and it is named as such.

**Density modes are not implemented.** The mandate asks for density wired to the config registry.
There is no `ui.*` registry entry and no console control. Deferring it is a decision, not an
oversight, because a density control is not a CSS toggle in this codebase:

- it is a **persisted preference**, so it needs a registry entry (typed, with a default and a
  validation rule), an audit row on every change (INV-6), and a revision guard on the write
  (the `expectedRevision` contract in `services/configService.js`), plus a capability in
  `permissionVocabulary.js`;
- the alternative — `localStorage` per browser — would give two operators on the same console
  different layouts with no record of who changed what, which violates INV-6 for a value that
  affects what an operator sees.

**Acceptance criteria when it is built:** `ui.admin_density` in `backend/config/registry.js` with
values `comfortable|compact`, `scope: PLATFORM`, non-elevated; the console reads it through the
existing census, applies it as a root `data-density` attribute, and every spacing token resolves
through it; a config write produces exactly one audit row (already proven for every registry key by
`test/config-api.test.js`); the setting is asserted at 320 and 1441 px in the spec.

**Trigger:** build it with the next registry change, or immediately if an operator reports that the
console is too dense to scan at C4/C5, whichever comes first.

**Keyboard scripts for the auth screens and low-traffic authenticated screens** are not written
(`OI-UX-10`). The console's strip and one drawer are proven; the rest are named.

## Alternatives considered

1. **Write the matrix as if the browser runs had happened.** Rejected: it is the one thing this
   engagement has consistently refused to do, and it would remove the pressure to run the CI job.
2. **Install a browser from the package registry** (e.g. `puppeteer` with a bundled Chromium, or a
   Debian `chromium` package). Rejected: `puppeteer` downloads its browser from
   `storage.googleapis.com`, which is also unreachable; there is no `apt` egress. Attempting it
   would burn the session on a download that cannot complete.
3. **Run axe in jsdom** (`jest-axe`). Rejected: jsdom has no layout, so axe's target-size,
   colour-contrast and overflow rules cannot run — it would produce a green report that means less
   than the static audit already committed.
4. **Drop the browser gates from the matrix.** Rejected: they are the gates that catch the defects
   this console actually had (a 36 px dismiss button, a table that pushed the page sideways at
   320 px). Keeping them as `C` preserves the obligation.

## Rollback

Delete the added `test.describe` blocks in `admin-console-ux.spec.ts`; the file returns to five
device classes with overflow, axe and visual baseline only. No product code depends on it. The
matrix's `C` cells would then have to become `?`, which is why the removal belongs in a commit that
cites this ADR.
