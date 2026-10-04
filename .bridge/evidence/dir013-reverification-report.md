# DIR-013 RE-VERIFICATION EVIDENCE (post auto-retry)
Date: 2026-10-03T19:10:00+05:30
Gate: playwright.dir013.config.js + full regression

## STACK HEALTH — TWO INFRA OUTAGES FOUND AND FIXED
The 480s stall was NOT a product defect. Diagnosed three separate causes:

1. **MariaDB DOWN (INV-4 violation).** Backend :8080 answered 200 but its
   authoritative DB was unreachable:
   `mariadb: {status: DOWN, lastError: "connect ECONNREFUSED 127.0.0.1:3306"}`.
   No MySQL service was registered, and the XAMPP-canonical
   `d:/xampp/mysql/my.ini` did not exist (the real config lives at
   `d:/xampp/mysql/bin/my.ini`).
   FIX: started `mysqld --defaults-file=D:/xampp/mysql/bin/my.ini`.
   VERIFIED: `/api/health/databases` -> healthy:true latency 17ms;
   `/api/health` -> `mariadb.status UP`, `authority.mode NORMAL`,
   `canAcceptWrites true`.

2. **Vite dev-server watcher caused mid-test page reloads (HARNESS DEFECT).**
   First gate rerun FAILED: `waitForSelector('canvas')` timed out at 240s.
   vite-dev.log proved the cause: the watcher had NO `server.watch.ignored`,
   so every Playwright artifact write inside the project root
   (`.bridge/evidence/.last-run.json`, screenshots, error-context.md) was
   treated as a source change and fired a full `page reload`.
   The failure snapshot confirmed it: the interview mode had silently
   reverted to its default `Strict CBT [pressed]`, so the live session never
   started and the canvas never mounted.
   FIX (`vite.config.js`, +20 lines, the only tracked file changed):
   `server.watch.ignored = ['**/.bridge/**','**/test-results/**',
   '**/crawl-artifacts/**','**/artifacts/**','**/playwright-report/**',
   '**/backups/**']`. These are test-output dirs, never in the app module
   graph, so application behaviour is unchanged.
   VERIFIED: probe write to `.bridge/evidence/.last-run.json` now produces
   ZERO hmr/page-reload entries. A full 2/2 gate run then passed at 54.3s
   (canvas mounted, real POST 201 in 46.6s) and again at 1.1m (POST 201 in
   56.0s), each with a distinct server-issued sessionId.

3. **Orphaned session leak in the spec's own cleanup (HARNESS DEFECT).**
   `live_interview_sessions` held 8 rows stuck at `status='active'` from
   earlier runs, even though the spec claimed it "leaves no orphaned
   authoritative row".
   ROOT CAUSE: the cleanup scanned for a button matching
   `/discard|end interview|exit/i`. The real control is labelled
   **"Leave interview"** (LiveInterviewSession.jsx ~925) and it only OPENS a
   confirm dialog; `abandonLiveInterviewSession` is behind that dialog's
   **"Leave & discard"** button (~1236). The old `discard?.click()` was a
   silent no-op, so every run leaked a row.
   FIX: drive both real controls with `getByRole`, and ASSERT the cleanup
   (DELETE observed on the wire + authoritative GET no longer 200).
   Also reordered the canvas geometry/paint proof BEFORE the abandon, since
   abandoning unmounts `<LiveInterviewSession>` and measuring afterwards
   always observes 0 canvases.
   VERIFIED: pre-run rows 0 -> post-run rows 0.

## OPEN BLOCKER (external, not a code defect)
The local AI provider **LM Studio on :1234 is DOWN** — nothing is listening
(curl exit 7) and all LM Studio processes exited mid-session. Stage 1
deliberately performs a REAL inference (spec asserts a genuine POST 201 with
a server-issued sessionId; no mocking per INV-4), so it cannot pass without
a live provider. No `lms-cli.exe` exists under the user profile and the GUI
processes are gone, so there is no non-interactive way to restore it.
Escalated to the Lead (evt_musenu4s_5f56f1b7).

## VERIFIED GREEN THIS PASS
| Gate | Result |
|---|---|
| Vite :3000 | 200 |
| Backend :8080 | 200, mariadb UP, mode NORMAL, latency 2ms |
| MariaDB | healthy, `live_interview_sessions` 8 orphans removed -> 0 |
| dir013 provider-independent test (frozen baseline + no raw hex) | 1 passed (4.7s) EXIT=0 |
| dir013 full gate (before provider died) | 2 passed EXIT=0, 54.3s and 1.1m on repeat |
| `npm run test:product` | EXIT=0, zero non-zero `fail` blocks |
| `npx eslint .` | 0 errors, 233 pre-existing warnings (baseline unchanged) |
| `npx vite build` | 3.84s (< 4.0s budget) |

## INVARIANTS
- **INV-1 (frozen templates):** `git diff e314f715 -- src/cv-templates/
  backend/services/aiRuntime.js` is EMPTY; 51 cvN directories intact.
- **INV-2 (no token leakage):** no secrets added to DOM or console; the
  cleanup assertion reuses the already-minted `SESSION.idToken` over an
  explicit `Authorization` header only.
- **INV-4 (authentic MariaDB):** restored to `mode NORMAL`; the new cleanup
  assertion verifies the row is genuinely gone from the authoritative store.

## FILES CHANGED
- `vite.config.js` (+20) — watcher ignores test-output dirs.
- `tests/e2e/dir013-interview-coach.spec.js` — real cleanup controls,
  cleanup assertions, canvas-proof reorder, DELETE tracker.
- `playwright.dir013.config.js` — unchanged this pass.