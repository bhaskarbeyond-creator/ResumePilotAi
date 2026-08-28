import { createResumeRecoveryEnvelope, normalizeResumeData, readResumeRecoveryEnvelope } from '../utils/resumeData.js';
import * as defaultResumesApi from './api/resumes.js';

export const recoveryKey = (userId, resumeId) => `resume_recovery_v1:${userId}:${resumeId}`;

function assertResumeSize(data) {
    if (new Blob([JSON.stringify(data)]).size <= 900_000) return;
    const error = new Error('This resume is too large to save. Reduce embedded images or oversized content.');
    error.code = 'RESUME_TOO_LARGE';
    throw error;
}

function persistenceApi(api) {
    return api || defaultResumesApi;
}

/**
 * Resume persistence has one path: the authenticated backend API. The backend
 * commits to MariaDB in a transaction and enforces optimistic revisions. The
 * optional `api` parameter is a datastore-neutral test seam; production callers
 * never supply it and there is no browser database client or fallback.
 */
export async function createResumeDraft(userId, initialData = {}, { resumeId = null, api = null } = {}) {
    if (!userId) throw new Error('Authentication is required');
    const data = normalizeResumeData(initialData);
    assertResumeSize(data);
    const result = await persistenceApi(api).saveResume(resumeId || `res_${Date.now()}`, data);
    return {
        id: result.id,
        revision: Number(result.revision) || 1,
        data: normalizeResumeData(result),
    };
}

export async function loadResumeDraft(userId, resumeId, { api = null } = {}) {
    if (!userId || !resumeId) return null;
    try {
        const resume = await persistenceApi(api).getResume(resumeId);
        if (!resume) return null;
        return {
            id: resume.id || resumeId,
            revision: Number(resume.revision) || 1,
            updatedAt: resume.updated_at || resume.updatedAt || null,
            data: normalizeResumeData(resume),
        };
    } catch (error) {
        if (error.status === 404) return null;
        throw error;
    }
}

export async function saveResumeDraft(userId, resumeId, resumeData, { expectedRevision = null, api = null } = {}) {
    if (!userId || !resumeId) throw new Error('A signed-in account and resume are required');
    const data = normalizeResumeData(resumeData);
    assertResumeSize(data);
    const saved = await persistenceApi(api).saveResume(resumeId, data, { expectedRevision });
    return {
        id: resumeId,
        revision: Number(saved?.revision) || (Number(expectedRevision || 0) + 1),
        data: normalizeResumeData(saved || data),
    };
}

export async function publishResume(userId, resumeId, resumeData, {
    expectedRevision = null,
    expectedPublicationRevision = null,
    api = null,
} = {}) {
    if (!userId || !resumeId) throw new Error('A signed-in account and resume are required');
    const data = normalizeResumeData(resumeData || {});
    assertResumeSize(data);
    return persistenceApi(api).publishResume(resumeId, data, { expectedRevision, expectedPublicationRevision });
}

export async function getResumePublication(userId, resumeId, { api = null } = {}) {
    if (!userId || !resumeId) return { isPublished: false };
    try {
        return (await persistenceApi(api).getResumePublication(resumeId)) || { isPublished: false };
    } catch (error) {
        if (error.status === 404) return { isPublished: false };
        throw error;
    }
}

export async function unpublishResume(userId, resumeId, { expectedPublicationRevision = null, api = null } = {}) {
    if (!userId || !resumeId) throw new Error('A signed-in account and resume are required');
    return persistenceApi(api).unpublishResume(resumeId, { expectedPublicationRevision });
}

export async function deleteResumeDraft(userId, resumeId, { api = null } = {}) {
    if (!userId || !resumeId) throw new Error('A signed-in account and resume are required');
    await persistenceApi(api).deleteResume(resumeId);
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
