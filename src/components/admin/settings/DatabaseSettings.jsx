import React, { useCallback, useEffect, useState } from 'react';
import {
    getDatabaseSettings,
    testDatabaseConnection,
    pruneOutbox,
} from '../../../services/api/databaseAdmin';
import useConfirmDialog from '../../../hooks/useConfirmDialog';
import {
    FaDatabase, FaServer, FaCheckCircle, FaExclamationTriangle,
    FaSpinner, FaSyncAlt, FaBolt, FaHistory,
    FaLayerGroup, FaUserShield, FaClock, FaTrashAlt,
} from 'react-icons/fa';

const statusTone = (healthy) => healthy
    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
    : 'bg-red-50 text-red-800 border-red-200';

const Metric = ({ label, value, tone = 'text-slate-900' }) => (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
        <div className={`mt-1 break-words text-sm font-bold ${tone}`}>{value}</div>
    </div>
);

const QueueCard = ({ label, queue }) => (
    <div className="rounded-xl border border-slate-700 bg-slate-800/70 p-4">
        <div className="text-xs font-bold text-white">{label}</div>
        {queue ? (
            <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
                <div><dt className="text-slate-400">Active</dt><dd className="mt-1 font-bold text-amber-300">{queue.active ?? 'Unknown'}</dd></div>
                <div><dt className="text-slate-400">Dead letters</dt><dd className={`mt-1 font-bold ${Number(queue.deadLetter) > 0 ? 'text-red-300' : 'text-emerald-300'}`}>{queue.deadLetter ?? 'Unknown'}</dd></div>
                <div className="col-span-2"><dt className="text-slate-400">Schema</dt><dd className="mt-1 font-semibold text-slate-200">{queue.configured ? 'Configured' : 'Missing / not verified'}</dd></div>
            </dl>
        ) : <p className="mt-3 text-xs text-red-300">Telemetry unavailable</p>}
    </div>
);

const DatabaseSettings = () => {
    const [telemetry, setTelemetry] = useState(null);
    const [loading, setLoading] = useState(true);
    const [action, setAction] = useState(null);
    const [notice, setNotice] = useState(null);
    const [retentionDays, setRetentionDays] = useState(30);
    const { confirm, confirmationDialog } = useConfirmDialog();

    const loadSettings = useCallback(async () => {
        setLoading(true);
        try {
            setTelemetry(await getDatabaseSettings());
        } catch (error) {
            setTelemetry(null);
            setNotice({ type: 'error', text: error.message || 'Database telemetry is unavailable.' });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadSettings(); }, [loadSettings]);

    const runAction = async (name, operation, successMessage) => {
        setAction(name);
        setNotice(null);
        try {
            const result = await operation();
            setNotice({ type: 'success', text: typeof successMessage === 'function' ? successMessage(result) : successMessage });
            await loadSettings();
        } catch (error) {
            setNotice({ type: 'error', text: error.message || 'Operation failed.' });
        } finally {
            setAction(null);
        }
    };

    const prune = async () => {
        if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 365) {
            setNotice({ type: 'error', text: 'Retention must be a whole number from 1 to 365 days.' });
            return;
        }
        const approved = await confirm({
            title: 'Prune terminal outbox records?',
            message: `Permanently delete up to 1,000 terminal records per queue that are older than ${retentionDays} days? Pending and retryable records are never selected.`,
            confirmLabel: 'Prune terminal records',
            variant: 'danger',
        });
        if (!approved) return;
        await runAction('prune', () => pruneOutbox(retentionDays), result => `Pruned ${Number(result.pruned?.notifications || 0) + Number(result.pruned?.enterpriseJobs || 0)} terminal outbox record(s).`);
    };

    if (loading && !telemetry) {
        return <div className="flex items-center justify-center gap-3 py-16 text-sm font-semibold text-slate-600" role="status"><FaSpinner className="animate-spin text-2xl text-indigo-600" />Loading live MariaDB telemetry…</div>;
    }

    const database = telemetry?.database;
    const connected = database?.connected === true;
    const migrations = telemetry?.migrations;
    const queues = telemetry?.queues && !telemetry.queues.error ? telemetry.queues : null;
    const backup = telemetry?.backupVerification;

    return (
        <div className="space-y-6">
            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-white shadow-lg" aria-labelledby="database-heading">
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                    <div className="flex items-start gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-500/20 text-2xl text-indigo-300"><FaDatabase /></div>
                        <div>
                            <h2 id="database-heading" className="text-xl font-bold">Database ownership and operations</h2>
                            <p className="mt-1 text-sm text-slate-300">MariaDB is the sole application-data owner. Firebase Authentication remains the identity provider only.</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => runAction('ping', () => testDatabaseConnection(), result => `MariaDB responded in ${result.latencyMs ?? 'unknown'} ms.`)} disabled={Boolean(action)} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold hover:bg-blue-500 disabled:opacity-50">{action === 'ping' ? <FaSpinner className="animate-spin" /> : <FaBolt />}Test connection</button>
                        <button type="button" onClick={loadSettings} disabled={loading || Boolean(action)} className="inline-flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-xs font-bold hover:bg-slate-700 disabled:opacity-50"><FaSyncAlt className={loading ? 'animate-spin' : ''} />Refresh</button>
                    </div>
                </div>
            </section>

            {notice && <div role={notice.type === 'error' ? 'alert' : 'status'} className={`flex items-start gap-3 rounded-xl border p-4 text-sm font-medium ${notice.type === 'error' ? statusTone(false) : statusTone(true)}`}>{notice.type === 'error' ? <FaExclamationTriangle className="mt-0.5 shrink-0" /> : <FaCheckCircle className="mt-0.5 shrink-0" />}<span>{notice.text}</span></div>}

            <div className="grid gap-5 lg:grid-cols-2">
                <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5" aria-labelledby="mariadb-status-heading">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3"><FaServer className="text-xl text-blue-600" /><h3 id="mariadb-status-heading" className="font-bold text-slate-900">MariaDB authority</h3></div>
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${statusTone(connected)}`}>{connected ? 'CONNECTED' : 'UNAVAILABLE'}</span>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                        <Metric label="Latency" value={database?.latencyMs == null ? 'Not measured' : `${database.latencyMs} ms`} />
                        <Metric label="Version" value={database?.version || 'Not reported'} />
                        <Metric label="Tables observed" value={telemetry?.tablesCount ?? 'Not verified'} />
                        <Metric label="Owner mutable" value={telemetry?.ownershipMutable === false ? 'No' : 'Unknown'} />
                    </div>
                </section>

                <section className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5" aria-labelledby="identity-status-heading">
                    <div className="flex items-center gap-3"><FaUserShield className="text-xl text-indigo-600" /><h3 id="identity-status-heading" className="font-bold text-slate-900">Firebase Authentication</h3></div>
                    <p className="mt-3 text-sm text-slate-700">Retained for sign-in, OAuth federation, MFA, token verification, reauthentication, and identity lifecycle operations. It is not an application-data repository.</p>
                    <div className="mt-4 rounded-xl border border-indigo-100 bg-white p-3 text-xs font-semibold text-indigo-900">Identity provider reported by API: {telemetry?.identityProvider || 'Not reported'}</div>
                </section>
            </div>

            <section className="rounded-2xl border border-slate-200 bg-white p-5" aria-labelledby="migration-heading">
                <div className="flex items-center gap-2"><FaHistory className="text-indigo-600" /><h3 id="migration-heading" className="font-bold text-slate-900">Checksummed migration ledger</h3></div>
                {migrations ? <div className="mt-4 grid gap-3 sm:grid-cols-4"><Metric label="Ledger status" value={migrations.current ? 'Current' : 'Attention required'} tone={migrations.current ? 'text-emerald-700' : 'text-red-700'} /><Metric label="Applied" value={migrations.appliedCount} /><Metric label="Pending" value={migrations.pending?.length ?? 'Unknown'} /><Metric label="Checksum mismatches" value={(migrations.mismatches?.length || 0) + (migrations.unknownApplied?.length || 0)} /></div> : <p className="mt-3 text-sm text-red-700">Migration status was not verified because the database is unavailable.</p>}
                <div className={`mt-4 rounded-xl border p-3 text-sm ${backup?.status === 'VERIFIED' ? statusTone(true) : 'border-amber-200 bg-amber-50 text-amber-900'}`}><strong>Backup/restore evidence:</strong> {backup?.status || 'NOT VERIFIED'}{backup?.reason ? ` — ${backup.reason}` : ''}</div>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 text-slate-200" aria-labelledby="queue-heading">
                <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center"><div className="flex items-center gap-2"><FaLayerGroup className="text-indigo-300" /><h3 id="queue-heading" className="font-bold text-white">Durable outbox telemetry</h3></div><div className="flex flex-wrap items-end gap-2"><label className="text-xs font-semibold text-slate-300">Retain terminal records (days)<input type="number" min="1" max="365" step="1" value={retentionDays} onChange={event => setRetentionDays(Number(event.target.value))} className="mt-1 block w-28 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white" /></label><button type="button" onClick={prune} disabled={Boolean(action) || !connected} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-xs font-bold hover:bg-slate-700 disabled:opacity-50">{action === 'prune' ? <FaSpinner className="animate-spin" /> : <FaTrashAlt />}Prune terminal records</button></div></div>
                <div className="mt-4 grid gap-3 md:grid-cols-2"><QueueCard label="Lifecycle notifications" queue={queues?.notifications} /><QueueCard label="Enterprise jobs" queue={queues?.enterpriseJobs} /></div>
                <p className="mt-3 flex items-center gap-2 text-xs text-slate-400"><FaClock />Counts are live database observations, not delivery guarantees.</p>
            </section>
            {confirmationDialog}
        </div>
    );
};

export default DatabaseSettings;
