/**
 * DIR-104 (Tier 2) — seed REAL records so the parameterised templates are auditable.
 *
 * These are REAL rows in MariaDB (not mocks): a published portfolio (so /portfolio/:slug
 * resolves) and a published custom page (so /p/:custompage resolves). Idempotent.
 *
 * Usage: node scripts/seed-ux-templates.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from '../backend/node_modules/mysql2/promise.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = fs.readFileSync(path.join(ROOT, 'backend', '.env'), 'utf8');
const get = (k) => { const m = env.match(new RegExp(`^${k}=(.*)$`, 'm')); return m ? m[1].trim() : null; };

const c = await mysql.createConnection({
    host: get('DB_HOST') || '127.0.0.1',
    port: Number(get('DB_PORT') || 3306),
    user: get('DB_USER') || 'root',
    password: get('DB_PASSWORD') || undefined,
    database: get('DB_NAME') || 'ai_resume_builder',
});

const out = {};

// 1) Publish one portfolio so /portfolio/:slug resolves.
const [ports] = await c.query('SELECT id, user_id, title, data FROM portfolios ORDER BY id LIMIT 1');
if (ports.length) {
    const p = ports[0];
    await c.query('UPDATE portfolios SET slug=?, is_published=1, published_at=NOW() WHERE id=?', ['ux-audit-portfolio', p.id]);
    out.portfolioSlug = 'ux-audit-portfolio';
    out.portfolioId = p.id;
} else {
    out.portfolioSlug = null;
}

// 2) Create a published custom page so /p/:custompage resolves.
const [cp] = await c.query('SELECT id FROM custom_pages WHERE slug=? LIMIT 1', ['ux-audit-page']);
if (cp.length) {
    await c.query('UPDATE custom_pages SET published=1, status=? WHERE id=?', ['published', cp[0].id]);
    out.customPageSlug = 'ux-audit-page';
} else {
    const [r] = await c.query(
        'INSERT INTO custom_pages (title, slug, content, published, nav_order, show_in_nav, show_in_footer, description, status, revision, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,NOW(),NOW())',
        ['UX Audit Page', 'ux-audit-page', '<h2>UX Audit Page</h2><p>Real seeded record for template auditing.</p>', 1, 0, 0, 0, 'Seeded for template audit', 'published', 1],
    );
    out.customPageSlug = 'ux-audit-page';
    out.customPageId = r.insertId;
}

await c.end();
console.log(JSON.stringify(out));
