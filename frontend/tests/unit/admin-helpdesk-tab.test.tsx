/**
 * Help desk — the ticket queue the server owns.
 *
 * The tab used to merge five hard-coded tickets into whatever the API returned and swallow
 * every write error with `.catch(() => {})`, so a reply that the server rejected still looked
 * sent. These cases pin the opposite: the rows are the server's, an empty queue says so, a
 * refused reply is reported with its code, and a refused status change does not move the
 * ticket on screen.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminHelpDeskTab } from '@/components/admin/AdminHelpDeskTab';
import { get, patch, post } from '@/lib/api-client';

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

const ticket = {
  id: 'tkt-77',
  userEmail: 'candidate@resumepilot.test',
  subject: 'DOCX export loses column layout',
  status: 'OPEN' as const,
  priority: 'HIGH' as const,
  createdAt: '2026-10-25T11:00:00.000Z',
  messages: [
    { id: 'm-1', role: 'USER' as const, body: 'The second column collapses after export.', createdAt: '2026-10-25T11:00:00.000Z' },
  ],
};

beforeEach(() => {
  mockedGet.mockReset();
  mockedPost.mockReset();
  mockedPatch.mockReset();
});

describe('AdminHelpDeskTab', () => {
  it('renders the tickets the endpoint returned', async () => {
    mockedGet.mockResolvedValue({ success: true, tickets: [ticket], source: 'MYSQL_SERVER_READ' });
    render(<AdminHelpDeskTab />);

    expect(screen.getByRole('status')).toHaveTextContent(/reading the support queue/i);
    // Once in the queue list, once as the thread heading.
    expect(await screen.findAllByText('DOCX export loses column layout')).toHaveLength(2);
    expect(screen.getByText(/submitter: candidate@resumepilot.test/i)).toHaveTextContent('tkt-77');
    expect(screen.getByText('The second column collapses after export.')).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledWith(
      '/admin/support/tickets',
      undefined,
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it('says the desk is empty instead of inventing tickets', async () => {
    mockedGet.mockResolvedValue({ success: true, tickets: [] });
    render(<AdminHelpDeskTab />);

    expect(await screen.findByText('No support ticket')).toBeInTheDocument();
    expect(screen.queryByText(/candidate@resumepilot.test/)).not.toBeInTheDocument();
  });

  it('reports an unavailable ticket store with code and request id', async () => {
    mockedGet.mockRejectedValue({
      response: {
        status: 503,
        data: { error: { code: 'SUPPORT_TICKETS_UNAVAILABLE', message: 'The support queue is unavailable.', requestId: 'rq-desk-1' } },
      },
    });
    render(<AdminHelpDeskTab />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('SUPPORT_TICKETS_UNAVAILABLE');
    expect(alert).toHaveTextContent('rq-desk-1');
  });

  it('does not report a reply as sent when the server refuses it', async () => {
    mockedGet.mockResolvedValue({ success: true, tickets: [ticket] });
    mockedPost.mockRejectedValue({
      response: {
        status: 403,
        data: { error: { code: 'SUPPORT_REPLY_FORBIDDEN', message: 'This ticket is closed to staff replies.', requestId: 'rq-desk-2' } },
      },
    });

    render(<AdminHelpDeskTab />);
    const box = await screen.findByPlaceholderText(/type staff response/i);
    await userEvent.type(box, 'Please resend the DOCX and I will re-check.');
    await userEvent.click(screen.getByRole('button', { name: /send reply/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('SUPPORT_REPLY_FORBIDDEN');
    expect(alert).toHaveTextContent('rq-desk-2');
    expect(screen.queryByText(/reply sent to ticket/i)).not.toBeInTheDocument();
    // The draft is kept, so the operator does not lose the text on a refusal.
    expect(box).toHaveValue('Please resend the DOCX and I will re-check.');
    expect(mockedPost).toHaveBeenCalledWith('/admin/support/tickets/tkt-77/messages', {
      body: 'Please resend the DOCX and I will re-check.',
    });
  });

  it('reports a refused status change and keeps the stored status', async () => {
    mockedGet.mockResolvedValue({ success: true, tickets: [ticket] });
    mockedPatch.mockRejectedValue({
      response: {
        status: 409,
        data: { error: { code: 'ADMIN_TARGET_CHANGED', message: 'The ticket changed since it was read.', requestId: 'rq-desk-3' } },
      },
    });

    render(<AdminHelpDeskTab />);
    await userEvent.click(await screen.findByRole('button', { name: /mark resolved/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('ADMIN_TARGET_CHANGED');
    expect(mockedPatch).toHaveBeenCalledWith('/admin/support/tickets/tkt-77', { status: 'RESOLVED' });
    // Still open: the button is rendered from the server's status, never from the click.
    expect(await screen.findByRole('button', { name: /mark resolved/i })).toBeInTheDocument();
  });

  it('sends a reply to the selected ticket and reports the ticket it went to', async () => {
    mockedGet.mockResolvedValue({ success: true, tickets: [ticket], source: 'MYSQL_SERVER_READ' });
    mockedPost.mockResolvedValue({ success: true });

    render(<AdminHelpDeskTab />);
    await screen.findAllByText(ticket.subject);
    await userEvent.type(screen.getByPlaceholderText(/type staff response/i), 'Re-queued the export.');
    await userEvent.click(screen.getByRole('button', { name: /send reply/i }));

    expect(mockedPost).toHaveBeenCalledWith(
      `/admin/support/tickets/${ticket.id}/messages`,
      { body: 'Re-queued the export.' },
    );
    expect(await screen.findByRole('status')).toHaveTextContent(ticket.id);
    // The buffer clears only after the server accepted it: a failed send must leave the
    // operator's words on screen, and the mirror of that rule is what this asserts.
    expect(screen.getByPlaceholderText(/type staff response/i)).toHaveValue('');
  });

  it('disables the reply control until there is something to send', async () => {
    mockedGet.mockResolvedValue({ success: true, tickets: [ticket], source: 'MYSQL_SERVER_READ' });
    render(<AdminHelpDeskTab />);
    await screen.findAllByText(ticket.subject);
    expect(screen.getByRole('button', { name: /send reply/i })).toBeDisabled();
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('resolves a ticket with the documented status body, and dismisses the banner afterwards', async () => {
    mockedGet.mockResolvedValue({ success: true, tickets: [ticket], source: 'MYSQL_SERVER_READ' });
    mockedPatch.mockResolvedValue({ success: true });

    render(<AdminHelpDeskTab />);
    await screen.findAllByText(ticket.subject);
    await userEvent.click(screen.getByRole('button', { name: /mark resolved/i }));

    expect(mockedPatch).toHaveBeenCalledWith(
      `/admin/support/tickets/${ticket.id}`,
      { status: 'RESOLVED' },
    );
    const flash = await screen.findByRole('status');
    expect(flash).toHaveTextContent(/resolved/i);
  });

});
