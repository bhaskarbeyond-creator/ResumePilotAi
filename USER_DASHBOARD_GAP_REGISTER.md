# USER Dashboard Gap Register & Remediation Ledger

**Audit Date**: September 2, 2026  
**Auditor**: Principal Software Architect & QA Lead  
**Classification System**:
- **Class A**: Genuine USER defect (Must fix)
- **Class B**: Material USER UX / discoverability gap (Must fix)
- **Class C**: Cosmetic / non-material
- **Class D**: Intentional architecture (Preserve)
- **Class E**: Unrelated functionality (Do not touch)

---

## 1. Identified Gaps & Applied Remediations

### GAP-01: Job Portal Missing from Dashboard Sidebar Navigation
- **Classification**: Class B (Material Discoverability Gap)
- **Evidence**: `ProfileDisplay.jsx` listed Job Tracker, My Applications, Interview Coach, and Messages under `Job Intelligence`, but had no direct link to the live Job Portal (`/jobs/portal`).
- **User Impact**: Candidate users had no direct way to browse active jobs from within the logged-in dashboard.
- **Root Cause**: Sidebar routes were added modularly over time without including the primary search destination.
- **Remediation**: Added `Browse Job Portal` (`/jobs/portal`) link with `FiSearch` icon directly under `Job Intelligence`, and updated route pattern matching to highlight the active state.
- **Status**: ✅ **RESOLVED & CERTIFIED**

---

### GAP-02: Career Command Center Missing Job Search Next-Best-Action CTA
- **Classification**: Class B (User Journey Disconnect)
- **Evidence**: `DashboardHomepage.jsx` displayed the Next Best Action banner when a resume reached Market-Ready status (ATS Score >= 75), offering "Mock Interview" and "Track Applications", but omitted "Explore Jobs".
- **User Impact**: A market-ready candidate who just perfected their resume had no immediate 1-click CTA to search for matching jobs.
- **Root Cause**: Command Center actions lacked direct link to `/jobs/portal`.
- **Remediation**: Added `Explore Jobs` (`/jobs/portal`) primary CTA button right alongside `Mock Interview` and `Track Applications`.
- **Status**: ✅ **RESOLVED & CERTIFIED**

---

### GAP-03: Cross-Domain Mutation Collisions in Admin User Edit (`CROSS_DOMAIN_UPDATE_REJECTED`)
- **Classification**: Class A (Functional Mutation Defect)
- **Evidence**: `backend/routes/adminUsers.js` rejects requests that combine identity fields (`suspended`) and profile fields (`membership`) in a single PATCH.
- **User Impact**: Combined mutations triggered HTTP 400 `CROSS_DOMAIN_UPDATE_REJECTED`.
- **Root Cause**: Missing automated client-side sequencing across domain boundaries.
- **Remediation**: Updated `editUser()` in `src/services/api/platform.js` to automatically sequence multi-domain updates into domain-isolated calls.
- **Status**: ✅ **RESOLVED & CERTIFIED**

---

### GAP-04: SUPER_ADMIN Role Protection Authorization Boundary
- **Classification**: Class A (Authorization Defect)
- **Evidence**: Previous backend check blocked any profile update on `SUPER_ADMIN` accounts, including when the caller was another Super Admin.
- **User Impact**: Super Admins were prevented from updating plan tiers or custom AI quotas on Super Admin accounts.
- **Root Cause**: Missing check for `isSuperAdmin(req.user)` in `backend/routes/adminUsers.js`.
- **Remediation**: Differentiated caller role so `SUPER_ADMIN` callers can update profile/membership while blocking non-super-admins and preventing demotion.
- **Status**: ✅ **RESOLVED & CERTIFIED**

---

### GAP-05: Missing Optimistic Concurrency Control (OCC) Fallback
- **Classification**: Class A (Concurrency Defect)
- **Evidence**: Admin User 360 Plan changes and `editUser()` required `expectedRevision` without a fallback if omitted by legacy callers.
- **User Impact**: Triggered HTTP 400 `PROFILE_REVISION_REQUIRED`.
- **Root Cause**: Strict OCC without defensive resolution to current DB record for administrative callers.
- **Remediation**: Added defensive fallback resolving to authoritative DB revision in `backend/routes/adminUsers.js` and forwarded `expectedRevision` from frontend callers.
- **Status**: ✅ **RESOLVED & CERTIFIED**
