# P002 · C0 — Incoming-update integration and baseline

Directive: `prompt-002.md` ("IME365 — Final 10/10 Autonomous Engineering Directive").
Scope update honoured: commit `98f3449` limits this workstream to the **Candidate / User
Dashboard** (`frontend/src/pages/dashboard/` and related candidate routes). Employer, Admin
and Enterprise code is out of scope and is not modified.

Recorded: 2026-10-20 (UTC). Environment: Debian 12 sandbox, Node v22.22.3, npm 10.9.8,
2 vCPU / 3 GB RAM. Outbound network limited to GitHub, npm and PyPI.

## 1. Branch and commit relationships (verified, full SHAs)

| Item | Value |
|---|---|
| Working branch (session-assigned) | `arena/994d7b67-resumepilotai` |
| Branch start point | `3be1ddeb48a13a2fb5efe0a1ada1d689902d4b25` |
| `origin/main` at verification time | `98f3449a576cf94c5253bf1158b56b3e3846865c` |
| `origin/arena/8a774228-resumepilotai` | `98f3449a576cf94c5253bf1158b56b3e3846865c` (identical to `main`) |
| Incoming commit | `679af6be0997f182165661d4a1ef940115ef1518` |
| `679af6be` ancestor of branch HEAD? | **Yes** (`git merge-base --is-ancestor` exit 0) |
| Commits after `679af6be` | `ce8c6cc`, `371860f`, `3be1dde`, `98f3449` — all touch only `prompt-002.md` |
| Integration method | **Fast-forward** of the working branch from `3be1dde` to `98f3449` (`git merge --ff-only origin/main`). No cherry-pick, no merge commit, no conflicts. `679af6be` was already contained. |

The directive names `arena/8a774228-resumepilotai` as the development branch. This session is
bound to `arena/994d7b67-resumepilotai`, so all work is committed and pushed there. Neither
`main` nor `arena/8a774228-resumepilotai` is pushed to. Both are kept as read-only references.

## 2. Diff review of `679af6be`

`git show --stat 679af6be` reports 154 files changed (+431 / −403):

| Area | Change | Verification |
|---|---|---|
| `frontend/package.json` | `build` became `tsc -b && vite build && node ../scripts/sync-dist.mjs` | Sync runs only after a successful type-check and build (`&&` chain). Asserted by `tests/sync-dist-boundary.test.mjs`. |
| `scripts/sync-dist.mjs` (new, 28 lines) | Copies `frontend/dist` → `dist/` and prunes stale `index-*` and `smart-resume-document-*` assets | Reviewed line by line. See §3. |
| `docs/templates/evidence/Cv1..Cv100.html` | Regenerated server-rendered page-one markup (two-line change per file) | Re-ran `scripts/dir008-generate-template-evidence.mjs`. **All 100 HTML files were byte-identical** to the committed versions, so the evidence matches the current renderer. Only timestamps, the `thumbnailRegenerated` flag and contact-sheet JPEG bytes differed, and those were restored with `git checkout`. |
| `docs/templates/dir008-*` and `frontend/public/templates/Cv52..Cv100.JPG` | Inventory, contact sheet and thumbnails regenerated | `tests/dir008-template-evidence.test.mjs`: 6/6 pass. |

The template metadata removal described for this update (IDs, names, versions, categories,
"Verified ATS" labels in sidebars and footers) is **not** in `679af6be` itself. It landed in
`22ea95f`, `36ac50d` and `cb13717`, the ancestors immediately before it. A grep of
`frontend/src/components/resume`, `frontend/src/cv-templates` and
`frontend/src/lib/template-catalog.ts` found no remaining diagnostic labels. The regression
suite below passes.

## 3. `sync-dist` write-boundary verification and hardening

Original behaviour (resolved in this checkout):

- Source `/home/user/ResumePilotAi/frontend/dist`; destination `/home/user/ResumePilotAi/dist`.
  Both are derived from the script location, never from the cwd or the environment.
- Destination `dist/` is gitignored (`.gitignore`: `dist`). It cannot reach the reference-only
  `D:\xampp\htdocs\IME365` tree or any other path outside the repository.
- Deletion is limited to stale `index-*` and `smart-resume-document-*` files inside `dist/assets`.
  Other files in `dist/` (for example an operator `.htaccess`) are preserved by the merge copy.
- Output is generated before the sync because of the `&&` chain.
- Secrets: the build contains only Vite output. `VITE_*` values are inlined by design. Firebase
  web config is public client configuration.

Gaps found and fixed (workflow preserved, same command and same output directory):

1. `path.resolve` does not resolve symlinks. A `dist` symlink or junction pointing elsewhere
   would have redirected every write outside the repository. **Now refused**: the real
   destination must sit inside the real repository root.
2. A symlink nested inside `dist/` (for example `dist/assets`) could redirect individual
   writes. **Every write is now checked**: no writing through symlinks, and the parent must
   resolve inside the destination.
3. A partial build (no `index.html`) would still have been published. **Now refused**.
4. `.env*` files are excluded defensively.
5. `node scripts/sync-dist.mjs --check` prints the resolved plan without writing.

Regression suite `tests/sync-dist-boundary.test.mjs` (8 tests, temp-dir fixtures only):
**8/8 pass**. It covers merge and prune semantics, a `dist` symlink escape, a nested symlink
escape (the outside sentinel stays untouched), an incomplete build, missing output,
`.env` exclusion, real-repo path resolution, and the build-chain ordering.

## 4. Baseline results (before any surface work)

| Gate | Command | Exit | Duration | Result |
|---|---|---|---|---|
| Frontend deps | `cd frontend && npm ci` | 0 | 9.6 s | 245 packages |
| Backend deps | `cd backend && npm ci --ignore-scripts` | 0 | 5.8 s | 365 packages |
| Root deps (as shipped) | `npm ci --ignore-scripts` | **1** | 1.4 s | **Lockfile out of sync** (`proxy-agent@8.0.2` and 12 transitive entries missing). This is the step that fails every recent *Quality gate* run on `main`. |
| Root deps (after lock repair) | `npm ci --ignore-scripts` | 0 | 21.9 s | 1354 packages. Repair is purely additive: 13 entries added, 0 removed, 0 version changes. |
| Production build | `cd frontend && npm run build` | 0 | ≈16.4 s wall (`vite build` 1.35 s) | Sync copied 299 files into `dist/` |
| Type check | `cd frontend && npx tsc -b` | 0 | 14.7 s | 0 errors. Note: `tsconfig.app.json` has `"strict": false`, so this is not a strict-mode build. |
| Template regression | `node --test tests/test-footer-sidebar-cleanliness.mjs tests/dir008-template-deep-dives.test.mjs tests/template-production-render.test.mjs` | 0 | 11.6 s | **16/16 pass** |
| Template evidence integrity | `node --test tests/dir008-template-evidence.test.mjs` | 0 | ≈1 s | 6/6 pass |
| Frontend lint | `cd frontend && npx oxlint` | 0 | 0.4 s | 0 errors, 363 warnings (pre-existing) |
| Root lint (CI step) | `npm run lint` | **1** | 36.3 s | 9 errors, 203 warnings (pre-existing; would fail CI once install is fixed) |
| Static security (CI step) | `npm run test:security:static` | **1** | 12.3 s | 66/67 pass. The credential sentinel flags 14 tracked files (§5). |

Build warnings (all pre-existing, none introduced): Vite chunk-size advisory for
`index-*.js` (667.67 kB minified / 201.85 kB gzip) above the 500 kB limit; npm `EBADENGINE`
warnings for `@firebase/*` packages that request Node ≥ 24.12 (CI pins Node 22.18.0).

## 5. Pre-existing defects surfaced by the baseline

| ID | Severity | Finding | Disposition |
|---|---|---|---|
| B-1 | P0 (CI) | Root `package-lock.json` out of sync with `package.json`, so `npm ci` fails and every *Quality gate* run on `main` fails at "Install locked dependencies" | **Fixed** in this workstream (additive lock repair, verified with `npm ci`). |
| B-2 | P1 (CI) | `scripts/verify-mariadb-migrations.mjs` hardcodes `latestMigrationVersion !== '017'` while 26 migrations exist, so the migration gate fails on any engine. Its rollback phase also starts at `017.down.sql` while 018–026 remain applied. | Documented with a recommended fix (derive the latest version; roll back 026→018 before 017→005). Not changed here: the full gate must be validated on native MariaDB 11.4. |
| B-3 | P1 (security) | `frontend/src/providers/auth-provider.tsx` honours `localStorage.ime_dev_user` in **every** build, including production, so a forged `{ "role": "ADMIN" }` renders an authenticated admin UI shell. The backend still rejects the forged session (no valid token), so no data is exposed. `login.tsx` also fabricates a token-less session when preview login fails, and holds hardcoded demo passwords (credential sentinel). | Scheduled as shared candidate auth infrastructure (C2). |
| B-4 | P2 (hygiene) | Credential sentinel also flags `dist-legacy-backup/assets/*.js` (tracked build output with an embedded web API key), eight QA scripts under `scripts/` with hardcoded passwords, `tests/dir008-evidence-scan-efficacy.test.mjs`, and `frontend/src/components/enterprise/EnterpriseSecurityTab.tsx` | Documented. Enterprise code is out of scope by directive. The QA scripts should read credentials from the environment, and the exposed values should be rotated by the owner. |
| B-5 | P2 | Root `npm run lint` has 9 errors | Documented; outside candidate scope unless touched. |

## 6. Environment constraints and how they are handled

| Constraint | Handling |
|---|---|
| No native MariaDB, no Docker, no apt mirror | `scripts/dev-db/mariadb-sandbox-bridge.mjs`: a loopback-only MySQL wire endpoint backed by the real MariaDB engine compiled to WebAssembly (`lite4mariadb`, MariaDB 13.1.0-embedded). The backend connects unmodified with its normal `mysql2` pool. Fidelity suite: 9/9 pass. All 26 migrations apply cleanly through `initializeSchema()`. Evidence produced this way is labelled as such; CI and production use MariaDB 11.4. |
| No network path to Google (Firebase) | The repository's own non-production identity harness (`TEST_AUTH_HMAC_SECRET` → `rptest.` tokens through the unchanged `requireAuth` middleware; inert in `NODE_ENV=production`) and `/api/auth/preview-login`. Authentication is not bypassed. |
| Playwright browser CDN blocked | Chromium 153 from the `@sparticuz/chromium` npm tarball, launched without `--disable-web-security`. |
| Known sandbox-engine limitation | After the specific 012→011 rollback sequence, the WASM engine reports `credit_notes` as existing (Note 1050) although it cannot be opened. Not reproducible in minimal FK/ALTER cases and not cleared by `FLUSH TABLES`. The application's runtime DML is unaffected, but DDL rollback gates must run on native MariaDB. |
