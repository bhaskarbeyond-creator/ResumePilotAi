'use strict';

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

function waitForOutput(child, output, pattern, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${pattern}; output:\n${output.value}`));
    }, timeoutMs);
    const inspect = () => {
      if (!pattern.test(output.value)) return;
      cleanup();
      resolve();
    };
    const exited = (code, signal) => {
      cleanup();
      reject(new Error(`Supervisor exited unexpectedly (code=${code}, signal=${signal}); output:\n${output.value}`));
    };
    const cleanup = () => {
      clearTimeout(timer);
      child.stdout.off('data', inspect);
      child.stderr.off('data', inspect);
      child.off('exit', exited);
    };
    child.stdout.on('data', inspect);
    child.stderr.on('data', inspect);
    child.once('exit', exited);
    inspect();
  });
}

test('Autonomous Cluster Supervisor: boots Primary Master and spawns worker', async () => {
  const port = await reservePort();
  const clusterScript = path.join(__dirname, '..', 'cluster.js');
  const output = { value: '' };

  const supervisor = spawn(process.execPath, [clusterScript], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      WORKERS: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const append = chunk => { output.value += chunk.toString(); };
  supervisor.stdout.on('data', append);
  supervisor.stderr.on('data', append);

  try {
    await waitForOutput(supervisor, output, /\[Supervisor\] Primary Master \d+ online/, 15000);
    await waitForOutput(supervisor, output, /\[Supervisor\] Spawning 1 autonomous worker/, 15000);
    assert.match(output.value, /\[Supervisor\] Primary Master/);
  } finally {
    supervisor.kill('SIGTERM');
    await new Promise(resolve => supervisor.once('exit', resolve));
  }
});

test('Autonomous Cluster Supervisor: self-heals and revives replacement on worker exit', async () => {
  const port = await reservePort();
  const clusterScript = path.join(__dirname, '..', 'cluster.js');
  const output = { value: '' };

  const supervisor = spawn(process.execPath, [clusterScript], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      WORKERS: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const append = chunk => { output.value += chunk.toString(); };
  supervisor.stdout.on('data', append);
  supervisor.stderr.on('data', append);

  try {
    await waitForOutput(supervisor, output, /Worker \d+ is online and ready/, 15000);
    const workerPidMatch = output.value.match(/Worker (\d+) is online and ready/);
    assert.ok(workerPidMatch, 'Worker PID should be logged');
    const firstWorkerPid = parseInt(workerPidMatch[1], 10);

    // Simulate worker crash by killing the child process directly
    try {
      process.kill(firstWorkerPid, 'SIGKILL');
    } catch (_) {
      // In case platform permissions differ
    }

    // Supervisor must detect the death and log instant revival
    await waitForOutput(supervisor, output, /\[Supervisor ✓\] Instant replacement worker revived/, 15000);
    assert.match(output.value, /\[Supervisor ⚠️\] Worker \d+ terminated/);
  } finally {
    supervisor.kill('SIGTERM');
    await new Promise(resolve => supervisor.once('exit', resolve));
  }
});
