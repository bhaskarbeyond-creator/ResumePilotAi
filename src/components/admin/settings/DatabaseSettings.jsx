import React, { useState, useEffect } from 'react';
import {
    getDatabaseSettings,
    switchDatabaseEngine,
    testDatabaseConnection,
    initializeMySqlSchema
} from '../../../services/api/databaseAdmin';
import {
    FaDatabase, FaFire, FaServer, FaCheckCircle, FaTimesCircle,
    FaExclamationTriangle, FaSpinner, FaSyncAlt, FaShieldAlt,
    FaInfoCircle, FaBolt, FaHistory, FaCheck, FaExclamationCircle
} from 'react-icons/fa';

const DatabaseSettings = () => {
    const [loading, setLoading] = useState(true);
    const [activeEngine, setActiveEngine] = useState('firestore');
    const [engineDetails, setEngineDetails] = useState({ firestore: {}, mysql: {} });
    const [recentAudits, setRecentAudits] = useState([]);
    
    // Testing & action states
    const [testingEngine, setTestingEngine] = useState(null);
    const [testResult, setTestResult] = useState(null);
    const [switching, setSwitching] = useState(false);
    const [initializingSchema, setInitializingSchema] = useState(false);
    
    // UI Feedback
    const [statusMessage, setStatusMessage] = useState(null);
    const [errorMessage, setErrorMessage] = useState(null);
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, targetEngine: null });

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        setLoading(true);
        setErrorMessage(null);
        try {
            const data = await getDatabaseSettings();
            setActiveEngine(data.activeEngine || 'firestore');
            setEngineDetails(data.engineDetails || {});
            setRecentAudits(data.recentAudits || []);
        } catch (err) {
            setErrorMessage(err.message || 'Failed to load database configuration.');
        } finally {
            setLoading(false);
        }
    };

    const handleTestConnection = async (engine) => {
        setTestingEngine(engine);
        setTestResult(null);
        try {
            const result = await testDatabaseConnection(engine);
            setTestResult({ engine, ...result });
            if (result.connected) {
                setStatusMessage(`Connection to ${engine.toUpperCase()} succeeded (${result.latencyMs}ms).`);
            } else {
                setErrorMessage(`Connection to ${engine.toUpperCase()} failed: ${result.error}`);
            }
        } catch (err) {
            setErrorMessage(`Failed to test ${engine}: ${err.message}`);
        } finally {
            setTestingEngine(null);
        }
    };

    const handleInitializeSchema = async () => {
        setInitializingSchema(true);
        setStatusMessage(null);
        setErrorMessage(null);
        try {
            await initializeMySqlSchema();
            setStatusMessage('MySQL / MariaDB schema verified and initialized successfully.');
            await loadSettings();
        } catch (err) {
            setErrorMessage(`Schema initialization failed: ${err.message}`);
        } finally {
            setInitializingSchema(false);
        }
    };

    const requestSwitch = (targetEngine) => {
        if (targetEngine === activeEngine) return;
        setConfirmModal({ isOpen: true, targetEngine });
    };

    const executeSwitch = async () => {
        const target = confirmModal.targetEngine;
        setConfirmModal({ isOpen: false, targetEngine: null });
        setSwitching(true);
        setStatusMessage(null);
        setErrorMessage(null);

        try {
            const result = await switchDatabaseEngine(target);
            setActiveEngine(result.engine);
            setStatusMessage(result.message || `Successfully switched active database to ${target.toUpperCase()}!`);
            await loadSettings();
        } catch (err) {
            setErrorMessage(err.message || `Failed to switch to ${target.toUpperCase()}.`);
        } finally {
            setSwitching(false);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500 space-y-3">
                <FaSpinner className="animate-spin text-3xl text-emerald-600" />
                <p className="text-sm font-semibold">Inspecting database backends & connectivity...</p>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Header Banner */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-slate-900 text-white rounded-2xl shadow-md border border-slate-800">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-2xl border border-emerald-500/30">
                        <FaDatabase />
                    </div>
                    <div>
                        <div className="flex items-center gap-3">
                            <h2 className="text-lg font-bold">Dual-Database Engine Control</h2>
                            <span className={`px-3 py-0.5 text-xs font-black rounded-full uppercase tracking-wider ${
                                activeEngine === 'mysql' 
                                    ? 'bg-blue-500 text-white' 
                                    : 'bg-amber-500 text-slate-950'
                            }`}>
                                ACTIVE: {activeEngine.toUpperCase()}
                            </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                            Switch between Cloud Firestore and High-Performance MySQL/MariaDB with zero data loss.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={loadSettings}
                        disabled={loading || switching}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition border border-slate-700 disabled:opacity-50"
                    >
                        <FaSyncAlt className={loading ? 'animate-spin' : ''} />
                        Refresh Status
                    </button>
                </div>
            </div>

            {/* Status & Error Alerts */}
            {statusMessage && (
                <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm font-medium">
                    <FaCheckCircle className="text-emerald-600 text-base shrink-0" />
                    <span>{statusMessage}</span>
                </div>
            )}

            {errorMessage && (
                <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 text-red-800 rounded-xl text-sm font-medium">
                    <FaExclamationTriangle className="text-red-600 text-base shrink-0" />
                    <span>{errorMessage}</span>
                </div>
            )}

            {/* Backend Engines Selection Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 1. Firestore Card */}
                <div className={`p-6 rounded-2xl border transition relative ${
                    activeEngine === 'firestore'
                        ? 'border-amber-400 bg-amber-50/20 shadow-md ring-2 ring-amber-400/20'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                }`}>
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center text-xl">
                                <FaFire />
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-900">Google Cloud Firestore</h3>
                                <p className="text-xs text-slate-500">Document NoSQL / Realtime Fallback</p>
                            </div>
                        </div>

                        {activeEngine === 'firestore' && (
                            <span className="flex items-center gap-1.5 px-3 py-1 bg-amber-500 text-slate-950 text-xs font-black rounded-full">
                                <FaCheck /> ACTIVE
                            </span>
                        )}
                    </div>

                    <div className="mt-5 space-y-2 text-xs text-slate-600 bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <div className="flex justify-between">
                            <span className="font-semibold text-slate-500">Status:</span>
                            <span className={`font-bold flex items-center gap-1 ${
                                engineDetails.firestore?.connected ? 'text-emerald-600' : 'text-red-600'
                            }`}>
                                {engineDetails.firestore?.connected ? <FaCheckCircle /> : <FaTimesCircle />}
                                {engineDetails.firestore?.connected ? 'Connected' : 'Unavailable'}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="font-semibold text-slate-500">Project ID:</span>
                            <span className="font-mono">{engineDetails.firestore?.projectId || 'ai-resume-builder'}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="font-semibold text-slate-500">Latency:</span>
                            <span>{engineDetails.firestore?.latencyMs !== undefined ? `${engineDetails.firestore.latencyMs}ms` : '—'}</span>
                        </div>
                    </div>

                    <div className="mt-5 flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => handleTestConnection('firestore')}
                            disabled={testingEngine === 'firestore'}
                            className="flex-1 py-2 px-3 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition flex items-center justify-center gap-1.5"
                        >
                            {testingEngine === 'firestore' ? <FaSpinner className="animate-spin" /> : <FaBolt />}
                            Test Firestore
                        </button>

                        {activeEngine !== 'firestore' && (
                            <button
                                type="button"
                                onClick={() => requestSwitch('firestore')}
                                disabled={switching}
                                className="flex-1 py-2 px-3 text-xs font-bold rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 transition flex items-center justify-center gap-1.5 shadow-sm"
                            >
                                Switch to Firestore
                            </button>
                        )}
                    </div>
                </div>

                {/* 2. MySQL / MariaDB Card */}
                <div className={`p-6 rounded-2xl border transition relative ${
                    activeEngine === 'mysql'
                        ? 'border-blue-500 bg-blue-50/20 shadow-md ring-2 ring-blue-500/20'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                }`}>
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center text-xl">
                                <FaServer />
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-900">MySQL / MariaDB</h3>
                                <p className="text-xs text-slate-500">Hostinger & Dedicated SQL Engine</p>
                            </div>
                        </div>

                        {activeEngine === 'mysql' && (
                            <span className="flex items-center gap-1.5 px-3 py-1 bg-blue-600 text-white text-xs font-black rounded-full">
                                <FaCheck /> ACTIVE
                            </span>
                        )}
                    </div>

                    <div className="mt-5 space-y-2 text-xs text-slate-600 bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <div className="flex justify-between">
                            <span className="font-semibold text-slate-500">Status:</span>
                            <span className={`font-bold flex items-center gap-1 ${
                                engineDetails.mysql?.connected ? 'text-emerald-600' : 'text-red-600'
                            }`}>
                                {engineDetails.mysql?.connected ? <FaCheckCircle /> : <FaTimesCircle />}
                                {engineDetails.mysql?.connected ? 'Connected' : 'Unavailable'}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="font-semibold text-slate-500">Host / Database:</span>
                            <span className="font-mono">{engineDetails.mysql?.host || '127.0.0.1'} / {engineDetails.mysql?.database || 'ai_resume_builder'}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="font-semibold text-slate-500">Server Version:</span>
                            <span className="font-mono">{engineDetails.mysql?.version || 'Unknown'}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="font-semibold text-slate-500">Latency:</span>
                            <span>{engineDetails.mysql?.latencyMs !== undefined ? `${engineDetails.mysql.latencyMs}ms` : '—'}</span>
                        </div>
                    </div>

                    <div className="mt-5 flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => handleTestConnection('mysql')}
                            disabled={testingEngine === 'mysql'}
                            className="flex-1 py-2 px-3 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition flex items-center justify-center gap-1.5"
                        >
                            {testingEngine === 'mysql' ? <FaSpinner className="animate-spin" /> : <FaBolt />}
                            Test MySQL
                        </button>

                        {activeEngine !== 'mysql' && (
                            <button
                                type="button"
                                onClick={() => requestSwitch('mysql')}
                                disabled={switching}
                                className="flex-1 py-2 px-3 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition flex items-center justify-center gap-1.5 shadow-sm"
                            >
                                Switch to MySQL
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Utility Actions: Schema Verification & Migration */}
            <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h4 className="font-bold text-slate-900 text-sm">Database Utilities & Schema Maintenance</h4>
                        <p className="text-xs text-slate-500">Ensure all MySQL tables, indexes, and constraints exist before switching traffic.</p>
                    </div>

                    <button
                        type="button"
                        onClick={handleInitializeSchema}
                        disabled={initializingSchema}
                        className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition flex items-center gap-2 disabled:opacity-50"
                    >
                        {initializingSchema ? <FaSpinner className="animate-spin" /> : <FaCheckCircle />}
                        Verify / Initialize Schema
                    </button>
                </div>
            </div>

            {/* Switch Audit Log */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <FaHistory className="text-slate-500" />
                        <h4 className="font-bold text-slate-900 text-sm">Database Switch Audit History</h4>
                    </div>
                    <span className="text-xs text-slate-500">Last 20 Operations</span>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
                            <tr>
                                <th className="p-3.5">Timestamp</th>
                                <th className="p-3.5">Switched By</th>
                                <th className="p-3.5">From</th>
                                <th className="p-3.5">To</th>
                                <th className="p-3.5">Status</th>
                                <th className="p-3.5">Error / Details</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                            {recentAudits.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="p-6 text-center text-slate-400 italic">
                                        No database switch events recorded yet.
                                    </td>
                                </tr>
                            ) : (
                                recentAudits.map((a, idx) => (
                                    <tr key={a.id || idx} className="hover:bg-slate-50/50">
                                        <td className="p-3.5 font-mono text-slate-500">
                                            {a.created_at ? new Date(a.created_at).toLocaleString() : '—'}
                                        </td>
                                        <td className="p-3.5 font-semibold text-slate-900">{a.switched_by || 'SUPER_ADMIN'}</td>
                                        <td className="p-3.5 font-mono uppercase">{a.from_engine || '—'}</td>
                                        <td className="p-3.5 font-mono uppercase font-bold text-slate-900">{a.to_engine || '—'}</td>
                                        <td className="p-3.5">
                                            <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                                                a.status === 'SUCCESS' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
                                            }`}>
                                                {a.status}
                                            </span>
                                        </td>
                                        <td className="p-3.5 text-slate-500 truncate max-w-xs">{a.error_message || '—'}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Confirmation Modal */}
            {confirmModal.isOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95 duration-150">
                        <div className="flex items-center gap-3 text-amber-600">
                            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-xl shrink-0">
                                <FaExclamationCircle />
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-900 text-base">Confirm Database Engine Switch</h3>
                                <p className="text-xs text-slate-500">Authorize active data plane transition</p>
                            </div>
                        </div>

                        <p className="text-xs text-slate-600 leading-relaxed">
                            You are about to switch the application data layer from{' '}
                            <strong className="text-slate-900 uppercase">{activeEngine}</strong> to{' '}
                            <strong className="text-slate-900 uppercase">{confirmModal.targetEngine}</strong>.
                            All subsequent reads and writes will route directly through the new engine.
                        </p>

                        <div className="p-3.5 bg-slate-50 rounded-xl text-xs text-slate-600 border border-slate-200 space-y-1">
                            <p className="font-semibold text-slate-700 flex items-center gap-1.5">
                                <FaShieldAlt className="text-emerald-600" /> Automatic Safety Checks:
                            </p>
                            <p className="text-slate-500">• Live connection check is required before activation.</p>
                            <p className="text-slate-500">• Firestore data remains completely untouched and safe as fallback.</p>
                        </div>

                        <div className="flex items-center justify-end gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setConfirmModal({ isOpen: false, targetEngine: null })}
                                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={executeSwitch}
                                className="px-5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition shadow-md"
                            >
                                Confirm & Switch to {confirmModal.targetEngine?.toUpperCase()}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DatabaseSettings;
