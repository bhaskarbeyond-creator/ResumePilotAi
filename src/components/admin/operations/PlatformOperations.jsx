import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiActivity, FiAlertTriangle, FiCheck, FiDatabase, FiLock, FiRefreshCw, FiSave, FiTool } from 'react-icons/fi';
import { formatMetric } from '../../../utils/healthPresentation';
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
  const [maintenance, setMaintenanceState] = useState({ enabled: null, message: '' });
  const [maintenanceRevision, setMaintenanceRevision] = useState(0);
  const [announcements, setAnnouncements] = useState([]);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({ title: '', message: '', severity: 'INFO' });
  const [confirmAction, setConfirmAction] = useState(null);
  const [editing, setEditing] = useState(null);

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
      setMaintenanceState({ enabled: maint.available === false ? null : maint.enabled === true, message: maint.message || '' });
      setMaintenanceRevision(Number(maint.revision) || 0);
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
    if (maintenance.enabled === null) {
      setError('Maintenance status is unavailable. Refresh before changing it.');
      return;
    }
    
    if (maintenance.enabled && confirmAction?.id !== 'maintenance') {
      setConfirmAction({
        id: 'maintenance',
        title: 'Enable Maintenance Mode',
        message: 'Enable public maintenance mode? Non-admin visitors will see the maintenance banner and will not be able to access the platform.',
        confirmText: 'Enable Maintenance',
        danger: true,
        action: () => executeSaveMaint()
      });
      return;
    }
    
    await executeSaveMaint();
  };

  const executeSaveMaint = async () => {
    setConfirmAction(null);
    setSaving(true);
    setNotice(null);
    try {
      const result = await setMaintenance({ ...maintenance, expectedRevision: maintenanceRevision });
      setMaintenanceRevision(Number(result.revision) || maintenanceRevision + 1);
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
      await updateAnnouncement(item.id, { enabled: !item.enabled, expectedRevision: item.revision });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const confirmDeleteAnnouncement = (item) => {
    setConfirmAction({
      id: `delete-${item.id}`,
      title: 'Delete Announcement',
      message: `Permanently delete announcement "${item.title}"? This cannot be undone.`,
      confirmText: 'Delete',
      danger: true,
      action: async () => {
        setConfirmAction(null);
        try {
          await deleteAnnouncement(item.id, item.revision);
          load();
        } catch (err) {
          setError(err.message);
        }
      }
    });
  };

  const saveEdit = async (event) => {
    event.preventDefault();
    if (!isSuperAdmin || !editing) return;
    setSaving(true);
    try {
      await updateAnnouncement(editing.id, { title: editing.title, message: editing.message, severity: editing.severity, expectedRevision: editing.revision });
      setEditing(null);
      setNotice('Announcement updated.');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
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
            {/* A latency of 0 ms is not a plausible reading — it means the
                metric was absent. Show that instead of inventing a number. */}
            <Stat label="Samples" value={metrics.sampleCount} />
            <Stat label="p50 ms" value={metrics.p50 == null ? null : Math.round(metrics.p50)} />
            <Stat label="p95 ms" value={metrics.p95 == null ? null : Math.round(metrics.p95)} />
            <Stat label="5xx" value={metrics.errors?.serverErrors} />
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
              <input type="checkbox" checked={maintenance.enabled === true} disabled={!isSuperAdmin || maintenance.enabled === null} onChange={e => setMaintenanceState(current => ({ ...current, enabled: e.target.checked }))} />
              Enable public maintenance banner {maintenance.enabled === null ? '(status unavailable)' : ''}
            </label>
            <textarea className="w-full rounded-xl border border-slate-200 p-2" rows={3} disabled={!isSuperAdmin} value={maintenance.message} onChange={e => setMaintenanceState(current => ({ ...current, message: e.target.value }))} />
            <button type="submit" disabled={!isSuperAdmin || saving || maintenance.enabled === null} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white font-bold disabled:opacity-50"><FiSave /> {isSuperAdmin ? 'Save maintenance' : 'Super Admin only'}</button>
          </form>
        </section>
      </div>

      {editing && (
        <form onSubmit={saveEdit} className="bg-white border border-indigo-200 rounded-2xl p-4 grid gap-2 sm:grid-cols-2 text-xs">
          <h2 className="sm:col-span-2 font-bold text-slate-900">Edit announcement</h2>
          <input required className="rounded-xl border border-slate-200 px-3 py-2" value={editing.title} onChange={e => setEditing(current => ({ ...current, title: e.target.value }))} />
          <select className="rounded-xl border border-slate-200 px-3 py-2" value={editing.severity} onChange={e => setEditing(current => ({ ...current, severity: e.target.value }))}>
            <option value="INFO">Info</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
          </select>
          <textarea required className="sm:col-span-2 rounded-xl border border-slate-200 px-3 py-2" rows={2} value={editing.message} onChange={e => setEditing(current => ({ ...current, message: e.target.value }))} />
          <div className="sm:col-span-2 flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(null)} className="px-3 py-2 rounded-xl border border-slate-200 font-bold">Cancel</button>
            <button type="submit" disabled={saving} className="px-3 py-2 rounded-xl bg-indigo-600 text-white font-bold">Save changes</button>
          </div>
        </form>
      )}

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
                  <button type="button" onClick={() => setEditing(item)} className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white font-bold">Edit</button>
                  <button type="button" onClick={() => toggleAnnouncement(item)} className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white font-bold">{item.enabled ? 'Disable' : 'Enable'}</button>
                  <button type="button" onClick={() => confirmDeleteAnnouncement(item)} className="px-2.5 py-1 rounded-lg border border-red-200 bg-white text-red-700 font-bold">Delete</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Confirmation Modal */}
      {confirmAction && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
          onClick={() => setConfirmAction(null)}
        >
          <div
            className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col transform transition-all"
            onClick={e => e.stopPropagation()}
          >
            <div className={`p-4 border-b border-slate-100 flex items-center gap-3 ${confirmAction.danger ? 'bg-red-50' : 'bg-slate-50'}`}>
              {confirmAction.danger ? <FiAlertTriangle className="text-red-600 h-5 w-5" /> : <FiTool className="text-indigo-600 h-5 w-5" />}
              <h3 className={`font-bold ${confirmAction.danger ? 'text-red-900' : 'text-slate-900'}`}>
                {confirmAction.title}
              </h3>
            </div>
            <div className="p-5 text-sm text-slate-600 leading-relaxed">
              {confirmAction.message}
            </div>
            <div className="p-4 pt-2 flex justify-end gap-3 bg-slate-50 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold hover:bg-slate-50 transition shadow-2xs text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmAction.action}
                className={`px-4 py-2 rounded-xl text-white font-bold transition shadow-xs text-xs ${
                  confirmAction.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                {confirmAction.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  // formatMetric keeps a real 0 but turns null/undefined into
  // "Data unavailable", so a missing sample can never read as a measured zero.
  const missing = value === null || value === undefined || value === '';
  return (
    <div className="rounded-xl bg-slate-50 p-2">
      <p className="text-[10px] uppercase font-extrabold text-slate-400">{label}</p>
      <p className={missing ? 'text-xs font-semibold text-slate-500' : 'font-black text-slate-900'}>
        {formatMetric(value)}
      </p>
    </div>
  );
}
