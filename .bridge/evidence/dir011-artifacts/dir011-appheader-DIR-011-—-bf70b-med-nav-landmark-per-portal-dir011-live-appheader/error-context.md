# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dir011-appheader.spec.js >> DIR-011 — universal Google M3 AppHeader & command surface >> stage 1: exactly one header and one uniquely-named nav landmark per portal
- Location: tests\e2e\dir011-appheader.spec.js:289:5

# Error details

```
Error: stage 1 must not log console errors

expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 3

- Array []
+ Array [
+   "You are calling ReactDOMClient.createRoot() on a container that has already been passed to createRoot() before. Instead, call root.render() on the existing root instead if you want to update it.",
+ ]
```

# Page snapshot

```yaml
- generic [ref=f4e1]:
  - link "Skip to main content" [ref=f4e2] [cursor=pointer]:
    - /url: "#main-content"
  - main [active] [ref=f4e4]:
    - generic [ref=f4e5]:
      - link "Skip to main content" [ref=f4e6] [cursor=pointer]:
        - /url: "#cuba-main-content"
      - generic [ref=f4e7]:
        - button "Collapse sidebar" [ref=f4e8] [cursor=pointer]
        - navigation "Breadcrumb" [ref=f4e12]:
          - list [ref=f4e13]:
            - listitem [ref=f4e14]:
              - generic [ref=f4e15]: Platform Admin
            - listitem [ref=f4e17]:
              - generic [ref=f4e18]: Command Center
        - button "Search or run a command" [ref=f4e23] [cursor=pointer]:
          - generic [ref=f4e28]:
            - generic [ref=f4e29]: "Keyboard shortcut:"
            - text: Ctrl K
        - generic [ref=f4e30]:
          - generic "The availability check could not be completed, so no claim is made." [ref=f4e31]:
            - generic [ref=f4e33]: ✦
            - generic [ref=f4e34]: AI Engine Status Unknown
            - generic [ref=f4e35]: . The availability check could not be completed, so no claim is made.
          - button "Notifications, none unread" [ref=f4e37] [cursor=pointer]
          - button "Account menu for Control Plane" [ref=f4e42] [cursor=pointer]:
            - generic [ref=f4e43]: CP
            - generic [ref=f4e46]: Control Plane
      - generic [ref=f4e50]:
        - complementary [ref=f4e51]:
          - link "✦ IME365 AI Executive Suite" [ref=f4e53] [cursor=pointer]:
            - /url: /dashboard
            - generic [ref=f4e54]: ✦
            - generic [ref=f4e55]:
              - generic [ref=f4e56]:
                - generic [ref=f4e57]: IME365
                - generic [ref=f4e58]: AI
              - generic [ref=f4e59]: Executive Suite
          - navigation "Platform admin navigation" [ref=f4e61]:
            - generic [ref=f4e62]:
              - heading "Control Plane & Observability" [level=2] [ref=f4e63]
              - list [ref=f4e64]:
                - listitem [ref=f4e65]:
                  - link "Command Center" [ref=f4e66] [cursor=pointer]:
                    - /url: /admin/dashboard
                - listitem [ref=f4e70]:
                  - link "Platform Health" [ref=f4e71] [cursor=pointer]:
                    - /url: /admin/health
                - listitem [ref=f4e75]:
                  - link "Queues & DLQ" [ref=f4e76] [cursor=pointer]:
                    - /url: /admin/queues
                - listitem [ref=f4e81]:
                  - link "Operations" [ref=f4e82] [cursor=pointer]:
                    - /url: /admin/operations
                - listitem [ref=f4e85]:
                  - link "Attention Needed" [ref=f4e86] [cursor=pointer]:
                    - /url: /admin/attention
                - listitem [ref=f4e90]:
                  - link "Audit Trail" [ref=f4e91] [cursor=pointer]:
                    - /url: /admin/audit-logs
                - listitem [ref=f4e96]:
                  - link "Security Events" [ref=f4e97] [cursor=pointer]:
                    - /url: /admin/security
            - generic [ref=f4e101]:
              - heading "Support & Identity" [level=2] [ref=f4e102]
              - list [ref=f4e103]:
                - listitem [ref=f4e104]:
                  - link "Help Desk & Tickets" [ref=f4e105] [cursor=pointer]:
                    - /url: /admin/help-desk
                - listitem [ref=f4e110]:
                  - link "Users Manager" [ref=f4e111] [cursor=pointer]:
                    - /url: /admin/users
                - listitem [ref=f4e118]:
                  - link "Operators & Staff" [ref=f4e119] [cursor=pointer]:
                    - /url: /admin/operators
                - listitem [ref=f4e125]:
                  - link "System Broadcasts" [ref=f4e126] [cursor=pointer]:
                    - /url: /admin/messages
            - generic [ref=f4e131]:
              - heading "Marketplace & Hiring Moderation" [level=2] [ref=f4e132]
              - list [ref=f4e133]:
                - listitem [ref=f4e134]:
                  - link "Employer Verifications" [ref=f4e135] [cursor=pointer]:
                    - /url: /admin/employer-applications
                - listitem [ref=f4e140]:
                  - link "Jobs Moderation" [ref=f4e141] [cursor=pointer]:
                    - /url: /admin/jobs-manager
                - listitem [ref=f4e146]:
                  - link "Company Registry" [ref=f4e147] [cursor=pointer]:
                    - /url: /admin/company-management
                - listitem [ref=f4e153]:
                  - link "Tenants Registry" [ref=f4e154] [cursor=pointer]:
                    - /url: /admin/tenants
            - generic [ref=f4e160]:
              - heading "Content & Marketing CMS" [level=2] [ref=f4e161]
              - list [ref=f4e162]:
                - listitem [ref=f4e163]:
                  - link "Blog Engine" [ref=f4e164] [cursor=pointer]:
                    - /url: /admin/blog-management
                - listitem [ref=f4e168]:
                  - link "Landing Pages" [ref=f4e169] [cursor=pointer]:
                    - /url: /admin/landing-pages
                - listitem [ref=f4e173]:
                  - link "Reviews & Testimonials" [ref=f4e174] [cursor=pointer]:
                    - /url: /admin/reviews
                - listitem [ref=f4e178]:
                  - link "Trusted By" [ref=f4e179] [cursor=pointer]:
                    - /url: /admin/trustedby
                - listitem [ref=f4e184]:
                  - link "Localization & Phrases" [ref=f4e185] [cursor=pointer]:
                    - /url: /admin/phrases
        - main [ref=f4e190]:
          - generic [ref=f4e194]:
            - group "Platform admin session controls" [ref=f4e195]:
              - button "API & MariaDB Ready • Auth Active. Check again" [ref=f4e197] [cursor=pointer]: API & MariaDB Ready • Auth Active
              - generic [ref=f4e199]:
                - link "Live site" [ref=f4e200] [cursor=pointer]:
                  - /url: /
                - button "Switch Dashboard Role View" [ref=f4e206] [cursor=pointer]:
                  - generic [ref=f4e209]: Super Admin
                - button "Sign out of admin console" [ref=f4e212] [cursor=pointer]:
                  - generic [ref=f4e215]: Sign out
            - status [ref=f4e216]:
              - generic [ref=f4e217]: This session is not MFA-verified, so Super Admin destructive operations are blocked. Sign out and sign in again, completing the authenticator challenge at the second-factor prompt.
            - generic [ref=f4e219]:
              - generic [ref=f4e220]:
                - generic [ref=f4e221]:
                  - generic [ref=f4e222]: Platform Telemetry Online
                  - heading "Platform Command Center" [level=1] [ref=f4e225]
                  - paragraph [ref=f4e226]: Real-time multi-tenant telemetry, operational health telemetry, security event stream, and governance radar.
                  - generic [ref=f4e227]:
                    - generic [ref=f4e228]:
                      - text: "Uptime:"
                      - strong [ref=f4e229]: —
                    - generic [ref=f4e230]: •
                    - generic [ref=f4e231]:
                      - text: "Refreshed:"
                      - strong [ref=f4e232]: Loading…
                    - generic [ref=f4e233]: •
                    - 'button "Auto-Refresh: 30s" [ref=f4e234] [cursor=pointer]'
                - generic [ref=f4e236]:
                  - button "Refresh Stream" [disabled]
                  - link "Health Matrix" [ref=f4e237] [cursor=pointer]:
                    - /url: /admin/health
              - generic [ref=f4e241]:
                - link "Recorded Platform Earnings ₹ — Verified transactional gross revenue Stored aggregate; no trend inferred" [ref=f4e242] [cursor=pointer]:
                  - /url: /admin/settings?tab=ordersManagement
                  - generic [ref=f4e243]:
                    - generic [ref=f4e244]: Recorded Platform Earnings
                    - 'generic "System Currency: INR" [ref=f4e246]': ₹
                  - paragraph [ref=f4e247]: —
                  - paragraph [ref=f4e248]: Verified transactional gross revenue
                  - paragraph [ref=f4e249]: Stored aggregate; no trend inferred
                - link "Total Registered Accounts — Active consumer & employer profiles Stored aggregate; no trend inferred" [ref=f4e250] [cursor=pointer]:
                  - /url: /admin/users
                  - generic [ref=f4e251]: Total Registered Accounts
                  - paragraph [ref=f4e256]: —
                  - paragraph [ref=f4e257]: Active consumer & employer profiles
                  - paragraph [ref=f4e258]: Stored aggregate; no trend inferred
                - link "Resumes & Portfolios Engineered — 51 template engines compiled Stored aggregate; no trend inferred" [ref=f4e259] [cursor=pointer]:
                  - /url: /admin/audit-logs
                  - generic [ref=f4e260]: Resumes & Portfolios Engineered
                  - paragraph [ref=f4e265]: —
                  - paragraph [ref=f4e266]: 51 template engines compiled
                  - paragraph [ref=f4e267]: Stored aggregate; no trend inferred
                - link "Exports & Downloads Generated — High-fidelity PDF and DOCX pipelines Stored aggregate; no trend inferred" [ref=f4e268] [cursor=pointer]:
                  - /url: /admin/health
                  - generic [ref=f4e269]: Exports & Downloads Generated
                  - paragraph [ref=f4e274]: —
                  - paragraph [ref=f4e275]: High-fidelity PDF and DOCX pipelines
                  - paragraph [ref=f4e276]: Stored aggregate; no trend inferred
              - generic [ref=f4e277]:
                - generic [ref=f4e278]:
                  - generic [ref=f4e279]:
                    - heading "Live Service Matrix" [level=2] [ref=f4e280]
                    - paragraph [ref=f4e281]: Real-time status of microservices, worker pipelines, and public API gates.
                  - link "Platform Health Diagnostics" [ref=f4e282] [cursor=pointer]:
                    - /url: /admin/health
                - paragraph [ref=f4e285]: Operational status data unavailable — the health collector did not respond. No status is inferred.
              - generic [ref=f4e286]:
                - generic [ref=f4e287]:
                  - generic [ref=f4e288]:
                    - heading "SuperAdmin Action Recommendations" [level=2] [ref=f4e289]
                    - paragraph [ref=f4e290]: Automated signal prioritization derived from active telemetry.
                  - generic [ref=f4e291]: 0 Actions Pending
                - generic [ref=f4e292]: All systems operating within acceptable parameters. No critical operator action required.
              - generic [ref=f4e296]:
                - generic [ref=f4e297]:
                  - generic [ref=f4e298]:
                    - generic [ref=f4e299]:
                      - heading "Tenants Needing Attention" [level=2] [ref=f4e300]
                      - paragraph [ref=f4e301]: Suspended, deleting, or degraded organization lifecycles.
                    - link "Registry" [ref=f4e302] [cursor=pointer]:
                      - /url: /admin/tenants
                  - generic [ref=f4e305]: No suspended or decommissioning organizations in platform registry.
                - generic [ref=f4e306]:
                  - generic [ref=f4e307]:
                    - generic [ref=f4e308]:
                      - heading "Live Security & Audit Stream" [level=2] [ref=f4e309]
                      - paragraph [ref=f4e310]: Real-time immutable control-plane mutation ledger.
                    - link "Full Ledger" [ref=f4e311] [cursor=pointer]:
                      - /url: /admin/audit-logs
                  - generic [ref=f4e314]: No administrative mutations recorded in current operational window.
```

# Test source

```ts
  89  |     { name: 'enterprise', path: '/org' },
  90  |     { name: 'admin', path: '/admin' },
  91  | ]);
  92  | 
  93  | const EVIDENCE_DIR = path.join(process.cwd(), '.bridge', 'evidence');
  94  | fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  95  | 
  96  | function record(line) {
  97  |     const stamped = `[${new Date().toISOString()}] ${line}`;
  98  |     fs.appendFileSync(path.join(EVIDENCE_DIR, 'dir011-console.log'), `${stamped}\n`);
  99  |     console.log(stamped);
  100 | }
  101 | 
  102 | /**
  103 |  * Resolves a live identity. DIR-011's explicit override wins, then the established
  104 |  * platform identity variables, so the suite does not depend on a single ambient
  105 |  * variable being inherited by the Playwright worker.
  106 |  */
  107 | async function ensureSession() {
  108 |     const candidates = [
  109 |         process.env.DIR011_EMAIL,
  110 |         process.env.DIR010_RECRUITER_EMAIL,
  111 |         process.env.DIR006_EMAIL,
  112 |         process.env.ADMIN_EMAIL,
  113 |     ].filter(Boolean);
  114 |     for (const email of candidates) {
  115 |         const session = await mintFirebaseSession({ email });
  116 |         if (session) return session;
  117 |     }
  118 |     return null;
  119 | }
  120 | 
  121 | const SESSION = await ensureSession();
  122 | 
  123 | 
  124 | /** Seeds the browser session exactly the way the app's own Firebase SDK expects. */
  125 | async function bootSession(page) {
  126 |     await page.addInitScript(({ uid, email, token, refreshToken, apiKey }) => {
  127 |         const authUser = {
  128 |             uid,
  129 |             email,
  130 |             emailVerified: true,
  131 |             displayName: email.split('@')[0],
  132 |             isAnonymous: false,
  133 |             stsTokenManager: { apiKey, refreshToken, accessToken: token, expirationTime: Date.now() + 3600_000 },
  134 |             createdAt: String(Date.now()),
  135 |             lastLoginAt: String(Date.now()),
  136 |             apiKey,
  137 |             appName: '[DEFAULT]',
  138 |         };
  139 |         localStorage.setItem(`firebase:authUser:${apiKey}:[DEFAULT]`, JSON.stringify(authUser));
  140 |         localStorage.setItem('user', uid);
  141 |         localStorage.setItem('preferredLanguage', 'en');
  142 |         // Pin the Cuba shell so the suite measures the directive's TARGET surface
  143 |         // (the universal M3 CubaAppShell header) rather than the legacy chrome that
  144 |         // mounts when the §49 rollout flag is off.
  145 |         localStorage.setItem('ime365_cuba_shell_v2', 'cuba');
  146 |         localStorage.setItem('resumepilot_privacy_consent_v1', 'denied');
  147 |         localStorage.setItem('ime365_privacy_consent_v1', 'denied');
  148 |     }, {
  149 |         uid: SESSION.uid,
  150 |         email: SESSION.email,
  151 |         token: SESSION.idToken,
  152 |         refreshToken: SESSION.refreshToken,
  153 |         apiKey: SESSION.apiKey,
  154 |     });
  155 | }
  156 | 
  157 | /**
  158 |  * Collects the three defect classes DIR-011 forbids: browser console errors, uncaught
  159 |  * page errors, and any `/api/*` response >= 400.
  160 |  */
  161 | function watchForDefects(page) {
  162 |     const consoleErrors = [];
  163 |     const pageErrors = [];
  164 |     const failedApi = [];
  165 |     page.on('console', (message) => {
  166 |         if (message.type() !== 'error') return;
  167 |         const text = message.text();
  168 |         if (/favicon|Content Security Policy/i.test(text)) return;
  169 |         consoleErrors.push(text);
  170 |     });
  171 |     page.on('pageerror', (error) => pageErrors.push(String(error)));
  172 |     page.on('response', (response) => {
  173 |         const { pathname } = new URL(response.url());
  174 |         if (pathname.startsWith('/api/') && response.status() >= 400) {
  175 |             failedApi.push(`${response.status()} ${pathname}`);
  176 |         }
  177 |     });
  178 |     return { consoleErrors, pageErrors, failedApi };
  179 | }
  180 | 
  181 | /** Run-wide defect accumulation, drained and asserted in stage 9. */
  182 | const RUN_DEFECTS = { consoleErrors: [], pageErrors: [], failedApi: [] };
  183 | 
  184 | function assertNoDefects(stage, defects) {
  185 |     RUN_DEFECTS.consoleErrors.push(...defects.consoleErrors);
  186 |     RUN_DEFECTS.pageErrors.push(...defects.pageErrors);
  187 |     RUN_DEFECTS.failedApi.push(...defects.failedApi);
  188 |     record(`${stage} defects: console=${defects.consoleErrors.length} pageErrors=${defects.pageErrors.length} api=${defects.failedApi.length}`);
> 189 |     expect(defects.consoleErrors, `${stage} must not log console errors`).toEqual([]);
      |                                                                           ^ Error: stage 1 must not log console errors
  190 |     expect(defects.pageErrors, `${stage} must not throw uncaught errors`).toEqual([]);
  191 |     expect(defects.failedApi, `${stage} must not fail any /api/* request`).toEqual([]);
  192 | }
  193 | 
  194 | /**
  195 |  * Navigates to a route and waits for the universal header to actually paint.
  196 |  *
  197 |  * The wait is on the header itself, not on a network-idle heuristic, so the suite
  198 |  * cannot measure a shell that mounted late or not at all.
  199 |  */
  200 | async function openRoute(page, routePath) {
  201 |     await page.goto(`${WEB_ORIGIN}${routePath}`, { waitUntil: 'domcontentloaded' });
  202 |     await page.waitForSelector('header', { state: 'attached', timeout: 60_000 });
  203 | }
  204 | 
  205 | /**
  206 |  * Contrast ratio per WCAG 2.1 relative luminance. Kept in the suite rather than
  207 |  * borrowed from a dependency so the number asserted here is one a reviewer can
  208 |  * recompute by hand from the two rgb() triples the browser reported. Returns null for
  209 |  * anything that is not a parseable rgb(a) value, so a `rgba(0, 0, 0, 0)` transparent
  210 |  * label can never fake a passing ratio.
  211 |  */
  212 | function contrastRatio(fg, bg) {
  213 |     const parse = (value) => {
  214 |         const m = /^rgba?\(([^)]+)\)$/.exec(String(value || '').trim());
  215 |         if (!m) return null;
  216 |         const parts = m[1].split(',').map((n) => parseFloat(n));
  217 |         if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;
  218 |         if (parts.length === 4 && parts[3] === 0) return null; // fully transparent
  219 |         return parts.slice(0, 3);
  220 |     };
  221 |     const a = parse(fg);
  222 |     const b = parse(bg);
  223 |     if (!a || !b) return null;
  224 |     const lum = (rgb) => {
  225 |         const [r, g, bl] = rgb.map((channel) => {
  226 |             const c = channel / 255;
  227 |             return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  228 |         });
  229 |         return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  230 |     };
  231 |     const l1 = lum(a);
  232 |     const l2 = lum(b);
  233 |     const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  234 |     return (hi + 0.05) / (lo + 0.05);
  235 | }
  236 | 
  237 | function frozenDiffStat() {
  238 |     return execFileSync(
  239 |         'git',
  240 |         ['diff', '--stat', FREEZE_BASELINE, '--', ...FROZEN_PATHS],
  241 |         { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  242 |     ).trim();
  243 | }
  244 | 
  245 | test.beforeAll(() => {
  246 |     if (!SESSION) {
  247 |         throw new Error(
  248 |             'DIR-011 requires a live identity. Set DIR011_EMAIL or ADMIN_EMAIL; '
  249 |             + 'refusing to run against a signed-out browser.',
  250 |         );
  251 |     }
  252 |     record(`DIR-011 suite starting against ${WEB_ORIGIN} as ${SESSION.email} (uid ${SESSION.uid})`);
  253 | });
  254 | 
  255 | test.describe('DIR-011 — universal Google M3 AppHeader & command surface', () => {
  256 |     /**
  257 |      * STAGE 0 — LIVE STACK. The header reads real data from the real backend, so a
  258 |      * green header suite against a dead backend would prove nothing.
  259 |      */
  260 |     test('stage 0: the live stack is healthy and MariaDB authoritative', async ({ request }) => {
  261 |         // `/api/platform/health` sits BEHIND `router.use(requireAuth)`
  262 |         // (backend/routes/platform.js:261) ahead of the route itself, so it is an
  263 |         // authenticated diagnostics endpoint, not the unauthenticated liveness probe.
  264 |         // Probing it anonymously therefore proves nothing about the running system —
  265 |         // it only re-asserts that RBAC is on. This suite mints a live session in
  266 |         // beforeAll, so the probe carries that identity and measures the real thing.
  267 |         const response = await request.get(`${API_ORIGIN}/api/platform/health`, {
  268 |             headers: { Authorization: `Bearer ${SESSION.idToken}` },
  269 |         });
  270 |         expect(response.status(), 'the live backend must answer the platform health probe').toBe(200);
  271 |         const body = await response.json();
  272 |         record(`stage 0 health: status=${body.status} database=${body.subsystems?.database?.provider}`);
  273 |         // The header's notification read is owner-scoped MariaDB; a non-MariaDB
  274 |         // authoritative store means the badge is not reading the real system.
  275 |         expect(
  276 |             String(body.subsystems?.database?.provider || '').toLowerCase(),
  277 |             'MariaDB must be the authoritative store',
  278 |         ).toMatch(/mysql|maria/i);
  279 |     });
  280 | 
  281 |     /**
  282 |      * STAGE 1 — SINGLE HEADER, FOUR PORTALS.
  283 |      *
  284 |      * The directive's core claim is that the header is UNIVERSAL: one AppShell chrome
  285 |      * per authenticated route, with a unique landmark nav name. A duplicated <header>
  286 |      * or two identically-named nav landmarks would mean two competing chrome trees, and
  287 |      * a screen-reader user could not tell which one is authoritative.
  288 |      */
  289 |     test('stage 1: exactly one header and one uniquely-named nav landmark per portal', async ({ page }) => {
```