import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('OAuth vs Password Authentication State & Security Separation', async (t) => {
    const settingsPath = path.resolve('src/components/Dashboard/DashboardSettings/DashboardSettings.jsx');
    const settingsCode = fs.readFileSync(settingsPath, 'utf8');

    await t.test('detects pure OAuth accounts vs password accounts accurately in component code', () => {
        assert.ok(settingsCode.includes('usesPasswordProvider'), 'DashboardSettings must define usesPasswordProvider');
        assert.ok(settingsCode.includes('isOAuthOnly'), 'DashboardSettings must define isOAuthOnly');
        assert.ok(settingsCode.includes('primaryOAuthProvider'), 'DashboardSettings must define primaryOAuthProvider');
        assert.ok(
            settingsCode.includes("userAuthProviders.includes('password')"),
            'Component must check for password provider in userAuthProviders'
        );
    });

    await t.test('does not require current password when OAuth-only user sets security password', () => {
        assert.ok(
            settingsCode.includes('if (usesPasswordProvider && (isEmailChanged || isPasswordChanged) && !accountPasswordState.currentPassword) {'),
            'handleAccountSubmit must guard currentPassword validation with usesPasswordProvider'
        );
        assert.ok(
            settingsCode.includes('usesPasswordProvider ? (') || settingsCode.includes('usesPasswordProvider ?'),
            'Current Password input field must be conditionally hidden for OAuth users'
        );
    });

    await t.test('renders dynamic and transparent terminology for OAuth password creation', () => {
        assert.ok(
            settingsCode.includes('Create Account Security Password') && settingsCode.includes('Security Password Update & Re-authentication'),
            'UI must render "Create Account Security Password" for OAuth and "Security Password Update & Re-authentication" for password users'
        );
        assert.ok(
            settingsCode.includes('Create Account Security Password ✓') && settingsCode.includes('Update Account Security ✓'),
            'Button text must dynamically switch between Create and Update'
        );
        assert.ok(
            settingsCode.includes('without affecting your'),
            'OAuth guidance banner must explain that OAuth login identity is preserved'
        );
    });

    await t.test('account deletion modal provides keyword confirmation for OAuth users', () => {
        assert.ok(
            settingsCode.includes("disabled={deleteInputText !== 'DELETE' || (usesPasswordProvider && !deletePassword) || isSubmitting}"),
            'Delete modal button must only require deletePassword if user usesPasswordProvider'
        );
    });

    await t.test('double-submit protection is enforced during password creation and update', () => {
        assert.ok(
            settingsCode.includes('disabled={isSubmitting}'),
            'Save button must be disabled when isSubmitting is true to prevent double submission'
        );
    });
});
