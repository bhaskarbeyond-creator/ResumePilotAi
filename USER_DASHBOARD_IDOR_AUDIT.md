# USER Dashboard — Insecure Direct Object Reference (IDOR) & Ownership Audit

**Audit Objective:** Adversarially prove that User B cannot read, mutate, overwrite, or delete any resource created by User A.  
**Test Setup:** Simulated distinct authenticated identities `USER_A` (`uid: user-alice-111`) and `USER_B` (`uid: user-bob-222`).

---

## 1. Adversarial IDOR Attack Matrix

| Target Resource | Resource ID Created by User A | Adversarial Action by User B | API Call Attempted by User B | Expected Response | Observed Response | MariaDB Mutation? | Isolation Status |
|---|---|---|---|---|---|---|---|
| **Support Ticket** | `tick-alice-777` | Attempt to read ticket detail | `GET /api/support/tickets/tick-alice-777` | `HTTP 404 Not Found` | `404 Not Found` | 0 rows read | **SECURE (ISOLATED)** |
| **Support Ticket Message** | `tick-alice-777` | Attempt to post unauthorized reply | `POST /api/support/tickets/tick-alice-777/messages` | `HTTP 404 Not Found` | `404 Not Found` | 0 rows inserted | **SECURE (ISOLATED)** |
| **Resume Draft** | `res-alice-001` | Attempt to read private resume | `GET /api/resumes/res-alice-001` | `HTTP 404 / 403` | `404 Not Found` | 0 rows read | **SECURE (ISOLATED)** |
| **Resume Draft** | `res-alice-001` | Attempt to overwrite resume content | `PUT /api/resumes/res-alice-001` | `HTTP 404 / 403` | `404 Not Found` | 0 rows modified | **SECURE (ISOLATED)** |
| **Resume Draft** | `res-alice-001` | Attempt to delete resume | `DELETE /api/resumes/res-alice-001` | `HTTP 404 / 403` | `404 Not Found` | 0 rows deleted | **SECURE (ISOLATED)** |
| **Cover Letter** | `cov-alice-999` | Attempt to read cover letter | `GET /api/covers/cov-alice-999` | `HTTP 404 / 403` | `404 Not Found` | 0 rows read | **SECURE (ISOLATED)** |
| **Cover Letter** | `cov-alice-999` | Attempt to delete cover letter | `DELETE /api/covers/cov-alice-999` | `HTTP 404 / 403` | `404 Not Found` | 0 rows deleted | **SECURE (ISOLATED)** |
| **Portfolio Builder** | `port-alice-555` | Attempt to edit portfolio | `PUT /api/portfolios/port-alice-555` | `HTTP 404 / 403` | `404 Not Found` | 0 rows modified | **SECURE (ISOLATED)** |
| **Portfolio Builder** | `port-alice-555` | Attempt to delete portfolio | `DELETE /api/portfolios/port-alice-555` | `HTTP 404 / 403` | `404 Not Found` | 0 rows deleted | **SECURE (ISOLATED)** |
| **Job Application** | `app-alice-333` | Attempt to view application details | `GET /api/jobs-data/applications/app-alice-333` | `HTTP 404 / 403` | `404 Not Found` | 0 rows read | **SECURE (ISOLATED)** |
| **Job Tracker Card** | `track-alice-123` | Attempt to move card stage | `PUT /api/jobs-data/tracker/track-alice-123` | `HTTP 404 / 403` | `404 Not Found` | 0 rows modified | **SECURE (ISOLATED)** |
| **User Profile Data** | `user-alice-111` | Attempt to read Alice's profile | `GET /api/users/profile?uid=user-alice-111` | Ignores query param; returns User B's profile | Returns Bob's profile | 0 leak of Alice's data | **SECURE (ISOLATED)** |
| **TOTP 2FA Secret** | `user-alice-111` | Attempt to read Alice's TOTP status | `GET /api/users/totp/status` | Scoped to Bearer token UID | Returns Bob's TOTP status | 0 leak | **SECURE (ISOLATED)** |

---

## 2. Server-Side Non-Disclosure & Security Defense Architecture
- **Resource Non-Disclosure Principle:** When a user attempts to access a non-existent resource OR a resource owned by someone else, the system responds with `HTTP 404 Not Found` rather than `HTTP 403 Forbidden`. This prevents attackers from enumerating valid resource IDs across the platform.
- **SQL Ownership Fencing:** Queries explicitly parameterize `WHERE id = ? AND user_id = ?`, guaranteeing the database engine rejects out-of-scope mutations.
