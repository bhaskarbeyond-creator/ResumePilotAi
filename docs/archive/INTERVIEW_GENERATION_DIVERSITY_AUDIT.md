# AI Interview Question Diversity — Root-Cause Investigation

**Baseline:** certified production baseline `a15dd5d` (tree = current checkout; the docs-only commit `c93eccc` did not touch application code).
**Production:** `https://airesume.projectdemo.guru`
**Date of audit:** 2026-08-19

> Summary: The product **is** a genuine AI-generation pipeline, but it has **no controlled-diversity
> mechanism, no cross-attempt de-duplication, a deterministic static fallback that returns
> byte-identical questions, and a difficulty control that does not actually change question
> difficulty**. Under two very plausible production conditions — (a) provider `temperature`
> configured at/near `0`, or (b) any AI failure/timeout/rate-limit/parse error triggering the
> static fallback — repeated attempts return the same or near-identical questions. This is the
> root cause of the reported symptom.

---

## 1. Exact generation flow (UI → response)

```
Frontend  DashboardInterviews.jsx  (fetchInterviewQuestions)
  ├─ builds payload:
  │    occupation, interviewType, questionCount, language,
  │    experienceLevel, difficulty,
  │    jobDescription  = sanitizeJobDescription(...)   [≤4000 chars, whitespace-collapsed]
  │    resumeFacts     = sanitizeResumeFacts(...)      [≤2500 chars, real candidate facts only]
  └─ POST {config.provider}://{config.backendUrl}/api/generate-interview   (Bearer token)

Backend  index.js middleware chain (in order):
  ├─ express.json (256kb limit)
  ├─ CORS allowlist  →  helmet  →  global IP rate limiter (200/15min)
  ├─ requireAuth  →  enforceApiPolicy
  ├─ aiPaths → aiAccountLimiter + enforceDailyAiQuota        [429 if over quota]
  ├─ routes/ai.js router.use(AI_ROUTE_PATHS) guard:
  │    rejects client-supplied apiKey / identity fields; rejects >50KB bodies
  └─ router.post('/generate-interview')

Backend  routes/ai.js /generate-interview:
  ├─ validate occupation (≤160) + interviewType ∈ {technical,behavioral,mixed,hr,managerial,case}
  ├─ clamp questionCount to [5,20]
  ├─ build prompt (deterministic from inputs; NO per-request nonce; NO previous-question exclusion)
  ├─ generateConfiguredText(req,res,prompt,'generate-interview',{maxTokens:4096})
  │     → loadProviderConfiguration(db)      [temperature from Firestore 'data/public_config' ai.temperature,
  │                                           default 0.7; cached 15s]
  │     → generateWithProviders → requestProvider(provider, cfg, prompt, cfg, {timeoutMs})
  │           sends { model, messages, temperature, max_tokens } (OpenAI-style) or
  │           { contents, generationConfig: {temperature, maxOutputTokens} } (Gemini)
  ├─ parse JSON via extractJson (tolerant fenced/prose extraction)
  │    if count != requested: slice to requested count
  └─ on any throw/parse failure → generateDefaultInterview(...)   [STATIC BANK]
```

---

## 2. Is a real AI/model call made for every new interview?

**Yes.** Every `/generate-interview` request that passes auth/quota reaches `generateConfiguredText`
→ `generateWithProviders` → `requestProvider`, which performs a real HTTPS call to the configured
provider API. This was verified both by code inspection and empirically (a captured provider request
is produced by `requestProvider`). The frontend does **not** reuse cached questions; each "Start
interview" performs a fresh `fetch` to the endpoint.

## 3. Which model/provider is actually invoked?

Server-selected. `loadProviderConfiguration` picks the primary provider from
`data/public_config.ai.provider` (default `gemini`) and enables providers that have a server-side
key (env `*_API_KEY` or the `settings/ai_providers` secret doc). Provider defaults:

| provider   | default model                       |
|------------|-------------------------------------|
| nvidia     | meta/llama-3.1-8b-instruct          |
| gemini     | gemini-2.0-flash                    |
| openai     | gpt-4o-mini                         |
| groq       | llama-3.3-70b-versatile             |
| openrouter | meta-llama/llama-3.3-70b-instruct:free |
| deepseek   | deepseek-chat                       |

The model name is echoed to the client in the `X-AI-Model` response header; provider in
`X-AI-Provider`.

## 4. Is the model invocation deterministic?

It depends entirely on the configured `temperature`:

- The only sampling parameters sent are `temperature` and `maxTokens`/`maxOutputTokens`.
  **No `seed` and no `top_p` are ever sent** (empirically confirmed for both OpenAI-style and Gemini
  providers).
- At `temperature = 0` the request is **byte-identical** across repeated runs → the model uses
  greedy decoding → **identical questions every time** (empirically confirmed: two `temperature=0`
  calls produce identical payloads).
- At `temperature > 0` (default 0.7) the provider samples stochastically, so output *should* vary —
  **but** the prompt itself is identical on every attempt (no per-request nonce), so a model tends to
  converge on the same question set, especially for a short, low-entropy prompt like this one.

## 5. Are temperature / top_p / seed used? Any fixed seed?

- `temperature`: used, read from DB config (`ai.temperature`), default `0.7`. It is **not overridden**
  for the interview operation (only `maxTokens` is forced to 4096).
- `top_p`: **not used**.
- `seed`: **not used** — no seed parameter is sent to any provider for any operation.
- No fixed seed exists; but equally there is **no per-request diversity nonce** in the interview
  prompt (contrast: the legacy content operations inject a random `SessionID` into their prompts —
  the interview path does not).

## 6. Is there caching of generated questions?

**No.** The only cache is `configurationCache` in `aiRuntime.js`, which caches the *provider
configuration* (temperature, models, keys) for 15 seconds. Generated questions are never cached.

## 7. Does the frontend accidentally reuse the previous question set?

**No.** `fetchInterviewQuestions` issues a fresh network request each time. No question cache is
read.

## 8. Is localStorage/session persistence restoring old questions instead of generating a new set?

**No for new attempts.** localStorage is used only for:
- `preferredLanguage`/`language` (language selection),
- `interviewSession:<uid>` — the **in-progress** exam (phase `exam`), restored on reload so a partially
  finished attempt isn't lost. This is intentional crash-recovery, not question regeneration.
- `interviewHistory:<uid>` — completed reports, shown as a list and used for the STAR report; it is
  **never** fed back into generation.

## 9. Is there a fallback question bank?

**Yes** — `generateDefaultInterview` in `backend/routes/ai.js`. It is a hardcoded bank of 10
questions (5 "technical" + 5 "behavioral"), selected only by `interviewType` (technical → the 10
mixed set; anything else → the same 10 with ordering swapped).

## 10. Is the fallback triggered more often than expected?

The fallback fires whenever any of these happen inside the route:
- `loadProviderConfiguration` finds **no enabled provider with a key** → `AI_PROVIDER_UNAVAILABLE`
  → fallback (this would make **every** request fall back → identical questions for all users).
- The provider API returns an error/timeout/rate-limit/HTTP 4xx-5xx → `generateWithProviders` throws
  → fallback.
- The model returns empty content, prose-only (no extractable JSON), or malformed JSON →
  `extractJson` returns null → the `parseError` catch → fallback.
- The model returns JSON without an `id`/`options`/`correctAnswer` structure the frontend can score →
  this is caught client-side as `INVALID_AI_OUTPUT`, but the backend already returned whatever JSON
  it parsed (no fallback in that case).

I could not read production Firestore/secret config or logs from the sandbox, so I cannot state a
numeric production fallback rate. What I can state from the code is that **if** either condition in
point 4/10 holds (temp=0 config **or** any provider failure/parse failure), the fallback **is** the
dominant path and it is byte-identical across attempts.

## 11. Are retries producing the same response?

At `temperature=0` or via the static fallback, yes — byte-identical. At default `temperature=0.7`
with a healthy provider, each retry samples fresh, but with an identical prompt the model converges
on similar questions/competencies.

## 12. Is the API request payload actually changing between attempts?

The payload changes only when the user changes a field (role/JD/resume/difficulty/type/count).
For identical inputs (the controlled experiment in the task), the payload is **identical** every
attempt. This is correct behavior — but because the backend prompt is a pure function of the payload
and there is no nonce, identical payloads produce identical prompts.

## 13. Is resume context included correctly?

**Yes.** `resumeFacts` is built by `sanitizeResumeFacts` (name, occupation, summary, work titles,
projects, skills, certifications, education — HTML stripped, bounded to 2500 chars) and is placed in
the prompt under `Use ONLY these candidate facts (do not invent experience)`. Grounding is intact.

## 14. Is the JD included correctly?

**Yes.** `jobDescription` is whitespace-collapsed and bounded to 4000 chars, included as
`Align some questions to this job description without fabricating requirements`.

## 15. Are role/difficulty/interviewType reaching the backend?

- `occupation` — **yes** (validated, required).
- `interviewType` — **yes** (validated against allowlist).
- `difficulty` — **yes**, sent as a string (e.g. `easy`/`medium`/`hard`/`expert`).
- `experienceLevel` — **yes**, sent.
- `questionCount` — **yes**, sent and clamped to [5,20].
- `mode` (practice/mock/assessment) — **not sent**. This is a UI/CBT timing concept, so this is
  arguably correct; but it means "mode" cannot influence question strategy (see item 18).

## 16. Do those fields actually influence the prompt?

- `occupation` / `interviewType` → **yes** (role name + `promptContext` per type).
- `experienceLevel` / `difficulty` → **only as a single text label** (`Candidate experience level: X`
  / `Target difficulty: X`). The actual **difficulty distribution in the prompt is hardcoded**:
  `Math.floor(count*0.3) Easy, Math.floor(count*0.5) Intermediate, Math.ceil(count*0.2) Advanced` —
  identical for `easy` and `expert`. **Difficulty does not meaningfully change question difficulty.**
- `resumeFacts` / `jobDescription` → yes, included (grounded).
- **No field from the previous-attempt history is included** → nothing prevents repetition.

## 17. Is the AI instructed to avoid repeating questions from previous attempts?

**No.** The prompt contains no instruction of the kind. There is no mention of prior attempts.

## 18. Is previous interview history considered appropriately?

**No.** Previous history is stored only in browser `localStorage` (for the STAR report) and is never
used to steer generation. There is no recent-question exclusion, no semantic filtering, no competency
coverage tracking.

## 19. Is question de-duplication currently implemented?

**Within a single response:** only ID de-duplication in the frontend `normalizeQuestions` (renames
duplicate `id`s); question *text* is not deduplicated, and the model is not asked to avoid duplicates.
**Across attempts:** none.

## 20. Is de-duplication accidentally over-constraining generation?

**No — it is absent.** No de-duplication exists, so nothing over-constrains; the problem is the
opposite direction (nothing *prevents* repetition).

## 21. Does `normalizeQuestions` change or collapse distinct model outputs?

**No.** `normalizeQuestions` only trims/bounds strings, drops malformed questions, and fixes duplicate
`id`s. It preserves distinct question text; it does **not** collapse or deduplicate distinct outputs.
It is not the cause of repetition.

## 22. Is hardcoded/static question data mixed into the generated result?

**Only via the fallback.** The primary AI path streams pure model output. The fallback
(`generateDefaultInterview`) is entirely hardcoded. When triggered, that static data **is** the
returned result and is identical every time. In the fallback the only variable is the occupation
name interpolated into 3 of the 10 question texts; difficulty, JD, resume facts, experience level,
and the requested question count are all ignored (the fallback always returns 10 questions).

---

## Empirical evidence gathered

Using the real `requestProvider` from `backend/services/aiRuntime.js` with a request-capturing
mock transport, I verified the exact provider payloads:

- OpenAI-style payload: `{ model, messages, temperature, max_tokens }` — **no `seed`, no `top_p`**.
- Gemini payload: `generationConfig: { temperature, maxOutputTokens }` — **no `seed`, no `topP`**.
- `temperature=0` called twice → **identical payloads** (deterministic).
- `temperature=0.7` called twice → identical payloads as well (diversity relies entirely on the
  provider's stochastic sampling; the prompt is unchanged).

Code inspection of `generateDefaultInterview` confirmed:
- No `Math.random`, no `Date.now`, no dependence on `difficulty`, `experienceLevel`,
  `jobDescription`, `resumeFacts`, or `questionCount`.
- Returns the same 10-question set for a given `interviewType` on every call.

---

## Architectural verdict

| | |
|---|---|
| **True AI generation?** | Yes — the primary path is a real model call per request. |
| **Effective / grounded / fresh?** | **No.** No controlled-diversity mechanism (no nonce/seed), no cross-attempt de-dup, difficulty is cosmetic, and the deterministic static fallback returns byte-identical questions whenever the AI fails or when temperature is configured to `0`. |
| **Effective architecture?** | "AI generation **+** a deterministic/static fallback that can dominate in practice and then returns identical questions." |

**Root cause:** repeated/near-duplicate questions arise from (a) a fully deterministic generation
path when `temperature` is `0` or the provider is otherwise deterministic, and (b) the static
fallback being byte-identical whenever the AI path fails/parses-empty. The absence of any
deduplication or diversity control means nothing corrects for this.

---

## Bugs found

1. **Static, byte-identical fallback** — `generateDefaultInterview` returns the same questions for a
   given `interviewType`, ignores `questionCount` (always 10), `difficulty`, `experienceLevel`, JD,
   and resume facts.
2. **Difficulty is cosmetic** — the prompt's Easy/Intermediate/Advanced split is hardcoded
   30/50/20 regardless of the requested difficulty.
3. **No per-request diversity nonce** in the interview prompt (unlike the legacy content operations
   which do inject a random `SessionID`).
4. **No cross-attempt de-duplication** — previous questions/competencies are never excluded.
5. **No observability on the fallback** — the response does not indicate whether AI or fallback was
   used, so fallback frequency cannot be measured in production.
6. **Fallback collapses 6 interview types into 2 question sets** (`hr`, `managerial`, `case`,
   `mixed` all reuse the behavioral set).

---

## Recommended architecture changes

1. Inject a **per-request nonce + a "fresh set" directive** into the interview prompt so even a
   low-temperature/deterministic model produces a distinct, role-grounded set each run (controlled
   diversity; does **not** change `temperature`).
2. Make **difficulty and experience level actually drive the prompt**: compute a real
   Easy/Intermediate/Advanced distribution from the requested difficulty + seniority instead of the
   hardcoded 30/50/20.
3. Add **bounded, privacy-preserving cross-attempt de-duplication**: the frontend already holds
   recent history in `localStorage`; send a bounded list of the last few question texts
   (`previousQuestions`, capped) so the prompt can exclude them and the fallback can drop exact
   duplicates. Keep it bounded; do not ship unlimited history.
4. Rewrite the fallback to be **role-, difficulty-, interviewType- and questionCount-aware**,
   deterministic-per-input (seeded), grounded, and to never return more/duplicate questions than
   requested; mark its output `_source: 'fallback'` and emit an `X-AI-Source` header for
   observability of fallback frequency.
5. Add regression tests that prove (a) the AI path is invoked, (b) the fallback is only used on
   failure, (c) repeated independent attempts yield non-identical but equally relevant question sets,
   and (d) different role/difficulty/interviewType produce materially different questions.

All security, grounding, authentication, persistence, timer, and frozen-module guarantees are
preserved: sanitization of `resumeFacts`/`jobDescription`, server-owned provider credentials,
auth/quota/rate-limit middleware, localStorage session/history logic, and the interview
timer/CBT logic are untouched.
