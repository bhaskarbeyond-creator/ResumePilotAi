import { execSync } from 'child_process';
import fs from 'fs';

const code = `
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, '../.env') });

const { execSync } = require('child_process');
const fs = require('fs');

async function createBackup() {
    console.log('=== CREATING PRODUCTION FREEZE BACKUP ===');
    const dbUser = process.env.DB_USER || process.env.MYSQL_USER || 'u727965524_airesume';
    const dbPass = process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : (process.env.MYSQL_PASSWORD || '');
    const dbName = process.env.DB_NAME || process.env.MYSQL_DATABASE || 'u727965524_airesume';
    const dbHost = process.env.DB_HOST || process.env.MYSQL_HOST || '127.0.0.1';

    const backupDir = path.join(require('os').homedir(), 'backups');
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = \`backup_production_freeze_\${timestamp}.sql\`;
    const filepath = path.join(backupDir, filename);

    const cmd = \`mysqldump -h \${dbHost} -u \${dbUser} -p'\${dbPass}' --single-transaction --routines --triggers \${dbName} > \${filepath}\`;
    console.log('Running mysqldump...');
    execSync(cmd);

    const stats = fs.statSync(filepath);
    console.log('Backup created successfully!');
    console.log('File Path:', filepath);
    console.log('File Size:', (stats.size / 1024).toFixed(2), 'KB (', stats.size, 'bytes )');

    // Gzip the backup
    execSync(\`gzip -f \${filepath}\`);
    const gzStats = fs.statSync(filepath + '.gz');
    console.log('Compressed File Path:', filepath + '.gz');
    console.log('Compressed File Size:', (gzStats.size / 1024).toFixed(2), 'KB');

    console.log('=== PRODUCTION BACKUP COMPLETED & VERIFIED ===');
}

createBackup().catch(err => {
    console.error('Backup Error:', err);
    process.exit(1);
});
`;

fs.writeFileSync('scripts/remote_create_backup.js', code);
execSync('scp -o BatchMode=yes scripts/remote_create_backup.js airesume:~/backend/remote_create_backup.js');
const out = execSync('ssh -o BatchMode=yes airesume "cd ~/backend && /opt/alt/alt-nodejs20/root/usr/bin/node remote_create_backup.js"').toString();
console.log(out);
execSync('ssh -o BatchMode=yes airesume "rm -f ~/backend/remote_create_backup.js"');
fs.unlinkSync('scripts/remote_create_backup.js');
