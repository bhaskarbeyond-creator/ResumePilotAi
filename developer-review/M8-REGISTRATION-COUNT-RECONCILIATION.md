# M8 — Registration Count Reconciliation (`397` vs `413`)

**Revision audited:** `a2ecb96d2b194df25d5cd8ce2ece23ef65068fd9` · **Generated:** 2026-10-29T07:56:08.669Z (generator clock, UTC) · **Tool:** `tools/m8-registration-reconciliation.cjs`
**Machine-readable twin:** `Evidence/artifacts/m8-registration-reconciliation.json` (all 405+ rows)
**Mandate 8 gate:** B — registration integrity.

## 1. Answer

The 16-registration difference is **resolved**, and it was **not** a disagreement about the backend.
It was 2 false positives, 6 duplicate instances (one handler registered as both `/x` and `/api/x` on the same line) and 8 standalone endpoints that sit outside the canonical register's documented `/api` scope — all of them in the *independent* parser, none of them in the backend.

In arithmetic (every term computed this run): **413 = 405 + 6 + 2**, and **405 = 397 + 8**. The 14 non-`/api` *literals* therefore split into 8 standalone endpoints + 6 compatibility aliases of an `/api` twin (accounting closes).

| Component | Count | What it is |
|---|---:|---|
| Aliases registered under `/api` (canonical, parser A) | **397** | 393 call sites, 397 alias literals, 393 unique `METHOD+path` |
| + real routes outside `/api` | **+8** | `/healthz`, `/readyz`, `/llms.txt`, `/llms-full.txt`, `/sitemap.xml`, `/v1/models`, `/public/custom-pages.json`, `/public/trusted-by.json` |
| = contract parser after repair (parser B) | **405** | same corpus, same unit, wider scope |
| + duplicate instances the old parser counted twice | **+6** | one handler registered as `['/api/v1/status','/v1/status']` counted as two |
| + non-route text the old parser accepted | **+2** | `Promise.all([fetch('https://api.github.com/user'), …])` |
| = the published 413 | **413** | reproduced by replaying the old rules over current source |

## 2. Verifications performed by this run

| Assertion | Method | Result |
|---|---|---|
| the published 413 is reproducible | replay the **old** parser rules over current source | **yes** — 413 literals |
| the published 397/393 are reproducible | read the canonical artifact produced this run | **yes** — 397 alias registrations, 393 unique |
| the remaining delta is scope, not disagreement | A's alias registrations + standalone non-`/api` endpoints == B's total | **yes** — 397 + 8 = 405 |
| the two parsers agree **inside** the `/api` scope | diff on `file|line|verb|normalised shape` | **yes** — 0 B-only in scope, 0 A-only |
| the non-`/api` literals split cleanly | standalone endpoints + duplicate alias literals == literals | **yes** — 8 + 6 = 14 |
| duplicate instances are aliases, not path-shape noise | collapse `:param`/`${…}` over the 393 register operations and look for merged keys | **0 collisions** — the 393-operation register is already parameter-normalised |

**Unit note for readers of the older narrative.** Two numbers that were previously conflated are kept apart here. *Duplicate instances* are alias pairs — one handler registered under two literals on one line — and there are exactly 6. *Path-shape collisions* would be two distinct operations sharing a key after `:param`/`${…}` collapse; measured over the 393 register operations that is **0**, because the register's paths are already normalised. Parameter-name variants such as `/:uid` vs `/:id` live in pre-mount router literals, resolve to different mount prefixes, and are never counted as duplicates. An earlier M8 draft cited "70 path-shape collisions"; that figure is not reproducible from the artefacts and is withdrawn.

## 3. Defects found and corrected (audit instruments only)

### 3.1 Parser B (`tools/client-contract-audit.cjs`) — two real defects

**Defect B1 — any identifier was treated as a router.** The route regex accepted `<anything>.<get|post|all|…>(`, so `Promise.all([fetch('https://api.github.com/user', …), fetch('https://api.github.com/user/emails', …)])` at `backend/index.js:7419` parsed as **two route registrations of an absolute URL**. Receivers are now restricted to `app`, an identifier declared as `express.Router()` in that file, or an identifier bound by `require()` to a backend module; and a route path must start with `/`.
Effect: **−2** registrations. Reproduced rows:

| file:line | receiver | verb | accepted as a "route" |
|---|---|---|---|
| `backend/index.js:7420` | `Promise` | ALL | `https://api.github.com/user` |
| `backend/index.js:7420` | `Promise` | ALL | `https://api.github.com/user/emails` |

**Defect B2 — no alias collapse.** `app.get(['/api/v1/status','/v1/status'])` is one handler; the parser counted both literals and had no dedupe key, so an alias pair became two registrations whenever the `/api` prefix did not already distinguish them. Effect: **−6** registrations. Rows:

| file:line | verb | literal | collides with |
|---|---|---|---|
| `backend/index.js:2867` | POST | `/api/v1/chat/completions` | `/v1/chat/completions` |
| `backend/index.js:3067` | POST | `/api/v1/messages` | `/v1/messages` |
| `backend/index.js:3136` | POST | `/api/v1/search` | `/v1/search` |
| `backend/index.js:3226` | GET | `/api/v1/status` | `/v1/status` |
| `backend/index.js:6537` | GET | `/custom-pages.json` | `/custom-pages.json` |
| `backend/index.js:6748` | GET | `/trusted-by.json` | `/trusted-by.json` |

### 3.2 Parser A (`tools/backend-reachability.cjs`) — one defect and one undocumented boundary

**Defect A1 — inconsistent counting unit.** Router-file matches incremented the registration counter once per call site, while `app.<verb>` matches incremented it once per path literal. The two halves of the same number were counting different things, which is why the register reported "397 registrations, 4 duplicates" — a figure that could not be reconciled with either parser until the unit was defined. The counter now reports three explicit units: **route call sites**, **alias registrations**, **unique `METHOD+path`**.

**Boundary A2 — the `/api` scope was undocumented.** 8 real endpoints are registered outside `/api`; the register silently excluded them, so a reader could conclude they do not exist. They are now counted and listed (`units.nonApiRoutes`, `nonApiRouteList`) and named in §5. They remain **outside** the operation-register denominator on purpose — the register exists to map the `/api` surface the client talks to — but the exclusion is now visible and measured rather than implicit.

## 4. Counting definitions (the same definitions, formally)

| Unit | Definition | A | B |
|---|---|---:|---:|
| route call site | one `<router>.<verb>(…)` / `app.<verb>(…)` expression, per (receiver, mount prefix) | 393 | not reported separately |
| alias registration | one (call site, path literal, mount prefix) tuple | 397 | 405 (scope-wider, collision-collapsed) |
| unique `METHOD+path` | after mount resolution, `/api` stripping and `:param → {X}` normalisation, de-duplicated | 393 | 399 (scope-wider) |
| non-`/api` route literal | `app.<verb>` path outside `/api` | 14 literals across 12 call sites | excluded from the 393 |

The register denominator stays **393 unique `/api` operations**; the contract parser total after repair is **405 registration instances** over a wider scope. These are different units held to one definition each, not two answers to one question.

## 5. The 8 routes outside the register scope

| file:line | method | path | in register? | why it is out of scope |
|---|---|---|---|---|
| `backend/index.js:3190` | GET | `/v1/models` | no (counted separately) | public model/status alias for machine clients |
| `backend/index.js:5063` | GET | `/llms.txt` | no (counted separately) | SEO/LLM discovery document |
| `backend/index.js:5064` | GET | `/llms-full.txt` | no (counted separately) | SEO/LLM discovery document |
| `backend/index.js:5070` | GET | `/sitemap.xml` | no (counted separately) | SEO/LLM discovery document |
| `backend/index.js:5466` | GET | `/healthz` | no (counted separately) | orchestrator health probe |
| `backend/index.js:5528` | GET | `/readyz` | no (counted separately) | orchestrator health probe |
| `backend/index.js:6537` | GET | `/public/custom-pages.json` | no (counted separately) | static JSON alias served straight off disk |
| `backend/index.js:6748` | GET | `/public/trusted-by.json` | no (counted separately) | static JSON alias served straight off disk |

## 6. Row-level detail

The full instance table (405 rows, every field the mandate requires) is in
`Evidence/artifacts/m8-registration-reconciliation.json` → `rows[]`, with `file`, `line`, `method`,
`rawLiteral`, `effectiveMounted`, `dedupeKey`, `parserA`, `parserB`, `disposition`. Every row where the
two parsers disagreed is reproduced below (8 rows; all 8 are scope, not defect, after the repairs).

| file:line | verb | raw | effective | A | B | disposition |
|---|---|---|---|---|---|---|
| `backend/index.js:3190` | GET | `/v1/models` | `/v1/models` | — | included | outside `/api` scope |
| `backend/index.js:5063` | GET | `/llms.txt` | `/llms.txt` | — | included | outside `/api` scope |
| `backend/index.js:5064` | GET | `/llms-full.txt` | `/llms-full.txt` | — | included | outside `/api` scope |
| `backend/index.js:5070` | GET | `/sitemap.xml` | `/sitemap.xml` | — | included | outside `/api` scope |
| `backend/index.js:5466` | GET | `/healthz` | `/healthz` | — | included | outside `/api` scope |
| `backend/index.js:5528` | GET | `/readyz` | `/readyz` | — | included | outside `/api` scope |
| `backend/index.js:6537` | GET | `/public/custom-pages.json` | `/public/custom-pages.json` | — | included | outside `/api` scope |
| `backend/index.js:6748` | GET | `/public/trusted-by.json` | `/public/trusted-by.json` | — | included | outside `/api` scope |

## 7. Consequences for downstream numbers

| Metric | Before this repair | After | Why |
|---|---:|---:|---|
| unique `METHOD+path` operations (register denominator) | 393 | **393** | unchanged — the repairs touched counting units and scope reporting, not the operation set |
| route call sites | not reported (mislabelled "registrations 397") | **393** | unit now defined |
| alias registrations | 397 (mixed unit) | **397** | same value, honest label |
| non-`/api` endpoints visible in the register | 0 | **14 literals; 8 have no `/api` twin on the same call site** | scope boundary made explicit; the other 6 are compatibility aliases of an `/api` registration and therefore collapse onto it |
| contract parser registrations | 413 | **405** | two defects fixed, scope widened |
| client contract tally | 190 / 8 / 14 | **190 / 8 / 14** | unchanged — no client disposition depended on the inflated registrations |

**Explicitly not changed:** the 393-operation set, the reachability class counts, and every client
disposition. A repair that had changed those would have meant the defective counter was feeding the
classifier, which this run demonstrates it was not (the in-scope instance sets are identical).

