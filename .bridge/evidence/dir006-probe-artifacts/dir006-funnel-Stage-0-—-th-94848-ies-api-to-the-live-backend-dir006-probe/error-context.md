# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dir006-funnel.spec.js >> Stage 0 — the live frontend serves the SPA and proxies /api to the live backend
- Location: tests\e2e\dir006-funnel.spec.js:163:1

# Error details

```
Test timeout of 180000ms exceeded.
```

```
Error: page.goto: Test timeout of 180000ms exceeded.
Call log:
  - navigating to "http://localhost:3000/", waiting until "domcontentloaded"

```

# Page snapshot

```yaml
- link "Skip to main content" [ref=f4e2] [cursor=pointer]:
  - /url: "#main-content"
```

# Test source

```ts
  71  | 
  72  | 
  73  | /**
  74  |  * Seeds the browser session the same way the app's own Firebase SDK expects,
  75  |  * then pins the harness token so the client exchanges it for the same identity
  76  |  * the backend authorises. Only identity is injected; no product data is faked.
  77  |  */
  78  | async function bootCandidateSession(page) {
  79  |     await page.addInitScript(({ uid, email, token, apiKey }) => {
  80  |         const expiresAt = Date.now() + 3600_000;
  81  |         const authUser = {
  82  |             uid,
  83  |             email,
  84  |             emailVerified: true,
  85  |             displayName: 'DIR-006 Funnel Candidate',
  86  |             isAnonymous: false,
  87  |             stsTokenManager: { apiKey, refreshToken: token, accessToken: token, expirationTime: expiresAt },
  88  |             createdAt: String(Date.now()),
  89  |             lastLoginAt: String(Date.now()),
  90  |             apiKey,
  91  |             appName: '[DEFAULT]',
  92  |         };
  93  |         const payload = JSON.stringify(authUser);
  94  |         localStorage.setItem(`firebase:authUser:${apiKey}:[DEFAULT]`, payload);
  95  |         localStorage.setItem('firebase:authUser:demo-browser-api-key:[DEFAULT]', payload);
  96  |         localStorage.setItem('user', uid);
  97  |         localStorage.setItem('preferredLanguage', 'en');
  98  |         // Consent is an explicit user choice; declining keeps the crawl free of
  99  |         // unprompted overlays without mutating any authoritative record.
  100 |         localStorage.setItem('resumepilot_privacy_consent_v1', 'denied');
  101 |         localStorage.setItem('ime365_privacy_consent_v1', 'denied');
  102 | 
  103 |         // The Firebase JS SDK persists the session in IndexedDB as well as
  104 |         // localStorage; without this mirror the SDK reports a signed-out user
  105 |         // and every authenticated route would redirect to /login.
  106 |         const keys = [`firebase:authUser:${apiKey}:[DEFAULT]`, 'firebase:authUser:demo-browser-api-key:[DEFAULT]'];
  107 |         try {
  108 |             const request = indexedDB.open('firebaseLocalStorageDb', 1);
  109 |             request.onupgradeneeded = () => {
  110 |                 const db = request.result;
  111 |                 if (!db.objectStoreNames.contains('firebaseLocalStorage')) {
  112 |                     db.createObjectStore('firebaseLocalStorage', { keyPath: 'fbase_key' });
  113 |                 }
  114 |             };
  115 |             request.onsuccess = () => {
  116 |                 const db = request.result;
  117 |                 const tx = db.transaction('firebaseLocalStorage', 'readwrite');
  118 |                 const store = tx.objectStore('firebaseLocalStorage');
  119 |                 keys.forEach((key) => store.put({ fbase_key: key, value: authUser }));
  120 |             };
  121 |         } catch { /* persistence mirroring is best-effort; localStorage still applies */ }
  122 |     }, { uid: SESSION.uid, email: SESSION.email, token: SESSION_TOKEN, apiKey: FIREBASE_API_KEY });
  123 | }
  124 | 
  125 | /**
  126 |  * Collects console errors, uncaught page errors and failed API responses so the
  127 |  * "zero 'Service temporarily unavailable'" criterion is asserted from evidence
  128 |  * rather than assumed.
  129 |  */
  130 | function watchForDefects(page) {
  131 |     const consoleErrors = [];
  132 |     const pageErrors = [];
  133 |     const failedApi = [];
  134 |     page.on('console', (message) => {
  135 |         if (message.type() !== 'error') return;
  136 |         const text = message.text();
  137 |         if (/favicon|Content Security Policy/i.test(text)) return;
  138 |         consoleErrors.push(text);
  139 |     });
  140 |     page.on('pageerror', (error) => pageErrors.push(String(error)));
  141 |     page.on('response', (response) => {
  142 |         const { pathname } = new URL(response.url());
  143 |         if (pathname.startsWith('/api/') && response.status() >= 400) {
  144 |             failedApi.push(`${response.status()} ${pathname}`);
  145 |         }
  146 |     });
  147 |     return { consoleErrors, pageErrors, failedApi };
  148 | }
  149 | 
  150 | const SERVICE_UNAVAILABLE = /service temporarily unavailable/i;
  151 | const asArray = (payload, key) => (Array.isArray(payload) ? payload : (payload?.[key] || []));
  152 | 
  153 | /** Asserts the MariaDB authoritative maintenance guard never surfaced. */
  154 | function expectNoMaintenanceGuard(defects, stage) {
  155 |     const consoleHits = defects.consoleErrors.filter((e) => SERVICE_UNAVAILABLE.test(e));
  156 |     const pageHits = defects.pageErrors.filter((e) => SERVICE_UNAVAILABLE.test(e));
  157 |     expect(consoleHits, `${stage} surfaced the maintenance guard in the console`).toEqual([]);
  158 |     expect(pageHits, `${stage} surfaced the maintenance guard as a page error`).toEqual([]);
  159 | }
  160 | 
  161 | test.describe.configure({ mode: 'serial' });
  162 | 
  163 | test('Stage 0 — the live frontend serves the SPA and proxies /api to the live backend', async ({ page }) => {
  164 |     const defects = watchForDefects(page);
  165 | 
  166 |     const health = await page.request.get(`${WEB_ORIGIN}/api/health`);
  167 |     expect(health.status()).toBe(200);
  168 |     const proxied = await health.json();
  169 |     expect(proxied.authoritativeDatabase).toBe('MARIADB');
  170 | 
> 171 |     await page.goto(WEB_ORIGIN, { waitUntil: 'domcontentloaded' });
      |                ^ Error: page.goto: Test timeout of 180000ms exceeded.
  172 |     await expect(page.locator('#root')).toBeAttached();
  173 |     record(`landing title="${(await page.title()).slice(0, 80)}"`);
  174 |     record(`stage0 proxied /api/health through ${WEB_ORIGIN} => 200 MARIADB; consoleErrors=${defects.consoleErrors.length}`);
  175 |     expectNoMaintenanceGuard(defects, 'stage0');
  176 | });
  177 | 
  178 | test('Stage 1 — Guest Acquisition: the landing page offers a featured template and routes the primary CTA into the ATS builder', async ({ page }) => {
  179 |     const defects = watchForDefects(page);
  180 | 
  181 |     await page.goto(WEB_ORIGIN, { waitUntil: 'domcontentloaded' });
  182 |     await expect(page.locator('#root')).toBeAttached();
  183 | 
  184 |     // The hero primary CTA is the acquisition surface named by the directive
  185 |     // (HomepageHero renders #rp-hero-primary-cta).
  186 |     const heroCta = page.locator('#rp-hero-primary-cta');
  187 |     await expect(heroCta).toBeVisible({ timeout: 30_000 });
  188 |     const heroLabel = (await heroCta.innerText()).trim();
  189 |     record(`stage1 hero CTA label="${heroLabel}"`);
  190 | 
  191 |     // The featured template gallery is part of the same acquisition journey.
  192 |     await expect(page.locator('#templates')).toBeAttached({ timeout: 20_000 });
  193 |     const templateCards = await page.locator('#templates h3').count();
  194 |     record(`stage1 featured template cards rendered=${templateCards}`);
  195 |     expect(templateCards, 'landing page rendered no featured templates').toBeGreaterThan(0);
  196 | 
  197 |     // A guest is offered the signup modal (the product's real handoff); an
  198 |     // authenticated visitor is routed straight into the builder. Both are
  199 |     // correct, so assert whichever the live session state produces.
  200 |     await heroCta.click();
  201 | 
  202 |     const routedToBuilder = await page.waitForURL(/\/build-resume/, { timeout: 20_000 })
  203 |         .then(() => true).catch(() => false);
  204 |     if (routedToBuilder) {
  205 |         record(`stage1 CTA routed the visitor directly to ${new URL(page.url()).pathname}`);
  206 |     } else {
  207 |         // Guest handoff: the auth modal must open and offer the signup path.
  208 |         const authModal = page.locator('[role="dialog"]').first();
  209 |         await expect(authModal).toBeVisible({ timeout: 20_000 });
  210 |         record('stage1 guest CTA opened the signup handoff modal (no account yet)');
  211 |     }
  212 | 
  213 | test('Stage 2 — Candidate Intelligence: the authenticated builder mounts every certified step with live preview and ATS scoring', async ({ page }) => {
  214 |     const defects = watchForDefects(page);
  215 |     await bootCandidateSession(page);
  216 | 
  217 |     // The five steps the directive names, verified against BuildResume's routes.
  218 |     const steps = ['heading', 'work-history', 'education', 'skills', 'summary'];
  219 |     for (const step of steps) {
  220 |         await page.goto(`${WEB_ORIGIN}/build-resume/${step}`, { waitUntil: 'domcontentloaded' });
  221 |         // A signed-in session must not be bounced back to /login.
  222 |         expect(new URL(page.url()).pathname, `/build-resume/${step} redirected away`).toBe(`/build-resume/${step}`);
  223 |         await expect(page.locator('#root')).toBeAttached();
  224 |         // Every step must render real controls, never a crash or a stub screen.
  225 |         const controls = await page.locator('input, textarea, button, select, [contenteditable="true"]').count();
  226 |         expect(controls, `step /build-resume/${step} rendered no controls`).toBeGreaterThan(0);
  227 |         record(`stage2 step /build-resume/${step} controls=${controls}`);
  228 |     }
  229 | 
  230 |     // The AI bio control lives on the summary step (SummaryStep.jsx).
  231 |     await page.goto(`${WEB_ORIGIN}/build-resume/summary`, { waitUntil: 'domcontentloaded' });
  232 |     await expect(page.getByRole('button', { name: /Generate Executive Bio/i }).first()).toBeVisible({ timeout: 30_000 });
  233 |     record('stage2 summary: Generate Executive Bio (AI) control present');
  234 | 
  235 |     // Live multi-page template preview + ATS score are proven on the review step.
  236 |     await page.goto(`${WEB_ORIGIN}/build-resume/review`, { waitUntil: 'domcontentloaded' });
  237 |     await expect(page.locator('#root')).toBeAttached();
  238 |     const atsSurface = await page.getByText(/\bATS\b/i).count();
  239 |     record(`stage2 review step ATS surfaces=${atsSurface}`);
  240 |     expect(atsSurface).toBeGreaterThan(0);
  241 | 
  242 |     record(`stage2 defects: console=${defects.consoleErrors.length} pageErrors=${defects.pageErrors.length} failedApi=${defects.failedApi.length}`);
  243 |     expectNoMaintenanceGuard(defects, 'stage2');
  244 | });
  245 | 
  246 | test('Stage 3 — Job Application: the real job inventory renders and the application modal opens with the 1-Click Quick Pitch toolbar', async ({ page }) => {
  247 |     const defects = watchForDefects(page);
  248 |     await bootCandidateSession(page);
  249 | 
  250 |     // Read the authoritative inventory first; the UI must agree with it.
  251 |     const inventory = await liveGet('/api/jobs-data');
  252 |     expect(inventory.status).toBe(200);
  253 |     const jobs = asArray(inventory.body, 'jobs');
  254 |     record(`stage3 live job inventory count=${jobs.length}`);
  255 |     expect(Array.isArray(jobs)).toBe(true);
  256 | 
  257 |     await page.goto(`${WEB_ORIGIN}/jobs`, { waitUntil: 'domcontentloaded' });
  258 |     await expect(page.locator('#root')).toBeAttached();
  259 | 
  260 |     const searchInput = page.locator('input[type="search"], input[placeholder*="earch" i]').first();
  261 |     await expect(searchInput).toBeVisible({ timeout: 30_000 });
  262 | 
  263 |     // Narrow to a real job title from the authoritative inventory so the search
  264 |     // assertion is grounded in data that actually exists.
  265 |     const sampleJob = jobs.find((job) => job && String(job.status || '').toLowerCase() === 'active' && job.title);
  266 |     if (sampleJob) {
  267 |         await searchInput.fill(String(sampleJob.title).slice(0, 24));
  268 |         record(`stage3 searched for live job "${String(sampleJob.title).slice(0, 40)}"`);
  269 |     }
  270 | 
  271 |     const applyButton = page.getByRole('button', { name: /apply now/i }).first();
```