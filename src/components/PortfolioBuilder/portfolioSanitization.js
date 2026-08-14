const ENCODED_LINE_BREAKS = /%(?:0a|0d|00)/i;
const hasControlCharacters = (value) => Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
});
const stripControlCharacters = (value) => Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    if (code === 9 || code === 10 || code === 13) return ' ';
    return code <= 31 || code === 127 ? '' : character;
}).join('');
const IMAGE_FIELD = /(?:image|avatar|photo|logo|thumbnail|preview)$/i;
const URL_FIELD = /(?:url|uri|href|link|website|github|linkedin|twitter)$/i;
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** Plain text used by public portfolio components. React will escape the result again. */
export function sanitizePortfolioText(input) {
    if (typeof input !== 'string') return '';
    return stripControlCharacters(input)
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<[^>]*>?/gm, '')
        .trim()
        .slice(0, 10000);
}

/** Allows useful HTTPS/contact/internal links without permitting executable protocols. */
export function sanitizePortfolioUrl(input) {
    if (typeof input !== 'string') return '#';
    const value = input.trim();
    if (!value || value.length > 2048 || hasControlCharacters(value) || ENCODED_LINE_BREAKS.test(value)) return '#';
    if (value.startsWith('/') && !value.startsWith('//')) return value;
    if (value.startsWith('#')) return value;

    try {
        const parsed = new URL(value);
        if (parsed.username || parsed.password) return '#';
        return ['https:', 'mailto:', 'tel:'].includes(parsed.protocol) ? parsed.href : '#';
    } catch {
        return '#';
    }
}

/** Allows HTTPS/relative images and size-limited raster data images. */
export function sanitizePortfolioImageUrl(input) {
    if (typeof input !== 'string') return '';
    const value = input.trim();
    if (!value || value.length > 750000 || hasControlCharacters(value)) return '';
    if (value.startsWith('/') && !value.startsWith('//')) return value;
    if (/^data:image\/(?:jpeg|png|gif|webp|avif);base64,[A-Za-z0-9+/=]+$/i.test(value)) return value;

    try {
        const parsed = new URL(value);
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return '';
        return parsed.href;
    } catch {
        return '';
    }
}

function sanitizeValue(value, key = '', depth = 0) {
    if (depth > 8) return null;
    if (typeof value === 'string') {
        if (IMAGE_FIELD.test(key)) return sanitizePortfolioImageUrl(value);
        if (URL_FIELD.test(key)) return sanitizePortfolioUrl(value);
        return sanitizePortfolioText(value);
    }
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'boolean' || value === null) return value;
    if (Array.isArray(value)) return value.slice(0, 200).map((item) => sanitizeValue(item, key, depth + 1));
    if (!value || typeof value !== 'object') return null;

    const sanitized = {};
    for (const [childKey, childValue] of Object.entries(value).slice(0, 200)) {
        if (!DANGEROUS_KEYS.has(childKey)) sanitized[childKey] = sanitizeValue(childValue, childKey, depth + 1);
    }
    return sanitized;
}

/**
 * Creates an immutable, bounded public-rendering model and removes component types that
 * are not registered by the application. Stored Firestore snapshots are never mutated.
 */
export function normalizePublishedPortfolio(portfolio, componentConfig) {
    if (!portfolio || typeof portfolio !== 'object' || !portfolio.data || typeof portfolio.data !== 'object') return null;
    const components = componentConfig && typeof componentConfig === 'object' ? componentConfig : {};
    const content = Array.isArray(portfolio.data.content) ? portfolio.data.content : [];

    const safeContent = content.slice(0, 200).flatMap((component) => {
        if (!component || typeof component !== 'object' || typeof component.type !== 'string' || !components[component.type]) return [];
        const props = component.props && typeof component.props === 'object' ? component.props : {};
        const defaults = components[component.type].defaultProps || {};
        const hasContent = Object.entries(props).some(([key, value]) => key !== 'id' && value !== '' && value != null);
        return [{
            ...component,
            type: component.type,
            props: sanitizeValue(hasContent ? props : { ...defaults, ...props }, 'props'),
        }];
    });

    const root = portfolio.data.root && typeof portfolio.data.root === 'object' ? portfolio.data.root : { props: {} };
    return {
        ...portfolio,
        title: sanitizePortfolioText(portfolio.title || 'Portfolio'),
        theme: sanitizePortfolioText(portfolio.theme || 'default'),
        metadata: sanitizeValue(portfolio.metadata || {}, 'metadata'),
        data: {
            ...portfolio.data,
            content: safeContent,
            root: {
                ...root,
                props: sanitizeValue(root.props || { title: portfolio.title || 'Portfolio' }, 'props'),
            },
        },
    };
}
