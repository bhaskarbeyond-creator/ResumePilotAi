'use strict';

/**
 * The single authoritative public portfolio read.
 *
 * Both public API aliases call THIS function:
 *   GET /api/public/portfolios/:slug      (new canonical public route)
 *   GET /api/portfolios/public/:slug      (contract the frontend already uses)
 *
 * They cannot drift apart: same validation, same persistence call, same DTO.
 *
 * PRIVACY: the response is an ALLOWLIST. Anything the storage layer happens to
 * return — `userId`, `revision`, billing fields, internal timestamps, draft
 * content — is dropped unless it is explicitly named here. Drafts and
 * unpublished portfolios are 404 indistinguishable from unknown slugs.
 */

const PUBLIC_PORTFOLIO_FIELDS = Object.freeze([
  'id', 'title', 'theme', 'slug', 'isPublished', 'isPasswordProtected', 'publishedAt', 'metadata', 'data',
]);
const PUBLIC_FIELD_SET = new Set(PUBLIC_PORTFOLIO_FIELDS);
// Defensive deny-list: even if a field were added to the allowlist by mistake,
// these can never cross the anonymous boundary.
const FORBIDDEN_PUBLIC_FIELDS = Object.freeze([
  'userId', 'user_id', 'email', 'ownerEmail', 'revision', 'billing', 'billingSnapshot',
  'customerSnapshot', 'supplierSnapshot', 'gstin', 'paymentOrderId', 'extra_data', 'password_hash',
]);

// Matches the storage slug shape (published slugs may be up to 180 chars: the
// repository's derived `<base>-<8 hex>` form plus explicitly published slugs).
const PUBLIC_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,178}[a-z0-9])?$/;

function invalidSlug() {
  return Object.assign(new Error('Invalid portfolio address.'), {
    code: 'INVALID_PORTFOLIO_SLUG',
    status: 400,
  });
}

function normalizePublicSlug(value) {
  const slug = String(value == null ? '' : value).trim().toLowerCase();
  if (!PUBLIC_SLUG_PATTERN.test(slug)) throw invalidSlug();
  return slug;
}

/** Project a stored record onto the public allowlist. */
function toPublicPortfolio(record) {
  if (!record || typeof record !== 'object') return null;
  const projected = {};
  for (const key of Object.keys(record)) {
    if (!PUBLIC_FIELD_SET.has(key)) continue;
    if (FORBIDDEN_PUBLIC_FIELDS.includes(key)) continue;
    projected[key] = record[key];
  }
  if (!projected.id || !projected.slug) return null;
  const result = {
    id: projected.id,
    title: projected.title,
    theme: projected.theme,
    slug: projected.slug,
    isPublished: true,
    publishedAt: projected.publishedAt || null,
    metadata: projected.metadata || { description: '', tags: [], seoTitle: '', seoDescription: '' },
    data: projected.data || { content: [], root: { props: {} }, canonical: null },
  };
  if (projected.isPasswordProtected !== undefined) {
    result.isPasswordProtected = Boolean(projected.isPasswordProtected);
  }
  return result;
}

/**
 * @returns {Promise<object|null>} the public DTO, or null when the slug is not
 *   published (draft, unpublished, or nonexistent — all indistinguishable).
 */
async function getPublicPortfolio({ repository, slug }) {
  if (!repository || typeof repository.getPublishedPortfolioBySlug !== 'function') {
    throw Object.assign(new Error('Portfolio storage is unavailable.'), {
      code: 'PORTFOLIO_STORAGE_UNAVAILABLE',
      status: 503,
    });
  }
  const normalized = normalizePublicSlug(slug);
  const record = await repository.getPublishedPortfolioBySlug(normalized);
  return toPublicPortfolio(record);
}

module.exports = {
  FORBIDDEN_PUBLIC_FIELDS,
  PUBLIC_PORTFOLIO_FIELDS,
  PUBLIC_SLUG_PATTERN,
  getPublicPortfolio,
  normalizePublicSlug,
  toPublicPortfolio,
};
