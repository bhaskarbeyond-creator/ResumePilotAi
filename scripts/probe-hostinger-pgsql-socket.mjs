import { execSync } from 'node:child_process';
import fs from 'node:fs';

const remotePgSocketProbe = `
const net = require('net');
const { Pool } = require('pg');

async function testPgSocket() {
  console.log('=== TESTING POSTGRESQL SOCKET & PORTS ===');

  // Test UNIX Domain Socket
  const socketPath = '/tmp/.s.PGSQL.5432';
  console.log('Testing socket at:', socketPath);

  const socketClient = net.createConnection(socketPath);
  socketClient.on('connect', () => {
    console.log('SUCCESS: Connected to PostgreSQL UNIX Socket at', socketPath);
    socketClient.destroy();
  });
  socketClient.on('error', (err) => {
    console.log('Socket connect error:', err.message);
  });

  // Test TCP Port 5432
  const tcpClient = net.createConnection(5432, '127.0.0.1');
  tcpClient.on('connect', () => {
    console.log('SUCCESS: Connected to PostgreSQL TCP Port 5432 on 127.0.0.1');
    tcpClient.destroy();
  });
  tcpClient.on('error', (err) => {
    console.log('TCP 5432 connect error:', err.message);
  });

  // Test TCP Port 6379 (Redis)
  const redisTcp = net.createConnection(6379, '127.0.0.1');
  redisTcp.on('connect', () => {
    console.log('SUCCESS: Connected to Redis TCP Port 6379 on 127.0.0.1');
    redisTcp.destroy();
  });
  redisTcp.on('error', (err) => {
    console.log('Redis TCP 6379 connect error:', err.message);
  });
}

testPgSocket();
`;

fs.writeFileSync('probe-pg-socket.js', remotePgSocketProbe);
try {
  execSync('scp probe-pg-socket.js airesume:backend/probe-pg-socket.js', { stdio: 'inherit' });
  const out = execSync('ssh airesume "cd backend && /opt/alt/alt-nodejs20/root/usr/bin/node probe-pg-socket.js && rm probe-pg-socket.js"', { encoding: 'utf8' });
  console.log(out);
} finally {
  if (fs.existsSync('probe-pg-socket.js')) fs.unlinkSync('probe-pg-socket.js');
}
