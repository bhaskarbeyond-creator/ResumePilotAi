/**
 * Outbox / dead-letter console.
 *
 * The tab used to render three invented queues, twelve invented jobs and a dead-letter list
 * with two invented failures, plus a "Purge dead letters" button whose endpoint answers `410`
 * by design and a "Retry all" whose endpoint only accepts one notification job at a time.
 *
 * Pinned here: the sample is the server's and says it is a sample, an enterprise dead letter
 * offers no platform retry (the route refuses it with `400 INVALID_RETRY_TARGET`), a refused
 * retry is reported, and a successful retry asks for exactly the documented body.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminQueuesTab } from '@/components/admin/AdminQueuesTab';
import { get, post } from '@/lib/api-client';

vi.mock('@/lib/api-client', () => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

const mockedGet = vi.mocked(get);
const mockedPost = vi.mocked(post);

const payload = {
  summary: {
    totalInspected: 3,
    deadLetterCount: 2,
    pendingCount: 1,
    successCount: 0,
    source: 'MARIADB_OUTBOXES',
    sampled: true,
    sampleSize: 50,
  },
  jobs: [
    {
      id: 'ntf-1',
      queue: 'notification',
      channel: 'email',
      recipient: 'ab***@example.test',
      templateType: 'APPLICATION_RECEIVED',
      state: 'DEAD_LETTER',
      attemptCount: 5,
      lastError: 'SMTP 550 mailbox unavailable',
      createdAt: '2026-10-25T10:00:00.000Z',
      updatedAt: '2026-10-25T10:05:00.000Z',
    },
    {
      id: 'ent-1',
      queue: 'enterprise',
      channel: 'webhook',
      recipient: 'tenant-42',
      templateType: 'MEMBERSHIP_CHANGED',
      state: 'DEAD_LETTER',
      attemptCount: 3,
      lastError: 'tenant endpoint returned 502',
      createdAt: '2026-10-25T09:00:00.000Z',
      updatedAt: '2026-10-25T09:30:00.000Z',
    },
    {
      id: 'ntf-2',
      queue: 'notification',
      channel: 'email',
      recipient: 'cd***@example.test',
      templateType: 'PASSWORD_RESET',
      state: 'DELIVERED',
      attemptCount: 1,
      lastError: null,
      createdAt: '2026-10-25T08:00:00.000Z',
      updatedAt: '2026-10-25T08:00:30.000Z',
    },
  ],
};

beforeEach(() => {
  mockedGet.mockReset();
  mockedPost.mockReset();
});

describe('AdminQueuesTab', () => {
  it('renders the sampled outbox rows and states that the sample is not the backlog', async () => {
    mockedGet.mockResolvedValue(payload);
    render(<AdminQueuesTab />);

    expect(screen.getByRole('status')).toHaveTextContent(/reading the outboxes/i);
    expect(await screen.findByText('ntf-1')).toBeInTheDocument();
    expect(screen.getByText('ent-1')).toBeInTheDocument();
    expect(screen.getByText('ab***@example.test')).toBeInTheDocument();
    expect(screen.getByText('MARIADB_OUTBOXES', { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/sampled: the newest 50 rows per outbox, not the whole backlog/i)).toBeInTheDocument();
    expect(screen.getByText(/bulk purge is retired by design/i)).toBeInTheDocument();
  });

  it('offers a platform retry only for a notification dead letter, never for enterprise', async () => {
    mockedGet.mockResolvedValue(payload);
    render(<AdminQueuesTab />);

    const enterprise = (await screen.findByText('ent-1')).closest('tr');
    const notification = screen.getByText('ntf-1').closest('tr');
    expect(enterprise).not.toBeNull();
    expect(notification).not.toBeNull();

    expect(within(enterprise as HTMLElement).getByText(/replay from tenant context/i)).toBeInTheDocument();
    expect(within(enterprise as HTMLElement).queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
    expect(within(notification as HTMLElement).getByRole('button', { name: /retry/i })).toBeInTheDocument();
    // A delivered notification is settled: no retry offered.
    const delivered = screen.getByText('ntf-2').closest('tr') as HTMLElement;
    expect(within(delivered).queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
  });

  it('retries one notification job with the documented body', async () => {
    mockedGet.mockResolvedValue(payload);
    mockedPost.mockResolvedValue({ success: true, retriedCount: 1, jobId: 'ntf-1', queue: 'notification' });

    render(<AdminQueuesTab />);
    await userEvent.click(await screen.findByRole('button', { name: /retry/i }));

    expect(mockedPost).toHaveBeenCalledWith('/platform/queues/retry', { jobId: 'ntf-1', queue: 'notification' });
    expect(await screen.findByRole('status')).toHaveTextContent(/ntf-1 re-queued/i);
  });

  it('reports a refused retry with code and request id', async () => {
    mockedGet.mockResolvedValue(payload);
    mockedPost.mockRejectedValue({
      response: {
        status: 404,
        data: { error: { code: 'DEAD_LETTER_NOT_FOUND', message: 'That dead letter no longer exists.', requestId: 'rq-q-1' } },
      },
    });

    render(<AdminQueuesTab />);
    await userEvent.click(await screen.findByRole('button', { name: /retry/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('DEAD_LETTER_NOT_FOUND');
    expect(alert).toHaveTextContent('rq-q-1');
  });

  it('reports an unavailable outbox rather than showing an empty healthy queue', async () => {
    mockedGet.mockRejectedValue({
      response: {
        status: 503,
        data: { error: { code: 'QUEUE_QUERY_UNAVAILABLE', message: 'Outbox telemetry is unavailable.', requestId: 'rq-q-503' } },
      },
    });
    render(<AdminQueuesTab />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('QUEUE_QUERY_UNAVAILABLE');
    expect(screen.queryByText(/nothing is waiting/i)).not.toBeInTheDocument();
  });

  it('says nothing is queued when both outboxes answered with no rows', async () => {
    mockedGet.mockResolvedValue({
      summary: { totalInspected: 0, deadLetterCount: 0, pendingCount: 0, successCount: 0, source: 'MARIADB_OUTBOXES', sampled: true, sampleSize: 50 },
      jobs: [],
    });
    render(<AdminQueuesTab />);

    expect(await screen.findByText('No outbox rows')).toBeInTheDocument();
  });
});
