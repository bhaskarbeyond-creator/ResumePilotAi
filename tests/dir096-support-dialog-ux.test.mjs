import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync('src/components/Dashboard/DashboardSupport/DashboardSupport.jsx', 'utf8');

test('support ticket dialog exposes modal semantics and keyboard focus management', () => {
    assert.match(source, /role="dialog"/);
    assert.match(source, /aria-modal="true"/);
    assert.match(source, /aria-labelledby="create-ticket-modal-title"/);
    assert.match(source, /aria-describedby="create-ticket-modal-description"/);
    assert.match(source, /createTicketSubjectRef\.current\?\.focus\(\)/);
    assert.match(source, /document\.body\.style\.overflow = 'hidden'/);
    assert.match(source, /last\.focus\(\)/);
    assert.match(source, /first\.focus\(\)/);
    assert.match(source, /const opener = createTicketButtonRef\.current/);
    assert.match(source, /if \(opener\?\.isConnected\) opener\.focus\(\)/);
});

test('FAQ disclosures connect their visible answers and announce expanded state', () => {
    assert.match(source, /aria-expanded=\{isExpanded\}/);
    assert.match(source, /aria-controls=\{answerId\}/);
    assert.match(source, /id=\{answerId\} hidden=\{!isExpanded\}/);
});

test('support FAQs avoid unverified absolute privacy and export guarantees', () => {
    assert.doesNotMatch(source, /zero[- ]retention|never used to train|pixel-perfect|0 layout drift|256-bit SSL|official GST/i);
    assert.match(source, /Data handling can vary by provider and service/);
    assert.match(source, /employers and screening systems can use different criteria/);
});
