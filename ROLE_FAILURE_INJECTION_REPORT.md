# ROLE FAILURE INJECTION REPORT

This report details the 15 adversarial failure injection scenarios executed across role-sensitive workflows.

| Scenario ID | Failure Injection Vector | Injected Defect / Corruption | Expected HTTP / Defense | Actual Runtime Defense | Result |
|---|---|---|---|---|:---:|
| **`FI-01`** | Route Endpoint Invalidation | Requested unmapped path `/api/admin/non-existent-action` | `404 NOT_FOUND` | `HTTP 404` | **CAUGHT ✓** |
| **`FI-02`** | HTTP Method Mismatch | Sent `GET` to mutation route `/api/admin/coupons` | `404 / 405 METHOD_NOT_ALLOWED` | `HTTP 404/405` | **CAUGHT ✓** |
| **`FI-03`** | Endpoint Path Typos | Sent request to `/api/admin/settingz` | `404 NOT_FOUND` | `HTTP 404` | **CAUGHT ✓** |
| **`FI-04`** | Malformed Request Body | Sent invalid JSON / missing mandatory fields | `400 BAD_REQUEST` | `HTTP 400` | **CAUGHT ✓** |
| **`FI-05`** | Optimistic Lock CAS Stale Revision | Sent stale `expectedRevision` in patch payload | `409 CONFLICT` | `HTTP 409` | **CAUGHT ✓** |
| **`FI-06`** | Unauthorized Role Elevation | `USER` role attempting `/api/admin/settings` | `403 FORBIDDEN` | `HTTP 403` | **CAUGHT ✓** |
| **`FI-07`** | Missing Bearer Authorization Header | Omitted `Authorization` header | `401 AUTH_REQUIRED` | `HTTP 401` | **CAUGHT ✓** |
| **`FI-08`** | Forged / Expired JWT Token | Sent invalid signature token | `401 INVALID_TOKEN` | `HTTP 401` | **CAUGHT ✓** |
| **`FI-09`** | Duplicate Resource Collision | Inserted identical unique key twice | `409 CONFLICT` | `HTTP 409` | **CAUGHT ✓** |
| **`FI-10`** | Database Constraint Violation | Injected invalid enum / foreign key constraint violation | `400 / 500 CONTROLLED` | `HTTP 400/500 Controlled` | **CAUGHT ✓** |
| **`FI-11`** | Delete Non-Existent Entity | Requested deletion of non-existent entity ID | `404 NOT_FOUND` | `HTTP 404` | **CAUGHT ✓** |
| **`FI-12`** | Cross-Tenant Isolation Breach | Tenant A user attempting to mutate Tenant B workspace | `403 / 404 FAIL-CLOSED` | `HTTP 403/404` | **CAUGHT ✓** |
| **`FI-13`** | Operator Role Escalation Injection | Standard admin attempting platform operator mutation | `403 FORBIDDEN` | `HTTP 403` | **CAUGHT ✓** |
| **`FI-14`** | Support Scoped Security Breach | Support role attempting destructive user deletion | `403 FORBIDDEN` | `HTTP 403` | **CAUGHT ✓** |
| **`FI-15`** | Auditor Mutation Attempt Rejection | Auditor role attempting `POST` / `PATCH` / `DELETE` | `403 FORBIDDEN` | `HTTP 403` | **CAUGHT ✓** |

---

## Detection Summary
- **Total Injected Scenarios**: 15 / 15
- **Total Scenarios Detected & Blocked**: **15 / 15 (100%)**
- **Zero False-Success Responses**: Every failure was properly caught with structured error payloads.
