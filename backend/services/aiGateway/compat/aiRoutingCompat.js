'use strict';

/**
 * Compatibility layer: re-exports legacy aiRouting symbols.
 * Backed by the robust discovery, health, and telemetry engine.
 */
const aiRouting = require('../../aiRouting');

module.exports = {
  ...aiRouting,
};