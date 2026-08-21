import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiAlertTriangle, FiRefreshCw } from 'react-icons/fi';
import { getAttention, getCommandCenter } from '../../../services/platformApi';

export default function PlatformAttention() {
  const [items, setItems] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [attention, center] = await Promise.all([getAttention(), getCommandCenter()]);
      setItems(attention.items || []);
      setStatus(attention.status || center.status);
      setRecommendations(center.recommendations || []);
    } catch (err) {
      setError(err.message || 'Attention feed unavailable');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const rows = [...items.map(item => ({ ...item, source: 'signal' })), ...recommendations.map(item => ({ ...item, source: 'recommendation' }))];
  const unique = [];
  const seen = new Set();
  for (const row of rows) {
    const key = `${row.id}:${row.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><FiAlertTriangle className="text-amber-600" /> Attention</h1>
          <p className="text-sm text-slate-500 mt-1">Derived from inspected platform signals. This is not a fabricated incident desk.</p>
        </div>
        <button type="button" onClick={load} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold"><FiRefreshCw className={loading ? 'animate-spin' : ''} /> Refresh</button>
      </div>
      {status && <p className="text-xs font-extrabold uppercase text-slate-500">Platform status: {status}</p>}
      {error && <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-800 flex justify-between"><span>{error}</span><button type="button" className="font-bold underline" onClick={load}>Retry</button></div>}
      {loading ? <div className="p-10 text-center text-sm text-slate-500">Loading attention items…</div> : unique.length === 0 ? (
        <div className="p-10 text-center text-sm text-slate-500 bg-white border border-slate-200 rounded-2xl">No attention items from inspected sources.</div>
      ) : (
        <div className="space-y-2">
          {unique.map(item => (
            <Link key={`${item.source}-${item.id}`} to={item.href || '/adm/dashboard'} className="block bg-white border border-slate-200 rounded-2xl p-4 hover:border-indigo-300">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-slate-900">{item.title}</p>
                  {item.detail && <p className="text-xs text-slate-500 mt-1">{item.detail}</p>}
                </div>
                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${item.severity === 'HIGH' ? 'bg-red-100 text-red-800' : item.severity === 'MEDIUM' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>{item.severity || 'INFO'}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
