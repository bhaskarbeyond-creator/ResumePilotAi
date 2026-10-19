/**
 * Rich text sanitisation (DIR-008, R-31/R-43).
 *
 * Resume bodies arrive as Lexical HTML. They are rendered through
 * `dangerouslySetInnerHTML`, so the allowlist here is the security boundary:
 *
 *  - only formatting tags survive; scripts, embeds, forms, SVG/MathML and
 *    inline styles are stripped;
 *  - links survive only with http(s), mailto or tel protocols, and always get
 *    `target="_blank" rel="noopener noreferrer"` so a shared resume cannot
 *    reach back into the opener window;
 *  - when no DOM is available (SSR without jsdom), everything is escaped rather
 *    than trusted.
 */

import DOMPurify from 'dompurify';

export const RICH_TEXT_ALLOWED_TAGS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'span', 'a',
  'ul', 'ol', 'li', 'blockquote', 'code', 'pre',
  'h1', 'h2', 'h3', 'h4',
] as const;

export const RICH_TEXT_ALLOWED_ATTR = ['href', 'title', 'target', 'rel', 'class'] as const;

const SAFE_PROTOCOL = /^(?:https?:|mailto:|tel:)/i;

let hookInstalled = false;

function installLinkPolicy() {
  if (hookInstalled) return;
  if (typeof window === 'undefined' || !DOMPurify.addHook) return;
  DOMPurify.addHook('afterSanitizeAttributes', (node: any) => {
    if (!node || node.nodeName !== 'A') return;
    const href = node.getAttribute('href') || '';
    if (!SAFE_PROTOCOL.test(href.trim())) {
      node.removeAttribute('href');
      node.removeAttribute('target');
      return;
    }
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  });
  hookInstalled = true;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function containsHtml(value: unknown): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(String(value ?? ''));
}

export function sanitizeRichText(input: unknown): string {
  const raw = String(input ?? '').trim();
  if (!raw) return '';
  if (typeof window === 'undefined' || typeof DOMPurify.sanitize !== 'function') {
    return escapeHtml(raw);
  }
  installLinkPolicy();
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: [...RICH_TEXT_ALLOWED_TAGS],
    ALLOWED_ATTR: [...RICH_TEXT_ALLOWED_ATTR],
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'svg', 'math', 'img', 'link', 'meta'],
    FORBID_ATTR: ['style', 'src', 'srcset', 'formaction', 'xlink:href', 'onerror', 'onclick'],
  });
}
