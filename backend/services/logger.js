'use strict';

/**
 * Structured Logger for ResumePilot AI
 * 
 * Provides structured JSON logging with:
 * - Log levels (error, warn, info, debug)
 * - Request ID correlation
 * - Timestamp in ISO format
 * - Context metadata
 * - Error serialization
 * 
 * Usage:
 *   const { createLogger } = require('./logger');
 *   const logger = createLogger({ module: 'ai-runtime' });
 *   logger.info('Provider selected', { provider: 'gemini', model: 'gemini-2.0-flash' });
 *   logger.error('Provider failed', { provider: 'nvidia', error: err.message });
 */

const LOG_LEVELS = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
};

const CURRENT_LEVEL = LOG_LEVELS[String(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? LOG_LEVELS.info;

function formatTimestamp() {
    return new Date().toISOString();
}

function serializeError(error) {
    if (!error) return undefined;
    return {
        message: error.message,
        code: error.code,
        status: error.status,
        stack: process.env.NODE_ENV === 'production' ? undefined : error.stack,
    };
}

function createLogger(context = {}) {
    const module = context.module || 'app';
    
    function log(level, message, meta = {}) {
        if (LOG_LEVELS[level] > CURRENT_LEVEL) return;
        
        const entry = {
            timestamp: formatTimestamp(),
            level,
            module,
            message,
            ...meta,
        };
        
        // Serialize error objects
        if (meta.error instanceof Error) {
            entry.error = serializeError(meta.error);
            delete entry.error; // Remove raw Error object
            entry.errorDetails = serializeError(meta.error);
        }
        
        // Add request ID if available
        if (meta.requestId) {
            entry.requestId = meta.requestId;
        }
        
        const output = JSON.stringify(entry);
        
        switch (level) {
            case 'error':
                process.stderr.write(output + '\n');
                break;
            case 'warn':
                process.stderr.write(output + '\n');
                break;
            default:
                process.stdout.write(output + '\n');
        }
    }
    
    return {
        error: (message, meta) => log('error', message, meta),
        warn: (message, meta) => log('warn', message, meta),
        info: (message, meta) => log('info', message, meta),
        debug: (message, meta) => log('debug', message, meta),
        
        // Create child logger with additional context
        child: (additionalContext) => createLogger({ ...context, ...additionalContext }),
    };
}

module.exports = { createLogger };
