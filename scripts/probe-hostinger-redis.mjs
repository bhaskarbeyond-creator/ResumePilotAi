import { execSync } from 'node:child_process';
import fs from 'node:fs';

const remoteRedisProbe = `
const { execSync } = require('child_process');
const fs = require('fs');

async function testRedisServer() {
  console.log('Testing real Redis binary availability...');
  try {
    // Check if redis-memory-server binary exists or can be started
    const { RedisMemoryServer } = require('redis-memory-server');
    console.log('RedisMemoryServer module loaded');
    const redisServer = await RedisMemoryServer.create({
      instance: { port: 16379, ip: '127.0.0.1' }
    });
    const uri = await redisServer.getUri();
    console.log('Real Redis Server is RUNNING at:', uri);

    // Test real ioredis connection against it
    const Redis = require('ioredis');
    const client = new Redis(uri);
    await client.set('enterprise:probe', 'active_10_10');
    const val = await client.get('enterprise:probe');
    console.log('Real Redis SET/GET test:', val);
    await client.quit();
    await redisServer.stop();
    console.log('Real Redis Server lifecycle: 100% OPERATIONAL');
  } catch (err) {
    console.log('Redis probe error:', err.message);
  }
}

testRedisServer();
`;

fs.writeFileSync('probe-redis.js', remoteRedisProbe);
try {
  execSync('scp probe-redis.js airesume:backend/probe-redis.js', { stdio: 'inherit' });
  const out = execSync('ssh airesume "cd backend && /opt/alt/alt-nodejs20/root/usr/bin/node probe-redis.js && rm probe-redis.js"', { encoding: 'utf8' });
  console.log(out);
} finally {
  if (fs.existsSync('probe-redis.js')) fs.unlinkSync('probe-redis.js');
}
