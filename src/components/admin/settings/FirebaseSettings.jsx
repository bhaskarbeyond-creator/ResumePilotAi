import React, { useCallback, useEffect, useState } from 'react';
import { fetchAdminWithReauth } from '../../../services/adminReauth';
import {
    FaCheckCircle, FaExclamationTriangle, FaEye, FaEyeSlash,
    FaFire, FaKey, FaLock, FaServer, FaShieldAlt, FaSpinner, FaSyncAlt,
    FaTimesCircle, FaUserShield,
} from 'react-icons/fa';

const ReadField = ({ label, value, masked = false, reveal = false }) => {
    const displayValue = !value ? 'Not configured' : masked && !reveal ? `${String(value).slice(0, 6)}••••••••` : value;
    return (
        <div>
            <dt className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
            <dd className={`min-h-10 break-all rounded-lg border px-3 py-2 text-sm ${value ? 'border-slate-200 bg-slate-50 text-slate-800' : 'border-red-200 bg-red-50 font-semibold text-red-700'}`}>{displayValue}</dd>
        </div>
    );
};

const FirebaseSettings = () => {
    const clientConfig = {
        apiKey: import.meta.env.VITE_FIREBASE_KEY || '',
        authDomain: import.meta.env.VITE_FIREBASE_DOMAIN || '',
        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
        appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
    };
    const clientReady = Boolean(clientConfig.apiKey && clientConfig.projectId && clientConfig.appId);

    const [showApiKey, setShowApiKey] = useState(false);
    const [serviceAccount, setServiceAccount] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const loadServiceAccountStatus = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const { response, data } = await fetchAdminWithReauth('/api/admin/firebase-service-account');
            if (!response.ok || !data?.success) {
                throw new Error(data?.error?.message || data?.error || 'Firebase Authentication service status is unavailable.');
            }
            setServiceAccount(data);
        } catch (loadError) {
            setServiceAccount(null);
            setError(loadError.message || 'Firebase Authentication service status is unavailable.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadServiceAccountStatus(); }, [loadServiceAccountStatus]);

    const adminReady = serviceAccount?.adminSdkReady === true;
    const credentialsPresent = serviceAccount?.configured === true;

    return (
        <div className="space-y-6">
            <section className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-5" aria-labelledby="firebase-identity-heading">
                <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-xl text-amber-500 shadow-sm"><FaFire /></div>
                    <div>
                        <h2 id="firebase-identity-heading" className="font-bold text-slate-900">Firebase Authentication identity plane</h2>
                        <p className="mt-1 text-sm text-slate-700">Firebase is retained only for authentication, OAuth federation, MFA, reauthentication, token verification, and identity lifecycle operations. All ResumePilot application data is owned by MariaDB APIs.</p>
                    </div>
                </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="client-auth-heading">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                    <div className="flex items-center gap-3">
                        <FaUserShield className="text-xl text-indigo-600" />
                        <div><h3 id="client-auth-heading" className="font-bold text-slate-900">Browser Auth configuration</h3><p className="text-xs text-slate-500">Effective values in this deployed frontend artifact</p></div>
                    </div>
                    <span className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${clientReady ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>{clientReady ? <FaCheckCircle /> : <FaTimesCircle />}{clientReady ? 'CONFIGURED' : 'INCOMPLETE'}</span>
                </div>

                <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
                    These Firebase Web identifiers are deployment-owned and compiled into the frontend. Change them through the approved deployment configuration and rebuild; saving database settings cannot reconfigure an already-built browser client.
                </div>

                <dl className="mt-4 grid gap-4 md:grid-cols-2">
                    <div className="relative">
                        <ReadField label="Web API key" value={clientConfig.apiKey} masked reveal={showApiKey} />
                        {clientConfig.apiKey && <button type="button" onClick={() => setShowApiKey(value => !value)} className="absolute bottom-2 right-2 rounded p-1 text-slate-500 hover:bg-slate-200" aria-label={showApiKey ? 'Hide Firebase Web API key' : 'Show Firebase Web API key'}>{showApiKey ? <FaEyeSlash /> : <FaEye />}</button>}
                    </div>
                    <ReadField label="Auth domain" value={clientConfig.authDomain} />
                    <ReadField label="Project ID" value={clientConfig.projectId} />
                    <ReadField label="App ID" value={clientConfig.appId} />
                </dl>
                <p className="mt-4 flex items-start gap-2 text-xs text-slate-500"><FaLock className="mt-0.5 shrink-0" />No Firestore, Realtime Database, Cloud Storage, or application-data endpoint is configured here. OAuth provider availability is controlled separately in Modules settings and in the Firebase console.</p>
            </section>

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="server-auth-heading">
                <div className="flex flex-col justify-between gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center">
                    <div className="flex items-center gap-3"><FaShieldAlt className="text-xl text-indigo-600" /><div><h3 id="server-auth-heading" className="font-bold text-slate-900">Server Auth adapter</h3><p className="text-xs text-slate-500">Firebase Admin SDK identity operations</p></div></div>
                    <button type="button" onClick={loadServiceAccountStatus} disabled={loading} className="inline-flex w-fit items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><FaSyncAlt className={loading ? 'animate-spin' : ''} />Refresh status</button>
                </div>

                <div className="p-5">
                    {loading && !serviceAccount ? (
                        <div className="flex items-center gap-2 py-8 text-sm font-semibold text-slate-600" role="status"><FaSpinner className="animate-spin text-indigo-600" />Checking server Auth readiness…</div>
                    ) : error ? (
                        <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800"><FaExclamationTriangle className="mt-0.5 shrink-0" />{error}</div>
                    ) : (
                        <>
                            <div className={`flex items-start gap-3 rounded-xl border p-4 ${adminReady ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-red-200 bg-red-50 text-red-900'}`}>
                                {adminReady ? <FaCheckCircle className="mt-0.5 shrink-0" /> : <FaTimesCircle className="mt-0.5 shrink-0" />}
                                <div><div className="text-sm font-bold">{adminReady ? 'Admin SDK Auth adapter is ready' : 'Admin SDK Auth adapter is not ready'}</div><p className="mt-1 text-xs">{adminReady ? 'The backend reported an initialized identity adapter. This status does not certify every Auth workflow.' : credentialsPresent ? 'Credential metadata exists, but the backend did not report a ready Admin SDK adapter.' : 'No complete server identity credential binding was reported.'}</p></div>
                            </div>
                            <dl className="mt-4 grid gap-4 md:grid-cols-2">
                                <ReadField label="Project ID" value={serviceAccount?.projectId} />
                                <ReadField label="Service identity" value={serviceAccount?.clientEmail} />
                            </dl>
                            <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><FaKey className="mt-0.5 shrink-0" /><span>Private credentials are never displayed or accepted by this browser panel. Configure Application Default Credentials, Workload Identity or the deployment Secret Manager, then restart or redeploy through the approved operational process.</span></div>
                        </>
                    )}
                </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700">
                <div className="flex items-start gap-2"><FaServer className="mt-0.5 shrink-0 text-slate-500" /><p><strong>Scope:</strong> This page reports configuration presence and adapter initialization only. Email/password, OAuth, password reset, email verification, session, reauthentication, and MFA flows require independent browser and backend verification.</p></div>
            </section>
        </div>
    );
};

export default FirebaseSettings;
