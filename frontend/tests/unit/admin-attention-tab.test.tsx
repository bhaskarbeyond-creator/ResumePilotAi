/**
 * The attention page must report what the platform says, and must say when it cannot.
 *
 * Before this test existed the tab rendered five invented incidents and a Refresh button that
 * only moved a spinner, so a healthy platform and a broken one looked the same.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminAttentionTab } from '@/components/admin/AdminAttentionTab';
import { get } from '@/lib/api-client';

vi.mock('@/lib/api-client', () => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

const mockedGet = vi.mocked(get);

const payload = {
  items: [
    { id: 'dlq', severity: 'HIGH' as const, title: '2 notification DLQ item(s)', detail: 'Two retries exhausted.', href: '/adm/queues', kind: 'queue' },
    { id: 'health-payments', severity: 'INFO' as const, title: 'Payments disabled', href: '/adm/health', kind: 'configuration' },
  ],
  healthScore: 88,
  status: 'DEGRADED',
  operationalStatus: { overall: 'DEGRADED', indicator: 'warning', counts: { degraded: 1 }, checkedAt: '2026-10-26T09:00:00.000Z' },
  operationalSource: 'ok' as const,
  note: 'Attention items are derived from inspected platform signals and live operational health.',
};

beforeEach(() => {
  mockedGet.mockReset();
});

describe('AdminAttentionTab', () => {
  it('renders the signals the endpoint returned, with severity and id', async () => {
    mockedGet.mockResolvedValue(payload);
    render(<AdminAttentionTab />);

    expect(screen.getByRole('status')).toHaveTextContent(/reading platform signals/i);
    expect(await screen.findByText('2 notification DLQ item(s)')).toBeInTheDocument();
    expect(screen.getByText('Payments disabled')).toBeInTheDocument();
    expect(screen.getByText('HIGH')).toBeInTheDocument();
    expect(screen.getByText('88/100')).toBeInTheDocument();
    expect(screen.getByText('DEGRADED')).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledWith('/platform/attention', undefined, expect.objectContaining({ signal: expect.anything() }));
  });

  it('says there is nothing to do when the server returns no items', async () => {
    mockedGet.mockResolvedValue({ ...payload, items: [] });
    render(<AdminAttentionTab />);
    expect(await screen.findByText('No signal is firing')).toBeInTheDocument();
    expect(screen.queryByText(/DLQ/)).not.toBeInTheDocument();
  });

  it('reports a failure with the code and request id instead of a sample list', async () => {
    mockedGet.mockRejectedValue({
      response: {
        status: 503,
        data: { error: { code: 'ATTENTION_SIGNALS_UNAVAILABLE', message: 'Platform attention signals are unavailable.', requestId: 'rq-42' } },
      },
    });
    render(<AdminAttentionTab />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Platform attention signals are unavailable.');
    expect(alert).toHaveTextContent('ATTENTION_SIGNALS_UNAVAILABLE');
    expect(alert).toHaveTextContent('rq-42');
    // The invented incidents the tab used to render must not reappear as a fallback.
    expect(screen.queryByText(/Vertex AI Labs/)).not.toBeInTheDocument();
    expect(screen.queryByText(/All Operational Signals Clear/)).not.toBeInTheDocument();
  });

  it('re-reads the endpoint when Refresh is pressed', async () => {
    mockedGet.mockResolvedValueOnce(payload).mockResolvedValueOnce({ ...payload, items: [] });
    const user = userEvent.setup();
    render(<AdminAttentionTab />);
    await screen.findByText('2 notification DLQ item(s)');

    await user.click(screen.getByRole('button', { name: /refresh signals/i }));
    await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('No signal is firing')).toBeInTheDocument();
  });

  it('offers navigation only for kinds that map to a console tab', async () => {
    mockedGet.mockResolvedValue(payload);
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(<AdminAttentionTab onNavigateTab={onNavigate} />);

    await user.click(await screen.findByRole('button', { name: /open queues/i }));
    expect(onNavigate).toHaveBeenCalledWith('queues');
    // `configuration` maps to the config tab, `queue` to queues — both present, neither guessed.
    expect(screen.getByRole('button', { name: /open config/i })).toBeInTheDocument();
  });

  it('does not offer to acknowledge a derived signal', async () => {
    mockedGet.mockResolvedValue(payload);
    render(<AdminAttentionTab />);
    await screen.findByText('2 notification DLQ item(s)');
    expect(screen.queryByRole('button', { name: /acknowledge/i })).not.toBeInTheDocument();
  });
});
