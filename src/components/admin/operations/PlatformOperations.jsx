import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiActivity, FiAlertTriangle, FiCheck, FiDatabase, FiLock, FiRefreshCw, FiSave, FiTool } from 'react-icons/fi';
import { useAdminSession } from '../AdminContext';
import {
  deleteAnnouncement,
  getAnnouncements,
  getBackupStatus,
  getEncryptionStatus,
  getEnterpriseQueue,
  getMaintenance,
  getObservability,
  saveAnnouncement,
  setMaintenance,
  updateAnnouncement,
} from '../../../services/platformApi';

export default function PlatformOperations() {
  const { isSuperAdmin } = useAdminSession();
  const [encryption, setEncryption] = useState(null);
  const [observability, setObservability] = useState(null);
  const [backup, setBackup] = useState(null);
  const [enterpriseQueue, setEnterpriseQueue] = useState(null);
  const [maintenance, setMaintenanceState] = useState({ enabled: false, message: '' });
  const [announcements, setAnnouncements] = useState([]);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({ title: '', message: '', severity: 'INFO' });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [enc, obs, bak, maint, notes, entQueue] = await Promise.all([
        getEncryptionStatus(),
        getObservability(),
        getBackupStatus(),
        getMaintenance(),
        getAnnouncements(),
        getEnterpriseQueue(),
      ]);
      setEncryption(enc);
      setObservability(obs);
      setBackup(bak);
      setEnterpriseQueue(entQueue);
      setMaintenanceState({ enabled: maint.enabled === true, message: maint.message || '' });
      setAnnouncements(notes.announcements || []);
    } catch (err) {
      setError(err.message || 'Failed to load operations telemetry');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveMaint = async (event) => {
    event.preventDefault();
    if (!isSuperAdmin) return;
    if (maintenance.enabled && !window.confirm('Enable public maintenance mode? Non-admin visitors will see the maintenance banner.')) {
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      await setMaintenance(maintenance);
      setNotice('Maintenance state saved and audited.');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const publish = async (event) => {
    event.preventDefault();
    if (!isSuperAdmin) return;
    setSaving(true);
    try {
      await saveAnnouncement({ ...draft, enabled: true });
      setDraft({ title: '', message: '', severity: 'INFO' });
      setNotice('Announcement published.');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleAnnouncement = async (item) => {
    if (!isSuperAdmin) return;
    try {
      await updateAnnouncement(item.id, { enabled: !item.enabled });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const enc = encryption?.encryption || {};
  const metrics = observability?.metrics || {};

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><FiTool className="text-indigo-600" /> Platform Operations</h1>
          <p className="text-sm text-slate-500 mt-1">Encryption, observability, backup capability, maintenance, and announcements. Super Admin mutations only.</p>
        </div>
        <button type="button" onClick={load} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold"><FiRefreshCw className={loading ? 'animate-spin' : ''} /> Refresh</button>
      </div>

      {error && <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-800 flex justify-between"><span className="flex items-center gap-2"><FiAlertTriangle />{error}</span><button type="button" className="font-bold underline" onClick={load}>Retry</button></div>}
      {notice && <div role="status" className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-800 flex items-center gap-2"><FiCheck />{notice}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="bg-white rounded-2xl border border-slate-200 p-4">
          <h2 className="font-bold text-slate-900 flex items-center gap-2"><FiLock /> Encryption</h2>
          <p className="text-xs text-slate-500 mt-1">Status is read from the existing Enterprise encryption provider. Keys are never displayed.</p>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div><dt className="text-slate-400 font-bold uppercase">Provider</dt><dd className="font-semibold">{enc.provider || '—'}</dd></div>
            <div><dt className="text-slate-400 font-bold uppercase">Configured</dt><dd className="font-semibold">{enc.configured ? 'Yes' : 'No'}</dd></div>
            <div><dt className="text-slate-400 font-bold uppercase">Level</dt><dd className="font-semibold break-all">{enc.securityLevel || '—'}</dd></div>
            <div><dt className="text-slate-400 font-bold uppercase">Active version</dt><dd className="font-semibold">{enc.activeVersion || '—'}</dd></div>
          </dl>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-4">
          <h2 className="font-bold text-slate-900 flex items-center gap-2"><FiActivity /> Observability</h2>
          <p className="text-xs text-slate-500 mt-1">{observability?.note}</p>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <Stat label="Samples" value={metrics.sampleCount ?? 0} />
            <Stat label="p50 ms" value={Math.round(metrics.p50 || 0)} />
            <Stat label="p95 ms" value={Math.round(metrics.p95 || 0)} />
            <Stat label="5xx" value={metrics.errors?.serverErrors ?? 0} />
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-4">
          <h2 className="font-bold text-slate-900 flex items-center gap-2"><FiDatabase /> Backup capability</h2>
          <p className="text-xs text-slate-500 mt-1">{backup?.capability?.note}</p>
          <p className="mt-3 text-sm font-semibold">Available: {backup?.capability?.available ? 'Yes' : 'No'}</p>
          <p className="text-xs text-slate-500 mt-1">Last recorded tenant export: {backup?.lastRecordedExport?.createdAt || 'None in admin audit sample'}</p>
          <Link to="/enterprise?tab=settings" className="inline-block mt-3 text-xs font-bold text-indigo-700">Open Enterprise tenant export →</Link>
          <p className="mt-3 text-xs text-slate-500">{enterpriseQueue?.note}</p>
          <p className="text-xs font-semibold">Enterprise outbox: {enterpriseQueue?.queue?.status || 'unavailable'} · DLQ {enterpriseQueue?.queue?.deadLetterCount ?? '—'}</p>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-4">
          <h2 className="font-bold text-slate-900 flex items-center gap-2"><FiTool /> Maintenance mode</h2>
          <form onSubmit={saveMaint} className="mt-3 space-y-3 text-xs">
            <label className="flex items-center gap-2 font-semibold">
              <input type="checkbox" checked={maintenance.enabled} disabled={!isSuperAdmin} onChange={e => setMaintenanceState(current => ({ ...current, enabled: e.target.checked }))} />
              Enable public maintenance banner
            </label>
            <textarea className="w-full rounded-xl border border-slate-200 p-2" rows={3} disabled={!isSuperAdmin} value={maintenance.message} onChange={e => setMaintenanceState(current => ({ ...current, message: e.target.value }))} />
            <button type="submit" disabled={!isSuperAdmin || saving} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white font-bold disabled:opacity-50"><FiSave /> {isSuperAdmin ? 'Save maintenance' : 'Super Admin only'}</button>
          </form>
        </section>
      </div>

      <section className="bg-white rounded-2xl border border-slate-200 p-4">
        <h2 className="font-bold text-slate-900">Platform announcements</h2>
        <p className="text-xs text-slate-500 mt-1">Operator-visible notices stored in `platform_announcements`. Super Admin publish/disable only.</p>
        {isSuperAdmin && (
          <form onSubmit={publish} className="mt-4 grid gap-2 sm:grid-cols-2 text-xs">
            <input required placeholder="Title" className="rounded-xl border border-slate-200 px-3 py-2" value={draft.title} onChange={e => setDraft(current => ({ ...current, title: e.target.value }))} />
            <select className="rounded-xl border border-slate-200 px-3 py-2" value={draft.severity} onChange={e => setDraft(current => ({ ...current, severity: e.target.value }))}>
              <option value="INFO">Info</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </select>
            <textarea required className="sm:col-span-2 rounded-xl border border-slate-200 px-3 py-2" rows={2} placeholder="Message" value={draft.message} onChange={e => setDraft(current => ({ ...current, message: e.target.value }))} />
            <button type="submit" disabled={saving} className="sm:col-span-2 justify-self-end px-3 py-2 rounded-xl bg-indigo-600 text-white font-bold">Publish</button>
          </form>
        )}
        <div className="mt-4 space-y-2">
          {announcements.length === 0 ? <p className="text-xs text-slate-500">No announcements recorded.</p> : announcements.map(item => (
            <div key={item.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs">
              <div>
                <p className="font-bold text-slate-900">{item.title} <span className="text-slate-400 font-semibold">{item.severity}</span></p>
                <p className="text-slate-600">{item.message}</p>
              </div>
              {isSuperAdmin && (
                <div className="flex gap-2">
                  <button type="button" onClick={() => toggleAnnouncement(item)} className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white font-bold">{item.enabled ? 'Disable' : 'Enable'}</button>
                  <button type="button" onClick={async () => { if (!window.confirm(`Permanently delete announcement “${item.title}”? This cannot be undone.`)) return; try { await deleteAnnouncement(item.id); load(); } catch (err) { setError(err.message); } }} className="px-2.5 py-1 rounded-lg border border-red-200 bg-white text-red-700 font-bold">Delete</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl bg-slate-50 p-2">
      <p className="text-[10px] uppercase font-extrabold text-slate-400">{label}</p>
      <p className="font-black text-slate-900">{value}</p>
    </div>
  );
}
