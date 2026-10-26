/**
 * Client-side filters across the admin consoles.
 *
 * Filters are small, but they are all conditional branches an operator hits daily: status
 * chips, severity chips, free-text search and the expandable job row. Each case drives the
 * filter and asserts what stays on screen and what disappears — the branch coverage the gate
 * measures is exactly the coverage of "which rows does the operator see".
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminHelpDeskTab } from '@/components/admin/AdminHelpDeskTab';
import { AdminQueuesTab } from '@/components/admin/AdminQueuesTab';
import { AdminSecurityTab } from '@/components/admin/AdminSecurityTab';
import { AdminBlogManagementTab } from '@/components/admin/AdminBlogManagementTab';
import { MemoryRouter } from 'react-router-dom';
import { get } from '@/lib/api-client';

vi.mock('@/lib/api-client', () => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

const mockedGet = vi.mocked(get);

const tickets = {
  success: true,
  tickets: [
    { id: 't-1', userEmail: 'ann@example.test', subject: 'Export is slow', status: 'OPEN', priority: 'NORMAL', createdAt: '2026-10-25T10:00:00.000Z', messages: [] },
    { id: 't-2', userEmail: 'bob@example.test', subject: 'Cannot sign in', status: 'RESOLVED', priority: 'HIGH', createdAt: '2026-10-24T10:00:00.000Z', messages: [] },
    { id: 't-3', userEmail: 'cid@example.test', subject: 'Billing question', status: 'IN_PROGRESS', priority: 'LOW', createdAt: '2026-10-23T10:00:00.000Z', messages: [] },
  ],
};

const queuePayload = {
  summary: { totalInspected: 2, deadLetterCount: 1, pendingCount: 0, successCount: 1, source: 'MARIADB_OUTBOXES', sampled: true, sampleSize: 50 },
  jobs: [
    {
      id: 'ntf-1',
      queue: 'notification',
      channel: 'email',
      recipient: 'ab***@example.test',
      templateType: 'WELCOME',
      state: 'DEAD_LETTER',
      attemptCount: 5,
      lastError: 'SMTP 550',
      createdAt: '2026-10-25T10:00:00.000Z',
      updatedAt: '2026-10-25T10:05:00.000Z',
    },
    {
      id: 'ntf-2',
      queue: 'notification',
      channel: 'email',
      recipient: 'cd***@example.test',
      templateType: 'RESET',
      state: 'DELIVERED',
      attemptCount: 1,
      lastError: null,
      createdAt: '2026-10-24T10:00:00.000Z',
      updatedAt: '2026-10-24T10:05:00.000Z',
    },
  ],
};

beforeEach(() => {
  mockedGet.mockReset();
});

describe('AdminHelpDeskTab — filters', () => {
  it('narrows the queue by status and by search text', async () => {
    mockedGet.mockResolvedValue(tickets);
    render(<AdminHelpDeskTab />);

    // The queue rows are buttons (email + subject); the thread pane keeps the selected
    // ticket, so the row — not the thread heading — is what the filter must hide.
    await screen.findAllByText('Export is slow');

    await userEvent.click(screen.getByRole('button', { name: 'RESOLVED' }));
    expect(screen.getByRole('button', { name: /bob@example.test/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ann@example.test/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cid@example.test/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'ALL' }));
    await userEvent.type(screen.getByPlaceholderText(/search ticket subject/i), 'billing');
    expect(screen.getByRole('button', { name: /cid@example.test/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ann@example.test/ })).not.toBeInTheDocument();

    await userEvent.clear(screen.getByPlaceholderText(/search ticket subject/i));
    await userEvent.type(screen.getByPlaceholderText(/search ticket subject/i), 't-1');
    expect(screen.getByRole('button', { name: /ann@example.test/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /bob@example.test/ })).not.toBeInTheDocument();

    await userEvent.clear(screen.getByPlaceholderText(/search ticket subject/i));
    await userEvent.type(screen.getByPlaceholderText(/search ticket subject/i), 'nothing-matches');
    expect(screen.getByText(/no support tickets match query/i)).toBeInTheDocument();
  });
});

describe('AdminQueuesTab — filters and row detail', () => {
  it('filters by queue and state, expands a job, and dismisses the notice', async () => {
    mockedGet.mockResolvedValue(queuePayload);
    render(<AdminQueuesTab />);

    await screen.findByText('ntf-1');

    await userEvent.click(screen.getByRole('button', { name: 'Settled' }));
    expect(screen.getByText('ntf-2')).toBeInTheDocument();
    expect(screen.queryByText('ntf-1')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Dead letter' }));
    expect(screen.getByText('ntf-1')).toBeInTheDocument();
    expect(screen.queryByText('ntf-2')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Any state' }));
    await userEvent.click(screen.getByRole('button', { name: 'enterprise' }));
    expect(screen.getByText(/no job matches this filter/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'All queues' }));
    await userEvent.click(screen.getByRole('button', { name: 'ntf-1' }));
    expect(screen.getByText(/last error:/i)).toHaveTextContent('SMTP 550');
    expect(screen.getByText(/updated:/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'ntf-1' }));
    expect(screen.queryByText(/last error:/i)).not.toBeInTheDocument();
  });
});

describe('AdminSecurityTab — event filters', () => {
  const events = {
    events: [
      {
        id: 'ev-1',
        createdAt: '2026-10-26T04:00:00.000Z',
        severity: 'HIGH',
        action: 'LOGIN_FAILED',
        actorEmail: 'ann@example.test',
        pathname: '/api/auth/login',
        ipAddress: '203.0.113.1',
        outcome: 'failure',
        statusCode: 401,
        requestId: 'rq-1',
      },
      {
        id: 'ev-2',
        createdAt: '2026-10-26T03:00:00.000Z',
        severity: 'INFO',
        action: 'LOGIN_SUCCEEDED',
        actorEmail: 'bob@example.test',
        pathname: '/api/auth/login',
        ipAddress: '203.0.113.2',
        outcome: 'success',
        statusCode: 200,
        requestId: 'rq-2',
      },
    ],
    count: 2,
    source: 'MYSQL_SERVER_READ',
  };

  it('filters by severity and search text and expands a row for its payload', async () => {
    mockedGet.mockResolvedValue(events);
    render(<AdminSecurityTab />);

    await screen.findByText('LOGIN_FAILED');

    await userEvent.click(screen.getByRole('button', { name: 'INFO' }));
    expect(screen.getByText('LOGIN_SUCCEEDED')).toBeInTheDocument();
    expect(screen.queryByText('LOGIN_FAILED')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'ALL' }));
    await userEvent.type(screen.getByPlaceholderText(/filter action, actor/i), 'bob@example.test');
    expect(screen.getByText('LOGIN_SUCCEEDED')).toBeInTheDocument();
    expect(screen.queryByText('LOGIN_FAILED')).not.toBeInTheDocument();

    await userEvent.clear(screen.getByPlaceholderText(/filter action, actor/i));
    await userEvent.click(screen.getByRole('button', { name: 'LOGIN_FAILED' }));
    expect(screen.getByText(/rq-1/)).toBeInTheDocument();
    expect(screen.getByText(/"outcome": "failure"/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'LOGIN_FAILED' }));
    expect(screen.queryByText(/"outcome": "failure"/)).not.toBeInTheDocument();
  });
});

describe('AdminBlogManagementTab — filters', () => {
  it('narrows the catalogue by status and search text', async () => {
    mockedGet.mockResolvedValue({
      success: true,
      posts: [
        { id: 'p-1', title: 'Published guide', slug: 'published-guide', category: 'Career', status: 'published', publishedAt: '2026-10-20', revision: 1 },
        { id: 'p-2', title: 'Draft notes', slug: 'draft-notes', category: 'Career', status: 'draft', publishedAt: '', revision: 1 },
      ],
    });
    render(
      <MemoryRouter>
        <AdminBlogManagementTab />
      </MemoryRouter>,
    );

    await screen.findByText('Published guide');

    await userEvent.click(screen.getByRole('button', { name: 'DRAFT' }));
    expect(screen.getByText('Draft notes')).toBeInTheDocument();
    expect(screen.queryByText('Published guide')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'ALL' }));
    await userEvent.type(screen.getByPlaceholderText(/search article titles/i), 'published');
    expect(screen.getByText('Published guide')).toBeInTheDocument();
    expect(screen.queryByText('Draft notes')).not.toBeInTheDocument();

    await userEvent.clear(screen.getByPlaceholderText(/search article titles/i));
    await userEvent.type(screen.getByPlaceholderText(/search article titles/i), 'zzz');
    expect(screen.getByText('No articles found.')).toBeInTheDocument();
  });
});
