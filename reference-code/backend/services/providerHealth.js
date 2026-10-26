'use strict';

/**
 * AI Provider Health Tracker
 * 
 * Tracks provider health metrics for intelligent routing:
 * - Success/failure rates
 * - Latency
 * - Recent errors
 * - Circuit breaker state
 * 
 * Enables:
 * - Health-aware provider selection
 * - Automatic circuit breaking
 * - Latency-based routing
 * - Error rate monitoring
 */

const { createLogger } = require('./logger');

const logger = createLogger({ module: 'provider-health' });

// Health window: track last N requests per provider
const HEALTH_WINDOW = 20;
const CIRCUIT_BREAKER_THRESHOLD = 5;  // Consecutive failures to open circuit
const CIRCUIT_BREAKER_RESET_MS = 60_000;  // 1 minute before half-open

class ProviderHealthTracker {
    constructor() {
        this.providers = new Map();
    }
    
    getOrCreateProvider(name) {
        if (!this.providers.has(name)) {
            this.providers.set(name, {
                name,
                requests: [],
                consecutiveFailures: 0,
                circuitOpenUntil: 0,
                totalRequests: 0,
                totalFailures: 0,
            });
        }
        return this.providers.get(name);
    }
    
    /**
     * Record a successful request
     */
    recordSuccess(provider, latencyMs, model) {
        const p = this.getOrCreateProvider(provider);
        p.totalRequests++;
        p.consecutiveFailures = 0;
        p.requests.push({
            success: true,
            latencyMs,
            model,
            timestamp: Date.now(),
        });
        
        // Keep only recent requests
        if (p.requests.length > HEALTH_WINDOW) {
            p.requests.shift();
        }
        
        logger.debug('Provider success recorded', {
            provider,
            latencyMs,
            model,
            recentSuccessRate: this.getSuccessRate(provider),
        });
    }
    
    /**
     * Record a failed request
     */
    recordFailure(provider, error, model) {
        const p = this.getOrCreateProvider(provider);
        p.totalRequests++;
        p.totalFailures++;
        p.consecutiveFailures++;
        p.requests.push({
            success: false,
            error: error?.message || 'Unknown error',
            statusCode: error?.status,
            model,
            timestamp: Date.now(),
        });
        
        // Keep only recent requests
        if (p.requests.length > HEALTH_WINDOW) {
            p.requests.shift();
        }
        
        // Open circuit breaker if threshold exceeded
        if (p.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
            p.circuitOpenUntil = Date.now() + CIRCUIT_BREAKER_RESET_MS;
            logger.warn('Circuit breaker opened', {
                provider,
                consecutiveFailures: p.consecutiveFailures,
                resetAt: new Date(p.circuitOpenUntil).toISOString(),
            });
        }
        
        logger.warn('Provider failure recorded', {
            provider,
            error: error?.message,
            statusCode: error?.status,
            consecutiveFailures: p.consecutiveFailures,
        });
    }
    
    /**
     * Check if provider circuit is open
     */
    isCircuitOpen(provider) {
        const p = this.getOrCreateProvider(provider);
        if (p.circuitOpenUntil > Date.now()) {
            return true;
        }
        // Reset circuit if cooldown expired
        if (p.circuitOpenUntil > 0 && p.circuitOpenUntil <= Date.now()) {
            p.circuitOpenUntil = 0;
            p.consecutiveFailures = 0;
            logger.info('Circuit breaker reset', { provider });
        }
        return false;
    }
    
    /**
     * Get success rate for provider (0-1)
     */
    getSuccessRate(provider) {
        const p = this.getOrCreateProvider(provider);
        if (p.requests.length === 0) return 1;  // Unknown = assume healthy
        const successes = p.requests.filter(r => r.success).length;
        return successes / p.requests.length;
    }
    
    /**
     * Get average latency for provider
     */
    getAverageLatency(provider) {
        const p = this.getOrCreateProvider(provider);
        const successful = p.requests.filter(r => r.success && r.latencyMs);
        if (successful.length === 0) return null;
        const total = successful.reduce((sum, r) => sum + r.latencyMs, 0);
        return Math.round(total / successful.length);
    }
    
    /**
     * Get health score for provider (0-100)
     * Higher is better
     */
    getHealthScore(provider) {
        const p = this.getOrCreateProvider(provider);
        
        // Circuit open = 0
        if (this.isCircuitOpen(provider)) return 0;
        
        // No data = assume healthy
        if (p.requests.length === 0) return 80;
        
        const successRate = this.getSuccessRate(provider);
        const avgLatency = this.getAverageLatency(provider);
        
        // Base score from success rate (0-80)
        let score = successRate * 80;
        
        // Latency bonus (0-20)
        if (avgLatency !== null) {
            // < 1s = 20, > 10s = 0
            const latencyScore = Math.max(0, 20 - (avgLatency / 500));
            score += latencyScore;
        } else {
            score += 10;  // Unknown latency = neutral
        }
        
        return Math.round(score);
    }
    
    /**
     * Get provider health summary
     */
    getHealthSummary() {
        const summary = {};
        for (const [name, p] of this.providers) {
            summary[name] = {
                healthScore: this.getHealthScore(name),
                successRate: this.getSuccessRate(name),
                averageLatency: this.getAverageLatency(name),
                circuitOpen: this.isCircuitOpen(name),
                consecutiveFailures: p.consecutiveFailures,
                totalRequests: p.totalRequests,
                totalFailures: p.totalFailures,
                recentRequests: p.requests.length,
            };
        }
        return summary;
    }
    
    /**
     * Select best provider from available list
     * Returns providers sorted by health score
     */
    rankProviders(availableProviders) {
        return availableProviders
            .map(name => ({
                name,
                healthScore: this.getHealthScore(name),
                circuitOpen: this.isCircuitOpen(name),
            }))
            .filter(p => !p.circuitOpen)
            .sort((a, b) => b.healthScore - a.healthScore)
            .map(p => p.name);
    }
}

// Singleton instance
const providerHealth = new ProviderHealthTracker();

module.exports = { providerHealth, ProviderHealthTracker };
