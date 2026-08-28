const express = require('express');
const crypto = require('crypto');
const { executeContentOperation, executeResumeParsing, extractJson, loadProviderConfiguration, generateWithProviders, parseAiResponse } = require('../services/aiRuntime');
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
    '/parse-resume',
]);
router.use((req, res, next) => {
    if (!AI_ROUTE_PATHS.has(req.path)) return next();
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
    const count = Math.min(Math.max(parseInt(questionCount) || 10, 5), 20);
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
    const validQuestionCount = Math.min(Math.max(parseInt(input.questionCount) || 10, 5), 20);
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
            "explanation": "Detailed explanation of why the correct answer is optimal and why alternatives are flawed.",
            "estimatedTime": 120
        }
    ]
}

Fresh-run directive: produce a distinct set of questions from any prior attempt (unique run token: ${nonce}). Only return valid JSON without any markdown wrapper or surrounding commentary.
`;

    return { prompt, validQuestionCount, targetLanguage, distribution: blueprint.distribution, sessionNonce: nonce, blueprint };
}

// Generate interview questions based on occupation and interview type
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

        // Bounded, privacy-preserving history: only the last few question texts are accepted so
        // prior-attempt repetition can be avoided without shipping unlimited history.
        const priorQuestions = (Array.isArray(previousQuestions) ? previousQuestions : [])
            .filter(q => typeof q === 'string')
            .map(q => cleanInterviewMetadataArtifacts(sanitizePromptFragment(q, 240)))
            .filter(q => q.length > 0)
            .slice(0, 12);

        const built = buildInterviewPrompt({
            occupation,
            interviewType,
            questionCount,
            language,
            experienceLevel,
            difficulty,
            jobDescription,
            resumeFacts,
            previousQuestions: priorQuestions,
            sessionNonce: crypto.randomBytes(8).toString('hex'),
        });
        const prompt = built.prompt;

        const responseText = await generateConfiguredText(req, res, prompt, 'generate-interview', { maxTokens: 4096 });

        try {
            // Extract the JSON from the response
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            const jsonStr = jsonMatch ? jsonMatch[0] : responseText;
            const jsonData = extractJson(jsonStr) || extractJson(responseText);

            if (!jsonData || typeof jsonData !== 'object') throw new Error('Invalid interview response');

            // De-duplicate and strip any leaked metadata artifacts from questions and options
            const questions = dedupeQuestions(jsonData.questions, priorQuestions).slice(0, built.validQuestionCount);
            if (!questions.length) throw new Error('No usable questions after de-duplication');

            jsonData.questions = questions;
            jsonData.totalQuestions = questions.length;
            markSource('ai');
            res.json(jsonData);
        } catch (parseError) {
            console.error('Error parsing AI response:', parseError);
            // Fall back to generating default interview questions (role/difficulty/count-aware).
            const fallbackData = generateDefaultInterview({
                occupation,
                interviewType,
                questionCount: built.validQuestionCount,
                language,
                difficulty,
                experienceLevel,
                previousQuestions: priorQuestions,
            });
            markSource('fallback');
            res.json(fallbackData);
        }
    } catch (error) {
        console.error('Error generating interview questions:', error);
        // Use fallback if AI generation fails
        const { occupation, interviewType, questionCount = 10, language = 'en', difficulty, experienceLevel, previousQuestions } = req.body;
        const priorQuestions = (Array.isArray(previousQuestions) ? previousQuestions : [])
            .filter(q => typeof q === 'string')
            .map(q => cleanInterviewMetadataArtifacts(sanitizePromptFragment(q, 240)))
            .filter(q => q.length > 0)
            .slice(0, 12);
        const fallbackData = generateDefaultInterview({
            occupation,
            interviewType,
            questionCount,
            language,
            difficulty,
            experienceLevel,
            previousQuestions: priorQuestions,
        });
        markSource('fallback');
        res.json(fallbackData);
    }
});

// Fallback function to generate interview questions when API fails. Deterministic per input
// (seeded by role/type/difficulty/count), role- and difficulty-aware, honors the requested
// question count, never fabricates candidate experience, and never repeats a question that was
// already asked recently. This is a reliability net — it is never the diversity source.
function seededRand(seedStr) {
    let h = 2166136261;
    for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
    return () => {
        h += 0x6D2B79F5;
        let t = h;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function seededShuffle(arr, rand) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
}
// diff tiers: 0=Easy, 1=Intermediate, 2=Advanced
const FBQ = (question, options, correctAnswer, category, diff, explanation, estimatedTime) => ({
    question, options, correctAnswer, category, diff,
    explanation: explanation || 'The selected option reflects the best-practice approach for a professional in this role.',
    estimatedTime: estimatedTime || 90,
});

const FALLBACK_TECHNICAL = (occ) => [
    FBQ(`When evaluating whether to adopt a specialized framework versus standard built-in capabilities for a ${occ} project, which trade-off is most critical?`,
        ['Long-term maintainability and team capability versus upfront convenience', 'Whether the tool is trending on developer forums', 'Choosing the tool that has zero learning curve regardless of performance', 'Avoiding all third-party dependencies unconditionally'], 0, 'Technical Architecture', 1,
        'Evaluating long-term maintainability, ecosystem health, and team ergonomics ensures sustainable architecture.'),
    FBQ(`You are tasked with introducing a modern architectural pattern to your ${occ} workflow. How do you mitigate migration risks for active production systems?`,
        ['Implement an end-to-end rewrite in a single deployment', 'Use an incremental rollout with feature flags, baseline benchmarks, and automated rollback triggers', 'Deploy directly to production during off-peak hours without testing', 'Delay the migration indefinitely to avoid risk'], 1, 'Systems Migration', 2,
        'Phased rollouts with automated verification and fallback boundaries prevent production outages during migrations.'),
    FBQ(`How do you approach diagnosing an intermittent production failure as a ${occ}?`,
        ['Restart the service repeatedly until the issue disappears', 'Immediately apply the last fix used on an unrelated bug', 'Isolate telemetry, reproduce failure conditions with synthetic loads, and verify root causes before deploying fixes', 'Assume external network instability without investigation'], 2, 'Problem Solving', 1,
        'Evidence-driven diagnosis using telemetry correlation and reproducible synthetic loads prevents recurring defects.'),
    FBQ(`Which performance telemetry metric is most actionable when optimizing throughput in a ${occ} pipeline?`,
        ['Total lines of configuration written', 'P95/P99 latency distribution and resource saturation bottlenecks', 'Personal estimates of system velocity', 'Gross number of tasks processed without tracking error rates'], 1, 'Performance Engineering', 2,
        'P95/P99 latency profiles and resource saturation metrics identify true user-impacting bottlenecks.'),
    FBQ(`How do you decide when to refactor legacy components in your ${occ} codebase or infrastructure?`,
        ['Refactor only when completely blocked, without documentation', 'Assess defect frequency, maintenance overhead, and test coverage before planning bounded incremental refactors', 'Rewrite everything immediately whenever a new tool is released', 'Never refactor working systems regardless of maintenance costs'], 1, 'Code Quality', 1,
        'Data-backed refactoring targeting high-churn, defect-prone modules maximizes ROI while protecting stability.'),
    FBQ(`During a major production incident in your ${occ} domain, what is your immediate priority?`,
        ['Assign blame and investigate historical commits', 'Triage blast radius, mitigate customer impact via failover, and communicate transparent status updates', 'Silence monitoring alerts to reduce noise', 'Attempt unreviewed speculative patches in production'], 1, 'Incident Response', 2,
        'Rapid blast-radius containment, failover mitigation, and clear stakeholder updates are the gold standard of incident response.'),
    FBQ(`How would you estimate the technical effort and risk for a complex ${occ} initiative with significant ambiguity?`,
        ['Provide a single optimistic deadline based on best-case assumptions', 'Decompose into verifiable milestones, identify integration unknowns, and provide confidence ranges with explicit assumptions', 'Refuse to estimate until all external dependencies are 100% complete', 'Double the first estimate arbitrarily without breakdown'], 1, 'Technical Planning', 1,
        'Decomposition into measurable milestones with confidence intervals and explicit risk assumptions creates defensible plans.'),
    FBQ(`When conducting a peer review for a critical ${occ} deliverable, what should you prioritize?`,
        ['Enforcing personal stylistic preferences over team conventions', 'Approving quickly without deep analysis to unblock velocity', 'Validating system correctness, edge-case failure handling, security posture, and maintainability', 'Rejecting any implementation that differs from your initial mental model'], 2, 'Peer Review', 1,
        'Rigorous review focuses on correctness, security boundaries, failure recovery, and adherence to shared standards.'),
    FBQ(`What is the most effective approach to maintain system reliability when upstream APIs or dependencies experience latency spikes?`,
        ['Retry failed requests infinitely in a tight loop', 'Implement bounded timeouts, exponential backoff with jitter, and circuit breaker fallbacks', 'Fail silently and return empty responses without logging', 'Block incoming requests until upstream services recover completely'], 1, 'Reliability Engineering', 2,
        'Circuit breakers combined with jittered exponential backoff protect upstream dependencies from cascading failure storms.'),
    FBQ(`How do you prioritize competing technical debt versus feature delivery as a ${occ}?`,
        ['Ignore technical debt entirely to maximize immediate feature output', 'Quantify reliability/velocity impact of debt, present business trade-offs, and allocate dedicated capacity alongside roadmap items', 'Halt all product feature development until the system has zero technical debt', 'Fix technical debt secretly without stakeholder visibility'], 1, 'Technical Strategy', 2,
        'Quantifying the operational cost of technical debt aligns engineering health with sustainable business velocity.'),
];

const FALLBACK_BEHAVIORAL = (occ) => [
    FBQ(`How do you handle a conflict within your team as a ${occ}?`,
        ['Avoid the person', 'Listen to all sides, facilitate discussion, and find common ground', 'Always side with seniority', 'Escalate immediately'], 1, 'Conflict Resolution', 1,
        'Active listening and collaborative problem-solving resolve conflicts constructively.'),
    FBQ(`Describe how you prioritize when you face multiple deadlines as a ${occ}.`,
        ['Work on whatever feels urgent', 'Rank by urgency and importance and communicate a plan', 'Work longer hours on everything', 'Do the easiest first'], 2, 'Time Management', 1,
        'Urgency/importance ranking with stakeholder communication is effective prioritization.'),
    FBQ(`How do you respond to constructive feedback on your ${occ} work?`,
        ['Take it personally', 'Listen, reflect, and act on the feedback', 'Ignore it', 'Agree to everything'], 1, 'Adaptability', 0,
        'A growth mindset treats feedback as an input for improvement.'),
    FBQ(`Tell me how you adapt when a major requirement changes mid-project as a ${occ}.`,
        ['Resist the change', 'Understand the reason, replan, and communicate the impact', 'Quietly keep the old plan', 'Blame the requester'], 2, 'Change Management', 1,
        'Understanding the why, replanning, and communicating impact is how professionals adapt.'),
    FBQ(`How do you collaborate with people from other functions as a ${occ}?`,
        ['Avoid cross-functional work', 'Insist others follow your process', 'Learn their context, align goals, and agree on communication', 'Let management coordinate'], 2, 'Collaboration', 1,
        'Empathy plus shared goals and clear channels make cross-functional work succeed.'),
    FBQ(`How do you handle missing information when you need to proceed as a ${occ}?`,
        ['Block until everything is known', 'State assumptions, proceed, and validate them early', 'Make things up', 'Wait passively'], 1, 'Judgment', 1,
        'Explicit assumptions validated early keep momentum without guessing.'),
    FBQ(`How do you deliver good news and bad news to stakeholders as a ${occ}?`,
        ['Only share good news', 'Be transparent, focus on impact and next steps', 'Let them find out', 'Delay all updates'], 1, 'Communication', 0,
        'Transparency about impact with clear next steps builds trust.'),
    FBQ(`What do you do when you realize you were wrong about a technical decision as a ${occ}?`,
        ['Defend the original choice', 'Acknowledge it, assess impact, and propose a correction', 'Hide the mistake', 'Wait for someone else to notice'], 2, 'Ownership', 1,
        'Owning mistakes and proposing corrections is a core professional behavior.'),
];

const FALLBACK_MANAGERIAL = (occ) => [
    FBQ(`How do you delegate work effectively when leading a ${occ} team?`,
        ['Do everything yourself', 'Assign by skill and growth goals, set clear outcomes, and stay available', 'Delegate everything without guidance', 'Assign by who asks first'], 1, 'Delegation', 1,
        'Skill-matched delegation with clear outcomes and support maximizes team output and growth.'),
    FBQ(`How do you handle an underperforming team member as a ${occ} manager?`,
        ['Avoid the conversation', 'Understand root cause, set expectations, and create a support plan', 'Put them on a plan immediately', 'Ignore it'], 2, 'Performance Management', 2,
        'Diagnose, set expectations, and support before escalating is the fair, effective approach.'),
    FBQ(`How do you decide what your ${occ} team should work on next?`,
        ['Follow the loudest voice', 'Align priorities with business goals and capacity, then communicate', 'Do the easiest work', 'Always chase the newest idea'], 1, 'Prioritization', 1,
        'Priorities should map to business impact and be weighed against team capacity.'),
    FBQ(`How do you build trust with the people you manage as a ${occ}?`,
        ['Be distant and formal', 'Be consistent, transparent, and follow through on commitments', 'Be a friend first', 'Only meet at annual reviews'], 1, 'Leadership', 1,
        'Consistency, transparency, and follow-through are the foundations of trust.'),
    FBQ(`How do you handle a situation where two senior stakeholders disagree on scope as a ${occ}?`,
        ['Pick a side', 'Facilitate a discussion around goals, data, and trade-offs', 'Escalate and disengage', 'Make the call secretly'], 2, 'Stakeholder Management', 2,
        'Facilitating around shared goals and trade-offs aligns stakeholders without taking sides.'),
    FBQ(`How do you grow the skills of your ${occ} team?`,
        ['Assume people self-improve', 'Create stretch opportunities, coaching, and regular feedback', 'Send everyone to training once', 'Only fix what breaks'], 1, 'Development', 1,
        'Structured growth through stretch work and coaching is how teams develop.'),
];

const FALLBACK_CASE = (occ) => [
    FBQ(`How would you structure an analysis to size a new ${occ} initiative?`,
        ['Pick a number quickly', 'Clarify scope, identify drivers, build a model, and sanity-check the result', 'Use the last project size', 'Ask for the answer'], 2, 'Case Reasoning', 2,
        'Structured frameworks (scope, drivers, model, sanity check) produce defensible estimates.'),
    FBQ(`How do you evaluate two competing approaches for a ${occ} decision?`,
        ['Go with your favorite', 'Define criteria, weight them, and compare trade-offs against data', 'Ask a friend', 'Do both completely'], 1, 'Decision Making', 1,
        'Criteria-weighted comparison keeps decisions objective and explainable.'),
    FBQ(`What do you do when the data you need for a ${occ} decision is incomplete?`,
        ['Refuse to decide', 'State assumptions, use best estimates, and flag the risk', 'Make up data', 'Decide randomly'], 1, 'Judgment', 1,
        'Explicit assumptions plus risk flagging lets decisions proceed without fabrication.'),
    FBQ(`How would you break down a large, ambiguous ${occ} problem?`,
        ['Tackle it as one big step', 'Decompose into sub-problems, prioritize, and solve iteratively', 'Wait for clarity', 'Do the easiest part only'], 2, 'Problem Structuring', 2,
        'Decomposition and iterative solving make ambiguous problems tractable.'),
    FBQ(`How do you present the trade-offs of a ${occ} recommendation to leadership?`,
        ['Only show the upside', 'Present options, costs, benefits, and risks with a clear recommendation', 'Overwhelm with detail', 'Let them decide blindly'], 1, 'Communication', 1,
        'Clear options-with-trade-offs and a recommendation let leaders decide well.'),
    FBQ(`How would you measure whether a new ${occ} change actually worked?`,
        ['By how it feels', 'Define a baseline and a success metric, then compare before/after', 'Ignore measurement', 'By one anecdote'], 1, 'Measurement', 1,
        'Baseline-and-metric comparison is how outcomes are objectively evaluated.'),
];

const FALLBACK_GENERIC = (occ) => [
    FBQ(`When managing multiple high-priority deliverables under tight deadlines as a ${occ}, what is the most effective approach to maintain delivery quality?`,
        ['Attempt to complete all tasks simultaneously without triaging', 'Prioritize tasks by business impact and operational risk, establish clear stakeholder expectations, and maintain strict verification standards', 'Bypass all quality checks to meet deadlines faster', 'Work in isolation without providing progress visibility'], 1, 'Delivery Management', 1,
        'Risk-based prioritization with transparent stakeholder alignment protects product quality under schedule pressure.'),
    FBQ(`How do you structure an ongoing technical review process to prevent knowledge silos in your ${occ} team?`,
        ['Keep all architecture context in private notes', 'Establish regular collaborative design reviews, standardized documentation, and pair-programming on complex modules', 'Rely on a single senior contributor to approve everything without explanation', 'Discourage questions during code and design reviews'], 1, 'Knowledge Sharing', 1,
        'Shared design reviews and transparent documentation distribute domain knowledge and elevate collective team capability.'),
    FBQ(`How do you ensure requirements and acceptance criteria are testable and unambiguous for a ${occ} initiative?`,
        ['Begin implementation immediately based on high-level verbal requests', 'Define concrete input/output contracts, measurable success thresholds, edge-case failure expectations, and automated verification tests', 'Assume downstream consumers will clarify requirements post-release', 'Avoid writing acceptance criteria to maintain flexibility'], 1, 'Quality Assurance', 1,
        'Measurable success thresholds, contract definitions, and automated verification tests eliminate ambiguity before implementation.'),
    FBQ(`When receiving ambiguous or conflicting feedback from multiple stakeholders on a ${occ} deliverable, how do you proceed?`,
        ['Implement whichever request was submitted most recently', 'Schedule a focused alignment discussion, present data-backed trade-offs against business objectives, and agree on unified success criteria', 'Ignore the feedback and ship the original draft', 'Escalate immediately to executive leadership without synthesizing the issues'], 1, 'Stakeholder Alignment', 2,
        'Synthesizing trade-offs against core business goals facilitates productive consensus among conflicting stakeholders.'),
    FBQ(`How do you measure and demonstrate the business impact of an operational optimization you delivered as a ${occ}?`,
        ['Rely entirely on subjective team feedback', 'Establish pre-change baseline metrics, track post-release performance/cost/latency deltas, and publish an evidence-backed impact summary', 'Assume any positive business trend was caused by the optimization without validation', 'Avoid measuring performance to prevent scrutiny'], 1, 'Impact Measurement', 2,
        'Rigorous before-and-after baseline comparisons provide verifiable evidence of business and engineering impact.'),
    FBQ(`How do you take end-to-end ownership when an unexpected edge case causes a customer-facing degradation in your ${occ} scope?`,
        ['Attribute the failure to third-party infrastructure without remediation', 'Acknowledge the gap, drive immediate mitigation, conduct a blameless root-cause analysis, and implement preventative regression tests', 'Wait for customer support to report additional incidents before acting', 'Quietly deploy an unmonitored fix without documentation'], 1, 'Ownership & Accountability', 2,
        'True ownership combines rapid mitigation with transparent root-cause analysis and automated regression prevention.'),
    FBQ(`How do you balance thoroughness with execution speed when shipping high-velocity ${occ} deliverables?`,
        ['Always maximize speed by eliminating all testing and code review', 'Calibrate verification depth and review rigor to the blast radius, reversibility, and criticality of the change', 'Treat all changes with identical exhaustive bureaucracy regardless of scope', 'Never ship until theoretical perfection is reached'], 1, 'Engineering Judgment', 1,
        'Calibrating review and testing depth to change reversibility and blast radius balances speed with safety.'),
];

const generateDefaultInterview = ({ occupation = 'Professional', interviewType = 'technical', questionCount = 10, language = 'en', difficulty = 'medium', experienceLevel = '', previousQuestions = [] } = {}) => {
    const requestedCount = Math.min(Math.max(parseInt(questionCount) || 10, 5), 20);
    const type = ['technical', 'behavioral', 'hr', 'managerial', 'case', 'mixed'].includes(interviewType) ? interviewType : 'technical';
    const formattedOccupation = String(occupation || 'Professional').trim() || 'Professional';
    const occ = formattedOccupation;

    const pools = {
        technical: FALLBACK_TECHNICAL(occ),
        behavioral: FALLBACK_BEHAVIORAL(occ),
        hr: FALLBACK_MANAGERIAL(occ),
        managerial: FALLBACK_MANAGERIAL(occ),
        case: FALLBACK_CASE(occ),
        generic: FALLBACK_GENERIC(occ),
    };

    let basePool;
    if (type === 'mixed') basePool = [...pools.technical, ...pools.behavioral, ...pools.managerial];
    else if (type === 'hr') basePool = [...pools.behavioral, ...pools.managerial];
    else if (type === 'technical' || type === 'behavioral' || type === 'managerial' || type === 'case') basePool = pools[type];
    else basePool = pools.technical;

    const distribution = interviewDifficultyDistribution(requestedCount, difficulty, experienceLevel);
    const previousKeys = new Set((Array.isArray(previousQuestions) ? previousQuestions : [])
        .filter(q => typeof q === 'string').map(q => questionKey(q)));
    const rand = seededRand(`${occ}|${type}|${difficulty}|${requestedCount}|${language}`);

    // Bucket by base difficulty tier, seeded-shuffled within each tier.
    const tierBuckets = { 0: [], 1: [], 2: [] };
    for (const q of [...basePool, ...pools.generic]) {
        if (tierBuckets[q.diff]) tierBuckets[q.diff].push(q);
    }
    for (const tier of [0, 1, 2]) seededShuffle(tierBuckets[tier], rand);

    const usedKeys = new Set();
    const pickFrom = (tier) => {
        const bucket = tierBuckets[tier] || [];
        for (let i = 0; i < bucket.length; i++) {
            const q = bucket[i];
            const key = questionKey(q.question);
            if (usedKeys.has(key) || previousKeys.has(key)) continue;
            usedKeys.add(key);
            return q;
        }
        return null;
    };

    const selected = [];
    // Fulfill difficulty quotas (Advanced, Intermediate, Easy), borrowing from other tiers if needed.
    const want = [
        { tier: 2, count: distribution.advanced },
        { tier: 1, count: distribution.intermediate },
        { tier: 0, count: distribution.easy },
    ];
    for (const { tier, count } of want) {
        for (let i = 0; i < count; i++) {
            const q = pickFrom(tier) || pickFrom(2) || pickFrom(1) || pickFrom(0);
            if (q) selected.push(q);
            else break;
        }
    }
    // Fill any remaining shortfall from the whole pool (dedup + recent-history exclusion).
    if (selected.length < requestedCount) {
        const remaining = seededShuffle([...basePool, ...pools.generic]
            .filter(q => !usedKeys.has(questionKey(q.question))), rand);
        for (const q of remaining) {
            if (selected.length >= requestedCount) break;
            const key = questionKey(q.question);
            if (usedKeys.has(key) || previousKeys.has(key)) continue;
            usedKeys.add(key);
            selected.push(q);
        }
    }

    const labelFor = (baseDiff) => {
        const d = String(difficulty || 'medium').toLowerCase();
        const senior = ['senior', 'lead', 'executive', 'staff', 'principal', 'expert'].some(t =>
            String(experienceLevel || '').toLowerCase().includes(t));
        const eff = senior ? 'hard' : d;
        if (eff === 'easy') return baseDiff === 2 ? 'Intermediate' : 'Easy';
        if (eff === 'hard') return baseDiff === 0 ? 'Intermediate' : 'Advanced';
        if (eff === 'expert') return 'Advanced';
        return baseDiff === 0 ? 'Easy' : baseDiff === 1 ? 'Intermediate' : 'Advanced';
    };

    const questions = selected.slice(0, requestedCount).map((q, i) => ({
        id: i + 1,
        question: q.question,
        options: q.options,
        correctAnswer: q.correctAnswer,
        category: q.category,
        difficulty: labelFor(q.diff),
        weight: 1,
        explanation: q.explanation,
        estimatedTime: q.estimatedTime,
    }));

    const categories = [...new Set(questions.map(q => q.category))];
    const dept = type === 'technical' ? 'Technical Department' : type === 'case' ? 'Case Analysis' : 'Human Resources';
    const title = `${formattedOccupation} Position - ${type.charAt(0).toUpperCase() + type.slice(1)} Assessment`;

    return {
        title,
        company: 'Professional Evaluation Services',
        department: dept,
        duration: `${Math.max(5, Math.round((questions.length * 3) / 5) * 5)} minutes`,
        totalQuestions: questions.length,
        passingScore: 70,
        categories,
        questions,
        _source: 'fallback',
    };
};

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
module.exports.generateDefaultInterview = generateDefaultInterview;
module.exports.dedupeQuestions = dedupeQuestions;
module.exports.questionKey = questionKey;
module.exports.interviewDifficultyDistribution = interviewDifficultyDistribution;
module.exports.cleanInterviewMetadataArtifacts = cleanInterviewMetadataArtifacts;
module.exports.isGenericQuestion = isGenericQuestion;
module.exports.extractCandidateProfile = extractCandidateProfile;
module.exports.extractJobRequirements = extractJobRequirements;
module.exports.buildContextualBlueprint = buildContextualBlueprint;

