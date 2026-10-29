'use strict';

/**
 * Public portfolio publishing and collision-free slugs (DISC-039).
 *
 * SLUG CONTRACT
 *   pattern  ^[a-z0-9]+(?:-[a-z0-9]+)*$      (lowercase, hyphen-separated)
 *   length   3..40 characters
 *   reserved system paths are rejected with `RESERVED_SLUG` (400)
 *
 * UNIQUENESS
 *   `portfolios.slug` already carries the database-level `uq_portfolios_slug`
 *   unique index (migration 004). Publishing therefore does not "check then
 *   insert": it writes and lets the constraint arbitrate. Two concurrent
 *   requests for one slug produce exactly one winner; the loser receives
 *   `SLUG_ALREADY_EXISTS` (409) from `ER_DUP_ENTRY`, so the invariant holds even
 *   if both requests pass any application-side pre-check simultaneously.
 *
 *   Re-publishing with the portfolio's OWN current slug is not a conflict: the
 *   UPDATE targets that same row, so the unique index is never violated.
 *
 * UNPUBLISHING
 *   `isPublished: false` really unpublishes (`is_published = 0`) and the public
 *   read path requires `is_published = 1`, so the portfolio becomes unreachable
 *   immediately in the same commit. The slug is retained so republishing keeps
 *   the address the owner already shared.
 */

const { getPool } = require('../database/mysql');

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG_MIN_LENGTH = 3;
const SLUG_MAX_LENGTH = 40;
const PORTFOLIO_ID_PATTERN = /^[A-Za-z0-9_-]{4,128}$/;

/**
 * System paths that must never be claimable as a portfolio address.
 *
 * The base list is the contract; the rest are real top-level routes/surfaces of
 * this application (backend mounts under /api plus the frontend's first path
 * segment), so a portfolio cannot shadow the app's own navigation.
 */
const RESERVED_SLUGS = Object.freeze([
  // contract
  'api', 'admin', 'login', 'support', 'billing', 'enterprise', 'dashboard', 'auth',
  // real application surfaces
  'public', 'portfolios', 'resumes', 'covers', 'jobs', 'job-tracker', 'blog',
  'signup', 'register', 'settings', 'checkout', 'payments', 'payment', 'invoice',
  'invoices', 'pricing', 'contact', 'terms', 'privacy', 'about', 'help', 'faq',
  'health', 'healthz', 'readyz', 'status', 'static', 'assets', 'images', 'css',
  'js', 'favicon.ico', 'robots.txt', 'sitemap.xml', 'portfolio', 'employer',
  'candidate', 'messages', 'notifications', 'live-interview', 'platform',
  'internal', 'system', 'webhooks', 'logout', 'profile', 'account', 'monitoring',
  'grafana', 'playground', 'preview', 'exports', 'download', 'share',
]);

const RESERVED_SLUG_SET = new Set(RESERVED_SLUGS);

function publishingError(code, message, status = 400) {
  return Object.assign(new Error(message), { code, status });
}

function normalizeSlug(value) {
  return String(value == null ? '' : value).trim().toLowerCase();
}

/**
 * Validate a requested public address.
 * @returns {string} the normalized slug
 * @throws {Error} INVALID_SLUG (400) | RESERVED_SLUG (400)
 */
function assertPublishableSlug(value) {
  const slug = normalizeSlug(value);
  if (!slug) {
    throw publishingError('INVALID_SLUG', 'A public address is required.');
  }
  if (slug.length < SLUG_MIN_LENGTH || slug.length > SLUG_MAX_LENGTH) {
    throw publishingError('INVALID_SLUG', `A public address must be ${SLUG_MIN_LENGTH}-${SLUG_MAX_LENGTH} characters long.`);
  }
  if (!SLUG_PATTERN.test(slug)) {
    throw publishingError('INVALID_SLUG', 'A public address may contain lowercase letters, digits and single hyphens only.');
  }
  if (RESERVED_SLUG_SET.has(slug)) {
    throw publishingError('RESERVED_SLUG', 'That public address is reserved by the platform.');
  }
  return slug;
}

function assertPortfolioId(value) {
  const id = String(value == null ? '' : value).trim();
  if (!PORTFOLIO_ID_PATTERN.test(id)) {
    throw publishingError('INVALID_PORTFOLIO_ID', 'Invalid portfolio identifier.');
  }
  return id;
}

/**
 * Publish or unpublish one portfolio.
 *
 * @returns {Promise<{portfolioId:string, slug:string|null, isPublished:boolean, publishedAt:string|null, revision:number}>}
 */
async function publishPortfolio({ userId, portfolioId, slug, isPublished = true, pool = getPool() }) {
  if (!userId) throw publishingError('AUTH_REQUIRED', 'Authentication is required.', 401);
  const id = assertPortfolioId(portfolioId);
  const publish = isPublished !== false;
  const requestedSlug = publish ? assertPublishableSlug(slug) : null;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      'SELECT id, user_id, slug, is_published, published_at, revision FROM portfolios WHERE id = ? FOR UPDATE',
      [id]
    );
    const current = rows[0];
    // Ownership is enforced in the query result, never by a client-supplied id.
    if (!current || String(current.user_id) !== String(userId)) {
      throw publishingError('PORTFOLIO_NOT_FOUND', 'Portfolio not found.', 404);
    }

    const nextRevision = Number(current.revision || 1) + 1;
    if (!publish) {
      await connection.query(
        'UPDATE portfolios SET is_published = 0, revision = ? WHERE id = ? AND user_id = ?',
        [nextRevision, id, userId]
      );
      await connection.commit();
      return {
        portfolioId: id,
        slug: current.slug || null,
        isPublished: false,
        publishedAt: null,
        revision: nextRevision,
      };
    }

    try {
      await connection.query(
        `UPDATE portfolios
            SET slug = ?, is_published = 1,
                published_at = COALESCE(published_at, NOW(3)),
                revision = ?
          WHERE id = ? AND user_id = ?`,
        [requestedSlug, nextRevision, id, userId]
      );
    } catch (error) {
      if (error?.code === 'ER_DUP_ENTRY') {
        throw publishingError('SLUG_ALREADY_EXISTS', 'That public address is already in use.', 409);
      }
      throw error;
    }
    const [after] = await connection.query(
      'SELECT slug, is_published, published_at, revision FROM portfolios WHERE id = ?',
      [id]
    );
    await connection.commit();
    const row = after[0] || {};
    return {
      portfolioId: id,
      slug: row.slug || requestedSlug,
      isPublished: row.is_published === 1 || row.is_published === true,
      publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
      revision: Number(row.revision || nextRevision),
    };
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  PORTFOLIO_ID_PATTERN,
  RESERVED_SLUGS,
  RESERVED_SLUG_SET,
  SLUG_MAX_LENGTH,
  SLUG_MIN_LENGTH,
  SLUG_PATTERN,
  assertPortfolioId,
  assertPublishableSlug,
  normalizeSlug,
  publishPortfolio,
  publishingError,
};
