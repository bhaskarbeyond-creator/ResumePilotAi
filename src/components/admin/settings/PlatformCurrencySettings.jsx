import React, { useState, useEffect, useCallback } from 'react';
import { FiDollarSign, FiRefreshCw, FiCheck, FiAlertTriangle, FiGlobe, FiLock } from 'react-icons/fi';
import { getPlatformCurrency, updatePlatformCurrency } from '../../../services/platformApi';
import { useAdminSession } from '../AdminContext';
import { saveCurrencySettingsWithRecovery } from './currencySettingsController';

export default function PlatformCurrencySettings() {
  const { isSuperAdmin } = useAdminSession();
  const [_currencyConfig, setCurrencyConfig] = useState(null);
  const [selectedCurrency, setSelectedCurrency] = useState('INR');
  const [allowMultiCurrency, setAllowMultiCurrency] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const applyCurrencyConfig = useCallback((currency) => {
    setCurrencyConfig(currency);
    setSelectedCurrency(currency.code || 'INR');
    setAllowMultiCurrency(Boolean(currency.allowMultiCurrency));
  }, []);

  const loadCurrency = useCallback(async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const res = await getPlatformCurrency();
      if (!res?.success || !res.currency) throw new Error('The server returned an invalid currency configuration.');
      applyCurrencyConfig(res.currency);
      return res;
    } catch (err) {
      setCurrencyConfig(null);
      setError(err.message || 'Failed to load platform currency configuration.');
      return null;
    } finally {
      setLoading(false);
    }
  }, [applyCurrencyConfig]);

  useEffect(() => {
    loadCurrency();
  }, [loadCurrency]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!isSuperAdmin) {
      setError('SUPER_ADMIN role is required to modify authoritative platform currency.');
      return;
    }
    if (!_currencyConfig) {
      setError('Load the authoritative currency configuration before saving.');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const outcome = await saveCurrencySettingsWithRecovery({
        update: updatePlatformCurrency,
        reload: getPlatformCurrency,
        payload: {
          currency: selectedCurrency,
          allowMultiCurrency,
          expectedRevision: _currencyConfig.revision,
        },
      });
      applyCurrencyConfig(outcome.currency);
      if (outcome.kind === 'conflict') {
        setError('These settings changed after you loaded them. The latest authoritative values were reloaded; review them before saving again.');
      } else {
        setSuccess(outcome.response.message || 'Platform currency updated successfully.');
      }
    } catch (err) {
      setError(err.message || 'Failed to update platform currency.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-5 space-y-5 animate-fade-in text-xs">
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600">
            <FiDollarSign className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Platform Currency &amp; Pricing Standard</h2>
            <p className="text-slate-500 text-[11px]">Authoritative currency source of truth for platform pricing, invoices, and subscriptions.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={loadCurrency}
          disabled={loading}
          className="p-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900 transition disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          title="Refresh currency settings"
          aria-label="Refresh currency settings"
        >
          <FiRefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 flex items-center justify-between" role="alert">
          <div className="flex items-center gap-2 font-semibold">
            <FiAlertTriangle className="text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button type="button" onClick={() => setError('')} className="text-red-500 hover:text-red-700 font-bold ml-2">Dismiss</button>
        </div>
      )}
      {success && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-between" role="status">
          <div className="flex items-center gap-2 font-semibold">
            <FiCheck className="text-emerald-600 shrink-0" />
            <span>{success}</span>
          </div>
          <button type="button" onClick={() => setSuccess('')} className="text-emerald-500 hover:text-emerald-700 font-bold ml-2">Dismiss</button>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
          <FiRefreshCw className="h-6 w-6 animate-spin text-indigo-600" />
          <span>Loading platform currency…</span>
        </div>
      ) : !_currencyConfig ? (
        <div className="py-10 text-center flex flex-col items-center justify-center gap-3" role="status">
          <p className="font-semibold text-slate-700">Currency settings are unavailable. Saving is disabled until authoritative values load.</p>
          <button type="button" onClick={loadCurrency} className="px-4 py-2 rounded-xl bg-slate-900 text-white font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
            Retry loading
          </button>
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Primary Platform Currency */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <label htmlFor="platform-primary-currency" className="block font-bold text-slate-900 text-xs">Primary Platform Currency</label>
              <p className="text-slate-500 text-[11px]">System-wide base currency used for pricing, catalog, and standard invoice settlement.</p>
              <select
                id="platform-primary-currency"
                disabled={!isSuperAdmin}
                value={selectedCurrency}
                onChange={(e) => setSelectedCurrency(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-bold text-slate-800 text-xs focus:ring-2 focus:ring-indigo-500"
              >
                <option value="INR">INR (₹) — Indian Rupee (Default standard)</option>
                <option value="USD">USD ($) — US Dollar</option>
                <option value="EUR">EUR (€) — Euro</option>
                <option value="GBP">GBP (£) — British Pound</option>
                <option value="CAD">CAD (CA$) — Canadian Dollar</option>
                <option value="AUD">AUD (A$) — Australian Dollar</option>
                <option value="SGD">SGD (S$) — Singapore Dollar</option>
                <option value="AED">AED (AED) — UAE Dirham</option>
                <option value="JPY">JPY (¥) — Japanese Yen</option>
              </select>
            </div>

            {/* Currency Preview Display */}
            <div className="p-4 bg-emerald-50/50 border border-emerald-200 rounded-xl space-y-1 flex flex-col justify-center">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-800">Live Formatting Preview</p>
              <div className="flex items-baseline gap-2 pt-1">
                <span className="text-2xl font-black text-emerald-900">
                  {selectedCurrency === 'INR' ? '₹1,499.00' :
                   selectedCurrency === 'USD' ? '$1,499.00' :
                   selectedCurrency === 'EUR' ? '€1.499,00' :
                   selectedCurrency === 'GBP' ? '£1,499.00' :
                   selectedCurrency === 'JPY' ? '¥1,499' :
                   `${selectedCurrency} 1,499.00`}
                </span>
                <span className="text-slate-500 text-xs font-mono">({selectedCurrency})</span>
              </div>
              <p className="text-[11px] text-emerald-700">Subunit: {selectedCurrency === 'INR' ? 'Paise (100 subunits/unit)' : 'Cents/Pence'}</p>
            </div>
          </div>

          {/* Multi-Currency Toggle */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FiGlobe className="h-5 w-5 text-indigo-600" />
              <div>
                <p className="font-bold text-slate-900 text-xs">Allow Multi-Currency Tenant Billing</p>
                <p className="text-slate-500 text-[11px]">When enabled, enterprise tenants can configure their own billing currency independently.</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                disabled={!isSuperAdmin}
                checked={allowMultiCurrency}
                onChange={(e) => setAllowMultiCurrency(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600" />
            </label>
          </div>

          {/* Action Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <span className="text-slate-400 text-[11px]">
              {!isSuperAdmin ? 'Requires SUPER_ADMIN role to update platform configuration.' : `Loaded revision ${_currencyConfig.revision}. Changes are audited.`}
            </span>
            {isSuperAdmin && (
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 transition shadow-xs flex items-center gap-1.5 disabled:opacity-50"
              >
                {saving ? <><FiRefreshCw className="animate-spin" /> Saving…</> : <><FiCheck /> Save Currency Settings</>}
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
