# Candidate responsive test matrix — 2026-10-14

Real Chromium; synthetic notification data and simulated HTTP; actual production component/client/styles. Not the authenticated candidate shell. Counts below are **notification viewport cases**, not whole-workspace coverage. Baseline document-width assertions passed 8/8 but screenshot review exposed internal clipping; after-fix assertions additionally measure message span scrollWidth/clientWidth. No before-score inflation from that weak initial assertion.

| Viewport | Before screenshot | After screenshot | Layout + filter/read workflow | Zoom / touch hardware / full shell |
|---|---|---|---|---|
| 320x568 | `before/notifications-320x568.png` | `after/notifications-320x568.png` | PASS: document and message width, filter, toggle removes unread row | UNVERIFIED |
| 375x812 | `before/notifications-375x812.png` | `after/notifications-375x812.png` | PASS: document and message width, filter, toggle removes unread row | UNVERIFIED |
| 430x932 | `before/notifications-430x932.png` | `after/notifications-430x932.png` | PASS: document and message width, filter, toggle removes unread row | UNVERIFIED |
| 768x1024 | `before/notifications-768x1024.png` | `after/notifications-768x1024.png` | PASS: document and message width, filter, toggle removes unread row | UNVERIFIED |
| 1024x768 | `before/notifications-1024x768.png` | `after/notifications-1024x768.png` | PASS: document and message width, filter, toggle removes unread row | UNVERIFIED |
| 1366x768 | `before/notifications-1366x768.png` | `after/notifications-1366x768.png` | PASS: document and message width, filter, toggle removes unread row | UNVERIFIED |
| 1440x900 | `before/notifications-1440x900.png` | `after/notifications-1440x900.png` | PASS: document and message width, filter, toggle removes unread row | UNVERIFIED |
| 1920x1080 | `before/notifications-1920x1080.png` | `after/notifications-1920x1080.png` | PASS: document and message width, filter, toggle removes unread row | UNVERIFIED |

Paths relative to `artifacts/candidate-audit-20261014/`. 8/8 post-fix cases pass; baseline 320px screenshot shows clipping. Row/filter targets now 44 CSS px; the entire workspace target-size audit is not complete. Title truncation is intentional; full title remains in button accessible label, but a dedicated long-title reading affordance needs usability review.

All other 92 originally numbered entries × eight viewports = **736 unverified page/viewport combinations** in the requested matrix (aliases are retained in this bookkeeping denominator). Their template-lab 1024×1000 captures are supplementary and do not meet the requested eight-viewport matrix. Additional discovered states/routes are not included in 736; their denominator is not finalized. Notification full-shell states and loading/error visuals at every viewport are also not certified.

Accessibility sample: axe WCAG2A/AA + 2.1AA tags, zero violations in one normal notification fixture; keyboard focus/Enter exercised on unread filter. Screen readers, 200%/400% zoom, modal focus, all theme states and performance/Web Vitals remain unverified.

## Support ticket dialog component follow-up

`tests/candidate-support-browser.mjs` ran in a **SIMULATED unauthenticated component harness** using real Chromium. At each of the eight listed viewport sizes, the ticket dialog stayed within the viewport, content retained an internal scroll path, and the document had no horizontal overflow. The same run verified initial focus, forward/reverse Tab wrapping, Escape close, opener-focus restoration, scroll-lock release, and validation-error input retention. The dialog axe WCAG 2.1 A/AA + 2.1AA scan reported zero violations. Screenshots and results are under `artifacts/ui-ux-audit/support/after/`.

This does not verify the authenticated `/dashboard/support` route, the full candidate shell, live ticket API persistence, screen-reader operation, or zoom. Those full-page scenarios remain part of the unverified page/viewport denominator above.

## Dashboard overview

`.bridge/capture_dashboard.mjs` captured the actual shell from XAMPP at 320×568, 375×812, 430×932, 768×1024, 1024×768, 1366×768, 1440×900, and 1920×1080. The executive assistant rail and its text are absent at all eight sizes; no horizontal document overflow or uncaught page errors; axe reports zero violations. At wide desktop sizes, the workspace owns its scroll where needed. APIs are illustrative/mocked and the browser uses a synthetic identity; eight unmatched API calls return 401. This is not an authenticated data assessment. Screenshots and manifest: `artifacts/ui-ux-audit/dashboard-no-assistant/`.

## Resumes hub and builder preview

`tests/resumes-hub-browser.mjs` passes 10/10 scenarios with simulated resume APIs and real Chromium: truthful count, live template thumbnails, paging, search, sorting, ATS/template filters, duplicate/delete outcomes, error/retry, create/edit navigation, empty states, and axe zero violations. The gallery holds one column at 320–430px, two at 768–1024px, and four at 1366–1920px, without horizontal overflow. `tests/resume-preview-journey-browser.mjs` passes 24/24: selected resume preview, no save writes, close-to-gallery, edit-to-heading, optional tailoring, eight viewport checks for both heading and preview, and bounded outer scrolling under both shell variants. These are isolated simulated-data journeys, not authenticated persistence or export validation. Captures/results are under `artifacts/ui-ux-audit/resumes/after/`.
