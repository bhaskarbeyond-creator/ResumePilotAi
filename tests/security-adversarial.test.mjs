/**
 * Adversarial Security Test Harness
 * 
 * Tests authorization boundaries, tenant isolation, and privilege escalation.
 * Every test case is an attack vector.
 * 
 * Run: node --test tests/security-adversarial.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Import security modules
const oauthModule = await import('../backend/security/oauth.js');
const resetModule = await import('../backend/security/reset.js');
const entitlementsModule = await import('../backend/security/entitlements.js');
const paymentsModule = await import('../backend/security/payments.js');

describe('Security Adversarial Tests', () => {
    
    describe('Password Policy Enforcement', () => {
        it('rejects password shorter than 12 characters', () => {
            assert.throws(() => {
                resetModule.assertPasswordPolicy('user@example.com', 'Short1!');
            }, (err) => err.message === 'PASSWORD_POLICY_FAILED');
        });

        it('rejects password containing email name', () => {
            assert.throws(() => {
                resetModule.assertPasswordPolicy('john@example.com', 'John12345678!!');
            }, (err) => err.message === 'PASSWORD_POLICY_FAILED');
        });

        it('accepts valid password', () => {
            assert.doesNotThrow(() => {
                resetModule.assertPasswordPolicy('user@example.com', 'ValidP@ssw0rd!2024');
            });
        });
    });

    describe('Token Hashing', () => {
        it('produces deterministic hash for same input', () => {
            const hash1 = resetModule.hashToken('test-token-123');
            const hash2 = resetModule.hashToken('test-token-123');
            assert.equal(hash1, hash2);
        });

        it('produces different hash for different input', () => {
            const hash1 = resetModule.hashToken('token-a');
            const hash2 = resetModule.hashToken('token-b');
            assert.notEqual(hash1, hash2);
        });

        it('produces hex-encoded SHA-256 hash', () => {
            const hash = resetModule.hashToken('test');
            assert.match(hash, /^[a-f0-9]{64}$/);
        });
    });

    describe('Opaque Token Validation', () => {
        it('rejects empty string', () => {
            assert.equal(resetModule.isOpaqueToken(''), false);
        });

        it('rejects null', () => {
            assert.equal(resetModule.isOpaqueToken(null), false);
        });

        it('rejects undefined', () => {
            assert.equal(resetModule.isOpaqueToken(undefined), false);
        });

        it('rejects token with spaces', () => {
            assert.equal(resetModule.isOpaqueToken('token with spaces'), false);
        });

        it('rejects token shorter than 20 characters', () => {
            assert.equal(resetModule.isOpaqueToken('short'), false);
        });

        it('accepts valid opaque token', () => {
            assert.equal(resetModule.isOpaqueToken('a'.repeat(43)), true);
        });
    });

    describe('OAuth State Binding', () => {
        // assertStateBinding requires both states to be >= 32 chars
        const validState = 'a'.repeat(43);

        it('rejects mismatched state values', () => {
            const stateA = 'a'.repeat(43);
            const stateB = 'b'.repeat(43);
            assert.throws(() => {
                oauthModule.assertStateBinding(stateA, stateB);
            }, (err) => err.message === 'OAUTH_STATE_INVALID');
        });

        it('rejects empty state from query', () => {
            assert.throws(() => {
                oauthModule.assertStateBinding('', validState);
            }, (err) => err.message === 'OAUTH_STATE_INVALID');
        });

        it('rejects empty state from cookie', () => {
            assert.throws(() => {
                oauthModule.assertStateBinding(validState, '');
            }, (err) => err.message === 'OAUTH_STATE_INVALID');
        });

        it('rejects short state values', () => {
            assert.throws(() => {
                oauthModule.assertStateBinding('short', 'short');
            }, (err) => err.message === 'OAUTH_STATE_INVALID');
        });

        it('accepts matching state values', () => {
            assert.doesNotThrow(() => {
                oauthModule.assertStateBinding(validState, validState);
            });
        });
    });

    describe('OAuth State Record Validation', () => {
        it('rejects expired state record', () => {
            assert.throws(() => {
                oauthModule.assertStateRecord({
                    provider: 'linkedin',
                    codeVerifier: 'test',
                    expiresAt: Date.now() - 1000,  // Expired
                }, 'linkedin');
            }, (err) => err.message === 'OAUTH_STATE_INVALID');
        });

        it('rejects state record with wrong provider', () => {
            assert.throws(() => {
                oauthModule.assertStateRecord({
                    provider: 'github',
                    codeVerifier: 'test',
                    expiresAt: Date.now() + 60000,
                }, 'linkedin');
            }, (err) => err.message === 'OAUTH_STATE_INVALID');
        });

        it('rejects state record without codeVerifier', () => {
            assert.throws(() => {
                oauthModule.assertStateRecord({
                    provider: 'linkedin',
                    expiresAt: Date.now() + 60000,
                }, 'linkedin');
            }, (err) => err.message === 'OAUTH_STATE_INVALID');
        });

        it('accepts valid state record', () => {
            assert.doesNotThrow(() => {
                oauthModule.assertStateRecord({
                    provider: 'linkedin',
                    codeVerifier: 'test-verifier',
                    expiresAt: Date.now() + 60000,
                }, 'linkedin');
            });
        });
    });

    describe('OAuth Exchange Record Validation', () => {
        it('rejects expired exchange record', () => {
            assert.throws(() => {
                oauthModule.assertExchangeRecord({
                    uid: 'user-123',
                    provider: 'linkedin',
                    expiresAt: Date.now() - 1000,  // Expired
                });
            }, (err) => err.message === 'INVALID_EXCHANGE_CODE');
        });

        it('rejects exchange record without uid', () => {
            assert.throws(() => {
                oauthModule.assertExchangeRecord({
                    provider: 'linkedin',
                    expiresAt: Date.now() + 60000,
                });
            }, (err) => err.message === 'INVALID_EXCHANGE_CODE');
        });

        it('rejects exchange record without provider', () => {
            assert.throws(() => {
                oauthModule.assertExchangeRecord({
                    uid: 'user-123',
                    expiresAt: Date.now() + 60000,
                });
            }, (err) => err.message === 'INVALID_EXCHANGE_CODE');
        });

        it('rejects used exchange record', () => {
            assert.throws(() => {
                oauthModule.assertExchangeRecord({
                    uid: 'user-123',
                    provider: 'linkedin',
                    usedAt: Date.now(),
                    expiresAt: Date.now() + 60000,
                });
            }, (err) => err.message === 'INVALID_EXCHANGE_CODE');
        });

        it('accepts valid exchange record', () => {
            assert.doesNotThrow(() => {
                oauthModule.assertExchangeRecord({
                    uid: 'user-123',
                    provider: 'linkedin',
                    expiresAt: Date.now() + 60000,
                });
            });
        });
    });

    describe('Verified Identity Assertion', () => {
        it('rejects missing provider ID', () => {
            assert.throws(() => {
                oauthModule.assertVerifiedIdentity({
                    provider: 'linkedin',
                    providerId: '',
                    email: 'user@example.com',
                    emailVerified: true,
                });
            });
        });

        it('rejects unverified email', () => {
            assert.throws(() => {
                oauthModule.assertVerifiedIdentity({
                    provider: 'linkedin',
                    providerId: '12345',
                    email: 'user@example.com',
                    emailVerified: false,
                });
            });
        });

        it('rejects invalid email', () => {
            assert.throws(() => {
                oauthModule.assertVerifiedIdentity({
                    provider: 'linkedin',
                    providerId: '12345',
                    email: 'not-an-email',
                    emailVerified: true,
                });
            });
        });

        it('accepts valid identity', () => {
            const email = oauthModule.assertVerifiedIdentity({
                provider: 'linkedin',
                providerId: '12345',
                email: 'User@Example.COM',
                emailVerified: true,
            });
            assert.equal(email, 'user@example.com');  // Normalized to lowercase
        });
    });

    describe('Account Link Safety', () => {
        it('rejects linking when provider user already exists', () => {
            assert.throws(() => {
                oauthModule.assertAccountLinkSafe({
                    providerUid: 'linkedin:123',
                    providerUser: { uid: 'linkedin:123' },  // Already exists
                    emailOwner: null,
                    normalizedEmail: 'user@example.com',
                });
            });
        });

        it('rejects linking when email belongs to different user', () => {
            assert.throws(() => {
                oauthModule.assertAccountLinkSafe({
                    providerUid: 'linkedin:123',
                    providerUser: null,
                    emailOwner: { uid: 'local:456' },  // Different user owns this email
                    normalizedEmail: 'user@example.com',
                });
            });
        });

        it('accepts safe link when no conflicts', () => {
            assert.doesNotThrow(() => {
                oauthModule.assertAccountLinkSafe({
                    providerUid: 'linkedin:123',
                    providerUser: null,
                    emailOwner: null,
                    normalizedEmail: 'user@example.com',
                });
            });
        });
    });

    describe('Payment Validation', () => {
        it('rejects internal order with wrong UID', () => {
            assert.throws(() => {
                paymentsModule.assertInternalOrder(
                    { uid: 'user-a', provider: 'stripe', providerOrderId: 'order_123', status: 'PAYMENT_CREATED' },
                    { uid: 'user-b', provider: 'stripe', providerOrderId: 'order_123' }
                );
            }, (err) => err.message === 'ORDER_NOT_FOUND');
        });

        it('rejects internal order with wrong provider', () => {
            assert.throws(() => {
                paymentsModule.assertInternalOrder(
                    { uid: 'user-a', provider: 'stripe', providerOrderId: 'order_123', status: 'PAYMENT_CREATED' },
                    { uid: 'user-a', provider: 'paypal', providerOrderId: 'order_123' }
                );
            }, (err) => err.message === 'ORDER_NOT_FOUND');
        });

        it('rejects internal order with wrong order ID', () => {
            assert.throws(() => {
                paymentsModule.assertInternalOrder(
                    { uid: 'user-a', provider: 'stripe', providerOrderId: 'order_123', status: 'PAYMENT_CREATED' },
                    { uid: 'user-a', provider: 'stripe', providerOrderId: 'order_456' }
                );
            }, (err) => err.message === 'ORDER_BINDING_MISMATCH');
        });

        it('rejects internal order with invalid status', () => {
            assert.throws(() => {
                paymentsModule.assertInternalOrder(
                    { uid: 'user-a', provider: 'stripe', providerOrderId: 'order_123', status: 'FAILED' },
                    { uid: 'user-a', provider: 'stripe', providerOrderId: 'order_123' }
                );
            }, (err) => err.message === 'INVALID_ORDER_STATE');
        });

        it('accepts matching internal order', () => {
            assert.doesNotThrow(() => {
                paymentsModule.assertInternalOrder(
                    { uid: 'user-a', provider: 'stripe', providerOrderId: 'order_123', status: 'PAYMENT_CREATED' },
                    { uid: 'user-a', provider: 'stripe', providerOrderId: 'order_123' }
                );
            });
        });
    });

    describe('Entitlement Resolution', () => {
        it('returns correct entitlement for basic user', () => {
            const user = { membership: 'Basic', paymentStatus: 'INACTIVE' };
            const entitlement = entitlementsModule.resolveEffectiveEntitlement(user, {});
            assert.ok(entitlement);
            assert.equal(typeof entitlement.allowsDocxExport, 'boolean');
        });

        it('returns correct entitlement for premium user', () => {
            const user = { membership: 'Premium', paymentStatus: 'ACTIVE', membershipEnds: new Date(Date.now() + 86400000).toISOString() };
            const entitlement = entitlementsModule.resolveEffectiveEntitlement(user, {});
            assert.ok(entitlement);
        });

        it('identifies paid membership tiers', () => {
            assert.equal(entitlementsModule.isPaidMembershipTier('Premium'), true);
            assert.equal(entitlementsModule.isPaidMembershipTier('Enterprise'), true);
            assert.equal(entitlementsModule.isPaidMembershipTier('Basic'), false);
        });
    });

    describe('Enumeration Delay Protection', () => {
        it('returns non-negative delay', () => {
            const delay = resetModule.minimumEnumerationDelay(Date.now() - 100, Date.now(), 50);
            assert.ok(delay >= 0);
        });

        it('returns zero delay when elapsed exceeds minimum', () => {
            const delay = resetModule.minimumEnumerationDelay(Date.now() - 5000, Date.now(), 50);
            assert.equal(delay, 0);
        });
    });

    describe('PKCE Challenge Generation', () => {
        it('generates S256 challenge from verifier', () => {
            const verifier = 'a'.repeat(43);
            const challenge = oauthModule.createPkceChallenge(verifier);
            assert.ok(challenge);
            assert.ok(challenge.length > 0);
            assert.notEqual(challenge, verifier);  // Challenge != verifier
        });

        it('generates deterministic challenge for same verifier', () => {
            const verifier = 'a'.repeat(43);  // Must be 43-128 chars
            const challenge1 = oauthModule.createPkceChallenge(verifier);
            const challenge2 = oauthModule.createPkceChallenge(verifier);
            assert.equal(challenge1, challenge2);
        });
    });

    describe('Cookie Parsing', () => {
        it('parses single cookie', () => {
            const cookies = oauthModule.parseCookies('rp_oauth_state=abc123');
            assert.equal(cookies.rp_oauth_state, 'abc123');
        });

        it('parses multiple cookies', () => {
            const cookies = oauthModule.parseCookies('a=1; b=2; c=3');
            assert.equal(cookies.a, '1');
            assert.equal(cookies.b, '2');
            assert.equal(cookies.c, '3');
        });

        it('handles empty cookie header', () => {
            const cookies = oauthModule.parseCookies('');
            assert.deepEqual(cookies, {});
        });

        it('handles null cookie header', () => {
            const cookies = oauthModule.parseCookies(null);
            assert.deepEqual(cookies, {});
        });

        it('handles undefined cookie header', () => {
            const cookies = oauthModule.parseCookies(undefined);
            assert.deepEqual(cookies, {});
        });
    });

    describe('Hash Opaque Token', () => {
        it('produces deterministic hash', () => {
            const hash1 = oauthModule.hashOpaque('test-token');
            const hash2 = oauthModule.hashOpaque('test-token');
            assert.equal(hash1, hash2);
        });

        it('produces different hash for different input', () => {
            const hash1 = oauthModule.hashOpaque('token-a');
            const hash2 = oauthModule.hashOpaque('token-b');
            assert.notEqual(hash1, hash2);
        });
    });
});
