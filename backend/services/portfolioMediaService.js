'use strict';

/**
 * Portfolio Case Study Media Gallery Service
 *
 * Implements FP-C07 (Portfolio Case Study Gallery & Media Upload).
 * Enforces strict MIME validation, 5MB file-size limits, owner tenancy,
 * and display ordering for project case studies.
 */

const crypto = require('node:crypto');

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
]);

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 Megabytes

function generateMediaId() {
  return `pm_${crypto.randomBytes(16).toString('hex')}`;
}

function validateMediaPayload({ mimeType, fileSize, url }) {
  const normalizedMime = String(mimeType || '').trim().toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(normalizedMime)) {
    throw Object.assign(
      new Error(`Unsupported media type: '${mimeType}'. Allowed types: PNG, JPEG, WEBP, GIF, SVG.`),
      { code: 'INVALID_MIME_TYPE', status: 400 }
    );
  }

  const numericSize = Number(fileSize);
  if (numericSize > MAX_FILE_SIZE_BYTES) {
    throw Object.assign(
      new Error(`File size ${numericSize} bytes exceeds the maximum limit of 5MB.`),
      { code: 'FILE_TOO_LARGE', status: 413 }
    );
  }

  if (!url || typeof url !== 'string' || url.trim().length === 0) {
    throw Object.assign(new Error('Media URL or data payload is required.'), {
      code: 'MISSING_MEDIA_URL',
      status: 400,
    });
  }

  return { mimeType: normalizedMime, fileSize: numericSize };
}

async function listGalleryMedia(pool, { portfolioId, projectId = null }) {
  if (!portfolioId) {
    throw Object.assign(new Error('Portfolio ID is required'), { code: 'INVALID_PARAMETERS', status: 400 });
  }

  let query = `
    SELECT id, portfolio_id AS portfolioId, user_id AS userId, project_id AS projectId,
           title, caption, media_type AS mediaType, mime_type AS mimeType,
           file_size AS fileSize, storage_key AS storageKey, url,
           display_order AS displayOrder, created_at AS createdAt, updated_at AS updatedAt
    FROM portfolio_media
    WHERE portfolio_id = ?
  `;
  const params = [portfolioId];

  if (projectId) {
    query += ' AND (project_id = ? OR project_id IS NULL)';
    params.push(projectId);
  }

  query += ' ORDER BY display_order ASC, created_at ASC';

  const [rows] = await pool.query(query, params);
  return rows.map((r) => ({
    id: r.id,
    portfolioId: r.portfolioId,
    projectId: r.projectId,
    title: r.title,
    caption: r.caption,
    mediaType: r.mediaType,
    mimeType: r.mimeType,
    fileSize: Number(r.fileSize),
    storageKey: r.storageKey,
    url: r.url,
    displayOrder: Number(r.displayOrder),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

async function addGalleryMedia(pool, {
  userId,
  portfolioId,
  projectId = null,
  title = '',
  caption = '',
  mediaType = 'IMAGE',
  mimeType,
  fileSize,
  url,
  storageKey = null,
  displayOrder = null,
}) {
  if (!portfolioId || !userId) {
    throw Object.assign(new Error('Portfolio ID and User ID are required.'), { code: 'INVALID_PARAMETERS', status: 400 });
  }

  // Verify portfolio owner
  const [portfolios] = await pool.query(
    'SELECT id, user_id FROM portfolios WHERE id = ? LIMIT 1',
    [portfolioId]
  );
  if (!portfolios.length || portfolios[0].user_id !== userId) {
    throw Object.assign(new Error('Portfolio not found or access denied.'), { code: 'PORTFOLIO_NOT_FOUND', status: 404 });
  }

  const validated = validateMediaPayload({ mimeType, fileSize, url });
  const mediaId = generateMediaId();
  const effectiveStorageKey = storageKey || `portfolios/${portfolioId}/media/${mediaId}`;

  let effectiveOrder = Number(displayOrder);
  if (Number.isNaN(effectiveOrder) || effectiveOrder === null) {
    const [maxOrderRows] = await pool.query(
      'SELECT COALESCE(MAX(display_order), 0) + 1 AS nextOrder FROM portfolio_media WHERE portfolio_id = ?',
      [portfolioId]
    );
    effectiveOrder = Number(maxOrderRows[0]?.nextOrder || 1);
  }

  await pool.query(
    `INSERT INTO portfolio_media
       (id, portfolio_id, user_id, project_id, title, caption, media_type, mime_type, file_size, storage_key, url, display_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      mediaId,
      portfolioId,
      userId,
      projectId || null,
      String(title || '').slice(0, 200),
      caption ? String(caption).slice(0, 5000) : null,
      mediaType,
      validated.mimeType,
      validated.fileSize,
      effectiveStorageKey,
      url,
      effectiveOrder,
    ]
  );

  return {
    id: mediaId,
    portfolioId,
    projectId: projectId || null,
    title: String(title || ''),
    caption: caption || null,
    mediaType,
    mimeType: validated.mimeType,
    fileSize: validated.fileSize,
    storageKey: effectiveStorageKey,
    url,
    displayOrder: effectiveOrder,
  };
}

async function deleteGalleryMedia(pool, { userId, portfolioId, mediaId }) {
  if (!portfolioId || !userId || !mediaId) {
    throw Object.assign(new Error('Portfolio ID, User ID and Media ID are required.'), { code: 'INVALID_PARAMETERS', status: 400 });
  }

  const [res] = await pool.query(
    'DELETE FROM portfolio_media WHERE id = ? AND portfolio_id = ? AND user_id = ?',
    [mediaId, portfolioId, userId]
  );

  if (res.affectedRows === 0) {
    throw Object.assign(new Error('Media item not found or unauthorized.'), { code: 'MEDIA_NOT_FOUND', status: 404 });
  }

  return { success: true, mediaId };
}

async function reorderGalleryMedia(pool, { userId, portfolioId, mediaIds }) {
  if (!portfolioId || !userId || !Array.isArray(mediaIds)) {
    throw Object.assign(new Error('Invalid parameters for media reordering.'), { code: 'INVALID_PARAMETERS', status: 400 });
  }

  // Verify ownership
  const [portfolios] = await pool.query(
    'SELECT id, user_id FROM portfolios WHERE id = ? LIMIT 1',
    [portfolioId]
  );
  if (!portfolios.length || portfolios[0].user_id !== userId) {
    throw Object.assign(new Error('Portfolio not found or unauthorized.'), { code: 'PORTFOLIO_NOT_FOUND', status: 404 });
  }

  for (let index = 0; index < mediaIds.length; index += 1) {
    const mediaId = String(mediaIds[index]);
    await pool.query(
      'UPDATE portfolio_media SET display_order = ? WHERE id = ? AND portfolio_id = ?',
      [index + 1, mediaId, portfolioId]
    );
  }

  return { success: true, count: mediaIds.length };
}

module.exports = {
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  listGalleryMedia,
  addGalleryMedia,
  deleteGalleryMedia,
  reorderGalleryMedia,
};
