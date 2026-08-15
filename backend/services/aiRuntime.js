const crypto = require('crypto');

const PROVIDERS = Object.freeze(['nvidia', 'gemini', 'openai', 'groq', 'openrouter', 'deepseek']);
const PROVIDER_DEFAULTS = Object.freeze({
    nvidia: { model: 'meta/llama-3.1-8b-instruct', url: 'https://integrate.api.nvidia.com/v1/chat/completions' },
    gemini: { model: 'gemini-2.0-flash' },
    openai: { model: 'gpt-4o-mini', url: 'https://api.openai.com/v1/chat/completions' },
    groq: { model: 'llama-3.3-70b-versatile', url: 'https://api.groq.com/openai/v1/chat/completions' },
    openrouter: { model: 'meta-llama/llama-3.3-70b-instruct:free', url: 'https://openrouter.ai/api/v1/chat/completions' },
    deepseek: { model: 'deepseek-chat', url: 'https://api.deepseek.com/chat/completions' },
});
const ENV_KEYS = Object.freeze({
    nvidia: 'NVIDIA_API_KEY', gemini: 'GEMINI_API_KEY', openai: 'OPENAI_API_KEY',
    groq: 'GROQ_API_KEY', openrouter: 'OPENROUTER_API_KEY', deepseek: 'DEEPSEEK_API_KEY',
});
const ENV_MODELS = Object.freeze({
    nvidia: 'NVIDIA_MODEL', gemini: 'GEMINI_MODEL', openai: 'OPENAI_MODEL',
    groq: 'GROQ_MODEL', openrouter: 'OPENROUTER_MODEL', deepseek: 'DEEPSEEK_MODEL',
});
const MODEL_FIELDS = Object.freeze({
    nvidia: 'nvidiaModel', gemini: 'model', openai: 'openaiModel', groq: 'groqModel',
    openrouter: 'openrouterModel', deepseek: 'deepseekModel',
});
const ENABLE_FIELDS = Object.freeze({
    nvidia: 'enableNvidia', gemini: 'enableGemini', openai: 'enableOpenai', groq: 'enableGroq',
    openrouter: 'enableOpenrouter', deepseek: 'enableDeepseek',
});
const MODEL_PATTERN = /^[A-Za-z0-9._:/-]{1,150}$/;
const AUTOCOMPLETE_TYPES = new Set([
    'jobTitle', 'occupation', 'employer', 'company', 'school', 'degree', 'skill', 'city',
    'certification', 'certificationIssuer', 'language',
]);
const configurationCache = new WeakMap();
const CONFIGURATION_CACHE_MS = 15_000;

const CONTENT_OPERATIONS = new Set([
    'generate-summary', 'generate-work-description', 'generate-education-description',
    'generate-skills', 'generate-certifications', 'enhance-single-bullet', 'autocomplete',
]);

const GRAMMAR_TYPES = new Set(['grammar', 'spelling', 'punctuation', 'style']);

function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function safeModel(value, fallback) {
    const model = String(value || '').trim();
    return MODEL_PATTERN.test(model) ? model : fallback;
}

function compact(value, max = 4000) {
    if (Array.isArray(value)) return value.slice(0, 100).map(item => compact(item, 300)).join(', ');
    const text = Array.from(String(value ?? ''), character => {
        const code = character.charCodeAt(0);
        if (code === 9 || code === 10 || code === 13) return ' ';
        return code <= 31 || code === 127 ? '' : character;
    }).join('');
    return text.trim().slice(0, max);
}

function normalizePayload(payload = {}) {
    const normalized = {};
    for (const [key, value] of Object.entries(payload).slice(0, 80)) {
        if (Array.isArray(value)) normalized[key] = value.slice(0, 100).map(item => compact(typeof item === 'object' ? JSON.stringify(item) : item, 500));
        else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') normalized[key] = compact(value);
    }
    return normalized;
}

function validateOperation(operation, rawPayload) {
    if (!CONTENT_OPERATIONS.has(operation)) throw Object.assign(new Error('Unsupported AI operation'), { status: 400, code: 'UNSUPPORTED_AI_OPERATION' });
    const payload = normalizePayload(rawPayload);
    const required = {
        'generate-work-description': [['jobTitle', 'Job title'], ['employer', 'Employer']],
        'generate-education-description': [['school', 'School'], ['degree', 'Degree']],
        'enhance-single-bullet': [['bullet', 'Bullet']],
        autocomplete: [['query', 'Query']],
    }[operation] || [];
    for (const [field, label] of required) {
        if (!payload[field] && !(field === 'bullet' && payload.text)) throw Object.assign(new Error(`${label} is required`), { status: 400, code: 'INVALID_AI_INPUT' });
    }
    if (operation === 'autocomplete') {
        payload.type = AUTOCOMPLETE_TYPES.has(payload.type) ? payload.type : 'jobTitle';
        payload.query = compact(payload.query, 100);
        if (payload.query.length < 2) throw Object.assign(new Error('Autocomplete query is too short'), { status: 400, code: 'INVALID_AI_INPUT' });
    }
    return payload;
}

/** Prompt contract restored from commit 4a24231 (the last pre-security implementation). */
function buildLegacyPrompt(endpointName, rawPayload = {}, { sessionId } = {}) {
    const payload = validateOperation(endpointName, rawPayload);
    const language = payload.language || 'en';
    // Construct highly tailored ATS-optimized prompt
    let prompt = '';
    const focusPill = payload.focusTone ? `Focus Area: ${payload.focusTone}.` : 'Focus Area: High-impact quantifiable metrics and leadership.';
    const locationInfo = payload.city ? ` Location/Branch: ${payload.city}.` : '';
    const uniqueSeed = compact(sessionId || crypto.randomBytes(8).toString('hex'), 40);

    if (endpointName === 'generate-work-description') {
        const userNotes = payload.existingText || payload.notes || payload.description || payload.userNotes || '';

        prompt = `You are an elite Fortune 500 Senior Executive Resume Writer, professional editor, and Senior ATS Recruiter.
Generate 4 distinct, high-impact resume accomplishment bullet points for a candidate working as "${payload.jobTitle || 'Professional'}" at "${payload.employer || 'Company'}".${locationInfo} ${focusPill}${payload.style ? ` Style Guidelines: ${payload.style}.` : ''}

${userNotes ? `CANDIDATE'S ACTUAL PROVIDED NOTES/RESPONSIBILITIES (STRICT FACTUAL MANDATE):
"${userNotes}"
CRITICAL TRUTHFULNESS DIRECTIVE: You MUST strictly base all 4 bullet points on the user's actual notes above. Refine, expand professionally, and optimize their real experience for ATS. DO NOT FABRICATE or invent unrelated projects, fake companies, or fictitious numbers that contradict their notes!` : `FACTUAL BOUNDARY DIRECTIVE: No candidate notes were provided. Generate standard, realistic professional achievements standard for a "${payload.jobTitle || 'Professional'}" at "${payload.employer || 'Company'}" WITHOUT inventing fake customer names, exaggerated millions of dollars, or fictitious locations.`}

CRITICAL ATS CRITERIA & 10/10 NATURAL HUMAN VOICE RULES:
1. SOUND LIKE A REAL HUMAN PROFESSIONAL: Write direct, concise, down-to-earth bullet points. BAN inflated AI linking clauses like "thereby increasing...", "achieving a significant reduction in...", "fostering seamless collaboration...", "to ensure continuous quality...". State the work done and the direct outcome cleanly.
2. ACTION-FIRST STRUCTURE: Start directly with strong, clear past-tense action verbs (Built, Designed, Wrote, Cut, Shipped, Automated, Managed, Developed, Migrated, Integrated). Never repeat starting verbs.
3. STRICT ANTI-AI BUZZWORD BAN: NEVER use robotic AI cliché words ("spearheaded", "leveraged", "utilize", "fostered", "synergy", "tapestry", "beacon", "testament", "thereby", "spearhead", "leverage"). Write like an experienced engineer explaining their work to a colleague.
4. ABSOLUTE PROHIBITION ON BRACKETED PLACEHOLDERS: NEVER output bracketed placeholders like "[insert actual percentage or number]", "[insert original time]", "[insert X]", or "[X%]". Write 100% complete, ready-to-use sentences.
5. ABSOLUTE PROHIBITION ON HALLUCINATED LOCATIONS: NEVER invent or add fictitious city names or branch offices (such as "San Francisco branch", "New York office", "Silicon Valley team") unless explicitly provided in the candidate's notes or location field! If no location is specified, refer strictly to "${payload.employer || 'the company'}" without adding any branch or city name.

Return ONLY valid JSON format:
{ "suggestions": ["bullet 1", "bullet 2", "bullet 3", "bullet 4"] }
Language: ${language}. SessionID: ${uniqueSeed}`;
    } else if (endpointName === 'generate-education-description') {
        prompt = `You are an Elite University Academic Advisor & Career Coach. Generate 4 academic highlights, honors, or accomplishments for a candidate pursuing or completed "${payload.degree || 'Degree'}" at "${payload.school || 'University'}".${locationInfo}

CRITICAL RULES:
1. Integrate academic distinctions, honors (e.g., Dean's list, graduated with honors), relevant advanced coursework/capstone projects, and leadership in student organizations.
2. Write fluid, authentic, human academic statements. Avoid AI filler text and robotic phrasing.
3. Return ONLY valid JSON format: { "suggestions": ["highlight 1", "highlight 2", "highlight 3", "highlight 4"] }
Language: ${language}. SessionID: ${uniqueSeed}`;
    } else if (endpointName === 'generate-summary') {
        const yearsText = payload.experience || '3+ years';
        const workHistText = payload.workHistory || payload.experience || '';
        const eduText = payload.education || '';
        const skillsText = Array.isArray(payload.skills) ? payload.skills.join(', ') : payload.skills || '';
        const certsText = Array.isArray(payload.certifications) ? payload.certifications.join(', ') : payload.certifications || '';
        const projText = payload.projects || payload.achievement || '';

        const rawTone = payload.tone || payload.summaryType || payload.focusTone || payload.style || 'executive';
        const toneMap = {
            executive: 'Executive & Strategic: Focus on high-level organizational leadership, strategic vision, cross-functional orchestration, and enterprise value delivery.',
            technical: 'Technical & Architectural: Emphasize core engineering depth, systems architecture, tech stack mastery, performance optimization, and rigorous problem-solving.',
            'metric-focused': 'Quantifiable & Metrics-Driven: Highlight measurable KPIs, performance improvements, efficiency gains, cost reductions, and data-backed accomplishments.',
            metrics: 'Quantifiable & Metrics-Driven: Highlight measurable KPIs, performance improvements, efficiency gains, cost reductions, and data-backed accomplishments.',
            creative: 'Creative & Innovative: Focus on forward-thinking ideas, user-centric design, innovative solutions, and storytelling in product execution.',
            concise: 'Punchy & Ultra-Concise: Direct, high-signal, zero-fluff summary maximizing impact with dense ATS keywords in minimal words.',
            professional: 'Balanced & ATS-Optimized: Balanced executive tone harmonizing technical expertise, execution capabilities, and industry competencies.'
        };
        const activeToneDirective = toneMap[rawTone.toLowerCase()] || `Tone Directive: ${rawTone}.`;

        prompt = `You are an elite Fortune 500 Senior Executive Resume Writer & Senior ATS Keyword Strategist.
Synthesize this candidate's background into a 100% natural, human-written, ATS-optimized Executive Summary (2-3 punchy sentences, 50-70 words maximum).

CANDIDATE DETAILS:
- Candidate Name: ${payload.name || 'Professional'}
- Target Role/Occupation: "${payload.jobTitle || payload.occupation || 'Professional'}"
- Experience Level/Span: ${yearsText}
${workHistText ? `- Work History & Roles: ${workHistText}` : ''}
${eduText ? `- Academic Education: ${eduText}` : ''}
${skillsText ? `- Core Skills & Tools: ${skillsText}` : ''}
${certsText ? `- Certifications: ${certsText}` : ''}
${projText ? `- Accomplishments: ${projText}` : ''}

TARGET TONE DIRECTIVE (STRICT REQUIREMENT):
${activeToneDirective}

CRITICAL RULES FOR 100% NATURAL HUMAN VOICE & MAXIMUM ATS MATCH:
1. PUNCHY 2-3 SENTENCE STRUCTURE:
   - Sentence 1: Start directly with candidate role title, years of experience, and their top 2-3 specific technical domains or functional specializations (e.g., "${payload.jobTitle || payload.occupation || 'Software Engineer'} with ${yearsText} of experience in [Domain 1] and [Domain 2].").
   - Sentence 2: Concrete summary of key strengths, systems, or responsibilities derived strictly from their actual background, reflecting the requested tone.
   - Sentence 3: Hard-skill ATS keyword cluster (languages, frameworks, methodologies, or certifications).
2. ABSOLUTE BAN ON BUZZWORDS & STOCK FILLER:
   - NEVER use overused clichés: "Results-driven", "Results-oriented", "Dedicated professional", "Passionate", "Seasoned", "Motivated", "Dynamic", "I am a...", "proven track record of", "driving business growth", "spearheaded", "leveraged", "leveraging", "utilize", "fostered", "synergy", "testament".
   - Start immediately with the exact job title.
3. STRICT BAN ON COVER LETTER FLUFF (RESUME SUMMARY, NOT a cover letter):
   - NEVER use cover-letter phrasing such as "I would bring strategic value" or "make a tangible impact".
4. THIRD-PERSON IMPLICIT RESUME STYLE:
   - Resumes NEVER use first-person pronouns ("I", "my", "we") or third-person pronouns ("He", "She").
5. 100% FACTUAL & DOMAIN-ALIGNED:
   - Adapt tone and terminology to the specific profession (Tech, Marketing, Finance, Healthcare, Operations, etc.). Do not insert tech terms into non-tech roles.
6. NO PLACEHOLDERS OR BRACKETS:
   - Write 100% complete, polished sentences.

Return ONLY valid JSON format:
{ "summary": "Full professional executive summary text here." }
Language: ${language}. SessionID: ${uniqueSeed}`;
    } else if (endpointName === 'generate-skills') {
        const workHistText = payload.workHistory || '';
        const eduText = payload.education || '';
        const projText = payload.projects || '';
        const existingSkills = Array.isArray(payload.existingSkills) ? payload.existingSkills.join(', ') : payload.existingSkills || '';

        prompt = `You are a Senior ATS Keyword Analyst & Executive Recruiter.
Analyze this candidate's target role and complete background, and recommend 12 high-demand, ATS-indexed industry skills, tools, and technical competencies categorized into mandatory/core skills vs recommended skills.

CANDIDATE CONTEXT TO ANALYZE:
- Target Role: "${payload.jobTitle || payload.occupation || 'Professional'}"
${workHistText ? `- Work History: ${workHistText}` : ''}
${eduText ? `- Education: ${eduText}` : ''}
${projText ? `- Projects: ${projText}` : ''}
${existingSkills ? `- Existing Skills Already Added: ${existingSkills}` : ''}

RULES:
1. Categorize 6 skills as "mandatory" (core essential skills required for this occupation) and 6 skills as "recommended" (high-value specialized tools/frameworks).
2. ABSOLUTELY BANNED: Do NOT include parenthetical examples like "(e.g. Google Ad Manager)" or "(e.g. Excel)" in skill names. Output direct, concise 1-3 word skill names (e.g. "Google Ad Manager", "Display Advertising", "Data Visualization", "PostgreSQL").
3. Do NOT repeat any skills listed under Existing Skills Already Added.
4. Return ONLY valid JSON format:
{ 
  "skills": [
    { "name": "React.js", "category": "mandatory" },
    { "name": "Node.js", "category": "mandatory" },
    { "name": "Docker", "category": "recommended" }
  ]
}
Language: ${language}. SessionID: ${uniqueSeed}`;
    } else if (endpointName === 'generate-certifications') {
        const workHistText = payload.workHistory || '';
        const eduText = payload.education || '';
        const skillsText = Array.isArray(payload.skills) ? payload.skills.join(', ') : payload.skills || '';
        const existingCerts = Array.isArray(payload.existingCertifications) ? payload.existingCertifications.join(', ') : payload.existingCertifications || '';

        prompt = `You are a Senior Career Coach & Professional Certification Specialist.
Analyze this candidate's target role and background, and recommend 6 top recognized professional certifications, accreditations, or licenses matching their career path.

CANDIDATE CONTEXT TO ANALYZE:
- Target Role: "${payload.jobTitle || payload.occupation || 'Professional'}"
${workHistText ? `- Work History: ${workHistText}` : ''}
${eduText ? `- Education: ${eduText}` : ''}
${skillsText ? `- Core Skills: ${skillsText}` : ''}
${existingCerts ? `- Existing Certifications Already Added: ${existingCerts}` : ''}

RULES:
1. Categorize 3 certifications as "mandatory" (core industry standard credentials) and 3 as "recommended" (advanced specialized credentials).
2. Provide official certification title and issuing body for each.
3. Return ONLY valid JSON format:
{ "certifications": [
    { "title": "AWS Certified Solutions Architect", "issuer": "Amazon Web Services", "category": "mandatory" },
    { "title": "Project Management Professional (PMP)", "issuer": "PMI", "category": "mandatory" },
    { "title": "Certified ScrumMaster (CSM)", "issuer": "Scrum Alliance", "category": "recommended" }
  ]
}
Language: ${language}. SessionID: ${uniqueSeed}`;
    } else if (endpointName === 'enhance-single-bullet') {
        const rawBullet = payload.bullet || payload.text || '';
        prompt = `You are an Elite Executive Resume Editor & Senior ATS Specialist.
Rewrite and elevate the following single bullet point into a high-impact, professional resume achievement:

ORIGINAL BULLET:
"${rawBullet}"

CRITICAL RULES:
1. Start directly with a strong past-tense action verb (e.g. Implemented, Reduced, Built, Automated, Designed, Engineered, Optimized, Delivered, Scaled, Cut).
2. Write in a 100% natural, direct human professional voice. DO NOT use robotic AI filler words ("thereby", "spearheaded", "leveraged").
3. DO NOT insert bracketed placeholders like "[insert percentage]" or "[X%]". Use complete factual statements.
4. Keep it punchy and concise (15-25 words max).
5. Return ONLY valid JSON format:
{ "enhancedBullet": "The polished single bullet text here." }
Language: ${language}. SessionID: ${uniqueSeed}`;
    } else if (endpointName === 'autocomplete') {
        const type = payload.type || 'jobTitle';
        const query = payload.query || '';
        prompt = `You are a professional resume autocomplete engine.
Provide a list of 5 standard, modern, ATS-friendly suggestions for the ${type} input starting with or matching "${query}".
${type === 'skill' ? 'Return only professional skills and tools.' : ''}
${type === 'degree' ? 'Return only academic degrees (e.g., Bachelor of Science in Computer Science).' : ''}
${type === 'school' ? 'Return only universities/schools.' : ''}
${type === 'city' ? 'Return only City, State, Country format (e.g. Visakhapatnam, Andhra Pradesh, India or San Francisco, CA, United States). ALWAYS include the full official Country name.' : ''}
${type === 'company' ? 'Return only real company names.' : ''}
${type === 'jobTitle' ? 'Return only professional job titles.' : ''}
${type === 'certification' ? 'Return only official industry-recognized professional certification names (e.g. AWS Certified Solutions Architect, PMP, Certified Scrum Master, Google Analytics, CompTIA Security+, Six Sigma Green Belt). Return the FULL official credential title.' : ''}
${type === 'certificationIssuer' ? 'Return only official certification issuing organizations (e.g. Amazon Web Services, PMI, Scrum Alliance, Google, Microsoft, CompTIA, EC-Council). Return ONLY the organization name.' : ''}
${type === 'language' ? 'Return only world language names (e.g. English, Hindi, Spanish, French, Telugu, Tamil, German, Mandarin, Arabic). Return ONLY the language name.' : ''}

Keep each suggestion concise and professional.
Return ONLY valid JSON format:
{ "suggestions": ["Option 1", "Option 2", "Option 3", "Option 4", "Option 5"] }
SessionID: ${uniqueSeed}`;
    } else {
        prompt = `You are a Master Resume Strategist. Generate complete ATS-optimized resume profile content for candidate role "${payload.jobTitle || payload.occupation || 'Professional'}" at "${payload.employer || 'Company'}". Language: ${language}. Return ONLY JSON. SessionID: ${uniqueSeed}`;
    }
    return { prompt, payload };
}

function sanitizeControlCharsInJson(jsonStr) {
    let result = '';
    let inString = false;
    let escaped = false;
    for (let i = 0; i < jsonStr.length; i++) {
        const c = jsonStr[i];
        if (escaped) {
            result += c;
            escaped = false;
            continue;
        }
        if (c === '\\') {
            result += c;
            escaped = true;
            continue;
        }
        if (c === '"') {
            inString = !inString;
            result += c;
            continue;
        }
        if (inString) {
            if (c === '\n') { result += '\\n'; continue; }
            if (c === '\r') { result += '\\r'; continue; }
            if (c === '\t') { result += '\\t'; continue; }
        }
        result += c;
    }
    return result;
}

function extractJson(raw) {
    const cleaned = String(raw || '').replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    if (!cleaned) return null;
    try { return JSON.parse(cleaned); } catch {}
    try { return JSON.parse(sanitizeControlCharsInJson(cleaned)); } catch {}
    const start = cleaned.indexOf('{');
    if (start < 0) return null;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < cleaned.length; index += 1) {
        const character = cleaned[index];
        if (escaped) { escaped = false; continue; }
        if (character === '\\') { escaped = true; continue; }
        if (character === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (character === '{') depth += 1;
        else if (character === '}' && --depth === 0) {
            const candidate = cleaned.slice(start, index + 1);
            try { return JSON.parse(candidate); } catch {}
            try { return JSON.parse(sanitizeControlCharsInJson(candidate)); } catch { return null; }
        }
    }
    return null;
}

function sanitizeGeneratedText(value) {
    return compact(value, 10000)
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<[^>]*>/g, '')
        .replace(/\s*(?:MODIFIED BULLET|MODIFICATIONS|REASONING|EXPLANATION|NOTE|CHANGES MADE):[\s\S]*/gi, '')
        .replace(/\bSpearheaded\b/g, 'Led').replace(/\bspearheaded\b/g, 'led')
        .replace(/\bLeveraged\b/g, 'Used').replace(/\bleveraged\b/g, 'used')
        .replace(/\bUtili[sz]ed\b/g, 'Used').replace(/\butili[sz]ed\b/g, 'used')
        .replace(/\[insert[^\]]*\]|\[X%?\]|\[[^\]]{1,60}\]/gi, '')
        .replace(/\s{2,}/g, ' ').replace(/\s+,/g, ',').replace(/\s+\./g, '.').replace(/,\s*\./g, '.')
        .trim();
}

function normalizeStrings(value) {
    const items = Array.isArray(value) ? value : typeof value === 'string' ? value.split('\n') : value && typeof value === 'object' ? [value] : [];
    return items.map(item => {
        if (item && typeof item === 'object') item = item.bulletPoint || item.text || item.suggestion || item.bullet || item.highlight || item.skill || item.name || Object.values(item)[0];
        return sanitizeGeneratedText(String(item || '').replace(/^[•\-*\d.\s]+/, ''));
    }).filter(Boolean);
}

function cleanSkillName(raw) {
    return sanitizeGeneratedText(typeof raw === 'object' ? raw.name || raw.skill || raw.title || '' : raw)
        .replace(/\s*\((?:e\.?g\.?|eg|example|such as|like)[^)]*\)/gi, '')
        .replace(/\s*\([^)]*,[^)]*\)/g, '').trim();
}

function parseAiResponse(operation, rawContent, context = {}) {
    const raw = String(rawContent || '').slice(0, 100000);
    if (!raw) throw Object.assign(new Error('AI provider returned an empty response'), { code: 'EMPTY_AI_RESPONSE' });
    const sourceText = operation === 'check-grammar' ? String(context.sourceText ?? '') : raw;
    const parsed = extractJson(raw);
    if (operation === 'generate-summary') {
        const value = parsed?.summary || parsed?.description || parsed?.text || (!parsed ? raw : '');
        const summary = sanitizeGeneratedText(typeof value === 'object' ? Object.values(value).join(' ') : value);
        if (summary) return { summary };
    }
    if (operation === 'generate-skills') {
        const values = parsed?.skills || parsed?.competencies || parsed?.keywords || parsed?.items || (!parsed ? raw.split(/[,;\n]/) : []);
        const skills = (Array.isArray(values) ? values : []).slice(0, 15).map((item, index) => {
            const category = item?.category || item?.type;
            return {
                name: cleanSkillName(item),
                category: ['mandatory', 'recommended'].includes(category) ? category : (index < 6 ? 'mandatory' : 'recommended'),
            };
        }).filter(item => item.name);
        if (skills.length) return { skills };
    }
    if (operation === 'generate-certifications') {
        const values = parsed?.certifications || parsed?.certs || parsed?.items;
        const certifications = (Array.isArray(values) ? values : []).slice(0, 8).map((item, index) => {
            const category = item?.category || item?.type;
            return {
                title: sanitizeGeneratedText(typeof item === 'string' ? item : item?.title || item?.name || item?.certification),
                issuer: sanitizeGeneratedText(typeof item === 'object' ? item?.issuer || item?.organization || item?.issuingBody || item?.authority : ''),
                category: ['mandatory', 'recommended'].includes(category) ? category : (index < 3 ? 'mandatory' : 'recommended'),
            };
        }).filter(item => item.title);
        if (certifications.length) return { certifications };
    }
    if (operation === 'enhance-single-bullet') {
        const enhancedBullet = sanitizeGeneratedText(parsed?.enhancedBullet || parsed?.suggestion || parsed?.bullet || parsed?.suggestions?.[0] || (!parsed ? raw : ''));
        if (enhancedBullet) return { enhancedBullet };
    }
    if (['generate-work-description', 'generate-education-description', 'autocomplete'].includes(operation)) {
        const values = parsed?.suggestions || parsed?.highlights || parsed?.bullets || parsed?.items || parsed?.workDescriptions || (!parsed ? raw : []);
        const suggestions = normalizeStrings(values).slice(0, operation === 'autocomplete' ? 8 : 6);
        if (suggestions.length) return { suggestions };
    }
    if (operation === 'check-grammar') {
        const corrections = Array.isArray(parsed?.corrections) ? parsed.corrections : [];
        const validCorrections = corrections.slice(0, 10).map(item => {
            if (!item || typeof item !== 'object') return null;
            const original = String(item.original ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, 1000);
            const suggestion = compact(item.suggestion, 1000);
            const explanation = compact(item.explanation, 1000);
            const type = GRAMMAR_TYPES.has(String(item.type || '').toLowerCase()) ? String(item.type).toLowerCase() : 'grammar';
            const start = Number(item.startIndex);
            const end = Number(item.endIndex);
            if (!original || !suggestion || original === suggestion || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > sourceText.length) return null;
            if (sourceText.slice(start, end) !== original) return null;
            return { original, suggestion, type, explanation, startIndex: start, endIndex: end };
        }).filter(Boolean).filter((item, index, items) => items.findIndex(other => other.startIndex === item.startIndex && other.endIndex === item.endIndex) === index);
        return {
            hasErrors: typeof parsed?.hasErrors === 'boolean' ? parsed.hasErrors : validCorrections.length > 0,
            corrections: validCorrections,
            overallSuggestion: compact(parsed?.overallSuggestion, 1000) || (validCorrections.length ? `Found ${validCorrections.length} issues to review.` : 'Text appears to be well-written.'),
        };
    }
    throw Object.assign(new Error('AI provider response did not match the product contract'), { code: 'INVALID_AI_RESPONSE' });
}

function cloneConfiguration(configuration) {
    return {
        ...configuration,
        providers: Object.fromEntries(Object.entries(configuration.providers).map(([provider, value]) => [provider, { ...value }])),
    };
}

function clearProviderConfigurationCache(db) {
    if (db) configurationCache.delete(db);
}

async function loadProviderConfiguration(db, environment = process.env) {
    const cached = db && configurationCache.get(db);
    if (cached && cached.expiresAt > Date.now()) return cloneConfiguration(cached.configuration);
    let secrets = {};
    let publicAi = {};
    let legacyAi = {};
    if (db) {
        const [secretResult, publicResult, legacyResult] = await Promise.allSettled([
            db.collection('settings').doc('ai_providers').get(),
            db.collection('data').doc('public_config').get(),
            db.collection('data').doc('system_settings').get(),
        ]);
        if (secretResult.status === 'fulfilled' && secretResult.value.exists) secrets = secretResult.value.data() || {};
        if (publicResult.status === 'fulfilled' && publicResult.value.exists) publicAi = publicResult.value.data()?.ai || {};
        // Read-only server migration compatibility. Legacy secrets are never returned to clients.
        if (legacyResult.status === 'fulfilled' && legacyResult.value.exists) legacyAi = legacyResult.value.data()?.ai || {};
    }
    const effectiveAi = { ...legacyAi, ...publicAi };
    const legacySecretFields = { gemini: 'geminiApiKey', nvidia: 'nvidiaApiKey', openai: 'openaiApiKey', groq: 'groqApiKey', openrouter: 'openrouterApiKey', deepseek: 'deepseekApiKey' };
    const providers = {};
    for (const provider of PROVIDERS) {
        const key = String(environment[ENV_KEYS[provider]] || secrets[provider]?.apiKey || legacyAi[legacySecretFields[provider]] || '').trim();
        const configuredModel = environment[ENV_MODELS[provider]] || secrets[provider]?.model || effectiveAi[MODEL_FIELDS[provider]];
        providers[provider] = {
            key,
            model: safeModel(configuredModel, PROVIDER_DEFAULTS[provider].model),
            enabled: effectiveAi[ENABLE_FIELDS[provider]] !== false && Boolean(key),
        };
    }
    const configuration = {
        primary: PROVIDERS.includes(effectiveAi.provider) ? effectiveAi.provider : 'gemini',
        enableFallback: effectiveAi.enableFallback !== false,
        temperature: clampNumber(effectiveAi.temperature, 0, 1, 0.7),
        maxTokens: Math.floor(clampNumber(effectiveAi.maxTokens, 256, 4096, 2048)),
        providers,
    };
    if (db) configurationCache.set(db, { configuration, expiresAt: Date.now() + CONFIGURATION_CACHE_MS });
    return cloneConfiguration(configuration);
}

function providerOrder(configuration) {
    const enabled = PROVIDERS.filter(provider => configuration.providers[provider]?.enabled);
    if (!enabled.length) return [];
    const primary = enabled.includes(configuration.primary) ? configuration.primary : enabled[0];
    return configuration.enableFallback ? [primary, ...enabled.filter(provider => provider !== primary)] : [primary];
}

async function fetchWithDeadline(fetchImpl, url, options, timeoutMs, externalSignal) {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort(Object.assign(new Error(`AI provider timeout (${timeoutMs}ms)`), { name: 'TimeoutError', code: 'AI_PROVIDER_TIMEOUT' }));
    }, timeoutMs);
    const abort = () => controller.abort(externalSignal.reason);
    if (externalSignal) {
        if (externalSignal.aborted) abort();
        else externalSignal.addEventListener('abort', abort, { once: true });
    }
    try {
        return await fetchImpl(url, { ...options, signal: controller.signal });
    } catch (err) {
        if (timedOut && !externalSignal?.aborted) {
            throw Object.assign(new Error(`AI provider timed out (${timeoutMs}ms)`), { status: 504, code: 'AI_PROVIDER_TIMEOUT' });
        }
        throw err;
    } finally {
        clearTimeout(timeout);
        externalSignal?.removeEventListener('abort', abort);
    }
}

function extractProviderErrorMessage(body, status, provider) {
    if (!body) return `${provider} HTTP ${status}`;
    if (typeof body.error === 'string' && body.error.trim()) return body.error.trim();
    if (typeof body.error?.message === 'string' && body.error.message.trim()) return body.error.message.trim();
    if (typeof body.message === 'string' && body.message.trim()) return body.message.trim();
    if (typeof body.detail === 'string' && body.detail.trim()) return body.detail.trim();
    return `${provider} HTTP ${status}`;
}

async function requestProvider(provider, providerConfig, prompt, generation, { fetchImpl = global.fetch, signal, timeoutMs = 30000 } = {}) {
    if (provider === 'gemini') {
        const model = providerConfig.model.startsWith('models/') ? providerConfig.model : `models/${providerConfig.model}`;
        const url = `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${encodeURIComponent(providerConfig.key)}`;
        const response = await fetchWithDeadline(fetchImpl, url, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: generation.temperature, maxOutputTokens: generation.maxTokens },
            }),
        }, timeoutMs, signal);
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw Object.assign(new Error(extractProviderErrorMessage(body, response.status, 'Gemini')), { status: response.status });
        const content = body.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || '';
        if (!content.trim()) throw Object.assign(new Error('Empty content received from Gemini provider'), { status: 502, code: 'EMPTY_PROVIDER_RESPONSE' });
        return content;
    }
    const defaults = PROVIDER_DEFAULTS[provider];
    const candidateModels = [providerConfig.model];
    if (provider === 'nvidia' && providerConfig.model !== 'meta/llama-3.1-8b-instruct') {
        candidateModels.push('meta/llama-3.1-8b-instruct');
    }

    let lastError = null;
    for (let i = 0; i < candidateModels.length; i++) {
        const currentModel = candidateModels[i];
        const isLastCandidate = (i === candidateModels.length - 1);
        const candidateTimeoutMs = isLastCandidate ? timeoutMs : Math.min(timeoutMs, 6000);
        try {
            const headers = { Authorization: `Bearer ${providerConfig.key}`, 'Content-Type': 'application/json' };
            if (provider === 'openrouter') {
                headers['HTTP-Referer'] = 'https://airesume.projectdemo.guru';
                headers['X-Title'] = 'ResumePilot AI';
            }
            const response = await fetchWithDeadline(fetchImpl, defaults.url, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    model: currentModel,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: generation.temperature,
                    max_tokens: generation.maxTokens,
                }),
            }, candidateTimeoutMs, signal);
            const body = await response.json().catch(() => ({}));
            if (!response.ok) {
                const errMsg = extractProviderErrorMessage(body, response.status, provider);
                const isRetryable = response.status === 503 || response.status === 404 || /ResourceExhausted|Worker local total request limit/i.test(errMsg);
                if (isRetryable && !isLastCandidate) {
                    console.warn(`[AI Model Failover] ${provider} model ${currentModel} error (${errMsg}); retrying with ${candidateModels[candidateModels.length - 1]}`);
                    lastError = Object.assign(new Error(errMsg), { status: response.status });
                    continue;
                }
                throw Object.assign(new Error(errMsg), { status: response.status });
            }
            const content = body.choices?.[0]?.message?.content || '';
            if (!content.trim()) throw Object.assign(new Error(`Empty content received from ${provider} provider`), { status: 502, code: 'EMPTY_PROVIDER_RESPONSE' });
            return content;
        } catch (err) {
            lastError = err;
            if (signal?.aborted) throw err;
            if (!isLastCandidate) {
                console.warn(`[AI Model Failover] ${provider} model ${currentModel} timed out or failed (${err.message}); retrying with fallback model...`);
                continue;
            }
            throw err;
        }
    }
    throw lastError;
}

async function generateWithProviders({ prompt, configuration, operation, fetchImpl, signal, timeoutMs }) {
    const order = providerOrder(configuration);
    if (!order.length) throw Object.assign(new Error('No AI provider is configured'), { code: 'AI_PROVIDER_UNAVAILABLE', status: 503 });
    const failures = [];
    for (const provider of order) {
        try {
            const raw = await requestProvider(provider, configuration.providers[provider], prompt, configuration, { fetchImpl, signal, timeoutMs });
            return { raw, provider, model: configuration.providers[provider].model };
        } catch (error) {
            console.error(`[AI Provider Failure] operation=${operation || 'unknown'} provider=${provider} error=${error.message}`);
            if (signal?.aborted) throw error;
            failures.push({ provider, status: Number(error.status) || 0, code: error.code || 'PROVIDER_ERROR', message: error.message });
        }
    }
    const error = Object.assign(new Error('All configured AI providers failed'), { code: 'AI_PROVIDER_ERROR', status: 502 });
    error.failures = failures;
    error.operation = operation;
    throw error;
}

async function executeContentOperation({ operation, payload, db, environment, fetchImpl, signal, requestId }) {
    const { prompt } = buildLegacyPrompt(operation, payload, { sessionId: requestId });
    const configuration = await loadProviderConfiguration(db, environment);
    const generated = await generateWithProviders({ prompt, configuration, operation, fetchImpl, signal });
    return { data: parseAiResponse(operation, generated.raw), provider: generated.provider, model: generated.model };
}

function buildResumeParsingPrompt(rawText) {
    const text = compact(rawText, 40000);
    if (!text) throw Object.assign(new Error('Resume text is required'), { code: 'INVALID_RESUME_TEXT', status: 400 });
    return `Extract all resume data from the text into a valid JSON object following this exact schema:
{
  "firstname": "string", "lastname": "string", "email": "string", "phone": "string",
  "occupation": "string (role title only, no company)", "city": "string", "country": "string",
  "address": "string", "postalcode": "string", "summary": "<p>Professional summary</p>",
  "employments": [{ "jobTitle": "string", "employer": "string", "city": "string", "startDate": "string", "endDate": "string", "description": "<p>bullet 1</p><p>bullet 2</p>" }],
  "educations": [{ "school": "string", "degree": "string", "city": "string", "startDate": "string", "endDate": "string", "description": "string" }],
  "skills": [{ "skillName": "string", "rating": 85 }],
  "languages": [{ "language": "string", "level": "Fluent" }]
}
STRICT RULES:
1. Return ONLY the raw JSON object. No markdown fences and no commentary.
2. Separate jobTitle and employer into distinct fields.
3. Wrap all work description bullets in individual <p> tags.
4. If a field is missing, use an empty string. Never skip employments, educations, or skills.
RESUME TEXT:
"""
${text}
"""`;
}

async function executeResumeParsing({ rawText, db, environment, fetchImpl, signal }) {
    const prompt = buildResumeParsingPrompt(rawText);
    const configuration = await loadProviderConfiguration(db, environment);
    configuration.temperature = 0.15;
    configuration.maxTokens = 4096;
    const generated = await generateWithProviders({ prompt, configuration, operation: 'parse-resume', fetchImpl, signal, timeoutMs: 45000 });
    const data = extractJson(generated.raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw Object.assign(new Error('AI resume response did not match the product contract'), { code: 'INVALID_AI_RESPONSE', status: 502 });
    }
    return { data, provider: generated.provider, model: generated.model };
}

module.exports = {
    AUTOCOMPLETE_TYPES,
    CONTENT_OPERATIONS,
    PROVIDERS,
    buildLegacyPrompt,
    buildResumeParsingPrompt,
    clearProviderConfigurationCache,
    executeContentOperation,
    executeResumeParsing,
    extractJson,
    generateWithProviders,
    loadProviderConfiguration,
    parseAiResponse,
    providerOrder,
    requestProvider,
    validateOperation,
};
