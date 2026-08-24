# ResumePilot AI — Edge Case & Resilience Matrix

> **Authoritative Edge Case & Failure Mode Matrix**  
> **Source Commit:** `8c7905f`  
> **Classification:** AUTHORITATIVE SOURCE OF TRUTH

---

## 1. Edge Case Test Categories & Behavioral Guarantees

| Failure Mode / Edge Case | Test Input / Condition | System Behavior | HTTP Status / UI Outcome | Verdict |
|--------------------------|------------------------|-----------------|--------------------------|:-------:|
| **Empty Payload** | `POST /api/generate-summary {}` | Input validator catches missing fields | `HTTP 400 INVALID_INPUT` | ✅ PASS |
| **Malformed JSON** | Syntactically invalid JSON body | Express JSON parser returns bad request error | `HTTP 400 BAD_REQUEST` | ✅ PASS |
| **Oversized Body** | Payload exceeding 256 KB | Body parser limit blocks request | `HTTP 413 PAYLOAD_TOO_LARGE` | ✅ PASS |
| **Prompt Injection Attack**| Malicious instruction override in resume field | AI Runtime prompts use strict negative constraint guards | Sanitized response / No system leak | ✅ PASS |
| **Raw Control Characters in LLM Output** | LLM generates unescaped `\n` inside JSON string | `extractJson` sanitizes control characters before parsing | Clean JSON parsed without SyntaxError | ✅ PASS |
| **Retired / Deprecated AI Model** | NVIDIA NIM returns HTTP 400 DEPRECATED | Runtime switches to active backup candidate (Gemini/Groq) | Seamless failover response | ✅ PASS |
| **Primary AI Rate Limit**| Primary provider returns HTTP 429 | Instant cascade to secondary fallback provider | Response completed without error | ✅ PASS |
| **Unauthenticated Request to Private API** | Missing `Authorization: Bearer` header | Auth middleware rejects immediately | `HTTP 401 AUTH_REQUIRED` | ✅ PASS |
| **Insufficient Privileges** | Regular user token calling Super Admin route | RBAC policy enforcer halts execution | `HTTP 403 FORBIDDEN` | ✅ PASS |
| **Super Admin without Second Factor** | Super Admin token without TOTP claim | MFA gate halts execution | `HTTP 403 SUPER_ADMIN_MFA_REQUIRED` | ✅ PASS |
| **Stale Auth Session** | `auth_time` older than 10 minutes | Session freshness gate triggers | `HTTP 403 RECENT_AUTH_REQUIRED` | ✅ PASS |
| **Concurrent CMS Page Modification** | Outdated `expectedRevision` submitted | Firestore transaction aborts on revision mismatch | `HTTP 409 CMS_PAGE_CONFLICT` | ✅ PASS |
| **Coupon Double-Redemption** | Rapid concurrent redemption requests | Atomic Firestore reservation transaction | Second request returns `COUPON_ALREADY_REDEEMED` | ✅ PASS |
| **Missing Firestore Composite Index** | Multi-field query on unindexed collection | Client queries fallback to unindexed `.where()` + in-memory sort | UI renders gracefully without crash | ✅ PASS |
| **Upstream Firestore Quota Exhaustion**| Firestore returns `8 RESOURCE_EXHAUSTED` | Endpoints return normalized 429 with `{ items: [] }` | Clean empty state; zero unhandled errors | ✅ PASS |
| **Invalid Render Token in PDF Export**| Random or expired export token query | Token consumer rejects expired/unknown tokens | `HTTP 403 EXPORT_TOKEN_INVALID` | ✅ PASS |
| **Horizontal Viewport Constriction** | Window resized to 375px (iPhone SE) | Fluid Tailwind flex/grid layout with responsive media queries | Zero horizontal scroll bar | ✅ PASS |
