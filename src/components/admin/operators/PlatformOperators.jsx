import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FiRefreshCw, FiShield, FiAlertTriangle } from 'react-icons/fi';
import { useAdminSession } from '../AdminContext';
import { getOperators, searchPlatform, setOperatorRole } from '../../../services/platformApi';

const ASSIGNABLE = ['ADMIN', 'SUPPORT', 'USER'];

export default function PlatformOperators() {
  const { isSuperAdmin } = useAdminSession();
  const [operators, setOperators] = useState([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState('');
  const [role, setRole] = useState('ADMIN');
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [lookupHint, setLookupHint] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getOperators();
      setOperators(result.operators || []);
      setNote(result.note || '');
    } catch (err) {
      setError(err.message || 'Operators unavailable');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const changeRole = async (targetUid, nextRole) => {
    if (!isSuperAdmin) return;
    if (!window.confirm(`Assign role ${nextRole} to ${targetUid}? Refresh tokens will be revoked. SUPER_ADMIN cannot be assigned here.`)) return;
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      await setOperatorRole(targetUid, nextRole);
      setNotice(`Role ${nextRole} assigned. Refresh tokens were revoked.`);
      setUid('');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const assign = async (event) => {
    event.preventDefault();
    await changeRole(uid.trim(), role);
  };

  const lookupEmail = async () => {
    const needle = uid.trim();
    if (!needle.includes('@')) return;
    try {
      const result = await searchPlatform(needle);
      const match = (result.users || [])[0];
      if (match?.id) {
        setUid(match.id);
        setLookupHint(`Resolved ${match.email || needle} → ${match.id}`);
      } else {
        setLookupHint('No user matched that exact email in the inspected users collection.');
      }
    } catch (err) {
      setLookupHint(err.message);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return operators;
    return operators.filter(op => [op.id, op.email, op.displayName, op.role].some(value => String(value || '').toLowerCase().includes(q)));
  }, [operators, query]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><FiShield className="text-indigo-600" /> Platform Operators</h1>
          <p className="text-sm text-slate-500 mt-1">SUPER_ADMIN, Platform Admin (ADMIN), and SUPPORT. Tenant roles live in /enterprise.</p>
        </div>
        <button type="button" onClick={load} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold"><FiRefreshCw className={loading ? 'animate-spin' : ''} /> Refresh</button>
      </div>
      {note && <p className="text-xs text-slate-500">{note}</p>}
      {error && <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-800 flex justify-between"><span className="flex items-center gap-2"><FiAlertTriangle />{error}</span><button type="button" className="font-bold underline" onClick={load}>Retry</button></div>}
      {notice && <div role="status" className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-800">{notice}</div>}

      {isSuperAdmin && (
        <form onSubmit={assign} className="bg-white border border-slate-200 rounded-2xl p-4 grid gap-3 sm:grid-cols-3 text-xs">
          <input required className="rounded-xl border border-slate-200 px-3 py-2 font-mono" placeholder="Firebase UID or exact email" value={uid} onChange={e => setUid(e.target.value)} onBlur={lookupEmail} />
          <select className="rounded-xl border border-slate-200 px-3 py-2 font-bold" value={role} onChange={e => setRole(e.target.value)}>
            {ASSIGNABLE.map(value => <option key={value} value={value}>{value === 'ADMIN' ? 'ADMIN (Platform Admin)' : value}</option>)}
          </select>
          <button type="submit" disabled={saving} className="rounded-xl bg-slate-900 text-white font-bold">{saving ? 'Saving…' : 'Assign role'}</button>
          <p className="sm:col-span-3 text-slate-500">SUPER_ADMIN cannot be assigned or revoked here. SUPPORT cannot open /adm. ADMIN is the Platform Admin.{lookupHint ? ` ${lookupHint}` : ''}</p>
        </form>
      )}

      <input className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs" placeholder="Filter operators by email, UID, or role…" value={query} onChange={e => setQuery(e.target.value)} />

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        {loading ? <div className="p-10 text-center text-sm text-slate-500">Loading operators…</div> : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">No ADMIN / SUPER_ADMIN / SUPPORT records match this filter.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 uppercase text-[11px] font-extrabold text-slate-500">
                <tr><th className="py-3 px-4">UID</th><th className="py-3 px-4">Email</th><th className="py-3 px-4">Role</th><th className="py-3 px-4">Status</th><th className="py-3 px-4 text-right">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(op => (
                  <tr key={op.id}>
                    <td className="py-3 px-4 font-mono" title={op.id}>{op.id.slice(0, 12)}…</td>
                    <td className="py-3 px-4 font-semibold">{op.email || op.displayName || '—'}</td>
                    <td className="py-3 px-4 font-extrabold">{op.role === 'ADMIN' ? 'ADMIN (Platform Admin)' : op.role}</td>
                    <td className="py-3 px-4">{op.suspended ? 'Suspended' : 'Active'}</td>
                    <td className="py-3 px-4 text-right">
                      {op.role === 'SUPER_ADMIN' ? <span className="text-slate-400">Protected</span> : isSuperAdmin ? (
                        <select disabled={saving} defaultValue="" onChange={e => { const next = e.target.value; e.target.value = ''; if (next) changeRole(op.id, next); }} className="rounded-lg border border-slate-200 px-2 py-1">
                          <option value="">Change role…</option>
                          {ASSIGNABLE.filter(value => value !== op.role).map(value => <option key={value} value={value}>{value}</option>)}
                        </select>
                      ) : <span className="text-slate-400">Super Admin only</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
