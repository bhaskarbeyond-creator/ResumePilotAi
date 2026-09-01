import dotenv from 'dotenv';
import path from 'path';
import mysql from 'mysql2/promise';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../backend/.env') });

async function run() {
    console.log('=== FORENSIC THREAT & AUDIT COUNTERS RCA ===\n');

    const db = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'resume_builder',
        port: Number(process.env.DB_PORT) || 3306,
    });

    // ── 1. INVESTIGATE High / Critical Threats (Count = 3 in security_audit_logs) ──
    console.log('------------------------------------------------------------');
    console.log('1. INVESTIGATING security_audit_logs (High / Critical Threats)');
    console.log('------------------------------------------------------------');

    const [secThreats] = await db.query(
        `SELECT id, action, actor_uid, actor_email, actor_role, category, severity,
                outcome, method, pathname, status_code, ip_address, created_at, metadata
         FROM security_audit_logs
         WHERE severity IN ('HIGH', 'CRITICAL')
         ORDER BY created_at DESC`
    );

    console.log(`Found ${secThreats.length} High/Critical records in security_audit_logs:`);
    console.table(secThreats.map(r => ({
        id: r.id,
        action: r.action,
        actor: r.actor_email || r.actor_uid,
        role: r.actor_role,
        severity: r.severity,
        outcome: r.outcome,
        path: r.pathname,
        status: r.status_code,
        ip: r.ip_address,
        createdAt: r.created_at
    })));

    console.log('\nDetailed Metadata for each of the High/Critical Security Threats:');
    secThreats.forEach((r, idx) => {
        console.log(`\nThreat #${idx + 1} (ID: ${r.id}):`);
        console.log(` - Action: ${r.action}`);
        console.log(` - Category: ${r.category}`);
        console.log(` - Severity: ${r.severity}`);
        console.log(` - Outcome: ${r.outcome}`);
        console.log(` - Actor: ${r.actor_email || r.actor_uid} (Role: ${r.actor_role})`);
        console.log(` - Path: ${r.method} ${r.pathname} (HTTP ${r.status_code})`);
        console.log(` - IP: ${r.ip_address}`);
        console.log(` - Timestamp: ${r.created_at}`);
        console.log(` - Metadata:`, typeof r.metadata === 'string' ? r.metadata : JSON.stringify(r.metadata));
    });

    // Also get total count and breakdown in security_audit_logs
    const [[secSummary]] = await db.query(`
        SELECT COUNT(*) as total,
               SUM(CASE WHEN severity = 'CRITICAL' THEN 1 ELSE 0 END) as criticalCount,
               SUM(CASE WHEN severity = 'HIGH' THEN 1 ELSE 0 END) as highCount,
               SUM(CASE WHEN severity = 'MEDIUM' THEN 1 ELSE 0 END) as mediumCount,
               SUM(CASE WHEN severity = 'LOW' THEN 1 ELSE 0 END) as lowCount,
               MIN(created_at) as oldestEvent,
               MAX(created_at) as newestEvent
        FROM security_audit_logs
    `);
    console.log('\nSecurity Audit Logs Summary:', secSummary);


    // ── 2. INVESTIGATE High Risk Events (Count = 25 in admin_audit_logs) ──
    console.log('\n------------------------------------------------------------');
    console.log('2. INVESTIGATING admin_audit_logs (High Risk Events)');
    console.log('------------------------------------------------------------');

    const [adminHighLogs] = await db.query(
        `SELECT id, action, actor_email, actor_uid, actor_role, category, severity,
                outcome, pathname, status_code, created_at, metadata
         FROM admin_audit_logs
         WHERE severity IN ('HIGH', 'CRITICAL')
         ORDER BY created_at DESC`
    );

    console.log(`Found ${adminHighLogs.length} High/Critical records in admin_audit_logs:`);
    console.table(adminHighLogs.map(r => ({
        id: r.id,
        action: r.action,
        actor: r.actor_email || r.actor_uid,
        category: r.category,
        severity: r.severity,
        outcome: r.outcome,
        path: r.pathname,
        status: r.status_code,
        createdAt: r.created_at
    })));

    const [[adminSummary]] = await db.query(`
        SELECT COUNT(*) as total,
               SUM(CASE WHEN severity IN ('HIGH', 'CRITICAL') THEN 1 ELSE 0 END) as highRiskCount,
               MIN(CASE WHEN severity IN ('HIGH', 'CRITICAL') THEN created_at ELSE NULL END) as oldestHighRisk,
               MAX(CASE WHEN severity IN ('HIGH', 'CRITICAL') THEN created_at ELSE NULL END) as newestHighRisk,
               MIN(created_at) as oldestOverall,
               MAX(created_at) as newestOverall
        FROM admin_audit_logs
    `);
    console.log('\nAdmin Audit Logs Summary:', adminSummary);

    // Grouping by action and actor for the High Risk Events
    const [actionBreakdown] = await db.query(`
        SELECT action, category, outcome, COUNT(*) as count,
               MIN(created_at) as firstSeen, MAX(created_at) as lastSeen
        FROM admin_audit_logs
        WHERE severity IN ('HIGH', 'CRITICAL')
        GROUP BY action, category, outcome
        ORDER BY count DESC
    `);
    console.log('\nHigh Risk Events Breakdown by Action:');
    console.table(actionBreakdown);

    await db.end();
}

run().catch(console.error);
