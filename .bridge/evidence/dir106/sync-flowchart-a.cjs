'use strict';
// DIR-106: sync the authoritative Flowchart A (and its gap analysis) into AUDIT.md.
const fs = require('fs');
const MD = '.bridge/evidence/dir106/AUDIT.md';
const MMD = '.bridge/evidence/dir106/flowcharts/flowchart-a-entitlement-quota-resolution.mmd';

const FENCE = String.fromCharCode(96).repeat(3);
const source = fs.readFileSync(MMD, 'utf8').replace(/\r\n/g, '\n').trimEnd();

const A_START = '## Flowchart A — AI entitlement & quota resolution';
const A_END = '## Flowchart B — AI provider & API key selection';

const section = [
  A_START,
  '',
  '**AUTHORITATIVE VERSION** (supersedes the first draft). Rendered and syntax-verified.',
  'Source: `flowcharts/flowchart-a-entitlement-quota-resolution.mmd` · Render: `.svg`.',
  '',
  `${FENCE}mermaid`,
  source,
  FENCE,
  '',
  '### Branch rationale',
  '',
  '- **`B` → `E401`** — the global `requireAuth` wall (`index.js:456-472`) is the only',
  '  authenticator. No downstream stage re-authenticates.',
  '- **`E -- Yes / No`** — this single diamond *is* Rule A. An **active, applicable** org',
  '  entitlement wins; anything else falls to individual resolution.',
  '- **`G` → `E429O` has NO edge to `J`** — the deliberate absence of that edge is the',
  '  directive\'s "org quota exhaustion must not fall back to the personal plan". It is the',
  '  single most important property of this diagram.',
  '- **`H` ("Available **or Not Configured**")** — encodes Rule A\'s "enforce both where',
  '  configured": a tenant with no per-user limit is not treated as exhausted.',
  '- **`K -- No --> E403`** — organisation *membership* alone grants nothing; an active',
  '  eligible personal plan is still required (directive §Rule B, "Important distinction").',
  '- **`N` → `O` → `P`** — limits are computed before the atomic reservation, and the',
  '  reservation is a separate, fallible step. This is the reserve→reconcile model that',
  '  replaces today\'s unconditional increment.',
  '- **`T` → `E503`** — a provider-configuration failure **releases** the reservation. This',
  '  is the compensating decrement missing today (P1-3).',
  '- **`V -- Failure or Timeout --> X`** — partial completion reconciles *confirmed* usage and',
  '  releases the remainder, rather than charging the full reservation (scenario 17).',
  '- **`Y` → `Z`** — usage returned to the client is server-calculated, never echoed from the',
  '  client (directive §4, "Never trust client-reported quota values").',
  '- **`LOG`** — every denial code funnels to one safe audit sink. No denial path is silent.',
  '',
  '### Gaps in this diagram (identified, NOT yet fixed)',
  '',
  '| # | Gap | Why it matters | Suggested addition |',
  '|---|---|---|---|',
  '| G1 | **Multi-org / active-tenant selection is implicit** in `C` | P0-2: a user in two orgs has no deterministic tenant. "Applicable" in `E` is undefined. | Insert a diamond after `C`: *"Multiple active memberships?"* → explicit active-tenant rule |',
  '| G2 | **Invalid membership (suspended/expired/disabled) is folded into `E -- No`** | P0-3: correct *outcome*, but not auditable — a reviewer cannot see the check exists | Add `E -- Yes but Invalid --> J` with a `membershipInvalidated` audit event |',
  '| G3 | **No idempotency path on `P -- No --> E429R`** | P1-4: a client retry must not double-charge | Annotate `O` with `correlation_id UNIQUE`; add a bounded retry edge back to `O` |',
  '| G4 | **`E503` conflates policy denial with provider unreachability** | `tenantAi.js:72-77` throws **403** `TENANT_AI_PROVIDER_UNAVAILABLE` when a tenant allowlist denies every provider; 503 means *unreachable* | Split into `403 PROVIDER_POLICY_DENIED` and `503 PROVIDER_UNAVAILABLE` |',
  '| G5 | **The `ADMIN` subgraph edge implies platform config is always the source** | P1-5: tenant credentials are a real second source (Flowchart B) | Label the edge "platform scope only"; `R` owns the final credential decision |',
  '',
  'G1 and G2 are **blocking for P0-2/P0-3**; G3–G5 are P1. All five are recorded in the',
  'Phase-3 gate rather than silently absorbed.',
  '',
].join('\n');

const md = fs.readFileSync(MD, 'utf8');
const i = md.indexOf(A_START);
const j = md.indexOf(A_END);
if (i === -1 || j === -1 || j < i) throw new Error('Flowchart A/B anchors not found in AUDIT.md');

fs.writeFileSync(MD, md.slice(0, i) + section + md.slice(j), 'utf8');
console.log('Flowchart A replaced with the authoritative version + gap analysis.');
