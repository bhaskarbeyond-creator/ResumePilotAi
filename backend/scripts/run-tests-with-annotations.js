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
  if (buffer.length > 120_000) buffer = buffer.slice(-120_000);
  stream.write(chunk);
}
child.stdout.on('data', chunk => capture(chunk, process.stdout));
child.stderr.on('data', chunk => capture(chunk, process.stderr));
child.on('exit', (code, signal) => {
  if (code || signal) {
    const lines = buffer.split(/\r?\n/);
    const notOk = lines
      .map((line, index) => ({ line, index }))
      .filter(item => /^not ok\b/.test(item.line));
    const source = notOk.length
      ? notOk.flatMap(item => lines.slice(Math.max(0, item.index - 3), Math.min(lines.length, item.index + 18)))
      : lines.slice(-80);
    const excerpt = source.join(' ').replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A').slice(0, 1800);
    if (process.env.GITHUB_ACTIONS) {
      console.error(`::error title=Backend node:test failure::${excerpt || `node --test exited ${code || signal}`}`);
    }
  }
  process.exit(code || (signal ? 1 : 0));
});
