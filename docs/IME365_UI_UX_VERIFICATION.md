# IME365 UI/UX Verification

## Layout & shell

| Portal | Shell | Notes |
|---|---|---|
| Candidate | `DashboardMain` + `ProfileDisplay` | Existing chrome, taxonomy corrected |
| Employer | `EmployerPortal` (new) | Header, collapsible sidebar, content area, mobile drawer, skip link, toast root |
| Organization | `EnterpriseConsole` | Unchanged |
| Admin | `Admin` | Unchanged, re-namespaced |

The employer shell uses its own flex layout (`EmployerPortal.scss`) rather than
reusing `.dashboardContentWrapper`, because the admin sidebar injects global
`padding-left` rules for that class which would otherwise bleed into the
recruiter portal and cause horizontal overflow.

## Responsive behaviour

| Viewport | Employer portal |
|---|---|
| ≥1024px | Fixed sidebar (240px expanded / 64px collapsed) + fluid content column |
| <1024px | Sidebar becomes an overlay drawer; sticky mobile header with hamburger |
| ≤639px | Reduced content padding; tables scroll horizontally inside their own container |

- Drawer opens with the hamburger, closes via backdrop, close button, or
  **Escape**.
- `aria-expanded` reflects drawer state; the drawer is `aria-hidden` when closed.
- The applicant table uses `overflow-x: auto` with a `min-width`, so wide data
  scrolls inside the card rather than pushing the page sideways.
- No portal introduces document-level horizontal overflow.

## Accessibility

| Check | Result |
|---|---|
| Skip link to content | Present on the employer shell (`#employer-content`) |
| Landmarks | `nav[aria-label]` on every portal sidebar; `main` on the employer shell |
| Active state | `aria-current="page"` on the active navigation item |
| Icon-only controls | Labelled (`aria-label` on the hamburger, drawer close, sidebar toggle) |
| Modals | `role="dialog"`, `aria-modal="true"`, `aria-labelledby` → visible heading |
| Escape-to-close | Context switcher, employer drawer, `AddCompanyModal` |
| Focus restoration | Trigger refocused on Escape (switcher); previously focused element restored on modal close |
| Keyboard operation | Switcher and drawer fully operable by keyboard; forms unchanged |
| Contrast | Slate/indigo token pairs already in the design system; no new colour pairs introduced |

### Accessibility defects found and fixed

1. **`AddCompanyModal` had no dialog semantics** — no `role="dialog"`, no
   `aria-modal`, no accessible name, and no Escape handling. Because this modal
   is the required onboarding CTA, it was fixed: dialog semantics added, the
   visible `h2` given the id referenced by `aria-labelledby`, the icon-only close
   button labelled, and Escape-to-close plus focus restoration implemented.

## Modals, toasts, popovers

| Surface | Open | Render | Escape | Focus restore |
|---|---|---|---|---|
| `AddCompanyModal` (onboarding CTA) | ✅ verified in E2E | ✅ inside viewport | ✅ added | ✅ added |
| Context switcher menu | ✅ | ✅ | ✅ verified | ✅ verified |
| Employer mobile drawer | ✅ | ✅ | ✅ | n/a |
| `DashboardToast` (employer root) | ✅ | ✅ | n/a | n/a |

### Toast system

`EmployerPortal` owns toast state in the exact shape required:

```js
{ isShowed: false, type: '', title: '', text: '' }
```

and exposes `showToast(type, title, text)` as a `useCallback`. All six employer
child routes receive `showToast={showToast}`; a static assertion requires every
route element to carry it, so a child can never call an undefined function.
`DashboardToast` renders at the portal root. Auto-dismiss after 5 s via a
cleaned-up effect.

## States

| State | Where |
|---|---|
| Loading | `EmployerLoading` (spinner, `role="status"`, polite live region) |
| Empty — new recruiter | `EmployerOnboarding` ("Welcome to IME365 Hiring" + CTAs) |
| Empty — no requisitions | Applicant pipeline directs the user to post a role |
| Empty — no search match | Distinct copy from the first-run empty state |
| Error | `EmployerErrorState` with the real API message and a working Retry |
| Unauthorised tenant / invalid slug | Server response surfaced through the enterprise shell's existing state handling |

## No fabricated data

Every employer metric, company, job, and applicant originates from
`/api/employer/*` and `/api/jobs/:id/applications` via the existing platform API
client. `useEmployerWorkspace` normalises records but never synthesises them: a
zero-record read resolves to the onboarding state, and a failed read resolves to
the error state. The browser E2E proves this by seeding real records and
asserting the seeded role title appears on the overview.
