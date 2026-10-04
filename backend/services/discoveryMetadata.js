'use strict';

// DIR-024 Blocker 2 ruling: this guard is PRESERVED STRICTLY INTACT. It is the
// single source of truth that keeps rankings, ratings, social-proof counts and
// outcome promises out of every published LLM discovery document. DIR-024 adds
// a second document (/llms-full.txt) and a Geo-SEO normalizer beside it; neither
// weakens, bypasses, or re-scopes this expression.
const UNSUPPORTED_PUBLIC_CLAIM = /(?:#\s*1\b|number\s+one\b|top[- ]rated\b|\bbest\b|\bguarantee(?:d|s)?\b|\b(?:pass|success)\s+rate\b|\bland\s+(?:your|a)\b|\bget\s+hired\b|\d(?:[.,]\d+)?\s*\/\s*5\b|\baggregate\s+rating\b|\b\d[\d,.]*\+?\s+(?:users?|professionals?|resumes?|jobs?)\b)/iu;

function normalizeMarkdownDocument(value = {}) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const enabled = source.enableLlmGeo === true;
    const content = String(source.llmsTxtContent || '').replace(/\r\n?/g, '\n').trim();
    // DIR-024 AC-3: /llms-full.txt is governed by the SAME enableLlmGeo switch so
    // an operator can never publish the verbose companion document while the
    // concise index is disabled. Each document carries its own normalised field
    // and its own validity gate, and both pass through the identical guard.
    const fullContent = String(source.llmsFullTxtContent || '').replace(/\r\n?/g, '\n').trim();
    if (content.length > 20_000 || /[\u0000\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(content)) {
        throw Object.assign(new Error('The llms.txt document contains unsupported content.'), {
            status: 400, code: 'LLMS_CONTENT_INVALID',
        });
    }
    if (fullContent.length > 60_000 || /[\u0000\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(fullContent)) {
        throw Object.assign(new Error('The llms-full.txt document contains unsupported content.'), {
            status: 400, code: 'LLMS_FULL_CONTENT_INVALID',
        });
    }
    if (enabled && content.length < 40) {
        throw Object.assign(new Error('Publishing llms.txt requires a meaningful factual document.'), {
            status: 400, code: 'LLMS_CONTENT_REQUIRED',
        });
    }
    // The verbose companion is optional: publishing /llms.txt alone stays valid,
    // but a short /llms-full.txt draft is a configuration error rather than a
    // silently truncated document.
    if (enabled && fullContent && fullContent.length < 40) {
        throw Object.assign(new Error('Publishing llms-full.txt requires a meaningful factual document.'), {
            status: 400, code: 'LLMS_FULL_CONTENT_REQUIRED',
        });
    }
    if (UNSUPPORTED_PUBLIC_CLAIM.test(content)) {
        throw Object.assign(new Error('Rankings, ratings, social-proof counts, and outcome promises require a separately governed evidence workflow and cannot be published in llms.txt.'), {
            status: 400, code: 'LLMS_UNSUPPORTED_CLAIM',
        });
    }
    if (UNSUPPORTED_PUBLIC_CLAIM.test(fullContent)) {
        throw Object.assign(new Error('Rankings, ratings, social-proof counts, and outcome promises require a separately governed evidence workflow and cannot be published in llms-full.txt.'), {
            status: 400, code: 'LLMS_FULL_UNSUPPORTED_CLAIM',
        });
    }
    return { enableLlmGeo: enabled, llmsTxtContent: content, llmsFullTxtContent: fullContent };
}

// Retained name: the admin settings route, the /llms.txt route and the
// /llms-full.txt route all funnel through this one normalizer so the persisted
// shape and the served shape can never drift.
function normalizeLlmDiscoverySettings(value = {}) {
    return normalizeMarkdownDocument(value);
}

// DIR-024 step 2: normalizeGeoSeoSettings applies the SAME strict field
// allow-list discipline to the Indian Geo-SEO category that the LLM discovery
// category already uses. Without it, geoSeo is stored through
// normalizeAdminSettingValue, which preserves arbitrary operator keys — so a
// typo silently persists a dead field that no consumer reads, and a hostile key
// could smuggle non-canonical metadata into the public surface. The published
// GEO-SEO surface is exactly these eight fields and nothing else.
const GEO_SEO_ALLOWED_FIELDS = Object.freeze([
    'enableGeoSeo', 'targetRegion', 'targetCity', 'targetCountry',
    'metaKeywords', 'canonicalUrl', 'enableJobPostingSchema', 'enableOrganizationSchema',
]);

function normalizeGeoSeoSettings(value = {}) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const text = (input, maximum) => String(input || '').replace(/[\u0000-\u001F\u007F]/gu, ' ').trim().slice(0, maximum);
    const keywords = text(source.metaKeywords, 500);
    let canonicalUrl = text(source.canonicalUrl, 300);
    if (canonicalUrl) {
        try {
            const parsed = new URL(canonicalUrl);
            // Only absolute HTTPS origins may be advertised as canonical; a
            // relative or javascript: value would poison the sitemap and the
            // JSON-LD `url` fields that consume this setting.
            if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || (parsed.pathname && parsed.pathname !== '/')) canonicalUrl = '';
        } catch {
            canonicalUrl = '';
        }
    }
    return {
        enableGeoSeo: source.enableGeoSeo === true,
        targetRegion: text(source.targetRegion, 8).toUpperCase(),
        targetCity: text(source.targetCity, 120),
        targetCountry: text(source.targetCountry, 120),
        metaKeywords: keywords,
        canonicalUrl,
        enableJobPostingSchema: source.enableJobPostingSchema === true,
        enableOrganizationSchema: source.enableOrganizationSchema === true,
    };
}

module.exports = {
    normalizeLlmDiscoverySettings,
    normalizeMarkdownDocument,
    normalizeGeoSeoSettings,
    GEO_SEO_ALLOWED_FIELDS,
    UNSUPPORTED_PUBLIC_CLAIM,
};
