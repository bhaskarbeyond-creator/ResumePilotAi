# ResumePilot AI — Antigravity Engineering Memory & Rules

## 1. Firebase Auth Session & Security Rules
- **`auth_time` vs `iat` Token Behavior**: In Firebase Auth JWTs, `auth_time` represents when the user originally entered their credentials (password/OAuth). `getIdToken(true)` updates `iat` (issued at) but **does not change `auth_time`**.
- **Sensitive Operations Gate**: Never enforce strict 10-minute `auth_time` age checks (`Date.now() - authTime > 10m`) on standard admin configuration or provider testing endpoints (`/api/admin/ai-settings`, `/api/admin/ai/test-provider`). This causes infinite re-authentication popups for logged-in admins. Limit `auth_time` enforcement exclusively to destructive account deletion (`/account/delete`).
- **Bearer Token Authorization**: Every user-facing AI generation request (`/api/generate-summary`, `/api/generate-work-description`, `/api/generate-content`, etc.) must attach the `Authorization: Bearer <token>` header from `fire.auth().currentUser.getIdToken()`. Unauthenticated requests return `HTTP 401 AUTH_REQUIRED`.

## 2. Secret Credentials & UI State Handling
- **Server-Only Secret Vault**: Secret API keys (NVIDIA, Gemini, OpenAI, Groq, OpenRouter, DeepSeek) are stored in server-side Firestore secrets (`settings/ai_providers`) and must never be echoed back in plain text to client browser payloads.
- **Post-Save UI Masking**: After saving settings, clear frontend text box states (`geminiApiKey: ''`, `nvidiaApiKey: ''`) to protect keys from browser DOM memory exposure, while rendering explicit status indicators (`✓ API key configured & active on server`).
- **Custom Model Flexibility**: All AI provider configuration UI cards must support both a 1-click curated model dropdown and a custom model string input field, allowing administrators to type any arbitrary model ID.

## 3. Resilient LLM JSON Parsing & Control Character Handling
- **Control Character Sanitization**: LLM output (especially from open-source or free-tier models) frequently contains raw unescaped newlines (`\n`) or tabs inside JSON string literals, causing standard `JSON.parse` to throw `SyntaxError: Bad control character`.
- **JSON Parsing Rule**: Always parse LLM JSON responses using the `extractJson` helper (which sanitizes control characters inside string literals) instead of calling `JSON.parse` directly.

## 4. NVIDIA NIM & Model Selection Benchmarks
- **DEPRECATED Model**: `meta/llama-3.1-8b-instruct` is **RETIRED on NVIDIA NIM** (HTTP 400 DEPRECATED as of Aug 2026). Do NOT use as primary or fallback model.
- **Default NVIDIA Model**: Use `meta/llama-3.2-11b-vision-instruct` as primary (220–460ms, confirmed active Aug 2026). Failover candidate: `nvidia/nemotron-mini-4b-instruct` (206–210ms, ultra-reliable).
- **Avoid**: `poolside/laguna-xs-2.1` — DEGRADED on NVIDIA NIM (`DEGRADED function cannot be invoked`). `meta/llama-3.3-70b-instruct` — severely overloaded queue (>30s timeouts).
- **Detailed Error Propagation**: Preserve raw LLM provider error messages (rate limits, worker pool limit reasons, HTTP status codes) in error normalization handlers instead of replacing them with generic fallback strings.

## 5. Deployment Bundle Integrity
- **Backend Directory Completeness**: When deploying Node.js backend files via SSH/SFTP (`deploy.py`), always upload all backend subfolders (`routes`, `services`, `security`). Omitting subfolders causes Node.js startup crashes (`MODULE_NOT_FOUND`) resulting in Apache/Nginx `HTTP 502 Bad Gateway`.

## 6. Certified Production Baselines & Code Freeze Protocol
- **Certified Baselines**:
  - **CV Module + Print/Download**: `1cf3d5d`
  - **Resume Builder + 51 Resume Templates**: `1ffa9f7`
  - **DOCX High-Fidelity Export Pipeline (51 Templates)**: `2c45381`
  - **AI Interview Coach & CBT Simulator Module**: `a15dd5d`
  - **AI Provider Fix (nvidia model deprecation + failover)**: `9f7dea7`
  - **AI Module Hardening & Resilience Pass (P1-P6)**: `9c479ff`
  - **Contextual Interview Coach & Zero-Leakage Generation Pipeline**: `54cb62f`
- **Freeze Status & Impact Governance**:
  - **Frozen-module source impact**: `backend/routes/ai.js` and `src/utils/interviewCoach.js` were updated to introduce deterministic multi-pass artifact stripping (`cleanInterviewMetadataArtifacts`), candidate/JD blueprint extraction (`buildContextualBlueprint`), and 4-Level hierarchical prompt formulation (`[LEVEL 1: CANDIDATE VERIFIED EVIDENCE]` to `[LEVEL 4: TARGET JOB REQUIREMENTS SPECIFICATION]`).
  - **Frozen-module behavioral impact**: **NONE**. The question generation contract, CBT examination flow, scoring algorithms, timer, and comprehensive report generation remain 100% behaviorally identical and backward compatible with the frozen baseline (`npm run test:interview` passing 28/28).
  - **All other frozen modules**: No direct or indirect impact identified. The CV Module, 4 CV Templates, Print/PDF Download Pipeline, Resume Builder Wizard, 51 Resume Templates, and 51-Template DOCX Export Pipeline remain untouched and fully certified.
- **Modification Protocol**: Do not modify these certified baselines directly without strict regression testing (all test suites must remain 100% passing).

## 7. Continuous Synchronization & Deployment Protocol
- **Automatic Repo & Production Sync**: For every code update, bugfix, or feature implemented and verified:
  1. Verify zero regressions via test suite (`npm test`).
  2. Build production assets via `npm run build`.
  3. Commit and push the clean change set directly to GitHub remote `origin/main` with clear semantic commit messaging.



