import React, { useEffect, useState } from 'react';
import { FaHeartbeat, FaCheck, FaTimes, FaSpinner, FaTools, FaCheckCircle, FaExclamationTriangle } from 'react-icons/fa';

const DEFAULT_CONFIG = { maintenanceMode: false, maintenanceMessage: 'System is under scheduled maintenance. Please check back shortly.' };

const SystemHealthSettings = () => {
    const [healthConfig, setHealthConfig] = useState(DEFAULT_CONFIG);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [runningDiagnostics, setRunningDiagnostics] = useState(false);
    const [diagnosticsResult, setDiagnosticsResult] = useState(null);
    const [statusMessage, setStatusMessage] = useState(null);

    const loadSummary = async ({ diagnostics = false } = {}) => {
        if (diagnostics) setRunningDiagnostics(true); else setLoading(true);
        try {
            const response = await fetch('/api/admin/health-summary', { cache: 'no-store' });
            const result = await response.json().catch(() => ({}));
            if (!response.ok || !result.success) throw new Error(result.error || 'Health summary unavailable.');
            setHealthConfig(current => ({ ...current, ...(result.settings || {}) }));
            setDiagnosticsResult(result);
        } catch (error) {
            setStatusMessage({ type: 'error', text: error.message });
            if (diagnostics) setDiagnosticsResult(null);
        } finally {
            setLoading(false);
            setRunningDiagnostics(false);
        }
    };

    useEffect(() => { loadSummary(); }, []);

    const handleSave = async event => {
        event.preventDefault();
        setSaving(true);
        setStatusMessage(null);
        try {
            const response = await fetch('/api/admin/system-health-settings', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(healthConfig),
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok || !result.success) throw new Error(result.error?.message || result.error || 'Unable to save settings.');
            setHealthConfig(result.settings);
            setStatusMessage({ type: 'success', text: 'Maintenance configuration saved and audited.' });
            await loadSummary({ diagnostics: true });
        } catch (error) {
            setStatusMessage({ type: 'error', text: error.message });
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="flex items-center justify-center p-8" role="status"><FaSpinner className="mr-2 animate-spin text-slate-500" aria-hidden="true" />Loading verified health configuration…</div>;

    const services = diagnosticsResult?.services;
    const providerEntries = Object.entries(services?.aiProviders || {});
    return (
        <form onSubmit={handleSave} className="space-y-6">
            {statusMessage && <div role={statusMessage.type === 'success' ? 'status' : 'alert'} aria-live="polite" className={`flex items-center gap-2 rounded-lg border p-4 text-sm ${statusMessage.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}>{statusMessage.type === 'success' ? <FaCheck aria-hidden="true" /> : <FaTimes aria-hidden="true" />}{statusMessage.text}</div>}

            <section className="rounded-lg border border-slate-200 bg-slate-50 p-4" aria-labelledby="maintenance-heading">
                <h3 id="maintenance-heading" className="mb-1 flex items-center gap-2 font-semibold text-slate-800"><FaTools className="text-amber-600" aria-hidden="true" />Global maintenance mode</h3>
                <p className="mb-4 text-xs text-slate-500">This stores the public maintenance announcement state, requires recent authentication, and creates an audit record. The current web shell does not enforce an access lock; use deployment controls when access must be blocked.</p>
                <label className="flex items-start gap-3 rounded border border-slate-200 bg-white p-3" htmlFor="maintenanceMode">
                    <input type="checkbox" id="maintenanceMode" checked={healthConfig.maintenanceMode} onChange={event => setHealthConfig(current => ({ ...current, maintenanceMode: event.target.checked }))} className="mt-0.5 h-5 w-5" />
                    <span><span className="block text-sm font-semibold text-slate-800">Enable site maintenance mode</span><span className="text-xs text-slate-500">{healthConfig.maintenanceMode ? 'Pending save: maintenance mode enabled.' : 'Pending save: normal public operation.'}</span></span>
                </label>
                {healthConfig.maintenanceMode && <div className="mt-4"><label htmlFor="maintenanceMessage" className="block text-xs font-semibold uppercase text-slate-700">Maintenance announcement</label><input id="maintenanceMessage" required maxLength={500} value={healthConfig.maintenanceMessage} onChange={event => setHealthConfig(current => ({ ...current, maintenanceMessage: event.target.value }))} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" /></div>}
            </section>

            <section className="rounded-lg border border-slate-200 bg-slate-50 p-4" aria-labelledby="diagnostics-heading">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div><h3 id="diagnostics-heading" className="flex items-center gap-2 font-semibold text-slate-800"><FaHeartbeat className="text-emerald-600" aria-hidden="true" />Verified service summary</h3><p className="text-xs text-slate-500">Reports backend reachability and whether server-side credentials are configured. It does not claim live provider success.</p></div>
                    <button type="button" onClick={() => loadSummary({ diagnostics: true })} disabled={runningDiagnostics} className="flex items-center gap-2 rounded border border-slate-300 bg-white px-3 py-2 text-xs font-medium disabled:opacity-50">{runningDiagnostics ? <FaSpinner className="animate-spin" aria-hidden="true" /> : <FaHeartbeat aria-hidden="true" />}Refresh summary</button>
                </div>
                {services ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <HealthCard label="Backend API" good={services.backend?.reachable} text={services.backend?.reachable ? 'Reachable' : 'Unavailable'} />
                    <HealthCard label="Firebase Admin" good={services.firebaseAdmin?.configured} text={services.firebaseAdmin?.configured ? 'Configured' : 'Unavailable'} />
                    <HealthCard label="AI providers" good={providerEntries.some(([, value]) => value.configured)} text={`${providerEntries.filter(([, value]) => value.configured).length}/${providerEntries.length} configured`} />
                    <HealthCard label="Payment providers" good={Boolean(services.payments?.stripe?.configured || services.payments?.razorpay?.configured)} text={`Stripe ${services.payments?.stripe?.configured ? 'configured' : 'not configured'}; Razorpay ${services.payments?.razorpay?.configured ? 'configured' : 'not configured'}`} />
                </div> : <div className="flex items-center gap-2 text-sm text-amber-800"><FaExclamationTriangle aria-hidden="true" />No verified summary available.</div>}
                {diagnosticsResult?.checkedAt && <p className="mt-3 text-xs text-slate-500">Checked {new Date(diagnosticsResult.checkedAt).toLocaleString()}</p>}
            </section>

            <div className="flex justify-end"><button type="submit" disabled={saving} className="flex items-center gap-2 rounded-md bg-slate-800 px-5 py-2 text-sm font-medium text-white disabled:opacity-50">{saving && <FaSpinner className="animate-spin" aria-hidden="true" />}Save maintenance settings</button></div>
        </form>
    );
};

const HealthCard = ({ label, good, text }) => (
    <div className="rounded border border-slate-200 bg-white p-3">
        <span className="block text-xs text-slate-500">{label}</span>
        <span className={`mt-1 flex items-start gap-1 text-sm font-bold ${good ? 'text-emerald-700' : 'text-amber-700'}`}>{good ? <FaCheckCircle className="mt-0.5 flex-none" aria-hidden="true" /> : <FaExclamationTriangle className="mt-0.5 flex-none" aria-hidden="true" />}{text}</span>
    </div>
);

export default SystemHealthSettings;
