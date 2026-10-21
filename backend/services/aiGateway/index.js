'use strict';

/**
 * AI Gateway Facade
 *
 * Single Source of Truth: backend/freellmapi
 * Re-exports the canonical FreeLLMAPI unified engine with legacy aiRouting compatibility.
 * Zero duplicate implementations.
 */
const freellm = require('../../freellmapi');
const aiRoutingCompat = require('./compat/aiRoutingCompat');

module.exports = {
  ...freellm,
  compat: aiRoutingCompat,
};
