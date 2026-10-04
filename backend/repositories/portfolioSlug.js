'use strict';

/**
 * Shared, pure Portfolio slug derivation (DIR-019 AC-3).
 *
 * WHY THIS IS ITS OWN MODULE:
 *   `MySQLRepository.savePortfolio` derives the persisted slug as
 *   `<normalized base>-<8 hex chars of sha256(portfolioId)>`. The studio's
 *   vanity-URL checker MUST reproduce that derivation exactly, otherwise the
 *   badge would answer a different question than the one the write path will
 *   actually enforce ("is this available?" vs "will my exact URL collide?").
 *
 * Keeping the derivation here means the availability probe and the save path
 * cannot drift apart, and the debounced client-side badge can share the SAME
 * normalizer (it is re-exported verbatim through the API layer for the
 * pre-flight validation the spec asks for).
 *
 * INVARIANT: this function performs NO I/O and never mutates its input, so it
 * is safe to call from a hot render path and from tests.
 */

const crypto = require('crypto');

/** Max base length before the 8-char disambiguator suffix is appended. */
const SLUG_BASE_MAX = 130;

/**
 * Lowercase, NFKD-fold, and hyphenate arbitrary candidate text into a slug base.
 * Mirrors the exact chain used by the repository save path.
 *
 * @param {unknown} input
 * @returns {string} slug base, or '' when the input has no usable characters
 */
function normalizeSlugBase(input) {
    const supplied = String(input == null ? '' : input).trim().toLowerCase();
    const base = supplied
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, SLUG_BASE_MAX);
    return base;
}

/**
 * Deterministic 8-char disambiguator derived from the portfolio primary key.
 *
 * @param {unknown} portfolioId
 * @returns {string}
 */
function slugSuffix(portfolioId) {
    return crypto.createHash('sha256').update(String(portfolioId)).digest('hex').slice(0, 8);
}

/**
 * The exact slug the save path will persist for this (base, portfolioId) pair.
 *
 * @param {unknown} base raw candidate supplied by the candidate
 * @param {unknown} portfolioId the portfolio primary key
 * @param {string} fallbackTitle used when no base is supplied, matching the
 *   repository's `suppliedSlug || title.toLowerCase()` chain
 * @returns {string} e.g. "john-doe-3f9a12bc"
 */
function buildPortfolioSlug(base, portfolioId, fallbackTitle = '') {
    const slugBase = normalizeSlugBase(base) || normalizeSlugBase(fallbackTitle) || 'portfolio';
    return `${slugBase}-${slugSuffix(portfolioId)}`;
}

module.exports = { SLUG_BASE_MAX, normalizeSlugBase, slugSuffix, buildPortfolioSlug };