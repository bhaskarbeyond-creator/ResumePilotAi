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
  - **Wizard Experience Engine, Recommendation Deduplication & Processing Modal (Light Edition)**: `2be055e`
  - **Enterprise Production Freeze (IAM, Multi-Tenancy, Queue, Encryption, AI Governance, Backup/Restore, 12 Console Modules, 10/10 adversarial isolation)**: `161dad4`
  - **Final Production Certification Freeze (Real-World TOTP P0 Lifecycle, Live HTTP Auth Gate Proofs, 403+ Tests, 7-Viewport Responsive Audit, Full Release Identity Alignment)**: `3b87761`
  - **Authoritative Real-DOM UI Control Freeze (1,716 Rendered Controls, 1,716 Physical Browser Passes, 0 Synthetic, 10 Viewports, 12 Anti-Fraud Mutations, 373 Tests, Master SHA `3936d1e...`)**: `86b0197`
  - **Dual-Database Platform & Autonomous Intelligent Sync Production Freeze (30 Canonical Tables, Continuous Background Sync Worker Daemon, Monotonic Out-of-Order Guard, Reversible Dual Switching, Live Auth CRUD Verified, Tag `production-freeze-2026-08-25`)**: `d9a4b29` — deployed & synchronized to `https://airesume.projectdemo.guru`
- **Freeze Status & Impact Governance**:
  - **Real-DOM Control Surface & Cryptographic Ledger**: `test-results/REAL_DOM_CONTROL_CENSUS.json` (1,716 unique rendered controls across 68 routes and 8 authenticated roles), `test-results/REAL_BROWSER_CONTROL_EXECUTION.json` (1,716 physical Playwright browser execution records sealed with SHA-256 `3936d1ef8aecf37301d5f85d5efb59074ff967a09224f122da2ebab02afe053e`), and `test-results/LEGACY_EVIDENCE_QUARANTINE.json` (12 legacy synthetic files quarantined) are certified and frozen.
  - **Processing Modal & Wizard UI**: `DashboardInterviews.jsx` (Light theme `AiGenerationProcessingModal` with 5-stage progress, elapsed timer, rotating tips, cancel/escape handler) and `BuildResume.jsx` (single brand logo in sidebar + clean `Resume Steps` header) are certified and frozen.
  - **Experience Engine & Rich Context Summary**: `src/utils/resumeData.js` (`calculateYearsOfExperience` merging overlapping date intervals across all formats) and `SummaryStep.jsx` (transmitting accurate years + complete education, certifications, projects, skills payload) are certified and frozen.
  - **Recommendation Deduplication**: `SkillsStep.jsx` (dynamic real-time suppression of added skills + `existingSkills` API argument), `CertificationsStep.jsx` (completion state detection + `All Added ✓` button handling), and `backend/services/aiRuntime.js` (negative constraint rules against re-generating existing skills/certs + spelling excellence) are certified and frozen.
  - **Enterprise IAM, Tenant Isolation & Multi-Tenancy**: `backend/enterprise/tenantService.js`, `backend/enterprise/tenantContext.js`, `backend/enterprise/tenantPolicy.js`, and `backend/routes/enterprise.js` — 10/10 adversarial isolation probes passed, fully certified.
  - **Enterprise Durable Outbox & Queue**: `backend/enterprise/enterpriseOutbox.js` — HMAC-SHA256 signed envelopes, DLQ, lease recovery, tamper rejection certified.
  - **Enterprise AES-256-GCM Encryption**: `backend/enterprise/tenantEncryption.js` — zero plaintext leakage, auth tag verification, fail-closed without key certified.
  - **Enterprise AI Governance & Quotas**: `backend/enterprise/tenantAi.js`, `backend/enterprise/tenantQuota.js` — client authority injection blocked, atomic Firestore quota bucketing certified.
  - **Enterprise Logical Backup/Restore**: `backend/enterprise/tenantBackup.js` — SHA-256 checksums, dry-run, path injection rejection, byte-for-byte restore certified.
  - **TOTP MFA Lifecycle Test**: `backend/test/totp-mfa-lifecycle.test.js` — 4 P0 invariants (`AUTHENTICATED!=MFA_AUTHENTICATED`, `RECENT_AUTH!=MFA_VERIFIED`, `STALE!=RECENT`, valid TOTP success+audit) proven via supertest + mock token verifier.
  - **All other frozen modules**: No regression. All test suites pass 100% (Interview 28/28, Security 246/246, Templates 72/72, Enterprise 23/23, Portfolio 3/3).
- **Modification Protocol**: Do not modify these certified baselines directly without strict regression testing (all test suites must remain 100% passing).

## 7. Continuous Synchronization & Deployment Protocol
- **Automatic Repo & Production Sync**: For every code update, bugfix, or feature implemented and verified:
  1. Verify zero regressions via test suite (`npm test`).
  2. Build production assets via `npm run build`.
  3. Commit and push the clean change set directly to GitHub remote `origin/main` with clear semantic commit messaging.



