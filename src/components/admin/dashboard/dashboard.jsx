import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FaDollarSign, FaUsers, FaFileAlt, FaDownload, FaExclamationTriangle, FaSyncAlt,
  FaShieldAlt, FaServer, FaCheckCircle, FaExclamationCircle, FaArrowRight, FaHeartbeat,
} from 'react-icons/fa';
import { FiActivity, FiCpu, FiLock } from 'react-icons/fi';
import { formatAdminMoney } from '../../../utils/adminData';
import { getCommandCenter } from '../../../services/platformApi';
import { describeOverall, formatCheckedAt, formatMetric, formatUptime } from '../../../utils/healthPresentation';

const Dashboard = () => {
  const [center, setCenter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loadedAt, setLoadedAt] = useState(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getCommandCenter();
      setCenter(data);
      setLoadedAt(new Date());
    } catch (err) {
      setError(err.message || 'Command center telemetry is unavailable.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const healthScore = center?.healthScore ?? null;
  const riskScore = center?.riskScore ?? null;
  const cards = [
    { label: 'Recorded earnings', value: center ? formatAdminMoney(center.kpis?.totalEarnings, center.kpis?.currency) : '—', icon: <FaDollarSign className="h-5 w-5 text-white" />, tone: 'bg-emerald-500' },
    { label: 'Total users', value: center?.kpis?.totalUsers ?? 'Unavailable', icon: <FaUsers className="h-5 w-5 text-white" />, tone: 'bg-blue-500' },
    { label: 'Resumes created', value: center?.kpis?.resumesCreated ?? 'Unavailable', icon: <FaFileAlt className="h-5 w-5 text-white" />, tone: 'bg-violet-500' },
    { label: 'Downloads', value: center?.kpis?.totalDownloads ?? 'Unavailable', icon: <FaDownload className="h-5 w-5 text-white" />, tone: 'bg-orange-500' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 px-2 py-4 sm:px-4 sm:py-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Super Admin Command Center</h1>
          <p className="mt-1 text-xs text-slate-500">
            {loading ? 'Loading verified platform telemetry…' : loadedAt ? `Last refreshed ${loadedAt.toLocaleTimeString()} • SHA: ${center?.commitSha || 'unverified'}` : 'Not loaded'}
          </p>
        </div>
        <button type="button" onClick={loadDashboard} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-50">
          <FaSyncAlt className={loading ? 'animate-spin' : ''} /> Refresh Telemetry
        </button>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900">
          <FaExclamationTriangle className="mt-0.5 flex-none" />
          <div><p>{error}</p><button type="button" onClick={loadDashboard} className="mt-2 font-semibold underline">Retry</button></div>
        </div>
      )}

      {center && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-2xs">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <ScoreBadge score={healthScore} label="Health" good />
              <ScoreBadge score={riskScore} label="Risk" invert />
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-extrabold text-slate-900">Platform Health Index</h2>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${center.status === 'HEALTHY' ? 'bg-emerald-100 text-emerald-800' : center.status === 'DEGRADED' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`}>{center.status}</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Uptime: {formatUptime(center.uptimeSeconds)} • DB Latency: {formatMetric(center.subsystems?.database?.latencyMs)}{center.subsystems?.database?.latencyMs == null ? '' : 'ms'} • Memory: {formatMetric(center.subsystems?.runtime?.heapUsedMb)}{center.subsystems?.runtime?.heapUsedMb == null ? '' : 'MB'}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
              <Link to="/adm/audit-logs" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700"><FaShieldAlt className="text-indigo-600" /> Audit Trail</Link>
              <Link to="/adm/queues" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700"><FiActivity className="text-emerald-600" /> Queue Monitor</Link>
              <Link to="/adm/tenants" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700"><FaServer className="text-violet-600" /> Tenants</Link>
              <Link to="/adm/security" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700"><FiLock className="text-rose-600" /> Security</Link>
              <Link to="/adm/health" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700"><FaHeartbeat className="text-emerald-600" /> Platform Health</Link>
              <Link to="/adm/feature-flags" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700"><FiCpu className="text-blue-600" /> Feature Flags</Link>
              <Link to="/adm/attention" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700">Attention</Link>
              <Link to="/adm/operations" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700">Operations</Link>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-4 pt-4 border-t border-slate-100 text-xs">
            <Signal label="Database" ok={center.signals?.database?.status === 'HEALTHY'} text={center.signals?.database?.status === 'HEALTHY' ? 'Firestore Active' : 'Unavailable'} />
            <Signal label="Queue & DLQ" ok={!center.signals?.queue?.deadLetter} text={center.signals?.queue?.deadLetter ? `${center.signals.queue.deadLetter} DLQ (sampled)` : 'Outbox sample healthy'} />
            <Signal label="Payments" ok={center.signals?.payments?.status === 'HEALTHY'} text={center.signals?.payments?.status === 'UNAVAILABLE' ? 'Count unavailable' : `${center.signals?.payments?.failed ?? '—'} failed`} />
            <Signal label="Security" ok={center.signals?.security?.status === 'HEALTHY'} text={center.signals?.security?.status === 'UNAVAILABLE' ? 'Count unavailable' : `${center.signals?.security?.highSeverity ?? '—'} high`} />
            <Signal label="Encryption" ok={center.signals?.encryption?.status === 'CONFIGURED'} text={center.signals?.encryption?.provider || 'none'} />
            <Signal
              label="Feature Flags"
              ok={Number(center?.signals?.featureFlags?.total) > 0}
              text={Number(center?.signals?.featureFlags?.total) > 0
                ? `${center.signals.featureFlags.enabled} enabled`
                : 'Status unavailable'}
            />
            <Signal label="Runtime" ok icon={<FiCpu className="text-slate-500 h-3.5 w-3.5" />} text={center.subsystems?.runtime?.nodeVersion || '—'} />
          </div>
        </div>
      )}

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

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Operational status</h2>
            <p className="text-[11px] text-slate-500">Live state of core services, integrations, and workers.</p>
          </div>
          <Link to="/adm/health" className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700">
            Platform Health <FaArrowRight className="h-2.5 w-2.5" />
          </Link>
        </div>
        {center?.operationalStatus ? (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${describeOverall(center.operationalStatus.overall).dot}`} />
              <span className="text-sm font-extrabold text-slate-900">{describeOverall(center.operationalStatus.overall).label}</span>
              <span className="text-[11px] text-slate-500">Last checked {formatCheckedAt(center.operationalStatus.checkedAt)}</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-2.5">
                <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Endpoints checked</p>
                <p className="mt-0.5 text-lg font-black text-slate-900">{center.operationalStatus.apiMatrix?.total ?? 'Data unavailable'}</p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-2.5">
                <p className="text-[10px] font-extrabold uppercase tracking-wide text-emerald-700">Operational / expected</p>
                <p className="mt-0.5 text-lg font-black text-emerald-800">{center.operationalStatus.apiMatrix?.operationalOrExpected ?? 'Data unavailable'}</p>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-2.5">
                <p className="text-[10px] font-extrabold uppercase tracking-wide text-amber-800">Degraded</p>
                <p className="mt-0.5 text-lg font-black text-amber-900">{center.operationalStatus.apiMatrix?.degraded ?? 'Data unavailable'}</p>
              </div>
              <div className="rounded-xl border border-red-200 bg-red-50/60 p-2.5">
                <p className="text-[10px] font-extrabold uppercase tracking-wide text-red-700">Unavailable</p>
                <p className="mt-0.5 text-lg font-black text-red-800">{center.operationalStatus.apiMatrix?.unavailable ?? 'Data unavailable'}</p>
              </div>
            </div>
            {(center.operationalStatus.attention || []).length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {center.operationalStatus.attention.slice(0, 5).map(item => (
                  <li key={item.id}>
                    <Link to={`/adm/health?service=${encodeURIComponent(item.id)}`} className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 p-2.5 hover:border-indigo-200">
                      <span className="min-w-0">
                        <span className="block text-xs font-bold text-slate-900">{item.name}</span>
                        <span className="mt-0.5 block truncate text-[11px] text-slate-500">{item.reason}</span>
                      </span>
                      <span className={`flex-none rounded-full px-2 py-0.5 text-[10px] font-extrabold ${item.state === 'UNAVAILABLE' ? 'bg-red-100 text-red-800' : item.state === 'DEGRADED' ? 'bg-amber-100 text-amber-800' : 'bg-violet-100 text-violet-800'}`}>{item.state}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
            Operational status data unavailable — the health collector did not respond. No status is inferred.
          </p>
        )}
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5">
        <h2 className="text-sm font-bold text-slate-900">What should the Super Admin do next?</h2>
        <p className="text-[11px] text-slate-500">Recommendations are derived only from inspected sources. Missing sources are not estimated.</p>
        <div className="mt-3 space-y-2">
          {(center?.recommendations || []).map(item => (
            <Link key={item.id} to={item.href || '/adm/dashboard'} className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 hover:border-indigo-200">
              <div>
                <p className="text-xs font-bold text-slate-900">{item.title}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{item.detail}</p>
              </div>
              <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${item.severity === 'HIGH' ? 'bg-red-100 text-red-800' : item.severity === 'MEDIUM' ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-700'}`}>{item.severity}</span>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Tenants needing attention</h2>
              <p className="text-[11px] text-slate-500">Non-ACTIVE lifecycle states from the platform registry</p>
            </div>
            <Link to="/adm/tenants" className="text-xs font-bold text-indigo-600 flex items-center gap-1">Registry <FaArrowRight className="h-2.5 w-2.5" /></Link>
          </div>
          {(center?.attentionTenants || []).length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">No suspended or decommissioning tenants in the inspected sample.</div>
          ) : (
            <div className="space-y-2">
              {center.attentionTenants.map(tenant => (
                <Link key={tenant.id} to={`/adm/tenants?focus=${encodeURIComponent(tenant.id)}`} className="flex items-center justify-between rounded-xl bg-slate-50 p-2.5 text-xs">
                  <span className="font-bold text-slate-800">{tenant.displayName}</span>
                  <span className="font-extrabold text-amber-700">{tenant.lifecycleState}</span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Recent Admin Activity</h2>
              <p className="text-[11px] text-slate-500">Live operational & security audit events</p>
            </div>
            <Link to="/adm/audit-logs" className="text-xs font-bold text-indigo-600 flex items-center gap-1">Full Audit Log <FaArrowRight className="h-2.5 w-2.5" /></Link>
          </div>
          {(center?.recentAudit || []).length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">No recent admin mutations recorded yet.</div>
          ) : (
            <div className="space-y-2.5">
              {center.recentAudit.map(log => (
                <div key={log.id} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-800 truncate">{log.action}</span>
                      <span className={`text-[9px] font-extrabold uppercase px-1.5 rounded ${log.severity === 'HIGH' ? 'bg-red-100 text-red-800' : log.severity === 'MEDIUM' ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-700'}`}>{log.severity || 'INFO'}</span>
                    </div>
                    <p className="text-[10px] text-slate-400 truncate mt-0.5">By {log.actorEmail} • {log.pathname}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {center?.maintenance?.enabled && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900 flex items-center gap-2">
          <FaExclamationTriangle /> Maintenance mode is enabled: {center.maintenance.message}
          <Link to="/adm/operations" className="ml-auto font-bold underline">Manage</Link>
        </div>
      )}
    </div>
  );
};

function ScoreBadge({ score, label, invert }) {
  const value = score ?? '—';
  const tone = invert
    ? (score === null ? 'bg-slate-400' : score >= 50 ? 'bg-gradient-to-tr from-red-600 to-rose-400' : score >= 20 ? 'bg-gradient-to-tr from-amber-600 to-yellow-400' : 'bg-gradient-to-tr from-emerald-600 to-teal-400')
    : (score === null ? 'bg-slate-400' : score >= 80 ? 'bg-gradient-to-tr from-emerald-600 to-teal-400' : score >= 50 ? 'bg-gradient-to-tr from-amber-600 to-yellow-400' : 'bg-gradient-to-tr from-red-600 to-rose-400');
  return (
    <div className={`relative flex items-center justify-center h-16 w-16 rounded-2xl shrink-0 font-black text-xl text-white shadow-md ${tone}`}>
      {value}
      <span className="text-[9px] absolute bottom-1 font-semibold opacity-80">{label}</span>
    </div>
  );
}

function Signal({ label, ok, text, icon }) {
  return (
    <div className="p-3 bg-slate-50 rounded-xl">
      <span className="text-slate-400 uppercase text-[10px] font-extrabold">{label}</span>
      <div className="flex items-center gap-1.5 font-bold text-slate-800 mt-1">
        {icon || (ok ? <FaCheckCircle className="text-emerald-500 h-3.5 w-3.5" /> : <FaExclamationCircle className="text-amber-500 h-3.5 w-3.5" />)}
        <span className="truncate">{text}</span>
      </div>
    </div>
  );
}

export default Dashboard;
