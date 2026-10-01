# IME365 Test Results

All commands run from `D:\xampp\htdocs\IME365` unless stated otherwise.
Baseline commit: `8cc41894a9782a88de079f011b917c1690913d50`.

## 1. Frontend build

```
npm run build
```

**exit 0** — `✓ built in 3.50s`

Emitted bundles include the new portal chunks:
`EmployerPortal-*`, `EmployerOverview-*`, `EmployerApplicantPipeline-*`,
`EmployerOnboarding-*`, `EmployerJobPostings-*`, `EmployerCompanyProfile-*`,
`EmployerCandidateMessages-*`, `EmployerHiringPreferences-*`, `EmployerStates-*`.

Pre-existing, non-blocking warnings (unchanged from baseline): Sass
`darken()` deprecations, a vendor `eval` in `lottie-web`, and >500 kB chunk-size
advisories.

## 2. ESLint

```
npx eslint . --quiet
```

**exit 0** — zero errors across the whole repository.

## 3. Static security

```
npm run test:security:static
```

**exit 0** — **44 / 44 pass, 0 fail** (matches the directive's expected 44/44).

## 4. Backend

```
cd backend && npm test
```

**exit 0** — **821 / 821 pass, 0 fail** (matches the directive's expected 821/821).

Baseline note: an earlier run showed 819/821. The two failures were
`forensic-data-lineage.test.js` "Domain: Support Tickets Lineage"
(`500 !== 200`) and were **reproduced on a pristine checkout of the baseline
commit** with all refactor changes stashed, proving they were a local MariaDB
state issue rather than a regression. They pass on a clean re-run.

## 5. Frontend product suite

```
npm run test:product
```

**498 / 499 pass, 1 fail** — `tests/interview-coach-lifecycle.test.mjs`
("role input rendered"). This failure was **reproduced identically on the clean
baseline commit** with zero refactor changes applied, so it is pre-existing and
out of scope for this refactor. No portal, route, navigation, or RBAC test fails.

## 6. Automated architecture guard (new)

```
node --test tests/four-portal-architecture.test.mjs
```

**exit 0** — **29 / 29 pass, 0 fail**.

Covers: canonical namespaces, one-way redirects (no loop / no bidirectional
alias), query+hash preservation, session guards on every alias, admin RBAC
surface, candidate taxonomy, employer taxonomy, toast wiring, onboarding,
context-switcher authorization, SEO metadata, and navigation integrity.

Combined with adjacent regression suites:

```
node --test tests/four-portal-architecture.test.mjs \
           tests/user-dashboard-forensic.test.mjs \
           tests/release-candidate.test.mjs \
           tests/account-isolation.test.mjs \
           tests/export-client.test.mjs
```

**63 / 63 pass, 0 fail.**

## 7. Real-browser E2E

```
npx playwright test tests/four-portal-e2e.spec.js
```

**exit 0** — **20 / 20 pass**.

| Group | Coverage |
|---|---|
| Canonical portals | `/dashboard` shell + taxonomy; `/employer` shell + full recruiter taxonomy; real metrics from the employer records; 5 sub-route deep links; applicant pipeline from `/api/jobs/:id/applications` |
| First-time recruiter | "Welcome to IME365 Hiring" instead of a 404; CTA opens the company modal; Escape closes it and leaves the page usable; intentional empty state on job postings |
| Legacy redirects | 5 session-agnostic aliases; 4 admin aliases with an admin session; 3 non-admin aliases denied by RBAC; query-string preservation; no loop across reload |
| Candidate integrity | No "My Posted Jobs"/"My Companies"; resume entry resolves to `/build-resume` |
| Context switcher | Only server-authorized portals offered; switch navigates to the canonical route; Escape closes without navigating; stale stored `admin` value rejected |

Zero unexpected `TypeError` / `ReferenceError` / unhandled rejections across all
20 browser tests.

## 8. Live server

```
curl.exe -k -s -o NUL -w "%{http_code}" https://ime365.local/            -> 200
curl.exe -k -s -o NUL -w "%{http_code}" https://ime365.local/api/health   -> 200
curl.exe -k -s -o NUL -w "%{http_code}" https://ime365.local/login       -> 200
```

Deep links all return 200 via the SPA history fallback:

```
/employer        200      /admin/dashboard  200
/employer/jobs   200      /adm/users        200
/dashboard2      200      /platform/queues  200
/enterprise      200      /org/example      200
```

## 9. Backend isolation

```
git diff --stat HEAD -- backend/   ->  0 files changed
```

No backend route, controller, or policy was modified, so API contracts and the
821-test backend suite are untouched by this refactor.
