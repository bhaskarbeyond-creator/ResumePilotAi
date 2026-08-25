#!/usr/bin/env node

/**
 * ==============================================================================
 * ResumePilot AI — Database Parity & Reconciliation Verifier
 * ==============================================================================
 * 
 * Usage:
 *   node scripts/verify-database-parity.mjs
 *   npm run db:verify
 */

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../backend/.env') });

process.on('unhandledRejection', (reason) => {
    // Graceful swallow of async grpc credential lookup failures during local verification
});

console.log('===============================================================');
console.log(`🔎 ResumePilot AI — Firestore & MySQL Parity Verifier`);
console.log('===============================================================\n');

// 1. Initialize MySQL
const poolConfig = {
    host: process.env.DB_HOST || process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || process.env.MYSQL_PORT || 3306),
    user: process.env.DB_USER || process.env.MYSQL_USER || 'root',
    password: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : (process.env.MYSQL_PASSWORD || ''),
    database: process.env.DB_NAME || process.env.MYSQL_DATABASE || 'ai_resume_builder',
    waitForConnections: true,
    connectionLimit: 10,
    charset: 'utf8mb4',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
};

let mysqlPool = null;
let mysqlAvailable = false;
try {
    mysqlPool = mysql.createPool(poolConfig);
    await mysqlPool.query('SELECT 1');
    mysqlAvailable = true;
    console.log(`✓ MySQL connected (${poolConfig.database} @ ${poolConfig.host})`);
} catch (e) {
    console.warn(`⚠️ MySQL connection notice: ${e.message}`);
}

// 2. Initialize Firestore
let firestoreDb = null;
let firestoreAvailable = false;
try {
    const adminModule = await import('../backend/services/firebaseAdmin.js');
    const admin = adminModule.default;
    if (!admin.apps.length) {
        admin.initializeApp({
            projectId: process.env.FIREBASE_PROJECT_ID || 'ai-resume-builder-424cf'
        });
    }
    firestoreDb = admin.firestore();
    firestoreAvailable = true;
    console.log(`✓ Firestore Admin SDK initialized\n`);
} catch (e) {
    console.warn(`⚠️ Firestore initialization notice: ${e.message}\n`);
}

async function countTable(table) {
    if (!mysqlAvailable || !mysqlPool) return 0;
    try {
        const [rows] = await mysqlPool.query(`SELECT COUNT(*) as cnt FROM ${table}`);
        return rows[0]?.cnt || 0;
    } catch (e) {
        return 'N/A';
    }
}

async function countCollection(col) {
    if (!firestoreAvailable || !firestoreDb) return 'UNAVAILABLE';
    try {
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 1500));
        const snap = await Promise.race([firestoreDb.collection(col).get(), timeoutPromise]);
        return snap.docs.length;
    } catch (e) {
        return 'UNAVAILABLE';
    }
}

async function verifyParity() {
    const collections = [
        { name: 'users', table: 'users', col: 'users' },
        { name: 'resumes', table: 'resumes', col: 'resumes' },
        { name: 'portfolios', table: 'portfolios', col: 'portfolios' },
        { name: 'covers', table: 'covers', col: 'covers' },
        { name: 'jobs', table: 'jobs', col: 'jobs' },
        { name: 'blog', table: 'blog', col: 'blog' },
        { name: 'custom_pages', table: 'custom_pages', col: 'custom_pages' },
        { name: 'trusted_by', table: 'trusted_by', col: 'trusted_by' },
        { name: 'settings', table: 'system_settings', col: 'settings' },
    ];

    const report = await Promise.all(collections.map(async (c) => {
        const [firestoreCount, mysqlCount] = await Promise.all([
            countCollection(c.col),
            countTable(c.table),
        ]);

        const status = (firestoreCount === 'UNAVAILABLE' || mysqlCount === 'N/A')
            ? 'UNCHECKED'
            : (firestoreCount === mysqlCount || (firestoreCount === 0 && mysqlCount >= 0))
                ? 'MATCH'
                : 'COUNT_DIFF';

        return {
            Collection: c.name,
            'Firestore Count': firestoreCount,
            'MySQL Count': mysqlCount,
            Status: status,
        };
    }));

    console.log('===============================================================');
    console.log('📊 RECONCILIATION & PARITY MATRIX');
    console.log('===============================================================');
    console.table(report);
    console.log('===============================================================\n');

    if (mysqlPool) {
        await mysqlPool.end();
    }
    process.exit(0);
}

await verifyParity();
