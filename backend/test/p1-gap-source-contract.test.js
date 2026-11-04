'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

describe('P1 gap source contracts', () => {
  it('GAP-03 wraps cover-letter routes in RequireAuthenticated', () => {
    const source = read('frontend/src/app/router.tsx');
    assert.match(source, /path="\/coverletter\/\*"[\s\S]{0,240}RequireAuth/);
    assert.match(source, /path="\/cover-letter\/\*"[\s\S]{0,240}RequireAuth/);
  });

  it('GAP-12 redirects /front to the public home', () => {
    const source = read('frontend/src/app/router.tsx');
    assert.match(source, /path="\/front"[\s\S]{0,160}Navigate[\s\S]{0,80}to="\/"/);
  });

  it('GAP-17 exposes a skip link and main-content landmarks', () => {
    const html = read('index.html');
    assert.match(html, /class="skip-link"[\s\S]{0,80}href="#main-content"/);
    assert.match(html, /<a class="skip-link"[\s\S]*id="root"/);
    const css = read('frontend/src/index.css');
    assert.match(css, /\.skip-link/);
    const mainShell = read('frontend/src/components/layout/cuba-app-shell.tsx');
    assert.match(mainShell, /id="main-content"/);
    assert.match(mainShell, /<main[^>]*id="main-content"/);
  });

  it('GAP-06 ships migration 015, ownership, deletion, and admin Help Desk', () => {
    assert.equal(fs.existsSync(path.join(root, 'backend/database/migrations/015_support_tickets.sql')), true);
    assert.equal(fs.existsSync(path.join(root, 'backend/database/migrations/015_support_tickets.down.sql')), true);
    const ownership = read('backend/database/ownership.js');
    assert.match(ownership, /support_ticket/);
    const deletion = read('backend/services/accountDeletion.js');
    assert.match(deletion, /support_ticket_messages/);
    assert.match(deletion, /support_tickets/);
    const admin = read('frontend/src/pages/admin/console.tsx');
    assert.match(admin, /AdminHelpDeskTab/);
    const helpdesk = read('frontend/src/components/admin/AdminHelpDeskTab.tsx');
    assert.match(helpdesk, /SupportTicket/);
  });

  it('GAP-08 registers Paytm and PhonePe callbacks plus outbox reconcile', () => {
    const index = read('backend/index.js');
    assert.match(index, /\/api\/paytm\/callback/);
    assert.match(index, /\/api\/phonepe\/callback/);
    assert.match(index, /reconcilePendingIndianGatewayOrders/);
    assert.match(index, /handlePaytmCallback/);
    assert.match(index, /handlePhonePeCallback/);
  });

  it('GAP-10 fires a readiness alert without awaiting it before 503', () => {
    const index = read('backend/index.js');
    assert.match(index, /maybeQueueReadyzAlert/);
    const alerts = read('backend/services/readyzAlerts.js');
    assert.match(alerts, /admin_system_alert:readyz:/);
    assert.match(alerts, /consecutiveFailures/);
  });
});
