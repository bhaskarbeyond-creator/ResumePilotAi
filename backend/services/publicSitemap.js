'use strict';

const {
    buildLocationMatch,
    listCanonicalRegions,
    resolveRegion,
} = require('./geoRegionalService');

const STABLE_PUBLIC_PATHS = Object.freeze([
    '/',
    '/features',
    '/pricing',
    '/jobs',
    '/blog',
    '/portfolios',
    '/contact',
]);

function xmlEscape(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function normalizeSitemapOrigin(value) {
    try {
        const parsed = new URL(String(value || '').trim());
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash
            || (parsed.pathname && parsed.pathname !== '/')) return '';
        return parsed.origin;
    } catch {
        return '';
    }
}

async function getIndexableRegionalPaths(repository) {
    if (!repository || typeof repository.getRegionalJobs !== 'function') {
        throw Object.assign(new Error('Regional sitemap source is unavailable.'), { code: 'GEO_DATA_UNAVAILABLE' });
    }

    const { cities, states } = listCanonicalRegions();
    const regions = [...cities, ...states];
    const results = await Promise.all(regions.map(async ({ kind, slug }) => {
        const region = resolveRegion(slug);
        const column = kind === 'state' ? 'region_state' : 'region_city';
        const { binds: likeBinds } = buildLocationMatch(region);
        const rows = await repository.getRegionalJobs({
            kind,
            slug,
            column,
            likeBinds,
            limit: 1,
        });
        if (!Array.isArray(rows) || rows.length === 0) return null;
        return kind === 'state' ? `/jobs/in/${slug}` : `/jobs/city/${slug}`;
    }));
    return results.filter(Boolean);
}

async function buildPublicSitemapXml({ repository, geoSeoEnabled = false, canonicalOrigin }) {
    const origin = normalizeSitemapOrigin(canonicalOrigin);
    if (!origin) {
        throw Object.assign(new Error('A valid canonical HTTPS origin is required for the sitemap.'), { code: 'SITEMAP_ORIGIN_INVALID' });
    }

    const paths = [...STABLE_PUBLIC_PATHS];
    if (geoSeoEnabled === true) paths.push(...await getIndexableRegionalPaths(repository));

    const uniquePaths = [...new Set(paths)];
    const urls = uniquePaths.map(path => `  <url><loc>${xmlEscape(new URL(path, `${origin}/`).href)}</loc></url>`);
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

module.exports = {
    STABLE_PUBLIC_PATHS,
    buildPublicSitemapXml,
    getIndexableRegionalPaths,
    normalizeSitemapOrigin,
};
