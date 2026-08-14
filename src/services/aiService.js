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

/**
 * All user AI calls cross the authenticated backend boundary. Provider credentials,
 * model allowlists, durable quotas and cost accounting never reach browser code.
 */
export async function generateUserAiContent(endpointName, payload = {}) {
    if (!ALLOWED_ENDPOINTS.has(endpointName)) throw new Error('Unsupported AI operation');
    const auxiliary = ['enhance-single-bullet', 'generate-certifications', 'autocomplete'].includes(endpointName);
    const response = await fetch(auxiliary ? '/api/generate-content' : `/api/${endpointName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(auxiliary ? { operation: endpointName, payload } : { ...payload, apiKey: undefined })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data?.error?.message || data?.error || 'AI request failed');
    }
    return data;
}

/**
 * Parse resume text through the quota-controlled server. Heuristic extraction remains a
 * local availability fallback and is merged into AI output to avoid dropping real fields.
 */
export async function parseResumeTextToStructuredData(rawText) {
    const text = typeof rawText === 'string' ? rawText : '';
    const heuristic = normalizeRawDataToTempJson(extractHeuristicResumeData(text), text);
    // Base64 image payloads are intentionally not sent through JSON. They require a future
    // authenticated object-storage upload and malware/content scanning pipeline.
    if (!text || text.startsWith('[IMAGE_RESUME_BASE64:')) return heuristic;
    try {
        const response = await fetch('/api/parse-resume', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
        console.warn('Server AI parser unavailable; using heuristic parser:', error.message);
        return heuristic;
    }
}
