# P002 · C4 — Surface 2: AI Assistant

Parent commit `6c317ca1a5590742a85e109f61a26d30d57d4eee` (C3). Candidate Dashboard scope only; no
backend change.

**Surface verdict: done within the environment's limits.** The page no longer invents output and
uses the real `POST /api/generate-content` contract. The *successful* AI path cannot run here (no
provider or network). Every unavailable shape the server really returns is verified, and nothing
is simulated.

## 1. Defect (C1, P0) and evidence

The old page posted to `/api/api/generate-content` (double prefix, always 404). On any failure,
or an empty answer, it called `generateHighFidelityFallback()` and displayed canned
"achievements" with invented numbers as AI output. It also showed a model badge ("Llama 3.2
Vision / Nemotron") and "Ready for ATS screening" without basis.

Reproduced with `scripts/audit/ai-assistant-interaction-evidence.mjs`: sign in as the E2E
account, submit one real bullet, record the screen and the network.

| Phase | API call | Invented metrics on screen | Evidence |
|---|---|---|---|
| Before | `404 POST /api/api/generate-content` | `38%`, `$45,000`, `99.98%`, `42% to 91%` | `docs/ui-audit/screenshots/ai-assistant/before/interaction-*` |
| After | `200 POST /api/generate-content` | none; the page states that AI is unavailable and nothing was generated | `docs/ui-audit/screenshots/ai-assistant/after/interaction-*` |

The *before* report was produced by the first version of the same steps; its key is named
`fabricatedMetricsShown`.

## 2. Server contract used (verified live in this sandbox)

| Tool | Operation and payload | Real answers handled |
|---|---|---|
| Improve a resume bullet | `enhance-single-bullet` `{ bullet, jobTitle?, tone }` | `{ enhancedBullet }` → result; `{ enhancedBullet: <source>, aiUnavailable: true }` → **unavailable** (the server echoes the user's own text, which is never shown as a result); 400 `INVALID_AI_INPUT` → server message |
| Professional summary | `generate-summary` `{ existingText, jobTitle?, skills[], tone }` | `{ summary }` → result; `{ questions[], requiresAnswer: true }` → the server's clarifying questions; `aiUnavailable` → unavailable |
| Skill suggestions | `generate-skills` `{ jobTitle, context: { facts: { skills[] } } }` | `{ skills: [{ name, basis }] }` → list; `{ skills: [], aiUnavailable: true }` → unavailable |
| Any | — | 5xx → unavailable; 429 → rate-limit message; other 4xx → server message; network failure → "did not reach the server. Nothing was generated." |

Tones are restricted to the backend's accepted set (`balanced`, `concise`, `technical`,
`executive`, `metrics`, `leadership`).

**Removed tools:** "Interview Answer Polisher" and "LinkedIn Headline & Pitch" have no backend
operation (the server answers `400 UNSUPPORTED_AI_OPERATION`). The old "Skills & Keyword
Extractor" described JD extraction that no operation performs; it is replaced by the real
`generate-skills` tool. Interview practice is covered by the Interview Coach surface.

## 3. Behaviour

- `/dashboard/ai?tool=bullet|summary|skills`: the tool lives in the URL (replace, no history
  spam), restored on refresh. Tool cards are a native radio group, so arrow keys work.
- Client-side checks mirror the server's rules and send no request when input is missing
  (bullet text; any summary input; target role for skills). The field is focused, with
  `aria-invalid` and a linked message.
- Results appear only for real AI output. Copy has its own polite live feedback. Recent results
  are kept for the visit only, and unavailable or failed requests are never listed.
- A single `role="status"` region announces generating, ready, questions and unavailable states.
  Focus returns to Generate after the busy state (shared hook
  `frontend/src/hooks/use-restore-focus-when-idle.ts`, now also used by the cover-letter builder).

## 4. Tests

`frontend/tests/candidate/ai-assistant.spec.ts`, 6 tests × 5 profiles.

| Test | Proves |
|---|---|
| tools and deep link | Only the 3 backend-backed tools; retired tools and claims absent; `?tool=` survives refresh; arrow keys switch tools and update the URL |
| bullet | Empty input blocked with no request; exact request body; the unavailable answer (HTTP 200, `aiUnavailable`) shows the unavailable message and no result, Copy or history; no invented metrics; input unchanged; focus back on Generate |
| summary | Thin input → the server's real clarifying questions, rendered in order; no result text |
| skills | Target role required; exact request body; unavailable → no suggestions list |
| network failure (FAULT INJECTION) | Aborted request → "did not reach the server … Nothing was generated" |
| accessibility | axe WCAG 2.1 A/AA: 0 violations for each tool and the validation state; no horizontal overflow |

Full run: `ai-assistant` + `cover-letters` + `auth-session` → **127 / 127 passed** in 7.0 min (30 +
75 + 20 + 2 setup), 0 flaky, retries disabled. The cover-letter suite was included because the
builder now imports the shared focus hook. Per-test results:
`docs/test-reports/P002-C4-ai-assistant-playwright.json`. Each AI test annotates which real answer
it received (here: HTTP 200 with `aiUnavailable=true`).

Not verifiable here: the success rendering of a real AI result, Copy of a result and history
entries. All three require a provider (**environment-blocked**). Their code paths only read the
documented success fields (`enhancedBullet`, `summary`, `skills`).

## 5. Gates

| Gate | Result |
|---|---|
| `npx tsc -b` | 0 errors |
| `npm run build` | Exit 0, 16 s wall (Vite 1.41 s); only the pre-existing chunk-size advisory; entry chunk 670.46 kB (unchanged from C3); AI page chunk 15.2 kB |
| `npx oxlint` | 346 warnings, 0 errors (C3: 347); 0 in changed files |
| Endpoint contract | Unmatched 8 → **7** (remaining: Resume Builder suggestions, Portfolio ×6) |
| Screenshots | `docs/ui-audit/screenshots/ai-assistant/{before,after}/`: 5 route captures each, all clean, plus the interaction pair |

## 6. Test environment notes

In addition to the C3 settings, the sandbox backend runs with `AI_BURST_LIMIT=60` (default 12 per
minute per account). The suite drives all five profiles as one account. The daily AI quota
(`AI_BASIC_DAILY_LIMIT`, 100) is unchanged; account A had 86 calls left before these runs. No
code or production default changed.

## 7. Review findings recorded for the next surfaces

While tracing the deterministic scorer for the Overview P0, two defects with one root cause were
confirmed. `frontend/src/lib/atsScore.d.ts` declares `score`, `categories`, `keywords` and
`actionItems`, but `calculateAtsScore` returns `totalScore`, `qualityScore`, `sections`,
`jdMatch`, `improvements` and `strengths`.

- **Overview: P0** (C1 had provisional P3). It reads `.score`, which is always undefined, and from
  `list[0].data`. So any candidate with a resume always sees a hard-coded "85% — recruiter
  benchmark ready".
- **ATS Score: P1** (C1 had provisional P2). It renders `result.score`, `relevanceScore`,
  `categories`, `keywords` and `actionItems`, none of which exist at runtime ("undefined%"). It
  also scores a placeholder "Candidate" resume when none is selected.
