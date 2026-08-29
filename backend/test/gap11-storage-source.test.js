'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('GAP-11: storage settings remain fail-closed with no server-side provider enabled', () => {
  const settings = read('src/components/admin/settings/StorageSettings.jsx');
  assert.match(settings, /not configured/);
  assert.match(settings, /NOT VERIFIED/);
  assert.match(settings, /S3.*not enabled/i);
});

test('GAP-11: no browser Firebase storage client and no misleading storage upload helper remain', () => {
  const platform = read('src/services/api/platform.js');
  assert.doesNotMatch(platform, /uploadImageToFirebase/);
  const files = fs.readdirSync(path.join(root, 'src'), { recursive: true }).filter(f => /\.(js|jsx|ts|tsx)$/.test(f));
  const source = files.map(f => fs.readFileSync(path.join(root, 'src', f), 'utf8')).join('\n');
  assert.doesNotMatch(source, /firebase\/storage|getStorage\(|uploadBytes|uploadString/);
});

test('GAP-11: tenant storage ownership helpers still exist; enterprise data-plane storage provider remains removed', () => {
  const storage = read('backend/enterprise/tenantStorage.js');
  assert.match(storage, /tenantObjectKey/);
  assert.match(storage, /assertStorageContext/);
  assert.equal(fs.existsSync(path.join(root, 'backend/enterprise/storageProvider.js')), false);
});
