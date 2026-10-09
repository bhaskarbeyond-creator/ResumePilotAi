/**
 * DIR-060 — the ONE authoritative decision for the free-tier resume watermark.
 *
 * WHY THIS MODULE EXISTS (proven defect, not a guess):
 *
 *   The render path fed `ResumeWatermarkOverlay` from
 *   `values._watermark || values.watermark`, and NOTHING in `src/` ever
 *   populated either key — `_watermark` appears only as a READ at the two render
 *   sites, and the builder's `previewData` (BuildResume.jsx:959) carries no
 *   watermark and no entitlement. Consequences:
 *
 *     • FREE user: the overlay received `undefined` and returned null, so the
 *       watermark did NOT render in preview — the directive requires it to render
 *       reliably (§4).
 *     • PAID user: the overlay had NO entitlement input at all, so any caller
 *       that did supply the global public watermark object would stamp it onto a
 *       paid document — the directive forbids any leakage to paid users (§4).
 *
 *   Both are failures of the SAME missing gate. This module is that gate, kept
 *   pure so it is unit-testable and so every surface shares one rule.
 *
 * It is deliberately FAIL-CLOSED: only an explicitly free document renders the
 * watermark.
 */

/** True only when the admin setting is ON and the user is NOT entitled to a clean copy. */
export function shouldRenderWatermark(watermark, entitlement = {}) {
    if (!watermark || typeof watermark !== 'object' || Array.isArray(watermark)) return false;
    // An explicit OFF in the admin settings is authoritative.
    if (watermark.enableFreeWatermark === false) return false;
    // Fail CLOSED for anyone entitled to a clean document.
    if (entitlement?.removesWatermark === true) return false;
    if (entitlement?.isPaid === true) return false;
    return true;
}

/**
 * Resolve the watermark object to attach to a render/export view model as
 * `_watermark`, or `null` when the document must be clean.
 */
export function resolvePreviewWatermark({ watermark, isPaid = false, removesWatermark = false } = {}) {
    return shouldRenderWatermark(watermark, { isPaid, removesWatermark }) ? watermark : null;
}

/**
 * Normalise the entitlement carried on a render view model, so a caller can be
 * correct with either `_entitlement: { isPaid }` or a flat `isPaid`.
 */
export function readEntitlement(values = {}) {
    const source = values && typeof values === 'object' ? values : {};
    const explicit = source._entitlement && typeof source._entitlement === 'object' ? source._entitlement : {};
    return {
        removesWatermark: explicit.removesWatermark === true || source.removesWatermark === true,
        isPaid: explicit.isPaid === true || source.isPaid === true,
    };
}
