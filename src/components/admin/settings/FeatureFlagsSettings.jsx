import React, { useState, useEffect, useCallback } from 'react';
import fire from '../../../conf/fire';
import { FaFlag, FaSpinner, FaCheck, FaTimes, FaExclamationTriangle, FaRedo, FaServer, FaShieldAlt, FaCubes, FaCog } from 'react-icons/fa';

const CATEGORY_LABELS = {
  enterprise: { label: 'Enterprise', icon: FaServer, color: 'text-purple-600' },
  workers: { label: 'Workers', icon: FaCubes, color: 'text-blue-600' },
  services: { label: 'Services', icon: FaCog, color: 'text-slate-600' },
  security: { label: 'Security', icon: FaShieldAlt, color: 'text-red-600' },
};

export default function FeatureFlagsSettings() {
  const [flags, setFlags] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pendingToggle, setPendingToggle] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [notification, setNotification] = useState(null);

  const loadFlags = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const user = fire.auth().currentUser;
      if (!user) throw new Error('Authentication required');
      const token = await user.getIdToken();
      const res = await fetch('/api/platform/feature-flags', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setFlags(data.flags || {});
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadFlags(); }, [loadFlags]);

  const showNotification = (type, text) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 5000);
  };

  const handleToggle = (flagKey, currentValue, flag) => {
    const nextValue = !currentValue;
    const verb = nextValue ? 'Enable' : 'Disable';

    setConfirmDialog({
      flagKey,
      flag,
      nextValue,
      title: `${verb} ${flag.description}`,
      message: flag.impact,
      requiresRestart: flag.requiresRestart,
      securityRisk: flag.securityRisk,
      danger: flag.securityRisk === 'high' || !nextValue,
    });
  };

  const executeToggle = async () => {
    if (!confirmDialog) return;
    const { flagKey, nextValue } = confirmDialog;
    setConfirmDialog(null);
    setPendingToggle(flagKey);

    try {
      const user = fire.auth().currentUser;
      if (!user) throw new Error('Authentication required');
      const token = await user.getIdToken();
      const res = await fetch(`/api/platform/feature-flags/${encodeURIComponent(flagKey)}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: nextValue }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error?.message || `HTTP ${res.status}`);
      }
      const result = await res.json();
      showNotification('success', `${flagKey} ${nextValue ? 'enabled' : 'disabled'}${result.requiresRestart ? ' — requires restart to take effect' : ''}`);
      loadFlags();
    } catch (err) {
      showNotification('error', err.message);
    } finally {
      setPendingToggle(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <FaSpinner className="animate-spin text-slate-400 w-6 h-6 mr-3" />
        <span className="text-slate-500">Loading feature flags…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <FaTimes className="text-red-500 w-6 h-6 mx-auto mb-2" />
        <p className="text-red-700 text-sm">{error}</p>
        <button onClick={loadFlags} className="mt-3 text-sm text-red-600 underline">Retry</button>
      </div>
    );
  }

  const flagEntries = Object.entries(flags);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <FaFlag className="text-indigo-600" /> Feature Flags
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Platform-wide feature gates. Changes are audited. Flags marked "Requires Restart" need a server restart to take effect.
          </p>
        </div>
        <button onClick={loadFlags} className="text-slate-400 hover:text-slate-600 p-2" title="Refresh">
          <FaRedo className="w-4 h-4" />
        </button>
      </div>

      {/* Notification */}
      {notification && (
        <div className={`p-3 rounded-lg flex items-center gap-2 text-sm ${
          notification.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          {notification.type === 'success' ? <FaCheck className="text-emerald-600 shrink-0" /> : <FaTimes className="text-red-600 shrink-0" />}
          <span>{notification.text}</span>
        </div>
      )}

      {/* Flags Table */}
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Flag</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider hidden md:table-cell">Category</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider hidden lg:table-cell">Source</th>
              <th className="text-center px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Status</th>
              <th className="text-center px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {flagEntries.map(([key, flag]) => {
              const cat = CATEGORY_LABELS[flag.category] || CATEGORY_LABELS.services;
              const CatIcon = cat.icon;
              const isPending = pendingToggle === key;

              return (
                <tr key={key} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-mono text-xs text-slate-800 font-semibold">{key}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{flag.description}</div>
                    {flag.requiresRestart && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded mt-1">
                        <FaExclamationTriangle className="w-2.5 h-2.5" /> Requires Restart
                      </span>
                    )}
                    {flag.securityRisk === 'high' && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded mt-1 ml-1">
                        <FaShieldAlt className="w-2.5 h-2.5" /> High Risk
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className={`inline-flex items-center gap-1 text-xs font-medium ${cat.color}`}>
                      <CatIcon className="w-3 h-3" /> {cat.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      flag.source === 'firestore' ? 'bg-indigo-50 text-indigo-700' :
                      flag.source === 'environment' ? 'bg-slate-100 text-slate-600' :
                      'bg-slate-50 text-slate-400'
                    }`}>
                      {flag.source}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${
                      flag.value ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {flag.value ? <><FaCheck className="w-2.5 h-2.5" /> ON</> : <><FaTimes className="w-2.5 h-2.5" /> OFF</>}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleToggle(key, flag.value, flag)}
                      disabled={isPending}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 ${
                        isPending ? 'opacity-50 cursor-wait' : 'cursor-pointer'
                      } ${flag.value ? 'bg-emerald-500' : 'bg-slate-300'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                        flag.value ? 'translate-x-6' : 'translate-x-1'
                      }`} />
                      {isPending && <FaSpinner className="absolute inset-0 m-auto w-3 h-3 animate-spin text-white" />}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Last changed info */}
      {flagEntries.some(([, f]) => f.lastChangedAt) && (
        <div className="text-xs text-slate-400 px-1">
          Last modified flags are stored in Firestore and override environment defaults.
        </div>
      )}

      {/* Confirmation Dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setConfirmDialog(null)}>
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className={`text-base font-bold ${confirmDialog.danger ? 'text-red-800' : 'text-slate-800'} mb-2`}>
              {confirmDialog.danger ? '⚠️ ' : ''}{confirmDialog.title}
            </h3>
            <p className="text-sm text-slate-600 mb-4">{confirmDialog.message}</p>
            {confirmDialog.requiresRestart && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-xs text-amber-800 flex items-center gap-2">
                <FaExclamationTriangle className="shrink-0" />
                <span><strong>This change requires a server restart</strong> to take effect. The flag will be stored immediately but the runtime behavior will not change until the server is restarted.</span>
              </div>
            )}
            {confirmDialog.securityRisk === 'high' && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-xs text-red-800 flex items-center gap-2">
                <FaShieldAlt className="shrink-0" />
                <span><strong>High security risk flag.</strong> Changing this may affect platform security posture.</span>
              </div>
            )}
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmDialog(null)} className="px-4 py-2 text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
                Cancel
              </button>
              <button
                onClick={executeToggle}
                className={`px-4 py-2 text-sm font-semibold text-white rounded-lg transition-colors ${
                  confirmDialog.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                {confirmDialog.nextValue ? 'Enable' : 'Disable'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
