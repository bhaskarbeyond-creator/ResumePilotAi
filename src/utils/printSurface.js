import printContract from '../styles/cuba-print.css?raw';

/**
 * DIR-056 SUB-056-5 — build a self-contained, STYLED printable document.
 *
 * THE DEFECT THIS FIXES
 *   Print/export surfaces here render a SUBTREE into a fresh document — an
 *   iframe for printing, a Blob for the HTML download. A fresh document inherits
 *   NONE of the application's CSS, and the resume markup is written with utility
 *   classes, so the output was genuinely unstyled: no page-break control, no
 *   image bounds, no typography. That is the "unstyled iframe / unconstrained
 *   avatars / multi-page whitespace sprawl" defect named in the mandate.
 *
 * THE FIX
 *   Carry BOTH halves across the boundary:
 *     1. every <style> and <link rel="stylesheet"> from the live document, so the
 *        subtree keeps the styling it was rendered with; and
 *     2. the shared print contract (src/styles/cuba-print.css), which adds the
 *        page-break, image-bound and chrome-hiding rules that only matter on paper.
 *
 * Single source of truth: the contract is imported with `?raw`, so it is inlined
 * at build time and cannot drift from the stylesheet other surfaces use.
 */

/** Escape a string for safe interpolation into HTML text/attribute position. */
export function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Serialise the live document's stylesheets so they survive the boundary.
 * `<link>` tags keep working because the generated document is same-origin and
 * therefore resolves relative/absolute asset URLs against the parent.
 */
export function collectDocumentStyles(doc = (typeof document !== 'undefined' ? document : null)) {
    if (!doc || typeof doc.querySelectorAll !== 'function') return '';
    const parts = [];
    try {
        doc.querySelectorAll('style').forEach((el) => parts.push(el.outerHTML));
        doc.querySelectorAll('link[rel="stylesheet"]').forEach((el) => parts.push(el.outerHTML));
    } catch { /* a hostile/incomplete document must not break printing */ }
    return parts.join('');
}

/**
 * Assemble a complete, styled, printable HTML document.
 * @returns {string} a full `<!DOCTYPE html>` document
 */
export function buildPrintableDocument({ title, innerHTML, extraStyles = '', doc } = {}) {
    return [
        '<!DOCTYPE html><html><head><meta charset="utf-8">',
        `<title>${escapeHtml(title || 'Document')}</title>`,
        collectDocumentStyles(doc),
        `<style>${printContract}${extraStyles}</style>`,
        '</head><body class="print-surface">',
        String(innerHTML || ''),
        '</body></html>',
    ].join('');
}

export { printContract };
