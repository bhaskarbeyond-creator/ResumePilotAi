/**
 * Baseline capture for the AI engine suite.
 *
 * These tests deliberately create and revoke provider credentials to exercise
 * the real write path. When a run is aborted mid-test, a seeded credential can
 * survive and make the NEXT run's assertions disagree with the server — a false
 * failure that looks like a product bug.
 *
 * This setup records the credential state before any test touches it; the
 * teardown restores exactly that baseline, and also clears residue left by an
 * earlier aborted run. Nothing outside the six AI provider credentials is
 * touched, and every change goes through the real revisioned API.
 */

import fs from 'node:fs';
import path from 'node:path';

import { API_ORIGIN, SUPER_ADMIN_EMAIL, PROVIDER_IDS } from './helpers';

const BASELINE_FILE = path.join(process.cwd(), 'test-results', 'ai-engine', 'baseline.json');

interface ProviderSnapshot {
  credentialConfigured: boolean;
  enabled: boolean;
}

interface Baseline {
  revision: number;
  providers: Record<string, ProviderSnapshot>;
}

async function mintToken(): Promise<string> {
  const response = await fetch(`${API_ORIGIN}/api/auth/preview-login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: SUPER_ADMIN_EMAIL, password: 'password123', name: 'ai-engine-super' }),
  });
  if (!response.ok) {
    throw new Error(
      `preview-login failed with HTTP ${response.status()}. The backend must run with NODE_ENV!=production ` +
        'and TEST_AUTH_HMAC_SECRET (see playwright.ai-engine.config.js webServer env).',
    );
  }
  const body = (await response.json()) as { token: string };
  return body.token;
}

export async function readSettings(token: string) {
  const response = await fetch(`${API_ORIGIN}/api/admin/ai-settings`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`GET /api/admin/ai-settings failed with HTTP ${response.status}`);
  return (await response.json()) as {
    revision: number;
    settings: { provider: string };
    providers: Record<string, ProviderSnapshot & { credentialConfigured: boolean }>;
  };
}

export default async function globalSetup() {
  const token = await mintToken();

  // 1. Heal residue from an aborted run FIRST: any credential that the previous
  //    run's baseline says was absent must not be present now.
  const previousRaw = fs.existsSync(BASELINE_FILE) ? fs.readFileSync(BASELINE_FILE, 'utf8') : null;
  if (previousRaw) {
    try {
      const previous = JSON.parse(previousRaw) as Baseline;
      const current = await readSettings(token);
      const strayed = PROVIDER_IDS.filter(
        (id) =>
          current.providers?.[id]?.credentialConfigured === true &&
          previous.providers?.[id]?.credentialConfigured === false,
      );
      if (strayed.length) {
        await fetch(`${API_ORIGIN}/api/admin/ai-settings`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            provider: current.settings.provider,
            clearSecrets: Object.fromEntries(strayed.map((id) => [id, true])),
            expectedRevision: current.revision,
          }),
        });
      }
    } catch {
      // A corrupt or unreadable baseline must never block the run; the teardown
      // restores whatever is captured below.
    }
  }

  // 2. Capture the (now clean) baseline that the teardown will restore.
  const clean = await readSettings(token);
  const baseline: Baseline = {
    revision: clean.revision,
    providers: Object.fromEntries(
      PROVIDER_IDS.map((id) => [
        id,
        {
          credentialConfigured: clean.providers?.[id]?.credentialConfigured === true,
          enabled: clean.providers?.[id]?.enabled === true,
        },
      ]),
    ),
  };
  fs.mkdirSync(path.dirname(BASELINE_FILE), { recursive: true });
  fs.writeFileSync(BASELINE_FILE, JSON.stringify(baseline, null, 2));
  process.env.AI_ENGINE_BASELINE_REVISION = String(baseline.revision);
}
