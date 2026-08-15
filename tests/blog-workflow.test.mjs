import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { blogPostFitsFirestore, normalizeBlogImageUrl, normalizeBlogPost, validateBlogTransition } from '../src/utils/blogData.js';

test('canonical blog model preserves Unicode, SEO, tags, drafts, and bounded fields', () => {
  const post = normalizeBlogPost({
    title: 'अनुभव ✓', content: '<p>తెలుగు article</p>', excerpt: 'Summary', tags: ['AI', 'AI', ' careers '],
    seoTitle: 'Search title', seoDescription: 'Search description', status: 'draft', revision: 4,
  });
  assert.equal(post.title, 'अनुभव ✓');
  assert.match(post.content, /తెలుగు/);
  assert.deepEqual(post.tags, ['AI', 'careers']);
  assert.equal(post.seoTitle, 'Search title');
  assert.equal(post.status, 'draft');
  assert.equal(post.revision, 4);
});

test('blog media permits only bounded HTTPS or same-origin paths', () => {
  assert.equal(normalizeBlogImageUrl('https://cdn.example/image.png'), 'https://cdn.example/image.png');
  assert.equal(normalizeBlogImageUrl('/images/article.webp'), '/images/article.webp');
  assert.equal(normalizeBlogImageUrl('javascript:alert(1)'), '');
  assert.equal(normalizeBlogImageUrl('data:image/svg+xml,<svg/>'), '');
  assert.equal(normalizeBlogImageUrl('https://user:pass@example.com/image.jpg'), '');
});

test('member and administrator publishing transitions remain distinct', () => {
  assert.equal(validateBlogTransition('draft', 'pending'), true);
  assert.equal(validateBlogTransition('rejected', 'draft'), true);
  assert.equal(validateBlogTransition('pending', 'approved'), false);
  assert.equal(validateBlogTransition('approved', 'draft'), false);
  assert.equal(validateBlogTransition('pending', 'scheduled', { isAdmin: true }), true);
  assert.equal(validateBlogTransition('scheduled', 'approved', { isAdmin: true }), true);
});

test('oversized articles fail the Firestore size boundary', () => {
  assert.equal(blogPostFitsFirestore({ title: 'Small', content: 'x'.repeat(1000) }), true);
  assert.equal(blogPostFitsFirestore({ title: 'Large', content: 'x'.repeat(910_000) }), false);
});

test('CMS implementation uses revisions, private drafts, scheduling, sanitized preview, and public SEO', async () => {
  const [operations, editor, publicPost, publicList, card, backend] = await Promise.all([
    fs.readFile('src/firestore/dbOperations.js', 'utf8'),
    fs.readFile('src/components/Blog/BlogEditor/BlogEditor.jsx', 'utf8'),
    fs.readFile('src/components/Blog/BlogPost/BlogPost.jsx', 'utf8'),
    fs.readFile('src/components/Blog/BlogList/BlogList.jsx', 'utf8'),
    fs.readFile('src/components/Blog/components/BlogCard.jsx', 'utf8'),
    fs.readFile('backend/index.js', 'utf8'),
  ]);
  assert.match(operations, /BLOG_CONFLICT/);
  assert.match(operations, /status:\s*normalized\.status === 'pending' \? 'pending' : 'draft'/);
  assert.match(editor, /handleSave\(false\)/);
  assert.match(editor, /BlogPreviewModal/);
  assert.match(editor, /emitUpdate:\s*false/);
  assert.match(editor, /aria-live="polite"/);
  assert.match(editor, /role="dialog"/);
  assert.match(editor, /sanitizeImageUrl\(imageUrl\)/);
  assert.match(editor, /sanitizeBlogHtml/);
  assert.match(publicPost, /BlogPosting/);
  assert.match(publicPost, /index,follow/);
  assert.match(publicPost, /noindex,nofollow/);
  assert.match(publicList, /requestGeneration/);
  assert.match(publicList, /role="alert"/);
  assert.match(card, /sanitizeImageUrl/);
  assert.match(backend, /CMS_SCHEDULED_POSTS_PUBLISHED/);
  assert.match(backend, /\/api\/admin\/blog\/posts\/:postId/);
  assert.match(backend, /INVALID_BLOG_TRANSITION/);
  assert.match(backend, /blog_scheduled_published/);
  assert.match(operations, /\/api\/admin\/blog\/posts/);
});
