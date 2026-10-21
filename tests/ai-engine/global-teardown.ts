/**
 * Restores the AI provider credential state captured by `global-setup.ts`.
 *
 * Runs even when tests fail, so a red run cannot poison the next one. Only
 * credentials are restored — routing policy and models are left as the tests
 * found them, because the tests already restore those themselves and a blanket
 * rewrite here would mask a genuine failure to do so.
 */

import fs from 'node:fs';
import path from 'node:path';

import { API_ORIGIN, SUPER_ADMIN_EMAIL, PROVIDER_IDS } from './helpers';

const BASELINE_FILE = path.join(process.cwd(), 'test-results', 'ai-engine', 'baseline.json');

interface Baseline {
  revision: number;
  providers: Record<string, { credentialConfigured: boolean }>;
}

export default async function globalTeardown() {
  if (!fs.existsSync(BASELINE_FILE)) return;
  const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')) as Baseline;

  const login = await fetch(`${API_ORIGIN}/api/auth/preview-login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: SUPER_ADMIN_EMAIL, password: 'password123' }),
  }).catch(() => null);
  if (!login?.ok) return;
  const token = ((await login.json()) as { token: string }).token;
  const authHeaders = { Authorization: `Bearer ${token}` };

  const settingsResponse = await fetch(`${API_ORIGIN}/api/admin/ai-settings`, { headers: authHeaders });
  if (!settingsResponse.ok) return;
  const current = (await settingsResponse.json()) as {
    revision: number;
    settings: { provider: string };
    providers: Record<string, { credentialConfigured: boolean }>;
  };

  // Anything configured now that the baseline says was not configured is
  // residue: remove it in one revisioned write.
  const strayed = PROVIDER_IDS.filter(
    (id) =>
      current.providers?.[id]?.credentialConfigured === true &&
      baseline.providers?.[id]?.credentialConfigured === false,
  );
  if (!strayed.length) return;

  await fetch(`${API_ORIGIN}/api/admin/ai-settings`, {
    method: 'POST',
    headers: { ...authHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({
      provider: current.settings.provider,
      clearSecrets: Object.fromEntries(strayed.map((id) => [id, true])),
      expectedRevision: current.revision,
    }),
  });
}
