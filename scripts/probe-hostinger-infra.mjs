import { execSync } from 'node:child_process';
import fs from 'node:fs';

const remoteProbeScript = `
const net = require('net');
const http = require('http');

console.log('=== SYSTEM DIAGNOSTICS ===');
console.log('UID:', process.getuid(), 'GID:', process.getgid());
console.log('Node Version:', process.version);
console.log('Platform/Arch:', process.platform, process.arch);
console.log('Current CWD:', process.cwd());

// Test TCP port binding on loopback
const portsToTest = [5432, 6379, 15432, 16379, 25432, 26379];
for (const port of portsToTest) {
  try {
    const s = net.createServer().listen(port, '127.0.0.1');
    console.log('Port ' + port + ' BIND: SUCCESS');
    s.close();
  } catch (err) {
    console.log('Port ' + port + ' BIND: FAILED (' + err.message + ')');
  }
}
`;

fs.writeFileSync('probe-remote.js', remoteProbeScript);
try {
  execSync('scp probe-remote.js airesume:probe-remote.js', { stdio: 'inherit' });
  const out = execSync('ssh airesume "/opt/alt/alt-nodejs20/root/usr/bin/node probe-remote.js && rm probe-remote.js"', { encoding: 'utf8' });
  console.log(out);
} finally {
  if (fs.existsSync('probe-remote.js')) fs.unlinkSync('probe-remote.js');
}
