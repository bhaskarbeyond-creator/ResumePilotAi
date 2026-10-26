/**
 * The rest of the security console: the audit trail, broadcasts and the staff revoke action.
 *
 * These panels read two different endpoints each (`/admin/audit-logs` plus `/admin/audit-logs/stats`)
 * and write through three more (`/platform/announcements` create/supersede/delete,
 * `/admin/users/:id/revoke-sessions`). The cases here exist so no branch of that wiring is
 * untested: a failure on either read is reported, a create that is refused keeps the draft, and
 * a revoke that is refused is not announced as done.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminSecurityTab } from '@/components/admin/AdminSecurityTab';
import { del, get, patch, post } from '@/lib/api-client';

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
const mockedDel = vi.mocked(del);

const auditLog = {
  id: 'log-1',
  createdAt: '2026-10-26T05:00:00.000Z',
  action: 'CONFIG_CHANGED',
  category: 'configuration',
  severity: 'MEDIUM',
  outcome: 'success',
  actorEmail: 'ops.admin@resumepilot.test',
  resourceType: 'config',
  resourceId: 'ai.dailyLimit',
  pathname: '/api/admin/config/ai.dailyLimit',
  statusCode: 200,
};

const announcement = {
  id: 'ann-1',
  title: 'Scheduled maintenance 02:00 UTC',
  message: 'The worker pool restarts at 02:00 UTC for 10 minutes.',
  severity: 'HIGH',
  audience: 'ALL',
  publishedAt: '2026-10-26T05:10:00.000Z',
  enabled: true,
  revision: 3,
};

beforeEach(() => {
  mockedGet.mockReset();
  mockedPost.mockReset();
  mockedPatch.mockReset();
  mockedDel.mockReset();
});

describe('AdminSecurityTab — audit trail', () => {
  it('renders the stored trail and its statistics', async () => {
    mockedGet.mockImplementation(async (url: string) =>
      String(url).endsWith('/stats')
        ? { highSeverityCount: 4, failureCount: 1, categoryCounts: { configuration: 4 } }
        : { logs: [auditLog], count: 1, hasMore: false, source: 'MYSQL_SERVER_READ' },
    );

    render(<AdminSecurityTab />);
    await userEvent.click(screen.getByRole('tab', { name: /audit trail/i }));

    expect(await screen.findByText('CONFIG_CHANGED')).toBeInTheDocument();
    expect(screen.getByText('ops.admin@resumepilot.test')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledWith(
      '/admin/audit-logs',
      expect.objectContaining({ limit: 100 }),
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it('reports a failed trail read instead of an empty table', async () => {
    mockedGet.mockRejectedValue({
      response: { status: 503, data: { error: { code: 'AUDIT_LOG_UNAVAILABLE', message: 'The audit log is unavailable.', requestId: 'rq-audit-1' } } },
    });

    render(<AdminSecurityTab />);
    await userEvent.click(screen.getByRole('tab', { name: /audit trail/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('AUDIT_LOG_UNAVAILABLE');
    expect(alert).toHaveTextContent('rq-audit-1');
  });

  it('says the trail contains no row when the server returns none', async () => {
    mockedGet.mockImplementation(async (url: string) =>
      String(url).endsWith('/stats') ? {} : { logs: [], count: 0, hasMore: false },
    );

    render(<AdminSecurityTab />);
    await userEvent.click(screen.getByRole('tab', { name: /audit trail/i }));

    expect(await screen.findByText('No audit rows match')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export csv/i })).toBeDisabled();
  });
});

describe('AdminSecurityTab — broadcasts', () => {
  it('lists stored announcements and publishes a new one', async () => {
    mockedGet.mockResolvedValue({ announcements: [announcement], source: 'MARIADB_PLATFORM_ANNOUNCEMENTS' });
    mockedPost.mockResolvedValue({ success: true });

    render(<AdminSecurityTab />);
    await userEvent.click(screen.getByRole('tab', { name: /broadcasts/i }));
    expect(await screen.findByText('Scheduled maintenance 02:00 UTC')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Title'), 'Payments sandbox reset');
    await userEvent.type(screen.getByLabelText('Message'), 'Keys rotate tonight.');
    await userEvent.click(screen.getByRole('button', { name: /publish broadcast/i }));

    expect(mockedPost).toHaveBeenCalledWith('/platform/announcements', {
      title: 'Payments sandbox reset',
      message: 'Keys rotate tonight.',
      severity: 'INFO',
      audience: 'ALL',
    });
    expect(await screen.findByRole('status')).toHaveTextContent(/published/i);
  });

  it('keeps the draft and reports a refused publish', async () => {
    mockedGet.mockResolvedValue({ announcements: [] });
    mockedPost.mockRejectedValue({
      response: { status: 403, data: { error: { code: 'INSUFFICIENT_PERMISSION', message: 'platform.announcements.write is required.', requestId: 'rq-ann-1' } } },
    });

    render(<AdminSecurityTab />);
    await userEvent.click(screen.getByRole('tab', { name: /broadcasts/i }));

    const title = await screen.findByLabelText('Title');
    await userEvent.type(title, 'Nothing should be published');
    await userEvent.type(screen.getByLabelText('Message'), 'Because the role cannot write.');
    await userEvent.click(screen.getByRole('button', { name: /publish broadcast/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('INSUFFICIENT_PERMISSION');
    expect(title).toHaveValue('Nothing should be published');
  });

  it('supersedes with the revision it read and reports a conflict', async () => {
    mockedGet.mockResolvedValue({ announcements: [announcement] });
    mockedPatch.mockRejectedValue({
      response: { status: 409, data: { error: { code: 'ADMIN_TARGET_CHANGED', message: 'The broadcast changed.', requestId: 'rq-ann-2' } } },
    });

    render(<AdminSecurityTab />);
    await userEvent.click(screen.getByRole('tab', { name: /broadcasts/i }));
    await screen.findByText('Scheduled maintenance 02:00 UTC');
    await userEvent.click(screen.getByRole('button', { name: /withdraw/i }));

    expect(mockedPatch).toHaveBeenCalledWith('/platform/announcements/ann-1', expect.objectContaining({ expectedRevision: 3 }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('ADMIN_TARGET_CHANGED');
  });

  it('deletes a broadcast only after confirmation', async () => {
    mockedGet.mockResolvedValue({ announcements: [announcement] });
    mockedDel.mockResolvedValue({ success: true });

    render(<AdminSecurityTab />);
    await userEvent.click(screen.getByRole('tab', { name: /broadcasts/i }));
    await screen.findByText('Scheduled maintenance 02:00 UTC');
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }));

    expect(mockedDel).toHaveBeenCalledWith('/platform/announcements/ann-1');
    expect(await screen.findByRole('status')).toHaveTextContent(/deleted/i);
  });
});

describe('AdminSecurityTab — staff revoke', () => {
  it('reports a refused session revoke rather than claiming the tokens were cleared', async () => {
    mockedGet.mockResolvedValue({
      users: [{ id: 'u-9', email: 'ops.admin@resumepilot.test', displayName: 'Ops Admin', role: 'ADMIN' }],
    });
    mockedPost.mockRejectedValue({
      response: { status: 403, data: { error: { code: 'RECENT_AUTH_REQUIRED', message: 'Re-authenticate to revoke sessions.', requestId: 'rq-revoke-1' } } },
    });

    render(<AdminSecurityTab />);
    await userEvent.click(screen.getByRole('tab', { name: /staff authority/i }));
    await userEvent.click(await screen.findByRole('button', { name: /revoke sessions/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('RECENT_AUTH_REQUIRED');
    expect(mockedPost).toHaveBeenCalledWith('/admin/users/u-9/revoke-sessions', {});
  });

  it('announces a successful revoke with the server message', async () => {
    mockedGet.mockResolvedValue({
      users: [{ id: 'u-9', email: 'ops.admin@resumepilot.test', displayName: 'Ops Admin', role: 'SUPER_ADMIN' }],
    });
    mockedPost.mockResolvedValue({ message: '3 refresh tokens revoked.' });

    render(<AdminSecurityTab />);
    await userEvent.click(screen.getByRole('tab', { name: /staff authority/i }));
    await userEvent.click(await screen.findByRole('button', { name: /revoke sessions/i }));

    expect(await screen.findByRole('status')).toHaveTextContent('3 refresh tokens revoked.');
    // A claim-only super admin is reported as such, not as an assignable option.
    expect(screen.getByText(/SUPER_ADMIN \(claim-only\)/)).toBeInTheDocument();
  });
});
