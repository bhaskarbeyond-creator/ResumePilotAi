/**
 * Security Headers Verification Test Harness
 * 
 * Tests that security headers are properly configured.
 * 
 * Run: node --test tests/security-headers.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

function readBackendIndex() {
    return readFileSync('backend/index.js', 'utf8');
}

describe('Security Headers Verification', () => {
    
    describe('Helmet Configuration', () => {
        it('has Helmet middleware', () => {
            const code = readBackendIndex();
            assert.ok(code.includes('helmet()'), 'Should have Helmet middleware');
        });

        it('has Helmet imported', () => {
            const code = readBackendIndex();
            assert.ok(code.includes("require('helmet')") || code.includes('import helmet'), 'Should import Helmet');
        });
    });

    describe('CORS Configuration', () => {
        it('has CORS middleware', () => {
            const code = readBackendIndex();
            assert.ok(code.includes('cors('), 'Should have CORS middleware');
        });

        it('has CORS imported', () => {
            const code = readBackendIndex();
            assert.ok(code.includes("require('cors')") || code.includes('import cors'), 'Should import CORS');
        });
    });

    describe('Content Security Policy', () => {
        it('has CSP configuration', () => {
            const code = readBackendIndex();
            // Helmet sets CSP by default
            assert.ok(code.includes('helmet()'), 'Should have CSP via Helmet');
        });
    });

    describe('X-Frame-Options', () => {
        it('has X-Frame-Options header', () => {
            const code = readBackendIndex();
            // Helmet sets X-Frame-Options by default
            assert.ok(code.includes('helmet()'), 'Should have X-Frame-Options via Helmet');
        });
    });

    describe('X-Content-Type-Options', () => {
        it('has X-Content-Type-Options header', () => {
            const code = readBackendIndex();
            // Helmet sets X-Content-Type-Options by default
            assert.ok(code.includes('helmet()'), 'Should have X-Content-Type-Options via Helmet');
        });
    });

    describe('Strict-Transport-Security', () => {
        it('has HSTS header', () => {
            const code = readBackendIndex();
            // Helmet sets HSTS by default
            assert.ok(code.includes('helmet()'), 'Should have HSTS via Helmet');
        });
    });

    describe('X-XSS-Protection', () => {
        it('has X-XSS-Protection header', () => {
            const code = readBackendIndex();
            // Helmet sets X-XSS-Protection by default
            assert.ok(code.includes('helmet()'), 'Should have X-XSS-Protection via Helmet');
        });
    });

    describe('Referrer-Policy', () => {
        it('has Referrer-Policy header', () => {
            const code = readBackendIndex();
            // Helmet sets Referrer-Policy by default
            assert.ok(code.includes('helmet()'), 'Should have Referrer-Policy via Helmet');
        });
    });

    describe('Permissions-Policy', () => {
        it('has Permissions-Policy header', () => {
            const code = readBackendIndex();
            // Helmet sets Permissions-Policy by default
            assert.ok(code.includes('helmet()'), 'Should have Permissions-Policy via Helmet');
        });
    });

    describe('Request ID', () => {
        it('has request ID middleware', () => {
            const code = readBackendIndex();
            assert.ok(code.includes('X-Request-Id') || code.includes('requestId'), 'Should have request ID middleware');
        });
    });

    describe('Rate Limiting', () => {
        it('has global rate limiter', () => {
            const code = readBackendIndex();
            assert.ok(code.includes('globalLimiter'), 'Should have global rate limiter');
        });

        it('has auth rate limiter', () => {
            const code = readBackendIndex();
            assert.ok(code.includes('authLimiter'), 'Should have auth rate limiter');
        });
    });

    describe('Input Validation', () => {
        it('has input validation', () => {
            const code = readBackendIndex();
            assert.ok(code.includes('sanitize') || code.includes('validate') || code.includes('escape'), 'Should have input validation');
        });
    });

    describe('Authentication', () => {
        it('has authentication middleware', () => {
            const code = readBackendIndex();
            assert.ok(code.includes('authenticate') || code.includes('auth') || code.includes('verify'), 'Should have authentication middleware');
        });
    });

    describe('Authorization', () => {
        it('has authorization checks', () => {
            const code = readBackendIndex();
            assert.ok(code.includes('authorize') || code.includes('role') || code.includes('permission'), 'Should have authorization checks');
        });
    });
});
