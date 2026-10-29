/**
 * Mandate 11H — behavioural contract tests for candidate identity security,
 * Master Profile concurrency, MFA, session security and the GDPR lifecycle.
 *
 * The real TypeScript modules are imported and transpiled on the fly by a
 * small ESM loader built on the repository's own TypeScript dependency (the
 * same approach as mandate11e), so every assertion exercises shipped logic.
 *
 * Two modules are replaced, because they need a browser identity runtime:
 *  - src/lib/firebase.ts: `auth.currentUser` and `isFirebaseConfigured()` read
 *    the per-test state in globalThis.__m11h;
 *  - firebase/auth: recording fakes. Each assertion API returns a tagged
 *    object, so the tests can prove that TOTP and SMS challenges are completed
 *    with their own Firebase assertion types.
 * HTTP goes through the real shared axios client (lib/api-client.ts) with a
 * test adapter, so request envelopes and error normalisation are the real ones.
 *
 * Run: node --test developer-implemented/TESTS/unit/mandate11h-contracts.test.mjs
 */
import { createRequire, register } from 'node:module';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const currentFile = fileURLToPath(import.meta.url);
const frontendDir = path.resolve(path.dirname(currentFile), '../../../frontend');
const srcDir = path.join(frontendDir, 'src');
const typescriptEntry = pathToFileURL(path.join(frontendDir, 'node_modules/typescript/lib/typescript.js')).href;

const firebaseStub = `
export const auth = { get currentUser() { return globalThis.__m11h?.currentUser ?? null; } };
export const app = null;
export const googleProvider = null;
export const facebookProvider = null;
export function isFirebaseConfigured() { return Boolean(globalThis.__m11h?.firebaseConfigured); }
export const onAuthStateChanged = () => () => {};
export const signOut = async () => {};
const unavailable = async () => { throw Object.assign(new Error('stubbed'), { code: 'auth/not-configured' }); };
export const signInWithEmailAndPassword = unavailable;
export const createUserWithEmailAndPassword = unavailable;
export const sendPasswordResetEmail = unavailable;
export const signInWithPopup = unavailable;
`;

const firebaseAuthStub = `
const state = () => globalThis.__m11h;
const record = (entry) => { state().calls.push(entry); };
export const TotpMultiFactorGenerator = {
  FACTOR_ID: 'totp',
  assertionForSignIn(enrollmentId, code) { record({ op: 'totp-assertion', enrollmentId, code }); return { type: 'totp', enrollmentId, code }; },
};
export const PhoneMultiFactorGenerator = {
  FACTOR_ID: 'phone',
  assertion(credential) { record({ op: 'phone-assertion', credential }); return { type: 'phone', credential }; },
};
export class PhoneAuthProvider {
  static PROVIDER_ID = 'phone';
  static credential(verificationId, code) { return { verificationId, code }; }
  async verifyPhoneNumber(options, verifier) { record({ op: 'verify-phone', options, verifier }); return state().verificationId ?? 'verification-1'; }
}
export class RecaptchaVerifier { constructor() { record({ op: 'recaptcha' }); } clear() { record({ op: 'recaptcha-clear' }); } }
export function getMultiFactorResolver() { throw Object.assign(new Error('no resolver'), { code: 'auth/argument-error' }); }
export function multiFactor(user) { if (!user.__factors) throw new Error('unreadable'); return { enrolledFactors: user.__factors }; }
export const EmailAuthProvider = { credential(email, password) { return { email, password }; } };
export async function reauthenticateWithCredential(user, credential) {
  record({ op: 'reauthenticate', email: credential.email });
  const failure = state().reauthError;
  if (failure) throw failure;
  return { user };
}
export async function updatePassword(user, password) {
  record({ op: 'update-password', length: password.length });
  const failure = state().updateError;
  if (failure) throw failure;
}
`;

const loaderCode = `
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const srcDir = ${JSON.stringify(srcDir)};
const tsModule = await import(${JSON.stringify(typescriptEntry)});
const ts = tsModule.default ?? tsModule;
const EXTENSIONS = ['.ts', '.tsx', '.js', '/index.ts', '/index.tsx'];

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'firebase/auth') return { url: 'm11h-stub:firebase-auth', shortCircuit: true };
  if (specifier.startsWith('@/')) {
    const subPath = specifier.slice(2);
    for (const ext of EXTENSIONS) {
      const candidate = path.join(srcDir, subPath + ext);
      if (existsSync(candidate)) return nextResolve(pathToFileURL(candidate).href, context);
    }
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith('file:')) {
    const base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
    if (!existsSync(base)) {
      for (const ext of ['.ts', '.tsx', '.js']) {
        if (existsSync(base + ext)) return nextResolve(pathToFileURL(base + ext).href, context);
      }
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url === 'm11h-stub:firebase-auth') return { format: 'module', shortCircuit: true, source: ${JSON.stringify(firebaseAuthStub)} };
  if (url.startsWith('file:') && /[\\\\/]src[\\\\/]lib[\\\\/]firebase\\.ts$/.test(fileURLToPath(url))) {
    return { format: 'module', shortCircuit: true, source: ${JSON.stringify(firebaseStub)} };
  }
  if (url.startsWith('file:') && (url.endsWith('.ts') || url.endsWith('.tsx'))) {
    const file = fileURLToPath(url);
    const transpiled = ts.transpileModule(readFileSync(file, 'utf8'), {
      fileName: file,
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        verbatimModuleSyntax: false,
        esModuleInterop: true,
        isolatedModules: true,
      },
    });
    return { format: 'module', shortCircuit: true, source: transpiled.outputText };
  }
  return nextLoad(url, context);
}
`;

register(`data:text/javascript;base64,${Buffer.from(loaderCode, 'utf8').toString('base64')}`);

globalThis.__m11h = { calls: [], currentUser: null, firebaseConfigured: false };

const security = await import('../../../frontend/src/lib/session-security.ts');
const mfa = await import('../../../frontend/src/lib/mfa.ts');
const account = await import('../../../frontend/src/lib/account-settings.ts');
const master = await import('../../../frontend/src/lib/master-profile.ts');
const { apiClient } = await import('../../../frontend/src/lib/api-client.ts');
const { NoticeRegions } = await import('../../../frontend/src/components/settings/notice-regions.tsx');
const { AppearancePanel } = await import('../../../frontend/src/components/settings/appearance-panel.tsx');
const { ThemeProvider } = await import('../../../frontend/src/providers/theme-provider.tsx');

const requireFromFrontend = createRequire(path.join(frontendDir, 'package.json'));
const axios = requireFromFrontend('axios');
const React = requireFromFrontend('react');
const { renderToStaticMarkup } = requireFromFrontend('react-dom/server');

/* ─── Test plumbing ──────────────────────────────────────────────────────── */

let requests = [];
let responder = () => ({ status: 200, data: {} });

apiClient.defaults.adapter = async (config) => {
  const entry = {
    method: String(config.method).toUpperCase(),
    url: config.url,
    body: typeof config.data === 'string' && config.data ? JSON.parse(config.data) : config.data ?? null,
  };
  requests.push(entry);
  const { status, data } = await responder(entry);
  const response = { status, statusText: String(status), headers: {}, config, data, request: {} };
  if (status >= 200 && status < 300) return response;
  throw new axios.AxiosError(`Request failed with status code ${status}`, axios.AxiosError.ERR_BAD_RESPONSE, config, {}, response);
};

beforeEach(() => {
  requests = [];
  responder = () => ({ status: 200, data: {} });
  globalThis.__m11h = { calls: [], currentUser: null, firebaseConfigured: false };
});

const fieldsOf = (overrides = {}) => ({ ...account.emptyProfileFields(), firstname: 'Asha', lastname: 'Rao', ...overrides });

class MemoryStorage {
  constructor(entries = {}) { this.map = new Map(Object.entries(entries)); }
  get length() { return this.map.size; }
  key(index) { return [...this.map.keys()][index] ?? null; }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
}

/** A resolver-shaped object, as attached to Firebase's multi-factor error. */
function resolverWith(hints, resolveSignIn = async (assertion) => ({ user: { uid: 'u1' }, assertion })) {
  return { hints, session: { id: 'mfa-session' }, resolveSignIn };
}
const mfaError = (resolver) => Object.assign(new Error('Firebase: multi-factor required'), { code: 'auth/multi-factor-auth-required', resolver });

/* ─── Return-path security ───────────────────────────────────────────────── */

test('return path: safe application paths are accepted', () => {
  assert.equal(security.safeReturnPath('/dashboard'), '/dashboard');
  assert.equal(security.safeReturnPath('/resumes?page=2'), '/resumes?page=2');
  assert.equal(security.safeReturnPath('/dashboard/settings?tab=security#password'), '/dashboard/settings?tab=security#password');
});

test('return path: protocol-relative URLs are rejected', () => {
  assert.equal(security.safeReturnPath('//evil.example'), '/dashboard');
  assert.equal(security.safeReturnPath('//evil.example/dashboard'), '/dashboard');
  assert.equal(security.safeReturnPath('///evil.example'), '/dashboard');
});

test('return path: backslash forms are rejected', () => {
  for (const raw of ['/\\evil.example', '\\\\evil.example', '/\\/evil.example', '/dashboard\\..\\evil']) {
    assert.equal(security.safeReturnPath(raw), '/dashboard', raw);
  }
});

test('return path: absolute URLs and script/data schemes are rejected', () => {
  for (const raw of ['https://evil.example/dashboard', 'http://localhost/dashboard', 'javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>alert(1)</script>', 'evil.example']) {
    assert.equal(security.safeReturnPath(raw), '/dashboard', raw);
  }
});

test('return path: encoded and double-encoded separators are rejected', () => {
  for (const raw of ['/%2F%2Fevil.example', '/%2f/evil.example', '/%5Cevil.example', '/%252F%252Fevil.example', '%2F%2Fevil.example', '/%09/evil.example']) {
    assert.equal(security.safeReturnPath(raw), '/dashboard', raw);
  }
});

test('return path: whitespace and control characters are rejected consistently', () => {
  for (const raw of [' /dashboard', '/dashboard ', '\n/dashboard', '/\t/evil.example', '/\r\n/evil.example', '/\u2028dashboard']) {
    assert.equal(security.safeReturnPath(raw), '/dashboard', JSON.stringify(raw));
  }
});

test('return path: malformed and non-string input falls back', () => {
  assert.equal(security.safeReturnPath('/%E0%A4%A'), '/dashboard');
  assert.equal(security.safeReturnPath(null), '/dashboard');
  assert.equal(security.safeReturnPath(undefined), '/dashboard');
  assert.equal(security.safeReturnPath(''), '/dashboard');
  assert.equal(security.safeReturnPath(`/${'a'.repeat(3000)}`), '/dashboard');
});

test('return path: dot segments normalise, /login never loops, fallback is configurable', () => {
  assert.equal(security.safeReturnPath('/a/../dashboard'), '/dashboard');
  assert.equal(security.safeReturnPath('/resumes/./list?page=2#top'), '/resumes/list?page=2#top');
  assert.equal(security.safeReturnPath('/login?next=/dashboard'), '/dashboard');
  assert.equal(security.safeReturnPath('//evil.example', '/'), '/');
});

/* ─── Profile validation and dirty state ─────────────────────────────────── */

test('profile validation: the first name is required and whitespace does not count', () => {
  assert.match(account.validateProfile(fieldsOf({ firstname: '   ' })).firstname, /first name/i);
  assert.equal(account.validateProfile(fieldsOf()).firstname, undefined);
});

test('profile validation: international phone numbers pass, malformed ones fail', () => {
  for (const ok of ['+91 98765 43210', '+44 20 7946 0958', '(415) 555-0132', '+1-415-555-0132 ext 12', '030 901820', '']) {
    assert.equal(account.isValidPhone(ok), true, ok);
    assert.equal(account.validateProfile(fieldsOf({ phone: ok })).phone, undefined, ok);
  }
  for (const bad of ['12345', 'call me', '+91 98765 43210 1234567', '++91 98765', '(415 555-0132', '98765-abc-43']) {
    assert.equal(account.isValidPhone(bad), false, bad);
    assert.ok(account.validateProfile(fieldsOf({ phone: bad })).phone, bad);
  }
});

test('profile validation: links must be full web addresses', () => {
  assert.equal(account.validateProfile(fieldsOf({ linkedinUrl: 'https://www.linkedin.com/in/asha' })).linkedinUrl, undefined);
  for (const bad of ['linkedin.com/in/asha', 'ftp://example.com', 'https://localhost', 'javascript:alert(1)', 'https://user:pw@example.com']) {
    assert.ok(account.validateProfile(fieldsOf({ websiteUrl: bad })).websiteUrl, bad);
  }
});

test('profile validation: character limits mirror the server', () => {
  assert.match(account.validateProfile(fieldsOf({ firstname: 'a'.repeat(121) })).firstname, /at most 120/);
  assert.equal(account.validateProfile(fieldsOf({ firstname: 'a'.repeat(120) })).firstname, undefined);
  assert.match(account.validateProfile(fieldsOf({ summary: 'x'.repeat(5001) })).summary, /at most 5000/);
});

test('profile normalisation: single-line fields collapse whitespace, the summary keeps line breaks', () => {
  assert.equal(account.normalizeProfileValue('city', '  New   Delhi \t'), 'New Delhi');
  assert.equal(account.normalizeProfileValue('summary', '  Line one\r\n\r\nLine  two  '), 'Line one\n\nLine  two');
});

test('dirty state: only meaningful changes count and neither input is mutated', () => {
  const baseline = Object.freeze(fieldsOf({ city: 'Pune' }));
  const draft = Object.freeze({ ...baseline, firstname: '  Asha  ', city: 'Mumbai', occupation: '  ' });
  assert.deepEqual(account.changedProfileFields(draft, baseline), { city: 'Mumbai' });
  assert.equal(baseline.city, 'Pune');
  assert.deepEqual(account.changedProfileFields(baseline, baseline), {});
});

test('dirty state: reset restores the baseline snapshot exactly', () => {
  const baseline = Object.freeze(fieldsOf({ phone: '+91 98765 43210' }));
  const edited = { ...baseline, phone: '+91 11111 22222', lastname: 'R' };
  assert.equal(Object.keys(account.changedProfileFields(edited, baseline)).length, 2);
  const reset = { ...baseline };
  assert.deepEqual(account.changedProfileFields(reset, baseline), {});
  assert.deepEqual(reset, baseline);
});

/* ─── Concurrency handling ───────────────────────────────────────────────── */

test('save envelope: only known, normalised keys plus expectedRevision', () => {
  const envelope = account.profileSaveEnvelope({ city: '  Pune  ', firstname: 'Asha', role: 'ADMIN' }, 4);
  assert.deepEqual(envelope, { expectedRevision: 4, profile: { firstname: 'Asha', city: 'Pune' } });
  assert.throws(() => account.profileSaveEnvelope({ city: 'Pune' }, -1), /version is unknown/);
});

test('save: POST /users-data/profile carries the envelope and the server revision becomes the baseline', async () => {
  responder = () => ({ status: 200, data: { success: true, user: { revision: 6, email: 'a@example.com', profile: { firstname: 'Asha', city: 'Pune' } } } });
  const saved = await account.saveProfile({ city: 'Pune' }, 5);
  assert.deepEqual(requests, [{ method: 'POST', url: '/users-data/profile', body: { expectedRevision: 5, profile: { city: 'Pune' } } }]);
  assert.equal(saved.revision, 6);
  assert.equal(saved.fields.city, 'Pune');
});

test('conflict: remote revision and profile are extracted from 409 PROFILE_CONFLICT; nothing is retried', async () => {
  responder = () => ({ status: 409, data: { success: false, code: 'PROFILE_CONFLICT', error: 'Profile changed in another tab or device.', remoteRevision: 7, remoteProfile: { firstname: 'Remote', city: 'Chennai' } } });
  await assert.rejects(account.saveProfile({ city: 'Pune' }, 5), (error) => {
    assert.equal(error.isProfileConflict, true);
    assert.equal(error.remote.revision, 7);
    assert.equal(error.remote.fields.firstname, 'Remote');
    assert.equal(error.remote.fields.city, 'Chennai');
    return true;
  });
  assert.equal(requests.length, 1, 'no implicit overwrite or automatic retry');
});

test('conflict: missing or malformed remote parts become null instead of guesses', () => {
  assert.deepEqual(account.parseProfileConflict({ remoteRevision: 3, remoteProfile: null }), { revision: 3, fields: null });
  assert.deepEqual(account.parseProfileConflict({ remoteRevision: -2, remoteProfile: [] }), { revision: null, fields: null });
  assert.deepEqual(account.parseProfileConflict({ remoteRevision: 'abc' }), { revision: null, fields: null });
});

test('conflict: local edits are preserved and differences are described field by field', () => {
  const local = Object.freeze(fieldsOf({ city: 'Pune', occupation: 'Analyst' }));
  const remote = fieldsOf({ city: 'Chennai', occupation: 'Analyst', phone: '+91 98765 43210' });
  const rows = master.describeProfileConflict(local, remote);
  assert.deepEqual(rows.map((row) => [row.key, row.local, row.remote]), [['phone', '', '+91 98765 43210'], ['city', 'Pune', 'Chennai']]);
  assert.equal(local.city, 'Pune', 'the local form is untouched');
  assert.deepEqual(master.describeProfileConflict(local, null), [], 'an unreadable remote is not presented as "no differences"');
});

test('conflict: an explicit retry that conflicts again reports the newer revision', async () => {
  let revision = 7;
  responder = ({ body }) => (body.expectedRevision === revision
    ? (revision += 1, { status: 409, data: { code: 'PROFILE_CONFLICT', error: 'changed', remoteRevision: revision, remoteProfile: { firstname: 'Third' } } })
    : { status: 409, data: { code: 'PROFILE_CONFLICT', error: 'changed', remoteRevision: revision, remoteProfile: {} } });
  const first = await account.saveProfile({ city: 'Pune' }, 5).catch((error) => error);
  assert.equal(first.remote.revision, 7);
  const second = await account.saveProfile({ city: 'Pune' }, first.remote.revision).catch((error) => error);
  assert.equal(second.isProfileConflict, true);
  assert.equal(second.remote.revision, 8);
  assert.equal(second.remote.fields.firstname, 'Third');
  assert.deepEqual(requests.map((entry) => entry.body.expectedRevision), [5, 7]);
});

test('stale response: a late save keeps fields typed while it was in flight', () => {
  const submitted = Object.freeze(fieldsOf({ city: 'Pune' }));
  const current = Object.freeze({ ...submitted, occupation: 'Typed during save' });
  const saved = Object.freeze(fieldsOf({ city: 'Pune', country: 'India' }));
  const next = master.rebaseDraftAfterSave(current, submitted, saved);
  assert.equal(next.occupation, 'Typed during save');
  assert.equal(next.country, 'India');
  assert.equal(next.city, 'Pune');
});

test('completeness: counts real saved content only and lists actionable suggestions', () => {
  const empty = master.settingsProfileCompleteness(account.emptyProfileFields());
  assert.deepEqual([empty.filled, empty.total, empty.percent], [0, 8, 0]);
  const partial = master.settingsProfileCompleteness(fieldsOf({ occupation: '   ', city: 'Pune', address: '1 Main St' }));
  assert.deepEqual([partial.filled, partial.percent], [3, 38]);
  assert.ok(partial.missing.some((item) => item.key === 'occupation' && item.suggestion.length > 0));
});

test('registration sync: 404 PROFILE_NOT_FOUND means revision 0 and only the names are sent', async () => {
  responder = ({ method }) => (method === 'GET'
    ? { status: 404, data: { success: false, code: 'PROFILE_NOT_FOUND', error: 'Profile not found' } }
    : { status: 200, data: { success: true, user: { revision: 1, profile: { firstname: 'Asha', lastname: 'Rao' } } } });
  assert.equal(await account.syncRegistrationProfile('  Asha ', 'Rao'), 'saved');
  assert.deepEqual(requests.map((entry) => entry.method), ['GET', 'POST']);
  assert.deepEqual(requests[1].body, { expectedRevision: 0, profile: { firstname: 'Asha', lastname: 'Rao' } });
});

test('registration sync: an existing revision is used and a refusal is reported, not hidden', async () => {
  responder = ({ method }) => (method === 'GET'
    ? { status: 200, data: { success: true, user: { revision: 3, profile: {} } } }
    : { status: 500, data: { success: false, error: 'Failed to save user profile' } });
  await assert.rejects(account.syncRegistrationProfile('Asha', ''), (error) => error.status === 500);
  assert.equal(requests[1].body.expectedRevision, 3);
  requests = [];
  assert.equal(await account.syncRegistrationProfile(' ', ''), 'skipped');
  assert.equal(requests.length, 0);
});

/* ─── Session and MFA ────────────────────────────────────────────────────── */

test('session: preview, Firebase and indeterminate sessions are told apart', () => {
  const user = { providerData: [{ providerId: 'password' }, { providerId: 'google.com' }] };
  assert.deepEqual(security.classifySessionSecurity({ firebaseConfigured: false, user: null, enrolledFactors: null, hasPreviewSession: true }), { kind: 'preview' });
  assert.deepEqual(security.classifySessionSecurity({ firebaseConfigured: true, user: null, enrolledFactors: null, hasPreviewSession: false }), { kind: 'unavailable' });
  assert.deepEqual(security.classifySessionSecurity({ firebaseConfigured: true, user, enrolledFactors: null, hasPreviewSession: false }), { kind: 'unavailable' }, 'a user object alone is not proof');
  const firebase = security.classifySessionSecurity({ firebaseConfigured: true, user, enrolledFactors: [{ uid: 'f1', factorId: 'totp', displayName: 'Pixel', enrollmentTime: 'Tue, 01 Oct 2026 10:00:00 GMT' }], hasPreviewSession: false });
  assert.equal(firebase.kind, 'firebase');
  assert.equal(firebase.hasPassword, true);
  assert.deepEqual(firebase.factors, [{ uid: 'f1', kind: 'totp', label: 'Pixel', enrolledAt: 'Tue, 01 Oct 2026 10:00:00 GMT' }]);
});

test('session: readSessionSecurity reports missing state as unavailable, never as secure', () => {
  globalThis.__m11h.firebaseConfigured = true;
  globalThis.__m11h.currentUser = { providerData: [{ providerId: 'password' }] }; // factors unreadable
  assert.deepEqual(security.readSessionSecurity(), { kind: 'unavailable' });
  globalThis.__m11h.currentUser = { providerData: [{ providerId: 'password' }], __factors: [] };
  assert.equal(security.readSessionSecurity().kind, 'firebase');
});

test('MFA hints: TOTP and phone factors are classified; unknown or malformed ones are counted, not offered', () => {
  const { factors, unsupportedCount } = mfa.describeFactorHints([
    { uid: 'p1', factorId: 'phone', displayName: '', phoneNumber: '+*******4321' },
    { uid: 't1', factorId: 'totp', displayName: 'Authy' },
    { uid: 'x1', factorId: 'passkey' },
    { factorId: 'totp' },
    null,
  ]);
  assert.deepEqual(factors, [
    { uid: 't1', kind: 'totp', label: 'Authy' },
    { uid: 'p1', kind: 'phone', label: 'Text message', phoneHint: '+*******4321' },
  ]);
  assert.equal(unsupportedCount, 3);
  assert.deepEqual(mfa.describeFactorHints(undefined), { factors: [], unsupportedCount: 0 });
});

test('MFA resolver: only multi-factor errors with a usable resolver become challenges', () => {
  assert.equal(mfa.getMfaResolver(Object.assign(new Error('x'), { code: 'auth/wrong-password' })), null);
  assert.equal(mfa.getMfaResolver(Object.assign(new Error('multi-factor-auth-required'), { code: 'auth/other' })), null, 'message text alone is not trusted');
  assert.equal(mfa.getMfaResolver({ code: 'auth/multi-factor-auth-required' }), null, 'no resolver, no challenge');
  const challenge = mfa.getMfaResolver(mfaError(resolverWith([{ uid: 'x', factorId: 'passkey' }])));
  assert.deepEqual([challenge.factors.length, challenge.unsupportedCount], [0, 1]);
});

test('MFA TOTP: completed with the TOTP assertion for the enrolled factor', async () => {
  const challenge = mfa.getMfaResolver(mfaError(resolverWith([{ uid: 't1', factorId: 'totp' }])));
  const credential = await mfa.completeTotpSignIn(challenge, 't1', '123456');
  assert.deepEqual(credential.assertion, { type: 'totp', enrollmentId: 't1', code: '123456' });
  await assert.rejects(mfa.completeTotpSignIn(challenge, 't1', '12345'), (error) => error.code === 'MFA_CODE_FORMAT');
  await assert.rejects(mfa.completeTotpSignIn(challenge, 'p1', '123456'), (error) => error.code === 'MFA_FACTOR_NOT_FOUND');
  assert.equal(globalThis.__m11h.calls.filter((call) => call.op === 'totp-assertion').length, 1, 'invalid input never reaches Firebase');
});

test('MFA SMS: verification uses the hint and session, then the phone assertion (not TOTP)', async () => {
  const challenge = mfa.getMfaResolver(mfaError(resolverWith([{ uid: 'p1', factorId: 'phone', phoneNumber: '+*******4321' }])));
  globalThis.__m11h.verificationId = 'verif-42';
  const verification = await mfa.sendPhoneSignInCode(challenge, 'p1', {});
  assert.equal(verification.verificationId, 'verif-42');
  const verify = globalThis.__m11h.calls.find((call) => call.op === 'verify-phone');
  assert.equal(verify.options.multiFactorHint.uid, 'p1');
  assert.deepEqual(verify.options.session, { id: 'mfa-session' });
  const credential = await mfa.completePhoneSignIn(challenge, verification.verificationId, '654321');
  assert.deepEqual(credential.assertion, { type: 'phone', credential: { verificationId: 'verif-42', code: '654321' } });
  assert.equal(globalThis.__m11h.calls.some((call) => call.op === 'totp-assertion'), false);
  verification.dispose();
  assert.ok(globalThis.__m11h.calls.some((call) => call.op === 'recaptcha-clear'));
});

test('MFA failures: invalid and expired challenges reject with safe messages and no credential', async () => {
  const invalid = mfa.getMfaResolver(mfaError(resolverWith([{ uid: 't1', factorId: 'totp' }], async () => { throw Object.assign(new Error('INVALID_CODE internal'), { code: 'auth/invalid-verification-code' }); })));
  await assert.rejects(mfa.completeTotpSignIn(invalid, 't1', '000000'), (error) => {
    assert.equal(error.code, 'MFA_CODE_INVALID');
    assert.doesNotMatch(error.message, /INVALID_CODE|internal/);
    assert.equal(error.restartRequired, false);
    return true;
  });
  const expired = mfa.getMfaResolver(mfaError(resolverWith([{ uid: 't1', factorId: 'totp' }], async () => { throw Object.assign(new Error('x'), { code: 'auth/invalid-multi-factor-session' }); })));
  await assert.rejects(mfa.completeTotpSignIn(expired, 't1', '111111'), (error) => error.restartRequired === true);
});

test('password policy: minimum length, confirmation and difference from the current password', () => {
  assert.match(security.validatePasswordChange({ current: 'old-pass-1', next: 'short', confirm: 'short' }).next, /at least 8/);
  assert.match(security.validatePasswordChange({ current: 'old-pass-1', next: 'new-pass-22', confirm: 'new-pass-23' }).confirm, /do not match/);
  assert.match(security.validatePasswordChange({ current: 'same-pass-1', next: 'same-pass-1', confirm: 'same-pass-1' }).next, /differs/);
  assert.match(security.validatePasswordChange({ current: '', next: 'new-pass-22', confirm: 'new-pass-22' }).current, /current password/);
  assert.deepEqual(security.validatePasswordChange({ current: 'old-pass-1', next: 'new-pass-22', confirm: 'new-pass-22' }), {});
});

test('password strength: policy compliance is reported separately from strength', () => {
  const common = security.assessPasswordStrength('password123');
  assert.equal(common.meetsPolicy, true);
  assert.equal(common.label, 'Weak');
  const strong = security.assessPasswordStrength('Correct-Horse-Battery-9');
  assert.equal(strong.label, 'Strong');
  const short = security.assessPasswordStrength('abc');
  assert.deepEqual([short.meetsPolicy, short.label], [false, 'Too short']);
});

test('password change: re-authenticates before updating; MFA during re-authentication pauses the change', async () => {
  globalThis.__m11h.firebaseConfigured = true;
  globalThis.__m11h.currentUser = { email: 'asha@example.com', providerData: [{ providerId: 'password' }] };
  assert.deepEqual(await security.changePassword('old-pass-1', 'new-pass-22'), { status: 'changed' });
  assert.deepEqual(globalThis.__m11h.calls.map((call) => call.op), ['reauthenticate', 'update-password']);

  globalThis.__m11h.calls = [];
  globalThis.__m11h.reauthError = mfaError(resolverWith([{ uid: 't1', factorId: 'totp' }]));
  const paused = await security.changePassword('old-pass-1', 'new-pass-22');
  assert.equal(paused.status, 'second-factor-required');
  assert.equal(globalThis.__m11h.calls.some((call) => call.op === 'update-password'), false, 'no update before the second factor');
  await security.completePasswordChangeWithTotp(paused.challenge, 't1', '123456', 'new-pass-22');
  assert.deepEqual(globalThis.__m11h.calls.map((call) => call.op), ['reauthenticate', 'totp-assertion', 'update-password']);

  globalThis.__m11h.reauthError = Object.assign(new Error('x'), { code: 'auth/wrong-password' });
  await assert.rejects(security.changePassword('bad', 'new-pass-22'), (error) => error.message === 'Your current password is incorrect.');
});

/* ─── Account lifecycle ──────────────────────────────────────────────────── */

test('export: the archive is serialised as JSON with the JSON MIME type and dated filename', () => {
  const archive = { exportDate: '2026-10-29T10:00:00.000Z', profile: { firstname: 'Asha' }, resumes: [{ id: 'r1' }], exportWarnings: [] };
  const result = account.buildDataExport({ success: true, export: archive }, new Date(2026, 9, 29, 23, 30));
  assert.deepEqual(JSON.parse(result.json), archive);
  assert.equal(result.mimeType, 'application/json');
  assert.equal(result.fileName, 'ime365-data-export-2026-10-29.json');
  assert.match(account.exportFileName(new Date(2027, 0, 5)), /^ime365-data-export-2027-01-05\.json$/);
});

test('export: partial warnings are kept, malformed entries are dropped, nothing is invented', () => {
  const result = account.buildDataExport({ success: true, export: { exportWarnings: [
    { section: 'invoices', status: 'PARTIAL', message: '2 malformed invoice records could not be exported.' },
    { section: 'messaging', status: 'UNAVAILABLE' },
    { status: 'UNAVAILABLE', message: 'no section' },
    'garbage',
  ] } });
  assert.deepEqual(result.warnings.map((warning) => [warning.section, warning.status]), [['invoices', 'PARTIAL'], ['messaging', 'UNAVAILABLE']]);
  assert.deepEqual(account.parseExportWarnings('not-an-array'), []);
  assert.throws(() => account.buildDataExport({ success: false, export: {} }), /unexpected export response/);
  assert.throws(() => account.buildDataExport({ success: true, export: [] }), /unexpected export response/);
});

test('export: POST /account/export through the shared client; failures are not successes', async () => {
  responder = () => ({ status: 200, data: { success: true, export: { profile: {}, exportWarnings: [] } } });
  const ok = await account.requestDataExport(new Date(2026, 9, 29));
  assert.deepEqual(requests[0], { method: 'POST', url: '/account/export', body: {} });
  assert.equal(ok.warnings.length, 0);
  responder = () => ({ status: 500, data: { success: false, error: 'Account export is temporarily unavailable.' } });
  await assert.rejects(account.requestDataExport(), (error) => error.message === 'Account export is temporarily unavailable.');
});

test('deletion: the confirmation must match DELETE exactly', () => {
  assert.equal(account.isDeletionConfirmed('DELETE'), true);
  for (const typed of ['delete', 'Delete', ' DELETE', 'DELETE ', 'DELET', '', null]) {
    assert.equal(account.isDeletionConfirmed(typed), false, String(typed));
  }
});

test('deletion: recent-auth, identity-pending and other failures are classified from real responses', async () => {
  const outcomeFor = async (status, data) => {
    responder = () => ({ status, data });
    return account.requestAccountDeletion().then(() => 'resolved', (error) => account.classifyDeletionFailure(error));
  };
  assert.equal(await outcomeFor(403, { error: { code: 'RECENT_AUTH_REQUIRED', message: 'Please reauthenticate before this sensitive operation' } }), 'recent-auth');
  assert.equal(await outcomeFor(503, { success: false, code: 'ACCOUNT_IDENTITY_DELETE_FAILED', error: 'Application data was removed, but identity deletion is pending.' }), 'identity-pending');
  assert.equal(await outcomeFor(500, { success: false, code: 'ACCOUNT_DELETE_FAILED', error: 'Unable to complete account deletion.' }), 'failed');
  assert.equal(await outcomeFor(503, { success: false, code: 'SERVICE_DEGRADED' }), 'failed', 'a 503 is not automatically a partial deletion');
});

test('deletion: success only when the server says success: true', async () => {
  responder = () => ({ status: 200, data: { message: 'ok?' } });
  await assert.rejects(account.requestAccountDeletion(), (error) => account.classifyDeletionFailure(error) === 'unconfirmed');
  responder = () => ({ status: 200, data: { success: true, retainedRecordTypes: ['invoices'] } });
  await account.requestAccountDeletion();
  assert.deepEqual(requests.map((entry) => [entry.method, entry.url]), [['POST', '/account/delete'], ['POST', '/account/delete']]);
});

test('MFA removal: confirmed count on success; recent sign-in and unconfirmed answers are errors', async () => {
  responder = () => ({ status: 200, data: { success: true, mfaEnabled: false, removedFactorCount: 2 } });
  assert.equal(await account.disableTwoFactor(), 2);
  assert.deepEqual(requests[0], { method: 'POST', url: '/users-data/mfa/disable', body: {} });
  responder = () => ({ status: 403, data: { error: { code: 'RECENT_AUTH_REQUIRED', message: 'Please reauthenticate' } } });
  await assert.rejects(account.disableTwoFactor(), (error) => error.needsRecentSignIn === true);
  responder = () => ({ status: 200, data: {} });
  await assert.rejects(account.disableTwoFactor(), (error) => error.code === 'MFA_DISABLE_UNCONFIRMED');
});

test('deletion cleanup: only this app\'s account keys are removed; theme and foreign keys stay', () => {
  const local = new MemoryStorage({ currentResumeId: '9', rp_recent_skills: '[]', ime365_theme: 'dark', other_app_key: 'x' });
  const session = new MemoryStorage({ 'rpai.ats.targetJd': 'jd', workspace_t1: 'w', unrelated: 'y' });
  const removed = account.clearAccountLocalState(local, session);
  assert.deepEqual(removed.sort(), ['currentResumeId', 'rp_recent_skills', 'rpai.ats.targetJd', 'workspace_t1'].sort());
  assert.equal(local.getItem('ime365_theme'), 'dark');
  assert.equal(local.getItem('other_app_key'), 'x');
  assert.equal(session.getItem('unrelated'), 'y');
});

test('registration marker: stores only a flag and can be cleared', () => {
  const storage = new MemoryStorage();
  account.markRegistrationProfileSyncFailed(storage);
  assert.equal(account.readRegistrationProfileSyncFailed(storage), true);
  assert.deepEqual([...storage.map.values()], ['failed']);
  account.clearRegistrationProfileSyncFlag(storage);
  assert.equal(account.readRegistrationProfileSyncFailed(storage), false);
});

/* ─── Accessibility contracts (rendered components) ─────────────────────── */

test('notice regions: separate polite status and assertive alert; empty regions take no space', () => {
  const empty = renderToStaticMarkup(React.createElement(NoticeRegions, { notice: null }));
  assert.match(empty, /<div role="status" class="[^"]*empty:m-0[^"]*empty:p-0[^"]*"><\/div>/);
  assert.match(empty, /<div role="alert" class="[^"]*empty:m-0[^"]*"><\/div>/);
  const success = renderToStaticMarkup(React.createElement(NoticeRegions, { notice: { tone: 'success', text: 'Saved.' } }));
  assert.match(success, /role="status"[^>]*>.*Saved\..*<\/div><div role="alert" class="[^"]*"><\/div>/);
  const error = renderToStaticMarkup(React.createElement(NoticeRegions, { notice: { tone: 'error', text: 'Failed.' } }));
  assert.match(error, /<div role="status" class="[^"]*"><\/div><div role="alert"[^>]*>.*Failed\./);
  const warning = renderToStaticMarkup(React.createElement(NoticeRegions, { notice: { tone: 'warning', text: 'Incomplete.' } }));
  assert.match(warning, /role="status"[^>]*>.*Incomplete\./);
  assert.doesNotMatch(warning, /role="alert"[^>]*>[^<]*<svg/);
});

test('theme switcher: a labelled radio group with Light, Dark and System, one checked', () => {
  const html = renderToStaticMarkup(React.createElement(ThemeProvider, null, React.createElement(AppearancePanel)));
  assert.match(html, /<fieldset[^>]*><legend class="sr-only">Colour theme<\/legend>/);
  const radios = html.match(/<input type="radio"[^>]*>/g) ?? [];
  assert.equal(radios.length, 3);
  assert.equal(radios.filter((radio) => /checked=""/.test(radio)).length, 1);
  for (const id of ['light', 'dark', 'system']) {
    assert.match(html, new RegExp(`aria-labelledby="settings-theme-${id}-label"`));
    assert.match(html, new RegExp(`id="settings-theme-${id}-label"`));
  }
  assert.equal(new Set(html.match(/id="[^"]+"/g)).size, (html.match(/id="[^"]+"/g) ?? []).length, 'no duplicate ids');
});
