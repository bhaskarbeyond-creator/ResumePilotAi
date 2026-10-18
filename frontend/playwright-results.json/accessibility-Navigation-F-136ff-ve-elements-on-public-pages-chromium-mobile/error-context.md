# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: accessibility.spec.ts >> Navigation & Focus Management >> Focus indicators visible on all interactive elements on public pages
- Location: tests\accessibility.spec.ts:319:3

# Error details

```
Error: expect(received).toBeGreaterThan(expected)

Expected: > 0
Received:   0
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e3]:
    - link "Skip to main content" [ref=e4]:
      - /url: "#main-content"
    - banner [ref=e5]:
      - navigation "Primary navigation" [ref=e6]:
        - link "IME365 Home" [ref=e7]:
          - /url: /
          - generic [ref=e8]: IM
          - generic [ref=e9]: IME365
        - generic [ref=e10]:
          - link "Features" [ref=e11]:
            - /url: /features
          - link "Pricing" [ref=e12]:
            - /url: /pricing
          - link "Blog" [ref=e13]:
            - /url: /blog
          - link "Jobs" [ref=e14]:
            - /url: /jobs
          - link "Contact" [ref=e15]:
            - /url: /contact
        - generic [ref=e16]:
          - link "Sign In" [ref=e17] [cursor=pointer]:
            - /url: /login
          - link "Get Started Free" [ref=e18] [cursor=pointer]:
            - /url: /login
    - main [ref=e19]:
      - generic [ref=e24]:
        - generic [ref=e25]: AI-Powered Career Platform
        - heading "Build Your Career with Confidence" [level=1] [ref=e28]
        - paragraph [ref=e29]: Create professional resumes, ace your interviews, and land your dream job. Powered by AI and trusted by thousands of professionals worldwide.
        - generic [ref=e30]:
          - link "Start Building Free" [ref=e31] [cursor=pointer]:
            - /url: /login
          - link "See All Features" [ref=e32] [cursor=pointer]:
            - /url: /features
        - generic [ref=e33]:
          - generic [ref=e34]: No credit card required
          - generic [ref=e38]: Enterprise security
          - generic [ref=e41]: Used in 50+ countries
    - region [ref=e45]:
      - generic [ref=e46]:
        - heading "Platform Statistics" [level=2] [ref=e47]
        - generic [ref=e48]:
          - generic [ref=e49]:
            - generic [ref=e50]: 50K+
            - generic [ref=e51]: Resumes Created
          - generic [ref=e52]:
            - generic [ref=e53]: "51"
            - generic [ref=e54]: Resume Templates
          - generic [ref=e55]:
            - generic [ref=e56]: 95%
            - generic [ref=e57]: ATS Pass Rate
          - generic [ref=e58]:
            - generic [ref=e59]: "4.9"
            - generic [ref=e60]: User Rating
    - region [ref=e61]:
      - generic [ref=e62]:
        - generic [ref=e63]:
          - heading "Everything you need to succeed" [level=2] [ref=e64]
          - paragraph [ref=e65]: A comprehensive platform that helps you at every stage of your career journey.
        - generic [ref=e66]:
          - article [ref=e67]:
            - heading "Professional Resume Builder" [level=3] [ref=e72]
            - paragraph [ref=e73]: Create stunning resumes with 51+ professionally designed templates. ATS-optimized and ready to impress.
          - article [ref=e74]:
            - heading "ATS Score Analysis" [level=3] [ref=e78]
            - paragraph [ref=e79]: Get instant feedback on how your resume performs against Applicant Tracking Systems used by top employers.
          - article [ref=e80]:
            - heading "AI Interview Coach" [level=3] [ref=e85]
            - paragraph [ref=e86]: Practice interviews with our AI-powered coach. Get real-time feedback and improve your performance.
          - article [ref=e87]:
            - heading "Smart Job Portal" [level=3] [ref=e92]
            - paragraph [ref=e93]: Discover matching opportunities, track applications, and manage your job search from one dashboard.
          - article [ref=e94]:
            - heading "AI-Powered Writing" [level=3] [ref=e99]
            - paragraph [ref=e100]: Let AI help you craft compelling summaries, work descriptions, and cover letters tailored to each role.
          - article [ref=e101]:
            - heading "Portfolio Builder" [level=3] [ref=e106]
            - paragraph [ref=e107]: Showcase your work with a professional portfolio. Share a public link with recruiters and hiring managers.
    - region [ref=e108]:
      - generic [ref=e109]:
        - generic [ref=e110]:
          - heading "Loved by professionals" [level=2] [ref=e111]
          - paragraph [ref=e112]: Join thousands of professionals who have accelerated their careers with IME365.
        - generic [ref=e113]:
          - article [ref=e114]:
            - generic "5 star rating" [ref=e115]
            - paragraph [ref=e126]: "\"The AI interview coach helped me prepare for my dream job. I felt so much more confident going into the interview.\""
            - generic [ref=e127]:
              - generic [ref=e128]: SK
              - generic [ref=e129]:
                - generic [ref=e130]: Sarah K.
                - generic [ref=e131]: Software Engineer
          - article [ref=e132]:
            - generic "5 star rating" [ref=e133]
            - paragraph [ref=e144]: "\"Built a professional resume in minutes. The ATS scoring feature helped me understand what recruiters look for.\""
            - generic [ref=e145]:
              - generic [ref=e146]: MR
              - generic [ref=e147]:
                - generic [ref=e148]: Michael R.
                - generic [ref=e149]: Product Manager
          - article [ref=e150]:
            - generic "5 star rating" [ref=e151]
            - paragraph [ref=e162]: "\"The portfolio builder and resume templates are stunning. I received more callbacks after switching to IME365.\""
            - generic [ref=e163]:
              - generic [ref=e164]: PS
              - generic [ref=e165]:
                - generic [ref=e166]: Priya S.
                - generic [ref=e167]: UX Designer
    - region [ref=e168]:
      - generic [ref=e174]:
        - heading "Ready to advance your career?" [level=2] [ref=e175]
        - paragraph [ref=e176]: Join thousands of professionals using IME365 to build better resumes, prepare for interviews, and land their dream jobs.
        - link "Get Started — It's Free" [ref=e178] [cursor=pointer]:
          - /url: /login
    - contentinfo [ref=e179]:
      - generic [ref=e180]:
        - generic [ref=e181]:
          - generic [ref=e182]:
            - link "IME365 Home" [ref=e183]:
              - /url: /
              - generic [ref=e184]: IM
              - generic [ref=e185]: IME365
            - paragraph [ref=e186]: AI-powered career platform helping professionals build resumes, prepare for interviews, and find jobs.
          - navigation "Product links" [ref=e187]:
            - heading "Product" [level=2] [ref=e188]
            - list [ref=e189]:
              - listitem [ref=e190]:
                - link "Features" [ref=e191]:
                  - /url: /features
              - listitem [ref=e192]:
                - link "Pricing" [ref=e193]:
                  - /url: /pricing
              - listitem [ref=e194]:
                - link "Templates" [ref=e195]:
                  - /url: /templates
              - listitem [ref=e196]:
                - link "Blog" [ref=e197]:
                  - /url: /blog
          - navigation "Resource links" [ref=e198]:
            - heading "Resources" [level=2] [ref=e199]
            - list [ref=e200]:
              - listitem [ref=e201]:
                - link "Jobs" [ref=e202]:
                  - /url: /jobs
              - listitem [ref=e203]:
                - link "Contact" [ref=e204]:
                  - /url: /contact
              - listitem [ref=e205]:
                - link "Portfolios" [ref=e206]:
                  - /url: /portfolios
          - navigation "Legal links" [ref=e207]:
            - heading "Legal" [level=2] [ref=e208]
            - list [ref=e209]:
              - listitem [ref=e210]:
                - link "Privacy Policy" [ref=e211]:
                  - /url: /p/privacy-policy
              - listitem [ref=e212]:
                - link "Terms of Service" [ref=e213]:
                  - /url: /p/terms-of-service
              - listitem [ref=e214]:
                - link "Cookie Policy" [ref=e215]:
                  - /url: /p/cookie-policy
        - generic [ref=e216]: © 2026 IME365 — Interview Made Easy. All rights reserved.
  - iframe [aria-hidden] [ref=e217]
```

# Test source

```ts
  238 |           }
  239 | 
  240 |           // Check main content area exists and is visible
  241 |           const mainContent = page.locator(surface.selector).first();
  242 |           await expect(mainContent).toBeVisible({ timeout: 10000 }).catch(() => {
  243 |             // May redirect to login - check if we're on auth page
  244 |           });
  245 | 
  246 |           // Verify no content is clipped
  247 |           const clippedElements = await page.evaluate(() => {
  248 |             const elements = document.querySelectorAll('*');
  249 |             return Array.from(elements).filter((el) => {
  250 |               const rect = el.getBoundingClientRect();
  251 |               const style = window.getComputedStyle(el);
  252 |               return rect.width > 0 && rect.height > 0 &&
  253 |                      (style.overflow === 'hidden' || style.overflowX === 'hidden') &&
  254 |                      (el.scrollWidth > rect.width || el.scrollHeight > rect.height);
  255 |             }).map((el) => el.tagName.toLowerCase());
  256 |           });
  257 | 
  258 |           if (clippedElements.length > 0) {
  259 |             console.warn(`⚠️ ${viewport.name} - ${surface.name} potentially clipped elements:`, clippedElements.slice(0, 10));
  260 |           }
  261 |         });
  262 |       }
  263 |     });
  264 |   }
  265 | });
  266 | 
  267 | test.describe('Navigation & Focus Management', () => {
  268 |   test.use({ viewport: { width: 1440, height: 900 } });
  269 | 
  270 |   test('Skip link exists and functions on all public pages', async ({ page }) => {
  271 |     for (const surface of SURFACES) {
  272 |       await page.goto(surface.path, { waitUntil: 'networkidle', timeout: 30000 });
  273 |       await page.waitForTimeout(500);
  274 | 
  275 |       const skipLink = page.locator('a[href="#main"], a[href="#main-content"], a[href="#content"], .skip-link').first();
  276 |       if (await skipLink.count() > 0) {
  277 |         await expect(skipLink).toBeVisible();
  278 |         await skipLink.focus();
  279 |         await expect(skipLink).toBeFocused();
  280 |         console.log(`✓ ${surface.name} has functional skip link`);
  281 |       } else {
  282 |         console.warn(`⚠️ ${surface.name} missing skip link`);
  283 |       }
  284 |     }
  285 |   });
  286 | 
  287 |   test('Skip link exists and functions on authenticated pages', async ({ page }) => {
  288 |     for (const surface of AUTH_SURFACES) {
  289 |       await setDemoAuth(page, surface.user);
  290 |       await page.goto(surface.path, { waitUntil: 'networkidle', timeout: 30000 });
  291 |       await page.waitForTimeout(1000);
  292 | 
  293 |       const skipLink = page.locator('a[href="#main"], a[href="#main-content"], a[href="#content"], .skip-link').first();
  294 |       if (await skipLink.count() > 0) {
  295 |         await expect(skipLink).toBeVisible();
  296 |         await skipLink.focus();
  297 |         await expect(skipLink).toBeFocused();
  298 |         console.log(`✓ ${surface.name} has functional skip link`);
  299 |       } else {
  300 |         console.warn(`⚠️ ${surface.name} missing skip link`);
  301 |       }
  302 |     }
  303 |   });
  304 | 
  305 |   test('Keyboard navigation works through interactive elements on authenticated pages', async ({ page }) => {
  306 |     await setDemoAuth(page, DEMO_USER);
  307 |     await page.goto('/dashboard', { waitUntil: 'networkidle', timeout: 30000 });
  308 |     await page.waitForTimeout(1000);
  309 | 
  310 |     // Tab through first 10 focusable elements
  311 |     for (let i = 0; i < 10; i++) {
  312 |       await page.keyboard.press('Tab');
  313 |       await page.waitForTimeout(100);
  314 |       const focused = await page.evaluate(() => document.activeElement?.tagName.toLowerCase());
  315 |       console.log(`Tab ${i + 1}: focused ${focused}`);
  316 |     }
  317 |   });
  318 | 
  319 |   test('Focus indicators visible on all interactive elements on public pages', async ({ page }) => {
  320 |     await page.goto('/', { waitUntil: 'networkidle', timeout: 30000 });
  321 |     await page.waitForTimeout(500);
  322 | 
  323 |     const focusableCount = await page.evaluate(() => {
  324 |       const elements = document.querySelectorAll('button, a, input, select, textarea, [tabindex]:not([tabindex="-1"])');
  325 |       let hasFocusStyles = 0;
  326 |       elements.forEach((el) => {
  327 |         if (el.getBoundingClientRect().width > 0) {
  328 |           const style = window.getComputedStyle(el, ':focus-visible');
  329 |           if (style.outline !== 'none' || style.boxShadow.includes('focus') || style.borderColor !== '') {
  330 |             hasFocusStyles++;
  331 |           }
  332 |         }
  333 |       });
  334 |       return { total: elements.length, withFocusStyles: hasFocusStyles };
  335 |     });
  336 | 
  337 |     console.log(`Focus styles: ${focusableCount.withFocusStyles}/${focusableCount.total} elements`);
> 338 |     expect(focusableCount.withFocusStyles).toBeGreaterThan(0);
      |                                            ^ Error: expect(received).toBeGreaterThan(expected)
  339 |   });
  340 | });
  341 | 
  342 | test.describe('Color Contrast Verification (WCAG 2.1 AA)', () => {
  343 |   test.use({ viewport: { width: 1440, height: 900 } });
  344 | 
  345 |   for (const surface of SURFACES) {
  346 |     test(`${surface.name} - color contrast scan (AA)`, async ({ page }) => {
  347 |       await page.goto(surface.path, { waitUntil: 'networkidle', timeout: 30000 });
  348 |       await page.waitForTimeout(500);
  349 | 
  350 |       // Use wcag2aa and wcag21aa tags which only check AA-level contrast (not AAA enhanced)
  351 |       const results = await new AxeBuilder({ page })
  352 |         .withTags(['wcag2aa', 'wcag21aa'])
  353 |         .analyze();
  354 | 
  355 |       const contrastViolations = results.violations.filter((v) =>
  356 |         v.id.includes('color-contrast')
  357 |       );
  358 | 
  359 |       if (contrastViolations.length > 0) {
  360 |         console.log(`\n${surface.name} Color Contrast Violations (AA):`);
  361 |         contrastViolations.forEach((v) => {
  362 |           console.log(`  - ${v.id} (${v.impact}): ${v.description}`);
  363 |         });
  364 |       }
  365 | 
  366 |       expect(contrastViolations.length).toBe(0);
  367 |     });
  368 |   }
  369 | });
  370 | 
  371 | test.describe('ARIA & Semantic Structure', () => {
  372 |   test.use({ viewport: { width: 1440, height: 900 } });
  373 | 
  374 |   for (const surface of SURFACES) {
  375 |     test(`${surface.name} - ARIA landmarks and semantic structure`, async ({ page }) => {
  376 |       await page.goto(surface.path, { waitUntil: 'networkidle', timeout: 30000 });
  377 |       await page.waitForTimeout(500);
  378 | 
  379 |       const structure = await page.evaluate(() => {
  380 |         return {
  381 |           landmarks: Array.from(document.querySelectorAll('[role="main"], [role="navigation"], [role="banner"], [role="contentinfo"], [role="search"], [role="complementary"], main, nav, header, footer, aside')).map((el) => ({
  382 |             tag: el.tagName.toLowerCase(),
  383 |             role: el.getAttribute('role'),
  384 |             ariaLabel: el.getAttribute('aria-label') || '',
  385 |           })),
  386 |           headings: Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).map((el) => ({
  387 |             level: el.tagName.toLowerCase(),
  388 |             text: el.textContent?.trim().slice(0, 80) || '',
  389 |           })),
  390 |           images: Array.from(document.querySelectorAll('img')).map((el) => ({
  391 |             alt: el.getAttribute('alt') || '',
  392 |             src: el.getAttribute('src')?.slice(0, 50) || '',
  393 |           })),
  394 |         };
  395 |       });
  396 | 
  397 |       console.log(`\n${surface.name} Structure:`);
  398 |       console.log('  Landmarks:', structure.landmarks.length);
  399 |       console.log('  Headings:', structure.headings.length);
  400 |       console.log('  Images:', structure.images.length);
  401 |       console.log('  Images without alt:', structure.images.filter((i) => !i.alt).length);
  402 | 
  403 |       // Verify at least one main landmark
  404 |       const hasMain = structure.landmarks.some((l) => l.role === 'main' || l.tag === 'main');
  405 |       if (!hasMain) {
  406 |         console.warn(`⚠️ ${surface.name} missing main landmark`);
  407 |       }
  408 | 
  409 |       // Verify heading hierarchy
  410 |       const h1Count = structure.headings.filter((h) => h.level === 'h1').length;
  411 |       if (h1Count === 0) {
  412 |         console.warn(`⚠️ ${surface.name} missing h1`);
  413 |       } else if (h1Count > 1) {
  414 |         console.warn(`⚠️ ${surface.name} has ${h1Count} h1 elements`);
  415 |       }
  416 |     });
  417 |   }
  418 | });
```