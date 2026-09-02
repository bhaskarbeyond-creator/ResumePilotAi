import { apiFetch } from './client.js';

export async function getResumes() {
    const data = await apiFetch('/api/resumes');
    return data.resumes || [];
}

export async function getResume(resumeId) {
    const data = await apiFetch(`/api/resumes/${resumeId}`);
    return data.resume;
}

export async function getPublicResume(resumeId) {
    const data = await apiFetch(`/api/resumes/public/${resumeId}`);
    return data.resume;
}

export async function saveResume(resumeId, resumeData, options = {}) {
    const data = await apiFetch(`/api/resumes/${resumeId}`, {
        method: 'POST',
        body: JSON.stringify({ ...resumeData, expectedRevision: options.expectedRevision })
    });
    return data.resume;
}

export async function deleteResume(resumeId) {
    await apiFetch(`/api/resumes/${resumeId}`, {
        method: 'DELETE'
    });
    return true;
}

export async function publishResume(resumeId, resumeData, options = {}) {
    const data = await apiFetch(`/api/resumes/${resumeId}/publish`, {
        method: 'POST',
        body: JSON.stringify({
            resumeData,
            expectedRevision: options.expectedRevision,
            expectedPublicationRevision: options.expectedPublicationRevision
        })
    });
    return data;
}

export async function unpublishResume(resumeId, options = {}) {
    const data = await apiFetch(`/api/resumes/${resumeId}/unpublish`, {
        method: 'POST',
        body: JSON.stringify({
            expectedPublicationRevision: options.expectedPublicationRevision
        })
    });
    return data;
}

export async function getResumePublication(resumeId) {
    const data = await apiFetch(`/api/resumes/${resumeId}/publication`);
    return data;
}
