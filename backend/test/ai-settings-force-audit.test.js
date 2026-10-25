'use strict';

// F-29 (P3): two force paths, undocumented in the audit trail. The CAS
// bypass had two spellings — `expectedRevision === -1` (documented nowhere;
// the frozen security-review.md DEF-11 row recognizes only `force: true`)
// and `input.force === true` — and the audit row recorded only
// {revision, changedFields}: no forced flag, no actor justification. The
// service also threw AI_SETTINGS_CONFLICT while docs, enterprise CAS and the
// pre-existing wire translation in index.js all say REVISION_CONFLICT.
// This spec pins: ONE force mechanism (force:true), -1 is just a stale
// revision (409), forced saves are attributable in the audit trail
// (forced:true + sanitized forceReason), normal saves carry no forced field,
// and the conflict code is the platform-wide REVISION_CONFLICT.

process.env.NODE_ENV = 'test';
process.env.FREELMAPI_METRICS_DB = ':memory:';

const test = require('node:test');
const assert = require('node:assert/strict');

const { installAiSettingsContract } = require('./helpers/aiSettingsContract');
const settingsContract = installAiSettingsContract();

const { saveAiAdminSettings } = require('../services/aiAdmin');

const admin = {};
const baseInput = {
    provider: 'nvidia', enableGemini: true, enableNvidia: true, enableOpenai: true,
    enableGroq: true, enableOpenrouter: true, enableDeepseek: true,
    model: 'gemini-2.0-flash', temperature: 0.4, maxTokens: 3000, enableFallback: true,
};

const lastAudit = () => settingsContract.auditEvents[settingsContract.auditEvents.length - 1];

test('F-29: CAS conflict throws the platform-wide REVISION_CONFLICT with currentRevision', async () => {
    settingsContract.reset();
    const first = await saveAiAdminSettings({ admin, input: baseInput, expectedRevision: 0, actorUid: 'admin-1', requestId: 'req-1' });
    assert.equal(first.revision, 1);
    await assert.rejects(
        () => saveAiAdminSettings({ admin, input: baseInput, expectedRevision: 0, actorUid: 'admin-1' }),
        error => error.code === 'REVISION_CONFLICT' && error.status === 409 && error.currentRevision === 1
    );
});

test('F-29: expectedRevision -1 no longer bypasses CAS — the undocumented backdoor is closed', async () => {
    settingsContract.reset();
    await saveAiAdminSettings({ admin, input: baseInput, expectedRevision: 0, actorUid: 'admin-1' });
    await assert.rejects(
        () => saveAiAdminSettings({ admin, input: baseInput, expectedRevision: -1, actorUid: 'admin-1' }),
        error => error.code === 'REVISION_CONFLICT' && error.status === 409,
        '-1 is now simply a stale revision'
    );
});

test('F-29: force:true bypasses CAS and is recorded as forced in the audit trail', async () => {
    settingsContract.reset();
    await saveAiAdminSettings({ admin, input: baseInput, expectedRevision: 0, actorUid: 'admin-1' });
    const forced = await saveAiAdminSettings({
        admin,
        input: { ...baseInput, force: true, temperature: 0.9 },
        expectedRevision: 0, // stale — force overrides
        actorUid: 'admin-2',
        requestId: 'req-force',
    });
    assert.equal(forced.revision, 2);
    const audit = lastAudit();
    assert.equal(audit.action, 'AI_PROVIDER_SETTINGS_UPDATED');
    assert.equal(audit.metadata.forced, true, 'the bypass is visible in the trail');
    assert.equal(audit.metadata.forceReason, null, 'absent justification recorded honestly as null');
    assert.equal(audit.metadata.revision, 2);
    assert.ok(!('force' in audit.metadata.changedFields || audit.metadata.changedFields.includes('force')),
        'input control fields never leak into stored settings/changedFields');
});

test('F-29: forceReason is sanitized (control chars stripped, bounded) and persisted', async () => {
    settingsContract.reset();
    await saveAiAdminSettings({ admin, input: baseInput, expectedRevision: 0, actorUid: 'admin-1' });
    const long = 'x'.repeat(600);
    await saveAiAdminSettings({
        admin,
        input: { ...baseInput, force: true, forceReason: `Emergency rollout\u0000 fix\n${long}` },
        expectedRevision: 0,
        actorUid: 'admin-2',
    });
    const reason = lastAudit().metadata.forceReason;
    assert.ok(!/[\u0000-\u001f\u007f]/.test(reason), 'control characters stripped');
    assert.ok(reason.startsWith('Emergency rollout fix'), 'justification text preserved');
    assert.ok(reason.length <= 500, 'bounded to 500 chars');
});

test('F-29: normal saves record no forced field', async () => {
    settingsContract.reset();
    await saveAiAdminSettings({ admin, input: baseInput, expectedRevision: 0, actorUid: 'admin-1' });
    const audit = lastAudit();
    assert.equal(Object.prototype.hasOwnProperty.call(audit.metadata, 'forced'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(audit.metadata, 'forceReason'), false);
    assert.ok(Array.isArray(audit.metadata.changedFields));
});

test('F-29: force:true exempts expectedRevision; without it the requirement stands', async () => {
    settingsContract.reset();
    await assert.rejects(
        () => saveAiAdminSettings({ admin, input: baseInput, actorUid: 'admin-1' }),
        error => error.code === 'EXPECTED_REVISION_REQUIRED' && error.status === 400
    );
    const forced = await saveAiAdminSettings({ admin, input: { ...baseInput, force: true }, actorUid: 'admin-1' });
    assert.equal(forced.revision, 1);
    assert.equal(lastAudit().metadata.forced, true);
});
