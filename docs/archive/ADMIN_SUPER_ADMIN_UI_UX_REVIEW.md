# Admin + Super Admin UI/UX review

**Reference:** the frozen Enterprise console design system (`src/enterprise/enterprise.css` and Enterprise tabs).
**Scope:** `/adm`, `/admin` and `/platform` aliases, Admin settings, platform control plane, user/tenant administration.
**Live visual verdict:** UNVERIFIED here; run the Playwright certification at every required viewport.

## Implemented alignment work

- Added a canonical compatibility redirect from `/admin/*` to `/adm/*`, fixing the Enterprise app switcher dead link.
- Kept the Enterprise information hierarchy: grouped control plane, identity, and consumer product navigation; compact status badges; explicit loading/error/empty states; action confirmation for destructive operations.
- Added server-backed platform configuration census with source, owner, runtime mode, restart requirement, impact, dependencies, changed-by, and last-changed fields.
- Added dedicated Feature Flags and Platform Config discoverability rather than hiding `ENTERPRISE_TENANCY_ENABLED`.
- Replaced ambiguous zero/healthy queue states with `Unavailable` when the collector did not answer.
- Added authoritative tenant detail drawer sections: overview, users, memberships, usage, plan, security, M2M, audit, activity, and configuration.
- Added platform-level tenant rename with a revision-safe backend contract and immediate table/detail refresh.
- Added User Manager status/role filters, verified-email/MFA indicators, audit history, and Super Admin-only role/delete controls.
- Added a consistent write-only secret pattern: configured badge, masked status, blank-preserves explanation, explicit clear, success/error status, and no raw response. Ordinary Admin sessions see status-only controls; credential replacement/provider tests are Super Admin-gated.
- Replaced unimplemented Cloudinary/S3 storage controls with an explicit unavailable state; only the Firebase Storage adapter can be selected in this checkout.
- Added keyboard-accessible labels, `role=status`/`role=alert`, data-test hooks, and bounded responsive tables/drawers.

## Information architecture matrix

| Surface | Primary question answered | Main action placement | Failure/empty behavior |
| --- | --- | --- | --- |
| Command Center | What needs attention now? | Refresh and deep links at header | Evidence-backed recommendation; no trend inference |
| Platform Health | Which dependency is failing and why? | Refresh, filter, API Matrix, service detail | State + reason + remediation; no implicit healthy |
| Tenants | Which organizations exist and what lifecycle state? | Details, suspend/reactivate, provision, rename/decommission | Enterprise disabled and unavailable are distinct |
| Users | Who has access and what security status? | Search, filters, row action menu, edit drawer | Auth directory error is visible; no auto-mutation |
| Audit | Who did what, when, and with what outcome? | Filters and detail dialog | Empty means no records; query errors are retryable |
| Operations | Is the platform configured to operate? | Refresh; Super Admin mutation forms | Infrastructure-only settings are read-only |
| Settings | Which product/integration setting is being changed? | Grouped sidebar and page-local save | Revision conflict, recent auth, and backend failure are explicit |

## Responsive targets

Required verification: `1440x900`, `1280x800`, `1024x768`, `768x1024`, `430x932`, `375x667`.

Design constraints enforced in the live spec:

- no document horizontal overflow;
- mobile rail opens with an explicit button and closes after navigation;
- tables remain scrollable inside their card rather than expanding the page;
- destructive dialogs have a viewport-bounded body and keyboard Escape handling;
- controls have accessible names and visible focus styling;
- no action depends on hover-only affordances;
- long IDs/emails wrap or truncate with a title;
- unavailable metrics render text, not `0`.

## Accessibility checklist

- `aria-label` on navigation status and icon-only controls;
- `aria-live` on success/error messages;
- `role=dialog` plus `aria-modal` and labelled headings on confirmation/drawers;
- button controls instead of clickable non-semantic divs where practical;
- native form labels and `required`/`maxLength` validation;
- focus and reduced-motion styling inherited from Enterprise reference;
- no native `alert()`/`confirm()` in the audited Admin surface.

## Remaining visual risks

1. The repository contains legacy consumer Admin settings components with mixed Tailwind/SCSS styling. Functional parity is implemented, but a local visual pass should still compare typography and spacing against the frozen Enterprise console.
2. Full user/tenant tables depend on live data volume; run the fixture with 200+ rows to validate pagination and performance.
3. Browser-level MFA challenge, recent-auth prompt, and provider test dialogs require live Firebase credentials and cannot be certified from this sandbox.
