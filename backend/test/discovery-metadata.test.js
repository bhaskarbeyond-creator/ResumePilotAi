'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { normalizeLlmDiscoverySettings, normalizeGeoSeoSettings, GEO_SEO_ALLOWED_FIELDS } = require('../services/discoveryMetadata');

const factualDocument = '# ResumePilot AI\nBrowser-based tools for editing and exporting resumes and cover letters.';

test('LLM discovery publication is default-off and retains only its canonical fields', () => {
    assert.deepEqual(normalizeLlmDiscoverySettings(), { enableLlmGeo: false, llmsTxtContent: '', llmsFullTxtContent: '' });
    assert.deepEqual(normalizeLlmDiscoverySettings({
        enableLlmGeo: false,
        llmsTxtContent: '  factual draft  ',
        llmsFullTxtContent: '  extended factual draft  ',
        allowGptBot: true,
        llmCitationPrompt: 'retired duplicate field',
    }), { enableLlmGeo: false, llmsTxtContent: 'factual draft', llmsFullTxtContent: 'extended factual draft' });
});

test('LLM discovery publication requires meaningful concise content and accepts an optional full document', () => {
    assert.throws(
        () => normalizeLlmDiscoverySettings({ enableLlmGeo: true, llmsTxtContent: '# Short' }),
        error => error.code === 'LLMS_CONTENT_REQUIRED' && error.status === 400
    );
    assert.deepEqual(
        normalizeLlmDiscoverySettings({ enableLlmGeo: true, llmsTxtContent: factualDocument }),
        { enableLlmGeo: true, llmsTxtContent: factualDocument, llmsFullTxtContent: '' }
    );
    assert.deepEqual(
        normalizeLlmDiscoverySettings({
            enableLlmGeo: true,
            llmsTxtContent: factualDocument,
            llmsFullTxtContent: `${factualDocument}\n\n## Data handling\nIdentity is verified through Firebase Authentication.`,
        }).llmsFullTxtContent,
        `${factualDocument}\n\n## Data handling\nIdentity is verified through Firebase Authentication.`
    );
    assert.throws(
        () => normalizeLlmDiscoverySettings({ enableLlmGeo: true, llmsTxtContent: factualDocument, llmsFullTxtContent: 'too short' }),
        error => error.code === 'LLMS_FULL_CONTENT_REQUIRED' && error.status === 400
    );
});

test('LLM discovery rejects unsupported rankings, ratings, social proof, and outcomes', () => {
    const claims = [
        'The #1 resume builder for candidates.',
        'The top-rated resume builder.',
        'Rated 4.9/5 by customers.',
        'Trusted by 50,000 professionals.',
        'A 98% pass rate for applicants.',
        'Guaranteed to get hired quickly.',
        'Use this tool to land your dream role.',
    ];
    for (const claim of claims) {
        assert.throws(
            () => normalizeLlmDiscoverySettings({ enableLlmGeo: false, llmsTxtContent: claim }),
            error => error.code === 'LLMS_UNSUPPORTED_CLAIM' && error.status === 400,
            claim
        );
    }
});

test('LLM discovery normalizes line endings and rejects controls or oversized payloads', () => {
    assert.equal(
        normalizeLlmDiscoverySettings({ llmsTxtContent: 'first\r\nsecond\rthird' }).llmsTxtContent,
        'first\nsecond\nthird'
    );
    assert.throws(
        () => normalizeLlmDiscoverySettings({ llmsTxtContent: 'bad\u0000value' }),
        error => error.code === 'LLMS_CONTENT_INVALID'
    );
    assert.throws(
        () => normalizeLlmDiscoverySettings({ llmsTxtContent: 'x'.repeat(20_001) }),
        error => error.code === 'LLMS_CONTENT_INVALID'
    );
    assert.throws(
        () => normalizeLlmDiscoverySettings({ llmsFullTxtContent: 'x'.repeat(60_001) }),
        error => error.code === 'LLMS_FULL_CONTENT_INVALID'
    );
});

test('DIR-024 default crawler documents pass the same strict publication guard', () => {
    const migration = readFileSync(require.resolve('../database/migrations/023_llms_default_documents.sql'), 'utf8');
    const blocks = [...migration.matchAll(/THEN CONCAT\(([\s\S]*?)\n\s*\)\s*\n\s*ELSE/g)].map(match => match[1]);
    assert.equal(blocks.length, 2);
    const documents = blocks.map(block => [...block.matchAll(/'((?:''|[^'])*)'|CHAR\(10\)/g)]
        .map(match => match[1] === undefined ? '\n' : match[1].replace(/''/g, "'"))
        .join(''));
    const [concise, full] = documents;
    const normalized = normalizeLlmDiscoverySettings({
        enableLlmGeo: true,
        llmsTxtContent: concise,
        llmsFullTxtContent: full,
    });
    assert.equal(normalized.llmsTxtContent, concise);
    assert.equal(normalized.llmsFullTxtContent, full);
    assert.match(concise, /active, unexpired job records/);
    assert.match(full, /no example vacancies are inserted/);
});

test('Geo-SEO normalizer is default-off, allow-listed, and only emits safe canonical URLs', () => {
    assert.deepEqual(normalizeGeoSeoSettings(), {
        enableGeoSeo: false,
        targetRegion: '',
        targetCity: '',
        targetCountry: '',
        metaKeywords: '',
        canonicalUrl: '',
        enableJobPostingSchema: false,
        enableOrganizationSchema: false,
    });
    const normalized = normalizeGeoSeoSettings({
        enableGeoSeo: true,
        targetRegion: ' in ',
        targetCity: 'Bengaluru',
        targetCountry: 'India',
        metaKeywords: 'software jobs, technology jobs',
        canonicalUrl: 'https://careers.example.in/',
        enableJobPostingSchema: true,
        enableOrganizationSchema: true,
        unapproved: 'dropped',
    });
    assert.deepEqual(Object.keys(normalized).sort(), [...GEO_SEO_ALLOWED_FIELDS].sort());
    assert.equal(normalized.targetRegion, 'IN');
    assert.equal(normalized.canonicalUrl, 'https://careers.example.in/');
    assert.equal(Object.hasOwn(normalized, 'unapproved'), false);
    assert.equal(normalizeGeoSeoSettings({ canonicalUrl: 'javascript:alert(1)' }).canonicalUrl, '');
    assert.equal(normalizeGeoSeoSettings({ canonicalUrl: 'http://example.com' }).canonicalUrl, '');
    assert.equal(normalizeGeoSeoSettings({ canonicalUrl: 'https://example.com/jobs' }).canonicalUrl, '');
});
