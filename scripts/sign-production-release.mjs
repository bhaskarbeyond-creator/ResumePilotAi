#!/usr/bin/env node
import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import fs from 'node:fs';

const [bundlePath, releaseSha, privateKeyPath] = process.argv.slice(2);
if (!bundlePath || !fs.statSync(bundlePath, { throwIfNoEntry: false })?.isFile()) {
  console.error('Release bundle does not exist.');
  process.exit(2);
}
if (!/^[0-9a-f]{40}$/.test(releaseSha || '')) {
  console.error('Release SHA must be 40 lowercase hexadecimal characters.');
  process.exit(2);
}
if (!privateKeyPath || !fs.statSync(privateKeyPath, { throwIfNoEntry: false })?.isFile()) {
  console.error('Release signing private key does not exist.');
  process.exit(2);
}

let privateKey;
try {
  privateKey = createPrivateKey(fs.readFileSync(privateKeyPath));
} catch {
  console.error('Release signing private key could not be parsed.');
  process.exit(2);
}
if (privateKey.asymmetricKeyType !== 'ed25519') {
  console.error('Release signing key must be Ed25519.');
  process.exit(2);
}

const bundle = fs.readFileSync(bundlePath);
const bundleSha256 = createHash('sha256').update(bundle).digest('hex');
const message = Buffer.from(`resumepilot-release-v1\n${releaseSha}\n${bundleSha256}\n`, 'ascii');
const signature = sign(null, message, privateKey).toString('base64url');
const publicDer = createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
const publicKeySha256 = createHash('sha256').update(publicDer).digest('hex');

if (!/^[A-Za-z0-9_-]{86}$/.test(signature)) {
  console.error('Unexpected Ed25519 signature encoding.');
  process.exit(3);
}

console.log(`bundle_sha256=${bundleSha256}`);
console.log(`signature=${signature}`);
console.log(`signing_public_key_sha256=${publicKeySha256}`);
