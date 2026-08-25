import { apiFetch } from './client';

export async function getJobs(params = {}) {
    const query = new URLSearchParams(params).toString();
    const data = await apiFetch(`/api/jobs-data${query ? `?${query}` : ''}`);
    return data.jobs || [];
}

export async function getJob(jobId) {
    const data = await apiFetch(`/api/jobs-data/${jobId}`);
    return data.job;
}

export async function saveJob(jobId, jobData) {
    const data = await apiFetch(`/api/jobs-data/${jobId}`, {
        method: 'POST',
        body: JSON.stringify(jobData)
    });
    return data.job;
}

export async function deleteJob(jobId) {
    await apiFetch(`/api/jobs-data/${jobId}`, { method: 'DELETE' });
    return true;
}

export async function getApplications(params = {}) {
    const query = new URLSearchParams(params).toString();
    const data = await apiFetch(`/api/jobs-data/applications/list${query ? `?${query}` : ''}`);
    return data.applications || [];
}

export async function saveApplication(appId, appData) {
    const data = await apiFetch(`/api/jobs-data/applications/${appId}`, {
        method: 'POST',
        body: JSON.stringify(appData)
    });
    return data.application;
}
