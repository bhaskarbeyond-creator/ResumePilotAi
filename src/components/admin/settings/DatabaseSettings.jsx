import React, { useState, useEffect } from 'react';
import {
    getDatabaseSettings,
    switchDatabaseEngine,
    testDatabaseConnection,
    initializeMySqlSchema,
    triggerSyncNow,
    verifyDatabaseParity,
    retryDeadLetters
} from '../../../services/api/databaseAdmin';
import {
    FaDatabase, FaFire, FaServer, FaCheckCircle, FaTimesCircle,
    FaExclamationTriangle, FaSpinner, FaSyncAlt, FaShieldAlt,
    FaInfoCircle, FaBolt, FaHistory, FaCheck, FaExclamationCircle,
    FaExchangeAlt, FaLayerGroup, FaCheckDouble
} from 'react-icons/fa';

const DatabaseSettings = () => {
    const [loading, setLoading] = useState(true);
    const [activeEngine, setActiveEngine] = useState('mysql');
    const [engineDetails, setEngineDetails] = useState({ firestore: {}, mysql: {} });
    const [syncHealth, setSyncHealth] = useState(null);
    const [recentAudits, setRecentAudits] = useState([]);
    
    // Testing & action states
    const [testingEngine, setTestingEngine] = useState(null);
    const [switching, setSwitching] = useState(false);
    const [initializingSchema, setInitializingSchema] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [verifyingParity, setVerifyingParity] = useState(false);
    const [parityResult, setParityResult] = useState(null);
    
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
            setActiveEngine(data.activeEngine || 'mysql');
            setEngineDetails(data.engineDetails || {});
            setSyncHealth(data.syncHealth || null);
            setRecentAudits(data.recentAudits || []);
        } catch (err) {
            setErrorMessage(err.message || 'Failed to load database configuration.');
        } finally {
            setLoading(false);
        }
    };

    const handleTestConnection = async (engine) => {
        setTestingEngine(engine);
        try {
            const result = await testDatabaseConnection(engine);
            if (result.connected) {
                setStatusMessage(`Connection to ${engine.toUpperCase()} succeeded (${result.latencyMs}ms).`);
            } else {
                setErrorMessage(`Connection to ${engine.toUpperCase()} failed: ${result.error}`);
            }
            await loadSettings();
        } catch (err) {
            setErrorMessage(`Failed to test ${engine}: ${err.message}`);
        } finally {
            setTestingEngine(null);
        }
    };

    const handleSyncNow = async () => {
        setSyncing(true);
        setStatusMessage(null);
        setErrorMessage(null);
        try {
            const result = await triggerSyncNow();
            setStatusMessage(`Sync completed: ${result.processed} processed, ${result.failed} retrying.`);
            setSyncHealth(result.currentHealth || syncHealth);
            await loadSettings();
        } catch (err) {
            setErrorMessage(`Sync failed: ${err.message}`);
        } finally {
            setSyncing(false);
        }
    };

    const handleVerifyParity = async () => {
        setVerifyingParity(true);
        setStatusMessage(null);
        setErrorMessage(null);
        try {
            const result = await verifyDatabaseParity();
            setParityResult(result);
            setStatusMessage(`Parity Verification: ${result.parityPercentage}% Match across all collections.`);
        } catch (err) {
            setErrorMessage(`Parity verification failed: ${err.message}`);
        } finally {
            setVerifyingParity(false);
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

    const executeSwitch = async (force = false) => {
        const target = confirmModal.targetEngine;
        setConfirmModal({ isOpen: false, targetEngine: null });
        setSwitching(true);
        setStatusMessage(null);
        setErrorMessage(null);

        try {
            const result = await switchDatabaseEngine(target, force);
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
                <p className="text-sm font-semibold">Inspecting dual-database backends & sync telemetry...</p>
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
                            <h2 className="text-lg font-bold">Dual-Database Engine Control Plane</h2>
                            <span className={`px-3 py-0.5 text-xs font-black rounded-full uppercase tracking-wider ${
                                activeEngine === 'mysql' 
                                    ? 'bg-blue-500 text-white' 
                                    : 'bg-amber-500 text-slate-950'
                            }`}>
                                PRIMARY: {activeEngine.toUpperCase()}
                            </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                            High-Performance MariaDB & Google Cloud Firestore with zero-downtime intelligent replication.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={handleSyncNow}
                        disabled={syncing}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold rounded-xl transition shadow-sm disabled:opacity-50"
                    >
                        <FaSyncAlt className={syncing ? 'animate-spin' : ''} />
                        Sync Now
                    </button>

                    <button
                        onClick={handleVerifyParity}
                        disabled={verifyingParity}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-700 hover:bg-indigo-600 text-white text-xs font-bold rounded-xl transition shadow-sm disabled:opacity-50"
                    >
                        <FaCheckDouble className={verifyingParity ? 'animate-spin' : ''} />
                        Verify Parity
                    </button>

                    <button
                        onClick={loadSettings}
                        disabled={loading || switching}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition border border-slate-700 disabled:opacity-50"
                    >
                        <FaSyncAlt className={loading ? 'animate-spin' : ''} />
                        Refresh
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

            {/* Sync Telemetry Dashboard */}
            {syncHealth && (
                <div className="p-6 bg-slate-900 text-slate-200 rounded-2xl border border-slate-800 shadow-sm space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-3 gap-2">
                        <div className="flex items-center gap-2 font-bold text-sm text-white">
                            <FaExchangeAlt className="text-emerald-400" />
                            <span>Autonomous Background Sync Worker & Telemetry</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className={`px-2.5 py-0.5 text-xs font-bold rounded-md flex items-center gap-1.5 ${
                                syncHealth.worker?.status === 'RUNNING' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'
                            }`}>
                                <span className={`w-2 h-2 rounded-full ${syncHealth.worker?.status === 'RUNNING' ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`}></span>
                                WORKER: {syncHealth.worker?.status || 'RUNNING'} {syncHealth.worker?.pid ? `(PID ${syncHealth.worker.pid})` : ''}
                            </span>
                            <span className={`px-2.5 py-0.5 text-xs font-bold rounded-md ${
                                syncHealth.isHealthy ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                            }`}>
                                {syncHealth.isHealthy ? '● SYNC HEALTHY' : '▲ ATTENTION'}
                            </span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-6 gap-4 text-xs">
                        <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60">
                            <div className="text-slate-400">Worker Heartbeat</div>
                            <div className="text-sm font-bold text-white mt-0.5">
                                {syncHealth.worker?.heartbeatAgeSeconds !== undefined && syncHealth.worker?.heartbeatAgeSeconds < 60
                                    ? `${syncHealth.worker.heartbeatAgeSeconds}s ago`
                                    : 'Live'}
                            </div>
                        </div>
                        <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60">
                            <div className="text-slate-400">Sync Lag</div>
                            <div className="text-base font-bold text-white mt-0.5">{syncHealth.syncLagSeconds}s</div>
                        </div>
                        <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60">
                            <div className="text-slate-400">Pending Outbox</div>
                            <div className="text-base font-bold text-white mt-0.5">{syncHealth.pendingCount}</div>
                        </div>
                        <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60">
                            <div className="text-slate-400">Active Conflicts</div>
                            <div className="text-base font-bold text-white mt-0.5">{syncHealth.conflictCount}</div>
                        </div>
                        <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60">
                            <div className="text-slate-400">Dead Letters</div>
                            <div className="text-base font-bold text-white mt-0.5">{syncHealth.deadLetterCount}</div>
                        </div>
                        <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60">
                            <div className="text-slate-400">Total Synced</div>
                            <div className="text-base font-bold text-white mt-0.5">{syncHealth.worker?.totalEventsProcessed || 0}</div>
                        </div>
                    </div>

                    {syncHealth.lastSuccessfulSyncAt && (
                        <div className="text-[11px] text-slate-400 flex items-center justify-between pt-2 border-t border-slate-800/60">
                            <span>Last Successful Event: <strong className="text-slate-300">{new Date(syncHealth.lastSuccessfulSyncAt).toLocaleString()}</strong></span>
                            <span>Standby Engine: <strong className="text-slate-300 uppercase">{syncHealth.standbyEngine}</strong></span>
                        </div>
                    )}
                </div>
            )}

            {/* Parity Results Matrix */}
            {parityResult && (
                <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                        <div className="flex items-center gap-2 font-bold text-sm text-slate-900">
                            <FaCheckDouble className="text-indigo-600" />
                            <span>Database Parity Reconciliation Matrix</span>
                        </div>
                        <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-full">
                            {parityResult.parityPercentage}% Match
                        </span>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr className="border-b border-slate-200 text-slate-500">
                                    <th className="py-2">Collection / Table</th>
                                    <th className="py-2">Firestore Count</th>
                                    <th className="py-2">MySQL Count</th>
                                    <th className="py-2">Discrepancy</th>
                                    <th className="py-2">Parity Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {parityResult.parityTable?.map((row, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50">
                                        <td className="py-2.5 font-bold font-mono text-slate-800">{row.entity}</td>
                                        <td className="py-2.5">{row.firestore}</td>
                                        <td className="py-2.5">{row.mysql}</td>
                                        <td className="py-2.5 font-bold">{row.diff}</td>
                                        <td className="py-2.5">
                                            <span className={`px-2 py-0.5 rounded font-bold text-[11px] ${
                                                row.match ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                                            }`}>
                                                {row.match ? '✓ 100% MATCH' : 'MISMATCH'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
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
                                <FaCheck /> PRIMARY
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
                            <span className="font-mono">{engineDetails.firestore?.projectId || 'ai-resume-builder-424cf'}</span>
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
                                <p className="text-xs text-slate-500">Relational InnoDB / Hostinger Local</p>
                            </div>
                        </div>

                        {activeEngine === 'mysql' && (
                            <span className="flex items-center gap-1.5 px-3 py-1 bg-blue-600 text-white text-xs font-black rounded-full">
                                <FaCheck /> PRIMARY
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
                            <span className="font-semibold text-slate-500">Database:</span>
                            <span className="font-mono">{engineDetails.mysql?.database || 'u727965524_airesume'}</span>
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

            {/* Switch Confirmation Modal */}
            {confirmModal.isOpen && (
                <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4 border border-slate-200">
                        <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center text-2xl">
                            <FaShieldAlt />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-slate-900">
                                Confirm Database Switch to {confirmModal.targetEngine?.toUpperCase()}
                            </h3>
                            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                                The system will perform pre-switch synchronization, drain the outbox queue, and verify data parity before switching active routing.
                            </p>
                        </div>

                        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                            <button
                                type="button"
                                onClick={() => setConfirmModal({ isOpen: false, targetEngine: null })}
                                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => executeSwitch(false)}
                                disabled={switching}
                                className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition shadow-sm flex items-center gap-1.5"
                            >
                                {switching ? <FaSpinner className="animate-spin" /> : <FaCheck />}
                                Confirm & Switch
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Audit Log Table */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center gap-2 font-bold text-sm text-slate-900 border-b border-slate-100 pb-3">
                    <FaHistory className="text-slate-500" />
                    <span>Database Engine Switch Audit History</span>
                </div>

                {recentAudits.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No database engine switches recorded yet.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead>
                                <tr className="border-b border-slate-100 text-slate-400 font-semibold">
                                    <th className="py-2">Timestamp</th>
                                    <th className="py-2">Initiator</th>
                                    <th className="py-2">Transition</th>
                                    <th className="py-2">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {recentAudits.map((a, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50">
                                        <td className="py-2 text-slate-600">{new Date(a.createdAt).toLocaleString()}</td>
                                        <td className="py-2 font-mono text-slate-800">{a.switchedBy}</td>
                                        <td className="py-2 font-bold">{a.fromEngine?.toUpperCase()} ➔ {a.toEngine?.toUpperCase()}</td>
                                        <td className="py-2">
                                            <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                                                a.status === 'SUCCESS' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                                            }`}>
                                                {a.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DatabaseSettings;
