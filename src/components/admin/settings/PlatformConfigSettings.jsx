import React, { useState, useEffect, useCallback } from 'react';
import fire from '../../../conf/fire';
import { FaServer, FaSpinner, FaTimes, FaRedo, FaLock, FaExclamationTriangle, FaCheck, FaBuilding, FaProjectDiagram, FaBolt, FaDatabase } from 'react-icons/fa';

const CATEGORY_ICONS = {
  firebase: <FaDatabase className="text-orange-500" />,
  runtime: <FaServer className="text-blue-500" />,
  security: <FaLock className="text-red-500" />,
  general: <FaBuilding className="text-slate-500" />,
  deployment: <FaProjectDiagram className="text-purple-500" />,
  payments: <FaBolt className="text-indigo-500" />,
  communications: <FaBolt className="text-indigo-500" />,
  storage: <FaDatabase className="text-indigo-500" />,
  workers: <FaServer className="text-slate-500" />,
};

export default function PlatformConfigSettings() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const user = fire.auth().currentUser;
      if (!user) throw new Error('Authentication required');
      const token = await user.getIdToken();
      const res = await fetch('/api/platform/configuration', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setConfig(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <FaSpinner className="animate-spin text-slate-400 w-6 h-6 mr-3" />
        <span className="text-slate-500">Loading configuration census…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <FaTimes className="text-red-500 w-6 h-6 mx-auto mb-2" />
        <p className="text-red-700 text-sm">{error}</p>
        <button onClick={loadConfig} className="mt-3 text-sm text-red-600 underline">Retry</button>
      </div>
    );
  }

  const renderConfigGroup = (title, description, items) => {
    if (!items || Object.keys(items).length === 0) return null;
    return (
      <div className="bg-slate-50 rounded-lg border border-slate-200 overflow-hidden mb-6">
        <div className="px-4 py-3 bg-slate-100 border-b border-slate-200">
          <h3 className="text-sm font-bold text-slate-800">{title}</h3>
          <p className="text-xs text-slate-500">{description}</p>
        </div>
        <div className="divide-y divide-slate-200">
          {Object.entries(items).map(([key, item]) => (
            <div key={key} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white hover:bg-slate-50/50 transition-colors">
              <div className="flex items-start gap-3">
                <div className="mt-0.5">{CATEGORY_ICONS[item.category] || <FaServer className="text-slate-400" />}</div>
                <div>
                  <div className="font-mono text-xs font-bold text-slate-800">{key}</div>
                  <div className="text-[10px] uppercase font-semibold text-slate-400 mt-0.5">{item.category}</div>
                  {item.requiresRestart && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded mt-1.5">
                      <FaExclamationTriangle className="w-2 h-2" /> Requires Restart to apply .env changes
                    </span>
                  )}
                </div>
              </div>
              <div className="md:text-right">
                {item.secret ? (
                  <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-md ${
                    item.value.startsWith('Not') ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  }`}>
                    {item.value.startsWith('Not') ? <FaTimes className="w-3 h-3" /> : <FaCheck className="w-3 h-3" />}
                    {item.value}
                  </span>
                ) : (
                  <div className="bg-slate-100 border border-slate-200 rounded px-3 py-1.5 font-mono text-xs text-slate-700 break-all max-w-sm flex items-center justify-between gap-3">
                    {item.value || <span className="text-slate-400 italic">Empty</span>}
                    {item.editable === false && <FaLock className="text-slate-400 w-3 h-3 shrink-0" title="Read-only" />}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <FaServer className="text-indigo-600" /> Platform Configuration Census
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Read-only diagnostic view of all immutable infrastructure, environment variables, and third-party integration secrets.
          </p>
        </div>
        <button onClick={loadConfig} className="text-slate-400 hover:text-slate-600 p-2" title="Refresh">
          <FaRedo className="w-4 h-4" />
        </button>
      </div>

      {renderConfigGroup(
        'Immutable Infrastructure',
        'Server-only configuration loaded at deployment. Cannot be changed at runtime.',
        config?.infrastructure
      )}

      {renderConfigGroup(
        'Runtime Configuration',
        'Global limits and security policies loaded from the environment.',
        config?.runtime
      )}
      
      {renderConfigGroup(
        'Integration Secrets (Env Only)',
        'Payment, communication, and storage secrets that must be provided via the environment. Some of these can be overridden via Firestore settings.',
        config?.integrations
      )}

      {renderConfigGroup(
        'Worker & Interval Configuration',
        'Timers and intervals for background processors.',
        config?.workers
      )}

      <div className="text-[10px] text-slate-400 text-center">
        Generated at: {config?.generatedAt ? new Date(config.generatedAt).toLocaleString() : 'Unknown'}
      </div>
    </div>
  );
}
