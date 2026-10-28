# Environment-Gap Revalidation Register (V4)

**Revision:** `0adad00d0975444f13b98f9cda3ec7e24c2c6a62`
**Rule applied:** no gap is carried forward on the strength of the earlier report. Each entry below was
re-tested this pass; where a re-test was impossible without violating the standing constraints (no
credential fabrication, no blocked-download retries without new diagnostics), that is stated and the
gap is marked `UNCHANGED — BLOCKED`, not `CONFIRMED BY DEFAULT`.

Status vocabulary: `STILL BLOCKED` (reproduced), `CHANGED` (evidence differs from the report),
`NARROWED` (partially closed), `CLOSED` (verification now possible and done).

## Summary

| Entry | Subject | Earlier status | V4 status | New evidence |
|---|---|---|---|---|
| EG-007 | MariaDB 11.4 not provisionable | BLOCKED | **STILL BLOCKED** | 0 of 5 reachable hosts serve a server binary; 30 skips + 14 DB failures reproduced; repo gate still rejects MySQL 5.7 |
| EG-008 | Apache/PHP layer | BLOCKED | **STILL BLOCKED** | `httpd`, `apache2`, `php` all absent from `PATH` |
| EG-009 | Google Fonts unreachable | BLOCKED | **STILL BLOCKED** | `fonts.googleapis.com` → HTTP `000` (timeout 6 s) |
| EG-010 | Live provider credentials | BLOCKED | **STILL BLOCKED** | none present; none fabricated; mock coverage only |
| EG-011 | Candidate Playwright suite | BLOCKED | **STILL BLOCKED — and broader** | no browser binary at all, so *all* 7 spec files are blocked, not just the candidate suite |
| EG-012 | Harness artefacts ≠ product failures | recorded | **CONFIRMED, not re-observable** | no browser ⇒ no trace I/O; the distinction stands but cannot be re-exercised here |
| A11Y-001…005 | 5 WCAG 2.1 AA defects (1 critical) | RUNTIME VERIFIED (axe, temp env) | **CODE UNCHANGED — ratio not re-measurable** | all five cited code constructs still present verbatim; no axe run possible (no browser) |

---

## EG-007 — MariaDB 11.4 cannot be provisioned

**Re-test performed this pass.**

1. Binary probe: `command -v mariadb mysqld mysql` → all absent.
2. Container runtime: absent (no Docker/Podman socket).
3. Host sweep over the five reachable hosts: `registry.npmjs.org` serves connectors and an obsolete
   downloader; `pypi.org`/`files.pythonhosted.org` serve client libraries and `libaio` shims only;
   `github.com`/`codeload.github.com` serve source, and the two candidate MySQL/MariaDB binary mirrors
   were already established as unreachable by CDN in the earlier pass.
4. Repository gate: still rejects non-MariaDB engines (`target engine must be MariaDB`).
5. Executed suites reproduce the consequence exactly: **30 skipped** tests gated on
   `RUN_MARIADB_INTEGRATION=true` and **14 failures**, every one traceable to `ECONNREFUSED
   127.0.0.1:3306` or a handler `catch` converting that error into 500/503
   (`RUNTIME-VERIFICATION-V4.md` §3).

**No download was retried** — the standing rule forbids re-attempting blocked channels without new
diagnostics, and no new channel exists. **Impact unchanged:** tenant isolation (R-117), migration
correctness (R-119), persistence round-trips, and the DISC-020 defect class stay `BLOCKED` for
execution, though DISC-020 itself is statically proven.
**Closure:** run `RUN_MARIADB_INTEGRATION=true MARIADB_TEST_ALLOW_RESET=true` against `mariadb:11.4`
with a `DB_NAME` matching `/(?:^|[_-])(?:test|tests|ci|cert|sandbox|scratch)(?:[_-]|$)/i`.

## EG-008 — Apache/PHP layer not available

**Re-test:** `command -v httpd apache2 php` → all absent. `.htaccess` and `api/index.php` read statically
this pass: the rewrite rules route `/api` and `/v1` to `api/index.php`, and everything else falls back to
`index.html`, which is consistent with the `frontend` → `dist/` build pipeline (§ below).
**Still unverifiable:** header emission by `mod_headers`, SPA fallback behaviour, PHP proxy timeouts.
**Note:** `dist/` is not committed (`git ls-tree -r HEAD | grep -c '^dist/'` → 0), so the served bundle —
and its freshness — cannot be inspected even statically. That is a durable limitation of this
repository, not of the environment.

## EG-009 — Google Fonts unreachable

**Re-test:** `curl -m 6 https://fonts.googleapis.com/css2?family=Inter` → `000` (no response).
**Consequence:** any screenshot captured in this environment differs from a baseline captured with fonts,
so **no visual-regression claim may be made in either direction**. Not a product defect.

## EG-010 — Live third-party providers

**Re-test:** searched the working tree for provider credentials; none exist. Nothing was fabricated.
**Consequence:** payment initiation/webhook/invoice/refund/reconciliation, AI provider routing, storage,
Firebase identity and SMTP are verified only against mocks/contracts. Per the standing rule, a passing
mock test is evidence about the mock. This directly limits verdict level (R-118).

## EG-011 — Playwright suites

**Re-test, and a correction of scope.** The earlier entry described "the candidate dashboard suite"
(175 tests) as blocked. Measured this pass:

- `frontend/tests` contains **7** spec files.
- `playwright test --list` enumerates **3,675 tests across 21 files and 42 projects** (project × viewport
  expansion, including `[4k]`).
- **No browser binary exists**: `~/.cache/ms-playwright` absent; `chromium`/`chrome` absent from `PATH`;
  the backend suite logs `browserType.launch: Executable doesn't exist at …chromium_headless_shell-1234…`
  eleven times.

So the blocker is not the candidate suite — **every** suite is blocked, and `--list` is the only
executable operation. Two figures in the earlier package are therefore superseded: "175 candidate
tests" was one project's slice, and the 7-file inventory is the honest denominator.

## EG-012 — Harness artefacts are not product failures

No browser ⇒ no trace files ⇒ the original `browserContext.close: ENOENT …-recording*.network` artefact
cannot recur or be re-checked. The classification stands on the original log; it is **not** re-verified.

## Accessibility gap (DISC-008) — revalidated by code inspection

axe cannot run here (EG-011). Instead, each cited construct was re-read at `0adad00`:

| ID | Severity | Construct at `0adad00` | Status |
|---|---|---|---|
| A11Y-001 | serious | `landing.tsx:239` — `<div … aria-label="5 star rating">`, `aria-label` on a role-less `div` | **unchanged** |
| A11Y-002 | serious | `landing.tsx:79`, `:296` — `<Link aria-label="IME365 Home">` while the visible text is not contained in that name | **unchanged** (and the label is a symptom of the DISC-002 identity mismatch: `IME365` appears in **54** modern source files) |
| A11Y-003 | **critical** | `billing/pricing.tsx:264-272` — `role="switch"` + `aria-checked`, no accessible name | **unchanged** |
| A11Y-004 | serious | `billing/pricing.tsx:285` (`bg-emerald-500/10 text-emerald-600`) and `:335` (`text-ink-muted/60`) | **classes unchanged; ratio not re-measured** |
| A11Y-005 | serious | `billing/pricing.tsx:384` — `overflow-x-auto` container, no `tabindex`, no keyboard scroll | **unchanged** |

**What is proven:** four of five defects are provably still in the source, including the critical one; the
fifth's code is identical but its contrast ratio is a runtime measurement that cannot be repeated here.
**What is not proven:** axe's violation counts, screen-reader behaviour, and keyboard traversal. Automated
axe checks are in any case not evidence about assistive-technology usability — that limitation from the
earlier pass stands and is not downgraded by this revalidation.
