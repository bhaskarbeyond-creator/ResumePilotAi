#!/usr/bin/env node
/**
 * dr-offsite.mjs
 * --------------
 * Offsite (independent) backup transport for ResumePilot AI.
 *
 * CLOUD-FIRST PRINCIPLE, applied in the order the brief requires:
 *   1. Provider-managed object storage with server-side encryption and,
 *      where available, object-lock immutability.  (rclone -> S3/GCS/Azure/B2)
 *   2. Provider-native CLI (aws / gsutil / az) when rclone is unavailable.
 *   3. Custom implementation — only if neither is possible. It is not needed
 *      here, so there is no bespoke HTTP uploader in this repository.
 *
 * This module NEVER invokes a shell. It returns an argv array for
 * child_process.execFile, which eliminates the class of command-injection
 * bugs that the previous `mysqldump` invocation had to be patched for.
 *
 * Nothing here is claimed as active. Detection is empirical, and a configured
 * destination only becomes VERIFIED once scripts/dr-monitor.mjs observes a
 * successful upload into it.
 */

'use strict';

import fs from 'node:fs';
import path from 'node:path';

/** Tools this module knows how to drive, in order of preference. */
export const PROVIDERS = Object.freeze(['rclone', 'aws', 'gsutil', 'az']);

/**
 * Characters that would let a misconfigured destination escape into a shell or
 * into an unintended remote path. Rejected up front, before any process spawn.
 */
const UNSAFE_DESTINATION = /[;&|`$><\n\r"'\\]/;

/** Permitted destination schemes. Anything else is refused, not assumed. */
const DESTINATION_PATTERNS = Object.freeze({
  rclone: /^[A-Za-z0-9_ -]+:[A-Za-z0-9._\/-]+$/,
  aws: /^s3:\/\/[a-z0-9][a-z0-9.-]{1,61}[a-z0-9](\/[A-Za-z0-9._\/-]*)?$/,
  gsutil: /^gs:\/\/[a-z0-9][a-z0-9._-]{1,221}[a-z0-9](\/[A-Za-z0-9._\/-]*)?$/,
  az: /^[a-z0-9]([a-z0-9]|-(?!-)){2,62}$/, // container name for `az`
});

/**
 * Throw if a destination is not safe to hand to a subprocess.
 * Exported so callers can validate configuration at load time.
 */
export function assertSafeDestination(provider, destination) {
  if (!PROVIDERS.includes(provider)) {
    throw new Error(`Unsupported offsite provider: ${provider}`);
  }
  if (typeof destination !== 'string' || !destination.trim()) {
    throw new Error('Offsite destination is required');
  }
  if (UNSAFE_DESTINATION.test(destination)) {
    throw new Error('Offsite destination contains unsafe characters');
  }
  const pattern = DESTINATION_PATTERNS[provider];
  if (pattern && !pattern.test(destination.trim())) {
    throw new Error(`Offsite destination is not a valid ${provider} target: ${destination}`);
  }
  return destination.trim();
}

/**
 * Resolve an executable on PATH.
 *
 * `existsSync` is injectable purely so this can be asserted in CI without
 * installing rclone; production callers use the real filesystem.
 */
export function whichSync(name, { pathValue = process.env.PATH || '', existsSync = fs.existsSync } = {}) {
  if (typeof name !== 'string' || !/^[A-Za-z0-9._-]+$/.test(name)) return null;
  if (name.includes('/')) return existsSync(name) ? name : null;
  const separator = process.platform === 'win32' ? ';' : ':';
  for (const dir of String(pathValue).split(separator)) {
    if (!dir) continue;
    const candidate = path.join(dir, process.platform === 'win32' ? `${name}.exe` : name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Empirically detect which offsite transports are actually installed.
 * A provider that is merely "available in principle" is not reported.
 */
export function detectOffsiteProviders(options = {}) {
  const env = options.env || process.env;
  const remoteName = env.BACKUP_OFFSITE_RCLONE_REMOTE || null;
  return PROVIDERS.map((name) => {
    const binary = whichSync(name, options);
    return {
      provider: name,
      installed: Boolean(binary),
      binary,
      configured: name === 'rclone'
        ? Boolean(binary && remoteName)
        : Boolean(binary && (env.BACKUP_OFFSITE_DESTINATION || null)),
    };
  });
}

/** Pick the first installed provider, honouring an explicit override. */
export function selectOffsiteProvider(options = {}) {
  const detected = detectOffsiteProviders(options);
  const preferred = (options.env || process.env).BACKUP_OFFSITE_PROVIDER;
  if (preferred) {
    const found = detected.find((entry) => entry.provider === preferred);
    if (!found) throw new Error(`BACKUP_OFFSITE_PROVIDER=${preferred} is not one of ${PROVIDERS.join(', ')}`);
    return found;
  }
  return detected.find((entry) => entry.installed) || { provider: 'none', installed: false, binary: null, configured: false };
}

/**
 * Build the argv for an offsite copy. Returned as an array for execFile.
 *
 * @returns {{provider: string, binary: string|null, argv: string[], note: string}}
 */
export function buildOffsiteUpload({ provider, binary, filePath, destination, bucket = null } = {}) {
  assertSafeDestination(provider, destination);
  if (typeof filePath !== 'string' || !filePath.trim()) {
    throw new Error('Backup file path is required');
  }

  const target = destination.replace(/\/+$/, '');
  const fileName = path.basename(filePath);

  if (provider === 'rclone') {
    const remotePath = `${target}/${fileName}`;
    assertSafeDestination('rclone', remotePath);
    return {
      provider,
      binary,
      argv: ['copyto', filePath, remotePath, '--checksum', '--no-traverse'],
      destination: remotePath,
      note: 'rclone target must be a bucket with a retention/object-lock policy for immutability.',
    };
  }

  if (provider === 'aws') {
    return {
      provider,
      binary,
      argv: ['s3', 'cp', filePath, `${target}/${fileName}`, '--sse', 'AES256', '--only-show-errors'],
      destination: `${target}/${fileName}`,
      note: 'Use --sse aws:kms plus S3 Object Lock (COMPLIANCE mode) for immutability.',
    };
  }

  if (provider === 'gsutil') {
    return {
      provider,
      binary,
      argv: ['cp', filePath, `${target}/${fileName}`],
      destination: `${target}/${fileName}`,
      note: 'Enable GCS Bucket Lock and a retention policy on the destination bucket.',
    };
  }

  // az — destination is a container name, not a URI.
  return {
    provider,
    binary,
    argv: [
      'storage', 'blob', 'upload',
      '--file', filePath,
      '--container-name', target,
      '--name', fileName,
      '--overwrite', 'false',
    ],
    destination: `${target}/${fileName}`,
    note: 'Enable Azure Blob immutable storage with a time-based retention policy.',
  };
}
