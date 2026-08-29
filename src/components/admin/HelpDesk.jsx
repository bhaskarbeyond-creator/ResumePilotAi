import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getAdminSupportTickets,
  getAdminSupportTicket,
  replyAdminSupportTicket,
  updateAdminSupportTicketStatus,
} from '../../services/api/platform';

const STATUSES = ['OPEN', 'PENDING', 'RESOLVED', 'CLOSED'];

export default function HelpDesk() {
  const [tickets, setTickets] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [reply, setReply] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const loadList = useCallback(async () => {
    setError('');
    try {
      const result = await getAdminSupportTickets(statusFilter || undefined);
      setTickets(Array.isArray(result.tickets) ? result.tickets : []);
    } catch (err) {
      setError(err?.message || 'Unable to load tickets.');
    }
  }, [statusFilter]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const loadDetail = useCallback(async (ticketId) => {
    if (!ticketId) {
      setDetail(null);
      return;
    }
    setError('');
    try {
      const result = await getAdminSupportTicket(ticketId);
      setDetail(result.ticket || null);
    } catch (err) {
      setError(err?.message || 'Unable to load ticket.');
    }
  }, []);

  useEffect(() => {
    loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  const selected = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedId) || detail,
    [tickets, selectedId, detail]
  );

  const onReply = async (event) => {
    event.preventDefault();
    if (!selectedId || !reply.trim()) return;
    setBusy(true);
    setError('');
    try {
      const result = await replyAdminSupportTicket(selectedId, reply.trim());
      setDetail(result.ticket || null);
      setReply('');
      await loadList();
    } catch (err) {
      setError(err?.message || 'Unable to send reply.');
    } finally {
      setBusy(false);
    }
  };

  const onStatus = async (status) => {
    if (!selectedId) return;
    setBusy(true);
    setError('');
    try {
      const result = await updateAdminSupportTicketStatus(selectedId, status);
      setDetail(result.ticket || null);
      await loadList();
    } catch (err) {
      setError(err?.message || 'Unable to update status.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4" data-testid="admin-help-desk">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Help Desk</h2>
          <p className="text-sm text-slate-600">Owner-bound support tickets. Public contact messages stay on Messages.</p>
        </div>
        <label className="text-sm text-slate-700">
          Status
          <select
            className="ml-2 rounded border border-slate-300 px-2 py-1"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="">All</option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </label>
      </header>
      {error ? <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{error}</p> : null}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <ul className="divide-y divide-slate-200 rounded border border-slate-200 bg-white">
          {tickets.length === 0 ? (
            <li className="px-4 py-8 text-sm text-slate-500">No tickets in this filter.</li>
          ) : tickets.map((ticket) => (
            <li key={ticket.id}>
              <button
                type="button"
                className={`w-full px-4 py-3 text-left ${selectedId === ticket.id ? 'bg-slate-100' : ''}`}
                onClick={() => setSelectedId(ticket.id)}
              >
                <span className="block font-medium text-slate-900">{ticket.subject}</span>
                <span className="mt-1 block text-xs text-slate-500">{ticket.status} · {ticket.priority} · {ticket.userId}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="rounded border border-slate-200 bg-white p-4">
          {!selected ? (
            <p className="text-sm text-slate-500">Select a ticket to reply.</p>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-semibold text-slate-900">{detail?.subject || selected.subject}</h3>
                <select
                  className="rounded border border-slate-300 px-2 py-1 text-sm"
                  value={detail?.status || selected.status}
                  disabled={busy}
                  onChange={(event) => onStatus(event.target.value)}
                >
                  {STATUSES.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>
              <ol className="mb-4 max-h-80 space-y-3 overflow-y-auto">
                {(detail?.messages || []).map((message) => (
                  <li key={message.id} className="rounded bg-slate-50 px-3 py-2 text-sm">
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{message.authorRole}</div>
                    <p className="mt-1 whitespace-pre-wrap text-slate-800">{message.body}</p>
                  </li>
                ))}
              </ol>
              <form onSubmit={onReply} className="space-y-2">
                <label className="block text-sm font-medium text-slate-700" htmlFor="helpdesk-reply">Reply</label>
                <textarea
                  id="helpdesk-reply"
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                  rows={4}
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  required
                />
                <button
                  type="submit"
                  disabled={busy || !reply.trim()}
                  className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  Send reply
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
