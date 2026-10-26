'use strict';

/**
 * Export concurrency observability.
 * 
 * The export concurrency limit is per-instance because Chromium runs locally
 * on each instance. This module provides observability into the current
 * export concurrency state.
 * 
 * For horizontal scaling, each instance maintains its own Chromium concurrency
 * limit using an in-memory counter. This is the correct approach because:
 * 1. Chromium processes are local to each instance
 * 2. The limit prevents resource exhaustion on a single instance
 * 3. A global semaphore would add unnecessary database overhead
 * 4. Each instance can independently manage its own Chromium pool
 */

const { createLogger } = require('./logger');

const logger = createLogger({ module: 'export-concurrency' });

const DEFAULT_MAX_CONCURRENT = 5;

// This is intentionally in-memory. See module docstring.
let activeExports = 0;

function acquireSlot() {
    if (activeExports >= DEFAULT_MAX_CONCURRENT) return false;
    activeExports++;
    logger.debug('Export slot acquired', { current: activeExports, max: DEFAULT_MAX_CONCURRENT });
    return true;
}

function releaseSlot() {
    activeExports = Math.max(0, activeExports - 1);
    logger.debug('Export slot released', { current: activeExports });
}

function getExportStatus() {
    return {
        current: activeExports,
        max: DEFAULT_MAX_CONCURRENT,
        available: Math.max(0, DEFAULT_MAX_CONCURRENT - activeExports),
        mode: 'per-instance',
    };
}

module.exports = {
    acquireSlot,
    releaseSlot,
    getExportStatus,
    DEFAULT_MAX_CONCURRENT,
};
