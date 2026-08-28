import React from 'react';
import { FaCloud, FaExclamationTriangle, FaLock } from 'react-icons/fa';

/**
 * Storage is deliberately informational until a server-side object-storage
 * adapter, authorization policy, malware scanning, lifecycle rules, and
 * backup/restore procedure have been implemented and certified.
 */
const StorageSettings = () => (
    <section className="space-y-5" aria-labelledby="storage-heading">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950" role="status">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div className="flex items-start gap-3">
                    <FaExclamationTriangle className="mt-1 shrink-0 text-amber-600" />
                    <div>
                        <h3 id="storage-heading" className="font-bold">Media object storage is not configured</h3>
                        <p className="mt-1 text-sm">This deployment has no certified server-side upload adapter. The Admin console cannot enable a provider or accept storage credentials.</p>
                    </div>
                </div>
                <span className="w-fit rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-bold">NOT VERIFIED</span>
            </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2 text-slate-900"><FaCloud className="text-sky-600" /><h4 className="font-bold">Required before activation</h4></div>
            <ul className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                <li>• Server-owned signed upload and download authorization</li>
                <li>• Tenant and principal isolation tests</li>
                <li>• Content-type, size, and malware controls</li>
                <li>• Encryption, retention, deletion, and recovery evidence</li>
                <li>• Secret Manager or workload-identity integration</li>
                <li>• Browser, failure-path, and production verification</li>
            </ul>
        </div>

        <p className="flex items-start gap-2 rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-xs text-indigo-900">
            <FaLock className="mt-0.5 shrink-0" />
            Firebase remains the identity provider only. Firebase Cloud Storage, Firestore, Cloudinary, and S3 are not enabled by this screen.
        </p>
    </section>
);

export default StorageSettings;
