import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const EXPECTED_CITIES = ['bengaluru', 'hyderabad', 'pune', 'mumbai', 'delhi-ncr', 'chennai'];
const EXPECTED_STATES = ['karnataka', 'telangana', 'maharashtra', 'delhi', 'tamil-nadu'];

async function readMariaDbPublicConfig(request) {
    const response = await request.get('/api/platform/public-config');
    expect(response.status(), 'public configuration must come from the live backend').toBe(200);
    const config = await response.json();
    expect(config._settingsSource, 'a static or cached test config is not valid DIR-024 evidence').toBe('mariadb');
    return config;
}

async function readRegionalDetail(request, kind, slug) {
    const routeKind = kind === 'state' ? 'in' : 'city';
    const response = await request.get(`/api/public/geo/regions/${routeKind}/${encodeURIComponent(slug)}`);
    expect(response.status(), `${kind}/${slug} must be read from the live regional repository`).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    return payload.region;
}

function regionalPath(kind, slug) {
    return kind === 'state' ? `/jobs/in/${slug}` : `/jobs/city/${slug}`;
}

function hasJsonLdType(value, expectedType) {
    const schemas = Array.isArray(value) ? value : [value];
    return schemas.some(schema => schema?.['@type'] === expectedType);
}

test('live regional routes expose real records and the sitemap excludes empty or disabled hubs', async ({ request }) => {
    const config = await readMariaDbPublicConfig(request);
    expect(config.geoSeo?.enableGeoSeo, 'regional discovery must be explicitly published in MariaDB').toBe(true);

    const indexResponse = await request.get('/api/public/geo/regions');
    expect(indexResponse.status()).toBe(200);
    const index = await indexResponse.json();
    expect(index.cities.map(region => region.slug)).toEqual(EXPECTED_CITIES);
    expect(index.states.map(region => region.slug)).toEqual(EXPECTED_STATES);

    const sitemapResponse = await request.get('/sitemap.xml');
    expect(sitemapResponse.status(), 'sitemap must be served by the backend route').toBe(200);
    expect(sitemapResponse.headers()['content-type']).toMatch(/application\/xml/i);
    const sitemap = await sitemapResponse.text();
    expect(sitemap).toContain('<urlset');
    for (const path of ['/', '/features', '/pricing', '/jobs', '/blog', '/portfolios', '/contact']) {
        expect(sitemap).toContain(path === '/' ? '<loc>' : path);
    }

    const regions = [
        ...index.cities.map(region => ({ ...region, kind: 'city' })),
        ...index.states.map(region => ({ ...region, kind: 'state' })),
    ];
    const data = [];
    for (const region of regions) {
        const detail = await readRegionalDetail(request, region.kind, region.slug);
        expect(Number.isInteger(detail.vacancyCount)).toBe(true);
        expect(detail.vacancyCount).toBeGreaterThanOrEqual(detail.vacancies.length);
        expect(detail.vacancies.length).toBeLessThanOrEqual(24);
        expect(detail.hasVacancies).toBe(detail.vacancyCount > 0);
        expect(new Set(detail.salaryRanges.map(range => range.currency)).size).toBe(detail.salaryRanges.length);
        for (const range of detail.salaryRanges) expect(range.currency).toMatch(/^[A-Z]{3}$/);

        const path = regionalPath(region.kind, region.slug);
        expect(sitemap.includes(path), `${path} sitemap membership must reflect live non-empty data`).toBe(detail.hasVacancies);
        data.push({ ...region, ...detail });
    }

    expect(data.some(region => region.hasVacancies), 'the authoritative database should contain at least one published regional listing').toBe(true);
    expect(data.some(region => !region.hasVacancies), 'empty regional hubs must be verified without synthetic vacancies').toBe(true);
});

test('LLM discovery documents are published from MariaDB and the concise endpoint meets its warm-response budget', async ({ request }) => {
    const config = await readMariaDbPublicConfig(request);
    expect(config.llmGeo?.enableLlmGeo, 'LLM discovery must be enabled through MariaDB settings').toBe(true);

    const conciseResponse = await request.get('/llms.txt');
    expect(conciseResponse.status()).toBe(200);
    expect(conciseResponse.headers()['content-type']).toMatch(/text\/plain/i);
    const concise = (await conciseResponse.text()).trim();
    expect(concise.length).toBeGreaterThanOrEqual(40);
    expect(concise).toBe(String(config.llmGeo.llmsTxtContent || '').trim());

    const fullResponse = await request.get('/llms-full.txt');
    expect(fullResponse.status()).toBe(200);
    expect(fullResponse.headers()['content-type']).toMatch(/text\/plain/i);
    const full = (await fullResponse.text()).trim();
    expect(full.length).toBeGreaterThanOrEqual(40);
    expect(full).toBe(String(config.llmGeo.llmsFullTxtContent || '').trim());

    const warmTimings = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const startedAt = performance.now();
        const response = await request.get('/llms.txt');
        warmTimings.push(performance.now() - startedAt);
        expect(response.status()).toBe(200);
    }
    const worstWarmMs = Math.max(...warmTimings);
    console.log(`DIR-024 /llms.txt warm response max: ${worstWarmMs.toFixed(2)}ms`);
    expect(worstWarmMs, 'warm backend /llms.txt response should remain below 50ms').toBeLessThan(50);
});

test('regional, homepage, job, and article browser metadata reflects live content', async ({ page, request }) => {
    const config = await readMariaDbPublicConfig(request);
    const geoEnabled = config.geoSeo?.enableGeoSeo === true;

    await page.goto('/');
    await page.waitForFunction(() => {
        const script = document.getElementById('route-seo-structured-data');
        if (!script?.textContent) return false;
        try { return JSON.parse(script.textContent); } catch { return false; }
    });
    const homepageSchemas = JSON.parse(await page.locator('#route-seo-structured-data').textContent());
    if (geoEnabled && config.geoSeo?.enableOrganizationSchema === true) {
        expect(hasJsonLdType(homepageSchemas, 'Organization')).toBe(true);
    }
    expect(hasJsonLdType(homepageSchemas, 'FAQPage')).toBe(geoEnabled);
    const homepageCanonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(homepageCanonical).toBeTruthy();

    const jobsResponse = await request.get('/api/jobs-data?limit=50');
    expect(jobsResponse.status()).toBe(200);
    const jobsPayload = await jobsResponse.json();
    const listedJob = jobsPayload.jobs.find(candidate => candidate?.id && String(candidate.status).toLowerCase() === 'active');
    expect(listedJob, 'job detail metadata must be exercised with a real active database row').toBeTruthy();
    const detailResponse = await request.get(`/api/jobs-data/${encodeURIComponent(listedJob.id)}`);
    expect(detailResponse.status()).toBe(200);
    const job = (await detailResponse.json()).job;

    await page.goto(`/jobs/portal/${encodeURIComponent(job.id)}`);
    await page.waitForFunction(() => Boolean(document.querySelector('link[rel="canonical"]')?.getAttribute('href')));
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(new URL(canonical).pathname).toBe(`/jobs/portal/${encodeURIComponent(job.id)}`);
    const jobImage = await page.locator('meta[property="og:image"]').getAttribute('content');
    expect(new URL(jobImage).pathname).toBe(`/api/public/jobs/${encodeURIComponent(job.id)}/og.png`);

    const imageResponse = await request.get(`/api/public/jobs/${encodeURIComponent(job.id)}/og.png`);
    expect(imageResponse.status()).toBe(200);
    expect(imageResponse.headers()['content-type']).toMatch(/^image\/png/i);

    if (geoEnabled && config.geoSeo?.enableJobPostingSchema === true) {
        const postedAt = job.created_at || job.createdAt || job.postedAt || job.posted_at;
        const hasLocation = Boolean(job.location || /remote/i.test(String(job.workplace_type || job.workplaceType || job.workMode || '')));
        const isEligible = Boolean(
            job.title
            && job.description
            && (job.company_name || job.companyName || job.company)
            && Number.isFinite(new Date(postedAt).getTime())
            && hasLocation,
        );
        if (isEligible) {
            await page.waitForFunction(() => {
                const text = document.getElementById('route-seo-structured-data')?.textContent;
                if (!text) return false;
                try { return JSON.parse(text); } catch { return false; }
            });
            const jobSchemas = JSON.parse(await page.locator('#route-seo-structured-data').textContent());
            const schemaList = Array.isArray(jobSchemas) ? jobSchemas : [jobSchemas];
            const jobPosting = schemaList.find(schema => schema?.['@type'] === 'JobPosting');
            expect(jobPosting).toBeTruthy();
            expect(jobPosting.title).toBeTruthy();
            expect(jobPosting.hiringOrganization?.name).toBeTruthy();
            expect(jobPosting.datePosted).toBeTruthy();
            expect(jobPosting.jobLocation || jobPosting.jobLocationType).toBeTruthy();
        }
    }

    const postsResponse = await request.get('/api/blog-data?publishedOnly=true&limit=50');
    expect(postsResponse.status()).toBe(200);
    const postsPayload = await postsResponse.json();
    const post = postsPayload.posts.find(candidate => (candidate?.published === true || Number(candidate?.published) === 1) && (candidate.slug || candidate.id));
    if (post) {
        const slug = post.slug || post.id;
        await page.goto(`/blog/${encodeURIComponent(slug)}`);
        await expect(page.getByRole('heading', { level: 1, name: post.title })).toBeVisible();
        await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index,follow');
        const articleCanonical = await page.locator('link[rel="canonical"]').getAttribute('href');
        expect(new URL(articleCanonical).pathname).toBe(`/blog/${encodeURIComponent(slug)}`);
        const articleImage = await page.locator('meta[property="og:image"]').getAttribute('content');
        expect(articleImage).toBeTruthy();
        const blogPreview = await request.get(`/api/public/blog/${encodeURIComponent(slug)}/og.png`);
        if (!post.featuredImage && !post.coverImage && !post.cover_image) {
            expect(blogPreview.status()).toBe(200);
            expect(blogPreview.headers()['content-type']).toMatch(/^image\/png/i);
        }
        const blogSchema = page.locator('#blog-post-structured-data');
        await expect(blogSchema).toBeAttached();
        const schema = JSON.parse(await blogSchema.textContent());
        expect(schema['@type']).toBe('BlogPosting');
        if (!post.publishedAt && !post.published_at && !post.createdAt && !post.created_at) {
            expect(Object.hasOwn(schema, 'datePublished')).toBe(false);
        }
    }
});

test('regional page paints Cuba tokens immediately, renders honest empty state, and meets WCAG 2.1 AA', async ({ page, request }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.addInitScript(() => {
        window.__dir024PaintSamples = [];
        const sample = () => {
            const main = document.querySelector('main');
            if (main) window.__dir024PaintSamples.push(getComputedStyle(main).backgroundColor);
            requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
    });

    const config = await readMariaDbPublicConfig(request);
    expect(config.geoSeo?.enableGeoSeo).toBe(true);
    const indexResponse = await request.get('/api/public/geo/regions');
    expect(indexResponse.status()).toBe(200);
    const index = await indexResponse.json();
    const allRegions = [
        ...index.cities.map(region => ({ ...region, kind: 'city' })),
        ...index.states.map(region => ({ ...region, kind: 'state' })),
    ];
    const regionSnapshots = await Promise.all(allRegions.map(async region => ({
        ...region,
        detail: await readRegionalDetail(request, region.kind, region.slug),
    })));
    const emptyRegion = regionSnapshots.find(region => region.kind === 'city' && !region.detail.hasVacancies);
    expect(emptyRegion, 'at least one real city should verify the honest empty state').toBeTruthy();

    await page.goto(regionalPath(emptyRegion.kind, emptyRegion.slug));
    await expect(page.getByRole('heading', { level: 1 })).toContainText(`Technology jobs in ${emptyRegion.name}`);
    const detail = emptyRegion.detail;
    if (!detail.hasVacancies) {
        await expect(page.getByRole('heading', { name: `No active listings in ${emptyRegion.name} right now` })).toBeVisible();
        await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow');
        await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
    }

    const paintSamples = await page.evaluate(() => window.__dir024PaintSamples || []);
    expect(paintSamples.length).toBeGreaterThan(0);
    expect(paintSamples.every(color => color !== 'rgba(0, 0, 0, 0)')).toBe(true);

    const contrast = await page.locator('main').evaluate(main => {
        const token = document.createElement('div');
        token.style.backgroundColor = 'var(--cuba-canvas)';
        document.body.appendChild(token);
        const tokenColor = getComputedStyle(token).backgroundColor;
        const pageColor = getComputedStyle(main).backgroundColor;
        token.remove();
        return { tokenColor, pageColor };
    });
    expect(contrast.pageColor).toBe(contrast.tokenColor);

    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

    const axe = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
    expect(axe.violations, JSON.stringify(axe.violations.map(item => ({ id: item.id, nodes: item.nodes.length })), null, 2)).toEqual([]);
});
