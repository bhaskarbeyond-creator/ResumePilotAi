'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  filterOrganizationTenants,
  isPersonalTenant,
  tenantType,
} = require('../enterprise/platformTenantClassification');

const root = path.join(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('GAP-21: personal tenants are classified by their personal- slug', () => {
  assert.equal(isPersonalTenant({ slug: 'personal-a1b2c3' }), true);
  assert.equal(isPersonalTenant({ slug: 'acme-enterprise' }), false);
  assert.equal(isPersonalTenant({ id: '00000000-0000-0000-0000-000000000000' }), false);
  assert.equal(tenantType({ slug: 'personal-a1b2c3' }), 'PERSONAL');
  assert.equal(tenantType({ slug: 'acme-enterprise' }), 'ORGANIZATION');
});

test('GAP-21: organization filtering never exposes a personal sandbox', () => {
  const tenants = [
    { id: 'uuid-a', slug: 'acme', displayName: 'Acme' },
    { id: 'uuid-b', slug: 'personal-deadbeef', displayName: 'Alex Personal' },
    { id: 'uuid-c', slug: 'beta', displayName: 'Beta' },
  ];
  assert.deepEqual(filterOrganizationTenants(tenants).map(t => t.id), ['uuid-a', 'uuid-c']);
});

test('GAP-21: platform tenant API returns type and frontend normalizes string errors + excludes personal', () => {
  const service = read('backend/enterprise/tenantService.js');
  assert.match(service, /type: tenantType\(tenant\)/);
  assert.match(service, /tenantType\s*\(tenant/);

  const platformApi = read('src/services/platformApi.js');
  assert.match(platformApi, /typeof rawError === 'string'/);
  assert.match(platformApi, /rawError\?\.message/);

  const usersManager = read('src/components/admin/usersManager/UsersManager.jsx');
  assert.match(usersManager, /d\.type === 'ORGANIZATION'/);
  assert.match(usersManager, /startsWith\('personal-'\)/);

  const drawer = read('src/components/admin/usersManager/User360Drawer.jsx');
  assert.match(drawer, /organizationTenants/);
  assert.match(drawer, /startsWith\('personal-'\)/);
});
