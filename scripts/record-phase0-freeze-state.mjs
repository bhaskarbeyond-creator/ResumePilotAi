import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config({ path: path.resolve('backend/.env') });
dotenv.config({ path: path.resolve('.env') });

console.log('============================================================');
console.log('PHASE 0: PRE-AUDIT FORENSIC STATE CHECKPOINT');
console.log('============================================================\n');

const gitSha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
const gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
const gitStatus = execSync('git status --short', { encoding: 'utf8' }).trim();

// Check MariaDB Connection
let dbStatus = 'UNKNOWN';
let dbTables = 0;
let dbName = process.env.DB_NAME || process.env.MYSQL_DATABASE || 'ai_resume_builder';
try {
    const pool = mysql.createPool({
        host: process.env.DB_HOST || process.env.MYSQL_HOST || '127.0.0.1',
        port: Number(process.env.DB_PORT || process.env.MYSQL_PORT) || 3306,
        user: process.env.DB_USER || process.env.MYSQL_USER || 'root',
        password: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : (process.env.MYSQL_PASSWORD || ''),
        database: dbName,
        waitForConnections: true,
        connectionLimit: 5
    });
    const [rows] = await pool.query('SHOW TABLES');
    dbTables = rows.length;
    dbStatus = `UP (Connected: ${dbName}, ${dbTables} tables)`;
    await pool.end();
} catch (err) {
    dbStatus = `ERROR: ${err.message}`;
}

// Check Backend PID
let backendPid = process.pid;
let runtimeCheck = 'UNKNOWN';
try {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    const res = await fetch('https://ai-resume-builder.local/api/healthz');
    const data = await res.json();
    runtimeCheck = `HEALTHY: ${data.status} (Owner: ${data.authoritativeDatabase})`;
} catch (err) {
    runtimeCheck = `FAILED: ${err.message}`;
}

// Build timestamp
let distTimestamp = 'NO DIST FOLDER';
if (fs.existsSync('dist')) {
    const stat = fs.statSync('dist');
    distTimestamp = stat.mtime.toISOString();
}

const checkpoint = {
    timestamp: new Date().toISOString(),
    gitSha,
    gitBranch,
    gitStatus: gitStatus || 'CLEAN (nothing to commit)',
    runtimeUrl: 'https://ai-resume-builder.local/',
    backendStatus: runtimeCheck,
    databaseStatus: dbStatus,
    databaseName: dbName,
    tableCount: dbTables,
    frontendBuildTimestamp: distTimestamp,
    checkpointTag: 'pre-audit-checkpoint-' + new Date().toISOString().replace(/[:.]/g, '-')
};

console.log('Checkpoint Evidence Summary:');
console.log(`  Git SHA:                 ${checkpoint.gitSha}`);
console.log(`  Git Branch:              ${checkpoint.gitBranch}`);
console.log(`  Git Status:              ${checkpoint.gitStatus}`);
console.log(`  Runtime Target:          ${checkpoint.runtimeUrl}`);
console.log(`  Runtime Status:          ${checkpoint.backendStatus}`);
console.log(`  Database Engine:         ${checkpoint.databaseStatus}`);
console.log(`  Frontend Build:          ${checkpoint.frontendBuildTimestamp}`);
console.log(`  Forensic Tag:            ${checkpoint.checkpointTag}\n`);

// Create tag
try {
    execSync(`git tag ${checkpoint.checkpointTag}`);
    console.log(`✓ Created immutable tag: ${checkpoint.checkpointTag}`);
} catch (e) {
    console.log(`Tag creation notice: ${e.message}`);
}

fs.writeFileSync('test-results/PHASE_0_CHECKPOINT.json', JSON.stringify(checkpoint, null, 2));
