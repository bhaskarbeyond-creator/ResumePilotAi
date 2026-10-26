/**
 * The registries and the job actions in the moderation tab.
 *
 * Grouped separately from the application-approval cases: these panels are read-only views of
 * two different endpoints (the company registry and the tenant registry scoped to the operator)
 * plus the single-field job writes. The cases exist so the empty and failed variants of each
 * panel are pinned too — an empty registry that says so is a different product than an empty
 * registry that silently looks like a full one.
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

const EMPTY = { applications: [], count: 0, source: 'MYSQL_SERVER_READ' };

const job = {
  id: 'job-9',
  title: 'Platform Engineer',
  company: 'Contoso',
  location: 'Remote',
  status: 'pending',
  isFeatured: false,
  applicants: 2,
};

beforeEach(() => {
  mockedGet.mockReset();
  mockedPatch.mockReset();
});

describe('AdminModerationTab — job postings', () => {
  it('changes status with the expected status guard', async () => {
    mockedGet.mockImplementation(async (url: string) =>
      String(url).startsWith('/admin/jobs')
        ? { jobs: [job], pagination: { totalItems: 1, totalPages: 1 } }
        : EMPTY,
    );
    mockedPatch.mockResolvedValue({ success: true });

    render(<AdminModerationTab />);
    await userEvent.click(screen.getByRole('tab', { name: /job postings/i }));
    const row = (await screen.findByText('Platform Engineer')).closest('tr') as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: /archive/i }));

    // The row action is one field plus the guard the route demands.
    expect(mockedPatch).toHaveBeenCalledWith('/admin/jobs/job-9', {
      status: 'archived',
      expectedStatus: 'pending',
    });
    expect(await screen.findByRole('status')).toHaveTextContent(/set to archived/i);
  });

  it('restores an archived posting with the same one-field contract', async () => {
    mockedGet.mockImplementation(async (url: string) =>
      String(url).startsWith('/admin/jobs')
        ? { jobs: [{ ...job, status: 'archived' }], pagination: { totalItems: 1, totalPages: 1 } }
        : EMPTY,
    );
    mockedPatch.mockResolvedValue({ success: true });

    render(<AdminModerationTab />);
    await userEvent.click(screen.getByRole('tab', { name: /job postings/i }));
    const row = (await screen.findByText('Platform Engineer')).closest('tr') as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: /restore/i }));

    expect(mockedPatch).toHaveBeenCalledWith('/admin/jobs/job-9', {
      status: 'active',
      expectedStatus: 'archived',
    });
  });

  it('reports a refused job write with the server code', async () => {
    mockedGet.mockImplementation(async (url: string) =>
      String(url).startsWith('/admin/jobs')
        ? { jobs: [job], pagination: { totalItems: 1, totalPages: 1 } }
        : EMPTY,
    );
    mockedPatch.mockRejectedValue({
      response: { status: 409, data: { error: { code: 'ADMIN_TARGET_CHANGED', message: 'The job changed.', requestId: 'rq-job-1' } } },
    });

    render(<AdminModerationTab />);
    await userEvent.click(screen.getByRole('tab', { name: /job postings/i }));
    const row = (await screen.findByText('Platform Engineer')).closest('tr') as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: /feature/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('ADMIN_TARGET_CHANGED');
    expect(alert).toHaveTextContent('rq-job-1');
  });

  it('says no posting matches the filter when the server returns none', async () => {
    mockedGet.mockImplementation(async (url: string) =>
      String(url).startsWith('/admin/jobs') ? { jobs: [], pagination: { totalItems: 0, totalPages: 0 } } : EMPTY,
    );

    render(<AdminModerationTab />);
    await userEvent.click(screen.getByRole('tab', { name: /job postings/i }));
    expect(await screen.findByText('No job posting')).toBeInTheDocument();
  });
});

describe('AdminModerationTab — company registry', () => {
  it('lists companies from the admin registry', async () => {
    mockedGet.mockImplementation(async (url: string) =>
      String(url).startsWith('/admin/companies')
        ? { companies: [{ id: 'co-1', displayName: 'Contoso Ltd', domain: 'contoso.test', verified: true }], source: 'MYSQL_SERVER_READ' }
        : EMPTY,
    );

    render(<AdminModerationTab />);
    await userEvent.click(screen.getByRole('tab', { name: /company registry/i }));

    expect(await screen.findByText('Contoso Ltd')).toBeInTheDocument();
    expect(screen.getByText('verified')).toBeInTheDocument();
    expect(screen.getByText(/1 companies · source MYSQL_SERVER_READ/i)).toBeInTheDocument();
  });

  it('says the registry is empty rather than showing invented companies', async () => {
    mockedGet.mockImplementation(async () => ({ companies: [], source: 'MYSQL_SERVER_READ' }));

    render(<AdminModerationTab />);
    await userEvent.click(screen.getByRole('tab', { name: /company registry/i }));
    expect(await screen.findByText('No company registered')).toBeInTheDocument();
  });
});

describe('AdminModerationTab — organizations', () => {
  it('lists the tenants this operator can see and says the scope is not platform-wide', async () => {
    mockedGet.mockImplementation(async (url: string) =>
      String(url).startsWith('/enterprise/tenants')
        ? { tenants: [{ id: 't-1', displayName: 'Northwind', slug: 'northwind', lifecycleState: 'ACTIVE' }] }
        : EMPTY,
    );

    render(<AdminModerationTab />);
    await userEvent.click(screen.getByRole('tab', { name: /organizations/i }));

    expect(await screen.findByText('Northwind')).toBeInTheDocument();
    expect(screen.getByText(/1 organizations/i)).toHaveTextContent(/OI-007-1/);
  });

  it('reports an unavailable tenant registry', async () => {
    mockedGet.mockImplementation(async (url: string) => {
      if (String(url).startsWith('/enterprise/tenants')) {
        throw {
          response: { status: 503, data: { error: { code: 'TENANT_REGISTRY_UNAVAILABLE', message: 'The tenant registry is unavailable.', requestId: 'rq-ten-1' } } },
        };
      }
      return EMPTY;
    });

    render(<AdminModerationTab />);
    await userEvent.click(screen.getByRole('tab', { name: /organizations/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('TENANT_REGISTRY_UNAVAILABLE');
    expect(alert).toHaveTextContent('rq-ten-1');
  });
});
