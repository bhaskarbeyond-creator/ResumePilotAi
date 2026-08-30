/**
 * Provider Health Tracker Tests
 * 
 * Tests health-aware provider routing, circuit breaker, and latency tracking.
 * 
 * Run: node --test tests/provider-health.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { ProviderHealthTracker } = await import('../backend/services/providerHealth.js');

describe('Provider Health Tracker', () => {
    
    describe('Success Recording', () => {
        it('records successful requests', () => {
            const tracker = new ProviderHealthTracker();
            tracker.recordSuccess('gemini', 500, 'gemini-2.0-flash');
            tracker.recordSuccess('gemini', 600, 'gemini-2.0-flash');
            
            const summary = tracker.getHealthSummary();
            assert.equal(summary.gemini.totalRequests, 2);
            assert.equal(summary.gemini.totalFailures, 0);
            assert.equal(summary.gemini.consecutiveFailures, 0);
        });

        it('calculates success rate correctly', () => {
            const tracker = new ProviderHealthTracker();
            tracker.recordSuccess('gemini', 500, 'gemini-2.0-flash');
            tracker.recordSuccess('gemini', 600, 'gemini-2.0-flash');
            tracker.recordFailure('gemini', new Error('timeout'), 'gemini-2.0-flash');
            
            const rate = tracker.getSuccessRate('gemini');
            assert.ok(rate > 0.6 && rate < 0.7, `Expected ~0.67 but got ${rate}`);
        });

        it('calculates average latency correctly', () => {
            const tracker = new ProviderHealthTracker();
            tracker.recordSuccess('gemini', 500, 'gemini-2.0-flash');
            tracker.recordSuccess('gemini', 700, 'gemini-2.0-flash');
            
            const avg = tracker.getAverageLatency('gemini');
            assert.equal(avg, 600);
        });
    });

    describe('Failure Recording', () => {
        it('records failures and increments consecutive failures', () => {
            const tracker = new ProviderHealthTracker();
            tracker.recordFailure('nvidia', new Error('timeout'), 'llama-3.2');
            tracker.recordFailure('nvidia', new Error('500'), 'llama-3.2');
            
            const summary = tracker.getHealthSummary();
            assert.equal(summary.nvidia.totalRequests, 2);
            assert.equal(summary.nvidia.totalFailures, 2);
            assert.equal(summary.nvidia.consecutiveFailures, 2);
        });

        it('resets consecutive failures on success', () => {
            const tracker = new ProviderHealthTracker();
            tracker.recordFailure('nvidia', new Error('timeout'), 'llama-3.2');
            tracker.recordFailure('nvidia', new Error('500'), 'llama-3.2');
            tracker.recordSuccess('nvidia', 500, 'llama-3.2');
            
            const summary = tracker.getHealthSummary();
            assert.equal(summary.nvidia.consecutiveFailures, 0);
        });
    });

    describe('Circuit Breaker', () => {
        it('opens circuit after 5 consecutive failures', () => {
            const tracker = new ProviderHealthTracker();
            for (let i = 0; i < 5; i++) {
                tracker.recordFailure('nvidia', new Error('fail'), 'llama-3.2');
            }
            
            assert.ok(tracker.isCircuitOpen('nvidia'));
        });

        it('does not open circuit with fewer than 5 failures', () => {
            const tracker = new ProviderHealthTracker();
            for (let i = 0; i < 4; i++) {
                tracker.recordFailure('nvidia', new Error('fail'), 'llama-3.2');
            }
            
            assert.ok(!tracker.isCircuitOpen('nvidia'));
        });

        it('resets circuit after cooldown', () => {
            const tracker = new ProviderHealthTracker();
            for (let i = 0; i < 5; i++) {
                tracker.recordFailure('nvidia', new Error('fail'), 'llama-3.2');
            }
            
            assert.ok(tracker.isCircuitOpen('nvidia'));
            
            // Simulate cooldown by manually setting the reset time in the past
            const p = tracker.providers.get('nvidia');
            p.circuitOpenUntil = Date.now() - 1000;
            
            assert.ok(!tracker.isCircuitOpen('nvidia'));
            assert.equal(p.consecutiveFailures, 0);
        });
    });

    describe('Health Score', () => {
        it('returns 0 for circuit-open provider', () => {
            const tracker = new ProviderHealthTracker();
            for (let i = 0; i < 5; i++) {
                tracker.recordFailure('nvidia', new Error('fail'), 'llama-3.2');
            }
            
            assert.equal(tracker.getHealthScore('nvidia'), 0);
        });

        it('returns high score for healthy provider', () => {
            const tracker = new ProviderHealthTracker();
            for (let i = 0; i < 10; i++) {
                tracker.recordSuccess('gemini', 500, 'gemini-2.0-flash');
            }
            
            const score = tracker.getHealthScore('gemini');
            assert.ok(score >= 90, `Expected >= 90 but got ${score}`);
        });

        it('returns lower score for provider with failures', () => {
            const tracker = new ProviderHealthTracker();
            for (let i = 0; i < 5; i++) {
                tracker.recordSuccess('gemini', 500, 'gemini-2.0-flash');
            }
            for (let i = 0; i < 5; i++) {
                tracker.recordFailure('gemini', new Error('fail'), 'gemini-2.0-flash');
            }
            
            const score = tracker.getHealthScore('gemini');
            assert.ok(score < 60, `Expected < 60 but got ${score}`);
        });

        it('returns 80 for unknown provider', () => {
            const tracker = new ProviderHealthTracker();
            assert.equal(tracker.getHealthScore('unknown'), 80);
        });
    });

    describe('Provider Ranking', () => {
        it('ranks providers by health score', () => {
            const tracker = new ProviderHealthTracker();
            
            // Gemini: healthy
            for (let i = 0; i < 10; i++) {
                tracker.recordSuccess('gemini', 500, 'gemini-2.0-flash');
            }
            
            // OpenAI: some failures
            for (let i = 0; i < 5; i++) {
                tracker.recordSuccess('openai', 800, 'gpt-4o-mini');
            }
            for (let i = 0; i < 5; i++) {
                tracker.recordFailure('openai', new Error('fail'), 'gpt-4o-mini');
            }
            
            // Nvidia: circuit open
            for (let i = 0; i < 5; i++) {
                tracker.recordFailure('nvidia', new Error('fail'), 'llama-3.2');
            }
            
            const ranked = tracker.rankProviders(['gemini', 'openai', 'nvidia']);
            
            // Gemini should be first (healthiest)
            assert.equal(ranked[0], 'gemini');
            // Nvidia should be excluded (circuit open)
            assert.ok(!ranked.includes('nvidia'));
        });

        it('excludes circuit-open providers from ranking', () => {
            const tracker = new ProviderHealthTracker();
            
            for (let i = 0; i < 5; i++) {
                tracker.recordFailure('nvidia', new Error('fail'), 'llama-3.2');
            }
            
            const ranked = tracker.rankProviders(['nvidia', 'gemini']);
            assert.ok(!ranked.includes('nvidia'));
            assert.ok(ranked.includes('gemini'));
        });
    });

    describe('Health Window', () => {
        it('keeps only recent requests', () => {
            const tracker = new ProviderHealthTracker();
            
            // Add 25 requests (more than HEALTH_WINDOW of 20)
            for (let i = 0; i < 25; i++) {
                tracker.recordSuccess('gemini', 500, 'gemini-2.0-flash');
            }
            
            const summary = tracker.getHealthSummary();
            assert.equal(summary.gemini.totalRequests, 25);
            assert.equal(summary.gemini.recentRequests, 20);
        });
    });
});
