/**
 * Shared harness for the AI Multi-Provider Engine suite.
 *
 * Identity comes from the backend's own non-production preview-login endpoint
 * (`POST /api/auth/preview-login`), which only exists when the local HMAC
 * verifier is enabled. The returned token is stored exactly where the app's
 * preview-session reader looks (`ime_dev_user`), and the app re-verifies it
 * against the backend before rendering any authenticated surface.
 *
 * No credential is hardcoded: the Super Admin role is granted by the SERVER's
 * allowlist (PREVIEW_SUPER_ADMIN_EMAILS in playwright.ai-engine.config.js).
 */

import type { Page, APIRequestContext, BrowserContext } from '@playwright/test';

export const WEB_ORIGIN = process.env.AI_ENGINE_WEB_ORIGIN || 'http://localhost:4000';
export const API_ORIGIN = process.env.AI_ENGINE_API_ORIGIN || 'http://localhost:8080';

export const SUPER_ADMIN_EMAIL = process.env.AI_ENGINE_SUPER_ADMIN_EMAIL || 'ai-engine-super@ime365.test';
export const ADMIN_EMAIL = process.env.AI_ENGINE_ADMIN_EMAIL || 'ai-engine-admin@ime365.test';

export interface Session {
  token: string;
  uid: string;
  email: string;
  displayName: string;
  role: string;
}

/** Authenticate against the real preview-login endpoint. */
export async function mintSession(
  request: APIRequestContext,
  email = SUPER_ADMIN_EMAIL,
  role: 'SUPER_ADMIN' | 'ANY' = 'SUPER_ADMIN',
): Promise<Session> {
  const response = await request.post(`${API_ORIGIN}/api/auth/preview-login`, {
    data: { email, password: 'password123', name: email.split('@')[0] },
  });
  if (!response.ok()) {
    throw new Error(
      `preview-login returned HTTP ${response.status()} — the backend is not running in certification mode ` +
        `(NODE_ENV!=production + TEST_AUTH_HMAC_SECRET). Body: ${(await response.text()).slice(0, 300)}`,
    );
  }
  const body = (await response.json()) as Session;
  if (role === 'SUPER_ADMIN' && body.role !== 'SUPER_ADMIN') {
    throw new Error(
      `${email} authenticated as role "${body.role}", not SUPER_ADMIN. Grant it through the SERVER allowlist: ` +
        `PREVIEW_SUPER_ADMIN_EMAILS must contain ${email} (see playwright.ai-engine.config.js).`,
    );
  }
  return body;
}

/** Store the session where the app's preview-session reader expects it. */
export async function installSession(context: BrowserContext, session: Session): Promise<void> {
  await context.addInitScript((value) => {
    window.localStorage.setItem('ime_dev_user', JSON.stringify(value));
    window.localStorage.setItem('token', value.token);
  }, session);
}

/** Authenticated API helper that hits the REAL backend with the same token. */
export function apiFor(request: APIRequestContext, session: Session) {
  const headers = { Authorization: `Bearer ${session.token}`, Accept: 'application/json' };
  return {
    async get<T>(path: string): Promise<{ status: number; body: T }> {
      const response = await request.get(`${API_ORIGIN}/api${path}`, { headers });
      const text = await response.text();
      let body: unknown = null;
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
      return { status: response.status(), body: body as T };
    },
    async post<T>(path: string, data?: unknown): Promise<{ status: number; body: T }> {
      const response = await request.post(`${API_ORIGIN}/api${path}`, { headers, data });
      const text = await response.text();
      let body: unknown = null;
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
      return { status: response.status(), body: body as T };
    },
  };
}

/** Navigate to a section of the engine console and wait for the shell to settle. */
export async function openEngine(page: Page, section?: string): Promise<void> {
  const url = section ? `${WEB_ORIGIN}/admin/ai-settings?section=${section}` : `${WEB_ORIGIN}/admin/ai-settings`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  if (/\/login/.test(page.url())) {
    throw new Error(
      `Navigation to ${url} was redirected to the login screen. The stored preview session was rejected — ` +
        'check that the backend is running with TEST_AUTH_HMAC_SECRET (certification mode).',
    );
  }
  await page.getByTestId('ai-engine-page').waitFor({ state: 'visible', timeout: 45_000 });
}

/** Assert no element forces horizontal scrolling (mobile parity guard). */
export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return Math.max(0, doc.scrollWidth - doc.clientWidth);
  });
}

export const PROVIDER_IDS = ['nvidia', 'gemini', 'openai', 'groq', 'openrouter', 'deepseek'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

const SECRET_FIELDS: Record<ProviderId, string> = {
  nvidia: 'nvidiaApiKey',
  gemini: 'geminiApiKey',
  openai: 'openaiApiKey',
  groq: 'groqApiKey',
  openrouter: 'openrouterApiKey',
  deepseek: 'deepseekApiKey',
};

const ENABLE_FIELDS: Record<ProviderId, string> = {
  nvidia: 'enableNvidia',
  gemini: 'enableGemini',
  openai: 'enableOpenai',
  groq: 'enableGroq',
  openrouter: 'enableOpenrouter',
  deepseek: 'enableDeepseek',
};

interface MinimalSettings {
  revision: number;
  settings: { provider: string };
  providers: Record<string, { credentialConfigured: boolean }>;
}

/**
 * Store a throwaway credential through the real API so credential-dependent UI
 * (revoke buttons, confirmation dialogs) can be exercised. Returns `false` when
 * the deployment already manages that provider's credential, in which case the
 * caller must not attempt a cleanup.
 */
export async function seedCredential(
  api: ReturnType<typeof apiFor>,
  provider: ProviderId,
): Promise<boolean> {
  const current = await api.get<MinimalSettings>('/admin/ai-settings');
  if (current.body.providers?.[provider]?.credentialConfigured) return false;
  const response = await api.post<{ success?: boolean; revision?: number }>('/admin/ai-settings', {
    provider: current.body.settings.provider,
    [SECRET_FIELDS[provider]]: `certification-${provider}-ui-probe-0123456789abcdef`,
    [ENABLE_FIELDS[provider]]: true,
    expectedRevision: current.body.revision,
  });
  if (response.status !== 200) {
    throw new Error(`could not seed a ${provider} credential: HTTP ${response.status()} ${JSON.stringify(response.body)}`);
  }
  return true;
}

/** Remove a credential previously created by {@link seedCredential}. */
export async function releaseCredential(
  api: ReturnType<typeof apiFor>,
  provider: ProviderId,
): Promise<void> {
  const current = await api.get<MinimalSettings>('/admin/ai-settings');
  if (!current.body.providers?.[provider]?.credentialConfigured) return;
  await api.post('/admin/ai-settings', {
    provider: current.body.settings.provider,
    clearSecrets: { [provider]: true },
    expectedRevision: current.body.revision,
  });
}
