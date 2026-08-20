import { execSync } from 'node:child_process';
import fs from 'node:fs';

const remoteDeepRedisProbe = `
const net = require('net');
const fs = require('fs');
const { execSync } = require('child_process');

console.log('====================================================');
console.log('DEEP REDIS SCAN & VERIFICATION ON HOSTINGER SERVER');
console.log('====================================================');

// 1. Check PHP Redis extension connection test
console.log('\\n1. Running PHP phpredis CLI probe...');
try {
  const phpOut = execSync('php -r "if(extension_loaded(\\'redis\\')){ echo \\"phpredis is LOADED\\\\n\\"; try { \\$r = new Redis(); \\$ok = @\\$r->connect(\\'127.0.0.1\\', 6379, 1); echo \\"127.0.0.1:6379 connect result: \\" . (\\$ok ? \\"CONNECTED\\\\n\\" : \\"FAILED\\\\n\\"); } catch(Exception \\$e){ echo \\"Error: \\" . \\$e->getMessage() . \\"\\\\n\\"; } } else { echo \\"phpredis NOT loaded\\\\n\\"; }"', { encoding: 'utf8' });
  console.log(phpOut);
} catch (err) {
  console.log('PHP probe error:', err.message);
}

// 2. Scan Unix domain sockets
console.log('\\n2. Scanning potential Redis Unix sockets...');
const socketCandidates = [
  '/tmp/redis.sock',
  '/tmp/redis-server.sock',
  '/var/run/redis/redis.sock',
  '/var/run/redis/redis-server.sock',
  '/run/redis/redis.sock',
  '/tmp/.redis.sock',
  '/home/u727965524/.redis/redis.sock',
  '/home/u727965524/redis.sock'
];

socketCandidates.forEach(sock => {
  if (fs.existsSync(sock)) {
    console.log('Found socket file:', sock);
    const client = net.createConnection(sock);
    client.on('connect', () => {
      console.log('✓ SUCCESS: Connected to Redis socket at:', sock);
      client.write('*1\\r\\n$4\\r\\nPING\\r\\n');
    });
    client.on('data', d => {
      console.log('Redis response from socket:', d.toString());
      client.destroy();
    });
    client.on('error', e => {
      console.log('Socket connect error on ' + sock + ':', e.message);
    });
  } else {
    // console.log('Socket candidate not present:', sock);
  }
});

// 3. Scan TCP ports
console.log('\\n3. Scanning TCP Ports for Redis services...');
const ports = [6379, 6380, 16379, 26379, 11211, 8080, 3306, 5432];

async function scanPorts() {
  for (const port of ports) {
    await new Promise((resolve) => {
      const client = net.createConnection(port, '127.0.0.1');
      client.setTimeout(1000);
      client.on('connect', () => {
        console.log('✓ TCP Port ' + port + ' is OPEN on 127.0.0.1');
        if (port === 6379 || port === 6380 || port === 16379) {
          client.write('*1\\r\\n$4\\r\\nPING\\r\\n');
        } else {
          client.destroy();
          resolve();
        }
      });
      client.on('data', d => {
        console.log('  Response on port ' + port + ':', d.toString().trim());
        client.destroy();
        resolve();
      });
      client.on('timeout', () => {
        client.destroy();
        resolve();
      });
      client.on('error', err => {
        console.log('  TCP Port ' + port + ': ' + err.message);
        resolve();
      });
    });
  }
}

// 4. Check tmp directory for any new socket files
console.log('\\n4. Listing all sockets in /tmp and home directory:');
try {
  const tmpFiles = fs.readdirSync('/tmp');
  console.log('/tmp contents:', tmpFiles);
} catch (e) {
  console.log('Cannot read /tmp:', e.message);
}

scanPorts().then(() => {
  console.log('\\n====================================================');
  console.log('REDIS SCAN COMPLETE');
  console.log('====================================================');
});
`;

fs.writeFileSync('deep-redis-probe.js', remoteDeepRedisProbe);
try {
  execSync('scp deep-redis-probe.js airesume:backend/deep-redis-probe.js', { stdio: 'inherit' });
  const out = execSync('ssh airesume "cd backend && /opt/alt/alt-nodejs20/root/usr/bin/node deep-redis-probe.js && rm deep-redis-probe.js"', { encoding: 'utf8' });
  console.log(out);
} finally {
  if (fs.existsSync('deep-redis-probe.js')) fs.unlinkSync('deep-redis-probe.js');
}
