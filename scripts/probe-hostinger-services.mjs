import { execSync } from 'node:child_process';
import fs from 'node:fs';

const remoteProbe = `
const net = require('net');

console.log('=== PROBING ALL LOCAL SERVICES ===');
const targets = [
  { name: 'MySQL TCP 3306', port: 3306, host: '127.0.0.1' },
  { name: 'Postgres TCP 5432', port: 5432, host: '127.0.0.1' },
  { name: 'Redis TCP 6379', port: 6379, host: '127.0.0.1' },
  { name: 'MySQL Unix Socket', path: '/var/lib/mysql/mysql.sock' },
  { name: 'Tmp MySQL Unix Socket', path: '/tmp/mysql.sock' }
];

targets.forEach(t => {
  const conn = t.path ? net.createConnection(t.path) : net.createConnection(t.port, t.host);
  conn.on('connect', () => {
    console.log('✓ SUCCESS: ' + t.name + ' is OPEN');
    conn.destroy();
  });
  conn.on('error', (err) => {
    console.log('✗ ' + t.name + ': ' + err.message);
  });
});
`;

fs.writeFileSync('probe-services.js', remoteProbe);
try {
  execSync('scp probe-services.js airesume:backend/probe-services.js', { stdio: 'inherit' });
  const out = execSync('ssh airesume "cd backend && /opt/alt/alt-nodejs20/root/usr/bin/node probe-services.js && rm probe-services.js"', { encoding: 'utf8' });
  console.log(out);
} finally {
  if (fs.existsSync('probe-services.js')) fs.unlinkSync('probe-services.js');
}
