# AI INFRASTRUCTURE AUDIT

> **Audit Date**: 2026-08-30 | **HEAD SHA**: `b6ec79b`

---

## 1. AI ARCHITECTURE OVERVIEW

### Components

| Component | File | Size | Purpose |
|-----------|------|------|---------|
| AI Routes | backend/routes/ai.js | 64KB (997 lines) | HTTP API layer for all AI endpoints |
| AI Runtime | backend/services/aiRuntime.js | ~60KB | Provider abstraction, cascade, grounding, JSON extraction |
| AI Admin | backend/routes/aiAdmin.js | N/A | Admin AI settings CRUD |
| Interview Coach | backend/services/interviewCoach.js | N/A | AI-powered interview simulation |
| Admin AI Entitlement | backend/services/adminAiEntitlement.js | N/A | Daily quota management |
| AI Usage Table | ai_usage | MariaDB | Per-user daily usage tracking |
| System Settings | system_settings (category='ai') | MariaDB | Provider config persistence |

### Data Flow

```
Client → Bearer Auth → ai.js middleware → enforceApiPolicy → enforceDailyAiQuota
       → executeContentOperation / executeResumeParsing / interview coach
       → loadProviderConfiguration (from MariaDB system_settings)
       → generateWithProviders (cascade through configured providers)
       → extractJson (control char sanitization)
       → grounding validation (verify output against source facts)
       → response with X-AI-Provider / X-AI-Model headers
```

---

## 2. PROVIDER INVENTORY

| Provider | Env Key | Default Model | Base URL Override | Status |
|----------|---------|---------------|-------------------|--------|
| Gemini | GEMINI_API_KEY | gemini-2.0-flash | GEMINI_BASE_URL | 🟢 ACTIVE |
| NVIDIA NIM | NVIDIA_API_KEY | meta/llama-3.2-11b-vision-instruct | NVIDIA_BASE_URL | 🟢 ACTIVE |
| OpenAI | OPENAI_API_KEY | gpt-4o-mini | OPENAI_BASE_URL | 🟢 ACTIVE |
| Groq | GROQ_API_KEY | (configured via admin) | GROQ_BASE_URL | 🟢 ACTIVE |
| OpenRouter | OPENROUTER_API_KEY | (configured via admin) | OPENROUTER_BASE_URL | 🟢 ACTIVE |
| DeepSeek | DEEPSEEK_API_KEY | (configured via admin) | DEEPSEEK_BASE_URL | 🟢 ACTIVE |

### Known Model Issues (from AGENTS.md)

| Model | Status | Issue |
|-------|--------|-------|
| meta/llama-3.1-8b-instruct | 🔴 RETIRED | HTTP 400 DEPRECATED on NVIDIA NIM |
| poolside/laguna-xs-2.1 | 🔴 DEGRADED | Cannot be invoked on NVIDIA NIM |
| meta/llama-3.3-70b-instruct | 🟡 OVERLOADED | >30s timeouts due to queue congestion |
| meta/llama-3.2-11b-vision-instruct | 🟢 PRIMARY | 220-460ms, confirmed active |
| nvidia/nemotron-mini-4b-instruct | 🟢 FAILOVER | 206-210ms, ultra-reliable |

---

## 3. ACTIVE AI ENDPOINTS

| Endpoint | Method | Purpose | Auth | Quota | Input Validation | Output Validation | Status |
|----------|--------|---------|------|-------|-----------------|-------------------|--------|
| /api/generate-content | POST | Grounded section rewrite/generation | Bearer JWT | Daily + burst | Size limit (50KB), identity rejection, key rejection | extractJson + grounding validator | 🟢 ACTIVE |
| /api/parse-resume | POST | Resume import from PDF/DOCX text | Bearer JWT | Daily + burst | Size limit, identity rejection | extractJson | 🟢 ACTIVE |
| /api/generate-interview | POST | Interview coach Q&A generation | Bearer JWT | Daily + burst | Size limit, identity rejection | extractJson | 🟢 ACTIVE |
| /api/check-grammar | POST | Grammar and spell checking | Bearer JWT | Daily + burst | Size limit | Text response | 🟢 ACTIVE |
| /api/generate-ai-cover-letter | POST | Cover letter AI generation | Bearer JWT | Daily + burst | Size limit, identity rejection | extractJson | 🟢 ACTIVE |

### Retired AI Endpoints (HTTP 410)

| Endpoint | Reason | Replacement |
|----------|--------|-------------|
| /api/generate-resume | Ungrounded whole-resume generation | Guided resume editor |
| /api/generate-summary | Duplicate; replaced by generate-content | /api/generate-content |
| /api/generate-work-description | Duplicate | /api/generate-content |
| /api/generate-education-description | Duplicate | /api/generate-content |
| /api/generate-skills | Duplicate | /api/generate-content |

---

## 4. SECURITY CONTROLS

### Input Security

| Control | Implementation | Status | Evidence |
|---------|---------------|--------|----------|
| Bearer Token Auth | requireAuth middleware on all AI routes | 🟢 | ai.js middleware chain |
| Client Key Rejection | Rejects `apiKey` body field and `x-gemini-api-key` header | 🟢 | CLIENT_AI_KEY_REJECTED (HTTP 400) |
| Identity Injection Prevention | Rejects `uid`, `userId`, `ownerUid`, `resumeId`, `profileId` in body | 🟢 | CLIENT_AI_IDENTITY_REJECTED (HTTP 400) |
| Input Size Limit | 50KB max serialized body | 🟢 | AI_INPUT_TOO_LARGE (HTTP 413) |
| Request Abort | AbortController per-request; aborts on client disconnect | 🟢 | requestController.abort() on req 'aborted' |

### Rate Limiting

| Limiter | Scope | Configuration | Evidence |
|---------|-------|---------------|----------|
| Daily Quota | Per-user (uid_hash) | AI_BASIC_DAILY_LIMIT=10, AI_PREMIUM_DAILY_LIMIT=100 | ai_usage table, DAILY_AI_LIMIT_REACHED |
| Burst Limiter | Per-IP/account | AI_BURST_LIMIT=12, AI_BURST_WINDOW_MS=60000 | aiAccountLimiter |
| Admin Configurable | Via system_settings | Admin can override per-tier limits | Admin AI settings panel |

### Output Security

| Control | Implementation | Status |
|---------|---------------|--------|
| Grounding Validation | Verifies AI output contains source facts, not hallucinated data | 🟢 |
| Control Char Sanitization | extractJson removes unescaped newlines/tabs in JSON strings | 🟢 |
| Provider Error Propagation | Raw provider errors preserved for debugging | 🟢 |
| Response Headers | X-AI-Provider and X-AI-Model identify which model served the request | 🟢 |

---

## 5. PROVIDER CASCADE MECHANISM

### Cascade Logic

```
1. Load provider configuration from MariaDB system_settings
2. Determine provider order (primary, then fallbacks)
3. For each provider:
   a. Construct provider-specific request (OpenAI-compatible API)
   b. Set timeout (configurable timeoutMs)
   c. Send request with AbortController signal
   d. If success → return {raw, provider, model}
   e. If rate limit / error → log error, try next provider
4. If all providers fail → return error with details from all attempts
```

### Provider Configuration Source

| Source | Priority | Persistence | Admin Editable |
|--------|----------|-------------|----------------|
| MariaDB system_settings (category='ai') | 1st (primary) | Persistent | 🟢 Yes |
| Environment Variables (.env) | 2nd (fallback) | File-based | Via deployment |
| Code Defaults | 3rd (last resort) | Hardcoded | No |

---

## 6. GROUNDING ARCHITECTURE

### Grounding Pipeline

```
Source Facts (from user's resume data)
  ↓
Prompt Construction (include source facts as grounding context)
  ↓
LLM Generation (provider cascade)
  ↓
Grounding Validator (verify output references source facts)
  ↓
Connective Token Allowance (allow "and", "with", "for", etc.)
  ↓
Approved or Rejected
```

### Grounding Validator Rules

| Rule | Purpose |
|------|---------|
| Source fact verification | Output must reference user-provided facts |
| Connective token allowance | Common English connectives are not flagged as hallucination |
| Negative constraints | When existingItems provided, AI must not re-suggest them |
| Spelling excellence | AGENTS.md mandates high spelling accuracy in AI output |

---

## 7. QUOTA & USAGE TRACKING

### ai_usage Table Schema

| Column | Type | Purpose |
|--------|------|---------|
| day_key | VARCHAR(10) | Date string (YYYY-MM-DD) |
| uid_hash | VARCHAR(40) | SHA1 hash of user ID |
| uid | VARCHAR(128) | User ID |
| email | VARCHAR(255) | User email for admin visibility |
| count | INT | Number of AI requests today |
| limit_used | INT | Configured limit at time of use |
| last_used_at | TIMESTAMP | Last request timestamp |

### Quota Enforcement

| Tier | Daily Limit | Burst Limit | Burst Window |
|------|------------|-------------|-------------|
| Basic | 10 (AI_BASIC_DAILY_LIMIT) | 12 (AI_BURST_LIMIT) | 60s (AI_BURST_WINDOW_MS) |
| Premium | 100 (AI_PREMIUM_DAILY_LIMIT) | 12 (AI_BURST_LIMIT) | 60s (AI_BURST_WINDOW_MS) |
| Admin Override | Configurable | Configurable | Configurable |

### Concurrency Safety

Row-level locking on `ai_usage` table prevents concurrent requests from bypassing the counter. `UPDATE ai_usage SET count = count + 1` is atomic.

---

## 8. ERROR HANDLING

### Error Codes

| Code | HTTP Status | Trigger |
|------|-------------|---------|
| AUTH_REQUIRED | 401 | Missing or invalid Bearer token |
| CLIENT_AI_KEY_REJECTED | 400 | Client-supplied API key detected |
| CLIENT_AI_IDENTITY_REJECTED | 400 | Client-supplied identity fields detected |
| AI_INPUT_TOO_LARGE | 413 | Input exceeds 50KB |
| DAILY_AI_LIMIT_REACHED | 429 | Daily quota exceeded |
| UNGROUNDED_AI_ENDPOINT_RETIRED | 410 | Calling retired endpoint |
| AI_GENERATION_FAILED | 500 | All providers failed |
| AI_PARSE_FAILED | 500 | Resume parsing failed |

### Client-Side Error Mapping

SummaryStep.jsx and other AI consumers map backend error codes to user-friendly messages displayed in the processing modal.

---

## 9. TESTING COVERAGE

| Test File | Focus | Status |
|-----------|-------|--------|
| ai-runtime.test.js | Core runtime, provider cascade, JSON extraction | 🟢 PASS |
| ai-routes.integration.test.js | Route-level integration tests | 🟢 PASS |
| ai-adversarial-and-stress.test.js | Adversarial inputs, stress scenarios | 🟢 PASS |
| admin-ai-settings.test.mjs | Admin AI settings CRUD | 🟢 PASS |
| ai-quota.test.js | Quota enforcement, daily limits | 🟢 PASS |
| interview-coach.test.mjs | Interview coach generation | 🟢 PASS |
| interview-coach-adversarial.test.mjs | Interview adversarial scenarios | 🟢 PASS |

---

## 10. OBSERVABILITY

| Indicator | Status | Evidence |
|-----------|--------|----------|
| Provider Identification | 🟢 | X-AI-Provider, X-AI-Model response headers |
| Request Tracking | 🟢 | requestId in error responses |
| Usage Metrics | 🟢 | ai_usage table queryable by admin |
| Error Logging | 🟡 | console.error; no structured logging |
| Latency Metrics | ⚫ | No latency tracking or histograms |
| Cost Tracking | ⚫ | No per-request cost estimation |
| Provider Health | ⚫ | No provider availability monitoring |
| Dashboard | 🟡 | Admin AI settings shows config; no usage graphs |

---

## 11. AI INFRASTRUCTURE SCORECARD

| Category | Score | Notes |
|----------|-------|-------|
| Architecture | 8/10 | Clean separation, provider abstraction |
| Security (Input) | 9/10 | Key rejection, identity prevention, size limits |
| Security (Output) | 7/10 | Grounding validation; no output content filtering |
| Provider Management | 9/10 | 6 providers, cascade fallback, admin-configurable |
| Grounding | 8/10 | Source fact enforcement with connective allowance |
| Quota Management | 9/10 | Per-user daily + burst; admin-configurable; row-locked |
| Error Handling | 8/10 | Comprehensive error codes; client-side mapping |
| Observability | 5/10 | Headers + usage table; no metrics/APM |
| Testing | 8/10 | 7 test files covering runtime, routes, adversarial, quota |
| Performance | 6/10 | Cascade adds latency; no warm connections; no caching |
| Scalability | 5/10 | Single instance; no queue for AI requests |
| Cost Optimization | 5/10 | No per-request cost tracking; quotas help but no budget alerts |
| **OVERALL AI INFRASTRUCTURE** | **7.3/10** | |

---

## 12. AI IMPLEMENTATION QUEUE

| Priority | Action | Impact | Effort |
|----------|--------|--------|--------|
| P1 | Implement structured logging for AI requests | HIGH | LOW |
| P1 | Add latency tracking per provider | HIGH | LOW |
| P2 | Add provider health monitoring | MEDIUM | MEDIUM |
| P2 | Implement per-request cost estimation | MEDIUM | MEDIUM |
| P2 | Add AI usage graphs to admin dashboard | MEDIUM | MEDIUM |
| P2 | Implement output content filtering (PII, harmful content) | MEDIUM | HIGH |
| P3 | Add provider connection pooling/warm-up | LOW | MEDIUM |
| P3 | Implement AI request queuing for burst handling | LOW | HIGH |
| P3 | Add A/B testing for provider selection | LOW | HIGH |
| P3 | Add provider SLA monitoring and alerting | LOW | MEDIUM |
