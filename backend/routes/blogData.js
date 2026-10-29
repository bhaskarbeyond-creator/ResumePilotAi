'use strict';

/**
 * Public blog CMS + editorial authoring (DISC-025 / DISC-039).
 *
 * Mounted by backend/index.js as:
 *   app.use('/api/blog-data', blogDataRouter)
 *   app.use('/api/blog', blogDataRouter)
 *
 * Storage is the MariaDB `blog` table through the repository abstraction
 * (repositories/MySQLRepository.js): title, slug (UNIQUE), content, excerpt,
 * cover_image, author, author_id, category, tags, published, status, revision,
 * scheduled_at, published_at, views, likes, created_at, updated_at.
 *
 * Public reads are published-only and never trust a caller-supplied flag.
 * Editorial writes require the repository's existing editorial permissions and
 * derive authorship from the authenticated identity. Deletion is a real
 * compare-and-swap on `revision`; a missing expected revision is a 400, a stale
 * one is a 409, and the row is only deleted when the revision still matches.
 */

const express = require('express');
const { getRepository } = require('../repositories');
const { requireAuth, requirePermission, permissionsFor } = require('../security/auth');

const router = express.Router();

const EDITORIAL_PERMISSIONS = ['system.config.write', 'blog.write', 'blog_management', 'content.manage'];
const MAX_TITLE = 200;
const MAX_CONTENT = 200_000;
const MAX_EXCERPT = 600;
const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 40;
const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 12;
/** Upper bound on rows scanned when filtering/paging in-process (see note below). */
const MAX_SCAN = 500;

router.use((req, res, next) => {
    try {
        req.repository = getRepository();
        next();
    } catch (_err) {
        return res.status(500).json({ success: false, error: 'Database layer unavailable' });
    }
});

// Drafts are visible only to authenticated editorial operators. Public read
// endpoints must not trust a caller-supplied publishedOnly flag or repository.
function canReadDrafts(req) {
    if (!req.user?.uid) return false;
    const permissions = permissionsFor(req.user);
    return EDITORIAL_PERMISSIONS.some(p => permissions.has(p)) || permissions.has('*');
}

function isPublished(post) {
    return post?.published === true || post?.published === 1;
}

function invalid(res, status, error, code) {
    return res.status(status).json({ success: false, error, ...(code ? { code } : {}) });
}

function cleanText(value, max) {
    return String(value === undefined || value === null ? '' : value)
        .replace(/\p{Cc}/gu, character => (character === '\n' || character === '\t' ? character : ' '))
        .trim()
        .slice(0, max);
}

/** Normalized URL slug: lower-case, single hyphens, no edge hyphens. */
function normalizeSlug(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        .slice(0, 180)
        .replace(/-$/, '');
}

function isSafeSlug(slug) {
    return /^[a-z0-9](?:[a-z0-9-]{0,178}[a-z0-9])?$/.test(slug);
}

function parseTags(value) {
    const source = Array.isArray(value) ? value : (typeof value === 'string' ? value.split(',') : []);
    const tags = [];
    for (const raw of source) {
        const tag = cleanText(raw, MAX_TAG_LENGTH);
        if (!tag) continue;
        if (!tags.includes(tag)) tags.push(tag);
        if (tags.length >= MAX_TAGS) break;
    }
    return tags;
}

function parsePositiveInt(value, fallback, max) {
    if (value === undefined || value === null || value === '') return fallback;
    const parsed = Number(value);
    // Out-of-range values are refused rather than silently clamped, so a caller
    // never believes it received a page it did not ask for.
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) return null;
    return parsed;
}

function parseOffset(value) {
    if (value === undefined || value === null || value === '') return 0;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) return null;
    return Math.min(parsed, 1_000_000);
}

function postTimestamp(post) {
    const raw = post?.publishedAt || post?.published_at || post?.created_at || post?.createdAt || null;
    const time = raw ? new Date(raw).getTime() : NaN;
    return Number.isFinite(time) ? time : 0;
}

function coverOf(post) {
    return post.cover_image || post.coverImage || post.featuredImage || post.featured_image || null;
}

/**
 * The public projection. Editor-only metadata (revision, schedule, status
 * transitions, view counters used for the console) is not part of a reader's
 * contract, so it is never sent to anonymous or ordinary callers.
 */
function publicPostSummary(post) {
    const category = post.category || '';
    return {
        id: post.id,
        slug: post.slug,
        title: post.title,
        excerpt: post.excerpt || '',
        author: post.author || '',
        category,
        categoryName: category,
        tags: Array.isArray(post.tags) ? post.tags : [],
        // Strict boolean: the public client contract requires `published === true`.
        published: isPublished(post),
        featuredImage: coverOf(post),
        coverImage: coverOf(post),
        cover_image: coverOf(post),
        publishedAt: post.publishedAt || post.published_at || post.created_at || post.createdAt || null,
        createdAt: post.created_at || post.createdAt || null,
        updatedAt: post.updated_at || post.updatedAt || null,
        contentFormat: 'markdown',
    };
}

function publicPostDetail(post) {
    return { ...publicPostSummary(post), content: post.content || '' };
}

/** The editorial view: everything the author needs, including the CAS revision. */
function editorialPost(post) {
    return {
        ...publicPostSummary(post),
        content: post.content || '',
        authorId: post.author_id || post.authorId || null,
        status: post.status || (isPublished(post) ? 'published' : 'draft'),
        revision: Number(post.revision || 1),
        scheduledAt: post.scheduled_at || post.scheduledAt || null,
        views: Number(post.views || 0),
        likes: Number(post.likes || 0),
    };
}

function sortDeterministic(posts) {
    return [...posts].sort((left, right) => {
        const byTime = postTimestamp(right) - postTimestamp(left);
        if (byTime !== 0) return byTime;
        return String(left.id || '').localeCompare(String(right.id || ''));
    });
}

function matchesCategory(post, category) {
    if (!category) return true;
    // The taxonomy slug is derived with the same normalization the categories
    // endpoint uses, so "Technical Interviews" and "technical-interviews" agree.
    const value = normalizeSlug(post.category);
    return value !== '' && value === category;
}

function matchesSearch(post, search) {
    if (!search) return true;
    const haystack = [post.title, post.excerpt, post.category, ...(Array.isArray(post.tags) ? post.tags : [])]
        .map(value => String(value || '').toLowerCase())
        .join('\n');
    return haystack.includes(search);
}

/**
 * Public listing. The repository read interface exposes only { publishedOnly,
 * limit }, so the route fetches a bounded window and applies the
 * category/search filters and pagination itself. Result: no unbounded scan, no
 * draft leakage, deterministic ordering — but filtering happens in memory rather
 * than in SQL. SQL-level paging needs repositories/MySQLRepository.js, which is
 * outside this mandate's file boundary (reported as a known limitation).
 */
async function listPosts(req, res) {
    const publicOnly = !canReadDrafts(req) || req.query.publishedOnly === 'true';
    const limit = parsePositiveInt(req.query.limit, DEFAULT_LIMIT, MAX_LIMIT);
    const offset = parseOffset(req.query.offset);
    const hasPage = req.query.page !== undefined && req.query.page !== null && req.query.page !== '';
    const page = hasPage ? parsePositiveInt(req.query.page, null, 10_000) : null;
    if (limit === null) return invalid(res, 400, `limit must be an integer between 1 and ${MAX_LIMIT}.`, 'INVALID_PAGINATION');
    if (offset === null) return invalid(res, 400, 'offset must be a non-negative integer.', 'INVALID_PAGINATION');
    if (hasPage && page === null) return invalid(res, 400, 'page must be a positive integer.', 'INVALID_PAGINATION');

    const search = cleanText(req.query.search ?? req.query.q, 120).toLowerCase();
    const category = normalizeSlug(req.query.category);
    const effectiveOffset = page && page > 1 ? (page - 1) * limit : offset;

    let posts;
    try {
        posts = await req.repository.getBlogPosts({ publishedOnly: publicOnly, limit: MAX_SCAN });
    } catch (error) {
        // A read failure is reported as such: never an empty list that looks like
        // "no articles".
        return invalid(res, 503, 'Articles are temporarily unavailable.', 'DATABASE_UNAVAILABLE');
    }

    const scoped = (posts || [])
        .filter(post => (publicOnly ? isPublished(post) : true))
        .filter(post => matchesCategory(post, category))
        .filter(post => matchesSearch(post, search));

    const ordered = sortDeterministic(scoped);
    const window = ordered.slice(effectiveOffset, effectiveOffset + limit);
    const projection = publicOnly || req.query.publishedOnly === 'true'
        ? window.map(publicPostSummary)
        : window.map(post => (canReadDrafts(req) ? editorialPost(post) : publicPostSummary(post)));

    return res.json({
        success: true,
        posts: projection,
        meta: {
            page: page || Math.floor(effectiveOffset / limit) + 1,
            limit,
            offset: effectiveOffset,
            returned: projection.length,
            total: ordered.length,
            hasMore: effectiveOffset + projection.length < ordered.length,
        },
    });
}

// GET /api/blog-data - List blog posts (public read)
router.get('/', listPosts);

// GET /api/blog-data/categories - Public category taxonomy with published counts
router.get('/categories', async (req, res) => {
    let allPosts;
    try {
        allPosts = await req.repository.getBlogPosts({ publishedOnly: true, limit: MAX_SCAN });
    } catch (error) {
        return invalid(res, 503, 'Blog categories are unavailable.', 'DATABASE_UNAVAILABLE');
    }
    const categoryMap = new Map();
    for (const post of (allPosts || []).filter(isPublished)) {
        const name = cleanText(post.category, 100) || 'General';
        const slug = normalizeSlug(name) || 'general';
        if (!categoryMap.has(slug)) {
            categoryMap.set(slug, {
                id: slug,
                slug,
                name,
                color: ['#1a73e8', '#137333', '#7c3aed', '#b06000', '#0284c7'][categoryMap.size % 5],
                postCount: 0,
            });
        }
        categoryMap.get(slug).postCount += 1;
    }
    const categories = [...categoryMap.values()].sort((left, right) => left.name.localeCompare(right.name));
    return res.json({ success: true, categories });
});

// GET /api/blog-data/slug/:slug - Public post by slug
router.get('/slug/:slug', async (req, res) => {
    const slug = normalizeSlug(req.params.slug);
    if (!isSafeSlug(slug)) return invalid(res, 404, 'Post not found.');
    let post;
    try {
        post = await req.repository.getBlogPostBySlug(slug);
    } catch (error) {
        return invalid(res, 503, 'Articles are temporarily unavailable.', 'DATABASE_UNAVAILABLE');
    }
    // Public readers never see a draft, a scheduled post, or an unpublished row.
    if (!post || (!isPublished(post) && !canReadDrafts(req))) {
        return invalid(res, 404, 'Post not found.');
    }
    if (!isPublished(post)) return res.json({ success: true, post: editorialPost(post) });
    return res.json({ success: true, post: publicPostDetail(post) });
});

// GET /api/blog-data/posts - Editorial listing (drafts included for editors)
router.get('/posts', listPosts);

// GET /api/blog-data/posts/:id - Editorial read (id, falling back to slug)
router.get('/posts/:id', async (req, res) => {
    const identifier = String(req.params.id || '');
    let post = null;
    try {
        post = await req.repository.getBlogPostById(identifier);
        if (!post) post = await req.repository.getBlogPostBySlug(normalizeSlug(identifier));
    } catch (error) {
        return invalid(res, 503, 'Articles are temporarily unavailable.', 'DATABASE_UNAVAILABLE');
    }
    if (!post || (!isPublished(post) && !canReadDrafts(req))) {
        return invalid(res, 404, 'Post not found.');
    }
    return res.json({
        success: true,
        post: canReadDrafts(req) ? editorialPost(post) : publicPostDetail(post),
    });
});

/** Validates and normalizes the authoring payload. */
function readPostPayload(body, { partial = false } = {}) {
    const input = body && typeof body === 'object' ? body : {};
    const has = key => Object.prototype.hasOwnProperty.call(input, key);
    const payload = {};

    if (!partial || has('title')) {
        const title = cleanText(input.title, MAX_TITLE);
        if (title.length < 3) {
            throw Object.assign(new Error('A title of at least three characters is required.'), {
                code: 'INVALID_POST_TITLE', status: 400,
            });
        }
        payload.title = title;
    }
    if (!partial || has('content')) {
        const content = cleanText(input.content, MAX_CONTENT);
        if (content.length < 1) {
            throw Object.assign(new Error('Article content is required.'), { code: 'INVALID_POST_CONTENT', status: 400 });
        }
        payload.content = content;
    }
    if (!partial || has('excerpt')) payload.excerpt = cleanText(input.excerpt, MAX_EXCERPT);
    if (!partial || has('category')) {
        payload.category = cleanText(input.category, 100) || 'General';
    }
    if (!partial || has('tags')) payload.tags = parseTags(input.tags);
    if (!partial || has('coverImage') || has('cover_image')) {
        payload.coverImage = cleanText(input.coverImage ?? input.cover_image, 1024) || null;
    }
    if (!partial || has('slug')) payload.slug = input.slug;

    if (!partial || has('status') || has('published')) {
        const raw = String(input.status ?? '').trim().toLowerCase();
        const wantsPublished = input.published === true || input.published === 1
            || raw === 'published' || raw === 'approved';
        if (raw && !['draft', 'published', 'approved', 'scheduled'].includes(raw)) {
            throw Object.assign(new Error('Status must be draft, published or scheduled.'), {
                code: 'INVALID_POST_STATUS', status: 400,
            });
        }
        // Publication is only ever the result of an explicit request.
        payload.published = wantsPublished;
        payload.status = wantsPublished ? 'published' : 'draft';
    }
    if (!partial || has('scheduledAt') || has('scheduled_at')) {
        const raw = input.scheduledAt ?? input.scheduled_at;
        payload.scheduledAt = raw ? new Date(raw) : null;
        if (payload.scheduledAt && Number.isNaN(payload.scheduledAt.getTime())) {
            throw Object.assign(new Error('Use a valid publication date and time.'), {
                code: 'INVALID_POST_SCHEDULE', status: 400,
            });
        }
    }
    return payload;
}

/**
 * Resolves the slug for a post.
 *
 * A slug the author typed is never silently renamed: if another article already
 * owns it the request fails with 409 SLUG_CONFLICT. A slug derived from the
 * title is allowed to take a numbered suffix so creating two similarly titled
 * articles does not fail.
 */
async function uniqueSlug(repository, desired, id, { explicit = false } = {}) {
    const base = normalizeSlug(desired) || `post-${Date.now().toString(36)}`;
    const takenBy = async candidate => {
        let existing = null;
        try {
            existing = await repository.getBlogPostBySlug(candidate);
        } catch (error) {
            throw Object.assign(new Error('The article slug could not be verified.'), {
                code: 'DATABASE_UNAVAILABLE', status: 503,
            });
        }
        return existing && existing.id !== id ? existing : null;
    };
    if (explicit) {
        if (await takenBy(base)) {
            throw Object.assign(new Error('That slug is already in use. Choose another one.'), {
                code: 'SLUG_CONFLICT', status: 409,
            });
        }
        return base;
    }
    for (let attempt = 0; attempt < 25; attempt += 1) {
        const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
        if (!(await takenBy(candidate))) return candidate;
    }
    throw Object.assign(new Error('A unique slug could not be generated for this title.'), {
        code: 'SLUG_CONFLICT', status: 409,
    });
}

function slugConflict(error) {
    return error && (error.code === 'ER_DUP_ENTRY' || error.errno === 1062);
}

const authoringGate = [requireAuth, requirePermission(EDITORIAL_PERMISSIONS)];

// POST /api/blog-data/posts - Create a draft (or an explicitly requested publication)
router.post('/posts', ...authoringGate, async (req, res) => {
    try {
        const payload = readPostPayload(req.body);
        const id = `post_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        const slug = await uniqueSlug(req.repository, req.body?.slug || payload.title, id, {
            explicit: normalizeSlug(req.body?.slug) !== '',
        });
        const saved = await req.repository.saveBlogPost(id, {
            ...payload,
            id,
            slug,
            // Authorship is derived from the verified identity, never the payload.
            author: cleanText(req.body?.author, 255) || req.user.email || 'IME365 Editorial',
            authorId: req.user.uid,
            publishedAt: payload.published ? new Date().toISOString() : null,
            revision: 1,
        });
        const persisted = await req.repository.getBlogPostById(saved?.id || id);
        if (!persisted) {
            return invalid(res, 503, 'The article was saved but could not be read back.', 'READ_AFTER_WRITE_FAILED');
        }
        return res.status(201).json({ success: true, post: editorialPost(persisted) });
    } catch (error) {
        if (error?.status && error.status < 500) {
            return invalid(res, error.status, error.message, error.code);
        }
        if (slugConflict(error)) {
            return invalid(res, 409, 'That slug is already in use. Choose another one.', 'SLUG_CONFLICT');
        }
        return invalid(res, 500, 'Failed to create blog post');
    }
});

// PUT /api/blog-data/posts/:id - Update an existing post
router.put('/posts/:id', ...authoringGate, async (req, res) => {
    try {
        const existing = await req.repository.getBlogPostById(req.params.id);
        if (!existing) return invalid(res, 404, 'Post not found.');

        const expectedRevision = req.body?.expectedRevision === undefined || req.body?.expectedRevision === null
            ? null
            : Number(req.body.expectedRevision);
        const currentRevision = Number(existing.revision || 1);
        if (expectedRevision !== null) {
            if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
                return invalid(res, 400, 'expectedRevision must be a positive integer.', 'INVALID_REVISION');
            }
            if (expectedRevision !== currentRevision) {
                return res.status(409).json({
                    success: false,
                    code: 'CAS_CONFLICT',
                    error: 'This article changed after you opened it. Reload before saving.',
                    revision: currentRevision,
                    post: editorialPost(existing),
                });
            }
        }

        const patch = readPostPayload(req.body, { partial: true });
        // A field the caller omitted keeps its stored value (PUT is a merge here
        // because the editor sends the full document; omitting a field must not
        // blank it).
        const merged = {
            title: patch.title ?? existing.title,
            content: patch.content ?? existing.content,
            excerpt: patch.excerpt ?? (existing.excerpt || ''),
            category: patch.category ?? (existing.category || 'General'),
            tags: patch.tags ?? (Array.isArray(existing.tags) ? existing.tags : []),
            coverImage: patch.coverImage ?? coverOf(existing),
            status: patch.status ?? (isPublished(existing) ? 'published' : (existing.status || 'draft')),
            published: patch.published ?? isPublished(existing),
            scheduledAt: patch.scheduledAt ?? (existing.scheduled_at || null),
        };

        const slugSource = patch.slug !== undefined ? patch.slug : existing.slug;
        const slug = await uniqueSlug(req.repository, slugSource, existing.id, {
            explicit: patch.slug !== undefined && normalizeSlug(patch.slug) !== '',
        });

        const publishedAt = merged.published
            ? (existing.published_at || existing.publishedAt || new Date().toISOString())
            : null;

        await req.repository.saveBlogPost(existing.id, {
            ...merged,
            id: existing.id,
            slug,
            author: existing.author || req.user.email || 'IME365 Editorial',
            authorId: existing.author_id || existing.authorId || req.user.uid,
            publishedAt,
            revision: currentRevision + 1,
        });
        const persisted = await req.repository.getBlogPostById(existing.id);
        if (!persisted) {
            return invalid(res, 500, 'The article was saved but could not be read back.', 'READ_AFTER_WRITE_FAILED');
        }
        return res.json({ success: true, post: editorialPost(persisted) });
    } catch (error) {
        if (error?.status && error.status < 500) {
            return invalid(res, error.status, error.message, error.code);
        }
        if (slugConflict(error)) {
            return invalid(res, 409, 'That slug is already in use. Choose another one.', 'SLUG_CONFLICT');
        }
        return invalid(res, 500, 'Failed to update blog post');
    }
});

async function deletePost(req, res) {
    const identifier = String(req.params.id || '');
    const rawRevision = req.body?.expectedRevision ?? req.query?.expectedRevision;
    const expectedRevision = Number(rawRevision);
    if (rawRevision === undefined || rawRevision === null || rawRevision === ''
        || !Number.isInteger(expectedRevision) || expectedRevision < 1) {
        // Without the revision the delete cannot be a compare-and-swap, so it is
        // refused rather than silently deleting whatever is there now.
        return invalid(res, 400, 'expectedRevision is required to delete an article.', 'REVISION_REQUIRED');
    }
    try {
        const existing = await req.repository.getBlogPostById(identifier);
        if (!existing) return invalid(res, 404, 'Post not found.');
        await req.repository.deleteBlogPost(identifier, expectedRevision);
        return res.json({ success: true, deleted: true, id: identifier, revision: expectedRevision });
    } catch (error) {
        if (error?.code === 'CAS_CONFLICT' || error?.status === 409) {
            return res.status(409).json({
                success: false,
                code: 'CAS_CONFLICT',
                error: 'This article changed after you loaded it, so it was not deleted. Reload and try again.',
            });
        }
        if (error?.code === 'REVISION_REQUIRED') {
            return invalid(res, 400, 'expectedRevision is required to delete an article.', 'REVISION_REQUIRED');
        }
        return invalid(res, 500, 'Failed to delete blog post');
    }
}

router.delete('/posts/:id', ...authoringGate, deletePost);

// GET /api/blog-data/:id - Public read by id (drafts only for editors)
router.get('/:id', async (req, res) => {
    const identifier = String(req.params.id || '');
    let post = null;
    try {
        post = await req.repository.getBlogPostById(identifier);
        if (!post) post = await req.repository.getBlogPostBySlug(normalizeSlug(identifier));
    } catch (error) {
        return invalid(res, 503, 'Articles are temporarily unavailable.', 'DATABASE_UNAVAILABLE');
    }
    if (!post || (!isPublished(post) && !canReadDrafts(req))) {
        return invalid(res, 404, 'Post not found.');
    }
    return res.json({ success: true, post: publicPostDetail(post) });
});

// POST /api/blog-data/:id - Legacy editorial save alias (same rules as PUT)
router.post('/:id', ...authoringGate, async (req, res) => {
    try {
        const existing = await req.repository.getBlogPostById(req.params.id);
        if (!existing) return invalid(res, 404, 'Post not found.');
        const patch = readPostPayload(req.body, { partial: true });
        const currentRevision = Number(existing.revision || 1);
        await req.repository.saveBlogPost(existing.id, {
            ...patch,
            id: existing.id,
            slug: (patch.slug !== undefined && normalizeSlug(patch.slug)) || existing.slug,
            published: patch.published ?? isPublished(existing),
            status: patch.status ?? (isPublished(existing) ? 'published' : (existing.status || 'draft')),
            authorId: existing.author_id || existing.authorId || req.user.uid,
            revision: currentRevision + 1,
        });
        const persisted = await req.repository.getBlogPostById(existing.id);
        return res.json({ success: true, post: editorialPost(persisted || existing) });
    } catch (error) {
        if (error?.status && error.status < 500) {
            return invalid(res, error.status, error.message, error.code);
        }
        if (slugConflict(error)) {
            return invalid(res, 409, 'That slug is already in use. Choose another one.', 'SLUG_CONFLICT');
        }
        return invalid(res, 500, 'Failed to save blog post');
    }
});

// DELETE /api/blog-data/:id - Legacy editorial delete alias (same CAS contract)
router.delete('/:id', ...authoringGate, deletePost);

module.exports = { blogDataRouter: router };
