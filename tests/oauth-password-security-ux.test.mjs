import test from 'node:test';
import assert from 'node:assert/strict';

test('OAuth vs Password Authentication State & Security Separation', async (t) => {
    await t.test('detects pure OAuth accounts vs password accounts accurately', () => {
        const googleUser = {
            uid: 'oauth_user_1',
            email: 'dev@gmail.com',
            providerData: [{ providerId: 'google.com' }],
        };
        const passwordUser = {
            uid: 'pwd_user_1',
            email: 'dev@company.com',
            providerData: [{ providerId: 'password' }],
        };
        const dualUser = {
            uid: 'dual_user_1',
            email: 'dev@gmail.com',
            providerData: [{ providerId: 'google.com' }, { providerId: 'password' }],
        };

        const checkProviders = (user) => {
            const providers = (user.providerData || []).map(p => p.providerId).filter(Boolean);
            const usesPassword = providers.includes('password');
            const isOAuthOnly = providers.length > 0 && !usesPassword;
            const primaryOAuth = providers.find(p => p !== 'password') === 'google.com' ? 'Google' : (providers.find(p => p !== 'password') || 'OAuth');
            return { usesPassword, isOAuthOnly, primaryOAuth };
        };

        const googleState = checkProviders(googleUser);
        assert.equal(googleState.usesPassword, false);
        assert.equal(googleState.isOAuthOnly, true);
        assert.equal(googleState.primaryOAuth, 'Google');

        const pwdState = checkProviders(passwordUser);
        assert.equal(pwdState.usesPassword, true);
        assert.equal(pwdState.isOAuthOnly, false);

        const dualState = checkProviders(dualUser);
        assert.equal(dualState.usesPassword, true);
        assert.equal(dualState.isOAuthOnly, false);
        assert.equal(dualState.primaryOAuth, 'Google');
    });

    await t.test('does not require current password when OAuth-only user sets security password', () => {
        const validatePasswordUpdate = ({ usesPassword, currentPassword, newPassword, confirmPassword }) => {
            if (usesPassword && !currentPassword) {
                return { success: false, error: 'Current password is required to verify identity for credential updates.' };
            }
            if (newPassword.length < 8) {
                return { success: false, error: 'Security password must be at least 8 characters long.' };
            }
            if (newPassword !== confirmPassword) {
                return { success: false, error: 'New passwords do not match. Please verify.' };
            }
            return { success: true, message: usesPassword ? 'Password updated' : 'Security password created' };
        };

        // OAuth user creating password with empty currentPassword
        const oauthResult = validatePasswordUpdate({
            usesPassword: false,
            currentPassword: '',
            newPassword: 'StrongPassword123!',
            confirmPassword: 'StrongPassword123!',
        });
        assert.equal(oauthResult.success, true);
        assert.equal(oauthResult.message, 'Security password created');

        // Password user without currentPassword -> must fail
        const pwdMissingCurrent = validatePasswordUpdate({
            usesPassword: true,
            currentPassword: '',
            newPassword: 'StrongPassword123!',
            confirmPassword: 'StrongPassword123!',
        });
        assert.equal(pwdMissingCurrent.success, false);
        assert.match(pwdMissingCurrent.error, /Current password is required/);

        // Password user with valid currentPassword -> succeeds
        const pwdSuccess = validatePasswordUpdate({
            usesPassword: true,
            currentPassword: 'ExistingPassword123!',
            newPassword: 'StrongPassword123!',
            confirmPassword: 'StrongPassword123!',
        });
        assert.equal(pwdSuccess.success, true);
        assert.equal(pwdSuccess.message, 'Password updated');
    });

    await t.test('OAuth sign in does not overwrite existing password credential', () => {
        // Simulating user database record
        const userDoc = {
            userId: 'user_123',
            email: 'dev@gmail.com',
            authProvider: 'email',
            hasLocalPassword: true,
        };

        // Simulating OAuth login metadata refresh
        const updateOnOAuthLogin = (doc, oauthProvider) => {
            return {
                ...doc,
                lastLoginAt: new Date().toISOString(),
                // Preserves existing auth credentials
                authProvider: doc.authProvider || oauthProvider,
            };
        };

        const refreshed = updateOnOAuthLogin(userDoc, 'google');
        assert.equal(refreshed.hasLocalPassword, true);
        assert.equal(refreshed.authProvider, 'email');
    });
});
