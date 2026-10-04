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
    { slug: 'delhi', name: 'Delhi NCR', aliases: ['delhi ncr', 'delhi-ncr', 'new delhi', 'noida', 'gurgaon', 'gurugram', 'faridabad', 'ghaziabad'] },
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
function summarizeRegion(region, rows) {
    const list = Array.isArray(rows) ? rows : [];
    const salaries = [];
    let min = null;
    let max = null;
    const companies = new Map();

    for (const row of list) {
        const low = Number(row.salary_min ?? row.salaryMin);
        const high = Number(row.salary_max ?? row.salaryMax);
        if (Number.isFinite(low) && low > 0) {
            salaries.push(low);
            min = min === null ? low : Math.min(min, low);
        }
        if (Number.isFinite(high) && high > 0) {
            salaries.push(high);
            max = max === null ? high : Math.max(max, high);
        }
        const company = String(row.company_name ?? row.companyName ?? '').trim();
        if (company) companies.set(company, (companies.get(company) || 0) + 1);
    }

    const vacancyCount = list.length;
    const average = salaries.length
        ? Math.round(salaries.reduce((total, value) => total + value, 0) / salaries.length)
        : null;

    return {
        kind: region.kind,
        slug: region.slug,
        name: region.name,
        stateSlug: region.stateSlug,
        stateName: region.stateName,
        vacancyCount,
        hasVacancies: vacancyCount > 0,
        // The jobs table stores salary_min/salary_max as annual INR figures, so
        // the benchmark band is reported in lakhs (INR LPA) exactly as AC-1 asks,
        // with the raw authoritative integers retained for auditing.
        salary: {
            currency: 'INR',
            unit: 'LPA',
            minAnnual: min,
            maxAnnual: max,
            averageAnnual: average,
            minLpa: min === null ? null : Number((min / 100000).toFixed(2)),
            maxLpa: max === null ? null : Number((max / 100000).toFixed(2)),
            averageLpa: average === null ? null : Number((average / 100000).toFixed(2)),
        },
        companyCount: companies.size,
        topCompanies: [...companies.entries()]
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, 8)
            .map(([name, openings]) => ({ name, openings })),
        vacancies: list.slice(0, 24).map(row => ({
            id: String(row.id),
            title: String(row.title || ''),
            company: String(row.company_name ?? row.companyName ?? ''),
            location: String(row.location || ''),
            workplaceType: String(row.workplace_type ?? row.workplaceType ?? ''),
            jobType: String(row.job_type ?? row.jobType ?? ''),
            salaryMin: Number(row.salary_min ?? row.salaryMin) || null,
            salaryMax: Number(row.salary_max ?? row.salaryMax) || null,
            salaryCurrency: String(row.salary_currency ?? row.salaryCurrency ?? 'INR'),
        })),
    };
}

module.exports = {
    CANONICAL_CITIES,
    CANONICAL_STATES,
    buildLocationMatch,
    isCanonicalSlug,
    listCanonicalRegions,
    resolveRegion,
    summarizeRegion,
};
