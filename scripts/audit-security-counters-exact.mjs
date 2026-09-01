import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../backend/.env') });

async function run() {
    const db = await mysql.createConnection({
        host: process.env.DB_HOST || '127.0.0.1',
        port: parseInt(process.env.DB_PORT || '3306', 10),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'ai_resume_builder'
    });

    console.log('=== FORENSIC CENSUS: 3 HIGH/CRITICAL EVENTS IN security_audit_logs ===\n');
    const [secRows] = await db.query(
        `SELECT id, action, category, severity, outcome, actor_email, metadata, created_at 
         FROM security_audit_logs 
         WHERE severity IN ('HIGH', 'CRITICAL') 
         ORDER BY created_at DESC`
    );

    console.log(`Found ${secRows.length} high/critical events:`);
    secRows.forEach((r, i) => {
        console.log(`[${i+1}] ID: ${r.id}`);
        console.log(`    Action: ${r.action} | Category: ${r.category} | Severity: ${r.severity}`);
        console.log(`    Outcome: ${r.outcome} | Actor: ${r.actor_email}`);
        console.log(`    Created: ${r.created_at}`);
        console.log(`    Metadata: ${JSON.stringify(r.metadata)}`);
    });

    console.log('\n=== FORENSIC CENSUS: 25 HIGH RISK EVENTS IN admin_audit_logs (Sampled 200) ===\n');
    const [auditRows] = await db.query(
        `SELECT id, action, category, severity, actor_email, metadata, created_at 
         FROM admin_audit_logs 
         WHERE severity IN ('HIGH', 'CRITICAL') 
         ORDER BY created_at DESC 
         LIMIT 30`
    );

    console.log(`Found ${auditRows.length} high-severity operations:`);
    auditRows.forEach((r, i) => {
        console.log(`[${i+1}] ID: ${r.id} | Action: ${r.action} | Cat: ${r.category} | Actor: ${r.actor_email} | Time: ${r.created_at}`);
    });

    await db.end();
}

run();
