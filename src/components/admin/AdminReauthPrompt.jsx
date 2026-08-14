import React, { useEffect, useRef, useState } from 'react';
import fire from '../../conf/fire';
import { reauthenticateUser } from '../../firestore/dbOperations';
import { registerAdminReauthHandler } from '../../services/adminReauth';

function reauthErrorMessage(error) {
  const code = String(error?.code || '');
  if (code.includes('wrong-password') || code.includes('invalid-credential')) return 'The current password was not accepted.';
  if (code.includes('popup-closed') || code.includes('cancelled-popup')) return 'The identity-provider window was closed before verification completed.';
  return error?.message || 'Identity verification failed. Try again.';
}

export default function AdminReauthPrompt() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [working, setWorking] = useState(false);
  const waiters = useRef([]);
  const currentUser = fire.auth().currentUser;
  const usesPassword = currentUser?.providerData?.some(item => item.providerId === 'password') === true;

  const settleWaiters = (method, value) => {
    const pending = waiters.current.splice(0);
    for (const waiter of pending) waiter[method](value);
  };

  useEffect(() => registerAdminReauthHandler(() => new Promise((resolve, reject) => {
    const firstPendingRequest = waiters.current.length === 0;
    waiters.current.push({ resolve, reject });
    if (firstPendingRequest) {
      setPassword('');
      setErrorMessage('');
      setOpen(true);
    }
  })), []);
  useEffect(() => () => {
    const cancelled = Object.assign(new Error('Reauthentication cancelled.'), { code: 'REAUTH_CANCELLED' });
    settleWaiters('reject', cancelled);
  }, []);

  const cancel = () => {
    const cancelled = Object.assign(new Error('Reauthentication cancelled.'), { code: 'REAUTH_CANCELLED' });
    settleWaiters('reject', cancelled);
    setOpen(false);
    setPassword('');
    setErrorMessage('');
  };
  const confirm = async event => {
    event?.preventDefault();
    setWorking(true);
    setErrorMessage('');
    try {
      await reauthenticateUser(usesPassword ? password : '');
      await fire.auth().currentUser?.getIdToken(true);
      settleWaiters('resolve', true);
      setOpen(false);
      setPassword('');
    } catch (error) {
      // Keep the exact pending operations paused so an incorrect password or closed popup
      // can be retried without making the administrator repeat each original action.
      setErrorMessage(reauthErrorMessage(error));
      setPassword('');
    } finally {
      setWorking(false);
    }
  };

  if (!open) return null;
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4" role="presentation" onKeyDown={event => { if (event.key === 'Escape' && !working) cancel(); }}>
    <div role="dialog" aria-modal="true" aria-labelledby="admin-reauth-title" aria-describedby="admin-reauth-description" className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
      <h2 id="admin-reauth-title" className="text-lg font-bold text-slate-900">Reauthenticate administrator</h2>
      <p id="admin-reauth-description" className="mt-2 text-sm text-slate-600">This sensitive settings change requires a recent verified sign-in. The pending operation will retry only after successful reauthentication.</p>
      <form onSubmit={confirm}>
        {usesPassword ? <label htmlFor="admin-reauth-password" className="mt-4 block text-sm font-medium text-slate-700">Current password<input id="admin-reauth-password" autoFocus type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label> : <p className="mt-4 text-sm text-slate-600">Your identity provider will open its secure reauthentication flow.</p>}
        {errorMessage && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{errorMessage}</p>}
        <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={cancel} disabled={working} autoFocus={!usesPassword} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Cancel</button><button type="submit" disabled={working || (usesPassword && !password)} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{working ? 'Verifying…' : 'Verify and retry'}</button></div>
      </form>
    </div>
  </div>;
}
