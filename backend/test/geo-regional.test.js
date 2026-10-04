'use strict';

process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const sharp = require('sharp');
const MySQLRepository = require('../repositories/MySQLRepository');
const ResilientRepository = require('../repositories/ResilientRepository');
const { publicDiscoveryRouter } = require('../routes/publicDiscovery');
const {
    CANONICAL_CITIES,
    CANONICAL_STATES,
    buildLocationMatch,
    listCanonicalRegions,
    projectRegionLocation,
    resolveRegion,
    summarizeRegion,
} = require('../services/geoRegionalService');
const { createSocialPreviewSvg, renderSocialPreviewPng } = require('../services/socialPreview');
const { buildPublicSitemapXml } = require('../services/publicSitemap');

const sampleRegionJob = {
    id: 'job-live-42',
    title: 'Platform Engineer',
    company_name: 'Northwind Labs',
    location: 'Bengaluru, Karnataka, India',
    job_type: 'Full-time',
    workplace_type: 'Hybrid',
    salary_min: 1_800_000,
    salary_max: 2_400_000,
    salary_currency: 'INR',
    status: 'active',
    created_at: '2026-09-15T08:00:00.000Z',
};

function buildApp(repository) {
    const app = express();
    app.locals.publicDiscoveryRepositoryProvider = () => repository;
    app.use('/api/public', publicDiscoveryRouter);
    return app;
}

function enabledRepository(overrides = {}) {
    return {
        async getSetting(key) {
            if (key === 'public_config') return { geoSeo: { enableGeoSeo: true } };
            return null;
        },
        async getRegionalJobs() { return [sampleRegionJob]; },
        async getRegionalJobStats() {
            return {
                vacancyCount: 1,
                companyCount: 1,
                topCompanies: [{ name: 'Northwind Labs', openings: 1 }],
                salaryRanges: [{
                    currency: 'INR', unit: 'LPA', minAnnual: 1_800_000, maxAnnual: 2_400_000,
                    averageAnnual: 2_100_000, minLpa: 18, maxLpa: 24, averageLpa: 21,
                }],
            };
        },
        async getJob() { return null; },
        async getBlogPostBySlug() { return null; },
        ...overrides,
    };
}

test('DIR-024 region taxonomy is fixed, resolves aliases, and never derives a region from input text', () => {
    assert.equal(CANONICAL_CITIES.length, 6);
    assert.equal(CANONICAL_STATES.length, 5);
    assert.equal(resolveRegion('bengaluru').name, 'Bengaluru');
    assert.deepEqual(resolveRegion('bengaluru').aliases, ['bengaluru', 'bangalore']);
    assert.equal(resolveRegion('karnataka').kind, 'state');
    assert.deepEqual(projectRegionLocation('Bengaluru, Karnataka, India'), { region_city: 'bengaluru', region_state: 'karnataka' });
    assert.deepEqual(projectRegionLocation('Delhi, India'), { region_city: null, region_state: 'delhi' });
    assert.deepEqual(projectRegionLocation('Pune, Maharashtra, India'), { region_city: 'pune', region_state: 'maharashtra' });
    assert.equal(resolveRegion('unknown-city'), null);
    assert.equal(resolveRegion('bengaluru;drop-table'), null);
    const regions = listCanonicalRegions();
    assert.equal(regions.cities.length, 6);
    assert.equal(regions.states.length, 5);
});

test('DIR-024 location aliases become bound LIKE values and never SQL fragments', () => {
    const region = resolveRegion('delhi-ncr');
    const match = buildLocationMatch(region);
    assert.equal(match.binds.length, region.aliases.length);
    assert.match(match.predicate, /^\(LOWER\(j\.location\) LIKE \?(?: OR LOWER\(j\.location\) LIKE \?)+\)$/);
    assert.equal(match.predicate.includes('delhi'), false);
    assert.deepEqual(match.binds, region.aliases.map(alias => `%${alias}%`));
});

test('DIR-024 empty regions remain empty and salaries stay grouped by their recorded currency', () => {
    const bengaluru = resolveRegion('bengaluru');
    const empty = summarizeRegion(bengaluru, []);
    assert.equal(empty.vacancyCount, 0);
    assert.equal(empty.hasVacancies, false);
    assert.deepEqual(empty.salaryRanges, []);
    assert.deepEqual(empty.vacancies, []);
    assert.deepEqual(empty.topCompanies, []);

    const mixed = summarizeRegion(bengaluru, [
        { ...sampleRegionJob, salary_currency: 'INR', salary_min: 1_800_000, salary_max: 2_400_000 },
        { ...sampleRegionJob, id: 'job-live-43', salary_currency: 'USD', salary_min: 90_000, salary_max: 120_000 },
        { ...sampleRegionJob, id: 'job-live-44', salary_currency: '', salary_min: 70_000, salary_max: 100_000 },
    ]);
    assert.equal(mixed.vacancyCount, 3);
    assert.deepEqual(mixed.salaryRanges.map(range => range.currency), ['INR', 'USD']);
    assert.equal(mixed.salaryRanges.find(range => range.currency === 'INR').minLpa, 18);
    assert.equal(mixed.salaryRanges.find(range => range.currency === 'USD').minLpa, null);
    assert.equal(mixed.vacancies[2].salaryCurrency, null);
});

test('DIR-024 MariaDB query uses the indexed projection, active status, expiry and bounded parameters', async () => {
    const repository = new MySQLRepository();
    const calls = [];
    repository._getPool = () => ({
        async query(sql, params = []) {
            calls.push({ sql, params });
            if (sql === 'SELECT region_city FROM jobs LIMIT 0') return [[], []];
            return [[sampleRegionJob], []];
        },
    });

    const rows = await repository.getRegionalJobs({
        kind: 'city', slug: 'bengaluru', column: 'region_city', likeBinds: ['%bengaluru%', '%bangalore%'], limit: 999,
    });
    assert.equal(rows.length, 1);
    assert.equal(calls.length, 2);
    assert.match(calls[1].sql, /LOWER\(j\.status\) = 'active'/);
    assert.match(calls[1].sql, /j\.expires_at IS NULL OR j\.expires_at > CURRENT_TIMESTAMP/);
    assert.match(calls[1].sql, /j\.region_city = \?/);
    assert.match(calls[1].sql, /LIMIT \?/);
    assert.deepEqual(calls[1].params, ['bengaluru', 200]);
    assert.doesNotMatch(calls[1].sql, /description|company_logo/);
});

test('DIR-024 saveJob synchronizes post-migration regional projections and tolerates legacy schemas', async () => {
    const repository = new MySQLRepository();
    const calls = [];
    const connection = {
        async query(sql, params = []) {
            calls.push({ sql, params });
            if (sql.startsWith('SELECT employer_id, revision')) return [[], []];
            if (sql.startsWith('UPDATE jobs SET region_city')) return [{ affectedRows: 1 }, []];
            return [{ affectedRows: 1 }, []];
        },
    };
    repository._withTransaction = callback => callback(connection);
    await repository.saveJob('job-next', {
        employerId: 'employer-1', title: 'Engineer', location: 'Bengaluru, Karnataka, India',
    });
    const projectionWrite = calls.find(call => call.sql.startsWith('UPDATE jobs SET region_city'));
    assert.deepEqual(projectionWrite.params, ['bengaluru', 'karnataka', 'job-next', 'employer-1']);
    assert.equal(repository._regionalProjectionAvailable, true);

    const legacyRepository = new MySQLRepository();
    legacyRepository._withTransaction = callback => callback({
        async query(sql) {
            if (sql.startsWith('SELECT employer_id, revision')) return [[], []];
            if (sql.startsWith('UPDATE jobs SET region_city')) {
                throw Object.assign(new Error('unknown regional column'), { code: 'ER_BAD_FIELD_ERROR' });
            }
            return [{ affectedRows: 1 }, []];
        },
    });
    await assert.doesNotReject(legacyRepository.saveJob('job-old', {
        employerId: 'employer-1', title: 'Engineer', location: 'Bengaluru, India',
    }));
    assert.equal(legacyRepository._regionalProjectionAvailable, false);
});

test('DIR-024 falls back only for a missing projection and binds the complete alias set', async () => {
    const repository = new MySQLRepository();
    const calls = [];
    repository._getPool = () => ({
        async query(sql, params = []) {
            calls.push({ sql, params });
            if (sql === 'SELECT region_city FROM jobs LIMIT 0') {
                throw Object.assign(new Error('unknown region_city'), { code: 'ER_BAD_FIELD_ERROR' });
            }
            return [[sampleRegionJob], []];
        },
    });
    const region = resolveRegion('bengaluru');
    const { binds } = buildLocationMatch(region);
    const rows = await repository.getRegionalJobs({ slug: region.slug, column: 'region_city', likeBinds: binds, limit: 24 });
    assert.equal(rows.length, 1);
    assert.match(calls[1].sql, /LOWER\(j\.location\) LIKE \?/);
    assert.equal(calls[1].sql.includes('bengaluru'), false, 'operator text never appears in SQL');
    assert.deepEqual(calls[1].params, [...binds, 24]);
});

test('DIR-024 aggregate repository results are authoritative and currency-specific', async () => {
    const repository = new MySQLRepository();
    repository._regionalProjectionAvailable = true;
    const calls = [];
    repository._getPool = () => ({
        async query(sql, params = []) {
            calls.push({ sql, params });
            if (sql.includes('COUNT(*) AS vacancyCount')) return [[{ vacancyCount: '6', companyCount: '2' }], []];
            if (sql.includes('salary_values')) return [[
                { currency: 'INR', minAnnual: '1000000', maxAnnual: '2500000', averageAnnual: '1750000' },
                { currency: 'USD', minAnnual: '70000', maxAnnual: '120000', averageAnnual: '95000' },
            ], []];
            return [[{ name: 'Northwind Labs', openings: '4' }, { name: 'Blue Yonder', openings: '2' }], []];
        },
    });
    const stats = await repository.getRegionalJobStats({ slug: 'bengaluru', column: 'region_city', likeBinds: ['%bengaluru%'] });
    assert.equal(stats.vacancyCount, 6);
    assert.equal(stats.companyCount, 2);
    assert.deepEqual(stats.topCompanies.map(item => item.name), ['Northwind Labs', 'Blue Yonder']);
    assert.deepEqual(stats.salaryRanges.map(item => item.currency), ['INR', 'USD']);
    assert.equal(stats.salaryRanges[1].minLpa, null);
    assert.equal(calls.length, 3);
    assert.deepEqual(calls[1].params, ['bengaluru', 'bengaluru']);
});

test('DIR-024 resilient repository exposes regional reads as MariaDB read methods', async () => {
    const resilient = new ResilientRepository({
        mysqlRepo: {
            async getRegionalJobs() { return [sampleRegionJob]; },
            async getRegionalJobStats() { return { vacancyCount: 1 }; },
        },
    });
    assert.equal(typeof resilient.getRegionalJobs, 'function');
    assert.equal(typeof resilient.getRegionalJobStats, 'function');
    assert.equal((await resilient.getRegionalJobs({ slug: 'bengaluru' })).length, 1);
});

test('DIR-024 public region endpoints are opt-in, truthful and fail closed', async () => {
    const enabled = buildApp(enabledRepository());
    const index = await request(enabled).get('/api/public/geo/regions').expect(200);
    assert.equal(index.body.cities.length, 6);
    assert.equal(index.body.states.length, 5);

    const detail = await request(enabled).get('/api/public/geo/regions/city/bengaluru').expect(200);
    assert.equal(detail.body.region.vacancyCount, 1);
    assert.equal(detail.body.region.vacancies[0].id, 'job-live-42');
    assert.equal(detail.body.region.topCompanies[0].name, 'Northwind Labs');
    assert.equal(detail.body.region.salaryRanges[0].minLpa, 18);

    await request(enabled).get('/api/public/geo/regions/city/unknown-town').expect(404);
    await request(enabled).get('/api/public/geo/regions/city/bengaluru%3Bdrop%20table').expect(404);

    const disabled = buildApp(enabledRepository({
        async getSetting() { return { geoSeo: { enableGeoSeo: false } }; },
    }));
    await request(disabled).get('/api/public/geo/regions').expect(404);
    await request(disabled).get('/api/public/geo/regions/city/bengaluru').expect(404);

    const empty = buildApp(enabledRepository({
        async getRegionalJobs() { return []; },
        async getRegionalJobStats() { return { vacancyCount: 0, companyCount: 0, topCompanies: [], salaryRanges: [] }; },
    }));
    const emptyResponse = await request(empty).get('/api/public/geo/regions/city/pune').expect(200);
    assert.equal(emptyResponse.body.region.vacancyCount, 0);
    assert.equal(emptyResponse.body.region.hasVacancies, false);
    assert.deepEqual(emptyResponse.body.region.vacancies, []);
});

test('DIR-024 sitemap includes only enabled regional URLs with live active rows', async () => {
    const checked = [];
    const repository = {
        async getRegionalJobs({ slug, limit }) {
            checked.push(slug);
            assert.equal(limit, 1);
            return slug === 'bengaluru' || slug === 'karnataka' ? [sampleRegionJob] : [];
        },
    };
    const xml = await buildPublicSitemapXml({
        repository,
        geoSeoEnabled: true,
        canonicalOrigin: 'https://ime365.com/',
    });
    assert.match(xml, /<loc>https:\/\/ime365\.com\/jobs\/city\/bengaluru<\/loc>/);
    assert.match(xml, /<loc>https:\/\/ime365\.com\/jobs\/in\/karnataka<\/loc>/);
    assert.doesNotMatch(xml, /jobs\/(?:city\/(?:hyderabad|pune|mumbai|delhi-ncr|chennai)|in\/(?:telangana|maharashtra|delhi|tamil-nadu))/);
    assert.equal(checked.length, 11);

    const disabled = await buildPublicSitemapXml({
        repository,
        geoSeoEnabled: false,
        canonicalOrigin: 'https://ime365.com',
    });
    assert.doesNotMatch(disabled, /\/jobs\/(?:city|in)\//);
    await assert.rejects(buildPublicSitemapXml({ repository, geoSeoEnabled: true, canonicalOrigin: 'javascript:alert(1)' }), /canonical HTTPS origin/);
});

test('DIR-024 social cards escape user-supplied XML and render a real PNG preview', async () => {
    const svg = createSocialPreviewSvg({
        kind: 'Job opportunity',
        title: 'Engineer </text><script>alert(1)</script>',
        company: 'Northwind & Sons',
        detail: 'Hybrid · Bengaluru',
        salary: '₹18,00,000–₹24,00,000',
    });
    assert.doesNotMatch(svg, /<script>/);
    assert.match(svg, /&lt;script&gt;/);
    assert.match(svg, /Northwind &amp; Sons/);

    const png = await renderSocialPreviewPng({
        kind: 'Job opportunity', title: 'Platform Engineer', company: 'Northwind Labs',
        detail: 'Hybrid · Bengaluru, India', salary: '₹18,00,000–₹24,00,000',
    });
    const metadata = await sharp(png).metadata();
    assert.equal(metadata.format, 'png');
    assert.equal(metadata.width, 1200);
    assert.equal(metadata.height, 630);
});

test('DIR-024 share-preview endpoint hides non-public jobs and emits only a raster card for active jobs', async () => {
    const repository = enabledRepository({
        async getJob(id) {
            if (id === 'draft-7') return { ...sampleRegionJob, id, status: 'draft' };
            return { ...sampleRegionJob, company_logo: 'javascript:alert(1)' };
        },
    });
    const app = buildApp(repository);
    await request(app).get('/api/public/jobs/draft-7/og.png').expect(404);
    const response = await request(app).get('/api/public/jobs/job-live-42/og.png').expect(200);
    assert.match(response.headers['content-type'], /^image\/png/);
    assert.equal((await sharp(response.body).metadata()).width, 1200);
});
