import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve('backend/.env') });
dotenv.config({ path: path.resolve('.env') });

console.log('============================================================');
console.log('PHASE 9: KPI & SECURITY METRIC FORENSIC AUDIT');
console.log('============================================================\n');

const pool = mysql.createPool({
    host: process.env.DB_HOST || process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || process.env.MYSQL_PORT) || 3306,
    user: process.env.DB_USER || process.env.MYSQL_USER || 'root',
    password: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : (process.env.MYSQL_PASSWORD || ''),
    database: process.env.DB_NAME || process.env.MYSQL_DATABASE || 'ai_resume_builder',
    waitForConnections: true,
    connectionLimit: 5
});

const kpiRegistry = [
    {
        metricName: 'High Risk Events (Audit Log)',
        screen: '/adm/security & /adm/audit',
        sourceTable: 'admin_audit_logs',
        query: 'SELECT COUNT(*) as cnt FROM admin_audit_logs WHERE severity IN (\'CRITICAL\', \'HIGH\') OR action LIKE \'%SECURITY_ALERT%\'',
        timeRange: 'All historical audit entries (historical ledger)',
        activeVsHistorical: 'Historical record of sensitive administrative and security-critical actions',
        isCached: 'Live un-cached MariaDB query'
    },
    {
        metricName: 'High / Critical Threats (Security Center)',
        screen: '/adm/security',
        sourceTable: 'security_audit_logs',
        query: 'SELECT COUNT(*) as cnt FROM security_audit_logs WHERE severity IN (\'HIGH\', \'CRITICAL\')',
        timeRange: 'High and Critical severity security audit events',
        activeVsHistorical: 'Historical security audit ledger recording high/critical security events',
        isCached: 'Live un-cached MariaDB query'
    },
    {
        metricName: 'Total Platform Users',
        screen: '/adm (Command Center) & /adm/users',
        sourceTable: 'users',
        query: 'SELECT COUNT(*) as cnt FROM users',
        timeRange: 'All registered platform accounts',
        activeVsHistorical: 'Total active registered identities in MariaDB users table',
        isCached: 'Live un-cached MariaDB query'
    },
    {
        metricName: 'Active Paid Subscribers',
        screen: '/adm (Command Center) & /adm/subscriptions',
        sourceTable: 'users',
        query: 'SELECT COUNT(*) as cnt FROM users WHERE membership IN (\'Premium\', \'Pro\', \'Enterprise\')',
        timeRange: 'Currently active paid tier entitlements',
        activeVsHistorical: 'Active entitlements in MariaDB',
        isCached: 'Live un-cached MariaDB query'
    },
    {
        metricName: 'Open Support Tickets',
        screen: '/adm/support (Help Desk)',
        sourceTable: 'support_tickets',
        query: 'SELECT COUNT(*) as cnt FROM support_tickets WHERE status IN (\'OPEN\', \'PENDING\')',
        timeRange: 'Active unresolved tickets awaiting staff response',
        activeVsHistorical: 'Active queue (resolved/closed tickets excluded from open counter)',
        isCached: 'Live un-cached MariaDB query'
    },
    {
        metricName: 'Total Active Enterprise Tenants',
        screen: '/adm/tenants',
        sourceTable: 'enterprise_tenants',
        query: 'SELECT COUNT(*) as cnt FROM enterprise_tenants WHERE lifecycleState = \'ACTIVE\'',
        timeRange: 'Currently provisioned active enterprise organizations',
        activeVsHistorical: 'Active vs Suspended distinction tracked via lifecycleState column',
        isCached: 'Live un-cached MariaDB query'
    }
];

const results = [];

for (const kpi of kpiRegistry) {
    try {
        const [rows] = await pool.query(kpi.query);
        const count = rows[0]?.cnt ?? rows[0]?.count ?? 0;
        results.push({
            ...kpi,
            currentLiveValue: Number(count),
            queryStatus: 'SUCCESS'
        });
        console.log(`[KPI] ${kpi.metricName.padEnd(40)} -> Live Count: ${count}`);
        console.log(`      Query: ${kpi.query}`);
        console.log(`      Semantics: ${kpi.activeVsHistorical}\n`);
    } catch (err) {
        results.push({
            ...kpi,
            currentLiveValue: 'ERROR',
            queryStatus: err.message
        });
        console.error(`[KPI ERROR] ${kpi.metricName}:`, err.message);
    }
}

await pool.end();

fs.writeFileSync('test-results/KPI_SECURITY_METRICS_FORENSIC.json', JSON.stringify({ totalKpis: results.length, results }, null, 2));
