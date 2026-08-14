import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import { createResumeRecoveryEnvelope, normalizeResumeData, readResumeRecoveryEnvelope } from '../utils/resumeData.js';

async function resolveDb(db) {
    if (db) return db;
    const { default: fire } = await import('../conf/fire.js');
    return fire.firestore();
}

export const recoveryKey = (userId, resumeId) => `resume_recovery_v1:${userId}:${resumeId}`;
function assertResumeSize(data) {
    if (new Blob([JSON.stringify(data)]).size <= 900_000) return;
    const error = new Error('This resume is too large to save. Reduce embedded images or oversized content.');
    error.code = 'RESUME_TOO_LARGE';
    throw error;
}

export async function createResumeDraft(userId, initialData = {}, { db = null, resumeId = null } = {}) {
    if (!userId) throw new Error('Authentication is required');
    db = await resolveDb(db);
    const reference = resumeId
        ? db.collection('users').doc(userId).collection('resumes').doc(resumeId)
        : db.collection('users').doc(userId).collection('resumes').doc();
    const data = normalizeResumeData(initialData);
    assertResumeSize(data);
    const now = firebase.firestore.Timestamp.now();
    await reference.set({ ...data, revision: 1, created_at: now, updatedAt: now });
    return { id: reference.id, revision: 1, data };
}

export async function loadResumeDraft(userId, resumeId, { db = null } = {}) {
    if (!userId || !resumeId) return null;
    db = await resolveDb(db);
    const snapshot = await db.collection('users').doc(userId).collection('resumes').doc(resumeId).get();
    if (!snapshot.exists) return null;
    const stored = snapshot.data() || {};
    return { id: snapshot.id, revision: Number(stored.revision) || 0, updatedAt: stored.updatedAt?.toDate?.() || stored.updatedAt || null, data: normalizeResumeData(stored) };
}

export async function saveResumeDraft(userId, resumeId, resumeData, { expectedRevision = null, db = null } = {}) {
    if (!userId || !resumeId) throw new Error('A signed-in account and resume are required');
    db = await resolveDb(db);
    const reference = db.collection('users').doc(userId).collection('resumes').doc(resumeId);
    const data = normalizeResumeData(resumeData);
    assertResumeSize(data);
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
            created_at: existing.created_at || firebase.firestore.Timestamp.now(),
            updatedAt: firebase.firestore.Timestamp.now(),
        });
    });
    return { id: resumeId, revision, data };
}

export async function publishResume(userId, resumeId, resumeData, { db = null } = {}) {
    if (!userId || !resumeId) throw new Error('A signed-in account and resume are required');
    db = await resolveDb(db);
    const data = normalizeResumeData(resumeData);
    assertResumeSize(data);
    await db.collection('pb').doc(resumeId).set({
        id: resumeId, ownerUid: userId, isPublished: true, publicationMode: 'explicit', object: JSON.stringify(data),
        publishedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    return { resumeId, isPublished: true };
}

export async function getResumePublication(userId, resumeId, { db = null } = {}) {
    if (!userId || !resumeId) return { isPublished: false };
    db = await resolveDb(db);
    const snapshot = await db.collection('pb').doc(resumeId).get();
    if (!snapshot.exists || snapshot.data()?.ownerUid !== userId) return { isPublished: false };
    return { isPublished: snapshot.data()?.isPublished === true && snapshot.data()?.publicationMode === 'explicit' };
}

export async function unpublishResume(userId, resumeId, { db = null } = {}) {
    if (!userId || !resumeId) throw new Error('A signed-in account and resume are required');
    db = await resolveDb(db);
    const reference = db.collection('pb').doc(resumeId);
    const snapshot = await reference.get();
    if (!snapshot.exists) return false;
    if (snapshot.data()?.ownerUid !== userId) throw new Error('Resume not found or access denied');
    await reference.update({ isPublished: false, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    return true;
}

export async function deleteResumeDraft(userId, resumeId, { db = null } = {}) {
    if (!userId || !resumeId) throw new Error('A signed-in account and resume are required');
    db = await resolveDb(db);
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
