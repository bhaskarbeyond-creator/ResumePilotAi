'use strict';

const express = require('express');
const { getRepository } = require('../repositories');
const { normalizeGeoSeoSettings } = require('../services/discoveryMetadata');
const {
    buildLocationMatch,
    listCanonicalRegions,
    resolveRegion,
    summarizeRegion,
} = require('../services/geoRegionalService');
const { renderSocialPreviewPng, summarizeSalary } = require('../services/socialPreview');

const router = express.Router();

function repositoryForRequest(req) {
    const provider = req.app.locals.publicDiscoveryRepositoryProvider || getRepository;
    return provider();
}

function failClosed(res, code, message, status = 503) {
    return res.status(status).json({ success: false, code, error: message });
}

async function readGeoSettings(repository) {
    const publicConfig = await repository.getSetting('public_config');
    return normalizeGeoSeoSettings(publicConfig?.geoSeo || {});
}

function plainText(value, limit = 180) {
    return String(value ?? '')
        .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, limit);
}

function isVisibleJob(job, now = Date.now()) {
    if (!job || String(job.status || '').trim().toLowerCase() !== 'active') return false;
    if (job.deleted_at || job.deletedAt || job.tombstoned || job.is_deleted || job.isDeleted) return false;
    const expiry = job.expires_at || job.expiresAt;
    if (!expiry) return true;
    const expiresAt = new Date(expiry).getTime();
    return Number.isFinite(expiresAt) && expiresAt > now;
}

function isPublishedPost(post) {
    return Boolean(post) && (post.published === true || Number(post.published) === 1);
}

function pngResponse(res, png) {
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.status(200).set('Content-Type', 'image/png').send(png);
}

router.get('/geo/regions', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    let repository;
    try {
        repository = repositoryForRequest(req);
        const settings = await readGeoSettings(repository);
        if (!settings.enableGeoSeo) return failClosed(res, 'GEO_DISCOVERY_NOT_PUBLISHED', 'Regional job hubs are not published.', 404);
        return res.json({ success: true, ...listCanonicalRegions() });
    } catch (error) {
        console.error('[public geo regions]', { code: error.code || 'GEO_SETTINGS_UNAVAILABLE', requestId: res.locals.requestId });
        return failClosed(res, 'GEO_SETTINGS_UNAVAILABLE', 'Regional job information is temporarily unavailable.');
    }
});

router.get('/geo/regions/:kind/:slug', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
        const kind = req.params.kind === 'city' ? 'city' : req.params.kind === 'in' ? 'state' : '';
        const region = kind ? resolveRegion(req.params.slug) : null;
        if (!region || region.kind !== kind) return failClosed(res, 'REGION_NOT_FOUND', 'This regional job hub is not available.', 404);

        const repository = repositoryForRequest(req);
        const settings = await readGeoSettings(repository);
        if (!settings.enableGeoSeo) return failClosed(res, 'GEO_DISCOVERY_NOT_PUBLISHED', 'Regional job hubs are not published.', 404);
        if (typeof repository.getRegionalJobs !== 'function' || typeof repository.getRegionalJobStats !== 'function') {
            return failClosed(res, 'GEO_DATA_UNAVAILABLE', 'Regional job information is temporarily unavailable.');
        }

        const column = region.kind === 'state' ? 'region_state' : 'region_city';
        const { binds: likeBinds } = buildLocationMatch(region);
        const query = { kind: region.kind, slug: region.slug, column, likeBinds };
        const [rows, stats] = await Promise.all([
            repository.getRegionalJobs({ ...query, limit: 24 }),
            repository.getRegionalJobStats(query),
        ]);
        return res.json({ success: true, region: summarizeRegion(region, rows, stats) });
    } catch (error) {
        console.error('[public regional jobs]', { code: error.code || 'GEO_DATA_UNAVAILABLE', requestId: res.locals.requestId });
        return failClosed(res, 'GEO_DATA_UNAVAILABLE', 'Regional job information is temporarily unavailable.');
    }
});

router.get('/jobs/:jobId/og.png', async (req, res) => {
    try {
        const repository = repositoryForRequest(req);
        const job = await repository.getJob(req.params.jobId);
        if (!isVisibleJob(job)) return res.status(404).type('text/plain').send('Preview not found.\n');
        const location = plainText(job.location, 80);
        const type = plainText(job.job_type || job.jobType, 30);
        const detail = [type, location].filter(Boolean).join(' · ');
        const png = await renderSocialPreviewPng({
            kind: 'Job opportunity',
            title: plainText(job.title, 140),
            company: plainText(job.company_name || job.companyName, 70),
            detail,
            salary: summarizeSalary(job),
            posted: job.created_at ? `Posted ${new Date(job.created_at).toLocaleDateString('en-IN')}` : '',
        });
        return pngResponse(res, png);
    } catch (error) {
        console.error('[job social preview]', { code: error.code || 'SOCIAL_PREVIEW_UNAVAILABLE', requestId: res.locals.requestId });
        return res.status(503).type('text/plain').send('Preview temporarily unavailable.\n');
    }
});

router.get('/blog/:slug/og.png', async (req, res) => {
    try {
        const repository = repositoryForRequest(req);
        const post = await repository.getBlogPostBySlug(req.params.slug);
        if (!isPublishedPost(post)) return res.status(404).type('text/plain').send('Preview not found.\n');
        const png = await renderSocialPreviewPng({
            kind: 'Career article',
            title: plainText(post.title, 140),
            company: plainText(post.category || 'IME365 career resources', 70),
            detail: plainText(post.excerpt || post.metaDescription || post.description, 110),
            posted: post.publishedAt || post.published_at
                ? `Published ${new Date(post.publishedAt || post.published_at).toLocaleDateString('en-IN')}`
                : '',
        });
        return pngResponse(res, png);
    } catch (error) {
        console.error('[blog social preview]', { code: error.code || 'SOCIAL_PREVIEW_UNAVAILABLE', requestId: res.locals.requestId });
        return res.status(503).type('text/plain').send('Preview temporarily unavailable.\n');
    }
});

module.exports = { publicDiscoveryRouter: router, isPublishedPost, isVisibleJob, plainText };
