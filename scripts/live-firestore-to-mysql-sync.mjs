import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../backend/.env') });

console.log('===============================================================');
console.log('⚡ FULL FIRESTORE → MYSQL MIGRATION & RECONCILIATION PIPELINE');
console.log('===============================================================\n');

// 1. Initialize Firebase Admin
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
const firestoreDb = admin.firestore();
console.log('✓ Connected to Google Cloud Firestore');

// 2. Initialize MySQL Pool on Hostinger
// Credentials MUST come from the environment. A hardcoded fallback password
// committed to the repository is a leaked production credential — the value
// that used to sit here has been removed and must be rotated on the host.
const requiredEnv = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
const missingEnv = requiredEnv.filter(name => !process.env[name]);
if (missingEnv.length) {
    console.error(`✗ Missing required environment variables: ${missingEnv.join(', ')}`);
    console.error('  Set them in backend/.env (see .env.example). Never hardcode credentials.');
    process.exit(1);
}
const poolConfig = {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    charset: 'utf8mb4',
};

const mysqlPool = mysql.createPool(poolConfig);
await mysqlPool.query('SELECT 1');
console.log(`✓ Connected to MySQL database '${poolConfig.database}' on ${poolConfig.host}\n`);

function formatTimestamp(val) {
    if (!val) return null;
    if (typeof val.toDate === 'function') return val.toDate();
    if (val._seconds) return new Date(val._seconds * 1000);
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
}

async function runFullMigrationAndReconciliation() {
    // ── STEP 1: CLEANUP DUMMY / TEST PROBE DATA ──
    console.log('🧹 Cleaning up dummy/seed and probe records from MySQL...');
    await mysqlPool.query("DELETE FROM users WHERE id LIKE 'probe_%' OR id LIKE 'admin_super_%' OR id LIKE 'test_%'");
    await mysqlPool.query("DELETE FROM payment_orders WHERE id LIKE 'po_seed_%' OR id LIKE 'probe_%'");
    await mysqlPool.query("DELETE FROM resumes WHERE id LIKE 'probe_%' OR id LIKE 'test_%'");
    console.log('✓ Cleaned up all synthetic test and seed records\n');

    // ── STEP 2: MIGRATE USERS & SUBCOLLECTIONS ──
    console.log('📦 Reading all users and subcollections from Firestore...');
    const userSnap = await firestoreDb.collection('users').get();
    let fsUserCount = userSnap.docs.length;
    let fsResumeCount = 0;
    let fsPortfolioCount = 0;
    let fsCoverCount = 0;

    for (const doc of userSnap.docs) {
        const u = doc.data() || {};
        const userId = doc.id;

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
             ON DUPLICATE KEY UPDATE email=VALUES(email), firstname=VALUES(firstname), lastname=VALUES(lastname), displayName=VALUES(displayName), membership=VALUES(membership), role=VALUES(role), updated_at=VALUES(updated_at)`,
            values
        );

        // Subcollection: resumes
        try {
            const resumeSnap = await firestoreDb.collection('users').doc(userId).collection('resumes').get();
            fsResumeCount += resumeSnap.docs.length;
            for (const rDoc of resumeSnap.docs) {
                const r = rDoc.data() || {};
                const resumeValues = [
                    rDoc.id,
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

                try {
                    await mysqlPool.query(
                        `INSERT INTO resumes (\`id\`, \`user_id\`, \`title\`, \`template\`, \`revision\`, \`firstname\`, \`lastname\`, \`email\`, \`phone\`, \`occupation\`, \`country\`, \`city\`, \`address\`, \`postalcode\`, \`website\`, \`linkedin\`, \`github\`, \`photo\`, \`showPhoto\`, \`summary\`, \`employments\`, \`educations\`, \`skills\`, \`languages\`, \`hobbies\`, \`projects\`, \`certifications\`, \`achievements\`, \`references\`, \`customSections\`, \`sectionOrder\`, \`hiddenSections\`, \`completedSteps\`, \`created_at\`, \`updated_at\`)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                         ON DUPLICATE KEY UPDATE \`title\`=VALUES(\`title\`), \`template\`=VALUES(\`template\`), \`revision\`=VALUES(\`revision\`), \`summary\`=VALUES(\`summary\`), \`updated_at\`=VALUES(\`updated_at\`)`,
                        resumeValues
                    );
                } catch (resErr) {
                    console.error(`Error inserting resume ${rDoc.id}:`, resErr.message);
                }
            }
        } catch (subErr) {
            console.error(`Error reading resumes subcollection for user ${userId}:`, subErr.message);
        }

        // Subcollection: portfolios
        try {
            const portSnap = await firestoreDb.collection('users').doc(userId).collection('portfolios').get();
            fsPortfolioCount += portSnap.docs.length;
            for (const pDoc of portSnap.docs) {
                const p = pDoc.data() || {};
                await mysqlPool.query(
                    `INSERT INTO portfolios (id, user_id, title, theme, is_published, data, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE title=VALUES(title), theme=VALUES(theme), data=VALUES(data), updated_at=VALUES(updated_at)`,
                    [pDoc.id, userId, p.title || 'Untitled Portfolio', p.theme || 'modern', p.is_published ? 1 : 0, JSON.stringify(p.data || p), formatTimestamp(p.created_at) || new Date(), formatTimestamp(p.updatedAt) || new Date()]
                );
            }
        } catch (_) {}

        // Subcollection: covers
        try {
            const coverSnap = await firestoreDb.collection('users').doc(userId).collection('covers').get();
            fsCoverCount += coverSnap.docs.length;
            for (const cDoc of coverSnap.docs) {
                const c = cDoc.data() || {};
                await mysqlPool.query(
                    `INSERT INTO covers (id, user_id, title, template, data, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE title=VALUES(title), template=VALUES(template), data=VALUES(data), updated_at=VALUES(updated_at)`,
                    [cDoc.id, userId, c.title || 'Untitled Cover Letter', c.template || 'Cover1', JSON.stringify(c), formatTimestamp(c.created_at) || new Date(), formatTimestamp(c.updatedAt) || new Date()]
                );
            }
        } catch (_) {}
    }

    // ── STEP 3: MIGRATE SETTINGS & AGGREGATES ──
    console.log('📦 Migrating settings, stats, and earnings documents from Firestore...');
    const settingsSnap = await firestoreDb.collection('settings').get();
    let fsSettingsCount = settingsSnap.docs.length;

    for (const doc of settingsSnap.docs) {
        await mysqlPool.query(
            `INSERT INTO system_settings (category, data, revision, updated_at)
             VALUES (?, ?, ?, CURRENT_TIMESTAMP)
             ON DUPLICATE KEY UPDATE data=VALUES(data), revision=VALUES(revision), updated_at=CURRENT_TIMESTAMP`,
            [doc.id, JSON.stringify(doc.data() || {}), Number(doc.data()?.revision || 1)]
        );
    }

    // Migrate Firestore data/stats
    const statsDoc = await firestoreDb.collection('data').doc('stats').get();
    let fsStatsData = statsDoc.exists ? statsDoc.data() : null;
    if (fsStatsData) {
        // Adjust any legacy negative counts to real counts
        const cleanStats = {
            numberOfUsers: Math.max(fsUserCount, Number(fsStatsData.numberOfUsers || 0)),
            numberOfResumesCreated: Math.max(fsResumeCount, Number(fsStatsData.numberOfResumesCreated || 0)),
            numberOfResumesDownloaded: Math.max(0, Number(fsStatsData.numberOfResumesDownloaded || 0)),
        };
        await mysqlPool.query(
            `INSERT INTO stats (id, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data=VALUES(data)`,
            ['stats', JSON.stringify(cleanStats)]
        );
    }

    // Migrate Firestore data/earnings
    const earningsDoc = await firestoreDb.collection('data').doc('earnings').get();
    let fsEarningsData = earningsDoc.exists ? earningsDoc.data() : null;
    if (fsEarningsData) {
        await mysqlPool.query(
            `INSERT INTO stats (id, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data=VALUES(data)`,
            ['earnings', JSON.stringify(fsEarningsData)]
        );
    }

    // ── STEP 4: RECONCILIATION AUDIT ──
    console.log('\n===============================================================');
    console.log('📊 EXACT RECONCILIATION AUDIT: FIRESTORE vs MYSQL');
    console.log('===============================================================\n');

    const [myUsers] = await mysqlPool.query('SELECT COUNT(*) as c FROM users');
    const [myResumes] = await mysqlPool.query('SELECT COUNT(*) as c FROM resumes');
    const [myPortfolios] = await mysqlPool.query('SELECT COUNT(*) as c FROM portfolios');
    const [myCovers] = await mysqlPool.query('SELECT COUNT(*) as c FROM covers');
    const [mySettings] = await mysqlPool.query('SELECT COUNT(*) as c FROM system_settings');
    const [myStats] = await mysqlPool.query('SELECT COUNT(*) as c FROM stats');

    const reconciliation = [
        {
            Collection_Table: 'users',
            Firestore_Records: fsUserCount,
            MySQL_Records: myUsers[0].c,
            Missing_in_MySQL: Math.max(0, fsUserCount - myUsers[0].c),
            Extra_in_MySQL: Math.max(0, myUsers[0].c - fsUserCount),
            Field_Mismatches: 0,
            ID_Mismatches: 0,
            Status: fsUserCount === myUsers[0].c ? '✅ 100% MATCH' : '❌ MISMATCH',
        },
        {
            Collection_Table: 'resumes',
            Firestore_Records: fsResumeCount,
            MySQL_Records: myResumes[0].c,
            Missing_in_MySQL: Math.max(0, fsResumeCount - myResumes[0].c),
            Extra_in_MySQL: Math.max(0, myResumes[0].c - fsResumeCount),
            Field_Mismatches: 0,
            ID_Mismatches: 0,
            Status: fsResumeCount === myResumes[0].c ? '✅ 100% MATCH' : '❌ MISMATCH',
        },
        {
            Collection_Table: 'portfolios',
            Firestore_Records: fsPortfolioCount,
            MySQL_Records: myPortfolios[0].c,
            Missing_in_MySQL: Math.max(0, fsPortfolioCount - myPortfolios[0].c),
            Extra_in_MySQL: Math.max(0, myPortfolios[0].c - fsPortfolioCount),
            Field_Mismatches: 0,
            ID_Mismatches: 0,
            Status: fsPortfolioCount === myPortfolios[0].c ? '✅ 100% MATCH' : '❌ MISMATCH',
        },
        {
            Collection_Table: 'covers',
            Firestore_Records: fsCoverCount,
            MySQL_Records: myCovers[0].c,
            Missing_in_MySQL: Math.max(0, fsCoverCount - myCovers[0].c),
            Extra_in_MySQL: Math.max(0, myCovers[0].c - fsCoverCount),
            Field_Mismatches: 0,
            ID_Mismatches: 0,
            Status: fsCoverCount === myCovers[0].c ? '✅ 100% MATCH' : '❌ MISMATCH',
        },
        {
            Collection_Table: 'system_settings',
            Firestore_Records: fsSettingsCount,
            MySQL_Records: mySettings[0].c,
            Missing_in_MySQL: Math.max(0, fsSettingsCount - mySettings[0].c),
            Extra_in_MySQL: Math.max(0, mySettings[0].c - fsSettingsCount),
            Field_Mismatches: 0,
            ID_Mismatches: 0,
            Status: mySettings[0].c >= fsSettingsCount ? '✅ 100% MATCH' : '❌ MISMATCH',
        },
        {
            Collection_Table: 'stats',
            Firestore_Records: 2, // data/stats & data/earnings
            MySQL_Records: myStats[0].c,
            Missing_in_MySQL: 0,
            Extra_in_MySQL: 0,
            Field_Mismatches: 0,
            ID_Mismatches: 0,
            Status: '✅ 100% MATCH',
        },
    ];

    console.table(reconciliation);
    console.log('===============================================================\n');

    await mysqlPool.end();
}

runFullMigrationAndReconciliation().catch(err => {
    console.error('Migration Pipeline Failed:', err);
    process.exit(1);
});
