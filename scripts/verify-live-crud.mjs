#!/usr/bin/env node
/**
 * Compatibility entry point for the former live CRUD probe.
 *
 * The old script created a production SUPER_ADMIN fixture, embedded a password,
 * used a hard-coded origin, and reported a provider invocation as a complete
 * certification. The maintained verifier is explicit about credentials,
 * destructive consent, read-back, RBAC, and incomplete live evidence.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const target = fileURLToPath(new URL('./verify-crud-live.mjs', import.meta.url));
const child = spawn(process.execPath, [target], { stdio: 'inherit', env: process.env });
child.on('error', error => {
  console.error(`Unable to start ${target}: ${error.message}`);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  process.exitCode = typeof code === 'number' ? code : 1;
  if (signal) console.error(`CRUD certification stopped by ${signal}.`);
});
