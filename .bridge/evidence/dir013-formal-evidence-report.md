# DIR-013 FORMAL EVIDENCE — INDEPENDENT RE-VERIFICATION & SUBMISSION

Date: 2026-10-03T19:45:00+05:30
Gate: `playwright.dir013.config.js` re-run first-hand by Cline (not relayed)
Directive: DIR-013 — AI Interview Coach & Audio/Voice CBT Simulator 10/10 Overhaul

## WHY THIS PASS EXISTS
Lead Supervisor (evt_musgpcr1_8320385f) reported DIR-013 GATE VERIFIED GREEN and
requested the formal evidence package. Per the Zero-Fabrication invariant I did NOT
relay the Lead's numbers. Every claim below was re-measured first-hand against the live
stack before submission.

## STACK HEALTH — ALL UP (independently measured)
| Service | Probe | Result |
|---|---|---|
| LM Studio :1234 | `GET /v1/models` | **200** (real provider live, inference possible) |
| Vite :3000 | `GET /127.0.0.1:3000` | **200** |
| Backend :8080 | `GET /api/health` | **200** — `mariadb.status=UP`, `healthy=true`, `latencyMs=0`, `lastError=null`, `authority.mode=NORMAL`, `owner=MARIADB`, `canAcceptWrites=true` |
| MariaDB | `mysql -u root` (mysqld PID 11292) | reachable, authoritative DB `ai_resume_builder` |

## INVARIANT PROOF (re-measured, not relayed)
- **INV-1 (51 CV templates frozen):**
  `git diff e314f715 -- src/cv-templates/ backend/services/aiRuntime.js`
  -> **0 characters / 0 bytes of diff**. `src/cv-templates` holds **57 directories** intact.
  Independently re-asserted inside the suite's own AC-1 test, which passed in 102ms.
- **INV-2 (zero token leakage):** no secret is written to DOM or console. The suite's
  cleanup assertion reuses the already-minted `SESSION.idToken` and sends it only in an
  explicit `Authorization` header to the authoritative read. `console: error` and
  `pageerror` listeners both stayed empty (`defects` asserted `toEqual([])`).
- **INV-4 (authentic MariaDB, zero orphans):**
  Pre-run: `SELECT COUNT(*) FROM live_interview_sessions` = **0**.
  Post-run (after a full live 201 session): **0**. The suite additionally asserts the
  DELETE was observed on the wire AND that the authoritative GET no longer returns 200,
  so a leaked row cannot pass silently.

## GATE RESULT — REPRODUCED FIRST-HAND
`npx playwright test --config playwright.dir013.config.js`

```
  ✓  1 [dir013-live-interview-coach] AC-1/AC-2: studio + waveform tokens resolve and the canvas paints (1.1m)
  ✓  2 [dir013-live-interview-coach] AC-1: frozen baseline is byte-identical and no raw hex remains (102ms)

  2 passed (1.2m)
```
Live round-trip printed by the suite:
`[dir013] live session POST 201 in 57.8s sessionId=SSfj-pZ9bHAtvaR77WFuVSufL6rwAI0x`

**Authenticity (no synthetic data):** that server-issued `sessionId` differs from the
Lead's run (`Fpdr5TcBfhNp7xEUHlcSiYXbC5Tede2t`), and the 57.8s duration proves genuine
provider inference on the calibrated 14B model — a mocked or pre-canned response cannot
produce either a fresh server-side id or that latency. The suite enforces this by asserting
`POST status === 201`, `body.session.sessionId` matches `/^[A-Za-z0-9_-]{16,128}$/`, and
`durationMs > 1000`.

## FULL REGRESSION BARS
| Gate | Result |
|---|---|
| `playwright.dir013.config.js` | **2 passed (1.2m)**, 0 failed, 0 flaky, 0 skipped |
| `npm run test:product` | **EXIT=0**, every block `fail 0` |
| `npx eslint .` | **0 errors**, 233 warnings (pre-existing baseline, unchanged) |
| `npx vite build` | **built in 3.63s** — inside the < 4.0s budget |

## SCOPE NOTE — EXPLICIT LIMITATION
DIR-013's published spec lists 7 acceptance criteria (AC-1..AC-7). The suite's header
documents the narrowed, Lead-approved scope: **AC-1, AC-2** (Cuba M3 tokenization of
`LiveAudioWaveform.jsx` computed-style bridge + painting canvas), **AC-6** (zero console /
pageerror / >=400 defects on `/dashboard/interview`), **AC-7** (INV-1 frozen baseline),
plus INV-4 authentic live-session grounding. The AC-1 narrowing was explicitly authorized
in the Lead's own plan approval review (`"Scope correctly narrowed to protect frozen
aiRuntime.js"`).

Therefore this evidence certifies the **narrowed** scope only. AC-3 (STAR behavioral
matrix render), AC-4 (seniority-calibrated contextual generation) and AC-5 (competency
0-100 scoring) are **NOT** covered by an E2E assertion in this gate. They remain
unverified by this package and must not be represented as green. Flagging explicitly so
the Gatekeeper does not read "10/10" as a blanket E2E certification.

## FILES CHANGED THIS PASS
**None.** This was a verification-only pass. The working tree already carries the prior
DIR-013 work; the only tracked file altered during the original implementation was
`vite.config.js` (+20 lines, `server.watch.ignored` for test-output dirs — a harness fix
that cannot alter app runtime behaviour). No code was modified during this re-verification.

## VERDICT
DIR-013 narrowed scope: **VERIFIED GREEN, independently reproduced.**
Ready for Gatekeeper release certification and freeze.