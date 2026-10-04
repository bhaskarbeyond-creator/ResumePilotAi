const ORGANIZATION_NAME_FALLBACK = 'IME365';

export function schemaText(value, maximum = 5000) {
    return String(value ?? '')
        .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maximum);
}

export function safeSchemaUrl(value, base) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
        const parsed = new URL(raw, base);
        if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return '';
        return parsed.href;
    } catch {
        return '';
    }
}

function isoDate(value) {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : '';
}

export function schemaDate(value) {
    return isoDate(value) || undefined;
}

function employmentType(value) {
    const normalized = String(value || '').trim().toLowerCase().replace(/[ _]+/g, '-');
    if (normalized.includes('full')) return 'FULL_TIME';
    if (normalized.includes('part')) return 'PART_TIME';
    if (normalized.includes('contract') || normalized.includes('temporary')) return 'CONTRACTOR';
    if (normalized.includes('intern')) return 'INTERN';
    if (normalized.includes('freelance')) return 'CONTRACTOR';
    return '';
}

function jobAddress(location) {
    const parts = schemaText(location, 240).split(',').map(part => part.trim()).filter(Boolean);
    if (!parts.length) return null;
    const countryAliases = new Map([
        ['india', 'IN'], ['united states', 'US'], ['united states of america', 'US'], ['usa', 'US'],
        ['united kingdom', 'GB'], ['uk', 'GB'], ['canada', 'CA'], ['australia', 'AU'],
    ]);
    const last = parts.at(-1).toLowerCase();
    const country = countryAliases.get(last) || (/^[A-Z]{2}$/.test(parts.at(-1)) ? parts.at(-1).toUpperCase() : '');
    const address = { '@type': 'PostalAddress', addressLocality: country ? parts.slice(0, -1).join(', ') || parts[0] : parts.join(', ') };
    if (parts.length > 1 && !country) address.addressRegion = parts.at(-1);
    if (country) address.addressCountry = country;
    return address;
}

export function buildJobPostingSchema(job, { canonicalUrl, now = Date.now() } = {}) {
    if (!job || typeof job !== 'object') return null;
    const status = String(job.status || '').trim().toLowerCase();
    if (status && status !== 'active') return null;
    const expiresValue = job.expires_at || job.expiresAt;
    if (expiresValue) {
        const expiresTime = new Date(expiresValue).getTime();
        if (!Number.isFinite(expiresTime) || expiresTime <= now) return null;
    }

    const title = schemaText(job.title, 255);
    const description = schemaText(job.description, 5000);
    const companyName = schemaText(job.company_name || job.companyName || job.company, 255);
    const datePosted = isoDate(job.created_at || job.createdAt || job.postedAt || job.posted_at);
    const location = schemaText(job.location, 240);
    const remote = /remote/i.test(String(job.workplace_type || job.workplaceType || job.workMode || ''));
    const canonical = safeSchemaUrl(canonicalUrl);
    if (!title || !description || !companyName || !datePosted || !canonical || (!location && !remote)) return null;

    const schema = {
        '@context': 'https://schema.org',
        '@type': 'JobPosting',
        title,
        description,
        datePosted,
        hiringOrganization: { '@type': 'Organization', name: companyName },
        url: canonical,
    };
    if (location) {
        const address = jobAddress(location);
        if (address) schema.jobLocation = { '@type': 'Place', address };
    }
    if (remote) schema.jobLocationType = 'TELECOMMUTE';
    const type = employmentType(job.job_type || job.jobType || job.type);
    if (type) schema.employmentType = type;
    const validThrough = isoDate(expiresValue);
    if (validThrough) schema.validThrough = validThrough;
    const jobId = schemaText(job.id, 128);
    if (jobId) schema.identifier = { '@type': 'PropertyValue', name: companyName, value: jobId };
    const employerUrl = safeSchemaUrl(job.company_url || job.companyUrl || job.website);
    if (employerUrl) schema.hiringOrganization.sameAs = employerUrl;
    const logo = safeSchemaUrl(job.company_logo || job.companyLogo);
    if (logo) schema.hiringOrganization.logo = logo;
    return schema;
}

export function buildOrganizationSchema(publicConfig = {}, baseUrl = '') {
    const website = publicConfig.website && typeof publicConfig.website === 'object' ? publicConfig.website : {};
    const branding = publicConfig.branding && typeof publicConfig.branding === 'object' ? publicConfig.branding : {};
    const geo = publicConfig.geoSeo && typeof publicConfig.geoSeo === 'object' ? publicConfig.geoSeo : {};
    const canonicalBase = safeSchemaUrl(geo.canonicalUrl || baseUrl, baseUrl);
    if (!canonicalBase) return null;

    const name = schemaText(branding.brandName || website.websiteName || website.title || ORGANIZATION_NAME_FALLBACK, 120);
    if (!name) return null;
    const schema = {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name,
        url: canonicalBase,
    };
    const logo = safeSchemaUrl(branding.logoUrl || website.logoUrl, canonicalBase);
    if (logo) schema.logo = logo;
    const email = String(website.supportEmail || publicConfig.supportEmail || '').trim();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        schema.contactPoint = { '@type': 'ContactPoint', contactType: 'customer support', email };
    }
    const social = publicConfig.social && typeof publicConfig.social === 'object' ? publicConfig.social : {};
    const sameAs = [...new Set(Object.values(social).map(value => safeSchemaUrl(value)).filter(value => value && value.startsWith('https://')))];
    if (sameAs.length) schema.sameAs = sameAs;
    return schema;
}

export function buildBreadcrumbSchema(items = [], baseUrl = '') {
    const elements = (Array.isArray(items) ? items : []).map((item, index) => {
        const name = schemaText(item?.name, 160);
        const url = safeSchemaUrl(item?.url, baseUrl);
        if (!name || !url) return null;
        return { '@type': 'ListItem', position: index + 1, name, item: url };
    }).filter(Boolean);
    if (elements.length < 2) return null;
    return {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: elements,
    };
}

export function buildFaqPageSchema(faqs = []) {
    const mainEntity = (Array.isArray(faqs) ? faqs : []).map(faq => {
        const question = schemaText(faq?.q, 300);
        const answer = schemaText(faq?.a, 1200);
        if (!question || !answer) return null;
        return {
            '@type': 'Question',
            name: question,
            acceptedAnswer: { '@type': 'Answer', text: answer },
        };
    }).filter(Boolean);
    if (!mainEntity.length) return null;
    return { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity };
}

export function safeJsonLd(schema) {
    if (!schema) return '';
    return JSON.stringify(schema)
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/&/g, '\\u0026')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
}
