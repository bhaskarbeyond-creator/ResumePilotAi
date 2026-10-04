/**
 * DIR-018 — Global Billing currency harmonisation.
 *
 * WHY THIS MODULE EXISTS
 * The billing surfaces previously formatted money three different ways:
 *   1. raw template interpolation  — `{symbol}{number}`  -> "₹1499.5"
 *   2. `Number.prototype.toLocaleString('en-US')`     -> "₹1,499.50"
 *   3. a hardcoded USD default when the config had not landed yet
 *
 * None of those produce Indian numeral grouping, which is the grouping Indian
 * customers actually read ("₹1,49,999", NOT "₹149,999"). This module is the ONE
 * formatter every billing surface must go through.
 *
 * DESIGN RULES (these are the acceptance criteria, not style preferences):
 *   - INR is the platform's base currency, so a missing/invalid currency code
 *     resolves to INR rather than to USD. Silently defaulting to USD is what
 *     made an unmigrated config render "$29.00" on an Indian storefront.
 *   - Grouping follows the active currency: `en-IN` for INR (lakh/crore
 *     grouping), `en-US` for USD/EUR/GBP and friends.
 *   - The amount is NEVER invented. `null`/`undefined`/NaN render as an em dash
 *     so a missing price is visibly missing rather than showing a zero.
 */

/**
 * The platform's authoritative base currency. Every billing surface defaults
 * here when the backend has not (yet) confirmed a currency.
 */
export const BASE_CURRENCY = 'INR';

/** Currency code -> symbol. Kept explicit because `Intl` symbol lookup is
 *  unreliable across ICU builds for the ₹ glyph. */
const CURRENCY_SYMBOLS = {
    INR: '₹',
    USD: '$',
    EUR: '€',
    GBP: '£',
    JPY: '¥',
    AUD: 'A$',
    CAD: 'C$',
    SGD: 'S$',
    AED: 'AED',
};

/** Currencies whose numerals are grouped in lakhs/crores. */
const INDIAN_GROUPED = new Set(['INR']);

/**
 * Normalise an arbitrary/blank currency code to a usable one.
 * Blank, non-string and malformed codes fall back to the base currency so the
 * UI can never render a bare, unlabelled number.
 */
export function resolveCurrencyCode(code) {
    const normalized = String(code || '').trim().toUpperCase();
    if (/^[A-Z]{3}$/.test(normalized)) return normalized;
    return BASE_CURRENCY;
}

/** Resolve the display symbol for a currency code. */
export function resolveCurrencySymbol(code) {
    return CURRENCY_SYMBOLS[resolveCurrencyCode(code)] || BASE_CURRENCY;
}

/** Resolve the BCP-47 locale that drives numeral grouping for a currency. */
export function resolveCurrencyLocale(code) {
    return INDIAN_GROUPED.has(resolveCurrencyCode(code)) ? 'en-IN' : 'en-US';
}

/** True when `amount` is safe to render as a number. */
function isRenderableAmount(amount) {
    return amount !== null && amount !== undefined && amount !== ''
        && Number.isFinite(Number(amount));
}

/**
 * Format a monetary amount for display.
 *
 * @param {number|string|null} amount  Monetary value. Non-finite input renders
 *        as an em dash so a missing price is never shown as zero.
 * @param {object} [options]
 * @param {string} [options.currency]   Currency code; blank/invalid -> INR.
 * @param {string} [options.locale]     Override the grouping locale.
 * @param {number} [options.decimals=2] Fixed decimal places.
 * @param {boolean} [options.showSymbol=true] Prefix the currency symbol.
 * @returns {string}
 */
export function formatCurrencyAmount(amount, options = {}) {
    const {
        currency,
        locale,
        decimals = 2,
        showSymbol = true,
    } = options;

    const code = resolveCurrencyCode(currency);
    const resolvedLocale = locale || resolveCurrencyLocale(code);

    if (!isRenderableAmount(amount)) return '—';

    // `style: 'decimal'` (NOT 'currency') because Intl places the symbol in a
    // locale-specific position ("US$1,499.50" vs "1.499,50 €") that the billing
    // layout cannot accommodate. Symbol placement stays under our control.
    let formatted;
    try {
        formatted = new Intl.NumberFormat(resolvedLocale, {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
        }).format(Number(amount));
    } catch {
        // A runtime without full ICU support must degrade to a readable number
        // rather than throwing inside a render().
        formatted = String(Number(amount).toFixed(decimals));
    }

    return showSymbol ? `${resolveCurrencySymbol(code)}${formatted}` : formatted;
}

/**
 * Format a plan price the way pricing cards show it.
 *
 * Subscription prices are whole units of currency in practice, so whole rupees
 * are the default; pass `decimals: 2` where paise are meaningful (tax
 * breakdowns, prorated credits, invoice line items).
 */
export function formatPlanPrice(amount, options = {}) {
    return formatCurrencyAmount(amount, { decimals: 0, ...options });
}