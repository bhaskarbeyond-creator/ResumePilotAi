# IME365 — Autonomous Engineering Directive: FreeLLMAPI Native Engine (10/10 Production Parity)
## Complete Replacement of Legacy AI Infrastructure, Native 74-Platform Support, SSE Streaming, Prompt Compression, and Full-Surface Playwright Verification

**Document Type:** Mandatory Engineering Operating Directive  
**Project:** IME365 — Interview Made Easy  
**Execution Mode:** Autonomous Remote Development (Codex CLI / Cline / Claude Code)  
**Executive Engineering Lead:** Antigravity (Google DeepMind)  
**Target Baseline Commit:** `1d67bc8052f503ecc81e6aa7c56c52f3b7ee7a3f` (short SHA: `1d67bc80`)  
**Target Branch:** `main`  
**Remote Repository:** `git@github.com:bhaskarbeyond-creator/ResumePilotAi.git`  
**Reference Source (STRICTLY REFERENCE ONLY):** `freellmapi-0.16.6/` (Root directory)  
**Active Production Subsystem:** `backend/freellmapi/` (Pure CommonJS, zero external daemon)  
**Modern Frontend:** `frontend/src/` (React 19 + TypeScript, Cuba M3 Executive Glassmorphic UI)  
**Target Server Environment:** Node.js 20+ / 24+, MariaDB/MySQL, XAMPP (Local) & Hostinger Shared Linux Hosting (cPanel / Passenger)  
**Quality Mandate:** Strict 10/10 Excellence (0 errors, 0 warnings, 0 mocks, 5-viewport verified)  

---

# SECTION 1 — EXECUTIVE MANDATE & OBJECTIVE

You are assigned as the **Senior Staff Implementation & Verification Engineer**.

### 1.1 Core Mission
The local development suite has completed the architectural migration of the core FreeLLMAPI engine into [`backend/freellmapi/`](file:///d:/xampp/htdocs/IME365/backend/freellmapi/), safely archived the legacy `aiRouting` infrastructure into [`backend/archive/legacy-aiRouting/`](file:///d:/xampp/htdocs/IME365/backend/archive/legacy-aiRouting/), merged Candidate Suite C15 (Saved Favorites), and pushed the synchronized baseline to `origin/main` at commit `1d67bc80`.

Your objective is to **autonomously elevate [`backend/freellmapi/`](file:///d:/xampp/htdocs/IME365/backend/freellmapi/) to complete 10/10 feature parity with the reference implementation (`freellmapi-0.16.6/`)**, resolve all architectural gaps identified in the forensic audit, implement real-time Server-Sent Events (SSE) streaming, add prompt compression, expose the standard public `/v1/chat/completions` surface, and prove end-to-end operational excellence with automated Playwright browser tests across 5 viewports.

### 1.2 Inviolable Environmental Constraints (Shared Hosting & Zero Extra Daemons)
- **Reference Only:** `freellmapi-0.16.6/` is a reference monorepo. **DO NOT attempt to run it as a separate background daemon, do not bind extra ports (e.g. 3001), and do not install native C++ compilation dependencies (`better-sqlite3`, `node-gyp`).**
- **In-Process & Pure JS:** The engine must run **100% in-process** inside the existing IME365 Express application (`backend/index.js`).
- **Node 20+ Native Capabilities:** Use native Node.js features: built-in `fetch`, `node:crypto`, `ReadableStream`, and Node 22's built-in `node:sqlite` for lightweight zero-dependency persistence.
- **Shared Hosting Compatibility:** The implementation must pass all tests in `backend/test/shared-hosting-compatibility.test.js` without regression.

---

# SECTION 2 — MANDATORY PRE-FLIGHT REPOSITORY VERIFICATION

Before writing or modifying any code, establish your workspace and verify sync against `origin/main`:

```bash
git fetch origin
git checkout main
git reset --hard 1d67bc80
git status
git log -1 --stat
```

Confirm that the HEAD commit is exactly:
`1d67bc8052f503ecc81e6aa7c56c52f3b7ee7a3f` (`Merge branch 'origin/arena/994d7b67-resumepilotai' (Candidate Suite: Saved Favorites C15)`).

---

# SECTION 3 — FORENSIC GAPS TO RESOLVE (THE 7 PILLARS OF 10/10 PARITY)

### 🔴 Pillar 1: Public `POST /v1/chat/completions` HTTP Endpoint
- **Gap:** Currently, `backend/freellmapi` is only callable internally via Node function calls (`completeChat`). Coding agents (Cursor, Cline, Roo Code, Aider, Python/Node OpenAI SDKs) pointing to `http://localhost/v1/chat/completions` receive `HTTP 404 Not Found`.
- **Requirement:** 
  1. Mount `app.post('/v1/chat/completions', ...)` in `backend/index.js`.
  2. Accept standard OpenAI request body: `messages`, `model`, `temperature`, `max_tokens`, `stream`, `tools`, `response_format`.
  3. Validate Bearer token (accepting Firebase auth tokens or platform API keys).
  4. Return standard OpenAI completion response structure:
     ```json
     {
       "id": "chatcmpl-...",
       "object": "chat.completion",
       "created": 1729500000,
       "model": "llama-3.3-70b-versatile",
       "choices": [{ "index": 0, "message": { "role": "assistant", "content": "..." }, "finish_reason": "stop" }],
       "usage": { "prompt_tokens": 120, "completion_tokens": 85, "total_tokens": 205 }
     }
     ```

### 🔴 Pillar 2: Server-Sent Events (SSE) Streaming Generator
- **Gap:** Both `openaiCompat.js` and `googleGemini.js` execute synchronous `await res.json()`. If a client passes `stream: true`, the engine fails or buffers the entire response.
- **Requirement:**
  1. Implement streaming async generator inside `backend/freellmapi/providers/openaiCompat.js` and `googleGemini.js` when `stream: true`.
  2. Parse upstream SSE chunks (`data: {...}`) and yield standardized delta payloads:
     ```
     data: {"id":"chatcmpl-...","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}
     
     data: [DONE]
     ```
  3. In `POST /v1/chat/completions` and `POST /v1/messages`, pipe chunks with `res.setHeader('Content-Type', 'text/event-stream')`, `res.setHeader('Cache-Control', 'no-cache')`, and `res.flushHeaders()`.

### 🔴 Pillar 3: Search & Media Provider Isolation
- **Gap:** In `backend/freellmapi/providers/registry.js`, Tavily, Firecrawl, Exa, Linkup, Parallel, and SerpSearch are cataloged with `type: 'search'`, but `router.js` sends them to `callOpenAiCompat`, which issues `POST https://api.tavily.com/chat/completions` and crashes with 404/422.
- **Requirement:**
  1. Filter out all `type: 'search'` and `type: 'media'` providers from the chat completions cascade in `router.js` (`buildCandidateList`).
  2. Implement `backend/freellmapi/services/search.js` based on `freellmapi-0.16.6/server/src/services/search.ts` to cleanly handle search queries for Tavily, Firecrawl, and Exa.
  3. Mount `app.post('/v1/search', ...)` in `backend/index.js` for agent web search tools.

### 🔴 Pillar 4: Pure-JS Multi-Stage Prompt Compression Pipeline
- **Gap:** The reference contains a 9-engine compression pipeline (`server/src/services/compression/`) saving 30–70% of tokens to prevent hitting free-tier TPM/RPM limits. The current system has zero compression.
- **Requirement:**
  1. Create `backend/freellmapi/services/compression/` in pure CommonJS.
  2. Implement the three most critical compression engines from reference:
     - `jsoncompact.js`: Strips formatting whitespace and unnecessary keys from JSON prompts.
     - `dedup.js`: Deduplicates repeated messages and overlapping context.
     - `hard-budget.js`: Truncates least-informative history turns when total prompt exceeds model context limits.
  3. Integrate compression into `router.js` prior to dispatching upstream requests.

### 🔴 Pillar 5: Plaintext Tool-Calling Rescuing & Schema Repair
- **Gap:** Budget free models frequently output function calls as markdown blocks (` ```json {"name": "saveResume"} ````) instead of native `tool_calls`.
- **Requirement:**
  1. Port `rescueInlineToolCalls` from `freellmapi-0.16.6/server/src/lib/tool-call-rescue.ts` into `backend/freellmapi/lib/toolRescue.js`.
  2. If `tools` were provided in the request and the model returned plaintext containing tool markers or JSON function calls, extract and populate `message.tool_calls` so callers receive valid structured output.

### 🔴 Pillar 6: Multi-Key Pooling & Rotation per Provider
- **Gap:** `system_settings` and `router.js` only support a single string key per provider. When a key is rate-limited (HTTP 429), the entire provider goes onto cooldown.
- **Requirement:**
  1. Support `key: string | string[]` in provider configuration.
  2. In `router.js`, rotate keys round-robin or on 429 backoff before benching the provider onto cooldown.
  3. Update Super Admin UI (`AdminAiSettingsTab.tsx`) to support entering multiple comma-separated keys or key chips for high-volume providers (Groq, Cerebras, Gemini).

### 🔴 Pillar 7: Node 22+ Built-in `node:sqlite` Persistence
- **Gap:** Cooldowns and latency records live purely in volatile RAM `new Map()`, wiped out whenever Node restarts.
- **Requirement:**
  1. Create `backend/freellmapi/services/persistence.js` using Node.js built-in `node:sqlite` (fallback to in-memory Map if `node:sqlite` is unavailable).
  2. Persist provider latency metrics, cooldown expiry timestamps, and request counts into `data/freellm_metrics.db`.
  3. Ensure zero external npm dependencies or native compilation steps are introduced.

---

# SECTION 4 — FRONTEND & SUPER ADMIN PARITY (`frontend/src/components/admin/AdminAiSettingsTab.tsx`)

1. **Active Provider Catalog & Key Management:**
   - Display all 74 providers categorized into **Frontier Free Tier**, **Fast Community Mesh**, and **Agent Search & Extraction Tools**.
   - Show live operational status pills: `● Live & Active`, `○ Keyless Active`, `⊘ Rate-Limited Cooldown`, `— Not Configured`.
   - Dedicated key configuration modal supporting:
     - Keyless instant activation (Kilo Gateway, OVH, AI Horde) with 0 errors.
     - Multi-key pooling input.
     - Live **⚡ Test Connection** button probing provider latency.
2. **Visual Cuba M3 Glassmorphism:**
   - Dark executive theme with translucent surfaces (`backdrop-blur-md`), vibrant accent badges, and zero layout shift (FOUC).
   - Meet WCAG 2.1 AA accessibility: full keyboard navigation (`Tab`, `Space`, `Enter`, `Escape`), focus trap on modals, ARIA attributes.
3. **Enterprise BYOK Isolation:**
   - In `EnterpriseAiTab.tsx`, maintain read-only executive status badges (`✓ Enterprise Dedicated AI Active` or `Platform High-Availability Shared Gateway`).
   - Tenant keys managed exclusively in Super Admin Tenant Management modal with AES-256-GCM envelope encryption.

---

# SECTION 5 — AUTOMATED TESTING & PLAYWRIGHT VERIFICATION MANDATE

You must validate and provide incontrovertible evidence for all 5 layers:

### Layer 1: Static Analysis & Compilation
- `npx tsc -b frontend` exits with **0 errors**.
- `npm run build --prefix frontend` succeeds in under **3.0s** and synchronizes to `dist/`.

### Layer 2: Backend Unit & Integration Tests
Run and verify 100% pass rate:
```bash
node --test backend/test/freellmapi-engine.test.js
node --test backend/test/shared-hosting-compatibility.test.js
node --test backend/test/favourites-candidate-api.test.js
```
Expand `backend/test/freellmapi-engine.test.js` to cover:
- Streaming chunk generation (`stream: true`).
- Prompt compression token reduction.
- Multi-key rotation under simulated 429.
- Search provider isolation.

### Layer 3: Live End-to-End API Verification
Execute automated live integration tests verifying:
1. `POST /v1/chat/completions` non-streaming returns valid JSON completion.
2. `POST /v1/chat/completions` with `stream: true` yields valid `text/event-stream` chunks.
3. `POST /v1/messages` handles Anthropic format cleanly.
4. Transparent failover: Simulated 429 on Groq seamlessly fails over to Cerebras / Gemini with 0 error returned to client.

### Layer 4: Playwright E2E Multi-Viewport Browser Verification
Execute automated browser crawls using Playwright across 5 mandatory viewports:
- Desktop: `1920x1080`
- Laptop: `1440x900`
- Small Laptop: `1024x768`
- Tablet: `768x1024`
- Mobile: `375x667`

Verify:
1. Super Admin logs in, navigates to `/admin?tab=ai-settings`.
2. All 74 providers render with accurate category tabs and search filter.
3. Click "+ Configure Provider", select Kilo Gateway, click "Add key & Activate" -> Activates with HTTP 200 and zero 400 errors.
4. Select Groq / Gemini, enter key, test connection -> Shows live latency badge.
5. Capture full-page screenshots for each viewport in `docs/ui-audit/screenshots/freellmapi/`.

---

# SECTION 6 — FORENSIC HANDOVER DELIVERABLES

Conclude your implementation with:
1. **Incremental Git Commits:** Atomic, conventional commits (`feat(freellmapi): ...`, `test(freellmapi): ...`).
2. **Git Diff Audit:** Summary of files modified and created.
3. **Test Logs:** Full console output proving all unit, integration, and build gates passed.
4. **Playwright Evidence Bundle:** Directory of screenshot artifacts proving multi-viewport visual perfection and error-free operation.
5. **Updated Repository Push:** Pushed to `origin/main` with updated commit SHA and branch ID.

**Proceed autonomously with plan formulation, implementation, testing, and evidence certification.**
