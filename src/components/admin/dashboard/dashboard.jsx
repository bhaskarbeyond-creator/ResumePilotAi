import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getStats, getAllSubscriptions, getEarnings } from '../../../firestore/dbOperations';
import { formatAdminMoney, normalizeAdminMetrics, normalizeAdminSubscription } from '../../../utils/adminData';
import fire from '../../../conf/fire';
import {
  FaDollarSign, FaUsers, FaFileAlt, FaDownload, FaCalendarAlt,
  FaExclamationTriangle, FaSyncAlt, FaShieldAlt, FaServer,
  FaHeartbeat, FaCheckCircle, FaExclamationCircle, FaLayerGroup, FaArrowRight
} from 'react-icons/fa';
import { FiActivity, FiRotateCw, FiCommand, FiClock, FiCpu } from 'react-icons/fi';

const EMPTY_METRICS = normalizeAdminMetrics(null, null);

const Dashboard = ({ isSuperAdmin = false }) => {
    const [metrics, setMetrics] = useState(EMPTY_METRICS);
    const [rows, setRows] = useState([]);
    const [platformHealth, setPlatformHealth] = useState(null);
    const [recentAudit, setRecentAudit] = useState([]);
    const [loading, setLoading] = useState(true);
    const [healthLoading, setHealthLoading] = useState(false);
    const [error, setError] = useState('');
    const [loadedAt, setLoadedAt] = useState(null);

    const loadPlatformDiagnostics = useCallback(async () => {
        setHealthLoading(true);
        try {
            const user = fire.auth().currentUser;
            if (!user) return;
            const token = await user.getIdToken();
            const [healthRes, auditRes] = await Promise.allSettled([
                fetch('/api/platform/health', { headers: { Authorization: `Bearer ${token}` } }),
                fetch('/api/admin/audit-logs?limit=5', { headers: { Authorization: `Bearer ${token}` } }),
            ]);

            if (healthRes.status === 'fulfilled' && healthRes.value.ok) {
                const healthData = await healthRes.value.json();
                setPlatformHealth(healthData);
            }
            if (auditRes.status === 'fulfilled' && auditRes.value.ok) {
                const auditData = await auditRes.value.json();
                setRecentAudit(auditData.logs || []);
            }
        } catch (e) {
            console.warn('[Dashboard] Diagnostic fetch notice:', e.message);
        } finally {
            setHealthLoading(false);
        }
    }, []);

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
        loadPlatformDiagnostics();
    }, [loadPlatformDiagnostics]);

    useEffect(() => { loadDashboard(); }, [loadDashboard]);

    const cards = [
        { label: 'Recorded earnings', value: formatAdminMoney(metrics.earnings, metrics.currency), icon: <FaDollarSign className="h-5 w-5 text-white" aria-hidden="true" />, tone: 'bg-emerald-500' },
        { label: 'Total users', value: metrics.users ?? 'Unavailable', icon: <FaUsers className="h-5 w-5 text-white" aria-hidden="true" />, tone: 'bg-blue-500' },
        { label: 'Resumes created', value: metrics.resumes ?? 'Unavailable', icon: <FaFileAlt className="h-5 w-5 text-white" aria-hidden="true" />, tone: 'bg-violet-500' },
        { label: 'Downloads', value: metrics.downloads ?? 'Unavailable', icon: <FaDownload className="h-5 w-5 text-white" aria-hidden="true" />, tone: 'bg-orange-500' },
    ];

    const healthScore = Number.isFinite(platformHealth?.healthScore) ? platformHealth.healthScore : null;
    const platformStatus = platformHealth?.status || 'UNAVAILABLE';
    const databaseStatus = platformHealth?.subsystems?.database?.status || 'UNAVAILABLE';
    const queueStatus = platformHealth?.subsystems?.queue?.status || 'UNAVAILABLE';
    const tenancyRuntime = platformHealth?.subsystems?.tenancy || null;

    return (
        <div className="min-h-screen bg-slate-50 px-2 py-4 sm:px-4 sm:py-6 space-y-6">
            {/* Top Bar */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        {isSuperAdmin ? 'Super Admin Command Center' : 'Administrator Command Center'}
                    </h1>
                    <p className="mt-1 text-xs text-slate-500">
                        {loading ? 'Loading stored operational aggregates…' : loadedAt ? `Last refreshed ${loadedAt.toLocaleTimeString()} • SHA: ${platformHealth?.commitSha || 'production'}` : 'Not loaded'}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={loadDashboard}
                        disabled={loading || healthLoading}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-50 transition"
                    >
                        <FaSyncAlt className={loading || healthLoading ? 'animate-spin' : ''} aria-hidden="true" /> Refresh Telemetry
                    </button>
                </div>
            </div>

            {/* Error Alert */}
            {error && (
                <div role="alert" className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900">
                    <FaExclamationTriangle className="mt-0.5 flex-none" aria-hidden="true" />
                    <div><p>{error}</p><button type="button" onClick={loadDashboard} className="mt-2 font-semibold underline">Retry</button></div>
                </div>
            )}

            {/* Platform Health Score Banner */}
            {platformHealth && (
                <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-2xs">
                    <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className={`relative flex items-center justify-center h-16 w-16 rounded-2xl shrink-0 font-black text-xl text-white shadow-md ${
                                healthScore === null ? 'bg-gradient-to-tr from-slate-600 to-slate-400' :
                                healthScore >= 80 ? 'bg-gradient-to-tr from-emerald-600 to-teal-400' :
                                healthScore >= 50 ? 'bg-gradient-to-tr from-amber-600 to-yellow-400' :
                                'bg-gradient-to-tr from-red-600 to-rose-400'
                            }`}>
                                {healthScore ?? '—'}
                                {healthScore !== null && <span className="text-[10px] absolute bottom-1 font-semibold opacity-80">/ 100</span>}
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h2 className="text-base font-extrabold text-slate-900">Platform Health Index</h2>
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                                        platformStatus === 'HEALTHY' ? 'bg-emerald-100 text-emerald-800' :
                                        platformStatus === 'DEGRADED' ? 'bg-amber-100 text-amber-800' :
                                        platformStatus === 'UNAVAILABLE' ? 'bg-slate-200 text-slate-700' : 'bg-red-100 text-red-800'
                                    }`}>
                                        {platformStatus}
                                    </span>
                                </div>
                                <p className="text-xs text-slate-500 mt-1">
                                    Uptime: {Math.floor(platformHealth.uptimeSeconds / 3600)}h {Math.floor((platformHealth.uptimeSeconds % 3600) / 60)}m • DB Latency: {platformHealth.subsystems?.database?.latencyMs ?? '—'}ms • Memory: {platformHealth.subsystems?.runtime?.heapUsedMb ?? '—'}MB / {platformHealth.subsystems?.runtime?.heapTotalMb ?? '—'}MB
                                </p>
                            </div>
                        </div>

                        {/* Quick Diagnostic Pills */}
                        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                            <Link to="/adm/audit-logs" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition">
                                <FaShieldAlt className="text-indigo-600" /> Audit Trail
                            </Link>
                            <Link to="/adm/queues" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition">
                                <FiActivity className="text-emerald-600" /> Queue Monitor
                            </Link>
                            {isSuperAdmin && <Link to="/adm/tenants" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition">
                                <FaServer className="text-violet-600" /> Tenants Directory
                            </Link>}
                        </div>
                    </div>

                    {/* Subsystem Health Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-100 text-xs">
                        <div className="p-3 bg-slate-50 rounded-xl">
                            <span className="text-slate-400 uppercase text-[10px] font-extrabold">Database</span>
                            <div className="flex items-center gap-1.5 font-bold text-slate-800 mt-1">
                                {databaseStatus === 'HEALTHY' ? <FaCheckCircle className="text-emerald-500 h-3.5 w-3.5" /> : <FaExclamationCircle className="text-amber-500 h-3.5 w-3.5" />} {databaseStatus}
                            </div>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-xl">
                            <span className="text-slate-400 uppercase text-[10px] font-extrabold">Queue & DLQ</span>
                            <div className="flex items-center gap-1.5 font-bold text-slate-800 mt-1">
                                {queueStatus === 'HEALTHY' ? <FaCheckCircle className="text-emerald-500 h-3.5 w-3.5" /> : <FaExclamationCircle className="text-amber-500 h-3.5 w-3.5" />} {queueStatus === 'UNAVAILABLE' ? 'Telemetry unavailable' : platformHealth.subsystems?.queue?.deadLetterJobs > 0 ? `${platformHealth.subsystems.queue.deadLetterJobs} DLQ items` : queueStatus}
                            </div>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-xl">
                            <span className="text-slate-400 uppercase text-[10px] font-extrabold">Tenancy Runtime</span>
                            <div className="flex items-center gap-1.5 font-bold text-slate-800 mt-1">
                                <FaServer className="text-indigo-500 h-3.5 w-3.5" /> {tenancyRuntime?.dataPlaneConfigured === true ? `Configured (${tenancyRuntime.dataProvider || 'provider'})` : 'Unavailable'}
                            </div>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-xl">
                            <span className="text-slate-400 uppercase text-[10px] font-extrabold">Node Runtime</span>
                            <div className="flex items-center gap-1.5 font-bold text-slate-800 mt-1">
                                <FiCpu className="text-slate-500 h-3.5 w-3.5" /> {platformHealth.subsystems?.runtime?.nodeVersion || 'Unavailable'} {platformHealth.subsystems?.runtime?.platform ? `(${platformHealth.subsystems.runtime.platform})` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Core Metrics Grid */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy={loading}>
                {cards.map(({ label, value, icon, tone }) => (
                    <section key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
                        <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}>{icon}</div>
                        <p className="break-words text-2xl font-bold text-slate-900">{loading ? '—' : value}</p>
                        <p className="mt-1 text-xs text-slate-500 font-medium">{label}</p>
                        <p className="mt-2 text-[11px] text-slate-400">Stored aggregate; no trend inferred</p>
                    </section>
                ))}
            </div>

            {/* Two-Column: Subscriptions + Recent Audit Trail */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Subscriptions */}
                <section className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-4 sm:p-5">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 className="text-sm font-bold text-slate-900">Recent Subscriptions</h2>
                            <p className="text-[11px] text-slate-500">Up to 7 newest subscriber transactions</p>
                        </div>
                        <Link to="/adm/settings?tab=ordersManagement" className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                            All Orders <FaArrowRight className="h-2.5 w-2.5" />
                        </Link>
                    </div>

                    {loading ? (
                        <div className="p-8 text-center text-xs text-slate-500">Loading subscriptions…</div>
                    ) : rows.length === 0 ? (
                        <div className="p-8 text-center text-xs text-slate-500">No recent subscriptions recorded.</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-xs">
                                <thead className="border-b border-slate-100 bg-slate-50/50 text-[10px] font-extrabold uppercase text-slate-400">
                                    <tr>
                                        <th className="py-2 px-3 text-left">User</th>
                                        <th className="py-2 px-3 text-left">Plan</th>
                                        <th className="py-2 px-3 text-left">Provider</th>
                                        <th className="py-2 px-3 text-right">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {rows.map(row => (
                                        <tr key={row.key} className="hover:bg-slate-50/80">
                                            <td className="py-2.5 px-3 font-mono text-[11px] text-slate-700" title={row.userId}>
                                                {row.userId.length > 10 ? `${row.userId.slice(0, 10)}…` : row.userId}
                                            </td>
                                            <td className="py-2.5 px-3 font-semibold text-slate-800">{row.plan}</td>
                                            <td className="py-2.5 px-3 capitalize text-slate-600">{row.paymentProvider}</td>
                                            <td className="py-2.5 px-3 text-right">
                                                <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-extrabold ${row.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
                                                    {row.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>

                {/* Recent Admin Audit Actions */}
                <section className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-4 sm:p-5">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 className="text-sm font-bold text-slate-900">Recent Admin Activity</h2>
                            <p className="text-[11px] text-slate-500">Live operational & security audit events</p>
                        </div>
                        <Link to="/adm/audit-logs" className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                            Full Audit Log <FaArrowRight className="h-2.5 w-2.5" />
                        </Link>
                    </div>

                    {recentAudit.length === 0 ? (
                        <div className="p-8 text-center text-xs text-slate-500">
                            No recent admin mutations recorded yet.
                        </div>
                    ) : (
                        <div className="space-y-2.5">
                            {recentAudit.map(log => (
                                <div key={log.id} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono font-bold text-slate-800 truncate">{log.action}</span>
                                            <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded ${
                                                log.severity === 'HIGH' ? 'bg-red-100 text-red-800' :
                                                log.severity === 'MEDIUM' ? 'bg-amber-100 text-amber-800' :
                                                'bg-slate-200 text-slate-700'
                                            }`}>
                                                {log.severity || 'INFO'}
                                            </span>
                                        </div>
                                        <p className="text-[10px] text-slate-400 truncate mt-0.5">
                                            By {log.actorEmail || log.actorUid} • {log.pathname}
                                        </p>
                                    </div>
                                    <span className="text-[10px] text-slate-400 font-mono shrink-0 ml-2">
                                        {log.createdAt ? new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
};

export default Dashboard;
