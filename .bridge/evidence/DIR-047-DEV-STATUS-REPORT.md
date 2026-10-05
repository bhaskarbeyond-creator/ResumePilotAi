# DIR-047 — Developer Status Report & Certification Blockers

**Directive:** DIR-047 — Master Full-Platform Testing & Universal UAT 10/10 Certification
**Project root (verified):** `D:\xampp\htdocs\IME365`
**Branch / HEAD:** `arena/01a0e100-resumepilotai` @ `c4bfabcd`
**Mode:** ACT (authorized)
**Reported by:** STAFF_DEVELOPER (Cline)
**Date:** 2026-10-05

---

## 0. VERDICT UP FRONT — DIR-047 CANNOT YET BE CERTIFIED 10/10

Two hard blockers stand between the current tree and a 10/10 seal. Neither is a
test-authoring gap; the suite is written and green. They are:

1. **[BLOCKER-1] Invariant #5 is FAILING on authoritative measurement.** The
   [SWOT-S] "production build under 4.0s" bar is breached: median **4688ms**
   against a 4000ms budget, with **all 7** cold-cache runs over (min 4139ms).
   Source: `.bridge/evidence/dir047-build-budget.json` → `"verdict": "FAIL"`.
2. **[BLOCKER-2] The shell terminal in this session is non-functional**, so no
   command of any kind could be executed. That prevents re-running the harness,
   emitting heartbeats, and submitting evidence via `bridge dev submit-evidence`.
   `DIR-047.json` therefore still carries `"evidence": null`.

**No test result in this report is fabricated.** Every number below is quoted from
an artifact that already exists on disk, with its path and timestamp given so the
Gatekeeper can open and re-verify it independently.

---

## 1. ENVIRONMENT BLOCKER — TERMINAL NON-FUNCTIONAL

Seven consecutive command attempts failed across three distinct invocation styles.
Every attempt returned the same outcome: *"Command completion could not be
observed"*, exit code 1, no stdout.

| # | Command attempted | Result |
|---|-------------------|--------|
| 1 | `cd ...; git rev-parse --abbrev-ref HEAD` | exit 1, no output |
| 2 | `bridge status` | exit 1, no output |
| 3 | `bridge inbox --role dev` | exit 1, no output |
| 4 | `Get-ChildItem -Force` | exit 1, no output |
| 5 | `Get-Location` / `echo hello` / `dir` | exit 1, no output |
| 6 | `cmd /c "cd /d ... && dir /b"` | exit 1, no output |
| 7 | `powershell.exe -NoProfile -Command "Write-Output PING"` / `node --version` | exit 1, no output |

Because even `echo hello` and `node --version` produce nothing, this is an
environment/IDE shell-integration fault, **not** a project or Node.js fault.

### Consequences (plan steps that could NOT be executed)
- Step 5 — cannot re-measure or remediate the build budget.
- Step 6 — cannot run `lint`, `test:security`, `test:product`, backend suite, `build`.
- Step 7 — cannot execute the live DOM crawl or retain new PNG/JSON artifacts.
- Step 8 — cannot run `bridge dev submit-evidence` or `bridge dev heartbeat`.

Per the Zero-Fabrication invariant, these steps are reported as **NOT EXECUTED**
rather than being back-filled with plausible-looking output.

---

## 2. WORK VERIFIED ALREADY COMPLETE (by direct file inspection)

Contrary to the plan's premise, the primary deliverables were **already authored
and executed green in a prior session**. Verified by reading each artifact:

| Plan step | Deliverable | State | Evidence |
|---|---|---|---|
| 1 | Route census generator | ✅ present | `scripts/dir047-route-census.mjs` |
| 1 | Route census report | ✅ generated | `.bridge/evidence/dir047-route-census.json` |
| 2 | Hermetic Playwright config | ✅ present | `playwright.dir047.config.js` |
| 3 | Universal SWOT UAT suite | ✅ present, 1310 lines | `tests/e2e/universal-swot-uat.spec.js` |
| 4 | Cuba token migration | ✅ complete | see §3 |
| 5 | Build-budget harnesses | ✅ present | `scripts/dir047-build-{budget,attribution,variants,launcher-ab}.mjs` |
| 5 | Build budget **passes** | ❌ **FAIL** | see §4 |

### Browser suite result — REAL, GREEN, PREVIOUSLY CAPTURED
`.bridge/evidence/dir047-results.json` (run start `2026-10-05T14:37:07Z`,
duration 843,448ms):

```
stats: expected 9 | skipped 0 | unexpected 0 | flaky 0
errors: []
```

| Test | Status | Duration |
|---|---|---|
| AC-1 [SWOT-S] zero-byte diff + 51 CV & 4 cover templates render | passed | 47,977ms |
| AC-2 [SWOT-W] 16 locales, DOM style restore, zero-setTimeout | passed | 5,510ms |
| AC-3 [SWOT-O] @ 375px | passed | 128,215ms |
| AC-3 [SWOT-O] @ 768px | passed | 138,161ms |
| AC-3 [SWOT-O] @ 1024px | passed | 157,890ms |
| AC-3 [SWOT-O] @ 1280px | passed | 144,546ms |
| AC-3 [SWOT-O] @ 1920px | passed | 170,003ms |
| AC-4 [SWOT-T] tenant isolation, secrets, XSS, axe-core AA light+dark | passed | 39,127ms |
| AC-5 [SWOT-UAT] continuous 4-portal journey | passed | 9,485ms |

**All five canonical breakpoints** required by `DIR-047.json ->
verification.canonicalBreakpoints` (375, 768, 1024, 1280, 1920) were crawled and
passed. An earlier revision of this table listed only four rows and carried three
mis-transcribed durations; it has been corrected in place against the reporter
JSON. See §5.1.

Config confirms hermetic execution: `"webServer": null`, `"workers": 1`,
`"actualWorkers": 1`, timeout 900,000ms.

---

## 3. INVARIANT #2 (TOKEN ADHERENCE) — VERIFIED SATISFIED

DIR-046 recon recorded the entire residual hex burden as **8 hits in
`src/components/cuba/CubaAppShell.jsx`**. All 8 are now eliminated, verified by
reading the live source:

| DIR-046 reported residue | Current state | Verified at |
|---|---|---|
| L80 `hover:bg-[#f3f4fd]` + 2x `hover:text-[#7366ff]` | `hover:bg-cuba-primary-soft-hover hover:text-cuba-primary-ink-strong` | `CubaAppShell.jsx:80` |
| L91 `bg-[#7366ff]/10 text-[#7366ff]` | `bg-cuba-primary-soft text-cuba-primary-ink-strong` | `CubaAppShell.jsx:91` |
| L363 `from-[#7366ff] to-[#5949d6]` | `from-cuba-primary to-cuba-primary-fill` | `CubaAppShell.jsx:374` |
| L403 `from-[#7366ff] to-[#5949d6]` | `from-cuba-primary to-cuba-primary-fill` | `CubaAppShell.jsx:414` |

`src/components/cuba/CubaStatCard.jsx` is likewise fully token-based; its
`ACCENT_TOKENS` map (L21-47) carries a documented 1:1 equivalence
(`#7366ff` -> `--cuba-primary`, `rgba(115,102,255,.10)` -> `--cuba-primary-soft`,
text -> `--cuba-primary-ink-strong`) and notes that naming the token directly
**fixes a dark-mode inversion** rather than merely restyling.

The only remaining `#7366ff` occurrence in these files is at `CubaAppShell.jsx:383`
— **inside a prose comment** explaining why the AA-safe token is used instead of
the raw brand violet (3.8:1 fails AA; the token gives 6.92:1). That is
documentation, not an arbitrary override, and must not be counted as a violation.

---

## 4. BLOCKER-1 — INVARIANT #5 (BUILD BUDGET) IS FAILING

The [SWOT-S] "clean production build under 4.0s" invariant is **breached on the
authoritative metric**. Three independent harnesses agree:

| Artifact | Timestamp | Metric | Median wall | Verdict |
|---|---|---|---|---|
| `dir047-build-attribution.json` | 11:12:27Z | `npm run build` | 4535ms | **FAIL** |
| `dir047-build-launcher-ab.json` | 16:02:03Z | best launcher variant | 4381ms | **FAIL** (`treatmentUnderBudget: false`) |
| `dir047-build-budget.json` | 16:44:27Z | real `npm run build`, 7 cold runs | **4688ms** | **FAIL** |

`dir047-build-budget.json` runs (ms): `4897, 4325, 4139, 4880, 4688, 4489, 4715`.
**Every single run exceeds 4000ms**; the minimum is 4139ms. `allRunsExitedZero:
true`, so the build *succeeds* — it is purely too slow.

### Root cause is precisely attributed (this is NOT a measurement artifact)
- The **bundling work itself is already inside budget**: vite-reported medians are
  ~3440ms (`vite-bin-direct`) to ~3580ms (`npm run build`).
- The overage is **Windows process startup + module resolution**: measured at
  **691ms** for a direct vite-bin launch and **955ms** for `npm run build`
  (`dir047-build-attribution.json` -> `startupOverheadMs`).
- Removing the `cmd.exe` layer and the `vite.cmd` bin shim saves **~835ms**
  (`deltaMs: -835`) but still lands at a 4381ms median — **381ms over budget**.

### Required remediation (Lead decision)
Closing the last ~381ms needs a **real reduction in bundle/transform work** — e.g.
further entry/chunk trimming, dependency pruning, or deferring a heavy plugin.
It must **not** be closed by a favourable re-run: the approved plan explicitly
forbade that ("needs a cold-cache baseline plus real remediation, not a favorable
re-run"). Alternatively the Lead may formally re-baseline the bar, but that is a
Lead ruling, not a developer decision.

---

## 5. SESSION ADDENDUM — INDEPENDENT RE-VERIFICATION (second ACT session, 2026-10-05)

A second ACT session re-verified this report **from disk** rather than trusting
it. Two outcomes: one evidence-integrity defect found and corrected, and the
environment blocker confirmed still active.

### 5.1 CORRECTED — the AC-3 table in §2 was mis-transcribed (now fixed in place)

The authoritative reporter output `.bridge/evidence/dir047-results.json`
(`stats`: `expected 9 | skipped 0 | unexpected 0 | flaky 0`, `errors: []`)
contains **five** AC-3 breakpoint specs, not four. The previous revision of §2
listed only 375/768/1280/1920 and carried three wrong durations. The corrected
values below are quoted verbatim from the JSON:

| Spec | `status` | `duration` (ms) | `startTime` |
|---|---|---|---|
| AC-1 [SWOT-S] zero-byte diff + 51 CV & 4 cover templates | passed | 47,977 | 14:37:08.248Z |
| AC-2 [SWOT-W] 16 locales, DOM style restore, zero-setTimeout | passed | 5,510 | 14:37:56.756Z |
| AC-3 [SWOT-O] @ 375px | passed | 128,215 | 14:38:02.283Z |
| AC-3 [SWOT-O] @ 768px | passed | 138,161 | 14:40:10.512Z |
| AC-3 [SWOT-O] @ **1024px** (previously omitted) | passed | 157,890 | 14:42:28.690Z |
| AC-3 [SWOT-O] @ 1280px | passed | 144,546 | 14:45:06.598Z |
| AC-3 [SWOT-O] @ 1920px | passed | 170,003 | 14:47:31.160Z |
| AC-4 [SWOT-T] tenant isolation, secrets, XSS, axe-core AA light+dark | passed | 39,127 | 14:50:21.181Z |
| AC-5 [SWOT-UAT] continuous 4-portal journey | passed | 9,485 | 14:51:00.323Z |

Nine rows = `expected: 9`, so the census reconciles exactly. The 1024px spec is
present at `dir047-results.json:237` with `"ok": true`.

The only stderr recorded anywhere in the run is the pre-existing Dart Sass
`darken()` / `global-builtin` deprecation warning emitted from
`src/index.scss:97,153,154`. That is a warning, not a failure, and is unrelated
to DIR-047.

**Why this correction matters for certification:** a Gatekeeper reading the old
table would have concluded that a *mandated* breakpoint (1024px) was never
crawled — a false rejection of a genuinely green run.

### 5.2 BLOCKER-2 CONFIRMED STILL ACTIVE — terminal non-functional

Six further command attempts in this session failed identically (exit code 1,
"Command completion could not be observed", no stdout), across invocation styles
not previously tried: `Get-Location`, `echo hello`, `Write-Output ok`,
`cmd /c dir /b D:\xampp\htdocs\IME365`, and
`C:\Windows\System32\cmd.exe /c echo TERMINAL_ALIVE`.

**New falsifiable proof that commands never execute at all** — stronger than
"no stdout was returned". This command was issued:

    node -v *> D:\xampp\htdocs\IME365\.bridge\tmp-nodever.txt

A subsequent direct filesystem read of that path returned
`ENOENT: no such file or directory`. Had the shell executed anything, the
redirect would have created the file. It did not. The shell is therefore not
returning empty output — **it is not running commands**.


