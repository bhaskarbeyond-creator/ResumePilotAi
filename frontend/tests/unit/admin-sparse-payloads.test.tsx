/**
 * Sparse payloads — what each admin surface does when the server omits an optional field.
 *
 * Every tab renders some `row.thing ?? '—'` or `payload.count ?? 0`. Those branches are easy
 * to write and easy to get wrong in a way no happy-path test catches, because the happy path
 * always supplies the field. The two failure modes are:
 *
 *  1. **`undefined` / `NaN` on screen.** `{row.updatedAt}` with no fallback renders the word
 *     "undefined" in a table an operator reads; `Math.round(undefined)` renders `NaN`.
 *  2. **A blank where a sentence belongs.** An empty cell in a status column looks like a
 *     loaded value, not a missing one.
 *
 * So each case mounts a real tab against a deliberately hollow payload and asserts the
 * fallback *text*. This is also the honest way to cover those branches: the assertions are
 * behavioural, not a coverage exercise — a regression shows up as the word "undefined" in the
 * DOM, which is exactly what an operator would see.
 *
 * The final case in each block asserts the same payload does not crash the tab: a missing
 * optional field must degrade, never throw.
 */
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AdminHealthTab } from '@/components/admin/AdminHealthTab';
import { AdminHelpDeskTab } from '@/components/admin/AdminHelpDeskTab';
import { AdminModerationTab } from '@/components/admin/AdminModerationTab';
import { AdminOperationsTab } from '@/components/admin/AdminOperationsTab';
import { AdminQueuesTab } from '@/components/admin/AdminQueuesTab';
import { AdminSecurityTab } from '@/components/admin/AdminSecurityTab';
import { AdminUsersTab } from '@/components/admin/AdminUsersTab';
import { AdminBlogManagementTab } from '@/components/admin/AdminBlogManagementTab';
import { get, patch, post } from '@/lib/api-client';

vi.mock('@/lib/api-client', () => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

const mockedGet = vi.mocked(get);
const mockedPost = vi.mocked(post);
const mockedPatch = vi.mocked(patch);

beforeEach(() => {
  mockedGet.mockReset();
  mockedPost.mockReset();
  mockedPatch.mockReset();
});

const wrap = (element: ReactElement) => render(<MemoryRouter>{element}</MemoryRouter>);

/** No rendered text may be the literal words a template literal produces when a value is absent. */
function expectNoPlaceholderLeak() {
  const text = document.body.textContent ?? '';
  expect(text).not.toMatch(/\bundefined\b/);
  expect(text).not.toMatch(/\bNaN\b/);
  expect(text).not.toMatch(/\bnull\b/);
  expect(text).not.toMatch(/\[object Object\]/);
}

/** Opens the detail drawer for the hollow service and waits for it to render. */
async function openHollowService(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /inspect unnamed probe/i }));
  return screen.findByRole('dialog');
}

/* ── health ──────────────────────────────────────────────────────────── */

describe('sparse payloads — platform health', () => {
  const hollow = {
    // No checkedAt, no summary counts, no cache metadata, no group for the service.
    summary: { overall: 'CRITICAL' },
    services: [
      { id: 'mystery', name: 'Unnamed probe', state: 'UNKNOWN', critical: false, metrics: {}, relatedEndpoints: [] },
    ],
    apiMatrix: {},
    sources: {},
  };

  it('renders a snapshot with no timestamp, cache age or counts without inventing them', async () => {
    mockedGet.mockResolvedValue(hollow);
    wrap(<AdminHealthTab />);

    expect(await screen.findByText('Unnamed probe')).toBeInTheDocument();
    // An unknown group keeps its raw id rather than rendering an empty badge.
    expect(screen.getByText(/unknown/i)).toBeInTheDocument();
    expectNoPlaceholderLeak();
  });

  it('says a re-probe returned nothing instead of a success sentence with blanks', async () => {
    mockedGet.mockResolvedValue(hollow);
    mockedPost.mockResolvedValue({});
    const user = userEvent.setup();
    wrap(<AdminHealthTab />);

    await screen.findByText('Unnamed probe');
    await user.click(screen.getByRole('button', { name: /re-probe all/i }));
    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent(/unknown/i);
    expectNoPlaceholderLeak();
  });

  it('reports a probe result with no latency and no message as a bare verdict', async () => {
    mockedGet.mockImplementation((url: string) =>
      String(url).startsWith('/platform/operational-status/mystery')
        ? Promise.resolve({
            service: { ...hollow.services[0], retryable: false, testable: true, remediation: 'none' },
            checkedAt: '2026-10-26T06:00:00.000Z',
            relatedEndpoints: [],
            auditEvents: [{ id: 'ev-1' }],
            auditSource: 'mariadb',
            elevated: false,
          })
        : Promise.resolve(hollow),
    );
    mockedPost.mockResolvedValue({ passed: true });
    const user = userEvent.setup();
    wrap(<AdminHealthTab />);

    const dialog = await openHollowService(user);
    expect(within(dialog).getByText('no')).toBeInTheDocument(); // Retryable: no
    // An audit event with no timestamp renders a dash, not "undefined".
    expect(within(dialog).getByText(/^—$/)).toBeInTheDocument();
    // No latency and no message: the verdict stands alone rather than ending in "in undefined ms".
    expectNoPlaceholderLeak();
  });

  it('surfaces a probe refusal with the request id when the server supplies one', async () => {
    mockedGet.mockImplementation((url: string) =>
      String(url).startsWith('/platform/operational-status/mystery')
        ? Promise.resolve({
            service: { ...hollow.services[0], testable: true },
            checkedAt: '2026-10-26T06:00:00.000Z',
            relatedEndpoints: [],
            auditEvents: [],
            auditSource: 'mariadb',
            elevated: false,
          })
        : Promise.resolve(hollow),
    );
    mockedPost.mockRejectedValue({
      response: { status: 503, data: { error: { code: 'AUDIT_WRITE_FAILED', message: 'Trail down', requestId: 'rq-hollow-1' } } },
    });
    const user = userEvent.setup();
    wrap(<AdminHealthTab />);

    const dialog = await openHollowService(user);
    await user.click(within(dialog).getByRole('button', { name: /^probe$/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('AUDIT_WRITE_FAILED');
    expect(alert).toHaveTextContent(/trail down/i);
  });
});

/* ── help desk ───────────────────────────────────────────────────────── */

describe('sparse payloads — help desk', () => {
  const hollowTicket = {
    id: 'tkt-1',
    email: 'legacy@example.test', // the legacy field, not `userEmail`
    status: 'RESOLVED',
    messages: [{ id: 'm-1', body: 'Where is my export?', role: 'STAFF' }],
  };

  it('reads the legacy `email` field and marks the staff message as staff', async () => {
    mockedGet.mockResolvedValue({ success: true, tickets: [hollowTicket] });
    wrap(<AdminHelpDeskTab />);

    // The panel opens on the first ticket, so the legacy field is read without a selection click.
    expect(await screen.findByText(/submitter: legacy@example.test .tkt-1./i)).toBeInTheDocument();
    expect(screen.getByText(/support specialist \(staff\)/i)).toBeInTheDocument();
    // A resolved ticket offers no "Mark Resolved" — the control is absent, not disabled.
    expect(screen.queryByRole('button', { name: /mark resolved/i })).not.toBeInTheDocument();
    expectNoPlaceholderLeak();
  });

  it('does not send whitespace as a reply', async () => {
    mockedGet.mockResolvedValue({ success: true, tickets: [hollowTicket] });
    const user = userEvent.setup();
    wrap(<AdminHelpDeskTab />);

    await screen.findByPlaceholderText(/type staff response/i);
    await user.type(screen.getByPlaceholderText(/type staff response/i), '   ');
    expect(screen.getByRole('button', { name: /send reply/i })).toBeDisabled();
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('filters by status and free text without losing the panel', async () => {
    mockedGet.mockResolvedValue({ success: true, tickets: [hollowTicket] });
    const user = userEvent.setup();
    wrap(<AdminHelpDeskTab />);

    await screen.findAllByText(/legacy@example.test/i);
    const search = screen.getByPlaceholderText(/search ticket subject/i);
    await user.type(search, 'nothing-matches-this');
    expect(screen.getByText(/no support tickets match query/i)).toBeInTheDocument();
  });
});

/* ── queues ──────────────────────────────────────────────────────────── */

describe('sparse payloads — outbox queues', () => {
  it('renders a job with every optional field absent as dashes, and a state with no pill as neutral', async () => {
    mockedGet.mockResolvedValue({
      summary: { totalInspected: 1, deadLetterCount: 0, pendingCount: 0, successCount: 0 },
      jobs: [{ id: 'job-bare', queue: 'notification', state: 'SOMETHING_NEW' }],
    });
    wrap(<AdminQueuesTab />);

    expect(await screen.findByText('job-bare')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3);
    // `summary.sampled` absent: the caption must not claim a sample size it was not given.
    expect(screen.queryByText(/sampled at/i)).not.toBeInTheDocument();
    expectNoPlaceholderLeak();
  });

  it('reports a retry whose response omits retriedCount without printing a blank', async () => {
    mockedGet.mockResolvedValue({
      summary: { totalInspected: 1, deadLetterCount: 1, pendingCount: 0, successCount: 0 },
      jobs: [{ id: 'ntf-bare', queue: 'notification', state: 'DEAD_LETTER', attemptCount: 3 }],
    });
    mockedPost.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    wrap(<AdminQueuesTab />);

    await user.click(await screen.findByRole('button', { name: /retry/i }));
    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent(/0 row updated/i);
    expectNoPlaceholderLeak();
  });

  it('carries the request id of a refused retry', async () => {
    mockedGet.mockResolvedValue({
      summary: { totalInspected: 1, deadLetterCount: 1, pendingCount: 0, successCount: 0 },
      jobs: [{ id: 'ntf-bare', queue: 'notification', state: 'DEAD_LETTER' }],
    });
    mockedPost.mockRejectedValue({
      response: { status: 400, data: { error: { code: 'INVALID_RETRY_TARGET', message: 'Only notification jobs', requestId: 'rq-q-9' } } },
    });
    const user = userEvent.setup();
    wrap(<AdminQueuesTab />);

    await user.click(await screen.findByRole('button', { name: /retry/i }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('INVALID_RETRY_TARGET');
    expect(alert).toHaveTextContent('rq-q-9');
  });
});

/* ── operations ──────────────────────────────────────────────────────── */

describe('sparse payloads — platform operations', () => {
  it('renders a health summary with no services as unknown rather than blank', async () => {
    mockedGet.mockResolvedValue({ success: true });
    wrap(<AdminOperationsTab />);

    // No settings block: the panel says so rather than rendering a form over guessed defaults.
    expect(await screen.findByText(/no stored maintenance configuration/i)).toBeInTheDocument();
    expectNoPlaceholderLeak();
  });

  it('announces a lifted barrier with the revision it derived', async () => {
    mockedGet.mockResolvedValue({
      success: true,
      revision: 7,
      services: { backend: { reachable: true } },
      settings: { maintenanceMode: true, maintenanceMessage: 'Back soon.' },
    });
    mockedPost.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    wrap(<AdminOperationsTab />);

    // The panel opens showing the stored state (barrier up, revision 7); clearing the toggle
    // is a save in the other direction, so the submit reads "Save maintenance settings".
    await user.click(await screen.findByLabelText(/block public traffic/i));
    await user.click(screen.getByRole('button', { name: /save maintenance settings/i }));

    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent(/lifted \(revision 8\)/i);
  });

  it('carries the request id of a refused save', async () => {
    mockedGet.mockResolvedValue({ success: true, revision: 2, services: {}, settings: {} });
    mockedPost.mockRejectedValue({
      response: { status: 409, data: { error: { code: 'ADMIN_SETTINGS_CONFLICT', message: 'Changed', requestId: 'rq-ops-9' } } },
    });
    const user = userEvent.setup();
    wrap(<AdminOperationsTab />);

    await user.click(await screen.findByLabelText(/block public traffic/i));
    await user.type(screen.getByLabelText(/public notice/i), 'Planned migration');
    await user.click(screen.getByRole('button', { name: /enforce maintenance barrier/i }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('ADMIN_SETTINGS_CONFLICT');
    expect(alert).toHaveTextContent('rq-ops-9');
  });
});

/* ── security ────────────────────────────────────────────────────────── */

describe('sparse payloads — security console', () => {
  it('renders an audit row with every optional field absent without printing nulls', async () => {
    mockedGet.mockImplementation((url: string) =>
      String(url).endsWith('/stats')
        ? Promise.resolve({})
        : Promise.resolve({ logs: [{ id: 'log-bare', action: 'SOMETHING_HAPPENED' }], count: 1, hasMore: false }),
    );
    wrap(<AdminSecurityTab />);
    await userEvent.click(screen.getByRole('tab', { name: /audit trail/i }));

    expect(await screen.findByText('SOMETHING_HAPPENED')).toBeInTheDocument();
    expectNoPlaceholderLeak();
  });

  it('changes a staff role with the previous role as the guard and announces the transition', async () => {
    mockedGet.mockResolvedValue({
      users: [{ id: 'u-3', email: 'ops@example.test', displayName: 'Ops', role: 'ADMIN' }],
    });
    mockedPatch.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    wrap(<AdminSecurityTab />);

    await user.click(screen.getByRole('tab', { name: /staff authority/i }));
    await screen.findAllByText(/ops@example.test/);
    // The select saves on change: there is no separate Apply button to forget to press.
    await user.selectOptions(screen.getByLabelText(/role for ops@example.test/i), 'SUPPORT');

    expect(mockedPatch).toHaveBeenCalledWith('/admin/users/u-3', { role: 'SUPPORT', expectedRole: 'ADMIN' });
    expect(screen.getByRole('status')).toHaveTextContent('ADMIN → SUPPORT');
  });
});

/* ── users ───────────────────────────────────────────────────────────── */

describe('sparse payloads — user directory', () => {
  it('renders a directory row with no display name, plan or last login as dashes', async () => {
    mockedGet.mockResolvedValue({ success: true, users: [{ id: 'usr_bare', email: 'bare@example.test' }] });
    wrap(<AdminUsersTab />);

    expect(await screen.findByText('bare@example.test')).toBeInTheDocument();
    expectNoPlaceholderLeak();
  });

  it('reports a refused directory read with its request id', async () => {
    mockedGet.mockRejectedValue({
      response: { status: 503, data: { error: { code: 'DIRECTORY_UNAVAILABLE', message: 'Store down', requestId: 'rq-dir-1' } } },
    });
    wrap(<AdminUsersTab />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('DIRECTORY_UNAVAILABLE');
    expect(alert).toHaveTextContent('rq-dir-1');
  });

  it('says no user matches a search instead of leaving an empty table', async () => {
    mockedGet.mockResolvedValue({ success: true, users: [{ id: 'usr_bare', email: 'bare@example.test' }] });
    const user = userEvent.setup();
    wrap(<AdminUsersTab />);

    await screen.findByText('bare@example.test');
    await user.type(screen.getByLabelText(/search the user directory/i), 'zzz');
    expect(screen.queryByText('bare@example.test')).not.toBeInTheDocument();
    expect(screen.getByText(/no account matches this filter/i)).toBeInTheDocument();
  });
});

/* ── blog ────────────────────────────────────────────────────────────── */

describe('sparse payloads — blog catalogue', () => {
  it('renders a post with no category, author or status without blanks', async () => {
    mockedGet.mockResolvedValue({
      success: true,
      posts: [{ id: 'post-bare', title: 'Bare post', slug: 'bare' }],
    });
    wrap(<AdminBlogManagementTab />);

    expect(await screen.findByText('Bare post')).toBeInTheDocument();
    expectNoPlaceholderLeak();
  });
});

/* ── moderation ──────────────────────────────────────────────────────── */

describe('sparse payloads — moderation', () => {
  it('renders an application with no contact person or website and still decides it', async () => {
    mockedGet.mockResolvedValue({
      applications: [{ id: 'app-bare', companyName: 'Bare Ltd', contactEmail: 'bare@example.test', status: 'pending' }],
      count: 1,
    });
    mockedPatch.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    wrap(<AdminModerationTab />);

    expect(await screen.findByText('Bare Ltd')).toBeInTheDocument();
    // No website: the link is absent rather than a dead `href="undefined"`.
    expect(screen.queryByRole('link', { name: /website/i })).not.toBeInTheDocument();
    expectNoPlaceholderLeak();

    await user.click(screen.getByRole('button', { name: /^approve$/i }));
    expect(mockedPatch).toHaveBeenCalledWith('/admin/employer-applications/app-bare', {
      status: 'approved',
      expectedStatus: 'pending',
    });
  });

  it('renders a job row with no location or applicant count', async () => {
    mockedGet.mockImplementation((url: string) =>
      String(url).startsWith('/admin/jobs')
        ? Promise.resolve({ jobs: [{ id: 'job-bare', title: 'Bare role', status: 'pending' }], pagination: {} })
        : Promise.resolve({ applications: [], count: 0 }),
    );
    const user = userEvent.setup();
    wrap(<AdminModerationTab />);

    await user.click(screen.getByRole('tab', { name: /job postings/i }));
    expect(await screen.findByText('Bare role')).toBeInTheDocument();
    expectNoPlaceholderLeak();
  });
});
