/**
 * DIR-018 / AC-1 — runtime resolver for the Cuba Executive design tokens.
 *
 * WHY THIS EXISTS
 * Most of the billing surface is themed by writing `var(--cuba-*)` into a
 * className or an inline style, and the browser resolves it for free. The
 * payment SDKs cannot: Razorpay's checkout modal and Stripe's <CardElement>
 * are rendered inside CROSS-ORIGIN IFRAMES, so they never inherit this
 * document's custom properties. Passing them the literal string
 * `var(--cuba-primary)` would hand the iframe an unparseable colour and it
 * would silently fall back to its own default — losing the brand hue AND
 * losing the dark-theme adaptation.
 *
 * So the two SDK call-sites resolve the token to a concrete colour string at
 * runtime instead. `getComputedStyle` on the document root returns the value
 * the CURRENT theme is actually using, so the Razorpay modal follows the
 * active light/dark theme automatically, with no duplicated hex.
 *
 * `fallback` exists only for the non-DOM case (SSR / unit test), where
 * `document` does not exist. It is a documented constant rather than an
 * invented colour.
 */

/** Brand violet used when there is no DOM to measure (SSR / unit tests). */
export const CUBA_PRIMARY_FALLBACK = '#5949d6';
/** Body ink used when there is no DOM to measure. */
export const CUBA_INK_FALLBACK = '#10121a';
/** Muted ink used for placeholder text. */
export const CUBA_INK_SUBTLE_FALLBACK = '#626a7d';
/** Danger ink used for Stripe's invalid-field state. */
export const CUBA_DANGER_FALLBACK = '#c02630';

/**
 * Reads a `--cuba-*` custom property from the document root and returns it as
 * a concrete value the caller can hand to a third-party iframe.
 *
 * @param {string} token  Custom property name, e.g. '--cuba-primary-fill'.
 * @param {string} fallback Returned verbatim when there is no DOM or the
 *   token is not defined. Must be a colour the SDK can actually parse.
 * @returns {string}
 */
export function resolveCubaToken(token, fallback) {
    if (typeof document === 'undefined' || typeof window === 'undefined') return fallback;
    try {
        const root = document.documentElement;
        if (!root) return fallback;
        const value = window
            .getComputedStyle(root)
            .getPropertyValue(token)
            .trim();
        return value || fallback;
    } catch {
        // A detached document or a hostile CSSOM must never break checkout.
        return fallback;
    }
}