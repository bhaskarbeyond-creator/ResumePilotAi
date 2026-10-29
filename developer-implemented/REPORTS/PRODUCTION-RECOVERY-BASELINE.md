# Production-recovery baseline

**Captured:** 2026-10-29 (UTC; repository recovery session)<br>
**Repository:** `https://github.com/bhaskarbeyond-creator/ResumePilotAi.git`<br>
**Historical baseline:** `developer-review/` (read-only; 393 files)<br>
**Status:** Initial state verified before application-code edits. This record does not certify product readiness.

## Git and branch state

| Ref | Verified SHA | Finding |
|---|---|---|
| `main` | `aa24147245daa6c027d046f1f7ae6f8fc703be46` | Matches `origin/main`; GitHub default branch is `main`. |
| `dev` | `aa24147245daa6c027d046f1f7ae6f8fc703be46` | `origin/dev` exists and matches `origin/main`; no local `dev` branch was created. |
| `arena/76eeea4d-resumepilotai` | `aa24147245daa6c027d046f1f7ae6f8fc703be46` | Active session branch; exact same tree and commit as both delivery branches at baseline. |
| Requested prior implementation commit | `aa24147245daa6c027d046f1f7ae6f8fc703be46` | Exists, is the current head of `main`/`dev`, and is the Mandate 9B commit. |

The checkout initially arrived shallow. `git fetch --unshallow origin` and an explicit fetch of remote heads completed successfully. The full local history contains 1,509 commits. At baseline, `origin/main` and `origin/dev` have zero commits of divergence (`git rev-list --left-right --count origin/main...origin/dev` = `0 0`); `git diff --exit-code origin/main origin/dev` is clean, and their SHAs are identical. The checked-out `main` ref also matches the remote. The working tree was clean before the forensic inventory was written. The only current untracked path introduced during baseline capture is `developer-implemented/EVIDENCE/BASELINE/forensic-file-inventory.json`.

Recent verified implementation history includes `8c5bf151fb0d996224b6837c97db5da4c60f73fc` (partial implementation handoff), `30a309a5168ef9bffcc237dd5929cca867dff251` (initial profile concurrency guard), `40303f03579f71561cf74bec91d5f8d6a39f80fb` (contract/security evidence), `4ec5af2b43c9d723c686067c5167ce0b0c132ccc` (fail-closed payment/coupon path), `907fff9931be5212c936218edf605aef6335cbb3` (contact path), `f86e9b6bb6aff65c253c1f748c155fab6d62b83f` (queue telemetry), and `aa24147245daa6c027d046f1f7ae6f8fc703be46` (Mandate 9B closeout). The handover's cited branch names are historical: neither `mandate-9b-completion` nor its referenced feature branch is currently a remote head.

GitHub reports `main` as default and the authenticated viewer permission as `ADMIN`; there are no open pull requests at baseline. `git ls-remote --heads origin` reports only `main` and `dev`; these are the required active delivery branches. Historical/archive tags are present and are not branches. No obsolete remote feature branch was found to delete. Branch-protection inspection through `GET /branches/{main,dev}/protection` was denied with HTTP 403 `Resource not accessible by integration`; protection settings therefore remain unverified, not absent. No `.github/workflows/` configuration is present in this checkout.

## Forensic baseline integrity

Before application changes, a deterministic SHA-256 inventory was created at `developer-implemented/EVIDENCE/BASELINE/forensic-file-inventory.json`. It records every relative path, byte size, and SHA-256 under `developer-review/`. The inventory contains **393 files / 28,990,154 bytes**. The pre-existing `developer-implemented/BASELINE/developer-review-inventory.json` independently covers the same 393-file baseline, and `python3 developer-implemented/BASELINE/check-review-integrity.py` returned:

```text
PASS: 393 historical files unchanged (paths, sizes, SHA-256)
```

No `developer-review/` file was edited, moved, renamed, or deleted. A second full comparison is required after implementation and is reported separately; this initial pass is not a final integrity claim.

## Forensic and product state at the source-of-truth commit

The historical M8E report is an **audit-scope closure**, not a product-completion certificate. Its stated strict product baseline is 112 accepted capabilities: 13 full parity, 5 equivalent replacements, 51 partial, 28 missing, 12 mock/fabricated, and 3 unverified. The report itself gives only **11.61% strict full parity** and a final forensic verdict of `PARTIAL — BLOCKED`; it records **0% dynamic runtime/browser claim execution**. Its five additional capability proposals are provisional, not part of the accepted 112 denominator.

`developer-review/DISCREPANCY-LOG.md` includes numbered records DISC-001 through DISC-056 with two explicit merged aliases (DISC-042 and DISC-046), yielding 54 distinct roots plus all 56 original IDs/aliases that must remain traceable. The existing implementation handover marks selected Mandate 9B contracts as implemented, but its broad completion language is not accepted as proof for this recovery. All relevant current behavior will be rechecked against source, tests, persistence, and runtime.

Both `src/` and `frontend/` remain present. The historical report names `frontend/` as the modern application and identifies divergence from `src/`; no tree is deleted or retired in this recovery baseline.

## Environment and service availability

| Dependency | Baseline observation |
|---|---|
| Node.js / npm | Node `v22.22.3`; npm `10.9.8`. |
| Python | Python `3.11.2`. |
| Project dependencies | `node_modules/`, `frontend/node_modules/`, and `backend/node_modules/` are absent. Lockfiles are present. |
| Database | No MySQL/MariaDB listener on 3306 and no database daemon process detected. No `DATABASE_URL`, DB host/user/password, or `MYSQL_*` variables are set. |
| Browser | No Chromium, Chrome, or Firefox executable found on `PATH`; `PLAYWRIGHT_BROWSERS_PATH` is unset. |
| AI/email/payment credentials | No OpenAI/Anthropic/Google AI, SMTP/email, Stripe, or Razorpay credential variables are set. Values were not read or recorded. |
| Local environment files | Only `.env.example` was found at the repository root; no `.env`, `.env.local`, or `.env.production` file exists. |
| Test/build entry points | Root scripts delegate to frontend build/lint/Playwright, backend annotated tests, enterprise tests, and payment tests. Fourteen frontend Playwright spec files are tracked. |
| Deployment configuration | `.htaccess`, `ecosystem.config.js`, Firebase config, Vite config, and environment template exist; no GitHub Actions workflow exists. Actual target hosting/runtime is not provisioned or independently confirmed at baseline. |

No real AI, mail, or payment provider call, database migration, browser journey, or production deployment was possible at this baseline. These are environment observations, not conclusions that the code is correct or that the services are permanently unavailable. No live financial transaction or production-data operation was attempted.

## Baseline commands

- `git fetch --unshallow origin`
- `git fetch origin '+refs/heads/*:refs/remotes/origin/*'`
- `git ls-remote --heads origin`
- `git rev-list --left-right --count origin/main...origin/dev` → `0 0`
- `git diff --exit-code origin/main origin/dev` → exit `0`
- `python3 developer-implemented/BASELINE/check-review-integrity.py` → exit `0`, 393/393 files match
- SHA-256 inventory generator: inline Python over sorted `developer-review/**/*.file` paths; output `developer-implemented/EVIDENCE/BASELINE/forensic-file-inventory.json`
- `node --version`, `npm --version`, `python3 --version`, executable/dependency checks, listener/process checks, and presence-only checks for integration environment variable names (no values recorded)
- `gh repo view bhaskarbeyond-creator/ResumePilotAi --json nameWithOwner,url,defaultBranchRef,isPrivate,viewerPermission,deleteBranchOnMerge`
- `gh pr list --repo bhaskarbeyond-creator/ResumePilotAi --state open`
- `gh api repos/bhaskarbeyond-creator/ResumePilotAi/branches/{main,dev}/protection` → HTTP 403 for each; protection state not obtained
