'use strict';

/**
 * DIR-024 canonical Indian region taxonomy.
 *
 * INV-2 governs this file hard: every entry below is a LOCATION ALIAS used to
 * decide which authoritative `jobs.location` strings belong to a region. It is
 * a matching vocabulary, NOT a job source. Nothing here creates, invents, or
 * seeds a requisition. A region whose alias set matches zero MariaDB rows
 * renders an honest empty state; it never renders a placeholder vacancy.
 *
 * The slug is the public URL segment (`/jobs/city/bengaluru`,
 * `/jobs/in/karnataka`). Aliases are matched case-insensitively as substrings
 * against the free-text location column, which is why they carry the spellings
 * employers actually use ("Bangalore" is as common as "Bengaluru", and the data
 * writes "Delhi NCR" rather than "Delhi-NCR").
 */

/** The six AC-1 mandated tech hubs, in the order the hub index renders them. */
const CANONICAL_CITIES = Object.freeze([
    { slug: 'bengaluru', name: 'Bengaluru', stateSlug: 'karnataka', stateName: 'Karnataka', aliases: ['bengaluru', 'bangalore'] },
    { slug: 'hyderabad', name: 'Hyderabad', stateSlug: 'telangana', stateName: 'Telangana', aliases: ['hyderabad', 'secunderabad', 'hitec city'] },
    { slug: 'pune', name: 'Pune', stateSlug: 'maharashtra', stateName: 'Maharashtra', aliases: ['pune', 'pimpri-chinchwad'] },
    { slug: 'mumbai', name: 'Mumbai', stateSlug: 'maharashtra', stateName: 'Maharashtra', aliases: ['mumbai', 'bombay'] },
    { slug: 'delhi-ncr', name: 'Delhi NCR', stateSlug: 'delhi', stateName: 'Delhi NCR', aliases: ['delhi ncr', 'delhi-ncr', 'new delhi', 'noida', 'gurgaon', 'gurugram'] },
    { slug: 'chennai', name: 'Chennai', stateSlug: 'tamil-nadu', stateName: 'Tamil Nadu', aliases: ['chennai', 'madras'] },
]);

/** State hubs. Maharashtra and Delhi NCR each aggregate several city slugs. */
const CANONICAL_STATES = Object.freeze([
    { slug: 'karnataka', name: 'Karnataka', aliases: ['karnataka', 'bengaluru', 'bangalore'] },
    { slug: 'telangana', name: 'Telangana', aliases: ['telangana', 'hyderabad', 'secunderabad'] },
    { slug: 'maharashtra', name: 'Maharashtra', aliases: ['maharashtra', 'mumbai', 'bombay', 'pune', 'pimpri-chinchwad', 'nagpur'] },
    { slug: 'delhi', name: 'Delhi NCR', aliases: ['delhi', 'delhi ncr', 'delhi-ncr', 'new delhi', 'noida', 'gurgaon', 'gurugram', 'faridabad', 'ghaziabad'] },
    { slug: 'tamil-nadu', name: 'Tamil Nadu', aliases: ['tamil nadu', 'chennai', 'madras', 'coimbatore'] },
]);

const CITIES_BY_SLUG = new Map(CANONICAL_CITIES.map(city => [city.slug, city]));
const STATES_BY_SLUG = new Map(CANONICAL_STATES.map(state => [state.slug, state]));

/** Slug guard: the same shape the sibling public slug routes already accept. */
function isCanonicalSlug(value) {
    return /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(String(value || ''));
}

/**
 * Resolve a region by slug from either namespace. Returns null for an unknown
 * or malformed slug so the caller answers 404 instead of silently degrading to
 * an unfiltered nationwide projection (which would mislabel the page).
 */
function resolveRegion(slug) {
    const key = String(slug || '').trim().toLowerCase();
    if (!isCanonicalSlug(key)) return null;
    if (CITIES_BY_SLUG.has(key)) {
        const city = CITIES_BY_SLUG.get(key);
        return { kind: 'city', slug: city.slug, name: city.name, stateSlug: city.stateSlug, stateName: city.stateName, aliases: city.aliases };
    }
    if (STATES_BY_SLUG.has(key)) {
        const state = STATES_BY_SLUG.get(key);
        return { kind: 'state', slug: state.slug, name: state.name, stateSlug: state.slug, stateName: state.name, aliases: state.aliases };
    }
    return null;
}

/** The full canonical index, used by the hub directory and the sitemap. */
function listCanonicalRegions() {
    return {
        cities: CANONICAL_CITIES.map(({ slug, name, stateSlug, stateName }) => ({ kind: 'city', slug, name, stateSlug, stateName })),
        states: CANONICAL_STATES.map(({ slug, name }) => ({ kind: 'state', slug, name })),
    };
}

/** Keep the indexed columns in sync with new or edited employer postings. */
function projectRegionLocation(location) {
    const normalized = String(location || '').toLowerCase();
    const city = CANONICAL_CITIES.find(region => region.aliases.some(alias => normalized.includes(alias)));
    const state = CANONICAL_STATES.find(region => region.aliases.some(alias => normalized.includes(alias)));
    return { region_city: city?.slug || null, region_state: state?.slug || null };
}

/**
 * Build the parameterized LIKE predicate for a region.
 *
 * Every alias becomes its own `%alias%` bind value; the placeholder itself is
 * never interpolated, so an operator-authored location string can never alter
 * the statement. Callers AND the resulting binds together.
 */
function buildLocationMatch(region) {
    const binds = region.aliases.map(alias => `%${alias}%`);
    const predicate = `(${binds.map(() => 'LOWER(j.location) LIKE ?').join(' OR ')})`;
    return { predicate, binds };
}

/**
 * Aggregate a region from authoritative rows ONLY.
 *
 * `rows` are the real MariaDB projections returned by the repository. This
 * function cannot fabricate: a region with zero rows yields `vacancyCount: 0`
 * and every derived statistic explicitly null, so the UI is forced to render an
 * empty state instead of a zero-filled "benchmark".
 */
function summarizeRegion(region, rows, authoritativeStats = null) {
    const list = Array.isArray(rows) ? rows : [];
    const salaryBuckets = new Map();
    const companies = new Map();

    for (const row of list) {
        const currency = String(row.salary_currency ?? row.salaryCurrency ?? '').trim().toUpperCase();
        const low = Number(row.salary_min ?? row.salaryMin);
        const high = Number(row.salary_max ?? row.salaryMax);
        if (/^[A-Z]{3}$/.test(currency)) {
            const bucket = salaryBuckets.get(currency) || { values: [], min: null, max: null };
            if (Number.isFinite(low) && low > 0) {
                bucket.values.push(low);
                bucket.min = bucket.min === null ? low : Math.min(bucket.min, low);
            }
            if (Number.isFinite(high) && high > 0) {
                bucket.values.push(high);
                bucket.max = bucket.max === null ? high : Math.max(bucket.max, high);
            }
            salaryBuckets.set(currency, bucket);
        }
        const company = String(row.company_name ?? row.companyName ?? '').trim();
        if (company) companies.set(company, (companies.get(company) || 0) + 1);
    }

    const derivedSalaryRanges = [...salaryBuckets.entries()]
        .filter(([, bucket]) => bucket.values.length > 0)
        .sort(([currencyA], [currencyB]) => currencyA.localeCompare(currencyB))
        .map(([currency, bucket]) => {
            const average = Math.round(bucket.values.reduce((total, value) => total + value, 0) / bucket.values.length);
            return {
                currency,
                unit: currency === 'INR' ? 'LPA' : 'annual',
                minAnnual: bucket.min,
                maxAnnual: bucket.max,
                averageAnnual: average,
                minLpa: currency === 'INR' && bucket.min !== null ? Number((bucket.min / 100000).toFixed(2)) : null,
                maxLpa: currency === 'INR' && bucket.max !== null ? Number((bucket.max / 100000).toFixed(2)) : null,
                averageLpa: currency === 'INR' ? Number((average / 100000).toFixed(2)) : null,
            };
        });

    const vacancyCount = Number.isFinite(Number(authoritativeStats?.vacancyCount))
        ? Math.max(0, Number(authoritativeStats.vacancyCount))
        : list.length;
    const topCompanies = Array.isArray(authoritativeStats?.topCompanies)
        ? authoritativeStats.topCompanies.map(entry => ({
            name: String(entry?.name || '').trim(),
            openings: Math.max(0, Number(entry?.openings) || 0),
        })).filter(entry => entry.name)
        : [...companies.entries()]
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, 8)
            .map(([name, openings]) => ({ name, openings }));
    const salaryRanges = Array.isArray(authoritativeStats?.salaryRanges)
        ? authoritativeStats.salaryRanges
        : derivedSalaryRanges;
    const companyCount = Number.isFinite(Number(authoritativeStats?.companyCount))
        ? Math.max(0, Number(authoritativeStats.companyCount))
        : companies.size;

    return {
        kind: region.kind,
        slug: region.slug,
        name: region.name,
        stateSlug: region.stateSlug,
        stateName: region.stateName,
        vacancyCount,
        hasVacancies: vacancyCount > 0,
        // Salary records are never blended across currencies. The repository's
        // grouped query supplies complete aggregate bands; direct unit callers
        // derive the same shape from the rows they pass.
        salaryRanges,
        companyCount,
        topCompanies,
        vacancies: list.slice(0, 24).map(row => ({
            id: String(row.id || ''),
            title: String(row.title || ''),
            company: String(row.company_name ?? row.companyName ?? ''),
            location: String(row.location || ''),
            workplaceType: String(row.workplace_type ?? row.workplaceType ?? ''),
            jobType: String(row.job_type ?? row.jobType ?? ''),
            salaryMin: Number(row.salary_min ?? row.salaryMin) > 0 ? Number(row.salary_min ?? row.salaryMin) : null,
            salaryMax: Number(row.salary_max ?? row.salaryMax) > 0 ? Number(row.salary_max ?? row.salaryMax) : null,
            salaryCurrency: /^[A-Z]{3}$/.test(String(row.salary_currency ?? row.salaryCurrency ?? '').trim().toUpperCase())
                ? String(row.salary_currency ?? row.salaryCurrency).trim().toUpperCase()
                : null,
        })),
    };
}

module.exports = {
    CANONICAL_CITIES,
    CANONICAL_STATES,
    buildLocationMatch,
    isCanonicalSlug,
    listCanonicalRegions,
    projectRegionLocation,
    resolveRegion,
    summarizeRegion,
};
