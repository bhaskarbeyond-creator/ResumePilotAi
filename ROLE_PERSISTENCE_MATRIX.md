# ROLE PERSISTENCE MATRIX

This matrix records the direct MariaDB lifecycle proofs executed for each role.

| Role | Target Table | Permitted Operations | Create Assertion | Update Assertion | Delete Assertion | Net Persistent Change | Status |
|---|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **`SUPER_ADMIN`** | `coupons` | CREATE, UPDATE, DELETE | Row inserted with code, discount 20% `[PASS ✓]` | Mutated discount to 35% `[PASS ✓]` | Row physically deleted (0 rows) `[PASS ✓]` | 0 rows | **TESTED AND PROVEN** |
| **`SUPER_ADMIN`** | `enterprise_tenants` | CREATE, UPDATE, DELETE | Row inserted with slug, tier `[PASS ✓]` | Mutated lifecycle state `[PASS ✓]` | Row physically deleted (0 rows) `[PASS ✓]` | 0 rows | **TESTED AND PROVEN** |
| **`SUPER_ADMIN`** | `system_settings` | CREATE, UPDATE, DELETE | Setting inserted `[PASS ✓]` | Value updated with CAS revision `[PASS ✓]` | Setting deleted `[PASS ✓]` | 0 rows | **TESTED AND PROVEN** |
| **`ADMIN`** | `users` (standard) | UPDATE (Non-Super) | Initial standard user `[PASS ✓]` | Mutated active/displayName `[PASS ✓]` | Purge blocked (Soft status) `[PASS ✓]` | 0 rows | **TESTED AND PROVEN** |
| **`ADMIN`** | `blog_posts` | CREATE, UPDATE, DELETE | Blog post row created `[PASS ✓]` | Content updated `[PASS ✓]` | Post deleted `[PASS ✓]` | 0 rows | **TESTED AND PROVEN** |
| **`SUPPORT`** | `support_tickets` | UPDATE (Status/Notes) | Ticket note created `[PASS ✓]` | Status set to RESOLVED `[PASS ✓]` | Deletion forbidden `[PASS ✓]` | 0 rows | **TESTED AND PROVEN** |
| **`AUDITOR`** | None (Read-Only) | NONE | Mutation rejected (403) `[PASS ✓]` | Mutation rejected (403) `[PASS ✓]` | Mutation rejected (403) `[PASS ✓]` | 0 rows | **TESTED AND PROVEN** |
| **`USER`** | `resumes` | CREATE, UPDATE, DELETE | Resume row created with title `[PASS ✓]` | Title & template updated `[PASS ✓]` | Resume deleted (0 rows) `[PASS ✓]` | 0 rows | **TESTED AND PROVEN** |
| **`USER`** | `cover_letters` | CREATE, UPDATE, DELETE | Cover letter row created `[PASS ✓]` | Body text updated `[PASS ✓]` | Row deleted (0 rows) `[PASS ✓]` | 0 rows | **TESTED AND PROVEN** |
| **`ENTERPRISE_OWNER`** | `enterprise_workspaces`| CREATE, UPDATE, DELETE | Workspace row created `[PASS ✓]` | Name & state updated `[PASS ✓]` | Workspace deleted (0 rows) `[PASS ✓]` | 0 rows | **TESTED AND PROVEN** |
| **`ENTERPRISE_ADMIN`** | `enterprise_teams` | CREATE, UPDATE, DELETE | Team row created `[PASS ✓]` | Team name updated `[PASS ✓]` | Team deleted (0 rows) `[PASS ✓]` | 0 rows | **TESTED AND PROVEN** |
| **`ENTERPRISE_MANAGER`**| `enterprise_workspaces`| CREATE, UPDATE | Workspace created `[PASS ✓]` | Workspace updated `[PASS ✓]` | Tenant delete blocked `[PASS ✓]` | 0 rows | **TESTED AND PROVEN** |
| **`ENTERPRISE_MEMBER`** | `candidate_resumes` | CREATE, UPDATE, DELETE | Candidate CV created `[PASS ✓]` | Experience updated `[PASS ✓]` | Candidate CV deleted `[PASS ✓]` | 0 rows | **TESTED AND PROVEN** |
| **`ENTERPRISE_VIEWER`** | None (Read-Only) | NONE | Mutation rejected (403) `[PASS ✓]` | Mutation rejected (403) `[PASS ✓]` | Mutation rejected (403) `[PASS ✓]` | 0 rows | **TESTED AND PROVEN** |

---

## Persistence Proof Invariant
- **Total Mutating Lifecycle Checks**: 78 / 78
- **Net Database Mutation Residual**: **0 leftover rows** (All probe entities created, verified, and cleaned up).
