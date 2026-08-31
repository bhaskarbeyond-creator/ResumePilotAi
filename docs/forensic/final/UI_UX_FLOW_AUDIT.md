# UI/UX Flow Audit

## Candidate Flow
| Stage | Component | Status |
|-------|-----------|--------|
| Landing | Welcome (components/welcome) | ✅ Hero, features, pricing links, language switcher, trusted-by |
| Registration | Welcome (sign-up tab) → /login redirect | ✅ Email/password + social (Google, LinkedIn, GitHub where configured) |
| Login | Welcome (login tab) | ✅ Shows errors (auth/user-not-found, wrong-password, etc.) via authErrorMessages.js |
| Onboarding | PostLoginRedirect → /dashboard | ✅ |
| Profile | Dashboard settings tab → profileData persistence | ✅ Profile persistence via profilePersistence.js |
| Resume create | /build-resume/heading → BuildResume wizard | ✅ Multi-step flow: heading → action-filling (personal, summary, experience, education, skills, languages) → template select → preview |
| Resume edit | Resume list → BuildResume (existing data) | ✅ Loads via resumePersistence.js |
| Resume preview | Template render (51 CV templates, 4 cover templates) | ✅ All templates have exportable CvN.jsx; exportable CvNExport.jsx where needed |
| Resume export | /export/:template/:id/:lang → PDF (Playwright) or DOCX (docx library) | ✅ Render token flow prevents XSS and SSRF; loading states; error states |
| AI features | Smart resume composer + AI buttons in editor | ✅ Content operations grounded; grammar check; cover letter; interview; ATS score |
| Settings | Dashboard settings | ✅ Profile, language, theme, subscription, account deletion, data export |
| Subscription | /billing/plans | ✅ Plans, providers dynamically shown based on service-availability; currency/tax shown |
| Payments | Stripe Elements / PayPal / Razorpay / Paytm / PhonePe integrations | ✅ Checkout flow shows loading, success, failure states; client_secret handled safely |
| Errors | Global error boundary + per-component error states | ✅ Toasts component; API errors mapped to user messages |
| Logout | signOut() clears auth + localStorage | ✅ |

## Admin Flow
| Stage | Status |
|-------|--------|
| Login with MFA | ✅ TOTP enrollment and verification via mfaService.js |
| Dashboard overview | ✅ Stats cards, recent activity, health indicators |
| Navigation (sidebar) | ✅ Role-aware items; mobile responsive |
| User management | ✅ UsersManager: list, search, view, edit, delete, set roles |
| Candidate/Resume visibility | ✅ Via user profile view |
| Employer management | ✅ CompanyManagement: approve/reject/feature; EmployerApplications review |
| Enterprise management | ✅ PlatformTenants: create tenant, view, add/remove members, change roles, configure commercials and AI policy |
| Payments/subscriptions | ✅ Payments read + refunds (SuperAdmin); payment settings config |
| System settings | ✅ Website meta, currency, email, social auth, analytics, AI providers |
| AI/provider settings | ✅ adminAiSettings.js – add/remove providers, models, temperature, fallbacks; test-provider endpoint with rate limiting |
| Audit logs | ✅ AdminAuditLogs – paginated, filterable; audit log entries created for all admin mutations via createAdminAuditMiddleware |
| Security | ✅ PlatformSecurity – MFA status, Firebase SA config, security audit logs |
| Exports | ✅ Admin can export user data via admin delete/export flows |
| Support tickets | ✅ HelpDesk with ticket CRUD, assignment, status |
| Error states | ✅ Each admin component handles loading (Spinner), empty (EmptyState patterns), error (toasts + inline messages) |

## Enterprise Flow
| Stage | Status |
|-------|--------|
| Login via Firebase with enterprise membership | ✅ |
| Enterprise dashboard overview | ✅ Usage, members, recent activity |
| Members | ✅ Invite, remove, change role |
| Roles | ✅ Custom role definition |
| Candidates / Resumes | ✅ EnterpriseResumesTab (tenant-scoped) |
| Jobs (enterprise) | N/A – jobs are in employer portal |
| Reports / Usage | ✅ EnterpriseUsageTab – AI usage, member activity |
| Exports | ✅ Per-tab CSV/JSON exports where applicable |
| Settings | ✅ EnterpriseSettingsTab – general, security, AI policy |
| Permissions | ✅ Tab visibility gated by ENTERPRISE_ADMIN roles; backend enforces RBAC |
| Billing | ✅ Tenant commercials view |

## Employer Flow
| Stage | Status |
|-------|--------|
| Employer application submission | ✅ /api/employer-applications → admin review |
| Login (post-approval) | ✅ Employer claim set; dashboard shows employer navigation |
| Dashboard | ✅ Employer nav in dashboard shell |
| Candidates (list/applications) | ✅ Applications list with status filters |
| Jobs (CRUD) | ✅ Jobs list + create/edit/delete/pause/activate |
| Search | ✅ Jobs portal public search + employer-side applications list |
| Candidate actions (message/approve/reject) | ✅ Status update with notification; in-app messaging |
| Exports | ✅ Application export (where enabled) |
| Account/settings | ✅ Same as user |

## UX Elements Verified
- Loading states: Spinner component used across async flows.
- Empty states: Present in admin lists, jobs lists, conversations, notifications.
- Error states: Toasts + inline error messages + dedicated error boundaries.
- Unauthorized states: Frontend redirect + backend 401/403.
- Expired session: Firebase onAuthStateChanged triggers sign-out; clearAccountScopedBrowserState() cleans local storage.
- Responsive: Sidebar collapsible on mobile (Admin); grid layouts use Tailwind responsive classes.
- Mobile: Viewport meta tags; forms responsive via grid-2-col.
- Permission-aware navigation: Admin sidebar items conditionally rendered; EnterpriseConsole tabs conditionally rendered based on membership role.
- No dead buttons with no handlers observed during code inspection. Form submit handlers are wired to API calls in all major forms.
- API mismatch: All axios/fetch calls attach Bearer token; response schemas validated by existence checks before rendering.
- Toast/error consistency: Toats component used globally; error codes mapped by authErrorMessages and per-component handlers.
- Duplicate actions: Idempotency-Key header on payment create; webhook event claims; CAS revision checks on all updates prevent duplicate submissions.
- Race conditions: Optimistic concurrency via expectedRevision; outbox lease mechanism; AbortController on AI requests prevents stale responses from overwriting newer ones.
- Stale UI state: componentDidUpdate / useEffect dependencies refresh state when props change; explicit revision checks trigger reload.
- Terminology: Consistent "Resume", "Cover Letter", "Portfolio", "Template", "Billing/Subscription" language across i18n files (en primary).
- Accessibility: Buttons have aria-labels where icon-only; form inputs have associated titles/labels; focus management via RouteFocus.
