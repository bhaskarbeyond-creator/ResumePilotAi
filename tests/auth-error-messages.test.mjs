import test from 'node:test';
import assert from 'node:assert/strict';
import { getSafeAuthErrorMessage } from '../src/utils/authErrorMessages.js';

test('auth error mapper never echoes provider internals for unknown errors', () => {
  const message = getSafeAuthErrorMessage({ code: 'auth/internal-error', message: 'Firebase: Error (auth/internal-error). projectId=secret-prod' });
  assert.equal(message, 'Authentication failed. Please try again or contact support.');
  assert.doesNotMatch(message, /Firebase|projectId|secret-prod/);
});

test('auth error mapper returns user-safe account collision and MFA-neutral messages', () => {
  assert.match(getSafeAuthErrorMessage({ code: 'auth/account-exists-with-different-credential' }), /already exists/);
  assert.match(getSafeAuthErrorMessage({ code: 'auth/invalid-credential' }), /Invalid credentials/);
  assert.equal(getSafeAuthErrorMessage({ code: 'auth/popup-closed-by-user' }), '');
});
