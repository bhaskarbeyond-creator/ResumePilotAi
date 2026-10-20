/**
 * Real-stack arrangement for specs that need job applications (P002 C10).
 *
 * Notification rows are written by backend workflows, so a test that needs
 * notifications performs those workflows through the API:
 *   - the job owner signs in through POST /api/auth/preview-login (the session is
 *     cached in test-results/.auth/owner-<key>.json, shared with messages.spec.ts,
 *     so repeated runs do not spend the auth burst budget of 5 sign-ins a minute);
 *   - scripts/dev-db/arrange-messaging-job.mjs inserts the job rows owned by them.
 *     This is the only step not done through the API: preview identities cannot
 *     hold the `employer` claim that POST /api/employer/jobs requires;
 *   - candidate A applies through POST /api/jobs/:jobId/applications, which writes
 *     A's "Application submitted" notification (and the owner's own row);
 *   - the owner changes the status through PATCH /api/job-applications/:id/status,
 *     which writes A's status notification.
 * removeArranged() deletes every job_e2e_msg_* job with its applications and the
 * notifications that name it.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { APIRequestContext } from '@playwright/test';
import { AUTH_DIR, expect, tokenFor } from './fixtures';

const repoRoot = path.resolve(process.cwd(), '..');
const dbEnv = {
  ...process.env,
  DB_HOST: process.env.E2E_DB_HOST || '127.0.0.1',
  DB_PORT: process.env.E2E_DB_PORT || '3306',
  DB_USER: process.env.E2E_DB_USER || 'root',
  DB_PASSWORD: process.env.E2E_DB_PASSWORD || '',
  DB_NAME: process.env.E2E_DB_NAME || 'ime365_sandbox',
};
const arrangeScript = path.join(repoRoot, 'scripts', 'dev-db', 'arrange-messaging-job.mjs');
const runArrange = (args: string[]) => execFileSync(process.execPath, [arrangeScript, ...args], { env: dbEnv, stdio: 'pipe' }).toString();

export const removeArranged = () => runArrange(['--remove']);

export const JOB = { id: 'job_e2e_msg_riley', title: 'Platform Engineer', company: 'Example Test Co' } as const;
const OWNER = { key: 'riley', email: 'p002.employer@example.test', name: 'Riley Recruiter' } as const;
const SESSION_REUSE_MS = 6 * 24 * 60 * 60 * 1000;

export interface Owner { email: string; name: string; uid: string; token: string }
let signedInOwner: Owner | null = null;
const ownerFile = path.join(AUTH_DIR, `owner-${OWNER.key}.json`);

async function ownerSession(request: APIRequestContext, fresh = false): Promise<Owner> {
  if (signedInOwner && !fresh) return signedInOwner;
  if (!fresh && fs.existsSync(ownerFile)) {
    const saved = JSON.parse(fs.readFileSync(ownerFile, 'utf8')) as Owner & { savedAt: number };
    if (Date.now() - saved.savedAt < SESSION_REUSE_MS) {
      signedInOwner = saved;
      return saved;
    }
  }
  // Preview identities perform no password check; a throw-away value is sent.
  const response = await request.post('/api/auth/preview-login', {
    data: { email: OWNER.email, name: OWNER.name, password: 'e2e-owner-only' },
  });
  expect(response.status(), `preview sign-in for ${OWNER.email}`).toBe(200);
  const body = (await response.json()) as { uid: string; token: string };
  signedInOwner = { email: OWNER.email, name: OWNER.name, uid: body.uid, token: body.token };
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  fs.writeFileSync(ownerFile, JSON.stringify({ ...signedInOwner, savedAt: Date.now() }));
  return signedInOwner;
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Inserts the owner's job row(s); `count` > 1 creates <JOB.id>_01 … _nn. */
async function createJobs(request: APIRequestContext, count: number): Promise<{ owner: Owner; jobIds: string[] }> {
  const args = (uid: string) => ['--create', '--job-id', JOB.id, '--owner-uid', uid, '--title', JOB.title, '--company', JOB.company, '--count', String(count)];
  let owner = await ownerSession(request);
  try {
    runArrange(args(owner.uid));
  } catch (error) {
    // Exit 4: the saved session outlived its user row (a recreated sandbox); signing in provisions it again.
    if ((error as { status?: number }).status !== 4) throw error;
    owner = await ownerSession(request, true);
    runArrange(args(owner.uid));
  }
  const jobIds = count === 1 ? [JOB.id] : Array.from({ length: count }, (_, index) => `${JOB.id}_${String(index + 1).padStart(2, '0')}`);
  return { owner, jobIds };
}

async function applyAsA(request: APIRequestContext, jobId: string): Promise<string> {
  const applied = await request.post(`/api/jobs/${jobId}/applications`, {
    headers: bearer(tokenFor('a')),
    data: {
      fullName: 'Avery Tester',
      phone: '+1 555 0100',
      coverLetter: `I would like to apply for the ${JOB.title} role. This cover letter exists only for the candidate end-to-end suite.`,
    },
  });
  expect(applied.status(), `candidate A applies to ${jobId}`).toBe(201);
  return ((await applied.json()) as { applicationId: string }).applicationId;
}

export interface ArrangedApplication { owner: Owner; applicationId: string }

/**
 * Fresh state, then candidate A applies to one job ("Application submitted").
 * With `interview`, the owner then invites A to interview ("Interview invitation");
 * `spaced` waits past the next whole second first, because created_at has
 * one-second resolution and the feed is ordered by it.
 */
export async function arrangeApplication(request: APIRequestContext, options: { interview?: boolean; spaced?: boolean } = {}): Promise<ArrangedApplication> {
  removeArranged();
  const { owner } = await createJobs(request, 1);
  const applicationId = await applyAsA(request, JOB.id);
  if (options.interview) {
    if (options.spaced) await new Promise((resolve) => setTimeout(resolve, 1_100));
    const moved = await request.patch(`/api/job-applications/${encodeURIComponent(applicationId)}/status`, {
      headers: bearer(owner.token),
      data: { status: 'interview', expectedStatus: 'pending', expectedRevision: 1 },
    });
    expect(moved.status(), 'the job owner invites candidate A to interview').toBe(200);
  }
  return { owner, applicationId };
}

/** Fresh state, then candidate A applies to `count` jobs: `count` "Application submitted" rows. */
export async function arrangeManyApplications(request: APIRequestContext, count: number): Promise<string[]> {
  removeArranged();
  const { jobIds } = await createJobs(request, count);
  const applicationIds: string[] = [];
  for (const jobId of jobIds) applicationIds.push(await applyAsA(request, jobId));
  return applicationIds;
}

export interface ApiNotification { id: string; type: string; title: string; message: string; read: boolean; data?: Record<string, unknown> }

export async function notificationsOf(request: APIRequestContext, token: string): Promise<ApiNotification[]> {
  const response = await request.get('/api/notifications-data', { headers: bearer(token) });
  expect(response.status()).toBe(200);
  return ((await response.json()) as { notifications: ApiNotification[] }).notifications;
}
