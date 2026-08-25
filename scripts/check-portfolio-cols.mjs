import { execSync } from 'child_process';
import fs from 'fs';

const code = `
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, '../.env') });

const { getPool } = require('./database/mysql');

async function checkCols() {
    const pool = getPool();
    const [cols] = await pool.query('DESCRIBE portfolios');
    console.log('Columns in portfolios table:', cols.map(c => c.Field + ' (' + c.Type + ')').join(', '));
    process.exit(0);
}

checkCols().catch(console.error);
`;

fs.writeFileSync('scripts/remote_check_cols.js', code);
execSync('scp -o BatchMode=yes scripts/remote_check_cols.js airesume:~/backend/remote_check_cols.js');
const out = execSync('ssh -o BatchMode=yes airesume "cd ~/backend && /opt/alt/alt-nodejs20/root/usr/bin/node remote_check_cols.js"').toString();
console.log(out);
execSync('ssh -o BatchMode=yes airesume "rm -f ~/backend/remote_check_cols.js"');
fs.unlinkSync('scripts/remote_check_cols.js');
