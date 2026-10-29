# Runtime Test Harness — M7

**Purpose:** the exact, reproducible runtime checks that would move this audit from
`PARTIAL — INCOMPLETE` towards a defensible conclusion. Nothing in this file was executed: the audit
environment has no browser binary, no MariaDB server, no container runtime, no package-install path and no
outbound network (probed at `8a6e03bb`; see `RUNTIME-VERIFICATION-V4.md` and §7 of
`M7-CAPABILITY-CLOSURE.md`). This file is a **specification plus a harness skeleton**, not evidence.

**Revision to run against:** `8a6e03bbc279cfb7e3a62519659fa3fe770ad1be`
**Preconditions that do not exist here:** Playwright + Chromium, a disposable MariaDB instance with the
repository's migration set applied, a test SMTP sink, sanitiser or mail catcher, and Razorpay test keys.

---

## 0. What each spec must produce

A run is only admissible evidence if it stores:

| Item | Requirement |
|---|---|
| Log file | `developer-review/Evidence/logs/m7-runtime/<spec-id>.log`, raw stdout + stderr, no editing |
| Revision stamp | first line: `git rev-parse HEAD` |
| Environment | browser + version, node + version, MariaDB + version, provider mode (`test`/`sandbox`) |
| Network capture | HAR or `page.route` log for every request the spec asserts on |
| DB snapshot | row counts before/after for the table the spec touches, plus the exact SQL used |
| Verdict | `PASS` / `FAIL` / `BLOCKED` per assertion, written by the spec, never summarised by hand |

A passing spec proves the behaviour **on the exact revision it ran against**. A mock, an emulator, an
in-memory repository or a direct Express invocation is not a substitute for any spec below and must be
labelled as such if used.

---

## R-01 — Admin moderation approval actually persists (DISC-030/DISC-042, FP-A20)

1. Seed a `pending` employer application and a `pending` job in the disposable DB.
2. Sign in as an admin with `users.approve`; open `/admin/moderation`.
3. Assert the queue shows the **seeded** rows (this alone fails today: the tab has no read path).
4. Approve the application; capture the request.
5. **Expected after repair:** `PATCH /api/admin/employer-applications/:uid` → 200; DB `status='approved'`;
   Firebase custom claims contain `employer: true`; `AUDIT` row `EMPLOYER_APPLICATION_REVIEWED` exists.
6. Flip one job to spam; expect `PATCH /api/admin/jobs/:jobId` → 200 and `status` in the allowlist.
7. **Negative case:** force a 409 `ADMIN_TARGET_CHANGED`; assert the row reloads and no success toast is shown.

Current expected outcome on unmodified source: **FAIL** — both requests 404 and the UI reports success
(sites 2, 3, 4 of the false-success table).

## R-02 — Suspend a user via the real contract (DISC-026 site 1, FP-A31)

1. Seed a user; open Admin → Users.
2. Suspend; capture the request.
3. Expected after repair: `PATCH /api/admin/users/:uid {suspended:true}` → 200; DB `suspended=1`;
   refresh tokens revoked; the reloaded row shows suspended.
4. Assert the unmodified path (`POST /admin/users/:id/status`) never appears in the network log after the fix.

## R-03 — Backup and cache-purge controls do not lie (DISC-026 sites 2, 3)

1. Open Admin → Operations.
2. Press "Backup". Expect **either** a 2xx from a real backup operation **or** a visible failure and a
   `lastBackup` value unchanged.
3. Same for "Purge caches".
4. Assert no string matching `/completed successfully|purged across nodes/` appears after a non-2xx.

## R-04 — Dead-letter retry and purge (DISC-026 sites 7–10)

1. Insert one `DEAD_LETTER` row into `notification_outbox`.
2. Retry it from the queue console; expect exactly one `POST /api/platform/queues/retry`, 2xx, and the row's
   `state` to change in the DB (not just in React state).
3. Purge it; expect a visible refusal (`410`/`400` per the server's deliberate policy) and the row still
   present, **or** a real delete with a DB row count before/after.
4. Assert the UI never shows "purged" while the row still exists.

## R-05 — Resume photo within the API body budget (DISC-048, FP-E06)

1. Upload a 4.5 MB JPEG (the UI advertises 5 MB) in Resume Builder.
2. Save; capture status and body.
3. **Expected:** `413` today, because `express.json({limit:'256kb'})` (`backend/index.js:316`) rejects the
   base64-inflated body.
4. Repeat with a 120 KB JPEG: expect 200 and `photo` persisted, and confirm the same photo renders after reload.
5. This spec converts DISC-048's static arithmetic into an observed status code. Until it runs, DISC-048
   stays "Medium-High confidence, status inferred".

## R-06 — Server-rendered export formats (FP-E12)

1. From `/dashboard/resumes`, download DOCX: expect 200, `application/vnd.openxmlformats-…`, and a file that
   opens.
2. Attempt PDF: assert whether any request is issued and what the response is.
3. Record the finding plainly: no PDF route exists in `backend/` at this revision, so a PDF flow can only be
   client-side rendering or absent.

## R-07 — Support ticketing end to end (FP-G24, DISC-041 remediation, DISC-047)

1. As a candidate, open `/dashboard/support`, create a ticket, reply.
2. Assert `POST /api/support/tickets` → 201, `POST /api/support/tickets/:id/messages` → 201, DB rows present.
3. As staff, open Admin → Support: assert the same ticket appears.
4. **Empty-state case:** with zero tickets, assert the list is empty — today it shows fixtures (DISC-047).

## R-08 — Job board actually lists jobs (DISC-043, FP-F10)

1. Seed three publicly-visible jobs and one draft.
2. Open `/jobs`.
3. Expected after repair: `GET /api/jobs-data` → 200 and exactly the three public jobs.
4. Assert the unmodified `GET /api/jobs` 404 is captured as the current behaviour, with the page's error state.

## R-09 — Rejection email delivery (DISC-044, FP-F11)

1. With a mail sink configured, reject a candidate application from the employer drawer.
2. Assert: exactly one outbox row for the candidate, sink receives one message, drawer reports success only
   after the server accepts.
3. Current expected outcome: **FAIL** — no route, no outbox row, success modal shown anyway.

## R-10 — Coupon validation and price integrity (DISC-045, FP-A24)

1. Enter a valid server-side coupon: expect `/api/coupons/validate` → 200, the server's discount displayed.
2. Enter `SAVE20` (a hardcoded client constant): expect no discount, or an error **before** submission.
3. Create the order; assert the returned `amount` equals the discounted price the UI displayed.
4. Assert no request to `/api/billing/validate-coupon` appears after the fix.

---

## Harness skeleton (Playwright, not yet runnable here)

```js
// developer-review/tools/m7-runtime/spec.skeleton.mjs — reference only; requires an installed browser
import { test, expect, request } from '@playwright/test';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const REV = execSync('git rev-parse HEAD').toString().trim();
const LOG = `developer-review/Evidence/logs/m7-runtime/${process.env.SPEC_ID}.log`;
const record = (line) => fs.appendFileSync(LOG, `${line}\n`);

test.beforeEach(async ({ page }, info) => {
  record(`revision: ${REV}`);
  record(`spec: ${info.title}`);
  page.on('response', async (res) => {
    const url = res.url();
    if (!/\/api\//.test(url)) return;
    record(`${res.request().method()} ${url} -> ${res.status()}`);
  });
});

test('R-01 moderation approval persists', async ({ page }) => {
  await page.goto('/admin/moderation');
  // fails today at this line: the tab renders fixtures and never reads the API
  await expect(page.getByRole('row', { name: /Nexus AI Robotics/ })).toHaveCount(0);
  // ... seed-driven assertions per the spec above
});
```

**Why a skeleton and not a suite:** writing assertions for behaviour that cannot be executed would produce
a file that looks like evidence and is not. The mandate forbids presenting a harness as a passing test, so
this file stops at the boundary of what can be honestly delivered here.

---

## Verdict discipline

| Claim | Allowed now? | Why |
|---|---|---|
| "Static analysis shows a 404 on this path" | yes | the call site and the registration set are both read from source |
| "This workflow works" | **no** | no browser, no DB |
| "This workflow fails at runtime" | no, except as "must 404" inference from a missing registration | a registered-but-broken handler would need R-specs |
| "Mock tests pass, therefore the feature is verified" | **never** | a mock test is evidence about the mock |
| "Runtime-verified" | **no** | 0 specs executed |

The verdict therefore remains **`PARTIAL — INCOMPLETE`**, and the fastest route to a stronger verdict is
R-01 … R-10 in a disposable environment.
