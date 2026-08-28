const { test, expect } = require('@playwright/test');
const { applicationDefault, getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const path = require('path');
const fs = require('fs');

/**
 * This suite can mutate a real production deployment. It is intentionally
 * impossible to enable with one generic boolean: the operator must bind a
 * short-lived approval to the exact HTTPS origin, disposable certification
 * tenant, expected release commit, and expiry time.
 */
function loadLiveConfiguration() {
  const baseUrl = String(process.env.LIVE_PRODUCTION_BASE_URL || '').replace(/\/$/, '');
  const adminEmail = String(process.env.LIVE_PRODUCTION_ADMIN_EMAIL || '').trim();
  const tenantId = String(process.env.LIVE_PRODUCTION_CERT_TENANT_ID || '').trim();
  const tenantSlug = String(process.env.LIVE_PRODUCTION_CERT_TENANT_SLUG || '').trim();
  const expectedCommit = String(process.env.LIVE_PRODUCTION_EXPECTED_COMMIT_SHA || '').trim().toLowerCase();
  const approvalExpiresAt = String(process.env.LIVE_PRODUCTION_APPROVAL_EXPIRES_AT || '').trim();
  const approval = String(process.env.LIVE_PRODUCTION_MUTATION_CONFIRMATION || '');
  const m2mKey = String(process.env.LIVE_PRODUCTION_CERT_M2M_KEY || '').trim();
  const firebaseProjectId = String(process.env.LIVE_PRODUCTION_FIREBASE_PROJECT_ID || '').trim();

  if (process.env.RUN_LIVE_PRODUCTION_MUTATIONS !== 'true') throw new Error('live mutations are not enabled');
  const parsed = new URL(baseUrl);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
    throw new Error('the live target must be a bare HTTPS origin');
  }
  if (/^(?:localhost|127\.|0\.0\.0\.0|\[?::1\]?)/i.test(parsed.hostname)) throw new Error('the live target is not a production host');
  if (!adminEmail || !firebaseProjectId) throw new Error('the live identity configuration is incomplete');
  if (!/^[0-9a-f-]{36}$/i.test(tenantId) || !/^[a-z0-9-]{3,100}$/.test(tenantSlug)) throw new Error('the certification tenant identity is invalid');
  if (!/(?:cert|e2e|sandbox|test)/i.test(tenantSlug)) throw new Error('the target tenant is not explicitly marked disposable');
  if (!/^[0-9a-f]{40}$/.test(expectedCommit)) throw new Error('the expected release commit is invalid');
  if (!/^rpa_[A-Za-z0-9_-]{20,}$/.test(m2mKey)) throw new Error('the certification service key is missing or malformed');

  const expiresAt = Date.parse(approvalExpiresAt);
  const remaining = expiresAt - Date.now();
  if (!Number.isFinite(expiresAt) || remaining <= 0 || remaining > 60 * 60 * 1000) {
    throw new Error('the live approval must expire within the next hour');
  }
  const expectedApproval = `APPROVE LIVE PRODUCTION MUTATIONS ${baseUrl} TENANT ${tenantId} COMMIT ${expectedCommit} UNTIL ${new Date(expiresAt).toISOString()}`;
  if (approval !== expectedApproval) throw new Error('the target-bound live approval does not match');

  return { baseUrl, adminEmail, tenantId, tenantSlug, expectedCommit, m2mKey, firebaseProjectId };
}

let liveConfig = null;
let readinessError = null;
try {
  liveConfig = loadLiveConfiguration();
  if (!getApps().length) {
    initializeApp({ credential: applicationDefault(), projectId: liveConfig.firebaseProjectId });
  }
} catch (error) {
  readinessError = error;
}

const VIEWPORTS = [
  { width: 375, height: 667, label: '375-mobile' },
  { width: 768, height: 1024, label: '768-tablet' },
  { width: 1024, height: 768, label: '1024-small-desktop' },
  { width: 1440, height: 900, label: '1440-desktop' },
];

test.describe.serial('Live production certification', () => {
  test.skip(!liveConfig || readinessError, 'Target-bound production approval and ADC are required; a skip is NOT VERIFIED.');

  let customToken;

  test.beforeAll(async () => {
    const user = await getAuth().getUserByEmail(liveConfig.adminEmail);
    if (user.emailVerified !== true) throw new Error('The production certification identity must have a verified email.');
    customToken = await getAuth().createCustomToken(user.uid, { productionCertification: true });
    fs.mkdirSync(path.join('scratch', 'live-production'), { recursive: true });
  });

  test('verifies the pinned release and cleans up the isolated tenant mutation', async ({ page }) => {
    const versionResponse = await page.request.get(`${liveConfig.baseUrl}/api/platform/version`);
    expect(versionResponse.status()).toBe(200);
    const version = await versionResponse.json();
    expect(String(version.commitSha || '').toLowerCase()).toBe(liveConfig.expectedCommit);

    await page.goto(`${liveConfig.baseUrl}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(async token => {
      if (!window.fire?.auth) throw new Error('Firebase Auth is unavailable in the production shell.');
      await window.fire.auth().signInWithCustomToken(token);
    }, customToken);
    const idToken = await page.evaluate(async () => {
      const user = window.fire?.auth?.().currentUser;
      if (!user) throw new Error('Production Firebase sign-in did not establish a session.');
      return user.getIdToken(true);
    });
    const humanHeaders = {
      Authorization: `Bearer ${idToken}`,
      'x-tenant-id': liveConfig.tenantId,
    };

    const contextResponse = await page.request.get(`${liveConfig.baseUrl}/api/enterprise/context`, { headers: humanHeaders });
    expect(contextResponse.status()).toBe(200);
    const context = await contextResponse.json();
    expect(context.context?.tenantId).toBe(liveConfig.tenantId);
    expect(context.tenant?.id).toBe(liveConfig.tenantId);
    expect(context.tenant?.slug).toBe(liveConfig.tenantSlug);

    const m2mHeaders = { 'x-api-key': liveConfig.m2mKey, 'Content-Type': 'application/json' };
    const m2mContextResponse = await page.request.get(`${liveConfig.baseUrl}/api/enterprise/m2m/context`, { headers: m2mHeaders });
    expect(m2mContextResponse.status()).toBe(200);
    const m2mContext = await m2mContextResponse.json();
    expect(m2mContext.context?.tenantId || m2mContext.tenantId).toBe(liveConfig.tenantId);

    const marker = `production-cert-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    let resourceId = null;
    let cleanupFailure = null;
    try {
      const createResponse = await page.request.post(`${liveConfig.baseUrl}/api/enterprise/resources`, {
        headers: m2mHeaders,
        data: { resourceType: 'resume', payload: { title: marker, certificationMarker: marker } },
      });
      expect(createResponse.status()).toBe(201);
      const created = await createResponse.json();
      resourceId = created.resource?.id;
      expect(resourceId).toMatch(/^[0-9a-f-]{36}$/i);
      expect(created.resource?.tenantId).toBe(liveConfig.tenantId);

      const readResponse = await page.request.get(`${liveConfig.baseUrl}/api/enterprise/resources/${resourceId}`, { headers: m2mHeaders });
      expect(readResponse.status()).toBe(200);
      const read = await readResponse.json();
      expect(read.resource?.payload?.certificationMarker).toBe(marker);

      const forbiddenControlPlane = await page.request.get(`${liveConfig.baseUrl}/api/enterprise/memberships`, { headers: m2mHeaders });
      expect(forbiddenControlPlane.status()).toBe(403);

      for (const viewport of VIEWPORTS) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(`${liveConfig.baseUrl}/enterprise?tenant=${encodeURIComponent(liveConfig.tenantId)}&tab=overview`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.enterprise-shell', { timeout: 30_000 });
        await page.screenshot({
          path: path.join('scratch', 'live-production', `responsive-${viewport.label}.png`),
          fullPage: true,
        });
      }
    } finally {
      if (resourceId) {
        const deleteResponse = await page.request.delete(`${liveConfig.baseUrl}/api/enterprise/resources/${resourceId}`, { headers: m2mHeaders });
        if (deleteResponse.status() !== 204) {
          cleanupFailure = new Error(`Production certification cleanup failed with HTTP ${deleteResponse.status()}.`);
        } else {
          const absentResponse = await page.request.get(`${liveConfig.baseUrl}/api/enterprise/resources/${resourceId}`, { headers: m2mHeaders });
          if (absentResponse.status() !== 404) cleanupFailure = new Error('Production certification cleanup could not verify resource deletion.');
        }
      }
      await page.evaluate(() => window.fire?.auth?.().signOut()).catch(() => {});
      if (cleanupFailure) throw cleanupFailure;
    }
  });
});
