import { execSync } from 'child_process';
import fs from 'fs';

const code = `
const { getPool } = require('./database/mysql');
async function run() {
    const [rows] = await getPool().query('SHOW TABLES');
    console.log('TABLE_COUNT:', rows.length);
    console.log('TABLES:', rows.map(r => Object.values(r)[0]));
    process.exit(0);
}
run().catch(console.error);
`;

fs.writeFileSync('scripts/remote_get_tables.js', code);
execSync('scp -o BatchMode=yes scripts/remote_get_tables.js airesume:~/backend/remote_get_tables.js');
const out = execSync('ssh -o BatchMode=yes airesume "cd ~/backend && /opt/alt/alt-nodejs20/root/usr/bin/node remote_get_tables.js"').toString();
console.log(out);
execSync('ssh -o BatchMode=yes airesume "rm -f ~/backend/remote_get_tables.js"');
fs.unlinkSync('scripts/remote_get_tables.js');
