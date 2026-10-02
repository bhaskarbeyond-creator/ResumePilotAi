# Cuba Design System — Component Reference

**Standard:** Cuba Modern Executive Glassmorphism · **Status:** Phase 0 established
**Live showcase (source of truth):** `/dashboard/design-system`
**Guards:** `tests/cuba-design-system.test.mjs`

## Why there is no Storybook

Storybook was deliberately **not** introduced. It would add a large dev
dependency and a second build pipeline. The in-app showcase gives the same
review surface with zero new dependencies and — critically — it renders inside
the application's real router, auth guard, CSP, Tailwind build and theme
context, so what is reviewed is exactly what ships.

## Tailwind v4 reality (read before porting anything)

The repository runs **Tailwind v4** via `@tailwindcss/vite`. Two consequences
that contradict most reference material:

1. The root `tailwind.config.js` is a **Tailwind v3 artifact that Tailwind v4 does
   not auto-load** (there is no `@config` directive in the project). Its
   `theme.extend.colors` is inert today. Importing a v3 config would silently do
   nothing while appearing to configure the design system.
2. A `@theme` block inside a plain CSS file is **emitted literally** and generates
   no utilities. The theme must be reachable from the file that does
   `@import 'tailwindcss'`.

Current, verified architecture:

```
src/tailwind.css
  └─ @import 'tailwindcss'
  └─ @import './styles/cuba-tokens.css'   ← @theme inline lives here

src/styles/cuba-tokens.css
  ├─ :root                       light tokens (single source)
  ├─ :root                       --cuba-dark-* values (declared once)
  ├─ dark application           one selector list, republishes --cuba-dark-*
  └─ @theme inline               tokens → real Tailwind utilities
```

Verified output in the production build:

```css
.text-cuba-ink { color: var(--cuba-ink) }
```

## Token usage rules

| Rule | Reason |
|---|---|
| Never write `bg-[#7366ff]` or any raw hex in JSX | §9 — breaks theming and auditability |
| Use role names (`canvas`, `card`, `line`, `ink`) | Surfaces change per theme; hues do not |
| `--cuba-primary` is for **fills and borders** | 4.14:1 — fails AA for body text |
| `--cuba-primary-ink-strong` is for **text and icons** | 6.9:1 — passes AA |
| Apply glass only to floating chrome | §10 — translucency costs contrast in dense UI |

## Primitive reference

| Component | File | Notes |
|---|---|---|
| `CubaAppShell` | `CubaAppShell.jsx` | App bar + sidebar + content stage. Presentation only; holds no authorization logic. |
| `CubaCard` | `CubaCard.jsx` | Opaque by default; `glass` and `ai` are opt-in. |
| `CubaStatCard` | `CubaStatCard.jsx` | `loading` is explicit — a missing metric never renders as `0`. |
| `CubaBadge` | `CubaBadge.jsx` | Semantic tones only. |
| `CubaButton` | `CubaButton.jsx` | `loading` sets `aria-busy` **and** `disabled`. |
| `CubaPageHeader` | `CubaPageHeader.jsx` | Renders a real `<h1>` by default. |
| `CubaSkeleton` | `CubaSkeleton.jsx` | `role="status"`; shimmer disabled under reduced motion. |
| `CubaEmptyState` | `CubaEmptyState.jsx` | Zero results is a real state, not an error. |
| `CubaErrorState` | `CubaErrorState.jsx` | `role="alert"`; shows the real message. |
| `CubaModal` / `CubaDrawer` | `CubaModal.jsx`, `CubaDrawer.jsx` | Both consume `useDialogA11y` — the contract cannot drift. |
| `CubaInput` / `Select` / `Textarea` | `CubaField.jsx` | `useId` ids, `htmlFor`, `aria-invalid`, `aria-describedby`. |
| `AiEngineStatus` | `AiEngineStatus.jsx` | Real telemetry only. See below. |
| `AiSurface` | `AiSurface.jsx` | Ambient aurora; bounded so it cannot cause overflow. |
| `CubaCommandPalette` | `CubaCommandPalette.jsx` | No built-in commands — the caller supplies real ones. |

## AI status honesty contract

`aiStatus.js` has **no `online` state and no latency field at all**. The public
`/api/service-availability` contract publishes booleans only, so the UI cannot
truthfully display a latency figure and has nowhere to put one.

| Status | Meaning |
|---|---|
| `checking` | A check is in flight |
| `ready` | The platform reported a usable provider configuration |
| `degraded` | Configured but not confirmed operational |
| `unavailable` | Not configured or disabled |
| `unknown` | The check could not complete — **never upgraded to healthy** |

A failed or unreachable check resolves to `unknown`, never to `ready`.

## Modal and drawer contract (§14)

Every overlay provides: `role="dialog"`, `aria-modal`, an accessible name,
Escape to close, a focus trap, focus restoration to the trigger,
reference-counted scroll locking, backdrop dismissal, and portal rendering that
escapes clipping ancestors.

## Rollout and rollback (§49)

`cubaShellFlag.js` stores `legacy` or `cuba` in `localStorage` under
`ime365_cuba_shell_v2`. It defaults to **`legacy`** — the shell that passed the
pre-flight gates — so no user is opted in silently. It is presentation only and
can never grant access to a route, permission, or data; RBAC stays
server-authoritative.

**Rollback is one `localStorage` write — no rebuild, no redeploy.**

## Contributing

1. Use semantic tokens, never raw hex.
2. Route every new overlay through `useDialogA11y`.
3. Add the state to the showcase so it is inspectable.
4. Never render a metric, score, latency or status the platform did not report.
