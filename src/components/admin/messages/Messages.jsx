import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getAllMessages } from '../../../services/api/platform';
import { FaEnvelope, FaUser, FaCalendar, FaEye, FaChevronUp, FaClock, FaInbox, FaSearch, FaSyncAlt } from 'react-icons/fa';

const PAGE_SIZE = 20;

const Messages = () => {
    const [messages, setMessages] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [search, setSearch] = useState('');
    const [dateFilter, setDateFilter] = useState('all');
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const loadMessages = useCallback(async () => {
        setLoading(true); setError('');
        try { setMessages(await getAllMessages()); }
        catch (loadError) { setError(loadError.message || 'Unable to load contact messages.'); }
        finally { setLoading(false); }
    }, []);
    useEffect(() => { loadMessages(); }, [loadMessages]);

    const filtered = useMemo(() => {
        const term = search.trim().toLocaleLowerCase();
        const today = new Date().toDateString();
        return messages.filter(item => {
            const date = item.createdAt ? new Date(item.createdAt) : null;
            const matchesDate = dateFilter === 'all' || (date && Number.isFinite(date.getTime()) && date.toDateString() === today);
            const haystack = `${item.name || ''} ${item.email || ''} ${item.message || ''}`.toLocaleLowerCase();
            return matchesDate && (!term || haystack.includes(term));
        }).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    }, [messages, search, dateFilter]);
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const currentPage = Math.min(page, totalPages);
    const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
    const todayCount = messages.filter(item => item.createdAt && new Date(item.createdAt).toDateString() === new Date().toDateString()).length;

    return (
        <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
            <section className="mb-6 rounded-lg border border-slate-200 bg-white p-6" aria-labelledby="messages-title">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50"><FaInbox className="text-blue-600" aria-hidden="true" /></div><div><h1 id="messages-title" className="text-2xl font-bold text-slate-900">Messages & Contacts</h1><p className="text-sm text-slate-500">Read contact form submissions; no delivery or response state is inferred.</p></div></div>
                    <button type="button" onClick={loadMessages} disabled={loading} className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50"><FaSyncAlt className={loading ? 'animate-spin' : ''} aria-hidden="true" />Refresh</button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2"><div className="rounded-lg bg-slate-50 p-4"><span className="text-sm text-slate-600">Stored messages</span><p className="text-lg font-semibold">{loading ? '—' : messages.length}</p></div><div className="rounded-lg bg-slate-50 p-4"><span className="text-sm text-slate-600">Received today</span><p className="text-lg font-semibold">{loading ? '—' : todayCount}</p></div></div>
            </section>

            {error && <div role="alert" className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error} <button type="button" onClick={loadMessages} className="font-semibold underline">Retry</button></div>}

            <section className="overflow-hidden rounded-lg border border-slate-200 bg-white" aria-labelledby="contact-table-title">
                <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div><h2 id="contact-table-title" className="font-semibold text-slate-900">Customer messages</h2><p className="text-xs text-slate-500">{filtered.length} matching record(s)</p></div>
                    <div className="flex flex-col gap-2 sm:flex-row"><label className="relative"><span className="sr-only">Search messages</span><FaSearch className="absolute left-3 top-3 text-slate-400" aria-hidden="true" /><input type="search" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Search name, email, message" className="rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm" /></label><select aria-label="Filter messages by date" value={dateFilter} onChange={event => { setDateFilter(event.target.value); setPage(1); }} className="rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="all">All dates</option><option value="today">Today</option></select></div>
                </div>
                {loading ? <div className="p-10 text-center text-sm text-slate-500" role="status">Loading messages…</div> : visible.length === 0 ? <div className="p-10 text-center"><FaInbox className="mx-auto mb-3 text-slate-400" aria-hidden="true" /><p className="text-sm text-slate-600">No messages match this view.</p></div> : <div className="overflow-x-auto"><table className="min-w-full"><caption className="sr-only">Contact submissions</caption><thead className="bg-slate-50"><tr>{['Contact', 'Email', 'Received', 'Action'].map(label => <th key={label} scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-200">{visible.map(item => {
                    const expanded = selectedId === item.id;
                    const received = item.createdAt && Number.isFinite(new Date(item.createdAt).getTime()) ? new Date(item.createdAt).toLocaleString() : 'Not recorded';
                    return <React.Fragment key={item.id}><tr><td className="px-6 py-4 text-sm font-medium text-slate-900"><span className="inline-flex items-center gap-2"><FaUser aria-hidden="true" />{item.name || 'Anonymous'}</span></td><td className="px-6 py-4 text-sm text-slate-700"><span className="inline-flex items-center gap-2"><FaEnvelope aria-hidden="true" />{item.email || 'Not provided'}</span></td><td className="px-6 py-4 text-sm text-slate-600"><span className="inline-flex items-center gap-2"><FaClock aria-hidden="true" />{received}</span></td><td className="px-6 py-4"><button type="button" aria-expanded={expanded} aria-controls={`message-${item.id}`} onClick={() => setSelectedId(expanded ? null : item.id)} className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium">{expanded ? <FaChevronUp aria-hidden="true" /> : <FaEye aria-hidden="true" />}{expanded ? 'Hide' : 'View'}</button></td></tr>{expanded && <tr id={`message-${item.id}`} className="bg-blue-50"><td colSpan="4" className="px-6 py-4"><div className="rounded-lg border border-blue-200 bg-white p-4"><h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><FaEnvelope aria-hidden="true" />Message content</h3><p className="whitespace-pre-wrap break-words text-sm text-slate-700">{item.message || 'No message content available.'}</p><p className="mt-3 flex items-center gap-2 text-xs text-slate-500"><FaCalendar aria-hidden="true" />{received}</p></div></td></tr>}</React.Fragment>;
                })}</tbody></table></div>}
                {!loading && filtered.length > PAGE_SIZE && <div className="flex items-center justify-between border-t border-slate-200 p-4 text-sm"><span>Page {currentPage} of {totalPages}</span><div className="flex gap-2"><button type="button" onClick={() => setPage(value => Math.max(1, value - 1))} disabled={currentPage === 1} className="rounded border px-3 py-1 disabled:opacity-50">Previous</button><button type="button" onClick={() => setPage(value => Math.min(totalPages, value + 1))} disabled={currentPage === totalPages} className="rounded border px-3 py-1 disabled:opacity-50">Next</button></div></div>}
            </section>
        </div>
    );
};

export default Messages;
