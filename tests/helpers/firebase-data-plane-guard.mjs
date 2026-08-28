import assert from 'node:assert/strict';

/**
 * Browser-test tripwire for retired Firebase application-data products.
 * Identity Toolkit and Secure Token traffic remain allowed because Firebase
 * Authentication is the retained identity plane. Any application-data request
 * is aborted and fails the browser exercise instead of being mocked successful.
 */
export async function rejectFirebaseDataPlaneRequests(page) {
  const reject = async route => {
    const url = route.request().url();
    await route.abort('blockedbyclient');
    assert.fail(`Retired Firebase application-data request detected: ${new URL(url).hostname}`);
  };
  await page.route('**/*firestore.googleapis.com/**', reject);
  await page.route('**/*.firebaseio.com/**', reject);
  await page.route('**/firebasestorage.googleapis.com/**', reject);
}
