/**
 * Shared utility functions for CV Templates
 */

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
export function getTemplateColors(colors, index = 0, fallbackPrimary = '#1E40AF', fallbackSecondary = '#F8FAFC') {
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
export function getAvatarUrl(photo, firstname, lastname) {
    if (photo && typeof photo === 'string' && photo.trim()) {
        return photo;
    }
    return null;
}

/**
 * Formats city, state, country, and postal code cleanly without leading/trailing commas or dots
 */
export function formatLocation(address, city, country, postalCode) {
    let rawString = '';
    
    if (typeof address === 'string') {
        rawString = address;
    } else if (address && typeof address === 'object') {
        const parts = [
            address.address || address.street,
            address.city || city,
            address.postalCode || address.zip || postalCode,
            address.country || country
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
export function formatDateRange(startDate, endDate, isCurrent) {
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
 * Calculates accessible text color (#ffffff or #1a202c) based on background hex luminance
 */
export function getContrastTextColor(bgHex, fallback = '#ffffff') {
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

    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.65 ? '#1a202c' : '#ffffff';
}

/**
 * Universal language visual parser supporting all possible array/object/string payload variations
 */
export function formatLanguages(langsData) {
    if (!langsData) return [];

    let langs = langsData;

    // Convert object to array if needed (e.g. Firestore object maps)
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
            let name = item.name || item.language || item.value || item.title || item.label || item.lang || item.nameLabel || item.languageName || '';
            if (typeof name === 'object' && name !== null) {
                name = name.name || name.en || name.label || Object.values(name)[0] || '';
            }
            name = String(name || '').trim();

            // Check all known key names for proficiency level
            let level = item.level || item.proficiency || item.rating || item.degree || item.levelLabel || item.levelValue || item.proficiencyLevel || '';
            if (typeof level === 'object' && level !== null) {
                level = level.name || level.en || level.label || Object.values(level)[0] || '';
            }
            level = String(level || '').trim();

            if (!name) return null;
            return { name, level };
        }

        return null;
    }).filter(Boolean);
}
