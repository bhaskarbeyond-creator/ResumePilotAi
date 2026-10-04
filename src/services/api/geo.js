const CACHE_TTL_MS = 15_000;
const regionCache = new Map();
const requestCache = new Map();

export function clearGeoCache() {
    regionCache.clear();
    requestCache.clear();
}

if (typeof window !== 'undefined') {
    window.addEventListener('systemSettingsUpdated', event => {
        if (!event?.detail?.category || event.detail.category === 'geoSeo') clearGeoCache();
    });
}

async function readJson(path) {
    const response = await fetch(path, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    let data;
    try { data = await response.json(); } catch { data = {}; }
    if (!response.ok || data?.success === false) {
        const error = new Error(data?.error || 'Regional job data is unavailable.');
        error.status = response.status;
        error.code = data?.code || 'GEO_DATA_UNAVAILABLE';
        throw error;
    }
    return data;
}

async function cachedRead(cache, key, path) {
    const current = cache.get(key);
    if (current && Date.now() - current.at < CACHE_TTL_MS) return current.value;
    if (requestCache.has(key)) return requestCache.get(key);
    const promise = readJson(path)
        .then(value => {
            cache.set(key, { at: Date.now(), value });
            return value;
        })
        .finally(() => requestCache.delete(key));
    requestCache.set(key, promise);
    return promise;
}

export async function getPublicRegions() {
    return cachedRead(regionCache, 'region-index', '/api/public/geo/regions');
}

export async function getRegionalHub(kind, slug) {
    if (!['city', 'state'].includes(kind) || !/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(String(slug || ''))) {
        const error = new Error('This regional job hub is not available.');
        error.status = 404;
        error.code = 'REGION_NOT_FOUND';
        throw error;
    }
    const routeKind = kind === 'state' ? 'in' : 'city';
    const key = `${routeKind}:${slug}`;
    const data = await cachedRead(regionCache, key, `/api/public/geo/regions/${routeKind}/${encodeURIComponent(slug)}`);
    return data.region;
}
