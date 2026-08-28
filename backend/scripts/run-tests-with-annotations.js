'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const testDir = path.join(__dirname, '..', 'test');
const files = fs.readdirSync(testDir)
  .filter(file => file.endsWith('.test.js'))
  .sort()
  .map(file => path.join('test', file));

const child = spawn(process.execPath, ['--test', '--test-concurrency=1', '--test-force-exit', ...files], {
  cwd: path.join(__dirname, '..'),
  env: process.env,
  stdio: ['ignore', 'pipe', 'pipe'],
});

let buffer = '';
function capture(chunk, stream) {
  const text = String(chunk);
  buffer += text;
  if (buffer.length > 240_000) buffer = buffer.slice(-240_000);
  stream.write(chunk);
}

function annotationSafe(text, limit = 1800) {
  return String(text || '')
    .replace(/%/g, '%25')
    .replace(/\r/g, '%0D')
    .replace(/\n/g, '%0A')
    .slice(0, limit);
}

child.stdout.on('data', chunk => capture(chunk, process.stdout));
child.stderr.on('data', chunk => capture(chunk, process.stderr));
child.on('exit', (code, signal) => {
  if ((code || signal) && process.env.GITHUB_ACTIONS) {
    const lines = buffer.split(/\r?\n/);
    const notOk = lines
      .map((line, index) => ({ line, index }))
      .filter(item => /^not ok\b/.test(item.line));
    const failures = notOk.length ? notOk.slice(0, 8) : [{ line: `node --test exited ${code || signal}`, index: Math.max(0, lines.length - 60) }];
    failures.forEach((item, failureIndex) => {
      const excerpt = lines.slice(Math.max(0, item.index - 6), Math.min(lines.length, item.index + 28)).join('\n');
      console.error(`::error title=Backend node:test failure ${failureIndex + 1}::${annotationSafe(excerpt)}`);
    });
  }
  process.exit(code || (signal ? 1 : 0));
});
