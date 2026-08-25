import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FaDollarSign, FaUsers, FaFileAlt, FaDownload, FaExclamationTriangle, FaSyncAlt,
  FaShieldAlt, FaServer, FaCheckCircle, FaExclamationCircle, FaArrowRight, FaHeartbeat,
} from 'react-icons/fa';
import { FiActivity, FiCpu, FiLock, FiAlertTriangle, FiLayers, FiRadio, FiCheck, FiArrowUpRight } from 'react-icons/fi';
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

  const currencyCode = center?.kpis?.currency || 'INR';
  const currencySymbol = center?.kpis?.currencySymbol || (
    currencyCode === 'INR' ? '₹' :
    currencyCode === 'EUR' ? '€' :
    currencyCode === 'GBP' ? '£' :
    currencyCode === 'CAD' ? 'CA$' :
    currencyCode === 'AUD' ? 'A$' :
    currencyCode === 'JPY' ? '¥' :
    currencyCode === 'AED' ? 'AED ' :
    '$'
  );

  const cards = [
    {
      label: 'Recorded Platform Earnings',
      value: center ? formatAdminMoney(center.kpis?.totalEarnings, currencyCode) : '—',
      icon: (
        <span
          data-testid="currency-symbol-icon"
          className="font-black text-base text-emerald-600 flex items-center justify-center h-5 w-5 leading-none select-none font-sans"
          title={`System Currency: ${currencyCode}`}
        >
          {currencySymbol.trim()}
        </span>
      ),
      badgeBg: 'bg-emerald-50 border-emerald-100',
      sub: 'Verified transactional gross revenue',
    },
    {
      label: 'Total Registered Accounts',
      value: center?.kpis?.totalUsers ?? 'Unavailable',
      icon: <FaUsers className="h-5 w-5 text-blue-600" />,
      badgeBg: 'bg-blue-50 border-blue-100',
      sub: 'Active consumer & employer profiles',
    },
    {
      label: 'Resumes & Portfolios Engineered',
      value: center?.kpis?.resumesCreated ?? 'Unavailable',
      icon: <FaFileAlt className="h-5 w-5 text-violet-600" />,
      badgeBg: 'bg-violet-50 border-violet-100',
      sub: '51 template engines compiled',
    },
    {
      label: 'Exports & Downloads Generated',
      value: center?.kpis?.totalDownloads ?? 'Unavailable',
      icon: <FaDownload className="h-5 w-5 text-amber-600" />,
      badgeBg: 'bg-amber-50 border-amber-100',
      sub: 'High-fidelity PDF and DOCX pipelines',
    },
  ];

  return (
    <div className="space-y-6">
      {/* ── Executive Mission Control Hero Banner ── */}
      <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2 max-w-2xl">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black tracking-wider uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              {center?.status === 'HEALTHY' ? 'System Fully Operational' : center?.status === 'DEGRADED' ? 'System Degraded' : 'Platform Telemetry Online'}
            </span>
            {center?.commitSha && (
              <span className="px-2.5 py-1 rounded-full text-[11px] font-mono font-bold bg-slate-800/80 text-slate-300 border border-slate-700">
                SHA: {center.commitSha.substring(0, 7)}
              </span>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Platform Command Center
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
            Real-time multi-tenant telemetry, operational health telemetry, security event stream, and governance radar.
          </p>
          <div className="flex items-center gap-4 text-xs text-slate-400 font-mono pt-1">
            <span>Uptime: <strong className="text-white">{center ? formatUptime(center.uptimeSeconds) : '—'}</strong></span>
            <span>•</span>
            <span>Refreshed: <strong className="text-slate-300">{loadedAt ? loadedAt.toLocaleTimeString() : 'Loading…'}</strong></span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={loadDashboard}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition border border-white/10 shadow-sm backdrop-blur-xs disabled:opacity-50"
          >
            <FaSyncAlt className={loading ? 'animate-spin' : ''} />
            <span>Refresh Stream</span>
          </button>
          <Link
            to="/adm/health"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition shadow-md shadow-indigo-600/30"
          >
            <FaHeartbeat />
            <span>Health Matrix</span>
          </Link>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-start justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900 shadow-2xs">
          <div className="flex items-center gap-2 font-medium">
            <FaExclamationTriangle className="text-amber-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button type="button" onClick={loadDashboard} className="font-bold underline text-amber-800">Retry</button>
        </div>
      )}

      {/* ── 4 KPI Metric Cards ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ label, value, icon, badgeBg, sub }) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-500 tracking-wide uppercase">{label}</span>
              <div className={`flex h-9 w-9 items-center justify-center rounded-xl border ${badgeBg}`}>
                {icon}
              </div>
            </div>
            <p className="break-words text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {loading ? '—' : value}
            </p>
            <p className="mt-2 text-[11px] font-medium text-slate-500">{sub}</p>
            <p className="mt-1 text-[10px] text-slate-400">Stored aggregate; no trend inferred</p>
          </div>
        ))}
      </div>

      {/* ── Platform Health Index & Telemetry Subsystems ── */}
      {center && (
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-2xs space-y-5">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <ScoreBadge score={healthScore} label="Health" good />
              <ScoreBadge score={riskScore} label="Risk" invert />
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-extrabold text-slate-900">Platform Subsystem Integrity</h2>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                    center.status === 'HEALTHY' ? 'bg-emerald-100 text-emerald-800' :
                    center.status === 'DEGRADED' ? 'bg-amber-100 text-amber-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {center.status}
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-medium mt-1">
                  Firestore Latency: <strong>{formatMetric(center.subsystems?.database?.latencyMs)}{center.subsystems?.database?.latencyMs == null ? '' : 'ms'}</strong> • Heap Usage: <strong>{formatMetric(center.subsystems?.runtime?.heapUsedMb)}{center.subsystems?.runtime?.heapUsedMb == null ? '' : 'MB'}</strong>
                </p>
              </div>
            </div>

            {/* Quick Control Plane Navigation Shortcuts */}
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
              <Link to="/adm/audit-logs" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-100 transition"><FaShieldAlt /> Audit Trail</Link>
              <Link to="/adm/queues" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-100 transition"><FiActivity /> Queues &amp; DLQ</Link>
              <Link to="/adm/tenants" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-100 transition"><FaServer /> Tenants</Link>
              <Link to="/adm/security" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-100 transition"><FiLock /> Security</Link>
              <Link to="/adm/operations" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition">Operations</Link>
              <Link to="/adm/attention" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-100 transition">Attention</Link>
            </div>
          </div>

          {/* 6 Subsystem Signals Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-3 border-t border-slate-100 text-xs">
            <Signal label="Database" ok={center.signals?.database?.status === 'HEALTHY'} text={center.signals?.database?.status === 'HEALTHY' ? 'Firestore Live' : 'Unavailable'} />
            <Signal label="Queue & DLQ" ok={!center.signals?.queue?.deadLetter} text={center.signals?.queue?.deadLetter ? `${center.signals.queue.deadLetter} DLQ Alert` : 'Outbox Healthy'} />
            <Signal label="Payments" ok={center.signals?.payments?.status === 'HEALTHY'} text={center.signals?.payments?.status === 'UNAVAILABLE' ? 'Gateway Inactive' : `${center.signals?.payments?.failed ?? 0} Failed`} />
            <Signal label="Threat Sensor" ok={center.signals?.security?.status === 'HEALTHY'} text={center.signals?.security?.status === 'UNAVAILABLE' ? 'Sensor Offline' : `${center.signals?.security?.highSeverity ?? 0} High Threats`} />
            <Signal label="Encryption" ok={center.signals?.encryption?.status === 'CONFIGURED'} text={center.signals?.encryption?.provider || 'AES-256 GCM'} />
            <Signal label="Runtime Engine" ok icon={<FiCpu className="text-indigo-600 h-3.5 w-3.5" />} text={center.subsystems?.runtime?.nodeVersion || 'Node.js v20'} />
          </div>
        </div>
      )}

      {/* ── Operational Status & Matrix Ribbon ── */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-2xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">Live Service Matrix</h2>
            <p className="text-xs text-slate-500 mt-0.5">Real-time status of microservices, worker pipelines, and public API gates.</p>
          </div>
          <Link to="/adm/health" className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition">
            Platform Health Diagnostics <FaArrowRight className="h-2.5 w-2.5" />
          </Link>
        </div>

        {center?.operationalStatus ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total Probed Endpoints</p>
                <p className="mt-1 text-xl font-black text-slate-900">{center.operationalStatus.apiMatrix?.total ?? 'Data unavailable'}</p>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3.5">
                <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Operational / Expected</p>
                <p className="mt-1 text-xl font-black text-emerald-800">{center.operationalStatus.apiMatrix?.operationalOrExpected ?? 'Data unavailable'}</p>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3.5">
                <p className="text-[10px] font-black uppercase tracking-wider text-amber-700">Degraded Latency</p>
                <p className="mt-1 text-xl font-black text-amber-800">{center.operationalStatus.apiMatrix?.degraded ?? 'Data unavailable'}</p>
              </div>
              <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-3.5">
                <p className="text-[10px] font-black uppercase tracking-wider text-rose-700">Unavailable / Outage</p>
                <p className="mt-1 text-xl font-black text-rose-800">{center.operationalStatus.apiMatrix?.unavailable ?? 'Data unavailable'}</p>
              </div>
            </div>

            {(center.operationalStatus.attention || []).length > 0 && (
              <div className="space-y-2 pt-1">
                {center.operationalStatus.attention.slice(0, 4).map(item => (
                  <Link
                    key={item.id}
                    to={`/adm/health?service=${encodeURIComponent(item.id)}`}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/60 p-3 hover:bg-slate-50 transition"
                  >
                    <div className="min-w-0">
                      <span className="block text-xs font-bold text-slate-900">{item.name}</span>
                      <span className="text-[11px] text-slate-500 truncate block mt-0.5">{item.reason}</span>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black shrink-0 ${
                      item.state === 'UNAVAILABLE' ? 'bg-red-100 text-red-800' :
                      item.state === 'DEGRADED' ? 'bg-amber-100 text-amber-800' :
                      'bg-indigo-100 text-indigo-800'
                    }`}>
                      {item.state}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
            Operational status data unavailable — the health collector did not respond. No status is inferred.
          </p>
        )}
      </section>

      {/* ── SuperAdmin Next Actions & Recommendations ── */}
      <section className="bg-white rounded-3xl border border-slate-200 p-6 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">SuperAdmin Action Recommendations</h2>
            <p className="text-xs text-slate-500 mt-0.5">Automated signal prioritization derived from active telemetry.</p>
          </div>
          <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-extrabold">
            {(center?.recommendations || []).length} Actions Pending
          </span>
        </div>

        <div className="space-y-2.5">
          {(center?.recommendations || []).length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 rounded-2xl">
              <FiCheck className="h-5 w-5 text-emerald-600 mx-auto mb-1" />
              All systems operating within acceptable parameters. No critical operator action required.
            </div>
          ) : (
            (center?.recommendations || []).map(item => (
              <Link
                key={item.id}
                to={item.href || '/adm/dashboard'}
                className="flex items-start justify-between gap-4 p-4 rounded-2xl border border-slate-200/80 bg-slate-50/50 hover:bg-slate-50 transition"
              >
                <div className="space-y-1 min-w-0">
                  <p className="text-xs font-bold text-slate-900 flex items-center gap-2">
                    <span>{item.title}</span>
                  </p>
                  <p className="text-[11px] text-slate-500">{item.detail}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[10px] font-black px-2.5 py-1 rounded-lg ${
                    item.severity === 'HIGH' ? 'bg-red-100 text-red-800' :
                    item.severity === 'MEDIUM' ? 'bg-amber-100 text-amber-800' :
                    'bg-slate-200 text-slate-700'
                  }`}>
                    {item.severity}
                  </span>
                  <FiArrowUpRight className="text-slate-400" />
                </div>
              </Link>
            ))
          )}
        </div>
      </section>

      {/* ── Twin Mission Feeds: Attention Tenants & Recent Activity ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tenants Needing Attention */}
        <section className="bg-white rounded-3xl border border-slate-200 shadow-2xs p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">Tenants Needing Attention</h2>
              <p className="text-xs text-slate-500 mt-0.5">Suspended, deleting, or degraded organization lifecycles.</p>
            </div>
            <Link to="/adm/tenants" className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
              Registry <FaArrowRight className="h-2.5 w-2.5" />
            </Link>
          </div>

          {(center?.attentionTenants || []).length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl">
              No suspended or decommissioning organizations in platform registry.
            </div>
          ) : (
            <div className="space-y-2">
              {center.attentionTenants.map(tenant => (
                <Link
                  key={tenant.id}
                  to={`/adm/tenants?focus=${encodeURIComponent(tenant.id)}`}
                  className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-200/80 hover:bg-slate-100/80 text-xs transition"
                >
                  <div className="truncate">
                    <span className="font-bold text-slate-900 block truncate">{tenant.displayName}</span>
                    <span className="text-[10px] text-slate-400 font-mono">{tenant.id}</span>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase bg-amber-100 text-amber-800 shrink-0">
                    {tenant.lifecycleState}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Live Admin Audit Stream */}
        <section className="bg-white rounded-3xl border border-slate-200 shadow-2xs p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">Live Security &amp; Audit Stream</h2>
              <p className="text-xs text-slate-500 mt-0.5">Real-time immutable control-plane mutation ledger.</p>
            </div>
            <Link to="/adm/audit-logs" className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
              Full Ledger <FaArrowRight className="h-2.5 w-2.5" />
            </Link>
          </div>

          {(center?.recentAudit || []).length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl">
              No administrative mutations recorded in current operational window.
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {center.recentAudit.map(log => (
                <div key={log.id} className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-200/80 text-xs">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-900 truncate">{log.action}</span>
                      <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${
                        log.severity === 'HIGH' ? 'bg-red-100 text-red-800' :
                        log.severity === 'MEDIUM' ? 'bg-amber-100 text-amber-800' :
                        'bg-slate-200 text-slate-700'
                      }`}>
                        {log.severity || 'INFO'}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 truncate mt-0.5 font-mono">
                      By {log.actorEmail || log.actorUid} • {log.pathname || '/api/admin'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Maintenance Mode Alert Ribbon */}
      {center?.maintenance?.enabled && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2 font-bold">
            <FaExclamationTriangle className="text-amber-600 shrink-0" />
            <span>Active Maintenance Mode: {center.maintenance.message}</span>
          </div>
          <Link to="/adm/operations" className="font-bold underline text-amber-800">Configure Maintenance Mode</Link>
        </div>
      )}
    </div>
  );
};

function ScoreBadge({ score, label, invert }) {
  const value = score ?? '—';
  const tone = invert
    ? (score === null ? 'bg-slate-400' : score >= 50 ? 'bg-gradient-to-tr from-rose-600 to-red-500' : score >= 20 ? 'bg-gradient-to-tr from-amber-500 to-yellow-400' : 'bg-gradient-to-tr from-emerald-600 to-teal-500')
    : (score === null ? 'bg-slate-400' : score >= 80 ? 'bg-gradient-to-tr from-emerald-600 to-teal-500' : score >= 50 ? 'bg-gradient-to-tr from-amber-500 to-yellow-400' : 'bg-gradient-to-tr from-rose-600 to-red-500');
  return (
    <div className={`relative flex flex-col items-center justify-center h-16 w-16 rounded-2xl shrink-0 font-black text-xl text-white shadow-md ${tone}`}>
      <span>{value}</span>
      <span className="text-[9px] font-black uppercase tracking-wider opacity-90 -mt-1">{label}</span>
    </div>
  );
}

function Signal({ label, ok, text, icon }) {
  return (
    <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl">
      <span className="text-slate-400 uppercase text-[10px] font-black tracking-wider block">{label}</span>
      <div className="flex items-center gap-1.5 font-bold text-slate-800 mt-1">
        {icon || (ok ? <FaCheckCircle className="text-emerald-500 h-3.5 w-3.5 shrink-0" /> : <FaExclamationCircle className="text-amber-500 h-3.5 w-3.5 shrink-0" />)}
        <span className="truncate text-xs">{text}</span>
      </div>
    </div>
  );
}

export default Dashboard;

