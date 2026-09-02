# USER Dashboard — Controlled Failure Injection & Degraded State Report

**Audit Objective:** Inject controlled local faults (network timeouts, expired credentials, invalid payloads, malformed entities, database outages) to prove the USER dashboard fails gracefully without crash screens, blank pages, or data corruption.

---

## 1. Failure Injection Matrix

| Injected Fault Scenario | Injection Mechanism | System Layer Affected | Expected Graceful Behavior | Observed Runtime Outcome | Recovery Mechanism | Safety Verdict |
|---|---|---|---|---|---|---|
| **Expired Firebase Auth Token (HTTP 401)** | Simulate expired JWT on `/api/support/tickets` | API Interceptor (`main.jsx:81`) | Single-flight token refresh attempted automatically | Refreshes token and retries request cleanly | Automatic re-authentication | **SAFE** |
| **Malformed ID Token / Unauthenticated** | Request with missing Bearer header | Backend Guard (`requireAuth`) | Rejects with `401 AUTH_REQUIRED` | Returns structured JSON error; UI redirects to `/login` | Redirect to login with `next` | **SAFE** |
| **Short Support Ticket Subject (< 4 chars)** | Submit form with subject `"Hi"` | Validation in `DashboardSupport.jsx` + API | Frontend warning + API rejects with `400 INVALID_TICKET_SUBJECT` | Error alert displayed, no DB write | Candidate corrects input | **SAFE** |
| **Short Support Ticket Body (< 8 chars)** | Submit form with body `"Test"` | Validation in `DashboardSupport.jsx` + API | Frontend warning + API rejects with `400 INVALID_TICKET_BODY` | Error alert displayed, no DB write | Candidate corrects input | **SAFE** |
| **Invalid Ticket Priority** | POST with `{ priority: 'SUPER_URGENT' }` | API (`services/supportTickets.js`) | Rejects with `400 INVALID_TICKET_PRIORITY` | Structured error JSON | Reset to valid enum | **SAFE** |
| **Non-Existent / Other User Ticket ID** | GET `/api/support/tickets/fake-uuid-999` | API (`services/supportTickets.js`) | Rejects with `404 TICKET_NOT_FOUND` | Displays "Ticket not found" alert; no crash | Return to ticket queue | **SAFE** |
| **Reply to Closed Ticket** | POST to ticket with `status = 'CLOSED'` | API (`services/supportTickets.js`) | Rejects with `409 TICKET_CLOSED` | UI disables input and displays closed notice | Create new ticket | **SAFE** |
| **Stale Profile Concurrent Edit (Revision Mismatch)** | Concurrent write with old revision | `user_profiles` revision lock | Returns `409 CONFLICT` with latest remote data | Displays Conflict Resolution modal | Candidate chooses merge/overwrite | **SAFE** |
| **Database Connection Failure** | Simulated MariaDB socket failure | Backend Connection Pool | Fails closed with `503 SERVICE_UNAVAILABLE` | Displays "Service temporarily unavailable" banner | Retry on reconnect | **SAFE** |
| **Oversized JSON Body (> Body Limit)** | Send 20MB payload to API | Express body parser | Rejects with `413 Payload Too Large` | Rejection before route execution; no memory leak | Shorten payload | **SAFE** |

---

## 2. Integrity Proofs
- **Zero White Screens:** In 100% of tested failure modes, `<RouteErrorBoundary />` and localized component error states caught exceptions and presented user-actionable retry paths.
- **Zero Plaintext Credential Exposure:** Server stack traces and database connection strings are never disclosed in client HTTP payloads.
