/**
 * Platform operations — the maintenance barrier and what replaced the backup fiction.
 *
 * The tab used to announce "MariaDB hot backup snapshot completed successfully" after a
 * timer, for a route that does not exist. Pinned here: the maintenance save is revision
 * guarded and reports the server's answer or its refusal; the runbook notice is what the
 * page shows instead of the removed backup and cache-purge controls; the configuration
 * summary is the health-summary payload, not a local constant.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminOperationsTab } from '@/components/admin/AdminOperationsTab';
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

const summary = {
  success: true,
  checkedAt: '2026-10-26T06:00:00.000Z',
  revision: 4,
  services: {
    backend: { reachable: true },
    database: { engine: 'mariadb', authoritative: true },
    firebaseAdmin: { configured: true },
    aiProviders: { gemini: { configured: true }, openai: { configured: false } },
    payments: { stripe: { configured: true }, razorpay: { configured: false } },
  },
  settings: { maintenanceMode: false, maintenanceMessage: '' },
};

beforeEach(() => {
  mockedGet.mockReset();
  mockedPost.mockReset();
});

describe('AdminOperationsTab', () => {
  it('renders the service configuration the health summary reported', async () => {
    mockedGet.mockResolvedValue(summary);
    render(<AdminOperationsTab />);

    expect(screen.getByRole('status')).toHaveTextContent(/reading the health summary/i);
    expect(await screen.findByText('mariadb (authoritative)')).toBeInTheDocument();
    // Both provider rows report the same "1 of 2" count — one for AI, one for payments.
    expect(screen.getAllByText('1 of 2 configured')).toHaveLength(2);
    expect(screen.getByText('2026-10-26T06:00:00.000Z')).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledWith('/admin/health-summary', undefined, expect.objectContaining({ signal: expect.anything() }));
  });

  it('saves the maintenance barrier with the revision it read', async () => {
    mockedGet.mockResolvedValue(summary);
    mockedPost.mockResolvedValue({ success: true, revision: 5 });

    render(<AdminOperationsTab />);
    await userEvent.click(await screen.findByLabelText(/block public traffic/i));
    await userEvent.type(screen.getByLabelText('Public notice'), 'Back at 03:00 UTC.');
    await userEvent.click(screen.getByRole('button', { name: /enforce maintenance barrier/i }));

    expect(mockedPost).toHaveBeenCalledWith('/admin/system-health-settings', {
      maintenanceMode: true,
      maintenanceMessage: 'Back at 03:00 UTC.',
      expectedRevision: 4,
    });
    expect(await screen.findByRole('status')).toHaveTextContent(/maintenance barrier is active \(revision 5\)/i);
  });

  it('reports a refused save with code and request id and keeps the buffer', async () => {
    mockedGet.mockResolvedValue(summary);
    mockedPost.mockRejectedValue({
      response: {
        status: 409,
        data: {
          error: {
            code: 'ADMIN_SETTINGS_CONFLICT',
            message: 'Health settings changed after this panel loaded. Refresh before saving.',
            requestId: 'rq-ops-1',
          },
        },
      },
    });

    render(<AdminOperationsTab />);
    await userEvent.click(await screen.findByLabelText(/block public traffic/i));
    const noticeBox = screen.getByLabelText('Public notice');
    await userEvent.type(noticeBox, 'Still saving this text.');
    await userEvent.click(screen.getByRole('button', { name: /enforce maintenance barrier/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('ADMIN_SETTINGS_CONFLICT');
    expect(alert).toHaveTextContent('rq-ops-1');
    expect(noticeBox).toHaveValue('Still saving this text.');
  });

  it('says why there is no backup or cache-purge button', async () => {
    mockedGet.mockResolvedValue(summary);
    render(<AdminOperationsTab />);

    expect(await screen.findByText(/backup & cache invalidation/i)).toBeInTheDocument();
    expect(screen.getByText(/runbook, not console/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /trigger live hot backup/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /purge node caches/i })).not.toBeInTheDocument();
    // The claim is traceable: both dead routes are named.
    expect(screen.getByText(/OI-OPS-1/)).toBeInTheDocument();
  });

  it('reports an unreadable health summary instead of guessing settings', async () => {
    mockedGet.mockRejectedValue({
      response: {
        status: 503,
        data: { error: { code: 'HEALTH_UNAVAILABLE', message: 'Unable to read service health configuration.', requestId: 'rq-ops-2' } },
      },
    });
    render(<AdminOperationsTab />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('HEALTH_UNAVAILABLE');
    await waitFor(() => expect(screen.queryByLabelText(/block public traffic/i)).not.toBeInTheDocument());
  });
});
