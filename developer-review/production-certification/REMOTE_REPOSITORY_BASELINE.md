# REMOTE REPOSITORY BASELINE

**Gate:** G0 — Repository baseline and local implementation audit
**Prepared by:** Remote Developer (independent takeover)
**Date (UTC):** 2026-10-30
**Working branch:** `arena/9a6471c1-resumepilotai`
**Evidence directory:** `developer-review/production-certification/evidence/`

---

## 1. Purpose

This document establishes the verified Git and repository baseline for IME365 /
ResumePilotAi **as observed independently**, and reconciles it against the local
developer's handover claims. Where the handover and the repository disagree, the
repository is authoritative.

Every figure below is reproduced from a command whose raw output is stored in
`evidence/git-baseline-20261030.txt`.

---

## 2. Verified repository identity

| Item | Verified value | Command |
|---|---|---|
| Remote | `https://github.com/bhaskarbeyond-creator/ResumePilotAi.git` | `git remote -v` |
| Local HEAD | `025479b5899c82965295d8c9a359f83ef647980a` | `git rev-parse HEAD` |
| `origin/main` | `025479b5899c82965295d8c9a359f83ef647980a` | `git show-ref` |
| `origin/dev` | `025479b5899c82965295d8c9a359f83ef647980a` | GitHub API `/branches` |
| Default branch | `main` | GitHub API repo metadata |
| Repository visibility | public, not a fork | GitHub API repo metadata |
| Created | 2026-08-14T02:46:14Z | GitHub API repo metadata |
| Last push | 2026-10-30T21:19:42Z | GitHub API repo metadata |
| Tracked files | 4,255 | `git ls-files \| wc -l` |
| Working tree at takeover | clean | `git status --short` (empty) |

---

## 3. Handover claims versus observed reality

| # | Handover claim | Observed | Verdict |
|---|---|---|---|
| 1 | Latest revision `025479b5` | `025479b5899c…` is HEAD, `origin/main` and `origin/dev` | **CONFIRMED** |
| 2 | `origin/main` and `origin/dev` synchronized | Both refs resolve to the same SHA (GitHub API) | **CONFIRMED** |
| 3 | Commit `025479b5` exists | `git cat-file -t` → `commit` | **CONFIRMED** |
| 4 | `025479b5` is an ancestor of current branches | It **is** the tip of both branches | **CONFIRMED** (as tip) |
| 5 | Additional commits after `025479b5` | None. It is HEAD. | **CONFIRMED — none** |
| 6 | Migrations through 044 | 44 forward + 43 rollback files present | **CONFIRMED** |
| 7 | 620 automated tests, 620 passed, 0 failed, 0 skipped | 1,731 backend tests; 1,544 pass / 174 fail / 13 skipped in this environment | **NOT REPRODUCED** — see §6 |
| 8 | Reported branch history of 11 commits | **10 of the 11 SHAs do not exist in this repository** | **REFUTED** — see §4 |

---

## 4. FINDING RB-01 — WITHDRAWN (was: "the reported commit history does not exist")

> **CORRECTION, 2026-10-31.** This finding was **wrong** and is withdrawn. The
> Engineering Lead correctly identified the cause: this sandbox was a **shallow
> clone**. Verified: `git rev-parse --is-shallow-repository` returned `true` and
> `.git/shallow` existed, so `025479b5` was a *grafted* root with no parents —
> an artifact of the shallow fetch, not of the repository.
>
> After `git fetch --unshallow`:
>
> ```
> $ git rev-list --count HEAD            → 1589
> $ git rev-parse --is-shallow-repository → false
> $ git cat-file -t 78bcdc1c … 529e51fd   → commit   (all ten resolve)
> ```
>
> All eleven supplied SHAs exist, and `git log` reproduces the claimed ancestry
> order exactly (`025479b5` → `529e51fd` → `fd717427` → `88f3b536` → `a2257135`
> → `6ae9e5d9` → `e6c5a473` → `5677724a` → `29fb0756` → `dfda228d` → `78bcdc1c`).
> **Forensic commit inspection (directive §3.3) is therefore fully executable**
> and is not blocked. The methodological error was concluding "history absent"
> from a grafted root without first checking `--is-shallow-repository`.

The remainder of this section is retained only as the record of the retracted
claim and its superseding evidence.

### Original (incorrect) finding

The handover supplies an 11-commit ancestry for forensic inspection:

`78bcdc1c`, `dfda228d`, `29fb0756`, `5677724a`, `e6c5a473`, `6ae9e5d9`,
`a2257135`, `88f3b536`, `fd717427`, `529e51fd`, `025479b5`.

Independent verification:

```
$ git rev-list --count HEAD
1

$ for c in 78bcdc1c dfda228d 29fb0756 5677724a e6c5a473 6ae9e5d9 \
          a2257135 88f3b536 fd717427 529e51fd 025479b5; do
    printf "%s -> " "$c"; git cat-file -t "$c" 2>&1 | head -1; done
78bcdc1c -> fatal: Not a valid object name 78bcdc1c
dfda228d -> fatal: Not a valid object name dfda228d
29fb0756 -> fatal: Not a valid object name 29fb0756
5677724a -> fatal: Not a valid object name 5677724a
e6c5a473 -> fatal: Not a valid object name e6c5a473
6ae9e5d9 -> fatal: Not a valid object name 6ae9e5d9
a2257135 -> fatal: Not a valid object name a2257135
88f3b536 -> fatal: Not a valid object name 88f3b536
fd717427 -> fatal: Not a valid object name fd717427
529e51fd -> fatal: Not a valid object name 529e51fd
025479b5 -> commit
```

**Result:** the repository contains exactly **one** commit. Only `025479b5`
exists. The ten earlier revisions named in the handover are not present as
objects, so no ancestry, no per-commit diff, and no authorship trail can be
reconstructed from this repository.

### Consequences for the assignment

1. **Forensic commit inspection (§3.3 of the directive) is not executable as
   written.** "Run source-code comparisons" between the listed revisions has no
   objects to compare. This is an external data-availability limit, not an
   engineering omission.
2. **The history was collapsed.** A single commit containing 4,255 files with the
   commit message *"feat(reconciliation): implement WebRTC audio streaming,
   Wasabi S3 telemetry & reconcile canonical truth scorecards (620/620 green)"*
   is consistent with a squash or a fresh initial push, not with incremental
   development history.
3. **Branch protection is not in force.** The GitHub API reports
   `"protected": false` for both `main` and `dev`. The directive requires
   protecting these branches.
4. **No lost local work can be detected**, because there is no prior remote
   state to diff against. Any work that existed only in the local developer's
   working tree and was never committed is unrecoverable from here.

### Required Project Owner / Engineering Lead action

Either (a) confirm that the ten revisions were intentionally discarded by a
squash, and accept that per-commit forensics is out of scope; or (b) provide
access to the repository or bundle that still contains that history so the
ancestry review can be completed.

---

## 5. Migration inventory — 001 through 044

Verified from `backend/database/migrations/`:

- **87** SQL files total.
- **44** forward migrations: `001_baseline.sql` … `044_payment_bank_settlement_ledger.sql`.
- **43** rollback scripts: `002…down.sql` … `044…down.sql`.
- `001_baseline.sql` has **no** `.down.sql`. This is expected for a baseline and
  is recorded here as an accepted asymmetry, not a defect.

The seven migrations called out for special attention are all present:

| Migration | File present | Rollback present |
|---|---|---|
| 038 voice interview infrastructure | yes | yes |
| 039 tenant branding | yes | yes |
| 040 tenant custom domains and SSL | yes | yes |
| 041 IP access rules and jail | yes | yes |
| 042 portfolio gallery and protection | yes | yes |
| 043 candidate ATS ranking | yes | yes |
| 044 payment bank settlement ledger | yes | yes |

Presence is verified. **Schema-level execution against MariaDB is not yet
verified** — see §7.

---

## 6. FINDING RB-02 — CORRECTED: 620 is the curated master suite, and it is reproducible

> **CORRECTION, 2026-10-31.** This finding was **wrong as stated** and is
> corrected. `backend/scripts/run-all-verified-tests.js` exists (3,252 bytes) and
> is the curated master runner behind the 620 figure. It assembles
> `developer-implemented/TESTS/unit/*.test.mjs` (18 files) plus an explicit list
> of backend integration files (24 at revision `0d1a52fc`) — **42 files** — and
> prints `Executing 42 test files with live MariaDB integration`.
>
> The methodological error: this runner is **not referenced by any
> `package.json` script**, so auditing only `npm test` / `npm run test:*` missed
> it. The 1,716 figure I reported is the raw TAP crawl of all 224 files produced
> by `run-tests-with-annotations.js`, a different and much broader population.
>
> `0d1a52fc` added exactly one line to the curated list —
> `backend/test/enterprise-team-lead-contract.test.js` — so 620 + 15 = **635** is
> internally consistent with the 15 tests added in `03a52f57`.
>
> **Independently reproduced, 2026-10-31.** Once a live database was available
> (see the addendum to `LOCAL_IMPLEMENTATION_FORENSIC_AUDIT.md`), the curated
> runner returned:
>
> | Run | Tests | Pass | Fail | Skipped | Exit |
> |---|---:|---:|---:|---:|---:|
> | 1 (freshly reset DB) | 605 | 605 | 0 | 0 | 0 |
> | 2 | **635** | **635** | 0 | 0 | 0 |
> | 3 | 621 | 621 | 0 | 0 | 0 |
>
> **635/635 was reproduced exactly**, confirming 620 + the 15 tests added in
> `03a52f57`. Zero failures with exit 0 was stable across all three runs.
>
> **Residual caveat, recorded not glossed:** the *count* is not deterministic —
> 605, 635 and 621 from the same revision — because data-driven subtests depend
> on accumulated database state. Green is reproducible; the specific denominator
> is a function of what the database already contains. A certification figure
> quoted as a fixed count will drift.
>
> Two environment prerequisites were required and are easy to miss: the
> `frontend` workspace's dependencies must be installed (eight
> `mandate11*.test.mjs` files import `frontend/src/lib/billing-invoices.ts`,
> which imports `dompurify`; without them the files crash at load with
> `ERR_MODULE_NOT_FOUND`), and `TEST_AUTH_HMAC_SECRET` must be set.

### Superseded measurement (raw TAP crawl, not the curated suite)

The handover reports *"Test cases: 620, Passed: 620, Failed: 0, Skipped: 0"*.

Actual results from the repository's own runners on this baseline:

| Suite | Command | Tests | Pass | Fail | Skipped | Exit |
|---|---|---:|---:|---:|---:|---:|
| Backend | `npm --prefix backend test` | 1,716 | 1,527 | 176 | 13 | 1 |
| Enterprise | `npm --prefix backend run test:enterprise` | 187 | 186 | 1 | 0 | 1 |
| Security | `npm run test:security` | n/a | pass | — | — | 0 |

Test-file inventory: **199** files in `backend/test/`, **25** in
`backend/enterprise-test/`.

The reported denominator of 620 does not correspond to any suite total this
repository produces. The backend suite alone reports 1,716 TAP tests. The claim
of *zero* skips is also not reproducible: 13 tests skip in the baseline run.

Two independent conclusions follow:

1. The 620 figure is either stale (measured against an earlier, smaller suite) or
   was derived from a subset. It must not be carried forward as the baseline
   denominator.
2. `RUN_MARIADB_INTEGRATION` defaults to `'true'` in
   `backend/scripts/run-tests-with-annotations.js`, so the suite attempts real
   MariaDB integration by default and fails hard when no server is reachable.
   A "620/620 green" result therefore implies a live MariaDB was present in the
   local environment.

---

## 7. Environment constraints in this verification sandbox

These are hard limits of the takeover environment and are recorded so that no
claim is later mistaken for a product defect.

| Requirement | Status | Evidence |
|---|---|---|
| Node.js | v22.22.3 available | `node -v` |
| npm | 10.9.8 available | `npm -v` |
| Backend dependencies | installed (351 packages) | `npm install` log |
| Frontend dependencies | installed (281 packages) | `npm install` log |
| Frontend production build | **passes** (`tsc -b` + vite, 355 files synced) | `evidence/frontend-build-20261030.log` |
| MariaDB / MySQL server | **not installed and not installable** | no `mysqld`/`mariadbd` on PATH |
| OS package installation | **blocked** | `deb.debian.org` returns HTTP 000; `apt-get update` fails with `Permission denied` on `/var/lib/apt/lists/partial` |
| Outbound network | restricted to github.com, api.github.com, registry.npmjs.org, pypi.org, files.pythonhosted.org | reachability probe |
| Live third-party providers | **unreachable** (Stripe, Razorpay, Paytm, LiveKit/Mediasoup, Wasabi/S3, Firebase, Let's Encrypt, SMTP) | network policy |

**Consequence:** the 174 remaining backend failures cannot be closed in this
sandbox, because they are integration tests that require a MariaDB server. They
are classified in `LOCAL_IMPLEMENTATION_FORENSIC_AUDIT.md` rather than assumed
away.

Note also a dependency-engine mismatch surfaced during install:
`@firebase/storage@0.14.6` and `@firebase/storage-compat@0.4.6` declare
`node >= 24.12.0` while the toolchain here is Node 22.22.3 (`EBADENGINE`
warnings). This is recorded as an open compatibility question for the
infrastructure plan, not yet triaged.

---

## 8. Baseline established

* Authoritative baseline revision: **`025479b5899c82965295d8c9a359f83ef647980a`**.
* `origin/main` and `origin/dev` are synchronized at that revision.
* Working tree was clean at takeover; no uncommitted local work was found.
* Migrations 001–044 are present on disk.
* Baseline automated results are recorded above and archived as raw logs.
* Two baseline findings are raised: **RB-01** (reported history absent) and
  **RB-02** (620-test claim not reproducible).

Gate **G0** is submitted for Engineering Lead review on this evidence.
