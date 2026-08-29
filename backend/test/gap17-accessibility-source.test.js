'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('GAP-17: skip link and main-content landmarks are present', () => {
  const html = read('index.html');
  assert.match(html, /class="skip-link"[\s\S]{0,80}href="#main-content"/);
  const css = read('src/index.css');
  assert.match(css, /\.skip-link/);
  assert.match(read('src/components/admin/Admin.jsx'), /id="main-content"/);
  assert.match(read('src/components/AppShell/AuthenticatedAppShell.jsx'), /id="main-content"/);
});

test('GAP-17: User 360 drawer is a modal dialog with keyboard focus management', () => {
  const source = read('src/components/admin/usersManager/User360Drawer.jsx');
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /aria-labelledby="user-360-title"/);
  assert.match(source, /drawerRef/);
  assert.match(source, /previouslyFocusedRef/);
  assert.match(source, /e\.key !== 'Tab'/);
  assert.match(source, /focus\(\)/);
});

test('GAP-17: form controls in the add-tenant flow are labelled', () => {
  const source = read('src/components/admin/usersManager/User360Drawer.jsx');
  assert.match(source, /<label[\s\S]{0,80}Select Organization/);
  assert.match(source, /<label[\s\S]{0,80}Assigned Tenant Role/);
});
