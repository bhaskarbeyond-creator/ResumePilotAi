# DIR-058 — Implementation Evidence

**Directive:** DIR-058 — Candidate Dashboard Real MariaDB Metrics Aggregation &
Multi-Step Onboarding (P1). Plan approved by the Lead; ACT authorised.

---

## 1. IDENTIFY → PROVE (the three proven defects)

**1. `getStatesOfUser` was a hardcoded stub.** `src/services/api/platform.js:1898`
returned `[]` — an ARRAY, not a stats object — so both consumers were broken by
construction:
- `DashboardHomepage.jsx:287` → `stats.documentsGenerated || 0` → **permanently 0**
- `DashboardActions.jsx:32` → spreads it (`{...[]}` = `{}`) → counters **0 forever**

**2. The onboarding checklist had exactly ONE hardcoded step.**
`DashboardHomepage.jsx:74-89` — a single step (`id: 1`, `completed: false`,
`score: 15`) with **no derivation from real data**, so it could never reflect
actual progress.

**3. The "Job Applications" KPI was mislabelled.**
`CubaCandidateHero.jsx:238-246` rendered a card **labelled "Job Applications"**
but fed it `getTrackedJobs()` (Kanban tracker rows), and the hero carried no
cover-letter / portfolio / application metric.

## 2. RCA → FIX

| Step | Change |
|---|---|
| S1 | **`GET /api/user-stats`** — owner-scoped (`req.user.uid` from the verified token), aggregating `getResumes` / `getCovers` / `getPortfolios` / `getApplications({applicantId})` / `getTrackedJobs` + a derived `profileComplete`. Returns `{success, stats, source}`; **503** on read failure — **no fabricated zeros**. |
| S2 | `getStatesOfUser` now calls `/api/user-stats`; on failure returns `{ apiError: true }` instead of inventing zeros |
| S3 | `DashboardHomepage` consumes the measured metrics; a failed read sets `unavailable` and tiles render an honest `—` |
| S4 | `CubaCandidateHero`'s "Job Applications" card now shows the **real application count** (tracked jobs moved to the hint) |
| S5 | Onboarding expanded to the four mandated steps — **Profile, First Resume, Cover Letter, First Job Application** — with completion **derived** from the measured counts (`applyOnboardingProgress`) |
| S6 | `tests/dir058-dashboard-stats.test.mjs` (5 tests) |

**Location note (documented deviation):** the directive named
`backend/routes/platform.js`, but that router is mounted at **`/api/platform`**
(`backend/index.js:510`) and therefore **cannot** serve the specified
`/api/user-stats` path. The handler was placed in `backend/routes/miscData.js`,
which is mounted at `/api` (`index.js:511`) alongside `/stats` and `/favourites`
— the correct home for a user-scoped misc endpoint. A first attempt in
`platform.js` was proven wrong by the live probe (**404**) and removed.

## 3. RECHECK → EVIDENCE

**Live, read-only in-process probe** (`.bridge/evidence/dir058-live-probe.log`):
```
ANON_STATUS=401 ANON_CODE=AUTH_REQUIRED          ← owner-scoped, no anonymous read
AUTHED_STATUS=200
AUTHED_SUCCESS=true
AUTHED_SOURCE=MARIADB_USER_DOCUMENTS
STAT_resumes=0 (number) … STAT_trackedJobs=0 (number)
STAT_profileComplete=false (boolean)             ← real values, correct types
```

| Gate | Command | Result |
|---|---|---|
| New suite | `node --test tests/dir058-dashboard-stats.test.mjs` | **5/5 pass** |
| Dashboard/Cuba regression | `dir058 + cuba-candidate-portal + cuba-design-system + user-dashboard-forensic` | **67/67 pass** |
| Backend route integration | `node --test backend/test/routes.integration.test.js` | **24 pass, 0 fail** (6 skipped) |
| Full product matrix | `npm run test:product` | **756 pass, 0 fail** |
| Lint | `eslint` on every changed file | **0 errors** (2 pre-existing warnings in `platform.js`, untouched) |
| Build | `npm run build` | **exit 0, 2.35s** |

Changed files: `backend/routes/miscData.js`, `src/services/api/platform.js`,
`src/components/Dashboard/DashboardHomepage/DashboardHomepage.jsx`,
`src/components/Candidate/CubaCandidateHero.jsx`,
`tests/dir058-dashboard-stats.test.mjs`.

## 4. Honest limitations

- `DashboardActions.jsx` (a component imported by **nothing** — dead code) still
  reads the legacy `documentsGenerated` / `documentsDownloaded` field names. It
  is not rendered anywhere; spreading the new stats object is harmless. Left
  untouched deliberately to keep this change minimal.
- The probe used a synthetic test uid with no documents, so every count is a
  genuine `0` for that user — it proves the contract and types, not a populated
  account. A populated-account assertion belongs in a live authenticated crawl.
- No schema change was made.
