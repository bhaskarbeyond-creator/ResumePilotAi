/**
 * Marketplace moderation — the four registries that actually exist.
 *
 * Before this rewrite the tab held invented employer applications (with tax ids and phone
 * numbers), invented spam postings, and "Verify" / "Remove" buttons wired to
 * `/admin/employer-applications/:id/verify` and `/admin/jobs/:id/moderate`, neither of which
 * is a route. Both actions announced success unconditionally.
 *
 * Pinned here: server rows only, the rejection route refuses a short reason locally, the
 * approval path carries `expectedStatus`, a refusal is surfaced, and a job change sends
 * exactly one field because the route rejects a compound body.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminModerationTab } from '@/components/admin/AdminModerationTab';
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

const applications = {
  applications: [
    {
      id: 'app-1',
      companyName: 'Northwind Analytics',
      contactEmail: 'hiring@northwind.test',
      contactPerson: 'R. Mehta',
      status: 'pending',
      submittedAt: '2026-10-24T06:00:00.000Z',
    },
  ],
  count: 1,
  source: 'MYSQL_SERVER_READ',
};

const jobsPayload = {
  jobs: [
    { id: 'job-1', title: 'Staff Data Engineer', company: 'Northwind Analytics', status: 'active', isFeatured: false, applicants: 4 },
  ],
  pagination: { totalItems: 1, totalPages: 1 },
};

beforeEach(() => {
  mockedGet.mockReset();
  mockedPatch.mockReset();
});

describe('AdminModerationTab', () => {
  it('renders the applications the endpoint returned', async () => {
    mockedGet.mockResolvedValue(applications);
    render(<AdminModerationTab />);

    expect(screen.getByRole('tab', { name: /employer applications/i })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('Northwind Analytics')).toBeInTheDocument();
    expect(screen.getByText(/hiring@northwind.test/)).toHaveTextContent('R. Mehta');
    expect(mockedGet).toHaveBeenCalledWith(
      '/admin/employer-applications',
      expect.objectContaining({ limit: 200 }),
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it('says the queue is empty instead of showing invented companies', async () => {
    mockedGet.mockResolvedValue({ applications: [], count: 0 });
    render(<AdminModerationTab />);

    expect(await screen.findByText('No employer application')).toBeInTheDocument();
    expect(screen.queryByText(/Northwind Analytics/)).not.toBeInTheDocument();
  });

  it('reports an unavailable application store with code and request id', async () => {
    mockedGet.mockRejectedValue({
      response: {
        status: 503,
        data: { error: { code: 'EMPLOYER_APPLICATIONS_UNAVAILABLE', message: 'The application store is unavailable.', requestId: 'rq-mod-1' } },
      },
    });
    render(<AdminModerationTab />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('EMPLOYER_APPLICATIONS_UNAVAILABLE');
    expect(alert).toHaveTextContent('rq-mod-1');
  });

  it('sends the approval with its expected status and surfaces a refusal', async () => {
    mockedGet.mockResolvedValue(applications);
    mockedPatch.mockRejectedValue({
      response: {
        status: 409,
        data: { error: { code: 'ADMIN_TARGET_CHANGED', message: 'The application was decided elsewhere.', requestId: 'rq-mod-2' } },
      },
    });

    render(<AdminModerationTab />);
    await userEvent.click(await screen.findByRole('button', { name: /^approve$/i }));

    expect(mockedPatch).toHaveBeenCalledWith('/admin/employer-applications/app-1', {
      status: 'approved',
      expectedStatus: 'pending',
    });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('ADMIN_TARGET_CHANGED');
    expect(screen.queryByText(/employer claim and token revocation were applied/i)).not.toBeInTheDocument();
  });

  it('requires a written reason before a rejection can be sent', async () => {
    mockedGet.mockResolvedValue(applications);
    render(<AdminModerationTab />);

    await userEvent.click(await screen.findByRole('button', { name: /^reject$/i }));
    const reason = screen.getByLabelText(/rejection reason/i);
    const submit = screen.getByRole('button', { name: /confirm rejection/i });
    expect(submit).toBeDisabled();

    await userEvent.type(reason, 'No verifiable business registration.');
    expect(submit).toBeEnabled();

    mockedPatch.mockResolvedValue({ success: true });
    await userEvent.click(submit);
    expect(mockedPatch).toHaveBeenCalledWith('/admin/employer-applications/app-1', {
      status: 'rejected',
      expectedStatus: 'pending',
      reason: 'No verifiable business registration.',
    });
  });

  it('sends exactly one field when featuring a job', async () => {
    mockedGet.mockImplementation(async (url: string) =>
      String(url).startsWith('/admin/jobs') ? jobsPayload : applications,
    );
    mockedPatch.mockResolvedValue({ success: true });

    render(<AdminModerationTab />);
    await userEvent.click(screen.getByRole('tab', { name: /job postings/i }));
    await userEvent.click(await screen.findByRole('button', { name: /^feature$/i }));

    expect(mockedPatch).toHaveBeenCalledWith('/admin/jobs/job-1', {
      isFeatured: true,
      expectedFeatured: false,
    });
    const call = mockedPatch.mock.calls[0];
    expect(call).toBeDefined();
    const body = (call?.[1] ?? {}) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['expectedFeatured', 'isFeatured']);
  });


  it('cancels a rejection without sending anything, then dismisses a success banner', async () => {
    mockedGet.mockResolvedValue(applications);
    mockedPatch.mockResolvedValue({ success: true });
    render(<AdminModerationTab />);

    await userEvent.click(await screen.findByRole('button', { name: /^reject$/i }));
    expect(screen.getByLabelText(/rejection reason/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(screen.queryByLabelText(/rejection reason/i)).not.toBeInTheDocument();
    expect(mockedPatch).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /^approve$/i }));
    const banner = await screen.findByRole('status');
    await userEvent.click(within(banner).getByRole('button', { name: /dismiss/i }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('reports a refused decision with its code and leaves the application on the queue', async () => {
    mockedGet.mockResolvedValue(applications);
    mockedPatch.mockRejectedValue({
      response: { status: 409, data: { error: { code: 'APPLICATION_STATE_CONFLICT', message: 'Decided already' } } },
    });
    render(<AdminModerationTab />);

    await userEvent.click(await screen.findByRole('button', { name: /^approve$/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('APPLICATION_STATE_CONFLICT');
    expect(screen.getByText('Northwind Analytics')).toBeInTheDocument();
  });

});
