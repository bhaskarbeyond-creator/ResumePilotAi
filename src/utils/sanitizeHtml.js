import DOMPurify from 'dompurify';

const COMMON = Object.freeze({
  ALLOWED_TAGS: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'span', 'div', 'a'],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'style'],
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'svg', 'math', 'form', 'input', 'button', 'style'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'srcset'],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|#|\/)/i
});

/** Sanitizes user-authored rich text before browser/PDF rendering. */
export function sanitizeRichText(value) {
  return DOMPurify.sanitize(String(value || ''), COMMON);
}

/** Sanitizes CMS content; currently intentionally uses the same conservative profile. */
export function sanitizePublicHtml(value) {
  return sanitizeRichText(value);
}

/** Returns a safe navigable URL or an empty string. */
export function sanitizeUrl(value) {
  const url = String(value || '').trim();
  return /^(https?:\/\/|mailto:|\/|#)/i.test(url) ? url : '';
}
