# Backend route-registration reconciliation (2026-10-29 UTC)

This is a read-only comparison; the historical `developer-review/` tree was not modified.
It separates the historical parser's normalized source census from the current Express
runtime inventory that expands literal mount prefixes and checks exact method+literal-path pairs.

## Counts

| Census | Registration instances | Distinct keys | Notes |
|---|---:|---:|---|
| Historical M8 parser (8fce71518d1dc957c3c8cefa9867445edb35f438) | 405 | 399 | Historical parser scope and normalization; includes its recorded duplicate instances. |
| Current reachable Express runtime (aa24147245daa6c027d046f1f7ae6f8fc703be46) | 457 exact literal pairs | 449 normalized keys | 0 exact literal duplicates; 0 unresolved route patterns; 0 unresolved mounts. |

The current runtime contains **50 normalized keys not present in the historical M8 key set** and **0 historical normalized keys absent from the current runtime**.
The current census has **8 path-shape/prefix-normalized alias instances** versus **6 historical duplicate instances**. Thus the raw instance delta is 52 = 50 new normalized keys + 8 current alias instances - 6 historical duplicate instances; these are different census units, not 52 unexplained duplicates.
The historical artifact is stamped at `8fce71518d1dc957c3c8cefa9867445edb35f438`; the current checked-out base is `aa24147245daa6c027d046f1f7ae6f8fc703be46`. The intervening repository history changes `backend/index.js`, `backend/routes/adminUsers.js`, and `backend/routes/blogData.js`; the current runtime also expands existing compatibility mounts such as `/api/jobs` and `/api/blog` that are counted separately as effective paths. The row-level current-only list below is the exact delta; route presence does not establish feature correctness.
## Current exact-path result

**COMPLETE_FOR_LITERAL_EXPRESS_ROUTES** — 457 exact method+literal-path registrations, 457 distinct keys, 0 duplicate keys.
The inventory used runtime Express registration, records `ALL` as one `ALL` registration rather than expanding it to every HTTP verb, expands all literal mount prefixes, and reports regex/non-literal constructs as unresolved. No unresolved route or mount patterns were found.

## New normalized method+path keys versus historical M8

| Normalized key | Current literal path(s) | Source file(s) |
|---|---|---|
| `DELETE /blog-data/posts/{X}` | `/api/blog-data/posts/:id` | `backend/routes/blogData.js` |
| `DELETE /blog/posts/{X}` | `/api/blog/posts/:id` | `backend/routes/blogData.js` |
| `DELETE /blog/{X}` | `/api/blog/:id` | `backend/routes/blogData.js` |
| `DELETE /jobs/applications/{X}` | `/api/jobs/applications/:id` | `backend/routes/jobsData.js` |
| `DELETE /jobs/tracker/{X}` | `/api/jobs/tracker/:id` | `backend/routes/jobsData.js` |
| `DELETE /jobs/{X}` | `/api/jobs/:id` | `backend/routes/jobsData.js` |
| `GET /blog` | `/api/blog/` | `backend/routes/blogData.js` |
| `GET /blog-data/posts` | `/api/blog-data/posts` | `backend/routes/blogData.js` |
| `GET /blog-data/posts/{X}` | `/api/blog-data/posts/:id` | `backend/routes/blogData.js` |
| `GET /blog/categories` | `/api/blog/categories` | `backend/routes/blogData.js` |
| `GET /blog/posts` | `/api/blog/posts` | `backend/routes/blogData.js` |
| `GET /blog/posts/{X}` | `/api/blog/posts/:id` | `backend/routes/blogData.js` |
| `GET /blog/slug/{X}` | `/api/blog/slug/:slug` | `backend/routes/blogData.js` |
| `GET /blog/{X}` | `/api/blog/:id` | `backend/routes/blogData.js` |
| `GET /jobs` | `/api/jobs/` | `backend/routes/jobsData.js` |
| `GET /jobs/applications/list` | `/api/jobs/applications/list` | `backend/routes/jobsData.js` |
| `GET /jobs/tracker` | `/api/jobs/tracker` | `backend/routes/jobsData.js` |
| `GET /jobs/{X}` | `/api/jobs/:id` | `backend/routes/jobsData.js` |
| `GET /platform/status` | `/api/platform/status` | `backend/index.js` |
| `PATCH /jobs/applications/{X}` | `/api/jobs/applications/:id` | `backend/routes/jobsData.js` |
| `PATCH /jobs/tracker/{X}` | `/api/jobs/tracker/:id` | `backend/routes/jobsData.js` |
| `POST /admin/database-settings/sync-now` | `/api/admin/database-settings/sync-now` | `backend/routes/databaseAdmin.js` |
| `POST /admin/database-settings/verify-parity` | `/api/admin/database-settings/verify-parity` | `backend/routes/databaseAdmin.js` |
| `POST /admin/employer-applications/{X}/verify` | `/api/admin/employer-applications/:uid/verify` | `backend/index.js` |
| `POST /admin/jobs/{X}/moderate` | `/api/admin/jobs/:jobId/moderate` | `backend/index.js` |
| `POST /admin/users/{X}/status` | `/api/admin/users/:uid/status` | `backend/routes/adminUsers.js` |
| `POST /billing/validate-coupon` | `/api/billing/validate-coupon` | `backend/index.js` |
| `POST /blog-data/posts` | `/api/blog-data/posts` | `backend/routes/blogData.js` |
| `POST /blog/posts` | `/api/blog/posts` | `backend/routes/blogData.js` |
| `POST /blog/{X}` | `/api/blog/:id` | `backend/routes/blogData.js` |
| `POST /generate-education-description` | `/api/generate-education-description` | `backend/routes/ai.js` |
| `POST /generate-resume` | `/api/generate-resume` | `backend/routes/ai.js` |
| `POST /generate-skills` | `/api/generate-skills` | `backend/routes/ai.js` |
| `POST /generate-summary` | `/api/generate-summary` | `backend/routes/ai.js` |
| `POST /generate-work-description` | `/api/generate-work-description` | `backend/routes/ai.js` |
| `POST /jobs/applications/{X}` | `/api/jobs/applications/:id` | `backend/routes/jobsData.js` |
| `POST /jobs/tracker` | `/api/jobs/tracker` | `backend/routes/jobsData.js` |
| `POST /jobs/{X}` | `/api/jobs/:id` | `backend/routes/jobsData.js` |
| `POST /notify/email-otp` | `/api/notify/email-otp` | `backend/index.js` |
| `POST /notify/job-application` | `/api/notify/job-application` | `backend/index.js` |
| `POST /notify/job-posted` | `/api/notify/job-posted` | `backend/index.js` |
| `POST /notify/job-status-update` | `/api/notify/job-status-update` | `backend/index.js` |
| `POST /notify/password-changed` | `/api/notify/password-changed` | `backend/index.js` |
| `POST /notify/password-reset` | `/api/notify/password-reset` | `backend/index.js` |
| `POST /notify/portfolio-published` | `/api/notify/portfolio-published` | `backend/index.js` |
| `POST /notify/security-alert` | `/api/notify/security-alert` | `backend/index.js` |
| `POST /notify/send-verification-email` | `/api/notify/send-verification-email` | `backend/index.js` |
| `POST /notify/subscription-cancelled` | `/api/notify/subscription-cancelled` | `backend/index.js` |
| `PUT /blog-data/posts/{X}` | `/api/blog-data/posts/:id` | `backend/routes/blogData.js` |
| `PUT /blog/posts/{X}` | `/api/blog/posts/:id` | `backend/routes/blogData.js` |

## Historical normalized keys absent now

None.

## Normalized alias collisions in the current census

These are different exact literals that collapse under the historical `/api`-stripping/parameter-shape key. They are not exact `METHOD+literal path` duplicates:

| Normalized key | Literal registrations |
|---|---|
| `GET /custom-pages.json` | `/api/custom-pages.json` (backend/index.js:6539:5), `/custom-pages.json` (backend/index.js:6539:5) |
| `GET /healthz` | `/healthz` (backend/index.js:5468:5), `/api/healthz` (backend/index.js:5472:5) |
| `GET /readyz` | `/readyz` (backend/index.js:5530:5), `/api/readyz` (backend/index.js:5539:5) |
| `GET /trusted-by.json` | `/api/trusted-by.json` (backend/index.js:6750:5), `/trusted-by.json` (backend/index.js:6750:5) |
| `GET /v1/status` | `/v1/status` (backend/index.js:3236:5), `/api/v1/status` (backend/index.js:3236:5) |
| `POST /v1/chat/completions` | `/v1/chat/completions` (backend/index.js:2877:5), `/api/v1/chat/completions` (backend/index.js:2877:5) |
| `POST /v1/messages` | `/v1/messages` (backend/index.js:3077:5), `/api/v1/messages` (backend/index.js:3077:5) |
| `POST /v1/search` | `/v1/search` (backend/index.js:3146:5), `/api/v1/search` (backend/index.js:3146:5) |

## Scope and limitations

- The historical M8 artifact was produced at a different source revision and by static parsers; it is not a current runtime census.
- Current exact-path uniqueness applies to Express routes reachable from the exported backend app. It does not prove handler correctness, database persistence, tenant isolation, provider delivery, or browser workflows.
- A normalized alias collision is intentionally kept distinct from a literal duplicate. `/healthz` and `/api/healthz`, for example, are different literal paths.
- Full row data is in the JSON artifacts linked above.
