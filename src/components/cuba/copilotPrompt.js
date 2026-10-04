/**
 * DIR-021 — free-text copilot prompt -> REAL backend AI operation.
 *
 * WHY THIS EXISTS:
 *   AC-3 requires the user to type a natural-language prompt in ⌘K and have it
 *   dispatched. But the AI runtime only accepts a FIXED set of operations
 *   (`aiService.ALLOWED_ENDPOINTS`) with FIXED payload shapes. So the browser has
 *   to decide which real operation a sentence means and build a valid payload —
 *   without inventing an endpoint, and without sending the raw sentence as a
 *   payload field the backend would never read.
 *
 * INV-2 (ZERO PROMPT / PII LEAKAGE):
 *   The prompt text is used ONLY to pick an operation and to fill that
 *   operation's own documented fields. It is never written to a URL query,
 *   localStorage, sessionStorage or the console. It reaches the backend inside
 *   the POST body, where the real server-side prompt builder already fences it
 *   as untrusted data.
 *
 * PURE. No React, no network. Node-testable.
 */

/**
 * Ordered intent rules. The FIRST match wins, so more specific intents must be
 * listed before broader ones.
 *
 * `operation` is always a real member of ALLOWED_ENDPOINTS.
 */
const INTENT_RULES = [
    {
        id: 'cover-letter',
        operation: 'generate-ai-cover-letter',
        patterns: ['cover letter', 'coverletter', 'pitch', 'outreach', 'outreach message', 'cold email', 'introduction letter'],
    },
    {
        id: 'interview',
        operation: 'generate-interview',
        patterns: ['mock interview', 'interview question', 'practice interview', 'interview prep'],
    },
    {
        id: 'grammar',
        operation: 'check-grammar',
        patterns: ['grammar', 'spelling', 'proofread', 'typo', 'punctuation'],
    },
    {
        id: 'bullet',
        operation: 'enhance-single-bullet',
        patterns: ['bullet', 'quantif', 'metric', 'polish my', 'rewrite my line', 'action verb'],
    },
    {
        id: 'skills',
        operation: 'generate-skills',
        patterns: ['skill', 'ats keyword', 'keyword', 'certification', 'certify', 'technology'],
    },
    {
        id: 'summary',
        operation: 'generate-summary',
        patterns: ['summary', 'professional summary', 'profile', 'bio', 'tailor resume', 'objective', 'about me'],
    },
];

/** Lowercases and collapses punctuation so "cover-letter" matches "cover letter". */
const normalise = (value) => String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Picks the real backend operation for a free-text prompt.
 *
 * @param {string} prompt
 * @returns {string|null} an ALLOWED_ENDPOINTS operation, or null when the
 *   sentence is not recognised. Returning null is deliberate: the caller must
 *   surface "I could not map that to a supported action" rather than dispatch a
 *   guess to an arbitrary endpoint.
 */
export function resolvePromptOperation(prompt) {
    const text = normalise(prompt);
    if (!text) return null;
    for (const rule of INTENT_RULES) {
        if (rule.patterns.some((pattern) => text.includes(normalise(pattern)))) {
            return rule.operation;
        }
    }
    return null;
}

/** True when `operation` is one the palette is willing to dispatch. */
export function isDispatchableOperation(operation) {
    return INTENT_RULES.some((rule) => rule.operation === operation);
}

/** Coerces to a trimmed string; anything non-string becomes ''. */
const text = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * Builds the POST payload for a resolved operation from REAL context only.
 *
 * Every field below mirrors a payload key the backend already reads for that
 * operation (see `src/components/BuildResume/ai/aiContract.js` and the callers
 * in CoverLetter.jsx / JobApplicationModal.jsx). When the caller cannot supply
 * the fields an operation genuinely needs, the returned object carries
 * `missing: [...]` and the palette refuses to dispatch, instead of sending a
 * half-empty request and reporting a confusing provider error.
 *
 * `context` is the caller's real resume/job state:
 *   { targetRole, jobTitle, companyName, company, bullet, existingText, ... }
 *
 * @returns {{payload: object, missing: string[]}}
 */
export function buildCopilotPayload(operation, context = {}) {
    const targetRole = text(context.targetRole) || text(context.jobTitle);
    const company = text(context.companyName) || text(context.company);
    const bullet = text(context.bullet) || text(context.existingText);
    const prompt = text(context.prompt);

    switch (operation) {
        case 'generate-ai-cover-letter': {
            // jobTitle + companyName are what CoverLetter.jsx sends today.
            const missing = [];
            if (!targetRole) missing.push('targetRole');
            return {
                payload: {
                    jobTitle: targetRole,
                    companyName: company,
                    // The user's own words, sent as content to be tailored.
                    ...(prompt ? { userInstructions: prompt } : {}),
                },
                missing,
            };
        }
        case 'enhance-single-bullet': {
            // enhance-single-bullet is meaningless without the line to rewrite.
            return {
                payload: {
                    bullet,
                    jobTitle: targetRole,
                    company,
                    ...(prompt ? { userInstructions: prompt } : {}),
                },
                missing: bullet ? [] : ['bullet'],
            };
        }
        case 'check-grammar': {
            const subject = bullet || text(context.text);
            return {
                payload: {
                    text: subject,
                    language: text(context.language) || 'en',
                },
                missing: subject ? [] : ['text'],
            };
        }
        case 'generate-summary': {
            // generate-summary is grounded in the caller's real resume facts.
            const experience = text(context.experience);
            const skills = Array.isArray(context.skills)
                ? context.skills.filter((entry) => typeof entry === 'string' && entry.trim()).slice(0, 40)
                : [];
            return {
                payload: {
                    jobTitle: targetRole,
                    experience,
                    skills,
                    existingText: text(context.existingSummary),
                    workHistory: text(context.workHistory),
                    education: text(context.education),
                    ...(prompt ? { userInstructions: prompt } : {}),
                },
                // A summary with no target role and no evidence cannot be
                // grounded, so it must fail closed rather than be invented.
                missing: (targetRole || experience || skills.length) ? [] : ['targetRole', 'experience'],
            };
        }
        case 'generate-skills': {
            const existing = Array.isArray(context.existingSkills)
                ? context.existingSkills.filter((entry) => typeof entry === 'string' && entry.trim())
                : [];
            const occupation = targetRole;
            return {
                payload: {
                    targetRole: occupation,
                    occupation,
                    existingSkills: existing,
                    ...(prompt ? { userInstructions: prompt } : {}),
                },
                missing: occupation ? [] : ['targetRole'],
            };
        }
        case 'generate-interview': {
            const role = targetRole;
            return {
                payload: {
                    jobTitle: role,
                    role,
                    seniority: text(context.seniority),
                    experience: text(context.experience),
                    ...(prompt ? { userInstructions: prompt } : {}),
                },
                missing: role ? [] : ['targetRole'],
            };
        }
        default:
            return { payload: {}, missing: [] };
    }
}
