#!/usr/bin/env node

/**
 * ==============================================================================
 * ResumePilot AI — Safe Firestore to MySQL Migration Tool
 * ==============================================================================
 * 
 * Usage:
 *   node scripts/migrate-firestore-to-mysql.mjs [--dry-run]
 *   npm run db:migrate:firestore-to-mysql
 *   npm run db:migrate:firestore-to-mysql -- --dry-run
 * 
 * Invariants:
 *   1. NEVER modifies, mutates, or deletes Firestore data (strictly read-only on Firestore).
 *   2. Idempotent: Uses INSERT ... ON DUPLICATE KEY UPDATE in MySQL.
 *   3. Preserves exact document IDs, timestamps, and nested JSON structures.
 *   4. Supports --dry-run to simulate migration without writing to MySQL.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../backend/.env') });

const isDryRun = process.argv.includes('--dry-run');

console.log('===============================================================');
console.log(`🚀 ResumePilot AI — Firestore → MySQL Migration Engine`);
console.log(`Mode: ${isDryRun ? '🔍 DRY RUN (Simulation Only)' : '⚡ LIVE MIGRATION'}`);
console.log('===============================================================\n');

// 1. Initialize MySQL Pool
const poolConfig = {
    host: process.env.DB_HOST || process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || process.env.MYSQL_PORT || 3306),
    user: process.env.DB_USER || process.env.MYSQL_USER || 'root',
    password: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : (process.env.MYSQL_PASSWORD || ''),
    database: process.env.DB_NAME || process.env.MYSQL_DATABASE || 'ai_resume_builder',
    waitForConnections: true,
    connectionLimit: 10,
    charset: 'utf8mb4',
    multipleStatements: true,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
};

let mysqlPool = null;
if (!isDryRun) {
    try {
        mysqlPool = mysql.createPool(poolConfig);
        await mysqlPool.query('SELECT 1');
        console.log(`✓ Connected to MySQL database '${poolConfig.database}' on ${poolConfig.host}:${poolConfig.port}`);
    } catch (e) {
        console.error(`❌ Failed to connect to MySQL: ${e.message}`);
        process.exit(1);
    }
}

// 2. Initialize Firebase Admin
let firestoreDb = null;
try {
    const adminModule = await import('../backend/services/firebaseAdmin.js');
    const admin = adminModule.default;
    if (!admin.apps.length) {
        const projectId = process.env.FIREBASE_PROJECT_ID || 'ai-resume-builder-424cf';
        if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
            admin.initializeApp({
                credential: admin.credential.cert({
                    projectId,
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
                }),
                projectId,
            });
        } else {
            admin.initializeApp({ projectId });
        }
    }
    firestoreDb = admin.firestore();
    console.log(`✓ Initialized Firestore Admin SDK\n`);
} catch (e) {
    console.warn(`⚠️ Firestore initialization notice: ${e.message}`);
}

const stats = {
    users: { read: 0, written: 0, errors: 0 },
    resumes: { read: 0, written: 0, errors: 0 },
    portfolios: { read: 0, written: 0, errors: 0 },
    covers: { read: 0, written: 0, errors: 0 },
    jobs: { read: 0, written: 0, errors: 0 },
    applications: { read: 0, written: 0, errors: 0 },
    blog: { read: 0, written: 0, errors: 0 },
    custom_pages: { read: 0, written: 0, errors: 0 },
    trusted_by: { read: 0, written: 0, errors: 0 },
    settings: { read: 0, written: 0, errors: 0 },
};

function formatTimestamp(val) {
    if (!val) return null;
    if (typeof val.toDate === 'function') return val.toDate();
    if (val._seconds) return new Date(val._seconds * 1000);
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
}

// Migration Handlers
async function migrateUsersAndSubcollections() {
    if (!firestoreDb) return;
    console.log('📦 Migrating Users and user-scoped subcollections (resumes, portfolios, covers)...');

    let userDocs = [];
    try {
        const snap = await firestoreDb.collection('users').get();
        userDocs = snap.docs;
    } catch (e) {
        console.warn(`Could not read users collection from Firestore: ${e.message}`);
        return;
    }

    stats.users.read = userDocs.length;
    console.log(`Found ${userDocs.length} users in Firestore.`);

    for (const doc of userDocs) {
        const u = doc.data() || {};
        const userId = doc.id;

        // 1. Insert user record
        if (!isDryRun && mysqlPool) {
            try {
                const values = [
                    userId,
                    u.email || `${userId}@example.com`,
                    u.firstname || '',
                    u.lastname || '',
                    u.displayName || `${u.firstname || ''} ${u.lastname || ''}`.trim(),
                    u.photoUrl || u.avatarUrl || null,
                    u.avatarUrl || u.photoUrl || null,
                    u.phone || null,
                    u.jobTitle || null,
                    u.bio || null,
                    u.city || null,
                    u.country || null,
                    u.website || null,
                    u.membership || 'Basic',
                    u.membershipEnds ? String(u.membershipEnds) : null,
                    u.paymentStatus || 'INACTIVE',
                    u.role || 'USER',
                    u.suspended ? 1 : 0,
                    JSON.stringify(u.extra_data || {}),
                    formatTimestamp(u.createdAt) || new Date(),
                    formatTimestamp(u.updatedAt) || new Date(),
                ];

                await mysqlPool.query(
                    `INSERT INTO users (id, email, firstname, lastname, displayName, photoUrl, avatarUrl, phone, jobTitle, bio, city, country, website, membership, membershipEnds, paymentStatus, role, suspended, extra_data, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE email=VALUES(email), firstname=VALUES(firstname), lastname=VALUES(lastname), membership=VALUES(membership), role=VALUES(role), updated_at=VALUES(updated_at)`,
                    values
                );
                stats.users.written++;
            } catch (err) {
                stats.users.errors++;
                console.error(`Error migrating user ${userId}:`, err.message);
            }
        } else {
            stats.users.written++;
        }

        // 2. Resumes Subcollection
        try {
            const resumeSnap = await firestoreDb.collection('users').doc(userId).collection('resumes').get();
            stats.resumes.read += resumeSnap.docs.length;

            for (const rDoc of resumeSnap.docs) {
                const r = rDoc.data() || {};
                const resumeId = rDoc.id;

                if (!isDryRun && mysqlPool) {
                    try {
                        const jsonFields = [
                            'employments', 'educations', 'skills', 'languages', 'hobbies',
                            'projects', 'certifications', 'achievements', 'references',
                            'customSections', 'sectionOrder', 'hiddenSections', 'completedSteps'
                        ];

                        const resumeValues = [
                            resumeId,
                            userId,
                            r.title || 'Untitled Resume',
                            r.template || 'Cv1',
                            Number(r.revision || 1),
                            r.firstname || '',
                            r.lastname || '',
                            r.email || '',
                            r.phone || '',
                            r.occupation || '',
                            r.country || '',
                            r.city || '',
                            r.address || '',
                            r.postalcode || '',
                            r.website || '',
                            r.linkedin || '',
                            r.github || '',
                            r.photo || null,
                            r.showPhoto === false ? 0 : 1,
                            r.summary || '',
                            JSON.stringify(r.employments || []),
                            JSON.stringify(r.educations || []),
                            JSON.stringify(r.skills || []),
                            JSON.stringify(r.languages || []),
                            JSON.stringify(r.hobbies || []),
                            JSON.stringify(r.projects || []),
                            JSON.stringify(r.certifications || []),
                            JSON.stringify(r.achievements || []),
                            JSON.stringify(r.references || []),
                            JSON.stringify(r.customSections || []),
                            JSON.stringify(r.sectionOrder || []),
                            JSON.stringify(r.hiddenSections || []),
                            JSON.stringify(r.completedSteps || []),
                            formatTimestamp(r.created_at) || new Date(),
                            formatTimestamp(r.updatedAt) || new Date(),
                        ];

                        await mysqlPool.query(
                            `INSERT INTO resumes (id, user_id, title, template, revision, firstname, lastname, email, phone, occupation, country, city, address, postalcode, website, linkedin, github, photo, showPhoto, summary, employments, educations, skills, languages, hobbies, projects, certifications, achievements, references, customSections, sectionOrder, hiddenSections, completedSteps, created_at, updated_at)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                             ON DUPLICATE KEY UPDATE title=VALUES(title), template=VALUES(template), revision=VALUES(revision), summary=VALUES(summary), updated_at=VALUES(updated_at)`,
                            resumeValues
                        );
                        stats.resumes.written++;
                    } catch (err) {
                        stats.resumes.errors++;
                        console.error(`Error migrating resume ${resumeId}:`, err.message);
                    }
                } else {
                    stats.resumes.written++;
                }
            }
        } catch (e) {
            // Safe ignore if subcollection doesn't exist
        }

        // 3. Portfolios Subcollection
        try {
            const portSnap = await firestoreDb.collection('users').doc(userId).collection('portfolios').get();
            stats.portfolios.read += portSnap.docs.length;

            for (const pDoc of portSnap.docs) {
                const p = pDoc.data() || {};
                if (!isDryRun && mysqlPool) {
                    await mysqlPool.query(
                        `INSERT INTO portfolios (id, user_id, title, theme, is_published, data, created_at, updated_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                         ON DUPLICATE KEY UPDATE title=VALUES(title), theme=VALUES(theme), data=VALUES(data), updated_at=VALUES(updated_at)`,
                        [pDoc.id, userId, p.title || 'Untitled Portfolio', p.theme || 'modern', p.is_published ? 1 : 0, JSON.stringify(p.data || p), formatTimestamp(p.created_at) || new Date(), formatTimestamp(p.updated_at) || new Date()]
                    );
                }
                stats.portfolios.written++;
            }
        } catch (e) {}

        // 4. Covers Subcollection
        try {
            const coverSnap = await firestoreDb.collection('users').doc(userId).collection('covers').get();
            stats.covers.read += coverSnap.docs.length;

            for (const cDoc of coverSnap.docs) {
                const c = cDoc.data() || {};
                if (!isDryRun && mysqlPool) {
                    await mysqlPool.query(
                        `INSERT INTO covers (id, user_id, title, template, data, created_at, updated_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?)
                         ON DUPLICATE KEY UPDATE title=VALUES(title), template=VALUES(template), data=VALUES(data), updated_at=VALUES(updated_at)`,
                        [cDoc.id, userId, c.title || 'Untitled Cover Letter', c.template || 'Cover1', JSON.stringify(c), formatTimestamp(c.created_at) || new Date(), formatTimestamp(c.updated_at) || new Date()]
                    );
                }
                stats.covers.written++;
            }
        } catch (e) {}
    }
}

async function migrateStandaloneCollections() {
    if (!firestoreDb) return;
    console.log('📦 Migrating standalone collections (jobs, blog, custom_pages, trusted_by, settings)...');

    // Jobs
    try {
        const snap = await firestoreDb.collection('jobs').get();
        stats.jobs.read = snap.docs.length;
        for (const doc of snap.docs) {
            const j = doc.data() || {};
            if (!isDryRun && mysqlPool) {
                await mysqlPool.query(
                    `INSERT INTO jobs (id, employer_id, company_name, company_logo, title, description, requirements, location, job_type, workplace_type, salary_min, salary_max, salary_currency, experience_level, skills, status, featured, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE title=VALUES(title), description=VALUES(description), status=VALUES(status), updated_at=VALUES(updated_at)`,
                    [doc.id, j.employerId || j.employer_id || 'system', j.companyName || '', j.companyLogo || null, j.title || 'Job', j.description || '', JSON.stringify(j.requirements || []), j.location || '', j.jobType || 'Full-time', j.workplaceType || 'Remote', j.salaryMin || null, j.salaryMax || null, j.salaryCurrency || 'USD', j.experienceLevel || 'Mid', JSON.stringify(j.skills || []), j.status || 'OPEN', j.featured ? 1 : 0, formatTimestamp(j.createdAt) || new Date(), formatTimestamp(j.updatedAt) || new Date()]
                );
            }
            stats.jobs.written++;
        }
    } catch (e) {}

    // Blog
    try {
        const snap = await firestoreDb.collection('blog').get();
        stats.blog.read = snap.docs.length;
        for (const doc of snap.docs) {
            const b = doc.data() || {};
            if (!isDryRun && mysqlPool) {
                await mysqlPool.query(
                    `INSERT INTO blog (id, title, slug, content, excerpt, cover_image, author, author_id, category, tags, published, views, likes, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE title=VALUES(title), content=VALUES(content), published=VALUES(published), updated_at=VALUES(updated_at)`,
                    [doc.id, b.title || 'Post', b.slug || `post-${doc.id}`, b.content || '', b.excerpt || '', b.coverImage || null, b.author || 'Admin', b.authorId || null, b.category || 'General', JSON.stringify(b.tags || []), b.published ? 1 : 0, Number(b.views || 0), Number(b.likes || 0), formatTimestamp(b.createdAt) || new Date(), formatTimestamp(b.updatedAt) || new Date()]
                );
            }
            stats.blog.written++;
        }
    } catch (e) {}

    // Custom Pages
    try {
        const snap = await firestoreDb.collection('custom_pages').get();
        stats.custom_pages.read = snap.docs.length;
        for (const doc of snap.docs) {
            const p = doc.data() || {};
            if (!isDryRun && mysqlPool) {
                await mysqlPool.query(
                    `INSERT INTO custom_pages (id, title, slug, content, published, nav_order, show_in_nav, show_in_footer, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE title=VALUES(title), content=VALUES(content), published=VALUES(published), updated_at=VALUES(updated_at)`,
                    [doc.id, p.title || 'Page', p.slug || `page-${doc.id}`, p.content || '', p.published !== false ? 1 : 0, Number(p.navOrder || 0), p.showInNav ? 1 : 0, p.showInFooter ? 1 : 0, formatTimestamp(p.createdAt) || new Date(), formatTimestamp(p.updatedAt) || new Date()]
                );
            }
            stats.custom_pages.written++;
        }
    } catch (e) {}

    // Trusted By
    try {
        const snap = await firestoreDb.collection('trusted_by').get();
        stats.trusted_by.read = snap.docs.length;
        for (const doc of snap.docs) {
            const t = doc.data() || {};
            if (!isDryRun && mysqlPool) {
                await mysqlPool.query(
                    `INSERT INTO trusted_by (id, name, logo_url, website_url, display_order, active, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE name=VALUES(name), logo_url=VALUES(logo_url), active=VALUES(active), updated_at=VALUES(updated_at)`,
                    [doc.id, t.name || '', t.logoUrl || t.logo_url || '', t.websiteUrl || t.website_url || '', Number(t.displayOrder || 0), t.active !== false ? 1 : 0, formatTimestamp(t.createdAt) || new Date(), formatTimestamp(t.updatedAt) || new Date()]
                );
            }
            stats.trusted_by.written++;
        }
    } catch (e) {}

    // Settings
    try {
        const snap = await firestoreDb.collection('settings').get();
        stats.settings.read = snap.docs.length;
        for (const doc of snap.docs) {
            if (!isDryRun && mysqlPool) {
                await mysqlPool.query(
                    `INSERT INTO system_settings (category, data, revision, updated_at)
                     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                     ON DUPLICATE KEY UPDATE data=VALUES(data), revision=VALUES(revision), updated_at=CURRENT_TIMESTAMP`,
                    [doc.id, JSON.stringify(doc.data() || {}), Number(doc.data()?.revision || 1)]
                );
            }
            stats.settings.written++;
        }
    } catch (e) {}
}

async function runMigration() {
    const startTime = Date.now();
    await migrateUsersAndSubcollections();
    await migrateStandaloneCollections();

    const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('\n===============================================================');
    console.log(`📊 MIGRATION SUMMARY (${isDryRun ? 'DRY-RUN' : 'LIVE'}) — ${durationSec}s`);
    console.log('===============================================================');
    console.table(stats);
    console.log('===============================================================\n');

    if (mysqlPool) {
        await mysqlPool.end();
    }
}

await runMigration();
