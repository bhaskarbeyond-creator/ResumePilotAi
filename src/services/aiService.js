import { extractHeuristicResumeData, normalizeRawDataToTempJson } from './resumeFieldMapper.js';

/** Remove examples, placeholder parentheticals, and raw JSON artifacts from AI skill output. */
export function cleanSkillName(raw) {
    if (!raw) return '';
    let text = typeof raw === 'object' && raw !== null ? (raw.name || raw.title || raw.skill || raw.text || '') : String(raw);
    if (typeof text !== 'string') text = String(text || '');
    text = text.trim();
    if (text.startsWith('{') || text.startsWith('[') || text.endsWith('}') || text.endsWith(']')) {
        const match = text.match(/(?:["']?(?:name|skill|title)["']?\s*:\s*["']([^"'\r\n{}]+)["'])|(?:["']([^"'\r\n{}]+)["'])/);
        if (match) text = match[1] || match[2] || '';
        else text = text.replace(/[{}[\]"']/g, '').trim();
    }
    text = text.replace(/^(?:\{?\s*["']?(?:name|skill|title|category|skills)["']?\s*:\s*["']?)+/i, '');
    text = text.replace(/["'}\],]+$/g, '');
    if (/[{}[\]":]/.test(text) || /^category\s*:/i.test(text) || /^skills\s*:/i.test(text)) {
        return '';
    }
    return text
        .replace(/\s*\((?:e\.?g\.?|eg|example|such as|like)[^)]*\)/gi, '')
        .replace(/\s*\([^)]*,[^)]*\)/g, '')
        .replace(/\(\s*\)/g, '')
        .replace(/^["'+*\-•\s]+|["'\s]+$/g, '')
        .trim();
}

/** Kept for settings-display compatibility; model selection is enforced server-side. */
export function resolveDynamicModel(provider, aiConfig = {}) {
    const configured = {
        nvidia: aiConfig.nvidiaModel,
        gemini: aiConfig.model || aiConfig.geminiModel,
        openai: aiConfig.openaiModel,
        groq: aiConfig.groqModel,
        openrouter: aiConfig.openrouterModel,
        deepseek: aiConfig.deepseekModel,
        ollama: aiConfig.ollamaModel,
    }[provider];
    const defaults = {
        nvidia: 'meta/llama-3.2-11b-vision-instruct', gemini: 'gemini-2.0-flash',
        openai: 'gpt-4o-mini', groq: 'llama-3.3-70b-versatile',
        openrouter: 'meta-llama/llama-3.3-70b-instruct:free',
        deepseek: 'deepseek-chat', ollama: 'llama3'
    };
    return typeof configured === 'string' && /^[A-Za-z0-9._:/-]{1,100}$/.test(configured)
        ? configured : (defaults[provider] || defaults.gemini);
}

const ALLOWED_ENDPOINTS = new Set([
    'generate-summary', 'generate-interview',
    'generate-work-description', 'generate-education-description',
    'generate-skills', 'generate-certifications', 'check-grammar', 'enhance-single-bullet',
    'autocomplete', 'generate-ai-cover-letter', 'generate-job-description', 'generate-content',
    'generate-projects',
]);
const CONSOLIDATED_CONTENT_OPERATIONS = new Set([
    'generate-summary', 'generate-work-description', 'generate-education-description',
    'generate-skills', 'generate-certifications', 'enhance-single-bullet', 'autocomplete',
    'generate-job-description', 'generate-projects',
]);

export function buildAiRequest(endpointName, payload = {}) {
    let operation = endpointName;
    let finalPayload = payload;

    // Handle wrapping where caller passed 'generate-content' with operation in payload
    if ((endpointName === 'generate-content' || endpointName === '/api/generate-content') && payload.operation) {
        operation = payload.operation;
        finalPayload = payload.payload !== undefined ? payload.payload : payload;
    }

    if (!ALLOWED_ENDPOINTS.has(operation)) throw new Error(`Unsupported AI operation: ${operation}`);
    if (CONSOLIDATED_CONTENT_OPERATIONS.has(operation)) {
        return { url: '/api/generate-content', body: { operation, payload: finalPayload } };
    }
    return { url: `/api/${operation}`, body: finalPayload };
}

function resolveActiveTenantId() {
    try {
        return (typeof sessionStorage !== 'undefined' ? (sessionStorage.getItem('activeTenantId') || sessionStorage.getItem('selectedTenantId')) : null)
            || (typeof localStorage !== 'undefined' ? (localStorage.getItem('activeTenantId') || localStorage.getItem('selectedTenantId')) : null)
            || null;
    } catch (_) {
        return null;
    }
}

/**
 * Identity scope for client-side AI caches: the signed-in uid plus the tenant the
 * request will be sent under (same resolution as the X-Tenant-Id header). Caches
 * must include this in their keys so a cached AI result can never be served to a
 * different user or tenant in the same tab (account switch, tenant switch).
 */
export async function getAiCacheScope() {
    let uid = 'anon';
    try {
        const fireModule = await import('../conf/fire.js').catch(() => null);
        const current = fireModule?.default?.auth?.().currentUser;
        if (current?.uid) uid = current.uid;
    } catch (_) { /* unauthenticated */ }
    const tenant = resolveActiveTenantId();
    return `${uid}|${tenant ? String(tenant).trim() : 'personal'}`;
}

async function getAuthHeaders(forceRefresh = false, tenantId = null) {
    const headers = { 'Content-Type': 'application/json' };
    try {
        const fireModule = await import('../conf/fire.js').catch(() => null);
        const fire = fireModule?.default;
        if (fire?.auth) {
            let user = fire.auth().currentUser;
            if (!user && typeof fire.auth().onAuthStateChanged === 'function') {
                user = await new Promise(resolve => {
                    const timer = setTimeout(() => resolve(fire.auth().currentUser), 1200);
                    const unsubscribe = fire.auth().onAuthStateChanged(u => {
                        clearTimeout(timer);
                        if (typeof unsubscribe === 'function') unsubscribe();
                        resolve(u);
                    });
                });
            }
            if (user) {
                const token = await user.getIdToken(forceRefresh);
                if (token) headers['Authorization'] = `Bearer ${token}`;
            }
        }
    } catch (_) {}

    // Inject active tenant ID header for BYOK & Enterprise quota routing
    const activeTenant = tenantId || resolveActiveTenantId();
    if (activeTenant && typeof activeTenant === 'string') {
        headers['X-Tenant-Id'] = activeTenant.trim();
    }

    return headers;
}

function createAbortController(externalSignal, timeoutMs) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new DOMException('AI request timed out', 'TimeoutError')), timeoutMs);
    const abort = () => controller.abort(externalSignal.reason);
    if (externalSignal) {
        if (externalSignal.aborted) abort();
        else externalSignal.addEventListener('abort', abort, { once: true });
    }
    return {
        controller,
        dispose() {
            clearTimeout(timeout);
            externalSignal?.removeEventListener('abort', abort);
        },
    };
}

/**
 * Shared authenticated JSON boundary for stateful AI features. Credentials stay
 * server-side; callers only supply same-origin paths and JSON-safe payloads.
 */
export async function authenticatedJsonRequest(url, {
    method = 'GET',
    body,
    signal,
    timeoutMs = 45_000,
} = {}) {
    const { controller, dispose } = createAbortController(signal, timeoutMs);
    const request = async (headers) => {
        const options = {
            method,
            headers,
            credentials: 'same-origin',
            signal: controller.signal,
        };
        if (body !== undefined && method !== 'GET' && method !== 'HEAD') options.body = JSON.stringify(body);
        const response = await fetch(url, options);
        const data = await response.json().catch(() => ({}));
        return { response, data };
    };
    try {
        let headers = await getAuthHeaders(false);
        if (controller.signal.aborted) throw (controller.signal.reason || new DOMException('This operation was aborted', 'AbortError'));
        let { response, data } = await request(headers);
        if (!response.ok && (data?.error?.code === 'EMAIL_VERIFICATION_REQUIRED' || data?.error?.code === 'AUTH_REQUIRED' || response.status === 401 || response.status === 403)) {
            try {
                const fireModule = await import('../conf/fire.js').catch(() => null);
                const fire = fireModule?.default;
                if (fire?.auth?.()?.currentUser) {
                    await fire.auth().currentUser.reload().catch(() => {});
                    headers = await getAuthHeaders(true);
                    if (!controller.signal.aborted) ({ response, data } = await request(headers));
                }
            } catch (_) { /* return the original auth response below */ }
        }
        if (!response.ok) {
            const error = new Error(data?.error?.message || data?.error || 'Request failed');
            error.code = data?.error?.code || 'REQUEST_FAILED';
            error.status = response.status;
            error.requestId = data?.error?.requestId || response.headers.get('X-Request-Id') || '';
            error.session = data?.session || null;
            throw error;
        }
        return data;
    } finally {
        dispose();
    }
}

/**
 * Restores the pre-security product contract while retaining the authenticated,
 * same-origin backend boundary. Prompt construction and provider credentials stay server-side.
 */
export async function generateUserAiContent(endpointName, payload = {}, options = {}) {
    const request = buildAiRequest(endpointName, payload);
    const { controller, dispose } = createAbortController(options.signal, options.timeoutMs || 45_000);
    try {
        let headers = await getAuthHeaders(false);
        if (controller.signal.aborted) throw (controller.signal.reason || new DOMException('This operation was aborted', 'AbortError'));
        let response = await fetch(request.url, {
            method: 'POST',
            headers,
            credentials: 'same-origin',
            signal: controller.signal,
            body: JSON.stringify(request.body),
        });
        let data = await response.json().catch(() => ({}));

        // Self-healing retry: If token was unrefreshed when user verified their email,
        // force-reload Firebase auth state and refresh ID token to retry once.
        if (!response.ok && (data?.error?.code === 'EMAIL_VERIFICATION_REQUIRED' || data?.error?.code === 'AUTH_REQUIRED' || response.status === 401 || response.status === 403)) {
            try {
                const fireModule = await import('../conf/fire.js').catch(() => null);
                const fire = fireModule?.default;
                if (fire?.auth?.()?.currentUser) {
                    await fire.auth().currentUser.reload().catch(() => {});
                    headers = await getAuthHeaders(true);
                    if (!controller.signal.aborted) {
                        const retryResponse = await fetch(request.url, {
                            method: 'POST',
                            headers,
                            credentials: 'same-origin',
                            signal: controller.signal,
                            body: JSON.stringify(request.body),
                        });
                        const retryData = await retryResponse.json().catch(() => ({}));
                        if (retryResponse.ok) {
                            return retryData;
                        }
                        response = retryResponse;
                        data = retryData;
                    }
                }
            } catch (_) {}
        }

        if (!response.ok) {
            const error = new Error(data?.error?.message || data?.error || 'AI request failed');
            error.code = data?.error?.code || 'AI_REQUEST_FAILED';
            error.status = response.status;
            error.requestId = data?.error?.requestId || response.headers.get('X-Request-Id') || '';
            throw error;
        }
        return data;
    } finally {
        dispose();
    }
}

/** Parse resume text securely and merge AI extraction with deterministic local recovery. */
export async function parseResumeTextToStructuredData(rawText, options = {}) {
    const text = typeof rawText === 'string' ? rawText.slice(0, 100_000) : '';
    // Current import UX accepts text-bearing PDF/DOC/DOCX/RTF/TXT only. Image OCR remains
    // disabled until authenticated object upload and scanning exist; no prior reachable image
    // workflow is removed by this guard.
    if (!text || text.startsWith('[IMAGE_RESUME_BASE64:')) return normalizeRawDataToTempJson({}, '');
    const heuristic = normalizeRawDataToTempJson(extractHeuristicResumeData(text), text);
    const { controller, dispose } = createAbortController(options.signal, options.timeoutMs || 55_000);
    try {
        let headers = await getAuthHeaders(false);
        let response = await fetch('/api/parse-resume', {
            method: 'POST',
            headers,
            credentials: 'same-origin',
            signal: controller.signal,
            body: JSON.stringify({ rawText: text.slice(0, 40_000) })
        });
        let result = await response.json().catch(() => ({}));

        if (!response.ok && (result?.error?.code === 'EMAIL_VERIFICATION_REQUIRED' || response.status === 401 || response.status === 403)) {
            try {
                const fireModule = await import('../conf/fire.js').catch(() => null);
                const fire = fireModule?.default;
                if (fire?.auth?.()?.currentUser) {
                    await fire.auth().currentUser.reload().catch(() => {});
                    headers = await getAuthHeaders(true);
                    if (!controller.signal.aborted) {
                        const retryResponse = await fetch('/api/parse-resume', {
                            method: 'POST',
                            headers,
                            credentials: 'same-origin',
                            signal: controller.signal,
                            body: JSON.stringify({ rawText: text.slice(0, 40_000) })
                        });
                        const retryResult = await retryResponse.json().catch(() => ({}));
                        if (retryResponse.ok && retryResult.data) {
                            response = retryResponse;
                            result = retryResult;
                        }
                    }
                }
            } catch (_) {}
        }

        if (!response.ok || !result.data) return heuristic;
        const ai = normalizeRawDataToTempJson(result.data, text);
        return {
            ...heuristic,
            ...ai,
            employments: ai.employments?.length ? ai.employments : heuristic.employments,
            educations: ai.educations?.length ? ai.educations : heuristic.educations,
            skills: ai.skills?.length ? ai.skills : heuristic.skills,
            languages: ai.languages?.length ? ai.languages : heuristic.languages,
        };
    } catch (error) {
        if (error?.name === 'AbortError' && options.signal?.aborted) throw error;
        console.warn('Server AI parser unavailable; using heuristic parser:', error.message);
        return heuristic;
    } finally {
        dispose();
    }
}
