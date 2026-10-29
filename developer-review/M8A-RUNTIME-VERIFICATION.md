# M8A — RUNTIME VERIFICATION

**Source revision:** `888c2e5`
**Environment:** sandbox, no MariaDB/MySQL, no provider credentials, no browser automation, no seeded fixture.
**Log:** `Evidence/logs/m8a-runtime-probes.log` (verbatim, sanitized)

---

## 1. Summary

| Outcome | Count |
|---|---:|
| End-to-end runtime proof (browser + DB + provider) | **0 / 16** |
| Backend route-level evidence obtained | **2 / 16** (B2, B3) |
| Blocked with a named cause | **14 / 16** |
| Claims upgraded on mock/emulator/in-memory evidence | **0** |

**No claim in this mandate is reported as runtime-verified.** Two claims carry route-level evidence that is explicitly
bounded: it establishes **routing and admission behaviour only**, in an in-memory repository that is **not MariaDB** and
is not production.

---

## 2. What was actually executed

### 2.1 Boot

```
cd backend && PORT=5099 IN_MEMORY_REPOSITORY=1 NODE_ENV=test node index.js
HTTP Server running on port 5099
[Startup] DEGRADED_MODE_REPOSITORY=inmemory explicitly set — using in-memory repository.
```

Dependencies were installed with `npm install --no-audit --no-fund --ignore-scripts` in `backend/` only.
`backend/node_modules` is **git-ignored** (`git check-ignore` confirmed) and no manifest or lockfile was modified.

### 2.2 Probes

| # | Request | Observed | Interpretation |
|---|---|---|---|
| T1 | `POST /api/contact` valid payload | `503 RATE_LIMIT_UNAVAILABLE` | admission fails closed |
| T2 | `POST /api/contact` short message | `503 RATE_LIMIT_UNAVAILABLE` | ditto |
| T3 | `POST /api/contact` malformed email | `503 RATE_LIMIT_UNAVAILABLE` | ditto |
| T4 | `POST /api/contact` honeypot populated | `503 RATE_LIMIT_UNAVAILABLE` | ditto |
| P1 | `GET /api/blog/posts` | `401 AUTH_REQUIRED` | auth-shielded before routing |
| P2 | `GET /api/blog-data` | `200 {"success":true,"posts":[]}` | **works** |
| P3 | `GET /api/blog-data/slug/any-slug` | `404 {"success":false,"error":"Post not found"}` | **correct handler exists** |
| P4 | `GET /api/public/custom-pages` | `200 {"success":true,"pages":[],"source":"MARIADB_CUSTOM_PAGES"}` | **works** |
| P5 | `GET /api/public/custom-pages/some-slug` | `404 CUSTOM_PAGE_NOT_FOUND` | **correct handler exists** |
| P6 | `GET /api/pages` | `401 AUTH_REQUIRED` | auth-shielded; absence static-only |
| P7 | `GET /api/cms-pages` | `410 API_RETIRED` + `replacement` | retired **by design** |

### 2.3 Root cause of the blocked paths

Server stderr, verbatim:

```
[Rate limit store] contact connect ECONNREFUSED 127.0.0.1:3306
[Rate limit store] public-browse connect ECONNREFUSED 127.0.0.1:3306
```

No database is listening on 3306. `security/abuse.js:108` fails **closed** when the rate-limit store is unavailable —
correct security behaviour, and the reason T1–T4 never reach the contact handler. This is a genuine environmental
blocker, not a defect in the product.

---

## 3. Per-claim blocked record

| Claim | Blocking cause |
|---|---|
| A1 | needs an authenticated session with stored legacy-format profile data; no DB, no seed, no browser |
| A2 | needs an authenticated session plus a resume with content, and observation of reload survival |
| A3 | needs provider credentials (Stripe/PayPal/Razorpay) for any real settlement; failure branch is browser-side |
| A4 | needs an identity provider for enrolment flow; TOTP secret issuance requires the DB-backed identity service |
| B1 | **handler unreachable** — `503` at admission (no rate-limit store); UI success path is browser-side |
| B2 | in-page renderer is browser-side; public API itself was verified (P4, P5) |
| B3 | reader error-swallowing and slug handling are browser-side; backend verified (P2, P3) |
| B4 | all five modules are client-side; requires a browser to prove absence of interactivity |
| C1 | requires provisioned tenant context and membership permissions |
| C2 | not applicable — claim falsified at source; nothing to run |
| C3 | cross-session message retrieval requires two authenticated sessions and a DB |
| D1 | requires admin step-up re-auth plus a finance provider |
| D2 | queue telemetry unavailable **is** the condition under test; display logic proven from source only |
| D3 | authoring surface is browser-side |
| D4 | authoring surface is browser-side |
| D5 | needs microphone permission and a real browser audio stack |

---

## 4. Honest limits

- **In-memory mode is not MariaDB.** `P4` even reports `"source":"MARIADB_CUSTOM_PAGES"` while no MariaDB exists — a
  reminder that the label is not the evidence. Nothing here is production proof.
- **401 is not 404.** Because auth runs before routing, absence of `/api/blog/posts` and `/api/pages` cannot be proven by
  runtime. Two of my own static conclusions were demoted on this basis (report §6.1).
- **No browser was used**, so no rendering, interaction, permission prompt, waveform, textarea behaviour or empty-state
  display was observed. Every UI claim remains static.
- **No provider was contacted**, so no settlement claim is made in either direction.
- Mocked or in-memory success would be evidence about the mock, not about the product. None is presented as more.
