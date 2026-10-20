/**
 * Shared utility functions for CV Templates
 * TypeScript port from src/cv-templates/templateUtils.js
 */

export const EMPTY_COLORS = Object.freeze({ primary: '#1E40AF', secondary: '#F8FAFC' });
export const ARRAY_FIELDS = ['employments', 'educations', 'skills', 'languages', 'projects', 'certifications', 'components'];

export function text(value: unknown, fallback = ''): string {
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'string') return value.slice(0, 100_000);
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return fallback;
}

/**
 * Before P002 C6 the candidate builder stored skills as `{ category, skills: [...] }` groups;
 * expand them into one item per skill so templates render those resumes' skills.
 */
function expandSkillGroups(items: unknown[]): unknown[] {
    return items.flatMap((item) => {
        const group = item as { category?: unknown; skills?: unknown } | null;
        if (!group || typeof group !== 'object' || !Array.isArray(group.skills)) return [item];
        const category = typeof group.category === 'string' ? group.category : '';
        return (group.skills as unknown[])
            .map((skill) => (typeof skill === 'string' ? skill : (skill as { name?: unknown } | null)?.name))
            .filter((name): name is string => typeof name === 'string' && name.trim() !== '')
            .map((name) => ({ name: name.trim(), category }));
    });
}

export function normalizeCollection(field: string, value: unknown) {
    if (!Array.isArray(value)) return [];
    const items = field === 'skills' ? expandSkillGroups(value) : value;
    return items.filter(item => item !== null && item !== undefined).map((item, index) => {
        const source = typeof item === 'object' ? { ...item } : { name: String(item), value: String(item) };
        const base = { ...source, date: source.date ?? index + 1 };
        if (field === 'employments') {
            const jobTitle = text(source.jobTitle || source.title || source.position);
            const employer = text(source.employer || source.company || source.organization);
            return {
                ...base, jobTitle, title: jobTitle, position: jobTitle,
                employer, company: employer,
                begin: text(source.begin || source.startDate || source.started),
                end: text(source.end || source.endDate || source.finished),
                description: text(source.description || source.summary),
                currentWork: Boolean(source.currentWork || source.current)
            };
        }
        if (field === 'educations') {
            const school = text(source.school || source.institution || source.organization);
            const degree = text(source.degree || source.qualification || source.title);
            return {
                ...base, school, institution: school, degree,
                started: text(source.started || source.startDate || source.begin),
                finished: text(source.finished || source.endDate || source.end),
                description: text(source.description || source.summary)
            };
        }
        if (field === 'skills') {
            const name = text(source.name || source.skillName || source.skill || source.title || source.value);
            const rawRating = source.rating ?? source.level;
            const numericRating = rawRating === '' || rawRating === null || rawRating === undefined ? null : Number(rawRating);
            return {
                ...base,
                name,
                skillName: name,
                value: name,
                rating: Number.isFinite(numericRating) ? Math.max(0, Math.min(100, numericRating)) : null,
            };
        }
        if (field === 'languages') {
            const name = text(source.name || source.language || source.title || source.value);
            const level = text(source.level || source.proficiency || source.rating);
            return { ...base, name, language: name, value: name, level, proficiency: level };
        }
        if (field === 'projects') {
            const name = text(source.name || source.title);
            return { ...base, name, title: name, description: text(source.description || source.summary), url: text(source.url || source.link) };
        }
        if (field === 'certifications') {
            const title = text(source.title || source.name);
            return { ...base, title, name: title, issuer: text(source.issuer || source.organization) };
        }
        if (field === 'components') {
            const type = text(source.type || 'Paragraph');
            const rawContent = source.content ?? '';
            const content = type === 'List'
                ? (Array.isArray(rawContent) ? rawContent.map(value => text(value)).filter(Boolean) : text(rawContent).split(/\n|;/).map(value => value.trim()).filter(Boolean))
                : (Array.isArray(rawContent) ? rawContent.map(value => text(value)).join('\n') : text(rawContent));
            return { ...base, type, content, name: text(source.name || source.title) };
        }
        return base;
    });
}

/**
 * Creates a non-mutating, complete view model accepted by all 51 CV templates and all
 * cover templates. Legacy templates sort their arrays in place; each array is therefore
 * cloned so rendering can never reorder builder state.
 */
export function normalizeTemplateData(input: Record<string, unknown> = {}) {
    const raw = input && typeof input === 'object' ? input : {};
    const employments = raw.employments || raw.workExperiences || raw.experience;
    const educations = raw.educations || raw.education;
    // DIR-071 — GLOBAL PHOTO VISIBILITY SUPPRESSION.
    // The template view model is the LAST boundary before a template renders, so a
    // hidden photo must already be null here. Any of showPhoto:false,
    // hidePhoto:true or includePhoto:false suppresses it.
    const photoHidden = raw.showPhoto === false || raw.hidePhoto === true || raw.includePhoto === false;
    const showPhoto = photoHidden ? false : (raw.showPhoto !== undefined ? Boolean(raw.showPhoto) : true);
    const photo = showPhoto && typeof raw.photo === 'string' && raw.photo.trim() ? raw.photo : null;
    const normalized: Record<string, unknown> = {
        ...raw,
        firstname: text(raw.firstname || raw.firstName),
        lastname: text(raw.lastname || raw.lastName),
        name: text(raw.name || `${text(raw.firstname || raw.firstName)} ${text(raw.lastname || raw.lastName)}`.trim()),
        occupation: text(raw.occupation || raw.jobTitle || raw.title),
        summary: text(raw.summary),
        email: text(raw.email),
        phone: text(raw.phone),
        address: text(raw.address),
        city: text(raw.city),
        country: text(raw.country),
        postalcode: text(raw.postalcode || raw.postalCode || raw.zip),
        website: text(raw.website || raw.websiteUrl),
        linkedin: text(raw.linkedin || raw.linkedinUrl),
        github: text(raw.github || raw.githubUrl),
        photo,
        showPhoto,
        employments: normalizeCollection('employments', employments),
        educations: normalizeCollection('educations', educations),
        skills: normalizeCollection('skills', raw.skills),
        languages: normalizeCollection('languages', raw.languages),
        projects: normalizeCollection('projects', raw.projects),
        certifications: normalizeCollection('certifications', raw.certifications),
        components: normalizeCollection('components', raw.components),
        colors: {
            ...EMPTY_COLORS,
            ...(raw.colors && typeof raw.colors === 'object' ? raw.colors : {})
        }
    };
    // Preserve every known array contract even when a future caller supplies null.
    for (const field of ARRAY_FIELDS) if (!Array.isArray(normalized[field])) normalized[field] = [];
    const hidden = new Set(Array.isArray(raw.hiddenSections) ? raw.hiddenSections : []);
    if (hidden.has('heading')) {
        for (const field of ['firstname', 'lastname', 'name', 'occupation', 'email', 'phone', 'address', 'city', 'country', 'postalcode', 'website', 'linkedin', 'github']) normalized[field] = '';
        normalized.photo = null;
    }
    const hasMeaningfulSummary = (val: unknown) => {
        if (!val) return false;
        return String(val).replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').trim().length > 0;
    };
    if (hidden.has('summary') || !hasMeaningfulSummary(normalized.summary)) normalized.summary = '';
    if (hidden.has('employment') || hidden.has('employments')) normalized.employments = [];
    if (hidden.has('education') || hidden.has('educations')) normalized.educations = [];
    if (hidden.has('skills')) normalized.skills = [];
    if (hidden.has('languages')) normalized.languages = [];
    if (hidden.has('projects')) normalized.projects = [];
    if (hidden.has('certifications')) normalized.certifications = [];
    return normalized;
}

/** Returns diagnostics without mutating or rejecting user content. */
export function validateTemplateData(input: Record<string, unknown> = {}) {
    const value = normalizeTemplateData(input);
    const warnings: string[] = [];
    if (!value.firstname && !value.lastname && !value.name) warnings.push('missing-name');
    if (!value.email && !value.phone) warnings.push('missing-contact');
    if ((value.summary as string).length > 4_000) warnings.push('long-summary');
    if ((value.employments as unknown[]).length > 20) warnings.push('large-employment-history');
    if ((value.skills as unknown[]).length > 50) warnings.push('large-skills-list');
    if ((value.projects as unknown[]).length > 20) warnings.push('large-projects-list');
    const longUrlFields = ['website', 'linkedin', 'github'];
    for (const field of longUrlFields) if ((value[field] as string).length > 2_048) warnings.push(`long-${field}-url`);
    return { value, warnings, valid: true };
}

export function getTemplateDirection(language: string): 'rtl' | 'ltr' {
    return ['ar', 'fa', 'he', 'ur'].includes(String(language || '').toLowerCase().split('-')[0]) ? 'rtl' : 'ltr';
}

// Curated harmonious color palettes for premium 10/10 template presentation
const CURATED_PALETTES = [
    { primary: '#1E40AF', secondary: '#F1F5F9' }, // Royal Sapphire
    { primary: '#0F766E', secondary: '#F0FDF4' }, // Emerald Cyan
    { primary: '#4338CA', secondary: '#EEF2FF' }, // Deep Indigo
    { primary: '#0F172A', secondary: '#F8FAFC' }, // Executive Slate
    { primary: '#9D174D', secondary: '#FDF2F8' }, // Vibrant Ruby
    { primary: '#B45309', secondary: '#FFFBEB' }, // Warm Amber
    { primary: '#15803D', secondary: '#F0FDF4' }  // Modern Forest
];

/**
 * Returns vibrant primary and secondary colors with smart fallback if user colors are default/black
 */
export function getTemplateColors(colors: Record<string, string> | undefined, index = 0, fallbackPrimary = '#1E40AF', fallbackSecondary = '#F8FAFC') {
    const primary = colors?.primary;
    const secondary = colors?.secondary;

    const palette = CURATED_PALETTES[index % CURATED_PALETTES.length];

    const finalPrimary = (primary && primary !== '#000000' && primary !== '#000') ? primary : (fallbackPrimary || palette.primary);
    const finalSecondary = (secondary && secondary !== '#000000' && secondary !== '#000') ? secondary : (fallbackSecondary || palette.secondary);

    return { primary: finalPrimary, secondary: finalSecondary };
}

/**
 * Helper to safely return photo URL or null
 */
export function getAvatarUrl(photo: string | undefined, _firstname: string, _lastname: string): string | null {
    if (photo && typeof photo === 'string' && photo.trim()) {
        return photo;
    }
    return null;
}

/**
 * Formats city, state, country, and postal code cleanly without leading/trailing commas or dots
 */
export function formatLocation(address: string | Record<string, unknown> | undefined, city: string, country: string, postalCode: string): string {
    let rawString = '';

    if (typeof address === 'string') {
        rawString = address;
    } else if (address && typeof address === 'object') {
        const parts = [
            (address.address as string) || (address.street as string),
            (address.city as string) || city,
            (address.postalCode as string) || (address.zip as string) || postalCode,
            (address.country as string) || country
        ].filter(Boolean);
        return parts.join(', ');
    } else {
        const parts = [city, postalCode, country].filter(Boolean);
        return parts.join(', ');
    }

    // Clean up raw string like ", Visakhapatnam, 530013, India, ."
    return rawString
        .replace(/^[\s,.-]+/, '') // Leading whitespace/commas/dots
        .replace(/[\s,.-]+$/, '') // Trailing whitespace/commas/dots
        .replace(/,\s*,/g, ',')   // Consecutive commas
        .trim();
}

/**
 * Formats date ranges safely (e.g. "April 2022 – Present")
 */
export function formatDateRange(startDate: string, endDate: string, isCurrent: boolean): string {
    if (!startDate && !endDate) return '';
    const start = (startDate || '').trim();
    let end = (endDate || '').trim();

    if (isCurrent || !end || end.toLowerCase() === 'present') {
        end = 'Present';
    }

    if (!start) return end;
    if (start === end) return start;
    return `${start} – ${end}`;
}

/**
 * Calculates accessible text color (#ffffff or #1a202c) based on background hex luminance.
 * Picks whichever of the two colors scores the higher WCAG contrast ratio against
 * the background, so light accent backgrounds receive dark text instead of
 * sub-AA white text.
 */
export function getContrastTextColor(bgHex: string, fallback = '#ffffff'): string {
    if (!bgHex || typeof bgHex !== 'string') return fallback;
    const hex = bgHex.replace('#', '').trim();
    if (hex.length !== 3 && hex.length !== 6) return fallback;

    let r, g, b;
    if (hex.length === 3) {
        r = parseInt(hex[0] + hex[0], 16);
        g = parseInt(hex[1] + hex[1], 16);
        b = parseInt(hex[2] + hex[2], 16);
    } else {
        r = parseInt(hex.substring(0, 2), 16);
        g = parseInt(hex.substring(2, 4), 16);
        b = parseInt(hex.substring(4, 6), 16);
    }

    const linear = (value: number) => {
        const s = value / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    const luminance = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
    const ratioWith = (foregroundLuminance: number) => {
        const [hi, lo] = luminance > foregroundLuminance ? [luminance, foregroundLuminance] : [foregroundLuminance, luminance];
        return (hi + 0.05) / (lo + 0.05);
    };
    // #ffffff vs #1a202c (relative luminance ≈ 0.0118)
    const whiteRatio = ratioWith(1.0);
    const darkRatio = ratioWith(0.0118);
    return whiteRatio >= darkRatio ? '#ffffff' : '#1a202c';
}

/**
 * Universal language visual parser supporting all possible array/object/string payload variations
 */
export function formatLanguages(langsData: unknown): Array<{ name: string; level: string }> {
    if (!langsData) return [];

    let langs = langsData;

    // Convert keyed object maps to arrays when needed
    if (typeof langs === 'object' && !Array.isArray(langs)) {
        langs = Object.values(langs);
    }

    // Convert string to array if comma-separated string
    if (typeof langs === 'string') {
        langs = langs.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
    }

    if (!Array.isArray(langs) || !langs.length) return [];

    return langs.map(item => {
        if (!item) return null;

        if (typeof item === 'string') {
            const trimmed = item.trim();
            if (!trimmed) return null;
            // Check if string contains level like "English (Native)" or "Spanish - Fluent"
            const match = trimmed.match(/^([^(:-]+)(?:\s*[(:-]\s*([^)]+)\)?)?$/);
            if (match) {
                return {
                    name: (match[1] || trimmed).trim(),
                    level: (match[2] || '').trim()
                };
            }
            return { name: trimmed, level: '' };
        }

        if (typeof item === 'object') {
            // Check all known key names for language title
            let name = (item as Record<string, unknown>).name ||
                       (item as Record<string, unknown>).language ||
                       (item as Record<string, unknown>).value ||
                       (item as Record<string, unknown>).title ||
                       (item as Record<string, unknown>).label ||
                       (item as Record<string, unknown>).lang ||
                       (item as Record<string, unknown>).nameLabel ||
                       (item as Record<string, unknown>).languageName || '';
            if (typeof name === 'object' && name !== null) {
                name = (name as Record<string, unknown>).name ||
                       (name as Record<string, unknown>).en ||
                       (name as Record<string, unknown>).label ||
                       Object.values(name)[0] || '';
            }
            name = String(name || '').trim();

            // Check all known key names for proficiency level
            let level = (item as Record<string, unknown>).level ||
                        (item as Record<string, unknown>).proficiency ||
                        (item as Record<string, unknown>).rating ||
                        (item as Record<string, unknown>).degree ||
                        (item as Record<string, unknown>).levelLabel ||
                        (item as Record<string, unknown>).levelValue ||
                        (item as Record<string, unknown>).proficiencyLevel || '';
            if (typeof level === 'object' && level !== null) {
                level = (level as Record<string, unknown>).name ||
                        (level as Record<string, unknown>).en ||
                        (level as Record<string, unknown>).label ||
                        Object.values(level)[0] || '';
            }
            level = String(level || '').trim();

            if (!name) return null;
            return { name, level };
        }

        return null;
    }).filter(Boolean) as Array<{ name: string; level: string }>;
}