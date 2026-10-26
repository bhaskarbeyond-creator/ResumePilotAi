# ADR-006 — The coverage gate sits at the bar, and a test proves it can fail

**Status:** Accepted · **Date:** 2026-10-26 · **Commit:** `[REC-020|REC-017|INV-6]`
**Invariants:** INV-1 … INV-6 (indirectly: every claim in the pack rests on these gates)

## Context

The first version of `TEST-EVIDENCE.md` reported the branch coverage honestly — 82.52 %
measured against an 80 % floor — and recorded the 10/10 bar's 85 % as an "honest gap". Two
things were wrong with that arrangement, and neither was the number:

1. **The floor had been set below the bar from the start.** A gate at 80 % can never report the
   85 % the mandate requires, so the document and the tool disagreed permanently.
2. **`.c8rc.json` and the `check-coverage` line in `package.json` disagreed with each other**
   (`per-file: true`, branches 60 in the rc file; `--per-file=false`, branches 80 in the
   script). Whichever c8 honoured, the other was decoration.

While closing the gap with tests, two product defects surfaced (`services/configService.js`,
`routes/config.js`) that no amount of reading had found. That is the argument for a coverage
floor in one sentence: the tests that raise the number are the tests that find the bugs.

## Decision

- One set of thresholds, in both places: **statements 95, lines 95, functions 90, branches 85**,
  `per-file: false`.
- 85 is the bar's number, not the measured number rounded down. Measured values sit above it
  (98.60 / 98.60 / 97.53 / 86.68), so a small regression fails rather than erodes.
- The gate is demonstrated to fail: with the thresholds raised to 99, `c8 check-coverage` exits
  1 on the same data. This is a documented command, not a one-off observation.
- Per-file coverage is not gated. Four modules are under 85 % branches and their remainders are
  `pool.query` error arms. That is recorded as `OI-T-7` with the reason and the next action, not
  hidden by an exemption list.

## Consequences

- **Positive.** A percentage in the pack cannot be true while the gate is false; the two now
  read the same numbers from the same configuration.
- **Positive.** Scope is explicit: raising coverage means adding a named suite, and the three
  closers added here (`config-edge-coverage`, `admin-rbac-edge-coverage`,
  `config-registry-guards`) are where a future failure will land first.
- **Negative.** A per-file regression inside `routes/config.js` could sit behind healthy global
  numbers. Mitigation: all four modules are also covered end-to-end by the API suites, so a
  behavioural defect fails a behaviour test regardless of the percentage.
- **Negative.** `include` is a manual list. A new module silently outside it is not measured at
  all; the mitigation is that adding a module to the control plane means touching the registry,
  the route manifest and `.c8rc.json`, and the first two are themselves tested.
