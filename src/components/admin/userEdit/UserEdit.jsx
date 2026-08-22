import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  FaBan, FaCalendar, FaCheck, FaCrown, FaEnvelope, FaExclamationTriangle,
  FaLock, FaSave, FaShieldAlt, FaSpinner, FaUser,
} from 'react-icons/fa';
import fire from '../../../conf/fire';
import {
  getUserById,
  setUserAdminStatus,
  toggleUserSuspension,
  updateUserSubscription,
} from '../../../firestore/dbOperations';
import AdminDialog from '../shared/AdminDialog';

function roleFromRecord(record = {}) {
  return String(record.role || (record.isA ? 'ADMIN' : 'USER')).toUpperCase();
}

function dateLabel(value) {
  const date = value?.toDate?.() || (value ? new Date(value) : null);
  return date && Number.isFinite(date.getTime()) ? date.toLocaleDateString() : 'Not recorded';
}

function userView(record = {}, fallback = {}) {
  const role = roleFromRecord(record);
  return {
    id: record.userId || record.id || fallback.userId || '',
    email: record.email || fallback.email || '',
    membership: record.membership || fallback.membership || 'Basic',
    membershipEnds: record.membershipEnds || fallback.membershipEnd || null,
    suspended: Boolean(record.suspended ?? fallback.suspended),
    role,
    isAdmin: ['ADMIN', 'SUPER_ADMIN'].includes(role),
  };
}

function resultOrThrow(result, fallback) {
  if (!result?.success) throw new Error(result?.error || fallback);
  return result;
}

/**
 * Server-authoritative user editor. Mutations are deliberately issued one at a
 * time because the API performs one audited state transition per request. That
 * prevents a partial browser payload from smuggling role, billing and access
 * changes into a single unreviewable operation.
 */
export default function UserEdit() {
  const location = useLocation();
  const initial = location.state || {};
  const initialId = initial.userId || '';
  const [user, setUser] = useState(() => userView({}, initial));
  const [baseline, setBaseline] = useState(() => userView({}, initial));
  const [loading, setLoading] = useState(Boolean(initialId));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [canManageRoles, setCanManageRoles] = useState(false);

  const isSelf = useMemo(() => {
    const current = fire.auth().currentUser;
    return Boolean(current && (current.uid === user.id || (user.email && current.email?.toLowerCase() === user.email.toLowerCase())));
  }, [user.email, user.id]);
  const superAdminTarget = user.role === 'SUPER_ADMIN';
  const hasChanges = user.membership !== baseline.membership
    || user.suspended !== baseline.suspended
    || user.isAdmin !== baseline.isAdmin;
  const confirmationPhrase = user.email || user.id;

  const loadUser = async () => {
    if (!initialId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const record = await getUserById(initialId);
      if (!record) throw new Error('This user no longer exists or is not available to your role.');
      const next = userView(record, initial);
      setUser(next);
      setBaseline(next);
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Unable to load this user.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadUser(); }, [initialId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let active = true;
    fire.auth().currentUser?.getIdTokenResult()
      .then(token => {
        if (!active) return;
        const role = String(token.claims?.role || '').toUpperCase();
        setCanManageRoles(role === 'SUPER_ADMIN' || token.claims?.permissions?.includes('*'));
      })
      .catch(() => { if (active) setCanManageRoles(false); });
    return () => { active = false; };
  }, []);

  const updateField = (field, value) => setUser(current => ({ ...current, [field]: value }));

  const save = async () => {
    if (!hasChanges || superAdminTarget) return;
    setSaving(true);
    setMessage(null);
    try {
      const completed = [];
      if (user.membership !== baseline.membership) {
        resultOrThrow(
          await updateUserSubscription(user.id, user.membership, baseline.membership),
          'The membership change could not be saved.',
        );
        completed.push('membership');
      }
      if (user.suspended !== baseline.suspended) {
        if (isSelf && user.suspended) throw new Error('Your own administrative account cannot be suspended.');
        resultOrThrow(
          await toggleUserSuspension(user.id, user.suspended, baseline.suspended),
          'The access-state change could not be saved.',
        );
        completed.push(user.suspended ? 'suspension' : 'reactivation');
      }
      if (user.isAdmin !== baseline.isAdmin) {
        if (!canManageRoles) throw new Error('Only a SUPER_ADMIN can change administrative roles.');
        if (isSelf && !user.isAdmin) throw new Error('Your own administrative role cannot be removed here.');
        resultOrThrow(
          await setUserAdminStatus(user.id, user.isAdmin, baseline.isAdmin),
          'The role change could not be saved.',
        );
        completed.push('role');
      }
      await loadUser();
      setMessage({ type: 'success', text: `Saved and audited ${completed.join(', ')} change${completed.length === 1 ? '' : 's'}.` });
      setConfirmOpen(false);
      setConfirmation('');
    } catch (error) {
      // Operations are independently audited server transitions. Refresh after
      // any failure so a later transition cannot leave the editor displaying a
      // stale pre-save state as if nothing persisted.
      await loadUser();
      setMessage({ type: 'error', text: error.message || 'The user update failed. Review the refreshed account state before retrying.' });
    } finally {
      setSaving(false);
    }
  };

  if (!initialId) {
    return (
      <main className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-2xs">
        <FaUser className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
        <h1 className="mt-3 text-xl font-extrabold text-slate-900">Select a user to manage</h1>
        <p className="mt-2 text-sm text-slate-600">Open a user from the managed roster so the server can verify the current account state.</p>
        <Link to="/adm/users" className="mt-5 inline-flex rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700">Return to Users</Link>
      </main>
    );
  }

  if (loading) {
    return <div className="flex min-h-[40vh] items-center justify-center gap-2 text-sm font-medium text-slate-600" role="status"><FaSpinner className="animate-spin" aria-hidden="true" />Loading verified user state…</div>;
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div className="min-w-0">
          <Link to="/adm/users" className="text-xs font-bold text-indigo-600 hover:text-indigo-800">← Users</Link>
          <h1 className="mt-2 flex flex-wrap items-center gap-2 text-2xl font-extrabold text-slate-900">User access &amp; entitlement</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">Each saved item is verified server-side, persisted, and written to the administrative audit trail.</p>
        </div>
        <button type="button" onClick={loadUser} disabled={loading || saving} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Refresh current state</button>
      </header>

      {message && (
        <div role={message.type === 'success' ? 'status' : 'alert'} aria-live="polite" className={`flex items-start gap-2 rounded-xl border p-4 text-sm ${message.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-red-200 bg-red-50 text-red-900'}`}>
          {message.type === 'success' ? <FaCheck className="mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" /> : <FaExclamationTriangle className="mt-0.5 shrink-0 text-red-600" aria-hidden="true" />}
          <span>{message.text}</span>
        </div>
      )}

      {superAdminTarget && (
        <div role="alert" className="flex gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <FaLock className="mt-0.5 shrink-0 text-amber-700" aria-hidden="true" />
          <div><strong>Protected SUPER_ADMIN identity.</strong><p className="mt-1">Suspension, role, entitlement, and deletion changes are blocked in standard user management. Use the documented break-glass retirement process instead.</p></div>
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs" aria-labelledby="user-details-heading">
        <div className="border-b border-slate-100 bg-slate-50 px-5 py-4 sm:px-6"><h2 id="user-details-heading" className="text-base font-extrabold text-slate-900">Verified account state</h2></div>
        <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
          <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">User ID</span><span className="block truncate rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700" title={user.id}>{user.id}</span></label>
          <label className="block"><span className="mb-1 flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-slate-500"><FaEnvelope aria-hidden="true" />Identity email</span><span className="block truncate rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700" title={user.email}>{user.email || 'No email recorded'}</span><span className="mt-1 block text-[11px] text-slate-500">Identity email changes require the account recovery workflow; they cannot be forged from this console.</span></label>
          <div className="rounded-xl border border-slate-200 p-4"><span className="text-xs font-bold uppercase tracking-wide text-slate-500">Current role</span><p className="mt-2 flex items-center gap-2 text-sm font-extrabold text-slate-900"><FaShieldAlt className={user.isAdmin ? 'text-indigo-600' : 'text-slate-400'} aria-hidden="true" />{user.role}</p></div>
          <div className="rounded-xl border border-slate-200 p-4"><span className="text-xs font-bold uppercase tracking-wide text-slate-500">Plan end</span><p className="mt-2 flex items-center gap-2 text-sm font-extrabold text-slate-900"><FaCalendar className="text-slate-400" aria-hidden="true" />{dateLabel(user.membershipEnds)}</p></div>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs sm:p-6" aria-labelledby="user-controls-heading">
        <div><h2 id="user-controls-heading" className="text-base font-extrabold text-slate-900">Controlled changes</h2><p className="mt-1 text-sm text-slate-600">Review pending changes, then confirm the target identity before saving.</p></div>

        <label className="block"><span className="mb-1 flex items-center gap-1 text-sm font-bold text-slate-800"><FaCrown className="text-amber-500" aria-hidden="true" />Membership</span><select value={user.membership} onChange={event => updateField('membership', event.target.value)} disabled={superAdminTarget || saving} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100"><option value="Basic">Basic</option><option value="Premium">Premium</option></select><span className="mt-1 block text-[11px] text-slate-500">Premium grants use the server-authoritative default term.</span></label>

        <label className={`flex items-start gap-3 rounded-xl border p-4 ${user.suspended ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-slate-50'}`}><input type="checkbox" checked={user.suspended} disabled={isSelf || superAdminTarget || saving} onChange={event => updateField('suspended', event.target.checked)} className="mt-0.5 h-5 w-5 rounded border-slate-300 text-rose-600" /><span><span className="flex items-center gap-2 text-sm font-extrabold text-slate-900"><FaBan className="text-rose-600" aria-hidden="true" />Suspend sign-in access</span><span className="mt-1 block text-xs text-slate-600">{isSelf ? 'Your own active administrator identity cannot be suspended.' : 'Suspending disables Firebase sign-in and revokes refresh tokens.'}</span></span></label>

        <label className={`flex items-start gap-3 rounded-xl border p-4 ${user.isAdmin ? 'border-indigo-200 bg-indigo-50/60' : 'border-slate-200 bg-slate-50'}`}><input type="checkbox" checked={user.isAdmin} disabled={!canManageRoles || isSelf || superAdminTarget || saving} onChange={event => updateField('isAdmin', event.target.checked)} className="mt-0.5 h-5 w-5 rounded border-slate-300 text-indigo-600" /><span><span className="flex items-center gap-2 text-sm font-extrabold text-slate-900"><FaShieldAlt className="text-indigo-600" aria-hidden="true" />Administrator role</span><span className="mt-1 block text-xs text-slate-600">{canManageRoles ? 'Only SUPER_ADMIN identities can grant or revoke the ADMIN role.' : 'Role changes are unavailable to your current administrator role.'}</span></span></label>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between"><span className="text-xs text-slate-500">{hasChanges ? 'Unsaved changes require confirmation.' : 'No unsaved changes.'}</span><button type="button" onClick={() => { setConfirmation(''); setConfirmOpen(true); }} disabled={!hasChanges || saving || superAdminTarget} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-extrabold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"><FaSave aria-hidden="true" />Review &amp; save changes</button></div>
      </section>

      <AdminDialog open={confirmOpen} onClose={() => !saving && setConfirmOpen(false)} dismissible={!saving} title="Confirm user changes" description="Verify the target identity and impact before committing audited server-side transitions." className="max-w-lg">
        <div className="space-y-4 p-5 sm:p-6"><div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm"><p><strong>Target:</strong> {user.email || user.id}</p><p className="mt-1"><strong>Impact:</strong> {user.membership !== baseline.membership && 'membership; '}{user.suspended !== baseline.suspended && (user.suspended ? 'sign-in suspension; ' : 'sign-in reactivation; ')}{user.isAdmin !== baseline.isAdmin && 'administrator role; '}</p></div><label className="block text-sm font-bold text-slate-800">Type <span className="font-mono text-indigo-700">{confirmationPhrase}</span> to confirm<input autoComplete="off" value={confirmation} onChange={event => setConfirmation(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm" /></label><div className="flex justify-end gap-3"><button type="button" onClick={() => setConfirmOpen(false)} disabled={saving} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-50">Cancel</button><button type="button" onClick={save} disabled={saving || confirmation !== confirmationPhrase} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{saving && <FaSpinner className="animate-spin" aria-hidden="true" />}{saving ? 'Saving…' : 'Confirm & save'}</button></div></div>
      </AdminDialog>
    </main>
  );
}
