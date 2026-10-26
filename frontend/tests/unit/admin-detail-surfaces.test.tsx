/**
 * The remaining interactive surfaces of the CMS and health consoles.
 *
 * Four flows that the coverage gate still showed as untested code: the blog reader preview
 * (open, render the stored body, close with Escape), the testimonials list (rows, empty, and a
 * failed read), the service-detail drawer's dependency and audit sections, and the job status
 * filter. Each exists only to pin behaviour the operator sees; none of them invents a row.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AdminBlogManagementTab } from '@/components/admin/AdminBlogManagementTab';
import { AdminContentMarketingTab } from '@/components/admin/AdminContentMarketingTab';
import { AdminHealthTab } from '@/components/admin/AdminHealthTab';
import { AdminModerationTab } from '@/components/admin/AdminModerationTab';
import { get } from '@/lib/api-client';

vi.mock('@/lib/api-client', () => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

const mockedGet = vi.mocked(get);

const post = {
  id: 'post-7',
  title: 'What an ATS does with a skills table',
  slug: 'ats-skills-table',
  category: 'Job Search',
  status: 'approved',
  publishedAt: '2026-10-22',
  author: 'A. Reviewer',
  readTime: '5 min read',
  excerpt: 'Skills tables are flattened into plain text by most parsers.',
  content: '### The flattening step\n\nThe parser strips the table markup first.\n\n### What survives\n\nRow order and the literal cell text survive.',
  revision: 2,
};

beforeEach(() => {
  mockedGet.mockReset();
});

describe('AdminBlogManagementTab — reader preview', () => {
  it('opens the preview with the stored body and closes on Escape', async () => {
    mockedGet.mockResolvedValue({ success: true, posts: [post] });
    render(
      <MemoryRouter>
        <AdminBlogManagementTab />
      </MemoryRouter>,
    );

    await userEvent.click(await screen.findByTitle('Live article simulation preview'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: /article reader preview/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: 'What an ATS does with a skills table' })).toBeInTheDocument();
    expect(within(dialog).getByText('The flattening step')).toBeInTheDocument();
    expect(within(dialog).getByText(/skills tables are flattened into plain text/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/\/blog\/ats-skills-table/i)).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('AdminContentMarketingTab — testimonials', () => {
  it('lists the approved testimonials the repository returned', async () => {
    mockedGet.mockImplementation(async (url: string) =>
      String(url) === '/reviews'
        ? {
            success: true,
            reviews: [
              { id: 'rev-1', author: 'Dana Okoye', role: 'Staff Engineer', rating: 5, content: 'The export kept every column.', createdAt: '2026-10-18T00:00:00.000Z' },
            ],
          }
        : { success: true, categories: [] },
    );

    render(<AdminContentMarketingTab />);
    await userEvent.click(screen.getByRole('tab', { name: /testimonials/i }));

    expect(await screen.findByText('Dana Okoye')).toBeInTheDocument();
    expect(screen.getByText('5/5')).toBeInTheDocument();
    expect(screen.getByText(/1 approved testimonials/i)).toHaveTextContent(/read-only/i);
  });

  it('says no testimonial exists rather than seeding one', async () => {
    mockedGet.mockImplementation(async (url: string) =>
      String(url) === '/reviews' ? { success: true, reviews: [] } : { success: true, categories: [] },
    );

    render(<AdminContentMarketingTab />);
    await userEvent.click(screen.getByRole('tab', { name: /testimonials/i }));
    expect(await screen.findByText('No testimonial')).toBeInTheDocument();
  });

  it('reports a failed testimonial read with code and request id', async () => {
    mockedGet.mockImplementation(async (url: string) => {
      if (String(url) === '/reviews') {
        throw {
          response: { status: 503, data: { error: { code: 'REVIEWS_UNAVAILABLE', message: 'Testimonials are unavailable.', requestId: 'rq-rev-1' } } },
        };
      }
      return { success: true, categories: [] };
    });

    render(<AdminContentMarketingTab />);
    await userEvent.click(screen.getByRole('tab', { name: /testimonials/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('REVIEWS_UNAVAILABLE');
    expect(alert).toHaveTextContent('rq-rev-1');
  });
});

describe('AdminHealthTab — dependency detail', () => {
  const service = {
    id: 'payments',
    name: 'Payments gateway',
    group: 'integrations' as const,
    state: 'UNAVAILABLE' as const,
    support: 'SUPPORTED',
    enabled: true,
    configuration: 'CONFIGURED',
    critical: true,
    reason: 'Provider returned 502 on the last three probes.',
    dependency: 'payment-api',
    retryable: true,
    errorCategory: 'upstream',
    remediation: 'Fail over to the secondary provider.',
    affectedFeatures: ['checkout'],
    affectedApis: ['/api/payments/checkout'],
    affectedUiModules: ['checkout'],
    metrics: { consecutiveFailures: 3 },
    testable: true,
    checkedAt: '2026-10-26T06:10:00.000Z',
    docsHref: 'https://runbooks.internal/payments',
  };

  it('shows what depends on the service and the recent audit events', async () => {
    mockedGet.mockImplementation(async (url: string) => {
      if (String(url).startsWith('/platform/operational-status/payments')) {
        return {
          service,
          checkedAt: '2026-10-26T06:11:00.000Z',
          relatedEndpoints: [
            { method: 'POST', path: '/api/payments/checkout', state: 'UNAVAILABLE' },
            { method: 'GET', path: '/api/payments/history', state: 'DEGRADED' },
          ],
          auditEvents: [
            { id: 'ae-1', action: 'PAYMENTS_PROVIDER_FAILOVER', actorEmail: 'ops.admin@resumepilot.test', severity: 'HIGH', outcome: 'success', statusCode: 200, pathname: '/api/platform/operational-status/payments/test', createdAt: '2026-10-26T06:09:00.000Z' },
          ],
          auditSource: 'MYSQL_SERVER_READ',
          elevated: true,
        };
      }
      return {
        checkedAt: '2026-10-26T06:10:00.000Z',
        summary: { overall: 'CRITICAL', indicator: 'red', counts: { UNAVAILABLE: 1 }, total: 1, worstState: 'UNAVAILABLE' },
        services: [service],
        apiMatrix: { total: 2, operationalOrExpected: 0, degraded: 1, unavailable: 1, unknown: 0, endpoints: [] },
        groups: { core: [], integrations: ['payments'], workers: [] },
      };
    });

    render(<AdminHealthTab />);
    await userEvent.click(await screen.findByRole('button', { name: /inspect payments gateway/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/provider returned 502/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/fail over to the secondary provider/i)).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: /endpoints depending on it \(2\)/i })).toBeInTheDocument();
    expect(within(dialog).getByText('POST /api/payments/checkout')).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: /recent audit events \(MYSQL_SERVER_READ\)/i })).toBeInTheDocument();
    expect(within(dialog).getByText('PAYMENTS_PROVIDER_FAILOVER')).toBeInTheDocument();
    expect(within(dialog).getByText('consecutiveFailures')).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: /operator documentation/i })).toHaveAttribute(
      'href',
      'https://runbooks.internal/payments',
    );
  });

  it('closes the drawer with its Close button', async () => {
    mockedGet.mockImplementation(async (url: string) => {
      if (String(url).startsWith('/platform/operational-status/payments')) {
        return { service, checkedAt: '2026-10-26T06:11:00.000Z', relatedEndpoints: [], auditEvents: [], auditSource: 'MYSQL_SERVER_READ', elevated: true };
      }
      return {
        checkedAt: '2026-10-26T06:10:00.000Z',
        summary: { overall: 'CRITICAL', indicator: 'red', counts: { UNAVAILABLE: 1 }, total: 1, worstState: 'UNAVAILABLE' },
        services: [service],
        apiMatrix: { total: 2, operationalOrExpected: 0, degraded: 1, unavailable: 1, unknown: 0, endpoints: [] },
        groups: { core: [], integrations: ['payments'], workers: [] },
      };
    });

    render(<AdminHealthTab />);
    await userEvent.click(await screen.findByRole('button', { name: /inspect payments gateway/i }));
    await screen.findByRole('dialog');
    await userEvent.click(screen.getByRole('button', { name: /^close$/i }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('AdminModerationTab — job status filter', () => {
  it('refetches with the selected status and says when none matches', async () => {
    const calls: Array<[string, unknown]> = [];
    mockedGet.mockImplementation(async (url: string, params?: unknown) => {
      calls.push([String(url), params]);
      return { jobs: [], pagination: { totalItems: 0, totalPages: 0 } };
    });

    render(<AdminModerationTab />);
    await userEvent.click(screen.getByRole('tab', { name: /job postings/i }));
    await userEvent.click(screen.getByRole('button', { name: 'archived' }));

    expect(await screen.findByText('No job posting')).toBeInTheDocument();
    const jobCalls = calls.filter(([url]) => String(url).startsWith('/admin/jobs'));
    expect(jobCalls.length).toBeGreaterThan(1);
    const last = jobCalls[jobCalls.length - 1];
    expect(last?.[1]).toEqual(expect.objectContaining({ status: 'archived' }));
  });
});
