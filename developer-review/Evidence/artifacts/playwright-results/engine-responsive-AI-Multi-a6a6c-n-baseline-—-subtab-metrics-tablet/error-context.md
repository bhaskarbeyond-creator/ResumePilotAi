# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: engine-responsive.spec.ts >> AI Multi-Provider Engine — Multi-Viewport Responsive, Axe & Visual Baselines >> Visual regression baseline — subtab=metrics
- Location: tests/engine-responsive.spec.ts:226:5

# Error details

```
Error: expect(page).toHaveScreenshot(expected) failed

  43075 pixels (ratio 0.06 of all image pixels) are different.

  Snapshot: ai-settings-metrics.png

Call log:
  - Expect "toHaveScreenshot(ai-settings-metrics.png)" with timeout 15000ms
    - verifying given screenshot expectation
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - 43075 pixels (ratio 0.06 of all image pixels) are different.
  - waiting 100ms before taking screenshot
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - captured a stable screenshot
  - 43075 pixels (ratio 0.06 of all image pixels) are different.

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - link "Skip to main content" [ref=e4] [cursor=pointer]:
    - /url: "#main-content"
  - complementary "Admin Console navigation" [ref=e5]:
    - generic [ref=e6]:
      - link [ref=e7] [cursor=pointer]:
        - /url: /admin
        - img "IME365" [ref=e8]
      - button "Close menu" [ref=e9]
    - button "Switch platform workspace Admin Console" [ref=e14] [cursor=pointer]:
      - generic [ref=e15]: Switch platform workspace
      - generic [ref=e16]: Admin Console
    - navigation "Main navigation" [ref=e23]:
      - generic [ref=e24]:
        - heading "Observability & Core" [level=2] [ref=e25]
        - list [ref=e26]:
          - listitem [ref=e27]:
            - link "Command Center" [ref=e28] [cursor=pointer]:
              - /url: /admin/dashboard
          - listitem [ref=e32]:
            - link "Platform Health Live" [ref=e33] [cursor=pointer]:
              - /url: /admin/health
              - generic [ref=e36]: Platform Health
              - generic [ref=e37]: Live
          - listitem [ref=e38]:
            - link "Queues & Outbox DLQ" [ref=e39] [cursor=pointer]:
              - /url: /admin/queues
          - listitem [ref=e45]:
            - link "Operations & Maint." [ref=e46] [cursor=pointer]:
              - /url: /admin/operations
          - listitem [ref=e51]:
            - link "Attention Needed 2" [ref=e52] [cursor=pointer]:
              - /url: /admin/attention
              - generic [ref=e55]: Attention Needed
              - generic [ref=e56]: "2"
      - generic [ref=e57]:
        - heading "Identity & Support" [level=2] [ref=e58]
        - list [ref=e59]:
          - listitem [ref=e60]:
            - link "Users Manager & 360" [ref=e61] [cursor=pointer]:
              - /url: /admin/users
          - listitem [ref=e68]:
            - link "Help Desk & Tickets" [ref=e69] [cursor=pointer]:
              - /url: /admin/support
          - listitem [ref=e74]:
            - link "Security & Staff RBAC" [ref=e75] [cursor=pointer]:
              - /url: /admin/security
      - generic [ref=e80]:
        - heading "Moderation Hub" [level=2] [ref=e81]
        - list [ref=e82]:
          - listitem [ref=e83]:
            - link "Employers, Jobs & Tenants" [ref=e84] [cursor=pointer]:
              - /url: /admin/moderation
          - listitem [ref=e89]:
            - link "Blog Engine" [ref=e90] [cursor=pointer]:
              - /url: /admin/blog
          - listitem [ref=e95]:
            - link "ATS Phrases & Reviews" [ref=e96] [cursor=pointer]:
              - /url: /admin/content
      - generic [ref=e101]:
        - heading "System Configuration" [level=2] [ref=e102]
        - list [ref=e103]:
          - listitem [ref=e104]:
            - link "AI Multi-Provider Engine" [ref=e105] [cursor=pointer]:
              - /url: /admin/ai-settings
          - listitem [ref=e115]:
            - link "Email & SMTP Deliverability" [ref=e116] [cursor=pointer]:
              - /url: /admin/email
          - listitem [ref=e121]:
            - link "Platform Settings & Modules" [ref=e122] [cursor=pointer]:
              - /url: /admin/settings
    - generic [ref=e128]:
      - link "S superadmin superadmin@resumepilot.test" [ref=e129] [cursor=pointer]:
        - /url: /dashboard/settings?tab=profile
        - generic [ref=e130]: S
        - generic [ref=e131]:
          - paragraph [ref=e132]: superadmin
          - paragraph [ref=e133]: superadmin@resumepilot.test
      - button "Sign out" [ref=e134]
  - generic [ref=e138]:
    - banner [ref=e139]:
      - generic [ref=e140]:
        - generic [ref=e141]:
          - button "Open menu" [ref=e142]
          - navigation "Breadcrumb" [ref=e144]:
            - list [ref=e145]:
              - listitem [ref=e146]:
                - link "Admin Console" [ref=e147] [cursor=pointer]:
                  - /url: /admin
              - listitem [ref=e148]:
                - generic [aria-hidden] [ref=e149]: /
                - link "AI Multi-Provider Engine" [ref=e150] [cursor=pointer]:
                  - /url: /admin/ai-settings
        - generic [ref=e151]:
          - button "View As Role" [ref=e152] [cursor=pointer]
          - button "Notifications" [ref=e158]
          - button "10 / 10 AI — Daily AI allowance (10 of 10 remaining today)" [ref=e163] [cursor=pointer]:
            - generic [ref=e167]: "10"
            - generic [ref=e168]: /10 AI
          - button "Toggle theme" [ref=e169]
          - button "Account menu for superadmin S superadmin SUPER_ADMIN" [ref=e172]:
            - generic [ref=e173]: Account menu for superadmin
            - generic [ref=e174]: S
            - generic [ref=e176]:
              - generic [ref=e177]: superadmin
              - generic [ref=e178]: SUPER_ADMIN
    - main [ref=e181]:
      - generic [ref=e182]:
        - generic [ref=e184]:
          - generic [ref=e185]:
            - heading "Super Admin Control Plane" [level=1] [ref=e186]
            - generic [ref=e187]: Root Level
          - paragraph [ref=e188]: Platform governance, 28-service operational telemetry, AI provider orchestration, and CMS control.
        - main "Admin Control Tab Content" [ref=e189]:
          - generic [ref=e190]:
            - generic [ref=e193]:
              - generic [ref=e194]:
                - generic [ref=e195]:
                  - heading "Runtime model selection" [level=2] [ref=e204]
                  - generic [ref=e205]: "Primary: groq"
                  - generic [ref=e206]: "Rev #1"
                - paragraph [ref=e207]:
                  - text: Dispatch mode across 4 registered providers. Resume Import toggle lives in
                  - link "Platform Settings" [ref=e208] [cursor=pointer]:
                    - /url: /admin/settings
                  - text: .
              - generic [ref=e209]:
                - generic [ref=e210]:
                  - generic [ref=e211]: Selection mode
                  - combobox "Selection mode" [ref=e212]:
                    - option "Auto / Recommended"
                    - option "Quality First"
                    - option "Speed First"
                    - option "Balanced" [selected]
                    - option "Manual Pin"
                - generic [ref=e213] [cursor=pointer]:
                  - checkbox "Failover Mesh" [checked] [ref=e214]
                  - generic [ref=e215]: Failover Mesh
                - button "Tuning (0.70 · 2048 tok)" [ref=e216] [cursor=pointer]
                - button "Save All Changes" [ref=e221] [cursor=pointer]
            - generic [ref=e222]:
              - generic "AI Engine Views" [ref=e223]:
                - button "Providers & Keys (2/4)" [ref=e224] [cursor=pointer]
                - button "Models & Fallback Chains" [ref=e225] [cursor=pointer]
                - button "Quotas & Telemetry" [ref=e226] [cursor=pointer]
                - button "Claude Code & Agents" [ref=e227] [cursor=pointer]
                - button "Playground" [ref=e228] [cursor=pointer]
              - generic [ref=e229]:
                - button "Configure Provider" [ref=e230] [cursor=pointer]
                - button "Manage key pools" [ref=e231] [cursor=pointer]
                - button "Manage cooldowns" [ref=e232] [cursor=pointer]
                - button "Discover models" [ref=e233] [cursor=pointer]
                - button "Integration snippets" [ref=e234] [cursor=pointer]
            - generic [ref=e235]:
              - generic [ref=e237]:
                - generic [ref=e238]:
                  - generic [ref=e239]:
                    - heading "Engine Metrics" [level=3] [ref=e240]
                    - paragraph [ref=e243]: Live provider router inventory and durable SQLite execution counters.
                  - generic [ref=e244]: 0.17.0-inprocess-74p
                - generic [ref=e245]:
                  - generic [ref=e246]:
                    - generic [ref=e247]: Total Providers
                    - generic [ref=e248]: "4"
                  - generic [ref=e249]:
                    - generic [ref=e250]: Configured
                    - generic [ref=e251]: "2"
                  - generic [ref=e252]:
                    - generic [ref=e253]: Multi-Key Pools
                    - generic [ref=e254]: "1"
                  - generic [ref=e255]:
                    - generic [ref=e256]: Active Cooldowns
                    - generic [ref=e257]: "0"
                - generic [ref=e258]:
                  - generic [ref=e259]:
                    - generic [ref=e260]: Router Requests
                    - generic [ref=e261]: "320"
                  - generic [ref=e262]:
                    - generic [ref=e263]: Total Tokens
                    - generic [ref=e264]: 184,200
                  - generic [ref=e265]:
                    - generic [ref=e266]: Avg Latency
                    - generic [ref=e267]: 92ms
                  - generic [ref=e268]:
                    - generic [ref=e269]: Upstream Errors
                    - generic [ref=e270]: "2"
              - generic [ref=e272]:
                - generic [ref=e273]:
                  - generic [ref=e274]:
                    - heading "AI Quota Governance & Daily Usage" [level=3] [ref=e275]
                    - paragraph [ref=e279]: Enforce tier daily request caps in MariaDB and reset exhausted individual or global daily counters.
                  - generic [ref=e280]:
                    - button "Refresh Quotas" [ref=e281] [cursor=pointer]
                    - button "Reset All Daily Quotas" [ref=e282] [cursor=pointer]
                - generic [ref=e283]:
                  - generic [ref=e284]:
                    - generic [ref=e285]: Today's AI Requests
                    - generic [ref=e286]: "42"
                  - generic [ref=e287]:
                    - generic [ref=e288]: Active Users Today
                    - generic [ref=e289]: "5"
                  - generic [ref=e290]:
                    - generic [ref=e291]: Historical Usage Rows
                    - generic [ref=e292]: 1,280
                - generic [ref=e293]:
                  - generic [ref=e294]:
                    - generic [ref=e295]:
                      - generic [ref=e296]: Basic Daily Limit
                      - spinbutton "Basic Daily Limit" [ref=e297]: "10"
                    - generic [ref=e298]:
                      - generic [ref=e299]: Premium Daily Limit
                      - spinbutton "Premium Daily Limit" [ref=e300]: "100"
                    - generic [ref=e301]:
                      - generic [ref=e302]: Enterprise Daily Limit
                      - spinbutton "Enterprise Daily Limit" [ref=e303]: "5000"
                    - generic [ref=e304]:
                      - generic [ref=e305]: Admin Daily Limit
                      - spinbutton "Admin Daily Limit" [ref=e306]: "10000"
                  - generic [ref=e307]:
                    - generic [ref=e308]: "Quota policy revision: #1"
                    - button "Save Quota Limits" [ref=e309] [cursor=pointer]
                - generic [ref=e310]:
                  - heading "Top Consumers Today" [level=4] [ref=e311]
                  - paragraph [ref=e312]: No AI quota consumption recorded for today (2026-10-24).
```

# Test source

```ts
  223 |   });
  224 | 
  225 |   for (const subtab of PRIMARY_SUBTABS) {
  226 |     test(`Visual regression baseline — subtab=${subtab}`, async ({ page, request }) => {
  227 |       // Under Policy B: Dual platform snapshots committed ({platform} template).
  228 |       // Both Linux and Windows run their respective platform baselines.
  229 |       const superSession = await loginRole(request, 'superadmin@resumepilot.test');
  230 |       await page.addInitScript(
  231 |         (s) => localStorage.setItem('ime_dev_user', JSON.stringify(s)),
  232 |         superSession
  233 |       );
  234 | 
  235 |       // Pin deterministic read payloads so visual baselines never drift due to live counters
  236 |       await page.route('**/api/admin/ai-settings', (route) =>
  237 |         route.fulfill({
  238 |           json: {
  239 |             revision: 1,
  240 |             settings: {
  241 |               selectionMode: 'balanced',
  242 |               provider: 'groq',
  243 |               temperature: 0.7,
  244 |               maxTokens: 2048,
  245 |               enableFallback: true,
  246 |             },
  247 |             maskedKeys: { groq: '••••••••A1B2', cerebras: '••••••••C3D4' },
  248 |             credentialSources: {
  249 |               groq: 'mariadb-secret-store',
  250 |               cerebras: 'environment',
  251 |             },
  252 |             cooldowns: {},
  253 |             catalog: DETERMINISTIC_SNAPSHOT_CATALOG,
  254 |             discoveredModels: [
  255 |               {
  256 |                 id: 'llama-3.3-70b-versatile',
  257 |                 name: 'Llama 3.3 70B',
  258 |                 providerId: 'groq',
  259 |                 contextWindow: 128000,
  260 |                 capabilities: { vision: false, tools: true, json: true },
  261 |                 catalogStatus: 'fresh',
  262 |               },
  263 |             ],
  264 |             featureFlags: { ai_settings_v2_enabled: true },
  265 |           },
  266 |         })
  267 |       );
  268 |       await page.route('**/api/admin/ai/quota-stats', (route) =>
  269 |         route.fulfill({
  270 |           json: {
  271 |             todayDate: '2026-10-24',
  272 |             totalTodayRequests: 42,
  273 |             activeUsersToday: 5,
  274 |             totalHistoricalRecords: 1280,
  275 |             topConsumers: [],
  276 |             limits: { basic: 10, premium: 100, enterprise: 5000, admin: 10000 },
  277 |             quotaRevision: 1,
  278 |           },
  279 |         })
  280 |       );
  281 |       await page.route('**/api/freellmapi/status', (route) =>
  282 |         route.fulfill({
  283 |           json: {
  284 |             success: true,
  285 |             version: '0.17.0-inprocess-74p',
  286 |             totalProvidersCount: 75,
  287 |           },
  288 |         })
  289 |       );
  290 |       await page.route('**/api/freellmapi/metrics', (route) =>
  291 |         route.fulfill({
  292 |           json: {
  293 |             success: true,
  294 |             summary: {
  295 |               totalRequests: 320,
  296 |               successCount: 318,
  297 |               errorCount: 2,
  298 |               totalTokens: 184200,
  299 |               avgLatencyMs: 92,
  300 |               backend: 'sqlite',
  301 |             },
  302 |             providers: [],
  303 |           },
  304 |         })
  305 |       );
  306 |       await page.route('**/api/users-data/ai-usage', (route) =>
  307 |         route.fulfill({
  308 |           json: {
  309 |             plan: 'Admin',
  310 |             usedToday: 0,
  311 |             effectiveLimit: 10000,
  312 |             remainingToday: 10000,
  313 |             isExhausted: false,
  314 |           },
  315 |         })
  316 |       );
  317 |       await page.route('**/api/notifications**', (route) =>
  318 |         route.fulfill({ json: { notifications: [], unreadCount: 0 } })
  319 |       );
  320 | 
  321 |       await page.goto(`/admin/ai-settings?subtab=${subtab}`);
  322 |       await expect(page.getByRole('heading', { name: 'Runtime model selection' })).toBeVisible();
> 323 |       await expect(page).toHaveScreenshot(`ai-settings-${subtab}.png`, {
      |                          ^ Error: expect(page).toHaveScreenshot(expected) failed
  324 |         animations: 'disabled',
  325 |       });
  326 |     });
  327 |   }
  328 | });
  329 | 
```