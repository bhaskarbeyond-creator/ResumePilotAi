import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from '../../../frontend/node_modules/typescript/lib/typescript.js';
// Compile the real module in memory; no duplicated implementation or emitted files.
const source = readFileSync(new URL('../../../frontend/src/lib/admin-tenants.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const m = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const valid = { displayName: 'Acme Global', slug: 'acme-global', domain: 'acme.example.com', isolationTier: 'STANDARD', seatLimit: 20, monthlyAiCredits: 50000, administratorEmail: 'admin@acme.com', region: 'AP_SOUTH' };
test('valid creation input', () => assert.deepEqual(m.validateCreateTenant(valid), {}));
for (const [name, key, value] of [
  ['missing organization', 'displayName', ''], ['overlong organization', 'displayName', 'x'.repeat(121)],
  ['invalid slug', 'slug', 'Bad Slug'], ['trailing slug hyphen', 'slug', 'abc-'], ['empty slug', 'slug', ''],
  ['invalid domain', 'domain', 'localhost'], ['protocol rejection', 'domain', 'https://acme.com'], ['slash rejection', 'domain', 'acme.com/'],
  ['invalid tier', 'isolationTier', 'ROOT'], ['zero seats', 'seatLimit', 0], ['negative seats', 'seatLimit', -2], ['fractional seats', 'seatLimit', 1.5], ['seat maximum', 'seatLimit', 100001],
  ['invalid credits', 'monthlyAiCredits', NaN], ['negative credits', 'monthlyAiCredits', -1], ['unsafe credits', 'monthlyAiCredits', Number.MAX_SAFE_INTEGER + 1],
  ['invalid email', 'administratorEmail', 'bad@'], ['invalid residency', 'region', 'MOON'],
]) test(name, () => assert.ok(m.validateCreateTenant({ ...valid, [key]: value })[key]));
test('slug generation', () => assert.equal(m.slugify('Acme Global Enterprises'), 'acme-global-enterprises'));
test('slug normalizes accents', () => assert.equal(m.slugify(' Café & Co. '), 'cafe-co'));
test('valid FQDN', () => assert.equal(m.validDomain('careers.acme.com'), true));
test('invalid label hyphen', () => assert.equal(m.validDomain('-acme.com'), false));
test('valid tiers', () => { for (const isolationTier of m.TIERS) assert.deepEqual(m.validateCreateTenant({ ...valid, isolationTier }), {}); });
test('valid regions', () => { for (const region of m.REGIONS) assert.deepEqual(m.validateCreateTenant({ ...valid, region }), {}); });
test('positive quotas', () => assert.equal(m.positiveInteger(100), true));
test('valid roles', () => assert.equal(m.ENTERPRISE_ROLES.length, 4));
test('invalid enterprise role', () => assert.equal(m.ENTERPRISE_ROLES.includes('SUPER_ADMIN'), false));
test('seed initialization is labelled', () => assert.ok(m.seedTenants().every(t => t.source === 'LOCAL DEMO' && t.displayName.includes('DEMO'))));
test('stable seed identity', () => assert.deepEqual(m.seedTenants(), m.seedTenants()));
test('safe serialization and existing preservation', () => { const records = m.seedTenants(); assert.deepEqual(JSON.parse(JSON.stringify(m.decodeStorage(m.serializeTenants(records)))), records); });
test('corrupt storage recovery', () => assert.equal(m.decodeStorage('{bad'), null));
test('unknown storage version rejected', () => assert.equal(m.decodeStorage('{"version":2,"tenants":[]}'), null));
test('valid empty registry preserved', () => assert.deepEqual(m.decodeStorage('{"version":1,"tenants":[]}'), []));
test('invalid storage record rejected', () => assert.equal(m.decodeStorage('{"version":1,"tenants":[{}]}'), null));
test('invalid external response rejected', () => assert.throws(() => m.parseTenant({ id: '1' }), /Invalid tenant/));
test('lifecycle validation', () => assert.throws(() => m.parseTenant({ ...m.seedTenants()[0], lifecycleState: 'INVALID' }), /lifecycle/));
test('untrusted storage source cannot become LIVE', () => assert.equal(m.decodeStorage(m.serializeTenants([{ ...m.seedTenants()[0], source: 'LIVE' }]))[0].source, 'LOCAL DEMO'));
test('DNS token uniqueness and secure format', () => { const a = m.generateDnsTxtChallenge('acme.com'); const b = m.generateDnsTxtChallenge('acme.com'); assert.notEqual(a.value, b.value); assert.match(a.value, /^ime365-verification=[a-f0-9]{64}$/); });
test('DNS hostname', () => assert.equal(m.generateDnsTxtChallenge('Acme.com').host, '_ime365-challenge.acme.com'));
test('DNS preview never claims ownership', () => assert.equal(m.generateDnsTxtChallenge('acme.com').status, 'UNAVAILABLE'));
test('DNS authoritative verification unavailable', async () => assert.rejects(m.verifyDnsTxtRecord('tenant'), /No tenant-bound/));
test('quota unsupported operation is not success', async () => assert.rejects(m.updateTenantQuotas('tenant', { seatLimit: 10 }), /unsupported/));
test('default mode is LIVE', () => assert.equal(m.getTenantMode(), 'LIVE'));
test('same-tab subscribers and cleanup', () => { let count = 0; const stop = m.subscribeTenants(() => count++); m.notifyTenantSubscribers(); stop(); m.notifyTenantSubscribers(); assert.equal(count, 1); });
test('demo must be explicitly selected; duplicate preserves records', async () => { m.setTenantMode('LOCAL DEMO'); const before = await m.listEnterpriseTenants(); const created = await m.createEnterpriseTenant(valid); assert.equal(created.source, 'LOCAL DEMO'); assert.equal((await m.listEnterpriseTenants()).length, before.length + 1); await assert.rejects(m.createEnterpriseTenant(valid), /Slug already/); assert.equal((await m.listEnterpriseTenants()).length, before.length + 1); });
test('demo lifecycle cannot suspend production access', async () => assert.rejects(m.toggleTenantLifecycle('demo-0', 'SUSPENDED', 'Test'), /cannot suspend/));
test('suspension requires reason', async () => assert.rejects(m.toggleTenantLifecycle('demo-0', 'SUSPENDED'), /reason/));
test('invalid lifecycle transition rejected', async () => assert.rejects(m.toggleTenantLifecycle('demo-0', 'DELETED'), /Invalid lifecycle/));
test('validation failure never returns creation success', async () => assert.rejects(m.createEnterpriseTenant({ ...valid, slug: '' }), /highlighted/));
test('typed errors preserve classification', () => { const e = new m.TenantError('FORBIDDEN', 'Denied'); assert.equal(e.code, 'FORBIDDEN'); assert.equal(m.errorMessage(e), 'Denied'); });

test('existing regulated server tenant remains readable', () => assert.equal(m.parseTenant({ ...m.seedTenants()[0], isolationTier: 'REGULATED' }).isolationTier, 'REGULATED'));
test('asynchronous provisioning state preserved', () => assert.equal(m.parseTenant({ ...m.seedTenants()[0], lifecycleState: 'PROVISIONING' }).lifecycleState, 'PROVISIONING'));
