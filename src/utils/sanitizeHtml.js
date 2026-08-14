import DOMPurify from 'dompurify';

const RICH_TEXT_PROFILE = Object.freeze({
  ALLOWED_TAGS: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'span', 'div', 'a'],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'svg', 'math', 'form', 'input', 'button', 'style', 'template'],
  FORBID_ATTR: ['style', 'onerror', 'onload', 'onclick', 'onmouseover', 'srcset'],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|#|\/)/i
});

const PRINT_PROFILE = Object.freeze({
  WHOLE_DOCUMENT: true,
  ADD_TAGS: ['html', 'head', 'body', 'style'],
  ADD_ATTR: ['class', 'style'],
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'svg', 'math', 'form', 'input', 'button', 'base', 'link', 'meta', 'template'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'srcset'],
  ALLOWED_URI_REGEXP: /^(?:(?:https?):|#|\/)/i
});

/** Sanitizes user-authored rich text before browser or PDF rendering. */
export function sanitizeRichText(value) {
  return hardenSanitizedFragment(DOMPurify.sanitize(String(value || ''), RICH_TEXT_PROFILE));
}

/** Sanitizes CMS pages with the conservative rich-text policy. */
export function sanitizePublicHtml(value) {
  return sanitizeRichText(value);
}

function hardenSanitizedFragment(html, { allowImages = false } = {}) {
  if (typeof document === 'undefined') return html;
  const template = document.createElement('template');
  // Security-reviewed internal sink: `html` must already be DOMPurify output.
  template.innerHTML = html;
  for (const anchor of template.content.querySelectorAll('a')) {
    const safe = sanitizeUrl(anchor.getAttribute('href') || '');
    if (!safe) anchor.removeAttribute('href');
    else anchor.setAttribute('href', safe);
    if (anchor.getAttribute('target') === '_blank') anchor.setAttribute('rel', 'noopener noreferrer');
  }
  for (const image of template.content.querySelectorAll('img')) {
    const source = sanitizeImageUrl(image.getAttribute('src') || '');
    if (!allowImages || !source) image.removeAttribute('src');
    else image.setAttribute('src', source);
    image.setAttribute('loading', 'lazy');
  }
  return template.innerHTML;
}

/** Blog profile preserves tables and HTTPS images, but forbids inline CSS and active media. */
export function sanitizeBlogHtml(value) {
  const clean = DOMPurify.sanitize(String(value || ''), {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'mark', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'a', 'img',
      'table', 'thead', 'tbody', 'tr', 'th', 'td', 'div', 'span'
    ],
    ALLOWED_ATTR: ['href', 'title', 'alt', 'src', 'width', 'height', 'class', 'target', 'rel', 'loading'],
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'svg', 'math', 'form', 'input', 'button', 'style', 'template'],
    FORBID_ATTR: ['style', 'onerror', 'onload', 'onclick', 'onmouseover', 'srcset'],
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|#|\/)/i,
    KEEP_CONTENT: true
  });
  return hardenSanitizedFragment(clean, { allowImages: true });
}

export function sanitizePlainText(value) {
  return DOMPurify.sanitize(String(value || ''), { ALLOWED_TAGS: [], ALLOWED_ATTR: [], KEEP_CONTENT: true });
}

/** Returns a safe HTTPS or same-origin-relative image URL, or an empty string. */
export function sanitizeImageUrl(value) {
  const raw = String(value || '').trim();
  if (!raw || /[\u0000-\u001f\u007f]/.test(raw) || raw.length > 2048) return '';
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return '';
    return parsed.href;
  } catch {
    return '';
  }
}

/** Returns a safe navigable URL or an empty string. */
export function sanitizeUrl(value) {
  const raw = String(value || '').trim();
  if (!raw || /[\u0000-\u001f\u007f]/.test(raw) || /%(?:0a|0d|00)/i.test(raw)) return '';
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  if (raw.startsWith('#')) return raw;
  try {
    const parsed = new URL(raw);
    if (parsed.username || parsed.password) return '';
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol) ? parsed.href : '';
  } catch {
    return '';
  }
}

/**
 * Writes a sanitized printable document into a newly opened same-origin window.
 * Keeping this single reviewed DOM sink prevents invoice/profile fields from becoming
 * executable markup while preserving the product's print layouts.
 */
export function writeSanitizedPrintDocument(printWindow, markup) {
  if (!printWindow?.document) throw new Error('Print window is unavailable');
  // CSS in print templates is application-authored. Remove all network-capable and
  // executable CSS constructs before DOMPurify processes the complete document.
  const withoutActiveCss = String(markup || '')
    // CSS escapes can spell `url`, `@import`, or `expression` without a literal match.
    // Print templates do not require escapes, so remove them before active-CSS checks.
    .replace(/\\(?:[0-9a-f]{1,6}\s?|.)/gi, '')
    .replace(/@(?:import|font-face|namespace|document)\b[^;{]*(?:;|\{[^}]*\})/gi, '')
    .replace(/(?:url|image-set|cross-fade)\s*\([^)]*\)/gi, 'none')
    .replace(/[a-z-]+\s*\(\s*['"]?https?:[^)]*\)/gi, 'none')
    .replace(/(?:expression|behavior|-moz-binding)\s*[:(][^;)]*(?:;|\))/gi, '')
    .replace(/(?:src|content)\s*:\s*['"]?https?:[^;}]+/gi, '')
    .replace(/javascript\s*:/gi, '');
  const clean = DOMPurify.sanitize(withoutActiveCss, PRINT_PROFILE);
  printWindow.document.open();
  // Security-reviewed centralized sink: `clean` is DOMPurify output only.
  printWindow.document.write(clean);
  printWindow.document.close();
}
