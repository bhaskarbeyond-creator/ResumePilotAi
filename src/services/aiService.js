import { extractHeuristicResumeData, normalizeRawDataToTempJson } from './resumeFieldMapper.js';

/** Remove examples and placeholder parentheticals from AI skill output. */
export function cleanSkillName(raw) {
    if (!raw) return '';
    let text = typeof raw === 'string' ? raw : (raw.name || raw.title || String(raw));
    return text
        .replace(/\s*\((?:e\.?g\.?|eg|example|such as|like)[^)]*\)/gi, '')
        .replace(/\s*\([^)]*,[^)]*\)/g, '')
        .replace(/\(\s*\)/g, '')
        .replace(/^["']|["']$/g, '')
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
        nvidia: 'meta/llama-3.1-8b-instruct', gemini: 'gemini-2.0-flash',
        openai: 'gpt-4o-mini', groq: 'llama-3.3-70b-versatile',
        openrouter: 'meta-llama/llama-3.3-70b-instruct:free',
        deepseek: 'deepseek-chat', ollama: 'llama3'
    };
    return typeof configured === 'string' && /^[A-Za-z0-9._:/-]{1,100}$/.test(configured)
        ? configured : (defaults[provider] || defaults.gemini);
}

const ALLOWED_ENDPOINTS = new Set([
    'generate-resume', 'generate-summary', 'generate-interview',
    'generate-work-description', 'generate-education-description',
    'generate-skills', 'check-grammar', 'enhance-single-bullet',
    'generate-certifications', 'autocomplete'
]);
const LEGACY_PROMPT_OPERATIONS = new Set([
    'generate-summary', 'generate-work-description', 'generate-education-description',
    'generate-skills', 'enhance-single-bullet', 'generate-certifications', 'autocomplete',
]);

export function buildAiRequest(endpointName, payload = {}) {
    if (!ALLOWED_ENDPOINTS.has(endpointName)) throw new Error('Unsupported AI operation');
    if (LEGACY_PROMPT_OPERATIONS.has(endpointName)) {
        return { url: '/api/generate-content', body: { operation: endpointName, payload } };
    }
    return { url: `/api/${endpointName}`, body: payload };
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
 * Restores the pre-security product contract while retaining the authenticated,
 * same-origin backend boundary. Prompt construction and provider credentials stay server-side.
 */
export async function generateUserAiContent(endpointName, payload = {}, options = {}) {
    const request = buildAiRequest(endpointName, payload);
    const { controller, dispose } = createAbortController(options.signal, options.timeoutMs || 45_000);
    try {
        const headers = { 'Content-Type': 'application/json' };
        try {
            const fireModule = await import('../conf/fire.js').catch(() => null);
            const fire = fireModule?.default;
            if (fire?.auth?.()?.currentUser) {
                const token = await fire.auth().currentUser.getIdToken();
                if (token) headers['Authorization'] = `Bearer ${token}`;
            }
        } catch (_) {}
        if (controller.signal.aborted) throw (controller.signal.reason || new DOMException('This operation was aborted', 'AbortError'));
        const response = await fetch(request.url, {
            method: 'POST',
            headers,
            credentials: 'same-origin',
            signal: controller.signal,
            body: JSON.stringify(request.body),
        });
        const data = await response.json().catch(() => ({}));
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
        const response = await fetch('/api/parse-resume', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            signal: controller.signal,
            body: JSON.stringify({ rawText: text.slice(0, 40_000) })
        });
        const result = await response.json().catch(() => ({}));
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
