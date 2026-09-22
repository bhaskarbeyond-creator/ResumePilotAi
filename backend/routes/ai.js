const express = require('express');
const crypto = require('crypto');
const { executeContentOperation, executeResumeParsing, extractJson, loadProviderConfiguration, generateWithProviders, parseAiResponse, providerOrder } = require('../services/aiRuntime');
const { getRepository } = require('../repositories');
const { LiveInterviewService, createRepositoryLiveInterviewStore } = require('../services/liveInterviewSession');
const router = express.Router();

async function generateConfiguredText(req, res, prompt, operation, overrides = {}) {
    const configuration = await loadProviderConfiguration();
    if (overrides.temperature !== undefined) configuration.temperature = overrides.temperature;
    if (overrides.maxTokens !== undefined) configuration.maxTokens = overrides.maxTokens;
    const generated = await generateWithProviders({ prompt, configuration, operation, signal: overrides.signal || req.aiAbortSignal, timeoutMs: overrides.timeoutMs });
    if (res?.setHeader && !res.headersSent) {
        res.setHeader('X-AI-Provider', generated.provider);
        res.setHeader('X-AI-Model', generated.model);
    }
    return generated.raw;
}

// Provider credentials are server-owned. Scope validation strictly to AI routes because this
// router is mounted at /api for legacy endpoint compatibility.
const AI_ROUTE_PATHS = new Set([
    '/generate-resume', '/generate-summary', '/generate-interview', '/generate-work-description',
    '/generate-education-description', '/generate-skills', '/check-grammar', '/generate-content',
    '/parse-resume', '/live-interview/sessions', '/live-interview/guide',
]);
function isAiRoutePath(pathname) {
    return AI_ROUTE_PATHS.has(pathname) || /^\/live-interview\/sessions\/[A-Za-z0-9_-]{16,128}(?:\/(?:turns|complete))?$/.test(pathname);
}
router.use((req, res, next) => {
    if (!isAiRoutePath(req.path)) return next();
    const requestController = new AbortController();
    req.aiAbortSignal = requestController.signal;
    req.once('aborted', () => requestController.abort());
    if (req.method === 'GET') return next();
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'apiKey') || req.get('x-gemini-api-key')) {
        return res.status(400).json({ error: { code: 'CLIENT_AI_KEY_REJECTED', message: 'Client-supplied AI credentials are not accepted', requestId: res.locals.requestId } });
    }
    const identityFields = ['uid', 'userId', 'ownerUid', 'resumeId', 'profileId'];
    if (identityFields.some(field => Object.hasOwn(req.body || {}, field) || Object.hasOwn(req.body?.payload || {}, field))) {
        return res.status(400).json({ error: { code: 'CLIENT_AI_IDENTITY_REJECTED', message: 'AI identity and ownership context is server-controlled', requestId: res.locals.requestId } });
    }
    const serialized = JSON.stringify(req.body || {});
    if (serialized.length > 50_000) {
        return res.status(413).json({ error: { code: 'AI_INPUT_TOO_LARGE', message: 'AI input exceeds the allowed size', requestId: res.locals.requestId } });
    }
    return next();
});

// Ungrounded whole-resume generation and duplicate section endpoints are retired.
// The guided editor keeps user facts authoritative; section rewrites use the
// single /api/generate-content contract below.
const RETIRED_AI_ENDPOINTS = new Set([
    '/generate-resume', '/generate-summary',
    '/generate-work-description', '/generate-education-description', '/generate-skills',
]);
router.post([...RETIRED_AI_ENDPOINTS], (req, res) => res.status(410).json({
    error: {
        code: 'UNGROUNDED_AI_ENDPOINT_RETIRED',
        message: req.path === '/generate-resume'
            ? 'Ungrounded whole-resume generation is retired. Use the guided resume editor with verified facts.'
            : 'This duplicate AI endpoint is retired. Use /api/generate-content with source facts.',
        replacement: req.path === '/generate-resume' ? '/build-resume/heading' : '/api/generate-content',
        requestId: res.locals.requestId,
    },
}));

// ── Interview question generation helpers (Contextual Blueprint + Anti-Leakage) ─────
const INTERVIEW_PROMPT_CONTEXT = {
    technical: 'technical architecture, core frameworks, systems design, debugging edge cases, and engineering trade-offs',
    behavioral: 'STAR-format scenarios, cross-functional leadership, conflict resolution, ownership, and stakeholder negotiation',
    hr: 'organizational culture fit, career progression, collaboration dynamics, communication style, and workplace ethics',
    managerial: 'strategic resource allocation, team performance management, hiring standards, prioritization, and executive communication',
    case: 'structured business case reasoning, market estimation, root cause diagnosis, unit economics, and data-backed decision making',
    mixed: 'a comprehensive balance of technical depth, real-world troubleshooting, system trade-offs, and behavioral leadership scenarios',
};

const INTERVIEW_DIFFICULTY_GUIDANCE = {
    easy: 'Focus the set on foundational execution and established best practices with clear criteria.',
    medium: 'Balance practical application, debugging multi-step failures, and nuanced trade-offs.',
    hard: 'Focus on complex systems design, incident triage, edge-case failure modes, and senior-level decision making.',
    expert: 'Focus on enterprise-scale architecture, high-stakes ambiguity, crisis recovery, and strategic organizational trade-offs.',
};

function interviewDifficultyWeights(difficulty) {
    const d = String(difficulty || 'medium').toLowerCase();
    if (d === 'easy') return { easy: 0.6, intermediate: 0.3, advanced: 0.1 };
    if (d === 'hard') return { easy: 0.15, intermediate: 0.4, advanced: 0.45 };
    if (d === 'expert') return { easy: 0.05, intermediate: 0.3, advanced: 0.65 };
    return { easy: 0.35, intermediate: 0.45, advanced: 0.2 };
}

// Compute an exact Easy/Intermediate/Advanced split (sums to questionCount) from the
// requested difficulty and seniority so the difficulty control actually shapes the set.
function interviewDifficultyDistribution(questionCount, difficulty, experienceLevel) {
    const count = Math.min(Math.max(parseInt(questionCount) || 10, 1), 20);
    const weights = interviewDifficultyWeights(difficulty);
    let easy = Math.round(count * weights.easy);
    let intermediate = Math.round(count * weights.intermediate);
    let advanced = count - easy - intermediate;
    const senior = ['senior', 'lead', 'executive', 'staff', 'principal', 'expert'].some(term =>
        String(experienceLevel || '').toLowerCase().includes(term));
    if (senior && advanced < count && easy > 0) { advanced += 1; easy -= 1; }
    if (advanced < 0) { intermediate += advanced; advanced = 0; }
    if (easy < 0) { intermediate += easy; easy = 0; }
    if (intermediate < 0) { easy += intermediate; intermediate = 0; }
    return { easy, intermediate, advanced };
}

function sanitizePromptFragment(value, max = 500) {
    return Array.from(String(value ?? ''), ch => {
        const code = ch.charCodeAt(0);
        if (code === 9 || code === 10 || code === 13) return ' ';
        return code <= 31 || code === 127 ? '' : ch;
    }).join('').replace(/<[^>]*>/g, '').trim().slice(0, max);
}

// Deterministic multi-pass cleaner to strip any leaked UI labels, form headers, or robotic preambles.
function cleanInterviewMetadataArtifacts(text) {
    if (typeof text !== 'string') return '';
    let cleaned = text.trim();

    let prev = '';
    let passes = 0;
    while (cleaned !== prev && passes < 4) {
        prev = cleaned;
        passes++;

        // 1. Strip raw field labels with their immediate values (e.g. "Target Role & Discipline: Senior Software Engineer.")
        cleaned = cleaned.replace(/^(?:(?:(?:For (?:the )?)?(?:Target )?Role & Discipline|(?:For (?:the )?)?(?:Target )?Job Description|(?:For (?:the )?)?(?:Target )?Role|(?:For (?:the )?)?Discipline)\s*:\s*[^.?!:;\n]{1,80}[.?!:;\n]\s*)+/gi, '');

        // 2. Strip bracketed tags and UI headers at start
        cleaned = cleaned.replace(/^\[\s*(?:AI Tailoring|Target Job Description|Target Role & Discipline|Target Role|Job Description)\s*\]\s*[:.\-—]?\s*/gi, '');
        cleaned = cleaned.replace(/^(?:Target Role & Discipline|Target Job Description \(Optional\s*[-—]\s*AI Tailoring\)|Target Job Description|Optional\s*[-—]\s*AI Tailoring|AI Tailoring|Target Role|Target Discipline|Candidate Profile|Setup Parameters|Job Requirements Specification)\s*[:.\-—]?\s*/gi, '');

        // 3. Strip robotic contextual preambles and introductory framing clauses at start of question
        cleaned = cleaned.replace(/^(?:(?:Based on|According to|Considering|In light of|In the context of|With respect to|As mentioned in|As stated in|Referencing)\s+(?:the\s+)?(?:target\s+)?(?:job description|role|discipline|resume|candidate profile|candidate background|provided context|setup|requirements|overview)[^:?,.]{0,150}[:?,.]\s*)+/gi, '');
        cleaned = cleaned.replace(/^(?:For the (?:target )?role(?: and discipline)?[^:?,.]{0,150}[:?,.]\s*)+/gi, '');
        cleaned = cleaned.replace(/^(?:Given (?:the |your )?(?:candidate(?:'s)? )?(?:background|profile|job description|role|experience|context)[^:?,.]{0,150}[:?,.]\s*)+/gi, '');
        cleaned = cleaned.replace(/^(?:As an? (?:candidate for (?:the )?)?[^:?,.]{0,80}(?:engineer|developer|manager|specialist|analyst|architect|consultant|lead|director|professional|role|position|job)[^:?,.]{0,40}[:?,.]\s*)+/gi, '');

        // 4. Strip raw UI headers and field tags anywhere remaining
        cleaned = cleaned.replace(/\b(?:Target Role & Discipline|Target Job Description \(Optional\s*[-—]\s*AI Tailoring\)|Target Job Description|Optional\s*[-—]\s*AI Tailoring|AI Tailoring)\b\s*[:.\-—]?\s*/gi, '');
        cleaned = cleaned.replace(/\b(?:Target Role|Target Discipline|Candidate Profile|Setup Parameters|Job Requirements Specification)\s*:/gi, '');
        cleaned = cleaned.replace(/[^\S\r\n]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    }

    if (cleaned.length > 0) {
        cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }
    return cleaned;
}

// Banned generic question patterns
const GENERIC_QUESTION_PATTERNS = [
    /^(?:tell me about yourself|what are your (?:greatest )?(?:strengths|weaknesses)|why should we hire you|why do you want to work here)\b/i,
    /^(?:what is your experience with|what tools (?:or technologies )?do you use|what is your background in)\b/i,
    /^(?:what is [a-z0-9+#.\s]{2,30}\?|explain what [a-z0-9+#.\s]{2,30} is\b)/i,
    /^(?:how do you handle challenges|what are your career goals|where do you see yourself in 5 years)\b/i,
];

function isGenericQuestion(text) {
    if (typeof text !== 'string' || text.trim().length < 15) return true;
    const clean = text.trim();
    return GENERIC_QUESTION_PATTERNS.some(p => p.test(clean));
}

// Extract confirmed candidate evidence (Level 1)
function extractCandidateProfile(resumeFacts) {
    if (!resumeFacts || typeof resumeFacts !== 'string') {
        return { name: '', occupation: '', summary: '', work: [], skills: [], projects: [], certs: [], education: [], confirmedExperience: '' };
    }
    const cleanFacts = cleanInterviewMetadataArtifacts(resumeFacts);
    const lines = cleanFacts.split('\n').map(l => l.trim()).filter(Boolean);
    let name = '';
    let occupation = '';
    let summary = '';
    const work = [];
    const skills = [];
    const projects = [];
    const certs = [];
    const education = [];

    for (const line of lines) {
        if (/^Name:\s*/i.test(line)) name = line.replace(/^Name:\s*/i, '').trim();
        else if (/^Occupation:\s*/i.test(line)) occupation = line.replace(/^Occupation:\s*/i, '').trim();
        else if (/^Summary:\s*/i.test(line)) summary = line.replace(/^Summary:\s*/i, '').trim();
        else if (/^Work:\s*/i.test(line)) {
            const raw = line.replace(/^Work:\s*/i, '');
            raw.split(';').map(w => w.trim()).filter(Boolean).forEach(w => work.push(w));
        }
        else if (/^Skills:\s*/i.test(line)) {
            const raw = line.replace(/^Skills:\s*/i, '');
            raw.split(',').map(s => s.trim()).filter(Boolean).forEach(s => skills.push(s));
        }
        else if (/^Projects:\s*/i.test(line)) {
            const raw = line.replace(/^Projects:\s*/i, '');
            raw.split(',').map(p => p.trim()).filter(Boolean).forEach(p => projects.push(p));
        }
        else if (/^Certifications:\s*/i.test(line)) {
            const raw = line.replace(/^Certifications:\s*/i, '');
            raw.split(',').map(c => c.trim()).filter(Boolean).forEach(c => certs.push(c));
        }
        else if (/^Education:\s*/i.test(line)) {
            const raw = line.replace(/^Education:\s*/i, '');
            raw.split(';').map(e => e.trim()).filter(Boolean).forEach(e => education.push(e));
        }
    }

    const confirmedParts = [];
    if (name) confirmedParts.push(`Name: ${name}`);
    if (occupation) confirmedParts.push(`Current/Stated Role: ${occupation}`);
    if (work.length) confirmedParts.push(`Confirmed Work History: ${work.slice(0, 6).join('; ')}`);
    if (skills.length) confirmedParts.push(`Confirmed Skills/Tech: ${skills.slice(0, 16).join(', ')}`);
    if (projects.length) confirmedParts.push(`Confirmed Projects: ${projects.slice(0, 5).join(', ')}`);
    if (certs.length) confirmedParts.push(`Confirmed Certifications: ${certs.slice(0, 6).join(', ')}`);
    if (summary) confirmedParts.push(`Summary: ${summary.slice(0, 300)}`);

    return {
        name,
        occupation,
        summary,
        work,
        skills,
        projects,
        certs,
        education,
        confirmedExperience: confirmedParts.join('\n'),
    };
}

// Extract normalized JD requirements specification (Level 4)
function extractJobRequirements(jobDescription, occupation = '') {
    if (!jobDescription || typeof jobDescription !== 'string') {
        return { raw: '', role: occupation, cleanRequirements: '' };
    }
    const cleanJd = cleanInterviewMetadataArtifacts(jobDescription).slice(0, 3500);
    return {
        raw: jobDescription,
        role: occupation,
        cleanRequirements: cleanJd,
    };
}

// Build internal contextual interview blueprint
function buildContextualBlueprint({ _occupation, _interviewType, experienceLevel, difficulty, candidateProfile, jdRequirements, questionCount }) {
    const jdText = (jdRequirements?.cleanRequirements || '').toLowerCase();
    const intersectingSkills = (candidateProfile?.skills || []).filter(skill => 
        jdText.includes(skill.toLowerCase())
    );

    const distribution = interviewDifficultyDistribution(questionCount, difficulty, experienceLevel);

    return {
        intersectingSkills,
        distribution,
        seniority: experienceLevel || 'professional',
    };
}

// Lowercased, punctuation-stripped, whitespace-collapsed fingerprint for comparing
// question text so we can drop exact and near-identical repeats within/across sets.
function questionKey(text) {
    const cleaned = cleanInterviewMetadataArtifacts(String(text || ''));
    return cleaned.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
}

// Deterministic, bounded de-duplication with metadata artifact cleaning.
function dedupeQuestions(rawQuestions, previousQuestions = []) {
    if (!Array.isArray(rawQuestions)) return [];
    const previousKeys = new Set((Array.isArray(previousQuestions) ? previousQuestions : [])
        .filter(q => typeof q === 'string').map(q => questionKey(q)));
    const seen = new Set();
    const out = [];
    for (const question of rawQuestions) {
        if (!question || typeof question !== 'object') continue;
        const rawText = typeof question.question === 'string' ? question.question.trim() : '';
        const text = cleanInterviewMetadataArtifacts(rawText);
        if (!text) continue;
        const key = questionKey(text);
        if (!key || seen.has(key)) continue;
        seen.add(key);

        const cleanOptions = (Array.isArray(question.options) ? question.options : [])
            .map(opt => cleanInterviewMetadataArtifacts(typeof opt === 'string' ? opt : String(opt || '')))
            .filter(opt => opt.length > 0);

        out.push({
            ...question,
            question: text,
            options: cleanOptions.length >= 2 ? cleanOptions : question.options,
        });
    }
    // Keep ordering but drop exact matches against recent history.
    return out.filter(question => !previousKeys.has(questionKey(question.question)));
}

function buildInterviewPrompt(input) {
    const languageNames = {
        en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian',
        pt: 'Portuguese', ru: 'Russian', nl: 'Dutch', pl: 'Polish', se: 'Swedish',
        no: 'Norwegian', dk: 'Danish', is: 'Icelandic', gk: 'Greek', ro: 'Romanian',
    };
    const rawOccupation = String(input.occupation || '').trim();
    const occupation = cleanInterviewMetadataArtifacts(rawOccupation) || 'Professional';
    const interviewType = String(input.interviewType || 'technical');
    const targetLanguage = languageNames[input.language] || 'English';
    const validQuestionCount = Math.min(Math.max(parseInt(input.questionCount) || 10, 1), 20);
    const promptContext = INTERVIEW_PROMPT_CONTEXT[interviewType] || INTERVIEW_PROMPT_CONTEXT.mixed;
    
    const safeFacts = typeof input.resumeFacts === 'string' ? input.resumeFacts.slice(0, 2500) : '';
    const safeJd = typeof input.jobDescription === 'string' ? input.jobDescription.slice(0, 4000) : '';
    const candidateProfile = extractCandidateProfile(safeFacts);
    const jdRequirements = extractJobRequirements(safeJd, occupation);
    const blueprint = buildContextualBlueprint({
        occupation,
        interviewType,
        experienceLevel: input.experienceLevel,
        difficulty: input.difficulty,
        candidateProfile,
        jdRequirements,
        questionCount: validQuestionCount,
    });

    const nonce = String(input.sessionNonce || crypto.randomBytes(8).toString('hex')).slice(0, 24);
    const difficultyLabel = String(input.difficulty || 'medium').toLowerCase();
    const difficultyGuidance = INTERVIEW_DIFFICULTY_GUIDANCE[difficultyLabel] || '';
    const exclusions = (Array.isArray(input.previousQuestions) ? input.previousQuestions : [])
        .filter(q => typeof q === 'string')
        .map(q => cleanInterviewMetadataArtifacts(sanitizePromptFragment(q, 240)))
        .filter(q => q.length > 0)
        .slice(0, 12);

    const candidateSection = candidateProfile.confirmedExperience
        ? `[LEVEL 1: CANDIDATE VERIFIED EVIDENCE]\nUse ONLY these candidate facts (do not invent experience):\n${candidateProfile.confirmedExperience}\n(MANDATORY: Use ONLY these verified facts for candidate background. NEVER invent claims or past projects.)`
        : `[LEVEL 1: CANDIDATE VERIFIED EVIDENCE]\nUse ONLY these candidate facts (do not invent experience):\nStandard industry professional profile for ${occupation}. (Do not invent fictional employer names.)`;

    const jdSection = jdRequirements.cleanRequirements
        ? `[LEVEL 4: TARGET JOB REQUIREMENTS SPECIFICATION]\nAlign some questions to this job description without fabricating requirements:\n${jdRequirements.cleanRequirements}`
        : `[LEVEL 4: TARGET JOB REQUIREMENTS SPECIFICATION]\nAlign some questions to this job description without fabricating requirements:\nStandard core competencies and production expectations for a ${occupation} position.`;

    const intersectionSection = blueprint.intersectingSkills.length
        ? `[LEVEL 2 & 3 INTERSECTION BLUEPRINT]\nConfirmed high-value intersections: ${blueprint.intersectingSkills.join(', ')}. Target these skills for deep applied scenario & trade-off questions.`
        : `[LEVEL 2 & 3 DISCIPLINE BLUEPRINT]\nAssess applied competency across the ${interviewType} domain for ${occupation}.`;

    const exclusionsSection = exclusions.length
        ? `[PRIOR ATTEMPT EXCLUSIONS]\nThe candidate already answered these questions/competencies in a recent attempt. Generate a FRESH set and DO NOT repeat or closely mirror them:\n- ${exclusions.join('\n- ')}`
        : '';

    const prompt = `
You are an Elite Principal Interviewer and Hiring Bar Raiser conducting an authentic, high-caliber professional interview for a ${occupation} position (${interviewType} track) in ${targetLanguage}.

=== CONTEXT HIERARCHY (USE SILENTLY TO SHAPE QUESTIONS — NEVER REPEAT OR MENTION METADATA) ===
${candidateSection}

[LEVEL 2 & 3: TARGET ROLE & DISCIPLINE FRAMEWORK]
- Target Role: ${occupation}
- Target Seniority: ${input.experienceLevel || 'Professional'}
- Focus Track: ${interviewType} (${promptContext})
- Difficulty Profile: ${difficultyLabel} (${difficultyGuidance})
- Difficulty distribution for this run: ${blueprint.distribution.easy} Easy, ${blueprint.distribution.intermediate} Intermediate, ${blueprint.distribution.advanced} Advanced.
${intersectionSection}

${jdSection}
${exclusionsSection ? '\n' + exclusionsSection : ''}

=== CRITICAL INTERVIEW DESIGN DIRECTIVES (NON-NEGOTIABLE) ===
1. 100% CONTEXTUAL ANCHORS:
   - Connect the candidate's actual background and target requirements into authentic, practical scenarios.
   - Questions should test applied decision-making, debugging unexpected edge cases, architecture trade-offs, performance optimization, incident triage, or behavioral STAR situations.
2. ABSOLUTE BAN ON METADATA LEAKAGE:
   - NEVER include or repeat setup labels such as "Target Role & Discipline", "Target Job Description", "AI Tailoring", "Candidate Profile", or form labels anywhere in the question, options, or explanation.
   - NEVER start questions with robotic preamble phrases such as "Based on the job description...", "As a [role]...", "According to the target role...", "Given your resume...", "In the context of the job description...".
   - Ask the question directly and naturally, exactly as an experienced human hiring manager would in a real interview room.
3. ZERO HALLUCINATION:
   - Never assert that the candidate worked with a specific platform, tool, or employer unless it is explicitly listed in [LEVEL 1: CANDIDATE VERIFIED EVIDENCE].
   - If assessing a requirement from Level 4 not present in Level 1, frame the question as an applied scenario, transition strategy, or architecture evaluation (e.g. "How would you approach optimizing X when Y occurs?").
4. ZERO GENERIC FLUFF:
   - STRICTLY BAN weak, shallow questions: "Tell me about yourself", "What are your strengths?", "What is [tool]?", "What is your experience with [tool]?".
   - Every question must test critical thinking, reasoning, metrics, or problem-solving.
5. DIVERSE ASSESSMENT ANGLES:
   - Distribute the ${validQuestionCount} questions across distinct categories (e.g. Applied Implementation, Deep Troubleshooting, Architecture & Systems Design, Incident Response & Reliability, Metric Optimization, Stakeholder Leadership).
6. CALIBRATED DIFFICULTY DISTRIBUTION:
   - Generate exactly: ${blueprint.distribution.easy} Easy, ${blueprint.distribution.intermediate} Intermediate, ${blueprint.distribution.advanced} Advanced questions.
   - Easy: Foundational execution following established industry best practices.
   - Intermediate: Nuanced trade-offs, debugging multi-step failures, multi-metric optimization.
   - Advanced: Complex systems design, high-stakes ambiguity, scale bottlenecks, crisis recovery, strategic trade-offs.
7. CRISP AND CONCISE FORMATTING:
   - Keep scenario questions direct and focused (under 40 words).
   - Keep each answer option clear and distinct (under 15 words).
   - Keep each explanation strictly to 1 or 2 concise sentences explaining the optimal choice and key trade-off.
   - Do NOT include lengthy filler commentary or redundant text.

IMPORTANT: All text including questions, answer options, and explanations must be written in ${targetLanguage}.

Format the response as a JSON object with this exact structure:
{
    "title": "${occupation} - ${interviewType.charAt(0).toUpperCase() + interviewType.slice(1)} Assessment",
    "company": "Professional Evaluation Services",
    "department": "${interviewType === 'technical' ? 'Technical Department' : interviewType === 'case' ? 'Case Analysis' : 'Human Resources'}",
    "duration": "${Math.round(validQuestionCount * 3)} minutes",
    "totalQuestions": ${validQuestionCount},
    "passingScore": 70,
    "categories": ["list", "of", "categories"],
    "questions": [
        {
            "id": 1,
            "question": "Clear, contextual scenario question text without any leaked metadata or robotic preambles?",
            "options": ["Option A", "Option B", "Option C", "Option D"],
            "correctAnswer": 0,
            "category": "Category name",
            "difficulty": "Easy/Intermediate/Advanced",
            "weight": 1,
            "explanation": "Concise 1-2 sentence explanation of why the correct answer is optimal and the key trade-off.",
            "estimatedTime": 120
        }
    ]
}

Fresh-run directive: produce a distinct set of questions from any prior attempt (unique run token: ${nonce}). Only return valid JSON without any markdown wrapper or surrounding commentary.
`;

    return { prompt, validQuestionCount, targetLanguage, distribution: blueprint.distribution, sessionNonce: nonce, blueprint };
}

// Generate interview questions based on occupation and interview type.
// Question content is model-generated. A provider failure is surfaced to the
// candidate with a retryable error rather than silently substituting a static
// question bank.
router.post('/generate-interview', async (req, res) => {
    const markSource = (source) => {
        if (res?.setHeader && !res.headersSent) res.setHeader('X-AI-Source', source);
    };
    try {
        const { occupation, interviewType, questionCount = 10, language = 'en', experienceLevel, difficulty, jobDescription, resumeFacts, previousQuestions } = req.body;
        const allowedInterviewTypes = ['technical', 'behavioral', 'mixed', 'hr', 'managerial', 'case'];
        if (typeof occupation !== 'string' || !occupation.trim() || occupation.length > 160
            || !allowedInterviewTypes.includes(interviewType)) {
            return res.status(400).json({ error: { code: 'INVALID_AI_INPUT', message: 'Valid occupation and interview type are required', requestId: res.locals.requestId } });
        }

        // Bounded, privacy-preserving history: only recent question text is
        // accepted so generation avoids repetition without shipping a transcript.
        const priorQuestions = (Array.isArray(previousQuestions) ? previousQuestions : [])
            .filter(q => typeof q === 'string')
            .map(q => cleanInterviewMetadataArtifacts(sanitizePromptFragment(q, 240)))
            .filter(q => q.length > 0)
            .slice(0, 12);

        const requestedCount = Math.min(Math.max(parseInt(questionCount) || 10, 5), 20);

        // Determine active provider to choose optimal execution strategy
        const configuration = await loadProviderConfiguration();
        const activeOrder = providerOrder(configuration);
        const activeProvider = activeOrder[0] || 'nvidia';

        // NVIDIA NIM and public LLM gateways enforce strict ~38s socket drop limits.
        // Generating >5 complex scenario questions in a single prompt takes 50-80s,
        // causing gateway socket resets (ECONNRESET) and frontend 502/504 errors.
        // When activeProvider is nvidia and requestedCount > 2, partition into parallel batches
        // of <= 2 questions. On NVIDIA NIM, 2 questions complete in 10-14s, well below the 38s
        // gateway socket reset threshold, whereas 5+ questions take 39-65s and trigger ECONNRESET.
        const shouldBatch = activeProvider === 'nvidia' && requestedCount > 2;
        const numBatches = shouldBatch ? Math.ceil(requestedCount / 2) : 1;
        const baseNonce = crypto.randomBytes(8).toString('hex');

        let allQuestions = [];
        let metadataPayload = null;

        if (numBatches === 1) {
            const built = buildInterviewPrompt({
                occupation,
                interviewType,
                questionCount: requestedCount,
                language,
                experienceLevel,
                difficulty,
                jobDescription,
                resumeFacts,
                previousQuestions: priorQuestions,
                sessionNonce: baseNonce,
            });
            const responseText = await generateConfiguredText(req, res, built.prompt, 'generate-interview', { maxTokens: 3500, timeoutMs: 38_000 });
            const jsonData = extractJson(responseText);
            if (!jsonData || typeof jsonData !== 'object') {
                throw Object.assign(new Error('The AI response did not contain valid interview content.'), { code: 'INVALID_AI_OUTPUT', status: 502 });
            }
            metadataPayload = jsonData;
            allQuestions = dedupeQuestions(jsonData.questions, priorQuestions).slice(0, built.validQuestionCount);
        } else {
            const baseBatchSize = Math.floor(requestedCount / numBatches);
            const remainder = requestedCount % numBatches;
            const batchSizes = Array.from({ length: numBatches }, (_, i) => baseBatchSize + (i < remainder ? 1 : 0));

            const batchPromises = batchSizes.map(async (count, batchIndex) => {
                const built = buildInterviewPrompt({
                    occupation,
                    interviewType,
                    questionCount: count,
                    language,
                    experienceLevel,
                    difficulty,
                    jobDescription,
                    resumeFacts,
                    previousQuestions: priorQuestions,
                    sessionNonce: `${baseNonce}-b${batchIndex + 1}`,
                });
                const batchTokens = Math.min(1000, Math.max(500, count * 350));
                const responseText = await generateConfiguredText(req, res, built.prompt, 'generate-interview', { maxTokens: batchTokens, timeoutMs: 32_000 });
                const jsonData = extractJson(responseText);
                return { jsonData, count };
            });

            const batchResults = await Promise.allSettled(batchPromises);
            const collectedQuestions = [];

            for (const result of batchResults) {
                if (result.status === 'fulfilled' && result.value?.jsonData?.questions) {
                    if (!metadataPayload && result.value.jsonData) {
                        metadataPayload = result.value.jsonData;
                    }
                    const batchQuestions = Array.isArray(result.value.jsonData.questions) ? result.value.jsonData.questions : [];
                    collectedQuestions.push(...batchQuestions);
                }
            }

            allQuestions = dedupeQuestions(collectedQuestions, priorQuestions).slice(0, requestedCount);
        }

        if (!allQuestions.length) {
            throw Object.assign(new Error('The AI response did not contain usable questions.'), { code: 'INVALID_AI_OUTPUT', status: 502 });
        }

        const renumberedQuestions = allQuestions.map((q, idx) => ({ ...q, id: idx + 1 }));

        markSource('ai');
        return res.json({
            ...(metadataPayload || {}),
            title: metadataPayload?.title || `${occupation} - ${interviewType.charAt(0).toUpperCase() + interviewType.slice(1)} Assessment`,
            questions: renumberedQuestions,
            totalQuestions: renumberedQuestions.length,
        });
    } catch (error) {
        const status = Number(error.status) || (error.code === 'AI_PROVIDER_UNAVAILABLE' ? 503 : 502);
        const code = error.code || 'AI_PROVIDER_ERROR';
        console.error('[Interview generation error]', { code, status, message: error.message, stack: error.stack, requestId: res.locals.requestId });
        return res.status(status).json({ error: {
            code,
            message: status >= 500
                ? 'The interview service is temporarily unavailable. Please try again.'
                : String(error.message || 'Unable to generate interview questions.'),
            requestId: res.locals.requestId,
        } });
    }
});

let cachedLiveInterviewRepository = null;
let cachedLiveInterviewService = null;
function liveInterviewService() {
    const repository = getRepository();
    // Keep idempotent in-flight turn requests coalesced within this process;
    // the durable repository revision remains the cross-process authority.
    if (cachedLiveInterviewRepository !== repository || !cachedLiveInterviewService) {
        cachedLiveInterviewRepository = repository;
        cachedLiveInterviewService = new LiveInterviewService({
            store: createRepositoryLiveInterviewStore(repository),
        });
    }
    return cachedLiveInterviewService;
}

function sendLiveInterviewError(res, error) {
    const status = Number(error?.status) || 502;
    const code = error?.code || 'LIVE_INTERVIEW_UNAVAILABLE';
    if (status >= 500) {
        console.error('[Live interview]', { code, requestId: res.locals.requestId });
    }
    const payload = {
        error: {
            code,
            message: status >= 500
                ? 'The live interviewer is temporarily unavailable. Your session is still saved; please retry.'
                : String(error?.message || 'Unable to process this interview request.'),
            requestId: res.locals.requestId,
        },
    };
    if (error?.details?.session) payload.session = error.details.session;
    return res.status(status).json(payload);
}

// Live sessions have a separate, server-authoritative contract from the
// legacy timed assessment. The client cannot inject a question, score, state
// transition, or other candidate's session id.
router.post('/live-interview/sessions', async (req, res) => {
    try {
        const session = await liveInterviewService().start({
            ownerUid: req.user?.uid,
            input: req.body || {},
            signal: req.aiAbortSignal,
        });
        res.setHeader('Cache-Control', 'no-store, private');
        return res.status(201).json({ session });
    } catch (error) {
        return sendLiveInterviewError(res, error);
    }
});

router.get('/live-interview/sessions/:sessionId', async (req, res) => {
    try {
        const session = await liveInterviewService().get({
            ownerUid: req.user?.uid,
            id: req.params.sessionId,
        });
        res.setHeader('Cache-Control', 'no-store, private');
        return res.json({ session });
    } catch (error) {
        return sendLiveInterviewError(res, error);
    }
});

router.post('/live-interview/sessions/:sessionId/turns', async (req, res) => {
    try {
        const session = await liveInterviewService().answer({
            ownerUid: req.user?.uid,
            id: req.params.sessionId,
            payload: req.body || {},
            signal: req.aiAbortSignal,
        });
        res.setHeader('Cache-Control', 'no-store, private');
        return res.json({ session });
    } catch (error) {
        return sendLiveInterviewError(res, error);
    }
});

router.post('/live-interview/sessions/:sessionId/complete', async (req, res) => {
    try {
        const session = await liveInterviewService().complete({
            ownerUid: req.user?.uid,
            id: req.params.sessionId,
            payload: req.body || {},
            signal: req.aiAbortSignal,
        });
        res.setHeader('Cache-Control', 'no-store, private');
        return res.json({ session });
    } catch (error) {
        return sendLiveInterviewError(res, error);
    }
});

router.delete('/live-interview/sessions/:sessionId', async (req, res) => {
    try {
        const result = await liveInterviewService().abandon({
            ownerUid: req.user?.uid,
            id: req.params.sessionId,
        });
        res.setHeader('Cache-Control', 'no-store, private');
        return res.json(result);
    } catch (error) {
        return sendLiveInterviewError(res, error);
    }
});

router.post('/live-interview/guide', async (req, res) => {
    try {
        if (!req.user?.uid) {
            return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Sign in to access the live interview guide.' } });
        }
        const question = String(req.body?.question || '').replace(/\s+/g, ' ').trim().slice(0, 600);
        const role = String(req.body?.role || 'Software Engineer').replace(/\s+/g, ' ').trim().slice(0, 160);
        const topic = String(req.body?.topic || '').replace(/\s+/g, ' ').trim().slice(0, 160);
        const resumeFacts = String(req.body?.resumeFacts || '').replace(/\s+/g, ' ').trim().slice(0, 1200);
        const regenerate = Boolean(req.body?.regenerate);

        if (!question || question.length < 5) {
            return res.status(400).json({ error: { code: 'INVALID_QUESTION', message: 'A valid question is required.' } });
        }

        const prompt = `You are an elite executive interview coach and hiring director.
Craft the ideal 10/10 STAR response guide tailored specifically, naturally, and dynamically to this exact interview question:

TARGET ROLE: ${role}
TOPIC/DOMAIN: ${topic || 'Professional Competence'}
QUESTION: "${question}"
${resumeFacts ? `CANDIDATE CONTEXT:\n${resumeFacts}` : ''}
${regenerate ? `REGENERATION DIRECTIVE: Formulate an entirely fresh, alternative 10/10 STAR scenario and distinct technical angle for this exact question, choosing different architectural trade-offs or problem-solving approaches.` : ''}

INSTRUCTIONS:
1. "goal": The exact interviewer's strategic hiring intention and what competencies/signals are being evaluated for this specific question (1-2 sentences).
2. "modelAnswer": A complete, natural, spoken first-person 10/10 STAR candidate answer (Situation, Task, Action with specific technical decisions & trade-offs, and measurable Result) directly answering THIS question:
   - Situation & Task: The real-world production or operational context, high stakes, and ownership challenge.
   - Action: Concrete architectural/engineering decisions made, specific tools or frameworks utilized, trade-offs navigated, and proactive collaboration.
   - Result: Quantified impact (latency, throughput, cost reduction, error rate, or delivery velocity) and positive organizational value.
   It must sound like a top 1% candidate speaking confidently and fluently in an executive interview. NEVER use brackets or generic placeholders like [Feature] or [Metric].
3. "tip": A sharp, tactical coaching tip or critical pitfall to avoid for this specific question.

Return ONLY a valid JSON object with this exact shape:
{
  "goal": "the interviewer hiring intent",
  "modelAnswer": "full cohesive 10/10 STAR candidate answer",
  "tip": "practical tip or pitfall"
}`;

        const raw = await generateConfiguredText(req, res, prompt, 'live-interview-guide', {
            temperature: regenerate ? 0.5 : 0.3,
            maxTokens: 900,
            timeoutMs: 30_000,
        });
        const parsed = extractJson(raw) || {};
        const goal = String(parsed.goal || parsed.question_intent || parsed.intent || '').replace(/\s+/g, ' ').trim().slice(0, 250);
        const modelAnswer = String(parsed.modelAnswer || parsed.model_answer || parsed.answer || '').replace(/\s+/g, ' ').trim().slice(0, 1800);
        const tip = String(parsed.tip || parsed.answer_tip || '').replace(/\s+/g, ' ').trim().slice(0, 300);

        res.setHeader('Cache-Control', 'no-store, private');
        return res.json({ goal, modelAnswer, tip });
    } catch (error) {
        return sendLiveInterviewError(res, error);
    }
});

// Dynamic interview content intentionally has no deterministic question fallback.
// Provider failures return a recoverable error so candidates never receive disguised canned content.

// Fallback function to check grammar when AI is not available
function generateFallbackGrammarCheck(text, _targetLanguage = 'English') {
    // Simple fallback grammar check - looks for common issues
    const corrections = [];
    
    // Basic checks for common grammar issues
    const commonErrors = [
        { pattern: /\bi\b/g, suggestion: 'I', type: 'grammar', explanation: 'Personal pronoun should be capitalized' },
        { pattern: /\b(there|their|they're)\b/g, suggestion: 'check usage', type: 'grammar', explanation: 'Check if correct form of there/their/they\'re is used' },
        { pattern: /\b(your|you're)\b/g, suggestion: 'check usage', type: 'grammar', explanation: 'Check if correct form of your/you\'re is used' },
        { pattern: /\b(its|it's)\b/g, suggestion: 'check usage', type: 'grammar', explanation: 'Check if correct form of its/it\'s is used' },
        { pattern: /\s{2,}/g, suggestion: ' ', type: 'formatting', explanation: 'Multiple spaces should be single space' },
        { pattern: /\s+\./g, suggestion: '.', type: 'punctuation', explanation: 'No space before period' },
        { pattern: /\s+,/g, suggestion: ',', type: 'punctuation', explanation: 'No space before comma' }
    ];
    
    commonErrors.forEach(error => {
        let match;
        while ((match = error.pattern.exec(text)) !== null) {
            if (error.type === 'grammar' && error.pattern.source.includes('(there|their|they\'re)')) {
                // Skip this complex check in fallback
                continue;
            }
            corrections.push({
                original: match[0],
                suggestion: error.suggestion,
                type: error.type,
                explanation: error.explanation,
                startIndex: match.index,
                endIndex: match.index + match[0].length
            });
        }
    });
    
    return {
        hasErrors: corrections.length > 0,
        corrections: corrections.slice(0, 5), // Limit to 5 corrections
        overallSuggestion: corrections.length > 0 ? 
            `Found ${corrections.length} potential issues. Consider reviewing for grammar and formatting.` : 
            `Text appears to be well-written with no obvious grammar errors.`
    };
}

// Grammar checker endpoint
router.post('/check-grammar', async (req, res) => {
    try {
        const { text, language = 'en' } = req.body;

        if (typeof text !== 'string' || !text.trim() || text.length > 40_000) {
            return res.status(400).json({ error: { code: 'INVALID_AI_INPUT', message: 'Text is required for grammar checking', requestId: res.locals.requestId } });
        }
        if (typeof language !== 'string' || !/^[a-z]{2}$/.test(language)) {
            return res.status(400).json({ error: { code: 'INVALID_AI_INPUT', message: 'Unsupported grammar language', requestId: res.locals.requestId } });
        }

        // Language mapping for proper language names in prompt
        const languageNames = {
            en: 'English',
            es: 'Spanish',
            fr: 'French',
            de: 'German',
            it: 'Italian',
            pt: 'Portuguese',
            ru: 'Russian',
            nl: 'Dutch',
            pl: 'Polish',
            se: 'Swedish',
            no: 'Norwegian',
            dk: 'Danish',
            is: 'Icelandic',
            gk: 'Greek',
            ro: 'Romanian',
        };

        const targetLanguage = languageNames[language] || 'English';

        // Prepare the comprehensive prompt for Gemini
        const prompt = `
        You are an expert grammar checker and writing assistant with extensive knowledge of ${targetLanguage} language rules. Your task is to perform a COMPREHENSIVE and EXHAUSTIVE analysis of the provided text in a SINGLE PASS to identify ALL errors and issues.
        
        ANALYSIS APPROACH - Follow this systematic process:
        1. **Read the entire text first** to understand context and intent
        2. **Sentence-by-sentence analysis** for grammar and structure
        3. **Word-by-word review** for spelling and usage
        4. **Punctuation and formatting check** throughout
        5. **Style and clarity assessment** for improvements
        6. **Final comprehensive review** to ensure nothing is missed
        
        Text to analyze:
        "${text}"
        
        COMPREHENSIVE ERROR DETECTION - Check for ALL of the following:
        
        **GRAMMAR ERRORS:**
        - Subject-verb agreement issues
        - Incorrect verb tenses and forms
        - Wrong pronoun usage (he/she/it, they/them, possessive pronouns)
        - Article errors (a/an/the)
        - Preposition mistakes
        - Sentence fragments and run-on sentences
        - Incorrect word order
        - Dangling modifiers
        - Parallel structure issues
        - Conditional sentence errors
        
        **SPELLING & WORD USAGE:**
        - Misspelled words
        - Homophone confusions (there/their/they're, your/you're, its/it's)
        - Wrong word choices (affect/effect, accept/except)
        - Repeated words or phrases
        - Missing or extra words
        - Capitalization errors
        
        **PUNCTUATION & FORMATTING:**
        - Missing or incorrect punctuation marks
        - Comma splices and comma errors
        - Apostrophe misuse
        - Quotation mark errors
        - Hyphen and dash usage
        - Spacing issues (extra spaces, missing spaces)
        
        **STYLE & CLARITY:**
        - Awkward phrasing that can be improved
        - Redundant expressions
        - Unclear or ambiguous sentences
        - Word repetition that should be varied
        - Passive voice that should be active (when appropriate)
        
        CRITICAL INSTRUCTIONS:
        - **BE THOROUGH**: This is a ONE-TIME analysis. Find EVERY error, don't leave anything for a second pass
        - **BE ACCURATE**: Calculate exact startIndex and endIndex positions for each error
        - **BE PRECISE**: Only flag actual errors, not stylistic preferences
        - **BE COMPREHENSIVE**: Look at the text from multiple angles (grammar, spelling, style, clarity)
        - **BE SYSTEMATIC**: Go through the text methodically, don't skip sections
        
        RESPONSE FORMAT - Return ONLY this JSON structure:
        {
            "hasErrors": boolean,
            "corrections": [
                {
                    "original": "exact text with error",
                    "suggestion": "corrected version",
                    "type": "grammar|spelling|punctuation|style",
                    "explanation": "clear, brief explanation of the issue",
                    "startIndex": exact_character_position,
                    "endIndex": exact_end_position
                }
            ],
            "overallSuggestion": "comprehensive assessment of text quality and main areas for improvement"
        }
        
        Remember: This is your ONLY chance to catch all errors. Be thorough, methodical, and comprehensive in your analysis.`;

        const text_response = await generateConfiguredText(req, res, prompt, 'check-grammar', { temperature: 0.1, maxTokens: 4096 });
        const result = parseAiResponse('check-grammar', text_response, { sourceText: text });
        return res.json(result);
    } catch (error) {
        if (error.code === 'INVALID_AI_INPUT') throw error;
        console.error('Error in grammar checking:', error.code || error.message);
        const fallbackData = generateFallbackGrammarCheck(req.body.text, 'English');
        return res.json(fallbackData);
    }
});

router.post('/generate-content', async (req, res) => {
    const operation = String(req.body.operation || '');
    try {
        const result = await executeContentOperation({
            operation,
            payload: req.body.payload || {},
            signal: req.aiAbortSignal,
            requestId: res.locals.requestId,
        });
        res.setHeader('X-AI-Provider', result.provider);
        res.setHeader('X-AI-Model', result.model);
        res.setHeader('X-AI-Grounding', result.grounding);
        return res.json(result.data);
    } catch (error) {
        const status = error.code === 'AI_PROVIDER_ERROR' ? 502 : (Number(error.status) || (error.code === 'AI_PROVIDER_UNAVAILABLE' ? 503 : 502));
        const code = error.code || (status < 500 ? 'INVALID_AI_REQUEST' : 'AI_PROVIDER_ERROR');
        if (status >= 500) console.error('[AI generation]', { operation, code, requestId: res.locals.requestId });
        return res.status(status).json({ error: {
            code,
            message: status < 500 ? error.message : 'AI generation is temporarily unavailable',
            requestId: res.locals.requestId,
        } });
    }
});

router.post('/parse-resume', async (req, res) => {
    const rawText = String(req.body.rawText || '');
    if (!rawText || rawText.length > 40_000) return res.status(400).json({ error: { code: 'INVALID_RESUME_TEXT', message: 'Resume text must be between 1 and 40000 characters', requestId: res.locals.requestId } });
    try {
        const result = await executeResumeParsing({ rawText, signal: req.aiAbortSignal });
        res.setHeader('X-AI-Provider', result.provider);
        res.setHeader('X-AI-Model', result.model);
        res.setHeader('X-AI-Grounding', result.grounding);
        return res.json({ data: result.data });
    } catch (error) {
        const status = Number(error.status) || 502;
        const code = error.code || 'AI_PROVIDER_ERROR';
        console.error('[Resume parser]', { code, requestId: res.locals.requestId });
        return res.status(status).json({ error: { code, message: status < 500 ? error.message : 'Resume parsing is temporarily unavailable', requestId: res.locals.requestId } });
    }
});

// Test endpoint to check AI configuration
module.exports = router;
// Exported for unit testing of the interview generation pipeline (prompt builder,
// de-duplication, difficulty distribution, grounded fallback, metadata cleaners, and blueprinting).
module.exports.buildInterviewPrompt = buildInterviewPrompt;
module.exports.dedupeQuestions = dedupeQuestions;
module.exports.questionKey = questionKey;
module.exports.interviewDifficultyDistribution = interviewDifficultyDistribution;
module.exports.cleanInterviewMetadataArtifacts = cleanInterviewMetadataArtifacts;
module.exports.isGenericQuestion = isGenericQuestion;
module.exports.extractCandidateProfile = extractCandidateProfile;
module.exports.extractJobRequirements = extractJobRequirements;
module.exports.buildContextualBlueprint = buildContextualBlueprint;

