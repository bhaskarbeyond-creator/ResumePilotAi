# Missing pages and workflows — 2026-10-14

No new page is justified merely by a missing test. Discovery is incomplete; this register distinguishes implementation evidence from recommended capability. See route census for all current mounts.

| Journey / finding | Classification | Evidence / impact | Priority / next verification |
|---|---|---|---|
| Notification update recovery and duplicate protection | Confirmed implementation gap, fixed | Browser failures CAND-001–005; interrupted/overlapping writes and clipped text | P2; independent review + real DB journey pending |
| Login, signup, reset, email verification, OAuth | Existing capability, unverified integration | main.jsx, conf/fire.js, auth routes; query/fragment entry flows absent from old page list | P1; test intended return URL, expired link and replay with isolated identities |
| Profile sub-sections and security/TOTP | Existing tabs, not missing pages | DashboardSettings normalizes tab/subtab/section/step; Security selects Account and scrolls to TOTP | P1; direct navigation, focus, invalid tab fallback, reauth failure |
| Resume import, profile sync and recovery | Existing modal/service capability | ResumeImportModal, SyncProfileModal, resumeParser, resumePersistence | P1; no reason to add another route; test signature/size/cancel/save/refresh |
| User-visible resume version history | Recommended enhancement, NOT confirmed requirement | Optimistic revisions/recovery exist; product-level version-history contract not established | P2; agree history/retention model before UI |
| Public publication and revocation | Existing capability, missing end-to-end proof | public_resumes explicit publication; portfolios public projection | P1; two identities + unauthenticated view + revoke/cache verification |
| ATS recommendations | Existing capability | deterministic atsScore + optional JD; AI assists are separate | P1; save/update/re-score integration, do not equate local score with ATS vendor guarantee |
| Job search, saved jobs, apply and follow-up | Existing routes/data domains; integration unverified | MainJobListings, favorites, AppliedJobs, JobTracker | P1; distinguish real submitted application from personal tracker card |
| CBT/live interview recovery/results | Existing dual workflow | DashboardInterviews and liveInterviewApi; local vs server persistence differ | P1; refresh/expiry/idempotent completion and feedback grounding |
| Notifications and messaging | Existing gated capability | notification page/bell; MessagesModuleGate | P1/P2; disabled messaging is not a missing page; test backend enforcement and enabled state |
| Billing, quotas and callbacks | Existing provider flows | 5 provider families + webhook/status callbacks; AI quota ownership gap | P1; pending payment reconciliation/duplicate charge/admission failure |
| Account export/deletion | Existing settings/backend capability | /api/account/export and /delete | P1; deletion retention, orphaned files, identity failures; not exercised destructively |
| Accessible support ticket dialog | Suspected implementation gap, browser reproduction pending | Create-ticket overlay JSX lacks explicit role/dialog semantics; needs keyboard/focus trace | P2; use existing shared dialog pattern if confirmed, not a new page |
| Verified support privacy/export claims | Confirmed evidence gap | DashboardSupport hardcoded zero-retention/zero-drift promises exceed evidence | P1/P2; legal/product/provider contract review and qualified copy |
| Unified recoverable error navigation | Recommended enhancement | Existing CubaErrorState and route boundaries; coverage inconsistent/unmeasured | P2; inventory each form before introducing shared helper |
| Background job status UI | Future capability, not automatically required | Durable outbox and reconciler exist; delivery is not same as transaction success | P3; only expose status where user action/recovery is meaningful |
| Separate pages for every wizard step/modal | Not applicable | 13 builder mounts and modal workflows already exist | Preserve information architecture; no speculative new routes |

**Confirmed missing requirement:** none established beyond the directive's verification/documentation requirements. Product features cannot be declared required solely because the audit lists a category. Screens, tabs and missing backend semantics must not be conflated.
