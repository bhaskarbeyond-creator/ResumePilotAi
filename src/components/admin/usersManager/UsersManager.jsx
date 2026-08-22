import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FaBan, FaCheck, FaChevronLeft, FaChevronRight, FaCrown, FaDownload,
  FaEdit, FaEnvelope, FaExclamationTriangle, FaLock, FaSearch, FaShieldAlt,
  FaSpinner, FaTrashAlt, FaUser, FaUsers,
} from 'react-icons/fa';
import fire from '../../../conf/fire';
import {
  deleteUserByAdmin,
  setUserAdminStatus,
  toggleUserSuspension,
  updateUserSubscription,
} from '../../../firestore/dbOperations';
import { fetchAdminWithReauth } from '../../../services/adminReauth';
import AdminDialog from '../shared/AdminDialog';

const PAGE_SIZE = 25;

function messageFor(response, data, fallback) {
  return data?.error?.message || data?.error || data?.message || `${fallback}${response?.status ? ` (HTTP ${response.status})` : ''}`;
}

function csvCell(value) {
  let text = String(value ?? '').replaceAll('"', '""');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text}"`;
}

function userRole(user) {
  return String(user?.role || 'USER').toUpperCase();
}

export default function UsersManager() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false, boundedSource: false });
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [membershipFilter, setMembershipFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [canManageRoles, setCanManageRoles] = useState(false);
  const [action, setAction] = useState(null);
  const [confirmation, setConfirmation] = useState('');
  const [running, setRunning] = useState(false);

  const loadUsers = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE), status: statusFilter, role: roleFilter, membership: membershipFilter });
      if (query.trim()) params.set('q', query.trim());
      const { response, data } = await fetchAdminWithReauth(`/api/admin/users?${params.toString()}`, { cache: 'no-store' });
      if (!response.ok || !data.success) throw new Error(messageFor(response, data, 'Unable to load the user directory.'));
      setUsers(Array.isArray(data.users) ? data.users : []);
      setPagination(data.pagination || { page, pageSize: PAGE_SIZE, total: 0, totalPages: 1 });
    } catch (error) {
      setUsers([]);
      setMessage({ type: 'error', text: error.message || 'Unable to load the user directory.' });
    } finally {
      setLoading(false);
    }
  }, [membershipFilter, query, roleFilter, statusFilter]);

  useEffect(() => {
    const timer = setTimeout(() => { loadUsers(1); }, 200);
    return () => clearTimeout(timer);
  }, [loadUsers]);

  useEffect(() => {
    let active = true;
    fire.auth().currentUser?.getIdTokenResult()
      .then(token => {
        if (!active) return;
        setCanManageRoles(String(token.claims?.role || '').toUpperCase() === 'SUPER_ADMIN' || token.claims?.permissions?.includes('*') === true);
      })
      .catch(() => { if (active) setCanManageRoles(false); });
    return () => { active = false; };
  }, []);

  const summary = useMemo(() => ({
    loaded: users.length,
    suspended: users.filter(user => user.suspended).length,
    admins: users.filter(user => ['ADMIN', 'SUPER_ADMIN'].includes(userRole(user))).length,
    premium: users.filter(user => user.membership === 'Premium').length,
  }), [users]);

  const isSelf = user => {
    const current = fire.auth().currentUser;
    return Boolean(current && (current.uid === user.id || (user.email && current.email?.toLowerCase() === user.email.toLowerCase())));
  };

  const openAction = (type, user) => {
    const role = userRole(user);
    if (role === 'SUPER_ADMIN') {
      setMessage({ type: 'error', text: 'SUPER_ADMIN identities require the documented break-glass retirement procedure and cannot be changed from generic user management.' });
      return;
    }
    if (type === 'role' && !canManageRoles) {
      setMessage({ type: 'error', text: 'Only a SUPER_ADMIN can change administrator roles.' });
      return;
    }
    if (isSelf(user) && (type === 'suspension' || (type === 'role' && user.role === 'ADMIN'))) {
      setMessage({ type: 'error', text: 'Your active administrative identity cannot be suspended or self-demoted here.' });
      return;
    }
    setConfirmation('');
    setAction({ type, user });
  };

  const actionDetails = action ? (() => {
    const { type, user } = action;
    if (type === 'suspension') return { title: user.suspended ? 'Reactivate user access' : 'Suspend user access', impact: user.suspended ? 'The account can authenticate again.' : 'Firebase sign-in is disabled and refresh tokens are revoked.', confirmation: user.email || user.id, button: user.suspended ? 'Reactivate' : 'Suspend' };
    if (type === 'membership') return { title: user.membership === 'Premium' ? 'Set Basic membership' : 'Grant Premium membership', impact: user.membership === 'Premium' ? 'Premium entitlement will be removed.' : 'A server-authoritative Premium entitlement will be granted for the default term.', confirmation: user.email || user.id, button: user.membership === 'Premium' ? 'Set Basic' : 'Grant Premium' };
    if (type === 'role') return { title: userRole(user) === 'ADMIN' ? 'Revoke administrator role' : 'Grant administrator role', impact: userRole(user) === 'ADMIN' ? 'The identity loses ADMIN access after token refresh.' : 'The identity receives ADMIN access after token refresh.', confirmation: user.email || user.id, button: userRole(user) === 'ADMIN' ? 'Revoke Admin' : 'Grant Admin' };
    return { title: 'Delete user account', impact: 'The identity and eligible owned product data will be permanently deleted. Retained legal/billing records follow server policy.', confirmation: user.email || user.id, button: 'Delete account' };
  })() : null;

  const executeAction = async () => {
    if (!action || !actionDetails || confirmation !== actionDetails.confirmation) return;
    const { type, user } = action;
    setRunning(true);
    setMessage(null);
    try {
      let result;
      if (type === 'suspension') result = await toggleUserSuspension(user.id, !user.suspended, user.suspended);
      else if (type === 'membership') result = await updateUserSubscription(user.id, user.membership === 'Premium' ? 'Basic' : 'Premium', user.membership);
      else if (type === 'role') result = await setUserAdminStatus(user.id, userRole(user) !== 'ADMIN', userRole(user) === 'ADMIN');
      else result = await deleteUserByAdmin(user.id, user.email || null);
      if (!result?.success) throw new Error(result?.error || 'The requested user operation failed.');
      setAction(null);
      setConfirmation('');
      setMessage({ type: 'success', text: `${actionDetails.button} succeeded. The roster was refreshed from the server.` });
      await loadUsers(pagination.page);
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'The requested user operation failed.' });
      await loadUsers(pagination.page);
    } finally {
      setRunning(false);
    }
  };

  const exportUsersToCsv = () => {
    if (!users.length) {
      setMessage({ type: 'error', text: 'No loaded user records are available for export.' });
      return;
    }
    const rows = ['User ID,Email,Display Name,Role,Membership,Suspended'];
    users.forEach(user => rows.push([user.id, user.email, user.displayName, userRole(user), user.membership, user.suspended].map(csvCell).join(',')));
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `admin-users-page-${pagination.page}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-indigo-600">Identity & access</p><h1 className="mt-1 text-2xl font-extrabold text-slate-900">Users manager</h1><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">A server-paginated global directory. Each account mutation is a single, stale-state-checked, audited server transition.</p></div>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={() => loadUsers(pagination.page)} disabled={loading || running} className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{loading ? <FaSpinner className="inline animate-spin" /> : <FaUsers className="inline" />} Refresh</button><button type="button" onClick={exportUsersToCsv} disabled={!users.length} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"><FaDownload />Export current page</button></div>
      </header>

      {message && <div role={message.type === 'success' ? 'status' : 'alert'} aria-live="polite" className={`flex gap-2 rounded-2xl border p-4 text-sm ${message.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-red-200 bg-red-50 text-red-900'}`}>{message.type === 'success' ? <FaCheck className="mt-0.5 shrink-0 text-emerald-600" /> : <FaExclamationTriangle className="mt-0.5 shrink-0 text-red-600" />}<span>{message.text}</span></div>}
      {pagination.boundedSource && <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">The current server directory window reached its 1,000-record safety bound. Refine the search/filter before treating the result as a complete platform census.</div>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[['Loaded', summary.loaded, 'text-slate-900'], ['Administrators', summary.admins, 'text-indigo-700'], ['Premium', summary.premium, 'text-amber-700'], ['Suspended', summary.suspended, 'text-rose-700']].map(([label, value, tone]) => <section key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className={`mt-1 text-2xl font-extrabold ${tone}`}>{loading ? '—' : value}</p></section>)}</div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><label className="relative"><span className="sr-only">Search users</span><FaSearch className="absolute left-3 top-3 text-slate-400" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search email, name, or user ID" className="w-full rounded-xl border border-slate-300 bg-slate-50 py-2 pl-9 pr-3 text-sm" /></label><label className="text-xs font-bold text-slate-600">Access<select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800"><option value="all">All access states</option><option value="active">Active</option><option value="suspended">Suspended</option></select></label><label className="text-xs font-bold text-slate-600">Role<select value={roleFilter} onChange={event => setRoleFilter(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800"><option value="ALL">All roles</option><option value="USER">User</option><option value="ADMIN">Admin</option><option value="SUPER_ADMIN">Super Admin</option></select></label><label className="text-xs font-bold text-slate-600">Membership<select value={membershipFilter} onChange={event => setMembershipFilter(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800"><option value="all">All plans</option><option value="Basic">Basic</option><option value="Premium">Premium</option></select></label></div></section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs" aria-label="User directory results">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3"><div><h2 className="text-sm font-extrabold text-slate-900">Platform user directory</h2><p className="mt-0.5 text-xs text-slate-500">{pagination.total} matching user{pagination.total === 1 ? '' : 's'} across server filters.</p></div><span className="text-xs font-semibold text-slate-500">Page {pagination.page} of {pagination.totalPages}</span></div>
        {loading ? <div className="flex min-h-56 items-center justify-center gap-2 text-sm text-slate-600" role="status"><FaSpinner className="animate-spin text-indigo-600" />Loading users…</div> : users.length === 0 ? <div className="p-10 text-center text-sm text-slate-600">No users match the selected directory filters.</div> : <><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50/60 text-[11px] font-extrabold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Identity</th><th className="px-4 py-3">Access</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Plan</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{users.map(user => { const role = userRole(user); const protectedTarget = role === 'SUPER_ADMIN'; const self = isSelf(user); return <tr key={user.id} className="hover:bg-slate-50/70"><td className="px-4 py-3"><p className="font-bold text-slate-900">{user.displayName || user.email || 'Unnamed user'} {self && <span className="ml-1 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] text-indigo-800">You</span>}</p><p className="max-w-64 truncate text-xs text-slate-600" title={user.email}>{user.email || 'No email recorded'}</p><p className="mt-0.5 max-w-64 truncate font-mono text-[10px] text-slate-400" title={user.id}>{user.id}</p></td><td className="px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-extrabold ${user.suspended ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'}`}>{user.suspended ? 'SUSPENDED' : 'ACTIVE'}</span></td><td className="px-4 py-3"><span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-extrabold ${protectedTarget ? 'bg-purple-100 text-purple-800' : role === 'ADMIN' ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-700'}`}>{protectedTarget || role === 'ADMIN' ? <FaShieldAlt /> : <FaUser />}{role}</span></td><td className="px-4 py-3"><span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-extrabold ${user.membership === 'Premium' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>{user.membership === 'Premium' && <FaCrown />}{user.membership}</span></td><td className="px-4 py-3"><div className="flex justify-end gap-1">{protectedTarget ? <span className="rounded-lg p-2 text-slate-400" title="SUPER_ADMIN target protected"><FaLock /></span> : <><button type="button" onClick={() => openAction('suspension', user)} className={`rounded-lg p-2 ${user.suspended ? 'text-emerald-700 hover:bg-emerald-50' : 'text-rose-700 hover:bg-rose-50'}`} title={user.suspended ? 'Reactivate access' : 'Suspend access'}>{user.suspended ? <FaCheck /> : <FaBan />}</button>{canManageRoles && <button type="button" onClick={() => openAction('role', user)} className="rounded-lg p-2 text-indigo-700 hover:bg-indigo-50" title={role === 'ADMIN' ? 'Revoke Admin' : 'Grant Admin'}><FaShieldAlt /></button>}<button type="button" onClick={() => openAction('membership', user)} className="rounded-lg p-2 text-amber-700 hover:bg-amber-50" title={user.membership === 'Premium' ? 'Set Basic' : 'Grant Premium'}><FaCrown /></button><button type="button" onClick={() => navigate('/adm/user/ss', { state: { userId: user.id, email: user.email, membership: user.membership, membershipEnd: user.membershipEnds, isA: role === 'ADMIN', suspended: user.suspended } })} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" title="Open controlled editor"><FaEdit /></button>{!self && <button type="button" onClick={() => openAction('delete', user)} className="rounded-lg p-2 text-rose-700 hover:bg-rose-50" title="Delete user"><FaTrashAlt /></button>}</>}</div></td></tr>; })}</tbody></table></div><footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-600"><span>Showing {users.length ? (pagination.page - 1) * pagination.pageSize + 1 : 0}–{(pagination.page - 1) * pagination.pageSize + users.length} of {pagination.total}</span><div className="flex items-center gap-2"><button type="button" onClick={() => loadUsers(pagination.page - 1)} disabled={!pagination.hasPreviousPage || loading} className="rounded-lg border border-slate-300 p-1.5 disabled:opacity-40" aria-label="Previous user page"><FaChevronLeft /></button><button type="button" onClick={() => loadUsers(pagination.page + 1)} disabled={!pagination.hasNextPage || loading} className="rounded-lg border border-slate-300 p-1.5 disabled:opacity-40" aria-label="Next user page"><FaChevronRight /></button></div></footer></>}
      </section>

      <AdminDialog open={Boolean(action)} onClose={() => !running && setAction(null)} dismissible={!running} title={actionDetails?.title || 'Confirm user action'} description="The current target state will be verified by the server before the action is applied." className="max-w-lg"><div role="alertdialog" aria-label="Confirm user action" className="space-y-4 p-5"><div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm"><p><strong>Target:</strong> {action?.user.email || action?.user.id}</p><p className="mt-1"><strong>Impact:</strong> {actionDetails?.impact}</p></div><label className="block text-sm font-bold text-slate-800">Type <span className="font-mono text-rose-700">{actionDetails?.confirmation}</span> to confirm<input autoComplete="off" value={confirmation} onChange={event => setConfirmation(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm" /></label><div className="flex justify-end gap-3 border-t border-slate-100 pt-4"><button type="button" disabled={running} onClick={() => setAction(null)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700">Cancel</button><button type="button" disabled={running || confirmation !== actionDetails?.confirmation} onClick={executeAction} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-50 ${action?.type === 'delete' ? 'bg-rose-700' : 'bg-indigo-600'}`}>{running && <FaSpinner className="animate-spin" />}{running ? 'Applying…' : actionDetails?.button}</button></div></div></AdminDialog>
    </main>
  );
}
