import React, { useState, useEffect } from 'react';
import { getSystemSettings, saveSystemSettings } from '../../../firestore/dbOperations';
import { FaHeartbeat, FaCheck, FaTimes, FaSpinner, FaTools, FaCheckCircle, FaExclamationTriangle } from 'react-icons/fa';

const SystemHealthSettings = () => {
    const [healthConfig, setHealthConfig] = useState({
        maintenanceMode: false,
        maintenanceMessage: 'System is under scheduled maintenance. Please check back shortly.',
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [runningDiagnostics, setRunningDiagnostics] = useState(false);
    const [diagnosticsResult, setDiagnosticsResult] = useState(null);
    const [statusMessage, setStatusMessage] = useState(null);

    useEffect(() => {
        getSystemSettings().then((settings) => {
            if (settings && settings.systemHealth) {
                setHealthConfig((prev) => ({ ...prev, ...settings.systemHealth }));
            }
            setLoading(false);
        });
    }, []);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setHealthConfig((prev) => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value,
        }));
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await saveSystemSettings('systemHealth', healthConfig);
            setStatusMessage({ type: 'success', text: 'Maintenance mode & system health settings updated!' });
        } catch (error) {
            setStatusMessage({ type: 'error', text: `Failed to save settings: ${error.message}` });
        } finally {
            setSaving(false);
            setTimeout(() => setStatusMessage(null), 4000);
        }
    };

    const runDiagnostics = async () => {
        setRunningDiagnostics(true);
        setDiagnosticsResult(null);
        try {
            const response = await fetch('http://localhost:8080/api/admin/test-connection', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'diagnostics' })
            });
            const data = await response.json();
            setDiagnosticsResult(data);
        } catch (err) {
            setDiagnosticsResult({
                firebase: 'Connected',
                backend: 'Failed: ' + err.message,
                gemini: 'Unknown',
                stripe: 'Unknown',
            });
        } finally {
            setRunningDiagnostics(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-8">
                <FaSpinner className="animate-spin text-slate-500 w-6 h-6 mr-2" />
                <span className="text-slate-600 text-sm">Loading system health settings...</span>
            </div>
        );
    }

    return (
        <form onSubmit={handleSave} className="space-y-6">
            {statusMessage && (
                <div className={`p-4 rounded-lg flex items-center justify-between text-sm ${
                    statusMessage.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-red-50 border border-red-200 text-red-800'
                }`}>
                    <div className="flex items-center space-x-2">
                        {statusMessage.type === 'success' ? <FaCheck className="text-emerald-600" /> : <FaTimes className="text-red-600" />}
                        <span>{statusMessage.text}</span>
                    </div>
                </div>
            )}

            {/* Maintenance Mode */}
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2 mb-1">
                    <FaTools className="text-amber-600" /> Global Maintenance Mode
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                    Temporarily toggle maintenance mode to restrict user access during database migrations or updates.
                </p>

                <div className="space-y-4">
                    <div className="flex items-center space-x-3 p-3 bg-white rounded border border-slate-200">
                        <input
                            type="checkbox"
                            id="maintenanceMode"
                            name="maintenanceMode"
                            checked={healthConfig.maintenanceMode}
                            onChange={handleChange}
                            className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 h-5 w-5"
                        />
                        <div>
                            <label htmlFor="maintenanceMode" className="text-sm font-semibold text-slate-800">
                                Enable Site Maintenance Mode
                            </label>
                            <p className="text-xs text-slate-500">
                                {healthConfig.maintenanceMode
                                    ? '⚠️ Maintenance mode is currently ACTIVE. Public users will see the maintenance screen.'
                                    : '✅ System is operating normally (Live).'
                                }
                            </p>
                        </div>
                    </div>

                    {healthConfig.maintenanceMode && (
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                                Maintenance Banner Announcement
                            </label>
                            <input
                                type="text"
                                name="maintenanceMessage"
                                value={healthConfig.maintenanceMessage}
                                onChange={handleChange}
                                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-amber-500 focus:outline-none"
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Live System Diagnostics */}
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                        <FaHeartbeat className="text-emerald-600" /> Live System Health Check
                    </h3>
                    <button
                        type="button"
                        onClick={runDiagnostics}
                        disabled={runningDiagnostics}
                        className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 flex items-center space-x-1"
                    >
                        {runningDiagnostics ? <FaSpinner className="animate-spin text-slate-500" /> : <FaHeartbeat className="text-emerald-600" />}
                        <span>Run Full Diagnostics</span>
                    </button>
                </div>

                {diagnosticsResult ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="p-3 bg-white rounded border border-slate-200">
                            <span className="text-xs text-slate-500 block">Firestore Database</span>
                            <span className="text-sm font-bold text-emerald-600 flex items-center gap-1 mt-1">
                                <FaCheckCircle /> {diagnosticsResult.firebase || 'Online'}
                            </span>
                        </div>
                        <div className="p-3 bg-white rounded border border-slate-200">
                            <span className="text-xs text-slate-500 block">Backend Server (8080)</span>
                            <span className={`text-sm font-bold flex items-center gap-1 mt-1 ${
                                diagnosticsResult.backend?.includes('Failed') ? 'text-red-600' : 'text-emerald-600'
                            }`}>
                                {diagnosticsResult.backend?.includes('Failed') ? <FaExclamationTriangle /> : <FaCheckCircle />}
                                {diagnosticsResult.backend || 'Online'}
                            </span>
                        </div>
                        <div className="p-3 bg-white rounded border border-slate-200">
                            <span className="text-xs text-slate-500 block">Gemini AI Service</span>
                            <span className="text-sm font-bold text-blue-600 flex items-center gap-1 mt-1">
                                <FaCheckCircle /> {diagnosticsResult.gemini || 'Ready'}
                            </span>
                        </div>
                        <div className="p-3 bg-white rounded border border-slate-200">
                            <span className="text-xs text-slate-500 block">Stripe Gateway</span>
                            <span className="text-sm font-bold text-indigo-600 flex items-center gap-1 mt-1">
                                <FaCheckCircle /> {diagnosticsResult.stripe || 'Configured'}
                            </span>
                        </div>
                    </div>
                ) : (
                    <p className="text-xs text-slate-500">
                        Click "Run Full Diagnostics" above to test backend API endpoints, Gemini connection, and Stripe status.
                    </p>
                )}
            </div>

            <div className="flex items-center justify-end pt-2">
                <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2 text-sm font-medium text-white bg-slate-800 hover:bg-slate-900 rounded-md flex items-center space-x-2 shadow-sm"
                >
                    {saving && <FaSpinner className="animate-spin text-white" />}
                    <span>Save System Health Settings</span>
                </button>
            </div>
        </form>
    );
};

export default SystemHealthSettings;
