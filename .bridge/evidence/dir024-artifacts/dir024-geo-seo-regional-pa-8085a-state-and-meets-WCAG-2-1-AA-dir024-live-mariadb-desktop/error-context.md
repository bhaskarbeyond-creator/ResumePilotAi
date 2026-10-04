# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dir024-geo-seo.spec.js >> regional page paints Cuba tokens immediately, renders honest empty state, and meets WCAG 2.1 AA
- Location: tests\e2e\dir024-geo-seo.spec.js:198:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - link "Skip to main content" [ref=e2] [cursor=pointer]:
    - /url: "#main-content"
  - generic [ref=e3]:
    - main [active] [ref=e4]:
      - main [ref=e5]:
        - generic [ref=e6]:
          - navigation "Breadcrumb" [ref=e7]:
            - list [ref=e8]:
              - listitem [ref=e9]:
                - link "Home" [ref=e10] [cursor=pointer]:
                  - /url: /
              - listitem [ref=e11]: /
              - listitem [ref=e12]:
                - link "Jobs" [ref=e13] [cursor=pointer]:
                  - /url: /jobs
              - listitem [ref=e14]: /
              - listitem [ref=e15]: Hyderabad
          - generic [ref=e16]:
            - paragraph [ref=e17]: India · Regional careers
            - heading "Technology jobs in Hyderabad" [level=1] [ref=e18]
            - paragraph [ref=e19]: Browse active job listings currently published for Hyderabad, Telangana. Counts, employer names and salary information below are derived from live listings; no example vacancies are inserted.
            - generic "Hyderabad job listing summary" [ref=e20]:
              - generic [ref=e21]: 0 active listings
              - generic [ref=e25]: 0 employers
          - status [ref=e29]:
            - heading "No active listings in Hyderabad right now" [level=2] [ref=e30]
            - paragraph [ref=e31]: The live job database currently has no published active vacancies matched to this city. This page will reflect actual listings as they are published.
            - link "Browse all jobs" [ref=e32] [cursor=pointer]:
              - /url: /jobs/portal
          - paragraph [ref=e33]: Regional pages use only active, unexpired public job records. Salary ranges are grouped by the currency recorded with each posting; no currency conversion or market-wide estimate is implied.
    - dialog [ref=e34]:
      - generic [ref=e35]:
        - generic [ref=e36]:
          - heading "Optional analytics" [level=2] [ref=e37]
          - paragraph [ref=e38]: We use cookies to improve your resume building experience and analyze website traffic.
          - paragraph [ref=e39]:
            - text: "Your choice is currently:"
            - strong [ref=e40]: pending
            - text: . Essential authentication and security storage are unaffected.
          - link "Privacy policy" [ref=e41] [cursor=pointer]:
            - /url: /p/privacy-policy
        - generic [ref=e42]:
          - button "Accept All Cookies" [ref=e43] [cursor=pointer]
          - button "Reject" [ref=e44] [cursor=pointer]
```

# Test source

```ts
  137 |     expect(new URL(jobImage).pathname).toBe(`/api/public/jobs/${encodeURIComponent(job.id)}/og.png`);
  138 | 
  139 |     const imageResponse = await request.get(`/api/public/jobs/${encodeURIComponent(job.id)}/og.png`);
  140 |     expect(imageResponse.status()).toBe(200);
  141 |     expect(imageResponse.headers()['content-type']).toMatch(/^image\/png/i);
  142 | 
  143 |     if (geoEnabled && config.geoSeo?.enableJobPostingSchema === true) {
  144 |         const postedAt = job.created_at || job.createdAt || job.postedAt || job.posted_at;
  145 |         const hasLocation = Boolean(job.location || /remote/i.test(String(job.workplace_type || job.workplaceType || job.workMode || '')));
  146 |         const isEligible = Boolean(
  147 |             job.title
  148 |             && job.description
  149 |             && (job.company_name || job.companyName || job.company)
  150 |             && Number.isFinite(new Date(postedAt).getTime())
  151 |             && hasLocation,
  152 |         );
  153 |         if (isEligible) {
  154 |             await page.waitForFunction(() => {
  155 |                 const text = document.getElementById('route-seo-structured-data')?.textContent;
  156 |                 if (!text) return false;
  157 |                 try { return JSON.parse(text); } catch { return false; }
  158 |             });
  159 |             const jobSchemas = JSON.parse(await page.locator('#route-seo-structured-data').textContent());
  160 |             const schemaList = Array.isArray(jobSchemas) ? jobSchemas : [jobSchemas];
  161 |             const jobPosting = schemaList.find(schema => schema?.['@type'] === 'JobPosting');
  162 |             expect(jobPosting).toBeTruthy();
  163 |             expect(jobPosting.title).toBeTruthy();
  164 |             expect(jobPosting.hiringOrganization?.name).toBeTruthy();
  165 |             expect(jobPosting.datePosted).toBeTruthy();
  166 |             expect(jobPosting.jobLocation || jobPosting.jobLocationType).toBeTruthy();
  167 |         }
  168 |     }
  169 | 
  170 |     const postsResponse = await request.get('/api/blog-data?publishedOnly=true&limit=50');
  171 |     expect(postsResponse.status()).toBe(200);
  172 |     const postsPayload = await postsResponse.json();
  173 |     const post = postsPayload.posts.find(candidate => (candidate?.published === true || Number(candidate?.published) === 1) && (candidate.slug || candidate.id));
  174 |     if (post) {
  175 |         const slug = post.slug || post.id;
  176 |         await page.goto(`/blog/${encodeURIComponent(slug)}`);
  177 |         await expect(page.getByRole('heading', { level: 1, name: post.title })).toBeVisible();
  178 |         await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index,follow');
  179 |         const articleCanonical = await page.locator('link[rel="canonical"]').getAttribute('href');
  180 |         expect(new URL(articleCanonical).pathname).toBe(`/blog/${encodeURIComponent(slug)}`);
  181 |         const articleImage = await page.locator('meta[property="og:image"]').getAttribute('content');
  182 |         expect(articleImage).toBeTruthy();
  183 |         const blogPreview = await request.get(`/api/public/blog/${encodeURIComponent(slug)}/og.png`);
  184 |         if (!post.featuredImage && !post.coverImage && !post.cover_image) {
  185 |             expect(blogPreview.status()).toBe(200);
  186 |             expect(blogPreview.headers()['content-type']).toMatch(/^image\/png/i);
  187 |         }
  188 |         const blogSchema = page.locator('#blog-post-structured-data');
  189 |         await expect(blogSchema).toBeAttached();
  190 |         const schema = JSON.parse(await blogSchema.textContent());
  191 |         expect(schema['@type']).toBe('BlogPosting');
  192 |         if (!post.publishedAt && !post.published_at && !post.createdAt && !post.created_at) {
  193 |             expect(Object.hasOwn(schema, 'datePublished')).toBe(false);
  194 |         }
  195 |     }
  196 | });
  197 | 
  198 | test('regional page paints Cuba tokens immediately, renders honest empty state, and meets WCAG 2.1 AA', async ({ page, request }) => {
  199 |     await page.emulateMedia({ colorScheme: 'light' });
  200 |     await page.addInitScript(() => {
  201 |         window.__dir024PaintSamples = [];
  202 |         const sample = () => {
  203 |             const main = document.querySelector('main');
  204 |             if (main) window.__dir024PaintSamples.push(getComputedStyle(main).backgroundColor);
  205 |             requestAnimationFrame(sample);
  206 |         };
  207 |         requestAnimationFrame(sample);
  208 |     });
  209 | 
  210 |     const config = await readMariaDbPublicConfig(request);
  211 |     expect(config.geoSeo?.enableGeoSeo).toBe(true);
  212 |     const indexResponse = await request.get('/api/public/geo/regions');
  213 |     expect(indexResponse.status()).toBe(200);
  214 |     const index = await indexResponse.json();
  215 |     const allRegions = [
  216 |         ...index.cities.map(region => ({ ...region, kind: 'city' })),
  217 |         ...index.states.map(region => ({ ...region, kind: 'state' })),
  218 |     ];
  219 |     const regionSnapshots = await Promise.all(allRegions.map(async region => ({
  220 |         ...region,
  221 |         detail: await readRegionalDetail(request, region.kind, region.slug),
  222 |     })));
  223 |     const emptyRegion = regionSnapshots.find(region => region.kind === 'city' && !region.detail.hasVacancies);
  224 |     expect(emptyRegion, 'at least one real city should verify the honest empty state').toBeTruthy();
  225 | 
  226 |     await page.goto(regionalPath(emptyRegion.kind, emptyRegion.slug));
  227 |     await expect(page.getByRole('heading', { level: 1 })).toContainText(`Technology jobs in ${emptyRegion.name}`);
  228 |     const detail = emptyRegion.detail;
  229 |     if (!detail.hasVacancies) {
  230 |         await expect(page.getByRole('heading', { name: `No active listings in ${emptyRegion.name} right now` })).toBeVisible();
  231 |         await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow');
  232 |         await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  233 |     }
  234 | 
  235 |     const paintSamples = await page.evaluate(() => window.__dir024PaintSamples || []);
  236 |     expect(paintSamples.length).toBeGreaterThan(0);
> 237 |     expect(paintSamples.every(color => color !== 'rgba(0, 0, 0, 0)')).toBe(true);
      |                                                                       ^ Error: expect(received).toBe(expected) // Object.is equality
  238 | 
  239 |     const contrast = await page.locator('main').evaluate(main => {
  240 |         const token = document.createElement('div');
  241 |         token.style.backgroundColor = 'var(--cuba-canvas)';
  242 |         document.body.appendChild(token);
  243 |         const tokenColor = getComputedStyle(token).backgroundColor;
  244 |         const pageColor = getComputedStyle(main).backgroundColor;
  245 |         token.remove();
  246 |         return { tokenColor, pageColor };
  247 |     });
  248 |     expect(contrast.pageColor).toBe(contrast.tokenColor);
  249 | 
  250 |     await page.setViewportSize({ width: 390, height: 844 });
  251 |     expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  252 | 
  253 |     const axe = await new AxeBuilder({ page })
  254 |         .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
  255 |         .analyze();
  256 |     expect(axe.violations, JSON.stringify(axe.violations.map(item => ({ id: item.id, nodes: item.nodes.length })), null, 2)).toEqual([]);
  257 | });
  258 | 
```