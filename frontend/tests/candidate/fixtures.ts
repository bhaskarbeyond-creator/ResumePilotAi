/**
 * Shared fixtures for the Candidate Dashboard suite.
 *
 * - Two disposable test identities on the reserved `.test` TLD (never real
 *   people). Each signs in through the real login form in auth.setup.ts; the
 *   backend issues the session. Nothing here fabricates a session.
 * - `apiAs(account)`: an API client carrying that account's server-issued token,
 *   for arranging and cleaning up data through the same public endpoints the UI
 *   uses (real Express -> MariaDB path).
 * - `guard`: fails a test on unexpected console errors, page errors and failed
 *   /api responses. Failure-path tests declare the statuses they expect.
 */
import fs from 'node:fs';
import { test as base, expect, type APIRequestContext, type Page, type Response } from '@playwright/test';

export const ACCOUNTS = {
  a: { key: 'candidate-a', email: 'p002.candidate.a@example.test', name: 'Avery Tester' },
  b: { key: 'candidate-b', email: 'p002.candidate.b@example.test', name: 'Blake Tester' },
} as const;
export type AccountKey = keyof typeof ACCOUNTS;

export const AUTH_DIR = 'test-results/.auth';
export const storageStatePath = (account: AccountKey) => `${AUTH_DIR}/${ACCOUNTS[account].key}.json`;

/** Read the server-issued preview token saved by auth.setup.ts for an account. */
export function tokenFor(account: AccountKey): string {
  const state = JSON.parse(fs.readFileSync(storageStatePath(account), 'utf8')) as {
    origins: Array<{ localStorage: Array<{ name: string; value: string }> }>;
  };
  for (const origin of state.origins) {
    const entry = origin.localStorage.find((item) => item.name === 'ime_dev_user');
    if (entry) {
      const token = (JSON.parse(entry.value) as { token?: string }).token;
      if (token) return token;
    }
  }
  throw new Error(`No session token stored for ${account}; did the setup project run?`);
}

/** The uid the server issued with that account's session (saved by auth.setup.ts). */
export function uidFor(account: AccountKey): string {
  const state = JSON.parse(fs.readFileSync(storageStatePath(account), 'utf8')) as {
    origins: Array<{ localStorage: Array<{ name: string; value: string }> }>;
  };
  for (const origin of state.origins) {
    const entry = origin.localStorage.find((item) => item.name === 'ime_dev_user');
    if (entry) {
      const uid = (JSON.parse(entry.value) as { uid?: string }).uid;
      if (uid) return uid;
    }
  }
  throw new Error(`No session uid stored for ${account}; did the setup project run?`);
}

export interface ApiClient {
  get<T = unknown>(path: string): Promise<{ status: number; body: T }>;
  post<T = unknown>(path: string, data?: unknown): Promise<{ status: number; body: T }>;
  del<T = unknown>(path: string): Promise<{ status: number; body: T }>;
}

function apiClientFor(request: APIRequestContext, token: string): ApiClient {
  const headers = { Authorization: `Bearer ${token}` };
  const parse = async <T>(response: Awaited<ReturnType<APIRequestContext['get']>>) => {
    const text = await response.text();
    let body: unknown = text;
    try { body = JSON.parse(text); } catch { /* non-JSON body */ }
    return { status: response.status(), body: body as T };
  };
  return {
    get: async (path) => parse(await request.get(`/api${path}`, { headers })),
    post: async (path, data) => parse(await request.post(`/api${path}`, { headers, data: data ?? {} })),
    del: async (path) => parse(await request.delete(`/api${path}`, { headers })),
  };
}

export interface Guard {
  /** Allow failed /api responses matching these statuses for the rest of the test. */
  expectApiStatuses(...statuses: number[]): void;
  /** Allow console errors matching this pattern (e.g. the browser's own log of an expected 4xx). */
  allowConsole(pattern: RegExp): void;
}

interface Fixtures {
  apiAs: (account: AccountKey) => ApiClient;
  guard: Guard;
}

export const test = base.extend<Fixtures>({
  apiAs: async ({ request }, use) => {
    await use((account) => apiClientFor(request, tokenFor(account)));
  },
  guard: [async ({ page }, use, testInfo) => {
    const expectedStatuses = new Set<number>();
    const allowedConsole: RegExp[] = [/Download the React DevTools/];
    const problems: string[] = [];

    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      const text = message.text();
      // The browser logs failed requests itself; those are judged by status below.
      if (/Failed to load resource: the server responded with a status of (\d+)/.test(text)) {
        const status = Number(/status of (\d+)/.exec(text)?.[1]);
        if (expectedStatuses.has(status)) return;
      }
      // Third-party font CDNs are unreachable in the sandbox; never an app defect.
      if (/fonts\.(googleapis|gstatic)\.com/.test(text) || /net::ERR_(NAME_NOT_RESOLVED|CONNECTION|TIMED_OUT|TUNNEL)/.test(text)) return;
      if (allowedConsole.some((pattern) => pattern.test(text))) return;
      problems.push(`console.error: ${text}`);
    });
    page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
    page.on('response', (response: Response) => {
      const url = new URL(response.url());
      if (!url.pathname.startsWith('/api/')) return;
      const status = response.status();
      if (status >= 400 && !expectedStatuses.has(status)) {
        problems.push(`HTTP ${status} ${response.request().method()} ${url.pathname}`);
      }
    });

    await use({
      expectApiStatuses: (...statuses) => statuses.forEach((status) => expectedStatuses.add(status)),
      allowConsole: (pattern) => allowedConsole.push(pattern),
    });

    if (problems.length) {
      await testInfo.attach('console-and-network-problems', { body: problems.join('\n'), contentType: 'text/plain' });
    }
    expect(problems, 'unexpected console/page/network errors').toEqual([]);
  }, { auto: true }],
});

export { expect };

/** The document must not scroll horizontally at the current viewport. */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, `horizontal overflow: scrollWidth ${scrollWidth} > viewport ${innerWidth}`).toBeLessThanOrEqual(innerWidth);
}

/** Viewports below Tailwind's `lg` breakpoint render the off-canvas navigation. */
export const isCompact = (page: Page) => (page.viewportSize()?.width ?? 1920) < 1024;
