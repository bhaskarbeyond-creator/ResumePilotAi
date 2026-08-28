'use strict';

const UNSUPPORTED_PUBLIC_CLAIM = /(?:#\s*1\b|number\s+one\b|top[- ]rated\b|\bbest\b|\bguarantee(?:d|s)?\b|\b(?:pass|success)\s+rate\b|\bland\s+(?:your|a)\b|\bget\s+hired\b|\d(?:[.,]\d+)?\s*\/\s*5\b|\baggregate\s+rating\b|\b\d[\d,.]*\+?\s+(?:users?|professionals?|resumes?|jobs?)\b)/iu;

function normalizeLlmDiscoverySettings(value = {}) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const enabled = source.enableLlmGeo === true;
    const content = String(source.llmsTxtContent || '').replace(/\r\n?/g, '\n').trim();
    if (content.length > 20_000 || /[\u0000\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(content)) {
        throw Object.assign(new Error('The llms.txt document contains unsupported content.'), {
            status: 400, code: 'LLMS_CONTENT_INVALID',
        });
    }
    if (enabled && content.length < 40) {
        throw Object.assign(new Error('Publishing llms.txt requires a meaningful factual document.'), {
            status: 400, code: 'LLMS_CONTENT_REQUIRED',
        });
    }
    if (UNSUPPORTED_PUBLIC_CLAIM.test(content)) {
        throw Object.assign(new Error('Rankings, ratings, social-proof counts, and outcome promises require a separately governed evidence workflow and cannot be published in llms.txt.'), {
            status: 400, code: 'LLMS_UNSUPPORTED_CLAIM',
        });
    }
    return { enableLlmGeo: enabled, llmsTxtContent: content };
}

module.exports = { normalizeLlmDiscoverySettings, UNSUPPORTED_PUBLIC_CLAIM };
