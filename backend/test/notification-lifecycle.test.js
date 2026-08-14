const test = require('node:test');
const assert = require('node:assert/strict');
const emailRoutes = require('../routes/email');
const EmailNotifier = require('../services/emailNotifier');

test('email notifier reports provider acceptance as attempted, never delivered', async () => {
  const original = emailRoutes.dispatchNotification;
  try {
    emailRoutes.dispatchNotification = async () => ({ success: true, result: { messageId: 'provider-accepted' } });
    const accepted = await EmailNotifier.notifyPasswordChanged(null, { userEmail: 'user@example.com', userName: 'User' });
    assert.deepEqual(accepted, { success: true, deliveryState: 'DELIVERY_ATTEMPTED', providerAccepted: true });
    emailRoutes.dispatchNotification = async () => ({ success: false, error: 'provider unavailable' });
    const failed = await EmailNotifier.notifyPasswordChanged(null, { userEmail: 'user@example.com', userName: 'User' });
    assert.equal(failed.success, false);
    assert.equal(failed.deliveryState, 'DELIVERY_FAILED');
    assert.match(failed.error, /provider unavailable/);
  } finally {
    emailRoutes.dispatchNotification = original;
  }
});
