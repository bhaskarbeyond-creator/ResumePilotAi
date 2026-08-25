import { createResumeRecoveryEnvelope, normalizeResumeData, readResumeRecoveryEnvelope } from '../utils/resumeData.js';
import * as resumesApi from './api/resumes.js';

export const recoveryKey = (userId, resumeId) => `resume_recovery_v1:${userId}:${resumeId}`;

function assertResumeSize(data) {
    if (new Blob([JSON.stringify(data)]).size <= 900_000) return;
    const error = new Error('This resume is too large to save. Reduce embedded images or oversized content.');
    error.code = 'RESUME_TOO_LARGE';
    throw error;
}

/**
 * Database handle resolution.
 *
 * Callers (and tests) may inject a Firestore-compatible `db` through the
 * options object; injected handles are used directly with no REST hop. When
 * no handle is injected the production flow is API-first with a direct
 * Firestore fallback for offline/custom environments.
 */
async function resolveDb(injectedDb) {
    if (injectedDb) return injectedDb;
    const { default: fire } = await import('../conf/fire.js');
    return fire.firestore();
}

export async function createResumeDraft(userId, initialData = {}, { resumeId = null, db: injectedDb = null } = {}) {
    if (!userId) throw new Error('Authentication is required');
    const data = normalizeResumeData(initialData);
    assertResumeSize(data);

    if (!injectedDb) {
        try {
            const result = await resumesApi.saveResume(resumeId || 'res_' + Date.now(), data);
            return { id: result.id, revision: result.revision || 1, data: normalizeResumeData(result) };
        } catch (apiErr) {
            // Fallback for offline/custom environments
            console.warn('[ResumePersistence] API create failed, attempting direct DB fallback:', apiErr.message);
        }
    }
    const db = await resolveDb(injectedDb);
    const reference = resumeId
        ? db.collection('users').doc(userId).collection('resumes').doc(resumeId)
        : db.collection('users').doc(userId).collection('resumes').doc();
    const now = new Date();
    await reference.set({ ...data, revision: 1, created_at: now, updatedAt: now });
    return { id: reference.id, revision: 1, data };
}

export async function loadResumeDraft(userId, resumeId, { db: injectedDb = null } = {}) {
    if (!userId || !resumeId) return null;

    if (!injectedDb) {
        try {
            const resume = await resumesApi.getResume(resumeId);
            if (!resume) return null;
            return {
                id: resume.id || resumeId,
                revision: Number(resume.revision) || 1,
                updatedAt: resume.updated_at || resume.updatedAt || null,
                data: normalizeResumeData(resume)
            };
        } catch (apiErr) {
            if (apiErr.status === 404) return null;
            console.warn('[ResumePersistence] API load failed, attempting direct DB fallback:', apiErr.message);
        }
    }
    try {
        const db = await resolveDb(injectedDb);
        const snapshot = await db.collection('users').doc(userId).collection('resumes').doc(resumeId).get();
        if (!snapshot.exists) return null;
        const stored = snapshot.data() || {};
        return {
            id: snapshot.id,
            revision: Number(stored.revision) || 0,
            updatedAt: stored.updatedAt?.toDate?.() || stored.updatedAt || null,
            data: normalizeResumeData(stored)
        };
    } catch (e) {
        console.error('[ResumePersistence] Load completely failed:', e.message);
        return null;
    }
}

export async function saveResumeDraft(userId, resumeId, resumeData, { expectedRevision = null, db: injectedDb = null } = {}) {
    if (!userId || !resumeId) throw new Error('A signed-in account and resume are required');
    const data = normalizeResumeData(resumeData);
    assertResumeSize(data);

    if (!injectedDb) {
        try {
            const saved = await resumesApi.saveResume(resumeId, data, { expectedRevision });
            return { id: resumeId, revision: Number(saved?.revision) || (Number(expectedRevision || 0) + 1), data: normalizeResumeData(saved || data) };
        } catch (apiErr) {
            if (apiErr.code === 'RESUME_CONFLICT' || apiErr.status === 409) {
                throw apiErr;
            }
            console.warn('[ResumePersistence] API save failed, attempting direct DB fallback:', apiErr.message);
        }
    }
    const db = await resolveDb(injectedDb);
    const reference = db.collection('users').doc(userId).collection('resumes').doc(resumeId);
    let revision = 0;
    await db.runTransaction(async transaction => {
        const snapshot = await transaction.get(reference);
        const existing = snapshot.exists ? snapshot.data() || {} : {};
        const currentRevision = Number(existing.revision) || 0;
        if (expectedRevision !== null && currentRevision !== Number(expectedRevision)) {
            const conflict = new Error('This resume was updated in another tab or device.');
            conflict.code = 'RESUME_CONFLICT';
            conflict.remoteRevision = currentRevision;
            conflict.remoteData = snapshot.exists ? normalizeResumeData(existing) : null;
            throw conflict;
        }
        revision = currentRevision + 1;
        transaction.set(reference, {
            ...data,
            revision,
            created_at: existing.created_at || new Date(),
            updatedAt: new Date(),
        });
    });
    return { id: resumeId, revision, data };
}

export async function publishResume(userId, resumeId, resumeData, { expectedRevision = null, expectedPublicationRevision = null, db: injectedDb = null } = {}) {
    if (!userId || !resumeId) throw new Error('A signed-in account and resume are required');

    if (!injectedDb) {
        try {
            const result = await resumesApi.publishResume(resumeId, resumeData, { expectedRevision, expectedPublicationRevision });
            return result;
        } catch (apiErr) {
            if (apiErr.code?.includes('CONFLICT') || apiErr.status === 409) throw apiErr;
            console.warn('[ResumePersistence] API publish failed, fallback to firestore:', apiErr.message);
        }
    }
    const db = await resolveDb(injectedDb);
    const ownerReference = db.collection('users').doc(userId).collection('resumes').doc(resumeId);
    const publicReference = db.collection('pb').doc(resumeId);
    let result;
    await db.runTransaction(async transaction => {
        const [ownerSnapshot, publicSnapshot] = await Promise.all([transaction.get(ownerReference), transaction.get(publicReference)]);
        if (!ownerSnapshot.exists) throw new Error('Resume not found');
        const sourceRevision = Number(ownerSnapshot.data()?.revision || 0);
        const publicationRevision = Number(publicSnapshot.data()?.publicationRevision || 0);
        if (expectedRevision !== null && sourceRevision !== Number(expectedRevision)) {
            const error = new Error('This resume changed before publication. Reload before sharing.');
            error.code = 'RESUME_CONFLICT';
            throw error;
        }
        if (expectedPublicationRevision !== null && publicationRevision !== Number(expectedPublicationRevision)) {
            const error = new Error('The public link changed in another tab. Refresh before publishing.');
            error.code = 'RESUME_PUBLICATION_CONFLICT';
            throw error;
        }
        if (publicSnapshot.exists && publicSnapshot.data()?.ownerUid !== userId) throw new Error('Resume not found or access denied');
        const data = normalizeResumeData(resumeData && Object.keys(resumeData).length ? resumeData : ownerSnapshot.data() || {});
        assertResumeSize(data);
        const nextPublicationRevision = publicationRevision + 1;
        transaction.set(publicReference, {
            id: resumeId, ownerUid: userId, isPublished: true, publicationMode: 'explicit', object: JSON.stringify(data), sourceRevision,
            publicationRevision: nextPublicationRevision, publishedAt: new Date(), updatedAt: new Date(),
        });
        result = { resumeId, isPublished: true, sourceRevision, publicationRevision: nextPublicationRevision };
    });
    return result;
}

export async function getResumePublication(userId, resumeId, { db: injectedDb = null } = {}) {
    if (!userId || !resumeId) return { isPublished: false };

    if (!injectedDb) {
        try {
            const pub = await resumesApi.getResumePublication(resumeId);
            return pub || { isPublished: false };
        } catch {
            // fall through to the direct read below
        }
    }
    try {
        const db = await resolveDb(injectedDb);
        const snapshot = await db.collection('pb').doc(resumeId).get();
        if (!snapshot.exists || snapshot.data()?.ownerUid !== userId) return { isPublished: false };
        return {
            isPublished: snapshot.data()?.isPublished === true && snapshot.data()?.publicationMode === 'explicit',
            publicationRevision: Number(snapshot.data()?.publicationRevision || 0),
            sourceRevision: Number(snapshot.data()?.sourceRevision || 0)
        };
    } catch {
        return { isPublished: false };
    }
}

export async function unpublishResume(userId, resumeId, { expectedPublicationRevision = null, db: injectedDb = null } = {}) {
    if (!userId || !resumeId) throw new Error('A signed-in account and resume are required');

    if (!injectedDb) {
        try {
            const result = await resumesApi.unpublishResume(resumeId, { expectedPublicationRevision });
            return result;
        } catch (apiErr) {
            if (apiErr.code?.includes('CONFLICT') || apiErr.status === 409) throw apiErr;
            console.warn('[ResumePersistence] API unpublish failed, fallback to firestore:', apiErr.message);
        }
    }
    const db = await resolveDb(injectedDb);
    const reference = db.collection('pb').doc(resumeId);
    let publicationRevision;
    await db.runTransaction(async transaction => {
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists) { publicationRevision = 0; return; }
        if (snapshot.data()?.ownerUid !== userId) throw new Error('Resume not found or access denied');
        const current = Number(snapshot.data()?.publicationRevision || 0);
        if (expectedPublicationRevision !== null && current !== Number(expectedPublicationRevision)) {
            const error = new Error('The public link changed in another tab. Refresh before unpublishing.');
            error.code = 'RESUME_PUBLICATION_CONFLICT';
            throw error;
        }
        publicationRevision = current + 1;
        transaction.set(reference, { isPublished: false, publicationRevision, updatedAt: new Date() }, { merge: true });
    });
    return { isPublished: false, publicationRevision };
}

export async function deleteResumeDraft(userId, resumeId, { db: injectedDb = null } = {}) {
    if (!userId || !resumeId) throw new Error('A signed-in account and resume are required');

    if (!injectedDb) {
        try {
            await resumesApi.deleteResume(resumeId);
            clearResumeRecovery(userId, resumeId);
            return true;
        } catch (apiErr) {
            console.warn('[ResumePersistence] API delete failed, fallback to firestore:', apiErr.message);
        }
    }
    const db = await resolveDb(injectedDb);
    const ownerReference = db.collection('users').doc(userId).collection('resumes').doc(resumeId);
    const publicReference = db.collection('pb').doc(resumeId);
    const favouriteReference = db.collection('users').doc(userId).collection('favourites').doc(resumeId);
    const [ownerSnapshot, publicSnapshot, favouriteSnapshot] = await Promise.all([ownerReference.get(), publicReference.get(), favouriteReference.get()]);
    if (!ownerSnapshot.exists) throw new Error('Resume not found');
    if (publicSnapshot.exists && publicSnapshot.data()?.ownerUid !== userId) throw new Error('Resume not found or access denied');
    const batch = db.batch();
    batch.delete(ownerReference);
    if (publicSnapshot.exists) batch.delete(publicReference);
    if (favouriteSnapshot.exists) batch.delete(favouriteReference);
    await batch.commit();
    clearResumeRecovery(userId, resumeId);
    return true;
}

export function writeResumeRecovery(userId, resumeId, revision, data, storage = globalThis.localStorage) {
    const envelope = createResumeRecoveryEnvelope({ userId, resumeId, revision, data });
    try { storage?.setItem(recoveryKey(userId, resumeId), JSON.stringify(envelope)); } catch { /* in-memory editing still works */ }
    return envelope;
}

export function readResumeRecovery(userId, resumeId, storage = globalThis.localStorage) {
    try { return readResumeRecoveryEnvelope(storage?.getItem(recoveryKey(userId, resumeId)), { userId, resumeId }); }
    catch { return null; }
}

export function clearResumeRecovery(userId, resumeId, storage = globalThis.localStorage) {
    try { storage?.removeItem(recoveryKey(userId, resumeId)); } catch { /* optional cache */ }
}
