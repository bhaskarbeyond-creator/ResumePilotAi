import React, { useCallback, useEffect, useState } from 'react';
import { getStats, getAllSubscriptions, getEarnings } from '../../../firestore/dbOperations';
import { formatAdminMoney, normalizeAdminMetrics, normalizeAdminSubscription } from '../../../utils/adminData';
import { FaDollarSign, FaUsers, FaFileAlt, FaDownload, FaCalendarAlt, FaExclamationTriangle, FaSyncAlt } from 'react-icons/fa';

const EMPTY_METRICS = normalizeAdminMetrics(null, null);

const Dashboard = () => {
    const [metrics, setMetrics] = useState(EMPTY_METRICS);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [loadedAt, setLoadedAt] = useState(null);

    const loadDashboard = useCallback(async () => {
        setLoading(true);
        setError('');
        const [statsResult, subscriptionsResult, earningsResult] = await Promise.allSettled([
            getStats(), getAllSubscriptions(), getEarnings(),
        ]);
        const failures = [statsResult, subscriptionsResult, earningsResult].filter(result => result.status === 'rejected');
        const stats = statsResult.status === 'fulfilled' ? statsResult.value : null;
        const earnings = earningsResult.status === 'fulfilled' ? earningsResult.value : null;
        const subscriptions = subscriptionsResult.status === 'fulfilled' && Array.isArray(subscriptionsResult.value)
            ? subscriptionsResult.value : [];
        setMetrics(normalizeAdminMetrics(stats, earnings));
        setRows(subscriptions.map((subscription, index) => normalizeAdminSubscription(subscription, index)));
        setLoadedAt(new Date());
        if (failures.length) setError(`${failures.length} dashboard data source(s) could not be loaded. Unavailable values are not estimated.`);
        setLoading(false);
    }, []);

    useEffect(() => { loadDashboard(); }, [loadDashboard]);

    const cards = [
        { label: 'Recorded earnings', value: formatAdminMoney(metrics.earnings, metrics.currency), icon: <FaDollarSign className="h-5 w-5 text-white" aria-hidden="true" />, tone: 'bg-emerald-500' },
        { label: 'Total users', value: metrics.users ?? 'Unavailable', icon: <FaUsers className="h-5 w-5 text-white" aria-hidden="true" />, tone: 'bg-blue-500' },
        { label: 'Resumes created', value: metrics.resumes ?? 'Unavailable', icon: <FaFileAlt className="h-5 w-5 text-white" aria-hidden="true" />, tone: 'bg-violet-500' },
        { label: 'Downloads', value: metrics.downloads ?? 'Unavailable', icon: <FaDownload className="h-5 w-5 text-white" aria-hidden="true" />, tone: 'bg-orange-500' },
    ];

    return (
        <div className="min-h-screen bg-slate-50 px-4 py-6">
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Admin Dashboard</h1>
                    <p className="mt-1 text-sm text-slate-500">
                        {loading ? 'Loading stored operational aggregates…' : loadedAt ? `Last refreshed ${loadedAt.toLocaleTimeString()}` : 'Not loaded'}
                    </p>
                </div>
                <button type="button" onClick={loadDashboard} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">
                    <FaSyncAlt className={loading ? 'animate-spin' : ''} aria-hidden="true" /> Refresh
                </button>
            </div>

            {error && (
                <div role="alert" className="mb-6 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                    <FaExclamationTriangle className="mt-0.5 flex-none" aria-hidden="true" />
                    <div><p>{error}</p><button type="button" onClick={loadDashboard} className="mt-2 font-semibold underline">Retry</button></div>
                </div>
            )}

            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy={loading}>
                {cards.map(({ label, value, icon, tone }) => (
                    <section key={label} className="rounded-lg border border-slate-200 bg-white p-4">
                        <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-lg ${tone}`}>{icon}</div>
                        <p className="break-words text-2xl font-bold text-slate-900">{loading ? '—' : value}</p>
                        <p className="mt-1 text-xs text-slate-500">{label}</p>
                        <p className="mt-2 text-[11px] text-slate-400">Stored aggregate; no trend inferred</p>
                    </section>
                ))}
            </div>

            <section aria-labelledby="recent-subscriptions-title">
                <div className="mb-4">
                    <h2 id="recent-subscriptions-title" className="text-lg font-semibold text-slate-800">Recent subscriptions</h2>
                    <p className="text-xs text-slate-500">Up to seven newest stored subscription records</p>
                </div>
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                    {loading ? (
                        <div className="p-8 text-center text-sm text-slate-500" role="status">Loading subscriptions…</div>
                    ) : rows.length === 0 ? (
                        <div className="p-8 text-center">
                            <FaExclamationTriangle className="mx-auto mb-3 h-6 w-6 text-slate-400" aria-hidden="true" />
                            <h3 className="text-sm font-medium text-slate-900">No subscription records</h3>
                            <p className="mt-1 text-xs text-slate-500">No recent subscription data was returned.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full">
                                <caption className="sr-only">Recent subscriptions and their current stored or derived status</caption>
                                <thead className="border-b border-slate-200 bg-slate-50">
                                    <tr>{['User', 'Plan', 'Expires', 'Payment', 'Status'].map((heading, index) => <th key={heading} scope="col" className={`px-4 py-3 text-xs font-medium text-slate-600 ${index === 4 ? 'text-right' : 'text-left'}`}>{heading}</th>)}</tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                    {rows.map(row => (
                                        <tr key={row.key} className="hover:bg-slate-50">
                                            <td className="px-4 py-3 font-mono text-xs text-slate-700" title={row.userId}>{row.userId.length > 12 ? `${row.userId.slice(0, 12)}…` : row.userId}</td>
                                            <td className="px-4 py-3 text-xs font-medium text-slate-700">{row.plan}</td>
                                            <td className="px-4 py-3 text-xs text-slate-600"><span className="inline-flex items-center gap-2"><FaCalendarAlt className="text-slate-400" aria-hidden="true" />{row.expiresAt ? row.expiresAt.toLocaleDateString() : 'Not recorded'}</span></td>
                                            <td className="px-4 py-3 text-xs capitalize text-slate-600">{row.paymentProvider}</td>
                                            <td className="px-4 py-3 text-right"><span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${row.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>{row.status}</span></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
};

export default Dashboard;
