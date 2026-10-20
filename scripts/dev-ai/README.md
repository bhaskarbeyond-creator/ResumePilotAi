# Local AI acceptance stack (test-only)

The sandbox cannot reach any AI provider, so every AI endpoint on the normal dev
backend answers `503 AI_PROVIDER_UNAVAILABLE`. That is the real, honest state and
the candidate specs assert it. To also exercise the **success** contracts end to
end — UI → `lib/api-client` → Bearer token → Express → service → MariaDB → UI —
a second backend instance can use a deterministic stub as its provider.

The backend supports this explicitly: `backend/services/aiRuntime.js` reads
operator endpoint overrides (`OPENAI_BASE_URL`, …) "for self-hosted / private AI
gateways … and for acceptance testing". Nothing in application code changes.

## What it proves, and what it does not

- Proves: request and response contracts, server-side validation and parsing,
  persistence (e.g. `live_interview_sessions` rows), reload and resume, owner
  isolation (another account gets 404), and the UI states for real server data.
- Does **not** prove anything about AI quality. Every reply is a fixed,
  rule-based template, and its visible text says it came from the stub
  ("Acceptance stub …", "Stub observation …", "stub interviewer").

## Run it

```bash
# 1. Stub provider: 127.0.0.1 only, bearer key required.
node scripts/dev-ai/openai-acceptance-stub.mjs          # STUB_PORT=8790, STUB_API_KEY=acceptance-stub-key

# 2. Second backend on :8081: same database and auth settings as :8080.
cd backend && . ~/.cache/ime365-tools/backend.env.sh && PORT=8081 \
  OPENAI_API_KEY=acceptance-stub-key OPENAI_BASE_URL=http://127.0.0.1:8790/v1 \
  OPENAI_MODEL=acceptance-stub-model AI_ROUTING_DISCOVERY=false node index.js
```

The normal stack (frontend :4000 → backend :8080) stays untouched, so specs
that assert the real unavailable paths keep testing them.

- **Playwright** (`frontend/tests/candidate/interview-coach.spec.ts`, "acceptance
  stack" group) routes only `/api/generate-interview` and `/api/live-interview/*`
  to `E2E_ACCEPTANCE_API` (default `http://127.0.0.1:8081`). It skips with a
  reason when the stack is down, and checks `GET /__stub/stats` to prove the
  backend really called the provider.
- **Screenshots:** `scripts/audit/capture-candidate-screens.mjs --route-ai-to
  http://127.0.0.1:8081` does the same routing. Each capture-report entry
  records `aiRoutedTo`, and those files carry an `acceptance-` label.

## Stubbed operations

Operations are matched on the backend's own prompt text:

- `generate-interview`: a calibrated multiple-choice set. The correct option is
  rotated per question, so clients must read `correctAnswer`.
- `live-interview-open`, `live-interview-turn`, `live-interview-report`: the
  live interviewer. The server still decides when the interview closes
  (`targetTurns`) and clamps report scores.
- `live-interview-guide`: answer guidance.

Any other prompt gets HTTP 422. Other AI features then fail honestly; they
never receive stub content.

## Safety

- Never point a shared, staging or production backend at the stub.
- The stub binds to `127.0.0.1` only and needs no real credentials. The key
  above is a local placeholder, not a secret.
