# ENGINEERING_BASELINE

## Verified source baseline
| Item | Value |
| --- | --- |
| Repository | https://github.com/bhaskarbeyond-creator/ResumePilotAi.git |
| Default branch | `main` (verified: `origin/HEAD -> origin/main`) |
| Base commit (full) | `01d9e5eb321c133d98c72143d016c1ad713f6286` |
| Base commit (short) | `01d9e5eb` |
| Base commit subject | fix(admin): keep pre-save key probes scoped to saved destinations and format Cloudflare keys |
| Other remote branches | `dev`, `arena/12d75a56-resumepilotai` (not used as baseline) |
| Acquisition method | read-only `git clone` + detached `git worktree` — **no remote write of any kind** |
| Tracked files | 5,427 · working tree ~355 MB |

## Verified technology stack (from source, manifests and lockfiles — not from documentation claims)
- **Authoritative frontend:** `frontend/` — React 19, Vite 8, TypeScript ~6, Tailwind 4, Radix UI, TanStack Query/Table, Zod, axios, Firebase (**auth only**), dompurify, mammoth, pdfjs-dist.
- **Publication path:** `frontend/package.json -> build` = `tsc -b && vite build && node ../scripts/sync-dist.mjs`, which publishes `frontend/dist` into the Apache DocumentRoot `dist/`.
- **Legacy frontend:** root `src/` — React 18 JSX tree, 651 modules / 192,769 LOC, built by root `vite.config.js`. Retained and heavily test-guarded but **not** the tree published by `npm run build`.
- **Backend:** `backend/` — Node.js + Express, MariaDB/MySQL (`mysql2`), Firebase Admin, Helmet, express-rate-limit, multer, sharp, nodemailer, docx, Stripe, paytmchecksum, node-fetch.
- **Schema authority:** `backend/database/migrations/001_baseline.sql` + `backend/database/migrationRunner.js`.
- **Operations:** `.htaccess`, `ecosystem.config.js`, `ops/deploy`, `ops/dr`, 3 GitHub workflows (`quality-gate`, `production-release`, `ai-engine-validation`).
- **Test frameworks:** `node:test` (root `tests/` 379 files, `backend/test/` 124 files), Playwright configs, oxlint + ESLint.

## Baseline build/test status (measured before any modification)
| Check | Command | Result |
| --- | --- | --- |
| Dependency install (root) | `npm ci` | OK — 1,300 packages |
| Dependency install (backend) | `npm ci --prefix backend` | OK — 346 packages |
| Dependency install (frontend) | `npm ci --prefix frontend` | OK — 280 packages (EBADENGINE: `@firebase/*` request Node >=24.12.0, sandbox has v22.23.2 — warning only) |
| Production build | `npm run build` | **PASS** (exit 0) |
| Static security gates | `npm run test:security:static` | **PASS** 71/71 |
| Product regression suite | `npm run test:product` | **PASS** (exit 0) |
| Backend suite | `npm --prefix backend test` | **1035 tests / 1001 pass / 34 fail** |
| Dependency audit (root, prod) | `npm audit --omit=dev` | 0 vulnerabilities |
| Dependency audit (backend, prod) | `npm audit --omit=dev --prefix backend` | 0 vulnerabilities |
| Dependency audit (frontend, prod) | `npm audit --omit=dev --prefix frontend` | **3 moderate** (`sprintf-js` <- `argparse` <- `mammoth`) — **not covered by any CI gate at baseline** |

## Material environmental restrictions
1. **No MariaDB/MySQL server can be provisioned in this sandbox.** `command -v mysqld|mariadbd` returns nothing and `apt-get` fails with `E: Unable to acquire the dpkg frontend lock ... are you root?`. 266 `ECONNREFUSED 127.0.0.1:3306` occurrences appear in the backend log. **All 34 baseline backend failures are attributable to this**, verified individually: each is either `error: 'connect ECONNREFUSED 127.0.0.1:3306'` or an HTTP `503` produced by the DB-unavailable path.
2. **Playwright browsers are not installed** (`browserType.launch: Executable doesn't exist at .../chrome-headless-shell-linux64/chrome-headless-shell`), so PDF/print export and browser UAT suites cannot execute here.
3. **No live external credentials** (Firebase, Stripe, Paytm, AI providers, Twilio, SMTP) are present in the sandbox; live integration verification is out of reach and is classified BLOCKED, never inferred.

## Major risks recorded at baseline
- **R1 (accepted, P1):** divergent optimistic-concurrency revision normalization between backend guards and frontend clients — see `DEFECT_LEDGER.md` DEF-001.
- **R2 (accepted, P1):** the production dependency-audit gate omitted the frontend that is actually published to the DocumentRoot.
- **R3 (documented, not silently changed):** two parallel frontend trees with skewed test coverage (115 root `tests/` files read `src/`; 8 read `frontend/src`).
- **R4:** DB-integration verification is environmentally blocked in this sandbox; it must be executed by the operator before release sign-off.
