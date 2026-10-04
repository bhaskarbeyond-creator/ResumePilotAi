# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dir017diag.spec.js >> dir017 diagnostics #3
- Location: tests\e2e\dir017diag.spec.js:25:1

# Error details

```
Test timeout of 420000ms exceeded.
```

```
Error: page.waitForTimeout: Target page, context or browser has been closed
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - link "Skip to main content" [ref=e2] [cursor=pointer]:
    - /url: "#main-content"
  - main [ref=e4]:
    - generic [ref=e6]:
      - link "Skip to main content" [ref=e7] [cursor=pointer]:
        - /url: "#cuba-main-content"
      - generic [ref=e8]:
        - button "Collapse sidebar" [ref=e9] [cursor=pointer]
        - navigation "Breadcrumb" [ref=e13]:
          - list [ref=e14]:
            - listitem [ref=e15]:
              - generic [ref=e16]: Candidate Workspace
            - listitem [ref=e18]:
              - generic [ref=e19]: Master Profile Data
        - button "Search or run a command" [ref=e24] [cursor=pointer]:
          - generic [ref=e29]:
            - generic [ref=e30]: "Keyboard shortcut:"
            - text: Ctrl K
        - generic [ref=e31]:
          - generic "The availability check could not be completed, so no claim is made." [ref=e32]:
            - generic [ref=e34]: ✦
            - generic [ref=e35]: AI Engine Status Unknown
            - generic [ref=e36]: . The availability check could not be completed, so no claim is made.
          - button "Notifications, 8 unread" [ref=e38] [cursor=pointer]:
            - generic [ref=e42]: "8"
          - button "Account menu for Bhaskar Beyond (Super Admin)" [ref=e44] [cursor=pointer]:
            - generic [ref=e45]: BB
            - generic [ref=e48]: Bhaskar Beyond (Super Admin)
      - generic [ref=e52]:
        - complementary [ref=e53]:
          - link "✦ IME365 AI Executive Suite" [ref=e55] [cursor=pointer]:
            - /url: /dashboard
            - generic [ref=e56]: ✦
            - generic [ref=e57]:
              - generic [ref=e58]:
                - generic [ref=e59]: IME365
                - generic [ref=e60]: AI
              - generic [ref=e61]: Executive Suite
          - button "Candidate Suite" [ref=e64] [cursor=pointer]
          - navigation "Candidate workspace navigation" [ref=e74]:
            - generic [ref=e75]:
              - heading "Workspace" [level=2] [ref=e76]
              - list [ref=e77]:
                - listitem [ref=e78]:
                  - link "Overview" [ref=e79] [cursor=pointer]:
                    - /url: /dashboard
                - listitem [ref=e86]:
                  - link "Resumes & Master CV" [ref=e87] [cursor=pointer]:
                    - /url: /build-resume
                - listitem [ref=e92]:
                  - link "Cover Letters" [ref=e93] [cursor=pointer]:
                    - /url: /dashboard/cover-letters
                - listitem [ref=e98]:
                  - link "Portfolios & Web CV" [ref=e99] [cursor=pointer]:
                    - /url: /dashboard/portfolios
                - listitem [ref=e106]:
                  - link "Saved Favorites & Bookmarks" [ref=e107] [cursor=pointer]:
                    - /url: /dashboard/favorites
            - generic [ref=e114]:
              - heading "Job Intelligence" [level=2] [ref=e115]
              - list [ref=e116]:
                - listitem [ref=e117]:
                  - link "Browse Job Portal" [ref=e118] [cursor=pointer]:
                    - /url: /dashboard/jobs
                - listitem [ref=e123]:
                  - link "Job Tracker" [ref=e124] [cursor=pointer]:
                    - /url: /dashboard/job-tracker
                - listitem [ref=e127]:
                  - link "Submitted Applications" [ref=e128] [cursor=pointer]:
                    - /url: /dashboard/applied-jobs
                - listitem [ref=e133]:
                  - link "AI Interview Coach" [ref=e134] [cursor=pointer]:
                    - /url: /dashboard/interview
                - listitem [ref=e139]:
                  - link "Messages & Chat" [ref=e140] [cursor=pointer]:
                    - /url: /dashboard/messages
            - generic [ref=e144]:
              - heading "Account & Security" [level=2] [ref=e145]
              - list [ref=e146]:
                - listitem [ref=e147]:
                  - link "Subscription & Plans" [ref=e148] [cursor=pointer]:
                    - /url: /dashboard/plans
                - listitem [ref=e153]:
                  - link "Master Profile Data" [ref=e154] [cursor=pointer]:
                    - /url: /dashboard/settings?tab=Profile
                - listitem [ref=e159]:
                  - link "Security & 2FA Hub" [ref=e160] [cursor=pointer]:
                    - /url: /dashboard/settings?tab=Security
                - listitem [ref=e164]:
                  - link "Help Desk & Support" [ref=e165] [cursor=pointer]:
                    - /url: /dashboard/support
        - main [ref=e175]:
          - generic [ref=e180]:
            - generic [ref=e182]:
              - generic [ref=e183]:
                - generic [ref=e184]:
                  - generic [ref=e185]:
                    - img "Profile avatar" [ref=e187]
                    - generic "Email verified" [ref=e188]
                  - generic [ref=e191]: Premium
                - generic [ref=e193]:
                  - generic [ref=e194]:
                    - heading "Bhaskardir017dir017 Beyond (Super Admin)" [level=1] [ref=e195]
                    - generic [ref=e196]: 75% Profile Strength
                  - paragraph [ref=e199]: Recruiter
                  - paragraph [ref=e200]: bhaskar.beyond@gmail.com
              - generic [ref=e201]:
                - generic [ref=e202]:
                  - button "Master Profile" [ref=e203] [cursor=pointer]
                  - button "Account & Security" [ref=e207] [cursor=pointer]
                - button "Expand View" [ref=e211] [cursor=pointer]
            - generic [ref=e213]:
              - navigation "Master Profile Steps Stepper" [ref=e214]:
                - button "Scroll steps left" [ref=e215] [cursor=pointer]
                - tablist "Profile Sections" [ref=e218]:
                  - tab "✓ Basic & Contact" [selected] [ref=e219] [cursor=pointer]:
                    - generic [ref=e220]: ✓
                    - generic [ref=e221]: Basic & Contact
                  - tab "2 Work History" [ref=e222] [cursor=pointer]:
                    - generic [ref=e223]: "2"
                    - generic [ref=e224]: Work History
                  - tab "3 Education" [ref=e225] [cursor=pointer]:
                    - generic [ref=e226]: "3"
                    - generic [ref=e227]: Education
                  - tab "4 Skills" [ref=e228] [cursor=pointer]:
                    - generic [ref=e229]: "4"
                    - generic [ref=e230]: Skills
                  - tab "✓ Certifications 6" [ref=e231] [cursor=pointer]:
                    - generic [ref=e232]: ✓
                    - generic [ref=e233]: Certifications
                    - generic [ref=e234]: "6"
                  - tab "6 Projects" [ref=e235] [cursor=pointer]:
                    - generic [ref=e236]: "6"
                    - generic [ref=e237]: Projects
                  - tab "✓ Languages 3" [ref=e238] [cursor=pointer]:
                    - generic [ref=e239]: ✓
                    - generic [ref=e240]: Languages
                    - generic [ref=e241]: "3"
                  - tab "8 Hobbies" [ref=e242] [cursor=pointer]:
                    - generic [ref=e243]: "8"
                    - generic [ref=e244]: Hobbies
                  - tab "9 Honors & Awards" [ref=e245] [cursor=pointer]:
                    - generic [ref=e246]: "9"
                    - generic [ref=e247]: Honors & Awards
                  - tab "✓ References 1" [ref=e248] [cursor=pointer]:
                    - generic [ref=e249]: ✓
                    - generic [ref=e250]: References
                    - generic [ref=e251]: "1"
                  - tab "✓ Custom Modules 1" [ref=e252] [cursor=pointer]:
                    - generic [ref=e253]: ✓
                    - generic [ref=e254]: Custom Modules
                    - generic [ref=e255]: "1"
                  - tab "✓ Executive Bio ✓" [ref=e256] [cursor=pointer]:
                    - generic [ref=e257]: ✓
                    - generic [ref=e258]: Executive Bio
                    - generic [ref=e259]: ✓
                - button "Scroll steps right" [ref=e260] [cursor=pointer]
                - generic [ref=e263]:
                  - 'generic "Profile Save: saved" [ref=e264]': Saved
                  - button "6 of 12 complete · 50%" [ref=e267] [cursor=pointer]:
                    - generic [ref=e269]: 6 of 12 complete
                    - generic [ref=e270]: ·
                    - generic [ref=e271]: 50%
              - generic [ref=e276]:
                - generic [ref=e277]:
                  - generic [ref=e279]:
                    - generic [ref=e280]:
                      - generic "Step 1 of 12" [ref=e281]
                      - generic [ref=e284]:
                        - generic [ref=e285]:
                          - heading "Personal Details & Contact" [level=1] [ref=e286]
                          - generic [ref=e287]: Core Identity
                          - generic [ref=e288]: Complete
                        - paragraph [ref=e289]: Your core identity, headline, and direct contact channels used across all resume templates.
                    - button "Hide Guide" [ref=e291] [cursor=pointer]
                  - generic [ref=e293]:
                    - generic [ref=e294]:
                      - generic [ref=e296]:
                        - generic [ref=e298]:
                          - generic [ref=e299]: Profile Photo
                          - generic [ref=e300]:
                            - img "Avatar" [ref=e301]
                            - generic [ref=e302]:
                              - button "Crop & Adjust Photo" [ref=e303] [cursor=pointer]
                              - generic "Change photo" [ref=e306] [cursor=pointer]:
                                - button [ref=e307]
                        - generic [ref=e310]:
                          - generic [ref=e311]:
                            - generic [ref=e312]:
                              - generic [ref=e313]:
                                - generic [ref=e314]: First Name
                                - generic [ref=e315]: "*"
                              - textbox "Your first name" [ref=e316]: Bhaskardir017dir017
                            - generic [ref=e317]:
                              - generic [ref=e318]:
                                - generic [ref=e319]: Last Name
                                - generic [ref=e320]: "*"
                              - textbox "Your last name" [ref=e321]: Beyond (Super Admin)
                          - generic [ref=e323]:
                            - generic [ref=e324]: Target Professional Title / Occupation
                            - generic [ref=e325]:
                              - textbox "Target Professional Title / Occupation" [ref=e326]:
                                - /placeholder: e.g. Senior Full Stack Engineer
                                - text: Recruiter
                              - button "Show suggestions" [ref=e328] [cursor=pointer]
                      - generic [ref=e331]:
                        - generic [ref=e332]:
                          - generic [ref=e333]:
                            - generic [ref=e334]:
                              - generic [ref=e335]: Email Address (Identity)*
                              - button "Managed in Account" [ref=e336] [cursor=pointer]:
                                - generic [ref=e338]: →
                            - textbox [disabled]: bhaskar.beyond@gmail.com
                          - generic [ref=e339]:
                            - generic [ref=e340]:
                              - generic [ref=e341]: Phone Number
                              - generic [ref=e342]: "*"
                            - textbox "With country code, e.g. +91 98765 43210" [ref=e343]: "+918555035068"
                        - generic [ref=e344]:
                          - generic [ref=e346]:
                            - generic [ref=e347]: City & State
                            - generic [ref=e348]:
                              - textbox "City & State" [ref=e349]:
                                - /placeholder: City, State
                                - text: Visakhapatnam, Andhra Pradesh
                              - button "Show suggestions" [ref=e351] [cursor=pointer]
                          - generic [ref=e354]:
                            - generic [ref=e355]:
                              - generic [ref=e356]: Country
                              - generic [ref=e357]: optional
                            - textbox "Country (e.g. India)" [ref=e358]: India
                      - generic [ref=e359]:
                        - generic [ref=e360]:
                          - generic [ref=e361]:
                            - generic [ref=e362]:
                              - generic [ref=e363]: Street Address
                              - generic [ref=e364]: optional
                            - textbox "Street address" [ref=e365]: North Extension, Balayya Sastri Layout
                          - generic [ref=e366]:
                            - generic [ref=e367]:
                              - generic [ref=e368]: Postal Code
                              - generic [ref=e369]: optional
                            - textbox "PIN / postal code" [ref=e370]: "530013"
                        - generic [ref=e371]:
                          - generic [ref=e372]:
                            - generic [ref=e373]:
                              - generic [ref=e376]: LinkedIn Profile URL
                              - generic [ref=e377]: optional
                            - textbox "https://linkedin.com/in/username" [ref=e378]
                          - generic [ref=e379]:
                            - generic [ref=e380]:
                              - generic [ref=e383]: GitHub / Portfolio URL
                              - generic [ref=e384]: optional
                            - textbox "https://github.com/username" [ref=e385]
                        - generic [ref=e386]:
                          - generic [ref=e387]:
                            - generic [ref=e390]: Personal Website / Portfolio URL
                            - generic [ref=e391]: optional
                          - textbox "https://yourwebsite.com" [ref=e392]
                    - generic [ref=e395]:
                      - button "Save" [ref=e396] [cursor=pointer]
                      - button "Save & Next → Work History" [ref=e400] [cursor=pointer]
                - complementary "Master Profile Guide" [ref=e404]:
                  - generic [ref=e405]:
                    - generic [ref=e406]:
                      - heading "GUIDE" [level=2] [ref=e407]
                      - generic [ref=e408]: Ready
                    - generic [ref=e411]:
                      - heading "What the ATS check says" [level=3] [ref=e412]
                      - list [ref=e413]:
                        - listitem [ref=e414]:
                          - generic [ref=e416]: Include target role in your headline / title
                        - listitem [ref=e417]:
                          - generic [ref=e419]: Use standard international phone format (+1 / +44 etc.)
                        - listitem [ref=e420]:
                          - generic [ref=e422]: Ensure contact email matches your professional profile
                    - generic [ref=e423]:
                      - generic [ref=e424]: Optimized for screening ✓
                      - paragraph [ref=e428]: All essential fields and formatting checks for this section are satisfied.
                  - generic [ref=e429]:
                    - generic [ref=e430]:
                      - generic [ref=e431]: Master Sync Active
                      - generic [ref=e434]: Single Source
                    - paragraph [ref=e435]:
                      - text: Data saved here automatically synchronizes across all
                      - strong [ref=e436]: 51 AI Resume Templates
                      - text: ", Cover Letters, and Portfolio."
                    - button "Build / Edit Resumes" [ref=e437] [cursor=pointer]
                  - generic [ref=e441]:
                    - generic [ref=e442]: Sovereign Storage
                    - paragraph [ref=e446]: Protected with AES-256 GCM encryption at rest and in transit. Private, isolated by account, and GDPR compliant.
```

# Test source

```ts
  1   | ﻿// @ts-check
  2   | /**
  3   |  * DIR-017 diagnostic probe #3 - read-only ground truth for the 3 red stages.
  4   |  *
  5   |  * REPLACES the truncated probe #2, which ended in an unterminated
  6   |  * `// PLACEHOLDER_COLLECT` token and could never have run. No /api/* route is
  7   |  * intercepted, mocked or fulfilled: everything observed is live backend + MariaDB.
  8   |  *
  9   |  *   Q1 (stage 2) typing + blur produced ZERO POST /api/users-data/profile.
  10  |  *      Is the autosave effect suppressed (isFirstProfileLoadRef /
  11  |  *      skipNextAutosaveRef), latched off by PROFILE_CONFLICT, short-circuited
  12  |  *      by profileFitsPersistenceLimit, or is the edit not reaching React state?
  13  |  */
  14  | import { test } from '@playwright/test';
  15  | import path from 'node:path';
  16  | import dotenv from 'dotenv';
  17  | import { mintFirebaseSession } from './dir006-session.mjs';
  18  | 
  19  | dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });
  20  | dotenv.config({ path: path.join(process.cwd(), 'backend', '.env'), quiet: true });
  21  | 
  22  | const EMAIL = process.env.DIR017_EMAIL || process.env.ADMIN_EMAIL || process.env.DIR006_EMAIL;
  23  | const SESSION = EMAIL ? await mintFirebaseSession({ email: EMAIL }) : null;
  24  | 
  25  | test('dir017 diagnostics #3', async ({ page }) => {
  26  |     test.setTimeout(420_000);
  27  | 
  28  |     await page.addInitScript(({ uid, email, token, refreshToken, apiKey }) => {
  29  |         localStorage.setItem(`firebase:authUser:${apiKey}:[DEFAULT]`, JSON.stringify({
  30  |             uid, email, emailVerified: true, isAnonymous: false,
  31  |             stsTokenManager: { apiKey, refreshToken, accessToken: token, expirationTime: Date.now() + 3_600_000 },
  32  |             createdAt: String(Date.now()), lastLoginAt: String(Date.now()),
  33  |             apiKey, appName: '[DEFAULT]',
  34  |         }));
  35  |         localStorage.setItem('user', uid);
  36  |         localStorage.setItem('ime365_cuba_shell_v2', 'cuba');
  37  |     }, {
  38  |         uid: SESSION.uid, email: SESSION.email,
  39  |         token: SESSION.idToken, refreshToken: SESSION.refreshToken, apiKey: SESSION.apiKey,
  40  |     });
  41  | 
  42  |     const traffic = [];
  43  |     const problems = [];
  44  |     page.on('request', (r) => {
  45  |         const u = new URL(r.url());
  46  |         if (u.pathname.startsWith('/api/')) traffic.push(`${r.method()} ${u.pathname}`);
  47  |     });
  48  |     page.on('console', (m) => { if (m.type() === 'error') problems.push(`[console] ${m.text()}`.slice(0, 200)); });
  49  |     page.on('pageerror', (e) => problems.push(`[pageerror] ${String(e.message || e)}`.slice(0, 200)));
  50  |     page.on('response', async (r) => {
  51  |         if (!/users-data/.test(r.url()) || r.status() < 400) return;
  52  |         const body = await r.text().catch(() => '');
  53  |         problems.push(`[http ${r.status()}] ${r.request().method()} ${new URL(r.url()).pathname} :: ${body.slice(0, 250)}`);
  54  |     });
  55  | 
  56  |     // ===================== Q1: profile autosave round-trip =====================
  57  |     console.log('==== Q1 profile autosave ====');
  58  |     await page.goto('/dashboard/settings?tab=Profile', { waitUntil: 'domcontentloaded' });
  59  |     const firstname = page.locator('input[name="firstname"]');
  60  |     await firstname.waitFor({ timeout: 60_000 });
  61  |     await page.waitForTimeout(5000);
  62  | 
  63  |     const original = await firstname.inputValue();
  64  |     console.log('Q1 hydrated firstname =', JSON.stringify(original));
  65  |     console.log('Q1 traffic on mount   =', JSON.stringify(traffic));
  66  |     console.log('Q1 conflict banner   =', await page.getByText(/Discard local changes and load latest/i).count());
  67  | 
  68  |     const marker = `${(original || 'ime').slice(0, 24)}dir017`;
  69  |     const before = traffic.length;
  70  |     await firstname.fill(marker);
  71  |     await firstname.blur();
  72  |     for (const wait of [2500, 4000, 6000]) {
> 73  |         await page.waitForTimeout(wait);
      |                    ^ Error: page.waitForTimeout: Target page, context or browser has been closed
  74  |         console.log(`Q1 traffic +${wait}ms =`, JSON.stringify(traffic.slice(before)));
  75  |         console.log('Q1 conflict banner now =', await page.getByText(/Discard local changes and load latest/i).count());
  76  |         console.log('Q1 save region =', JSON.stringify(
  77  |             (await page.locator('text=/Profile save:/i').first().innerText().catch(() => '(not rendered)')).trim(),
  78  |         ));
  79  |     }
  80  | 
  81  |     await page.reload({ waitUntil: 'domcontentloaded' });
  82  |     await firstname.waitFor({ timeout: 60_000 });
  83  |     console.log('Q1 firstname after reload =', JSON.stringify(await firstname.inputValue()), '| marker was', JSON.stringify(marker));
  84  | 
  85  |     // Restore the shared row exactly as found.
  86  |     await firstname.fill(original);
  87  |     await firstname.blur();
  88  |     await page.waitForTimeout(9000);
  89  |     await page.reload({ waitUntil: 'domcontentloaded' });
  90  |     await firstname.waitFor({ timeout: 60_000 });
  91  |     console.log('Q1 firstname restored =', JSON.stringify(await firstname.inputValue()));
  92  | 
  93  |     console.log('Q1-PROBLEMS', JSON.stringify(problems, null, 2));
  94  | // ============ Q2: contrast offenders, re-measured with ONE correct transfer ============
  95  |     // The stage-6 auditor parses oklch() to LINEAR sRGB and then hands those
  96  |     // linear bytes to a luminance function that applies the sRGB->linear
  97  |     // transfer AGAIN. That double-gamma is why oklch(0.554 0.046 257.417)
  98  |     // measured 1.39 against #0d0f16 instead of its true ~4.6. Here oklch is
  99  |     // ENCODED to sRGB bytes so parse() returns the same kind of value rgb()
  100 |     // already returns, and luminance() applies the transfer exactly once.
  101 |     console.log('==== Q2 contrast (corrected transfer) ====');
  102 |     await page.goto('/dashboard/settings?tab=Account', { waitUntil: 'domcontentloaded' });
  103 |     await page.getByRole('heading', { name: 'Account Credentials & Security' }).waitFor({ timeout: 60_000 });
  104 | 
  105 |     const offenders = await page.evaluate(() => {
  106 |         const toLinear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  107 |         const toSrgb = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
  108 | 
  109 |         const oklchToSrgb = (L, C, hDeg) => {
  110 |             const h = (hDeg * Math.PI) / 180;
  111 |             const a = C * Math.cos(h);
  112 |             const b = C * Math.sin(h);
  113 |             const l3 = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  114 |             const m3 = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  115 |             const s3 = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  116 |             const enc = (x) => Math.round(255 * toSrgb(Math.min(1, Math.max(0, x))));
  117 |             return {
  118 |                 r: enc(4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3),
  119 |                 g: enc(-1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3),
  120 |                 b: enc(-0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3),
  121 |                 a: 1,
  122 |             };
  123 |         };
  124 | 
  125 |         const parse = (value) => {
  126 |             if (!value) return null;
  127 |             const rgb = value.match(/rgba?\(([^)]+)\)/);
  128 |             if (rgb) {
  129 |                 const p = rgb[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  130 |                 return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  131 |             }
  132 |             const ok = value.match(/oklch\(([^)]+)\)/);
  133 |             if (ok) {
  134 |                 const [L, C, h] = ok[1].split(/[\s/]+/).map(Number);
  135 |                 if ([L, C, h].every(Number.isFinite)) return oklchToSrgb(L, C, h);
  136 |             }
  137 |             return null;
  138 |         };
  139 | 
  140 |         const luminance = ({ r, g, b }) => (
  141 |             0.2126 * toLinear(r / 255) + 0.7152 * toLinear(g / 255) + 0.0722 * toLinear(b / 255)
  142 |         );
  143 |         const ratio = (f, b) => {
  144 |             const a = luminance(f), c = luminance(b);
  145 |             const [hi, lo] = a > c ? [a, c] : [c, a];
  146 |             return (hi + 0.05) / (lo + 0.05);
  147 |         };
  148 | 
  149 |         const stopsOf = (value) => {
  150 |             if (!value || !/gradient/.test(value)) return [];
  151 |             const out = [];
  152 |             for (const m of value.matchAll(/(?:rgba?\([^)]+\)|oklch\([^)]+\)|#[0-9a-f]{6}|[\w-]+)\s+([\d.]+)%/gi)) {
  153 |                 const token = m[0].replace(/\s+[\d.]+%$/, '').trim();
  154 |                 const hex = token.match(/^#([0-9a-f]{6})$/i);
  155 |                 const n = hex ? parseInt(hex[1], 16) : null;
  156 |                 const c = parse(token) || (n !== null
  157 |                     ? { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 }
  158 |                     : null);
  159 |                 if (c) out.push({ ...c, at: Number(m[1]) / 100 });
  160 |             }
  161 |             return out;
  162 |         };
  163 | 
  164 |         const effectiveBg = (el) => {
  165 |             let node = el;
  166 |             while (node && node !== document.documentElement) {
  167 |                 const cs = getComputedStyle(node);
  168 |                 const stops = stopsOf(cs.backgroundImage);
  169 |                 if (stops.length) return stops.map((s) => ({ ...s, fromGradient: true }));
  170 |                 const bg = parse(cs.backgroundColor);
  171 |                 if (bg && bg.a > 0.95) return [{ ...bg, fromGradient: false }];
  172 |                 node = node.parentElement;
  173 |             }
```