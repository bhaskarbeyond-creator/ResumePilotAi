# UI_UX_AUDIT

Scope: the **shipped** frontend (`frontend/`, published to the Apache DocumentRoot `dist/`).
Method: static inspection of all 163 modules, the router, the design-token scale, the UI primitive
layer, and every destructive/async interaction path; plus a production typecheck and build.
Browser-driven screenshot comparison was **not possible** in this sandbox (no Playwright browser)
and is recorded as a limitation rather than claimed as done.

## 1. Route and journey inspection status
| Journey | Route(s) | Inspected | Status |
| --- | --- | --- | --- |
| Public landing / features / pricing / contact | `/`, `/features`, `/pricing`, `/contact` | Yes | OK — real pages, no placeholders |
| Auth | `/login` (`/sign-up`, `/front` redirect) | Yes | OK — guarded by `RequireAuth`, redirects verified in `router.tsx` |
| Candidate dashboard | `/dashboard` overview, resumes, settings, messages, favourites, notifications, support | Yes | OK |
| Resume builder | `/dashboard/build-resume` (3,000+ line page) | Yes | **REPAIRED** (DEF-004 photo upload) |
| Cover letters | `/dashboard/cover-letters`, cover-letter builder | Yes | OK — local `confirm` callback idiom verified as not a native dialog |
| ATS score / job tracker / applied jobs | `/dashboard/*` | Yes | **REPAIRED** (`tracker-form-dialog` revision) |
| Interview coach | `/dashboard/interview-coach` | Yes | Backend session guard consolidated |
| AI assistant | `/dashboard/ai-assistant` | Yes | OK |
| Portfolio | builder / gallery / public | Yes | OK |
| Jobs portal & regional hubs | `/jobs*` | Yes | OK |
| Employer portal | `/employer` | Yes | **REPAIRED** (`CompanyProfile` CAS revision) |
| Enterprise console | `/enterprise` | Yes | **REPAIRED** (DEF-002 roles deletion, DEF-001 revision) |
| Admin console | `/admin` | Yes | **REPAIRED** (DEF-002 credential clearing) |
| Export / CV renderer / shared resume | `/export/*`, `/shared/:resumeId` | Yes | BLOCKED for visual check (needs Playwright) |
| 404 | `NotFoundPage` | Yes | OK — real component, not a stub |

`pages/placeholder.tsx` exists but is used **only** for `NotFoundPage`; no live feature route renders
a "coming soon" stub. Verified by tracing every lazy import in `router.tsx`.

## 2. Defects corrected (functional UX)
| Defect | Before | After |
| --- | --- | --- |
| Blocking native dialogs | `window.confirm()` gated destructive role deletion and credential clearing; `window.alert()` reported failures. No busy state → double-submit possible | `ConfirmDialog` (Radix): focus-trapped, `Esc`-dismissible, branded, with `loading`/`aria-busy` on the action so it cannot be double-submitted while the request is in flight |
| Dead-feeling file control | After rejecting an oversize photo the `<input type=file>` kept its value, so selecting the same file again produced **no event at all** — the control looked broken | Input value reset immediately; the control always responds |
| Silent failure | `FileReader.onerror` unhandled → a corrupt image failed with no feedback while the UI implied success | Explicit error toast with recovery guidance |
| Missing feedback primitive | `@radix-ui/react-toast` declared but unimplemented | Full toast system: 4 semantic tones mapped to existing tokens, icon per tone, dismiss control with `aria-label`, auto-dismiss durations (errors longer than successes), swipe-to-dismiss, viewport labelled "Notifications" |
| Permanent spurious 409 | CAS writes could fail forever with "changed after the dashboard loaded. Refresh…" and refresh never helped | Client and server now share one revision floor, so the message only appears on a genuine concurrent edit |
| Inconsistent error surfaces | Same flow used both an inline banner and a native alert | Inline surface kept for persistent context, toast added for transient notice — one convention |

## 3. Visual design quality
- **Tokens:** verified the semantic scale in `frontend/src/index.css` (`brand`, `error`, `success`, `warning`, `info`, `ink`, `ink-muted`, `surface`, `surface-border`) and used **only** those tokens in new components — no hard-coded hex values introduced.
- **Consistency:** new primitives follow the established `cn()` + Radix + `data-[state=]` animation convention already used by `dialog.tsx`, so motion, overlay (`bg-black/60 backdrop-blur-sm`), corner radius and z-index layering match the existing system.
- **Button hierarchy:** `ConfirmDialog` reuses the existing `Button` with its real variants (`destructive`, `primary`, `outline`) and its built-in `loading` spinner. No parallel button styling was invented. (An initial `variant="default"` was a type error — caught by `tsc -b`, corrected to `primary`.)
- **No decorative effects** added that could reduce clarity or cost runtime.

## 4. Responsive behaviour
- Toast viewport: `fixed inset-x-0 bottom-0 p-4` full-width on mobile, `sm:inset-x-auto sm:right-0 sm:max-w-sm` on tablet/desktop, with `max-h-[100dvh]` so a stack can never overflow the visual viewport on mobile browsers.
- `ConfirmDialog`: `w-[calc(100%-2rem)] max-w-md` centered — no clipping at 320 px.
- Full multi-viewport browser verification remains **BLOCKED** (no Playwright browser in this sandbox).

## 5. Accessibility
| Criterion | Implementation |
| --- | --- |
| Live region / announcements | Radix `ToastProvider` supplies the `aria-live` region; viewport carries `aria-label="Notifications"` |
| Screen-reader semantics | `ToastPrimitive.Title` / `.Description` (not bare `div`s); icons `aria-hidden="true"`; dismiss button labelled "Dismiss notification" |
| Focus management | Radix `AlertDialog` traps focus, restores it on close, supports `Esc` |
| Keyboard operation | All new controls are real `<button>` elements; no click-only `div`s |
| Busy state exposure | `aria-busy` via the shared `Button` (`loading`), plus `disabled` to prevent re-entry |
| Confirmation labelling | Dialog `title` + `description` state the consequence ("Members assigned to … fall back to the default tenant role. This cannot be undone.") |
| Colour contrast | Only existing token pairs used (`*-50` background with `*-800` text), the same combinations the repo's own `dir023-contrast-tokens` gate already enforces |
| Native-dialog removal | Eliminates the unstyled, unbranded, focus-hostile OS dialogs |

WCAG 2.2 AA is **targeted, not claimed**: automated axe-core/Playwright checks could not run here.

## 6. Visual regression risk
Low and bounded: changes are additive (2 new primitive files, 1 new lib file) plus 6 modified
components. No existing component's public props changed, no shared class was edited, and no token
was redefined — so no restyling can propagate to untouched routes. `tsc -b` and `vite build` both
pass, and 340 assets publish successfully. A browser visual diff is still recommended before release
(`npm run audit:visual`, `npm run test:templates:browser`).

## 7. Limitations
- No screenshot/before-after evidence: **BLOCKED** (Playwright browsers absent).
- Interaction verification is static + typecheck/build based, not click-through.
- Legacy root `src/` UI was intentionally not restyled (it is not the shipped tree).
