import { authenticatedJsonRequest } from './aiService';

function sessionPath(sessionId, suffix = '') {
    const id = String(sessionId || '').trim();
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(id)) throw new Error('Invalid interview session. Start a new session to continue.');
    return `/api/live-interview/sessions/${encodeURIComponent(id)}${suffix}`;
}

export function startLiveInterviewSession(input, options = {}) {
    return authenticatedJsonRequest('/api/live-interview/sessions', {
        method: 'POST',
        body: input,
        signal: options.signal,
        timeoutMs: options.timeoutMs || 55_000,
    }).then(data => data.session);
}

export function getLiveInterviewSession(sessionId, options = {}) {
    return authenticatedJsonRequest(sessionPath(sessionId), {
        signal: options.signal,
        timeoutMs: options.timeoutMs || 20_000,
    }).then(data => data.session);
}

export function submitLiveInterviewTurn(sessionId, input, options = {}) {
    return authenticatedJsonRequest(sessionPath(sessionId, '/turns'), {
        method: 'POST',
        body: input,
        signal: options.signal,
        timeoutMs: options.timeoutMs || 55_000,
    }).then(data => data.session);
}

export function completeLiveInterviewSession(sessionId, input, options = {}) {
    return authenticatedJsonRequest(sessionPath(sessionId, '/complete'), {
        method: 'POST',
        body: input,
        signal: options.signal,
        timeoutMs: options.timeoutMs || 60_000,
    }).then(data => data.session);
}

export function abandonLiveInterviewSession(sessionId, options = {}) {
    return authenticatedJsonRequest(sessionPath(sessionId), {
        method: 'DELETE',
        signal: options.signal,
        timeoutMs: options.timeoutMs || 20_000,
    });
}
