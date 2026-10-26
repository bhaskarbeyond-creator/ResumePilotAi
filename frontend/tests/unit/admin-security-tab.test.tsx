/**
 * Security & audit console — the tab that replaced four panels of invented telemetry.
 *
 * What is pinned here is what an operator is entitled to: the rows the server returned, an
 * explicit "the table is empty" when it returned none, a failure that names its code and
 * request id when the read fails, and a refused privilege change that is reported as a
 * refusal instead of being optimistically applied to the screen.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminSecurityTab } from '@/components/admin/AdminSecurityTab';
import { get, patch } from '@/lib/api-client';

vi.mock('@/lib/api-client', () => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

const mockedGet = vi.mocked(get);
const mockedPatch = vi.mocked(patch);

const eventsPayload = {
  events: [
    {
      id: 'ev-1',
      createdAt: '2026-10-26T04:31:00.000Z',
      severity: 'HIGH',
      action: 'ADMIN_ROLE_CHANGED',
      actorEmail: 'super.admin@resumepilot.test',
      pathname: '/api/admin/users/u-9',
      ipAddress: '203.0.113.9',
      outcome: 'success',
      statusCode: 200,
      requestId: 'rq-events-1',
    },
  ],
  count: 1,
  source: 'MYSQL_SERVER_READ',
};

const directoryPayload = {
  success: true,
  users: [
    { id: 'u-9', email: 'ops.admin@resumepilot.test', displayName: 'Ops Admin', role: 'ADMIN', mfaEnabled: true },
    { id: 'u-10', email: 'candidate@resumepilot.test', displayName: 'Candidate', role: 'USER' },
  ],
  source: 'MYSQL_SERVER_READ',
};

beforeEach(() => {
  mockedGet.mockReset();
  mockedPatch.mockReset();
});

describe('AdminSecurityTab', () => {
  it('renders the security events the endpoint returned, not a sample', async () => {
    mockedGet.mockResolvedValue(eventsPayload);
    render(<AdminSecurityTab />);

    expect(screen.getByRole('status')).toHaveTextContent(/reading security events/i);
    expect(await screen.findByText('ADMIN_ROLE_CHANGED')).toBeInTheDocument();
    expect(screen.getByText('super.admin@resumepilot.test')).toBeInTheDocument();
    expect(screen.getByText('203.0.113.9')).toBeInTheDocument();
    expect(screen.getByText(/1 of 1 events shown/i)).toHaveTextContent('MYSQL_SERVER_READ');
    expect(mockedGet).toHaveBeenCalledWith(
      '/platform/security-events',
      expect.objectContaining({ limit: 100 }),
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it('states that the audit table is empty instead of showing placeholder incidents', async () => {
    mockedGet.mockResolvedValue({ events: [], count: 0, source: 'MYSQL_SERVER_READ' });
    render(<AdminSecurityTab />);

    expect(await screen.findByText('No security event recorded')).toBeInTheDocument();
    expect(screen.queryByText('ADMIN_ROLE_CHANGED')).not.toBeInTheDocument();
  });

  it('reports a 503 with the server code and request id', async () => {
    mockedGet.mockRejectedValue({
      response: {
        status: 503,
        data: { error: { code: 'SECURITY_EVENTS_UNAVAILABLE', message: 'Security telemetry is unavailable.', requestId: 'rq-sec-503' } },
      },
    });
    render(<AdminSecurityTab />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Security telemetry is unavailable.');
    expect(alert).toHaveTextContent('SECURITY_EVENTS_UNAVAILABLE');
    expect(alert).toHaveTextContent('rq-sec-503');
  });

  it('surfaces a refused role change and leaves the stored role untouched', async () => {
    mockedGet.mockResolvedValue(directoryPayload);
    mockedPatch.mockRejectedValue({
      response: {
        status: 409,
        data: {
          error: {
            code: 'ADMIN_TARGET_CHANGED',
            message: 'The target account changed since it was read; reload and retry.',
            requestId: 'rq-role-409',
          },
        },
      },
    });

    render(<AdminSecurityTab />);
    await userEvent.click(screen.getByRole('tab', { name: /staff authority/i }));

    const select = await screen.findByLabelText('Role for ops.admin@resumepilot.test');
    await waitFor(() => expect(screen.getByText('Ops Admin')).toBeInTheDocument());
    await userEvent.selectOptions(select, 'AUDITOR');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('ADMIN_TARGET_CHANGED');
    expect(alert).toHaveTextContent('rq-role-409');
    expect(mockedPatch).toHaveBeenCalledWith('/admin/users/u-9', { role: 'AUDITOR', expectedRole: 'ADMIN' });
    // The select is driven by server data, so the refusal leaves it on the stored role.
    await waitFor(() => expect(select).toHaveValue('ADMIN'));
  });

  it('does not offer a privilege change for a non-staff account', async () => {
    mockedGet.mockResolvedValue(directoryPayload);
    render(<AdminSecurityTab />);
    await userEvent.click(screen.getByRole('tab', { name: /staff authority/i }));

    await screen.findByLabelText('Role for ops.admin@resumepilot.test');
    expect(screen.queryByLabelText('Role for candidate@resumepilot.test')).not.toBeInTheDocument();
  });
});
