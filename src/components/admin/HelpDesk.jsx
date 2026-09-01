import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FiLifeBuoy, FiRefreshCw, FiSend, FiUser, FiCheckCircle, FiClock, FiAlertCircle } from 'react-icons/fi';
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
  const [loading, setLoading] = useState(true);

  const loadList = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const result = await getAdminSupportTickets(statusFilter || undefined);
      setTickets(Array.isArray(result.tickets) ? result.tickets : []);
    } catch (err) {
      setError(err?.message || 'Unable to load tickets.');
    } finally {
      setLoading(false);
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

  const getStatusBadge = (status) => {
    const s = String(status || '').toUpperCase();
    if (s === 'OPEN') return 'bg-amber-50 text-amber-700 border-amber-200';
    if (s === 'PENDING') return 'bg-blue-50 text-blue-700 border-blue-200';
    if (s === 'RESOLVED') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    return 'bg-slate-100 text-slate-700 border-slate-200';
  };

  return (
    <div className="space-y-6" data-testid="admin-help-desk">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FiLifeBuoy className="text-indigo-600" /> Help Desk &amp; Support Tickets
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Authoritative customer ticket dispatch, conversation stream, and issue lifecycle desk.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <select
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-extrabold text-slate-800 shadow-2xs focus:outline-hidden focus:border-indigo-500"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="">Status: All Tickets</option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>Status: {status}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={loadList}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-slate-300 bg-white text-xs font-extrabold text-slate-800 hover:bg-slate-50 transition shadow-2xs cursor-pointer disabled:opacity-50 whitespace-nowrap"
          >
            <FiRefreshCw className={`h-3.5 w-3.5 text-slate-600 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 flex items-center gap-2">
          <FiAlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        {/* Ticket List */}
        <div className="rounded-2xl border border-slate-200/80 bg-white shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
            <span className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">Support Queue</span>
            <span className="text-[11px] font-bold text-slate-500">{tickets.length} ticket(s)</span>
          </div>
          <ul className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
            {tickets.length === 0 ? (
              <li className="px-5 py-12 text-center text-xs text-slate-400">No support tickets found in this queue.</li>
            ) : (
              tickets.map((ticket) => {
                const isSelected = selectedId === ticket.id;
                return (
                  <li key={ticket.id}>
                    <button
                      type="button"
                      className={`w-full p-4 text-left transition hover:bg-slate-50/80 cursor-pointer ${
                        isSelected ? 'bg-indigo-50/70 border-l-4 border-indigo-600' : ''
                      }`}
                      onClick={() => setSelectedId(ticket.id)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-extrabold text-slate-900 text-xs truncate">{ticket.subject}</span>
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${getStatusBadge(ticket.status)}`}>
                          {ticket.status}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                        <span>User: {ticket.userId || 'Guest'}</span>
                        <span>•</span>
                        <span>Priority: {ticket.priority || 'NORMAL'}</span>
                      </div>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>

        {/* Conversation Thread */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs space-y-4">
          {!selected ? (
            <div className="py-20 text-center text-slate-400 text-xs">
              <FiLifeBuoy className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <p className="font-bold text-slate-600">Select a support ticket</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Click any ticket on the left to read messages and post replies.</p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-sm font-black text-slate-900">{detail?.subject || selected.subject}</h3>
                  <p className="text-[10px] text-slate-400 font-mono mt-0.5">Ticket ID: {selected.id}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500">Status:</span>
                  <select
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-extrabold text-slate-800 focus:outline-hidden focus:border-indigo-500"
                    value={detail?.status || selected.status}
                    disabled={busy}
                    onChange={(event) => onStatus(event.target.value)}
                  >
                    {STATUSES.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {(detail?.messages || []).length === 0 ? (
                  <p className="text-xs text-slate-400 py-4 text-center">No messages in this ticket yet.</p>
                ) : (
                  (detail?.messages || []).map((message) => {
                    const isStaff = ['ADMIN', 'SUPER_ADMIN', 'SUPPORT', 'STAFF'].includes(String(message.authorRole || '').toUpperCase());
                    return (
                      <div
                        key={message.id}
                        className={`p-3.5 rounded-2xl text-xs space-y-1 ${
                          isStaff ? 'bg-indigo-50/80 border border-indigo-100 text-indigo-950 ml-4' : 'bg-slate-50 border border-slate-200 text-slate-900 mr-4'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] font-bold text-slate-500">
                          <span className="flex items-center gap-1">
                            <FiUser className="h-3 w-3" />
                            {isStaff ? 'Support Staff' : 'Customer'}
                          </span>
                          <span className="font-mono">{message.createdAt ? new Date(message.createdAt).toLocaleTimeString() : ''}</span>
                        </div>
                        <p className="whitespace-pre-wrap text-xs leading-relaxed">{message.body}</p>
                      </div>
                    );
                  })
                )}
              </div>

              <form onSubmit={onReply} className="space-y-2 pt-2 border-t border-slate-100">
                <label className="block text-xs font-extrabold text-slate-700" htmlFor="helpdesk-reply">
                  Staff Reply
                </label>
                <textarea
                  id="helpdesk-reply"
                  className="w-full rounded-xl border border-slate-200 p-3 text-xs focus:bg-white focus:outline-hidden focus:border-indigo-500 font-medium"
                  rows={3}
                  placeholder="Type your response to the customer…"
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  required
                />
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={busy || !reply.trim()}
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-extrabold text-white hover:bg-indigo-700 disabled:opacity-50 transition cursor-pointer shadow-xs whitespace-nowrap"
                  >
                    <FiSend className="h-3.5 w-3.5 text-indigo-200" />
                    <span>{busy ? 'Sending…' : 'Send Reply'}</span>
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
