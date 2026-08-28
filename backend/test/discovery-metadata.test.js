'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeLlmDiscoverySettings } = require('../services/discoveryMetadata');

const factualDocument = '# ResumePilot AI\nBrowser-based tools for editing and exporting resumes and cover letters.';

test('LLM discovery publication is default-off and retains only its canonical fields', () => {
    assert.deepEqual(normalizeLlmDiscoverySettings(), { enableLlmGeo: false, llmsTxtContent: '' });
    assert.deepEqual(normalizeLlmDiscoverySettings({
        enableLlmGeo: false,
        llmsTxtContent: '  factual draft  ',
        allowGptBot: true,
        llmCitationPrompt: 'retired duplicate field',
    }), { enableLlmGeo: false, llmsTxtContent: 'factual draft' });
});

test('LLM discovery publication requires meaningful content', () => {
    assert.throws(
        () => normalizeLlmDiscoverySettings({ enableLlmGeo: true, llmsTxtContent: '# Short' }),
        error => error.code === 'LLMS_CONTENT_REQUIRED' && error.status === 400
    );
    assert.deepEqual(
        normalizeLlmDiscoverySettings({ enableLlmGeo: true, llmsTxtContent: factualDocument }),
        { enableLlmGeo: true, llmsTxtContent: factualDocument }
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
});
