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
      reject(new Error(`Backend exited before it became ready (code=${code}, signal=${signal}); output:\n${output.value}`));
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

function waitForExit(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve({ code: child.exitCode, signal: child.signalCode });
      return;
    }
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Backend did not complete graceful shutdown before the deadline'));
    }, timeoutMs);
    const exited = (code, signal) => {
      cleanup();
      resolve({ code, signal });
    };
    const cleanup = () => {
      clearTimeout(timer);
      child.off('exit', exited);
    };
    child.once('exit', exited);
  });
}

test('executable backend drains its listener and closes cleanly on SIGTERM', { timeout: 20_000 }, async () => {
  const port = await reservePort();
  const output = { value: '' };
  const child = spawn(process.execPath, ['index.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      PROTOCOL: 'http',
      WEBSITE_NAME: '127.0.0.1',
      DB_HOST: '127.0.0.1',
      DB_PORT: '9',
      DB_USER: 'shutdown-fixture',
      DB_PASSWORD: '',
      DB_NAME: 'shutdown_fixture',
      DB_CONNECT_TIMEOUT_MS: '1000',
      CMS_SCHEDULER_ENABLED: 'false',
      NOTIFICATION_OUTBOX_WORKER_ENABLED: 'false',
      ENTERPRISE_OUTBOX_WORKER_ENABLED: 'false',
      TENANT_GC_WORKER_ENABLED: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => { output.value += chunk; });
  child.stderr.on('data', chunk => { output.value += chunk; });

  try {
    await waitForOutput(child, output, new RegExp(`HTTP Server running on port ${port}`), 12_000);
    assert.equal(child.kill('SIGTERM'), true, 'SIGTERM should be delivered to the backend process');
    const result = await waitForExit(child, 6_000);

    if (process.platform === 'win32') {
      assert.ok(result.code === 0 || result.signal === 'SIGTERM', `unexpected exit status on windows: ${JSON.stringify(result)}`);
    } else {
      assert.deepEqual(result, { code: 0, signal: null }, output.value);
      assert.match(output.value, /\[Shutdown\] SIGTERM received — draining connections\.\.\./);
      assert.match(output.value, /\[Shutdown\] Clean exit complete\./);
      assert.equal((output.value.match(/Clean exit complete/g) || []).length, 1, 'shutdown completion must be emitted once');
    }
    assert.doesNotMatch(output.value, /ReferenceError|TypeError|UnhandledPromiseRejection/);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }
});
