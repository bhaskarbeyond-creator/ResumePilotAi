import test from 'node:test';
import assert from 'node:assert/strict';
import { isSafeInternalPath, loginPathWithNext, getPostLoginRedirectPath } from '../src/utils/safeInternalPath.js';

test('safe internal paths accept enterprise deep links and reject off-site bounces', () => {
  assert.equal(isSafeInternalPath('/enterprise?tab=overview&tenant=abc'), true);
  assert.equal(isSafeInternalPath('/login'), true);
  assert.equal(isSafeInternalPath('//evil.example'), false);
  assert.equal(isSafeInternalPath('https://evil.example/enterprise'), false);
  assert.equal(isSafeInternalPath('/\\evil'), false);
  assert.equal(isSafeInternalPath('/%5cevil'), false);
  assert.equal(isSafeInternalPath('/%2f%2fevil.example'), false);
  assert.equal(loginPathWithNext('/enterprise?tab=members'), '/login?next=%2Fenterprise%3Ftab%3Dmembers');
  assert.equal(loginPathWithNext('https://evil.example'), '/login');
  assert.equal(getPostLoginRedirectPath('?next=%2Fenterprise%3Ftab%3Doverview'), '/enterprise?tab=overview');
  assert.equal(getPostLoginRedirectPath('?next=https%3A%2F%2Fevil.example'), null);
  assert.equal(getPostLoginRedirectPath(''), null);
});

