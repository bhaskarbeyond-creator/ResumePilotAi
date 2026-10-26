/**
 * Platform health — the snapshot the collector returned.
 *
 * The tab previously showed a fixed set of six "operational" cards with fake latency numbers.
 * Now every card comes from `GET /platform/operational-status`, a probed service that the
 * platform does not probe is absent, and the drawer re-reads the service detail and its
 * provider probe instead of assuming success.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminHealthTab } from '@/components/admin/AdminHealthTab';
import type { HealthSnapshot } from '@/components/admin/AdminHealthTab';
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

const service = {
  id: 'mariadb',
  name: 'MariaDB primary',
  group: 'core' as const,
  state: 'OPERATIONAL' as const,
  support: 'SUPPORTED',
  enabled: true,
  configuration: 'CONFIGURED',
  critical: true,
  reason: 'Connection pool answered a ping in 4 ms.',
  dependency: 'none',
  retryable: true,
  errorCategory: null,
  remediation: 'none required',
  affectedFeatures: ['resumes'],
  affectedApis: ['/api/resumes'],
  affectedUiModules: ['builder'],
  metrics: { latencyMs: 4 },
  testable: true,
  checkedAt: '2026-10-26T06:00:00.000Z',
  docsHref: null,
};

const snapshot = {
  checkedAt: '2026-10-26T06:00:00.000Z',
  summary: {
    overall: 'OPERATIONAL',
    indicator: 'green',
    counts: { OPERATIONAL: 1, DEGRADED: 1 },
    total: 2,
    worstState: 'DEGRADED',
  },
  services: [
    service,
    {
      ...service,
      id: 'openai',
      name: 'OpenAI',
      group: 'integrations' as const,
      state: 'DEGRADED' as const,
      critical: false,
      reason: 'Elevated latency on the completion endpoint.',
      testable: false,
      metrics: {},
    },
  ],
  apiMatrix: { total: 9, operationalOrExpected: 8, degraded: 1, unavailable: 0, unknown: 0, endpoints: [] },
  groups: { core: ['mariadb'], integrations: ['openai'], workers: [] },
  sources: { mariadb: 'MYSQL_SERVER_READ' },
} as unknown as HealthSnapshot;

beforeEach(() => {
  mockedGet.mockReset();
  mockedPost.mockReset();
});

describe('AdminHealthTab', () => {
  it('renders the probed services and their states', async () => {
    mockedGet.mockResolvedValue(snapshot);
    render(<AdminHealthTab />);

    expect(screen.getByRole('status')).toHaveTextContent(/collecting the operational snapshot/i);
    expect(await screen.findByText('MariaDB primary')).toBeInTheDocument();
    expect(screen.getByText('OpenAI')).toBeInTheDocument();
    expect(screen.getByText('Connection pool answered a ping in 4 ms.')).toBeInTheDocument();
    expect(screen.getByText('8/9')).toBeInTheDocument();
    expect(screen.getByText(/collected 2026-10-26T06:00:00.000Z/i)).toBeInTheDocument();
  });

  it('filters by group and by free text', async () => {
    mockedGet.mockResolvedValue(snapshot);
    render(<AdminHealthTab />);
    await screen.findByText('MariaDB primary');

    await userEvent.click(screen.getByRole('button', { name: 'Integrations' }));
    expect(screen.queryByText('MariaDB primary')).not.toBeInTheDocument();
    expect(screen.getByText('OpenAI')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'All' }));
    await userEvent.type(screen.getByLabelText('Filter services'), 'openai');
    expect(screen.getByText('OpenAI')).toBeInTheDocument();
    expect(screen.queryByText('MariaDB primary')).not.toBeInTheDocument();
  });

  it('reports an uncollectable snapshot instead of showing a healthy board', async () => {
    mockedGet.mockRejectedValue({
      response: {
        status: 503,
        data: { error: { code: 'OPERATIONAL_STATUS_UNAVAILABLE', message: 'The collector did not answer.', requestId: 'rq-health-1' } },
      },
    });
    render(<AdminHealthTab />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('OPERATIONAL_STATUS_UNAVAILABLE');
    expect(alert).toHaveTextContent('rq-health-1');
    expect(screen.queryByText(/operational$/i)).not.toBeInTheDocument();
  });

  it('says no service was probed when the collector returns none', async () => {
    mockedGet.mockResolvedValue({ ...snapshot, services: [] } as unknown as HealthSnapshot);
    render(<AdminHealthTab />);

    expect(await screen.findByText('No probed services')).toBeInTheDocument();
  });

  it('opens the detail drawer with the service payload', async () => {
    mockedGet.mockImplementation(async (url: string) =>
      String(url).startsWith('/platform/operational-status/mariadb')
        ? { service, checkedAt: '2026-10-26T06:01:00.000Z', relatedEndpoints: [], auditEvents: [], auditSource: 'MYSQL_SERVER_READ', elevated: true }
        : snapshot,
    );

    render(<AdminHealthTab />);
    await userEvent.click(await screen.findByRole('button', { name: /inspect mariadb primary/i }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getAllByText(/connection pool answered a ping/i).length).toBeGreaterThan(0);
    expect(mockedGet).toHaveBeenCalledWith(
      '/platform/operational-status/mariadb',
      undefined,
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it('reports a failed provider probe as a failure', async () => {
    mockedGet.mockImplementation(async (url: string) =>
      String(url).startsWith('/platform/operational-status/mariadb')
        ? { service, checkedAt: '2026-10-26T06:01:00.000Z', relatedEndpoints: [], auditEvents: [], auditSource: 'MYSQL_SERVER_READ', elevated: true }
        : snapshot,
    );
    mockedPost.mockResolvedValue({ passed: false, message: 'SMTP 550', errorCategory: 'auth' });

    render(<AdminHealthTab />);
    await userEvent.click(await screen.findByRole('button', { name: /inspect mariadb primary/i }));
    await screen.findByRole('dialog');
    await userEvent.click(withinDialog(/probe/i));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/failed — SMTP 550/i);
  });
});

function withinDialog(name: RegExp): HTMLElement {
  const dialog = screen.getByRole('dialog');
  const button = Array.from(dialog.querySelectorAll('button')).find((candidate) =>
    name.test(candidate.textContent ?? ''),
  );
  if (!button) throw new Error(`No button matching ${String(name)} inside the dialog`);
  return button;
}
