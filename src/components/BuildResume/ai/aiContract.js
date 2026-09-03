/**
 * AI Interaction Contract (frontend) — ResumePilot AI
 *
 * The single shape every builder step uses to talk to AI. It defines:
 *   1. buildAssistPayload — what evidence a request carries (candidate facts,
 *      target role/JD, prior answers). Never profession taxonomy.
 *   2. canRunAssistOperation — local gate so triggers are disabled with a
 *      reason before a request that would 400.
 *   3. normalizeAssistResult — the exact result contract the UI renders:
 *      questions | suggestions | draft | empty, each with a human label.
 *
 * The backend remains the authority on evidence rules (ASK gate, grounding);
 * this module only prepares requests and normalizes responses.
 */

import { getCandidateContext } from '../../../utils/candidateContext.js';

const stripHtml = value => String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

/** Minimum plain-text evidence (chars) before a factual rewrite is worthwhile. */
export const EVIDENCE_MIN = 10;

function plainLength(value) {
    return stripHtml(value).length;
}

/**
 * Local readiness gate — mirrors the backend ASK gate so the UI can label
 * triggers accurately. The backend re-checks; this only prevents obvious 400s.
 */
export function canRunAssistOperation(operation, { resumeData = {}, targetJd = '', entry = null, extra = {} } = {}) {
    const context = getCandidateContext(resumeData, targetJd);
    const targetRole = context.target.role || '';

    switch (operation) {
        case 'generate-work-description': {
            if (!stripHtml(entry?.jobTitle)) return { ok: false, reason: 'Add the job title and organization first.' };
            if (!stripHtml(entry?.employer)) return { ok: false, reason: 'Add the job title and organization first.' };
            return { ok: true, hasEvidence: plainLength(entry?.description) >= EVIDENCE_MIN };
        }
        case 'generate-education-description': {
            if (!stripHtml(entry?.school)) return { ok: false, reason: 'Add the institution first.' };
            if (!stripHtml(entry?.degree)) return { ok: false, reason: 'Add the qualification first.' };
            return { ok: true, hasEvidence: plainLength(entry?.description) >= EVIDENCE_MIN };
        }
        case 'generate-summary': {
            const facts = context.facts;
            const hasSomething = (facts.roles.length > 0) || (facts.education.length > 0)
                || (facts.skills.length >= 3) || (facts.certifications.length > 0)
                || plainLength(facts.summary) >= 60 || targetRole;
            if (!hasSomething) return { ok: false, reason: 'Add some profile content first — the summary is built only from what you provide.' };
            return { ok: true, hasEvidence: true };
        }
        case 'generate-skills':
        case 'generate-certifications': {
            const facts = context.facts;
            const hasProfile = (facts.skills.length > 0) || (facts.roles.length > 0) || (facts.education.length > 0);
            if (!targetRole && !hasProfile) return { ok: false, reason: 'Add a target role or some profile content first.' };
            return { ok: true };
        }
        case 'enhance-single-bullet':
            return plainLength(extra?.bullet) >= 3 ? { ok: true } : { ok: false, reason: 'Write a bullet first — AI can only improve what you have.' };
        case 'autocomplete':
            return { ok: true };
        default:
            return { ok: true };
    }
}

/**
 * Builds the payload for an AI request: section-scoped candidate facts +
 * target + prior answers. This is the ONLY context the model receives besides
 * the operation's own fields.
 */
export function buildAssistPayload(operation, { resumeData = {}, targetJd = '', entry = null, answers = null, tone = '', extra = {} } = {}) {
    const context = getCandidateContext(resumeData, targetJd);
    const contextPayload = {
        facts: context.facts,
        target: { role: context.target.role, jdRole: context.target.jdRole },
        vocabulary: context.vocabulary,
        region: context.region,
    };
    const base = { context: contextPayload };
    if (stripHtml(targetJd)) base.targetJd = targetJd;
    if (answers && typeof answers === 'object' && Object.values(answers).some(v => stripHtml(v))) {
        base.answers = Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, stripHtml(v).slice(0, 600)])).filter(([, v]) => v);
    }
    if (tone) base.tone = tone;

    switch (operation) {
        case 'generate-work-description':
            return {
                payload: {
                    ...base,
                    jobTitle: entry?.jobTitle || '',
                    employer: entry?.employer || '',
                    existingText: entry?.description || '',
                },
                profileHash: context.profileHash,
            };
        case 'generate-education-description':
            return {
                payload: {
                    ...base,
                    school: entry?.school || '',
                    degree: entry?.degree || '',
                    existingText: entry?.description || '',
                },
                profileHash: context.profileHash,
            };
        case 'generate-summary':
            return {
                payload: {
                    ...base,
                    name: context.facts.name || '',
                    jobTitle: context.target.role || resumeData.occupation || '',
                    experience: context.facts.experienceYears ? `${context.facts.experienceYears} years` : '',
                    existingText: resumeData.summary || '',
                },
                profileHash: context.profileHash,
            };
        case 'generate-skills':
            return {
                payload: {
                    ...base,
                    occupation: context.target.role || resumeData.occupation || '',
                    existingSkills: context.facts.skills,
                },
                profileHash: context.profileHash,
            };
        case 'generate-certifications':
            return {
                payload: {
                    ...base,
                    occupation: context.target.role || resumeData.occupation || '',
                },
                profileHash: context.profileHash,
            };
        case 'enhance-single-bullet':
            return { payload: { ...base, bullet: extra?.bullet || '' }, profileHash: context.profileHash };
        case 'autocomplete':
            return { payload: { type: extra?.type || 'skill', query: stripHtml(extra?.query).slice(0, 100) }, profileHash: context.profileHash };
        default:
            return { payload: { ...base, ...extra }, profileHash: context.profileHash };
    }
}

/**
 * Normalizes a raw backend response into the UI contract:
 *   { kind: 'questions' | 'suggestions' | 'draft' | 'empty',
 *     questions?, suggestions?, draft?, requiresConfirmation, source, note }
 */
export function normalizeAssistResult(operation, data = {}) {
    const source = data._source || 'ai';

    if (Array.isArray(data.questions) && data.questions.length) {
        return {
            kind: 'questions',
            questions: data.questions.slice(0, 5).map((q, i) => ({
                id: String(q?.id || `q${i + 1}`),
                question: stripHtml(q?.question || q?.text || ''),
                answerField: q?.answerField || `answer${i + 1}`,
            })).filter(q => q.question),
            requiresAnswer: Boolean(data.requiresAnswer),
            requiresConfirmation: false,
            source,
            note: data.note || '',
        };
    }

    if (typeof data.summary === 'string' && stripHtml(data.summary)) {
        return { kind: 'draft', draft: { text: stripHtml(data.summary) }, requiresConfirmation: true, source, note: data.note || '' };
    }
    if (typeof data.enhancedBullet === 'string' && stripHtml(data.enhancedBullet)) {
        return { kind: 'draft', draft: { text: stripHtml(data.enhancedBullet) }, requiresConfirmation: true, source, note: data.note || '' };
    }

    if (Array.isArray(data.suggestions) && data.suggestions.length) {
        const suggestions = data.suggestions.slice(0, 8)
            .map((s, i) => ({
                id: `s${i + 1}`,
                text: stripHtml(typeof s === 'string' ? s : s?.text || s?.suggestion || ''),
                basis: stripHtml(s?.basis || ''),
            }))
            .filter(s => s.text);
        if (suggestions.length) {
            return { kind: 'suggestions', suggestions, requiresConfirmation: true, source, note: data.note || '' };
        }
    }

    if (Array.isArray(data.skills) && data.skills.length) {
        const suggestions = data.skills.slice(0, 15).map((s, i) => ({
            id: `s${i + 1}`,
            text: stripHtml(s?.name || s?.skill || ''),
            basis: stripHtml(s?.basis || '') || 'target role',
            meta: { name: stripHtml(s?.name || ''), category: s?.category || 'recommended' },
        })).filter(s => s.text);
        if (suggestions.length) {
            return { kind: 'suggestions', suggestions, requiresConfirmation: true, source, note: data.note || '' };
        }
    }

    if (Array.isArray(data.certifications) && data.certifications.length) {
        const suggestions = data.certifications.slice(0, 8).map((c, i) => ({
            id: `s${i + 1}`,
            text: stripHtml(c?.title || '') + (stripHtml(c?.issuer) ? ` — ${stripHtml(c.issuer)}` : ''),
            basis: stripHtml(c?.basis || '') || 'target role',
            meta: { title: stripHtml(c?.title || ''), issuer: stripHtml(c?.issuer || ''), category: c?.category || 'recommended' },
        })).filter(s => s.text);
        if (suggestions.length) {
            return { kind: 'suggestions', suggestions, requiresConfirmation: true, source, note: data.note || '' };
        }
    }

    return { kind: 'empty', suggestions: [], requiresConfirmation: false, source, note: data.note || '' };
}

/** Human label for where a result came from — always visible in the UI. */
export function describeAssistSource(result) {
    if (!result) return '';
    switch (result.source) {
        case 'ask':
            return 'Tell me a little more — these are built from what you type';
        case 'source-preserving-fallback':
            return 'Built only from your own text (AI rewrite unavailable right now)';
        case 'empty-fallback':
            return 'AI suggestions are unavailable right now';
        default:
            if (result.kind === 'draft') return 'Drafted only from your profile — review before using';
            return 'Suggestions — confirm only the ones that are true for you';
    }
}

/** Friendly, non-technical error messages for the AI card. */
export function describeAiError(error) {
    const message = String(error?.message || '');
    if (error?.status === 400) return message || 'Please complete the required fields first.';
    if (error?.status === 503 || error?.code === 'AI_PROVIDER_UNAVAILABLE') {
        return 'AI is not configured for this workspace yet. Your manual entry is always the source of truth.';
    }
    if (error?.status === 502 || error?.code === 'AI_PROVIDER_ERROR') {
        return 'The AI service is having trouble. Your content is safe — try again in a moment.';
    }
    if (error?.name === 'TimeoutError' || error?.code === 'AI_PROVIDER_TIMEOUT') {
        return 'The request took too long and was stopped. Try again.';
    }
    return 'Something went wrong. Your content is unaffected — try again.';
}
