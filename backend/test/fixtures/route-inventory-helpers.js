'use strict';

/**
 * Exported so more than one suite can assert against the same route inventory
 * without re-parsing it.
 */
const fs = require('node:fs');
const path = require('node:path');

module.exports = {
  /**
   * The fixture rows, for tests that need the route table.
   * @returns {Array<{method: string, path: string, registeredAt: string}>}
   */
  routeInventory() {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'admin-route-inventory.json'), 'utf8')).routes;
  },
};
