import { getSystemSettings } from '../firestore/dbOperations.js';
import { extractHeuristicResumeData, normalizeRawDataToTempJson } from './resumeFieldMapper.js';

/**
 * Utility to scrub parenthetical examples like "(e.g. Google Ad Manager)" from skill strings
 */
export function cleanSkillName(raw) {
    if (!raw) return '';
    let text = typeof raw === 'string' ? raw : (raw.name || raw.title || String(raw));
    
    // Strip out (e.g. ...) or (eg ...) or (example ...) or (such as ...)
    text = text.replace(/\s*\((?:e\.?g\.?|eg|example|such as|like)[^\)]*\)/gi, '');
    // Strip parenthetical lists containing commas
    text = text.replace(/\s*\([^)]*,[^)]*\)/g, '');
    // Strip empty parens
    text = text.replace(/\(\s*\)/g, '');
    // Strip surrounding quotes
    text = text.replace(/^["']|["']$/g, '');
    return text.trim();
}

/**
 * Dynamic Model Resolver: Accepts ANY custom model string configured in Admin Settings.
 * If empty or legacy invalid string ('poolside/laguna-xs-2.1'), falls back to active provider defaults.
 */
export function resolveDynamicModel(provider, aiConfig = {}) {
    const custom = (val) => (typeof val === 'string' && val.trim().length > 0 && val.trim() !== 'poolside/laguna-xs-2.1') ? val.trim() : null;

    switch (provider) {
        case 'nvidia':
            return custom(aiConfig.nvidiaModel) || 'meta/llama-3.1-8b-instruct';
        case 'gemini':
            return custom(aiConfig.model) || custom(aiConfig.geminiModel) || 'gemini-2.0-flash';
        case 'openai':
            return custom(aiConfig.openaiModel) || 'gpt-4o-mini';
        case 'groq':
            return custom(aiConfig.groqModel) || 'llama-3.3-70b-versatile';
        case 'openrouter':
            return custom(aiConfig.openrouterModel) || 'meta-llama/llama-3.3-70b-instruct:free';
        case 'deepseek':
            return custom(aiConfig.deepseekModel) || 'deepseek-chat';
        case 'ollama':
            return custom(aiConfig.ollamaModel) || 'llama3';
        default:
            return custom(aiConfig.model) || 'meta/llama-3.1-8b-instruct';
    }
}

/**
 * Universal User-Side AI Content Generator
 * Direct execution via live AI engine (NVIDIA / Gemini / OpenAI / Groq / OpenRouter)
 */
export async function generateUserAiContent(endpointName, payload) {
    let settings = {};
    try {
        settings = await getSystemSettings();
    } catch (e) {
        console.warn('Could not load system settings from Firestore, using local defaults', e);
    }

    const aiConfig = settings?.ai || {};
    const activeProvider = aiConfig.provider || 'nvidia';

    const nvidiaApiKey = (aiConfig.nvidiaApiKey || import.meta.env.VITE_NVIDIA_API_KEY || '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').trim();
    const nvidiaModel = resolveDynamicModel('nvidia', aiConfig);

    const geminiApiKey = (aiConfig.geminiApiKey || import.meta.env.VITE_GEMINI_API_KEY || '').trim();
    const geminiModel = resolveDynamicModel('gemini', aiConfig);

    const openaiApiKey = (aiConfig.openaiApiKey || import.meta.env.VITE_OPENAI_API_KEY || '').trim();
    const openaiModel = resolveDynamicModel('openai', aiConfig);

    const groqApiKey = (aiConfig.groqApiKey || import.meta.env.VITE_GROQ_API_KEY || '').trim();
    const groqModel = resolveDynamicModel('groq', aiConfig);

    const openrouterApiKey = (aiConfig.openrouterApiKey || import.meta.env.VITE_OPENROUTER_API_KEY || '').trim();
    const openrouterModel = resolveDynamicModel('openrouter', aiConfig);

    // Boolean flags matching Admin Panel settings toggles
    const isNvidiaEnabled = aiConfig.enableNvidia !== false && !!nvidiaApiKey;
    const isGeminiEnabled = aiConfig.enableGemini !== false && !!geminiApiKey;
    const isOpenaiEnabled = aiConfig.enableOpenai !== false && !!openaiApiKey;
    const isGroqEnabled = aiConfig.enableGroq !== false && !!groqApiKey;
    const isOpenrouterEnabled = aiConfig.enableOpenrouter !== false && !!openrouterApiKey;

    const language = payload.language || localStorage.getItem('preferredLanguage') || 'en';

    // Construct highly tailored ATS-optimized prompt
    let prompt = '';
    const focusPill = payload.focusTone ? `Focus Area: ${payload.focusTone}.` : 'Focus Area: High-impact quantifiable metrics and leadership.';
    const locationInfo = payload.city ? ` Location/Branch: ${payload.city}.` : '';
    const uniqueSeed = Date.now().toString(36);

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

        prompt = `You are a Fortune 500 Senior Executive Recruiter & Resume Strategist.
Synthesize this candidate's background into a crisp, 10/10 human-written, ATS-optimized Executive Resume Summary (2-3 punchy sentences, 50-70 words maximum).

CANDIDATE PROFILE DETAILS:
- Candidate Name: ${payload.name || 'Professional'}
- Primary Role/Occupation: "${payload.jobTitle || payload.occupation || 'Professional'}"
- Calculated Experience Span: ${yearsText}
${workHistText ? `- Work History & Roles: ${workHistText}` : ''}
${eduText ? `- Academic Education: ${eduText}` : ''}
${skillsText ? `- Core Technical Skills: ${skillsText}` : ''}
${certsText ? `- Professional Certifications & Accreditations: ${certsText}` : ''}
${projText ? `- Major Projects & Accomplishments: ${projText}` : ''}

STRICT 10/10 NATURAL HUMAN VOICE & ATS RULES:
1. PUNCHY 2-3 SENTENCE RESUME STRUCTURE:
   - Sentence 1: Start directly with candidate identity and primary domains (e.g., "${payload.jobTitle || 'Full-Stack Engineer'} with ${yearsText} of experience specializing in Full-Stack Engineering, Cloud Architecture, and DevOps.").
   - Sentence 2: Summarize actual work accomplishments derived ONLY from their work history (e.g., "Demonstrated track record modernizing API architectures, optimizing database performance, and automating CI/CD pipelines.").
   - Sentence 3: Highlight core technical competencies, key certifications, and specialized industry focus (e.g., "Proficient in Node.js, React, and AWS cloud solutions with a strong focus on high-availability system scalability.").
2. STRICT BAN ON COVER LETTER FLUFF & FLAP:
   - NEVER use cover-letter phrasing such as "I would bring immediate strategic value to your organization", "make a tangible impact from day one", or "leveraging my expertise to drive business growth". This is a RESUME SUMMARY, NOT a cover letter!
3. STRICT BAN ON ROBOTIC AI CLICHÉS:
   - BAN these AI phrases completely: "seasoned professional", "proven track record of", "resulting in significant performance gains", "spearheaded", "leveraged", "utilize", "fostered", "tapestry", "beacon", "testament".
4. STRICT ROLE ALIGNMENT: Do NOT mix up engineering roles with unrelated business titles (like Account Manager). Focus 100% on "${payload.jobTitle || payload.occupation || 'Professional'}".
5. NO BRACKETS OR PLACEHOLDERS. Write clean, 100% complete sentences.

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

    // Helper: extract JSON from AI response (robust)
    function extractJson(raw) {
        if (!raw) return null;
        let cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
        try { return JSON.parse(cleaned); } catch (_) { }

        const firstBrace = cleaned.indexOf('{');
        if (firstBrace !== -1) {
            // Match exact closing brace for first JSON object
            let depth = 0;
            let inString = false;
            let isEscaped = false;
            for (let i = firstBrace; i < cleaned.length; i++) {
                const char = cleaned[i];
                if (isEscaped) {
                    isEscaped = false;
                    continue;
                }
                if (char === '\\') {
                    isEscaped = true;
                    continue;
                }
                if (char === '"') {
                    inString = !inString;
                    continue;
                }
                if (!inString) {
                    if (char === '{') depth++;
                    else if (char === '}') {
                        depth--;
                        if (depth === 0) {
                            const jsonCandidate = cleaned.substring(firstBrace, i + 1);
                            try { return JSON.parse(jsonCandidate); } catch (_) { }
                            break;
                        }
                    }
                }
            }

            const lastBrace = cleaned.lastIndexOf('}');
            if (lastBrace > firstBrace) {
                try { return JSON.parse(cleaned.substring(firstBrace, lastBrace + 1)); } catch (_) { }
            }
        }
        return null;
    }

    // Helper: parse response into standard shapes with fallbacks & GUARANTEED STRING PRIMITIVES
    function parseAiResponse(rawContent) {
        if (!rawContent || typeof rawContent !== 'string') return null;
        const parsed = extractJson(rawContent);

        // Post-processing filter to completely sanitize and replace forbidden resume buzzwords/AI clichés
        const sanitizeBulletText = (text) => {
            if (!text || typeof text !== 'string') return text;
            let cleaned = text;

            // Strip any raw trailing JSON or AI explanation headers if leaked into output
            cleaned = cleaned.replace(/\{\s*"enhancedBullet"\s*:\s*"([^"]+)"\s*\}[\s\S]*/gi, '$1');
            cleaned = cleaned.replace(/\s*(?:MODIFIED BULLET|MODIFICATIONS|REASONING|EXPLANATION|NOTE|CHANGES MADE):[\s\S]*/gi, '');

            // Scrub "Spearheaded"
            cleaned = cleaned.replace(/^Spearheaded\b/g, 'Led');
            cleaned = cleaned.replace(/^spearheaded\b/g, 'led');
            cleaned = cleaned.replace(/\bspearheaded\b/g, 'led');
            cleaned = cleaned.replace(/\bSpearheaded\b/g, 'Led');
            cleaned = cleaned.replace(/\bspearhead\b/g, 'lead');
            cleaned = cleaned.replace(/\bSpearhead\b/g, 'Lead');

            // Scrub "Leveraged"
            cleaned = cleaned.replace(/^Leveraged\b/g, 'Used');
            cleaned = cleaned.replace(/^leveraged\b/g, 'used');
            cleaned = cleaned.replace(/\bleveraged\b/g, 'used');
            cleaned = cleaned.replace(/\bLeveraged\b/g, 'Used');
            cleaned = cleaned.replace(/\bleverage\b/g, 'use');
            cleaned = cleaned.replace(/\bLeverage\b/g, 'Use');

            // Scrub "Utilized" / "Utilised"
            cleaned = cleaned.replace(/^Utilized\b/g, 'Used');
            cleaned = cleaned.replace(/^utilized\b/g, 'used');
            cleaned = cleaned.replace(/\butilized\b/g, 'used');
            cleaned = cleaned.replace(/\bUtilized\b/g, 'Used');

            cleaned = cleaned.replace(/^Utilised\b/g, 'Used');
            cleaned = cleaned.replace(/^utilised\b/g, 'used');
            cleaned = cleaned.replace(/\butilised\b/g, 'used');
            cleaned = cleaned.replace(/\bUtilised\b/g, 'Used');

            cleaned = cleaned.replace(/\butilize\b/g, 'use');
            cleaned = cleaned.replace(/\butilise\b/g, 'use');
            cleaned = cleaned.replace(/\bUtilize\b/g, 'Use');
            cleaned = cleaned.replace(/\bUtilise\b/g, 'Use');

            // Scrub bracketed placeholders like [insert actual percentage or number], [insert original time], [X%]
            cleaned = cleaned.replace(/\[insert[^\]]*\]/gi, '');
            cleaned = cleaned.replace(/\[X%?\]/gi, '');
            cleaned = cleaned.replace(/\[[^\]]{1,60}\]/g, ''); // Scrub remaining bracketed prompt instructions
            cleaned = cleaned.replace(/\s{2,}/g, ' '); // Collapse multiple spaces
            cleaned = cleaned.replace(/\s+,/g, ','); // Fix trailing spaces before commas
            cleaned = cleaned.replace(/\s+\./g, '.'); // Fix trailing spaces before periods
            cleaned = cleaned.replace(/,\s*\./g, '.'); // Fix dangling comma before period

            return cleaned.trim();
        };

        const normalizeToStrings = (arr) => {
            if (!Array.isArray(arr)) {
                if (typeof arr === 'string') return arr.split('\n').map((s) => sanitizeBulletText(s.replace(/^[•\-\*\d\.\s]+/, '').trim())).filter(Boolean);
                if (typeof arr === 'object' && arr !== null) return [sanitizeBulletText(Object.values(arr).join(' '))];
                return [];
            }
            return arr.map((item) => {
                if (item === null || item === undefined) return '';
                if (typeof item === 'string') return sanitizeBulletText(item.replace(/^[•\-\*\d\.\s]+/, '').trim());
                if (typeof item === 'object') {
                    const val = item.bulletPoint || item.text || item.suggestion || item.bullet || item.highlight || item.skill || item.name || Object.values(item)[0] || '';
                    return sanitizeBulletText(String(val).replace(/^[•\-\*\d\.\s]+/, '').trim());
                }
                return sanitizeBulletText(String(item).trim());
            }).filter((s) => s.length > 0);
        };

        if (parsed) {
            if (endpointName === 'generate-summary') {
                const summaryVal = parsed.summary || parsed.description || parsed.text || (typeof parsed === 'string' ? parsed : null);
                if (summaryVal) {
                    return { summary: sanitizeBulletText(typeof summaryVal === 'object' ? Object.values(summaryVal).join(' ') : String(summaryVal).trim()) };
                }
            }
            if (endpointName === 'generate-skills') {
                const skillsArr = parsed.skills || parsed.competencies || parsed.keywords || parsed.items;
                if (skillsArr && Array.isArray(skillsArr)) {
                    const cleanedSkills = skillsArr.map((s, idx) => {
                        if (typeof s === 'string') return { name: cleanSkillName(s), category: idx < 6 ? 'mandatory' : 'recommended' };
                        if (typeof s === 'object' && s !== null) {
                            return {
                                name: cleanSkillName(s.name || s.skill || s.title || Object.values(s)[0] || ''),
                                category: s.category || s.type || (idx < 6 ? 'mandatory' : 'recommended')
                            };
                        }
                        return { name: cleanSkillName(String(s)), category: 'recommended' };
                    }).filter(s => s.name.length > 0);
                    return { skills: cleanedSkills };
                }
            }
            if (endpointName === 'generate-certifications') {
                const certsArr = parsed.certifications || parsed.certs || parsed.items;
                if (certsArr && Array.isArray(certsArr)) {
                    const cleanedCerts = certsArr.map((c, idx) => {
                        if (typeof c === 'string') return { title: sanitizeBulletText(c), issuer: '', category: idx < 3 ? 'mandatory' : 'recommended' };
                        if (typeof c === 'object' && c !== null) {
                            return {
                                title: sanitizeBulletText(c.title || c.name || c.certification || Object.values(c)[0] || ''),
                                issuer: sanitizeBulletText(c.issuer || c.organization || c.issuingBody || c.authority || ''),
                                category: c.category || c.type || (idx < 3 ? 'mandatory' : 'recommended')
                            };
                        }
                        return { title: String(c), issuer: '', category: 'recommended' };
                    }).filter(c => c.title.length > 0);
                    return { certifications: cleanedCerts };
                }
            }
            if (endpointName === 'enhance-single-bullet') {
                const text = parsed.enhancedBullet || parsed.suggestion || parsed.bullet || (Array.isArray(parsed.suggestions) ? parsed.suggestions[0] : null);
                if (text) return { enhancedBullet: sanitizeBulletText(text) };
            }
            if (endpointName === 'generate-work-description' || endpointName === 'generate-education-description') {
                const items = parsed.suggestions || parsed.highlights || parsed.bullets || parsed.items || parsed.workDescriptions;
                if (items) {
                    return { suggestions: normalizeToStrings(items) };
                }
            }
            if (parsed.enhancedBullet) return { enhancedBullet: sanitizeBulletText(parsed.enhancedBullet) };
            if (parsed.certifications) return { certifications: parsed.certifications };
            if (parsed.suggestions) return { suggestions: normalizeToStrings(parsed.suggestions) };
            if (parsed.summary) return { summary: sanitizeBulletText(typeof parsed.summary === 'object' ? Object.values(parsed.summary).join(' ') : String(parsed.summary).trim()) };
            if (parsed.skills) return { skills: normalizeToStrings(parsed.skills) };
        }

        // Text fallback parsing when JSON syntax is missing or cut off
        const lines = rawContent.split('\n')
            .map((l) => sanitizeBulletText(l.replace(/^[•\-\*\d\.\s]+/, '').trim()))
            .filter((l) => l.length > 5);

        if (endpointName === 'enhance-single-bullet') {
            return { enhancedBullet: sanitizeBulletText(rawContent.replace(/^```[a-z]*\s*/i, '').replace(/```$/i, '').trim()) };
        }

        if (endpointName === 'generate-summary') {
            return { summary: sanitizeBulletText(rawContent.replace(/^```[a-z]*\s*/i, '').replace(/```$/i, '').trim()) };
        }
        if (endpointName === 'generate-skills') {
            const skills = rawContent.split(/[,;\n]/)
                .map((s) => s.replace(/^[•\-\*\d\.\s]+/, '').trim())
                .filter((s) => s.length > 1);
            return { skills: skills.slice(0, 15) };
        }
        if (lines.length > 0) {
            return { suggestions: lines.slice(0, 6) };
        }
        return { suggestions: [sanitizeBulletText(rawContent)] };
    }

    // Helper: Fetch NVIDIA API with proxy and CORS fallback
    async function fetchNvidiaWithFallback(options) {
        const urls = [];
        if (typeof window !== 'undefined') {
            urls.push(`${window.location.origin}/nvidia-proxy.php`);
            urls.push(`${window.location.origin}/public/nvidia-proxy.php`);
            urls.push('/api/nvidia/v1/chat/completions');
        }
        urls.push('https://integrate.api.nvidia.com/v1/chat/completions');

        for (const url of urls) {
            try {
                const res = await fetch(url, options);
                if (res.ok) return res;
            } catch (_) {}
        }
        return fetch('https://integrate.api.nvidia.com/v1/chat/completions', options);
    }

    // Try providers in order
    const providers = [];
    if (activeProvider === 'nvidia' && isNvidiaEnabled) providers.push('nvidia');
    if (activeProvider === 'gemini' && isGeminiEnabled) providers.push('gemini');
    if (activeProvider === 'openai' && isOpenaiEnabled) providers.push('openai');
    if (activeProvider === 'groq' && isGroqEnabled) providers.push('groq');
    if (activeProvider === 'openrouter' && isOpenrouterEnabled) providers.push('openrouter');

    // Add remaining available providers as fallbacks if enabled
    if (isNvidiaEnabled && !providers.includes('nvidia')) providers.push('nvidia');
    if (isGeminiEnabled && !providers.includes('gemini')) providers.push('gemini');
    if (isOpenaiEnabled && !providers.includes('openai')) providers.push('openai');
    if (isGroqEnabled && !providers.includes('groq')) providers.push('groq');
    if (isOpenrouterEnabled && !providers.includes('openrouter')) providers.push('openrouter');

    // Fallback: if no API keys, throw
    if (providers.length === 0) {
        throw new Error('No AI API keys configured. Please set up at least one provider in Admin Settings.');
    }

    // Execution loop over providers
    for (const provider of providers) {
        if (provider === 'nvidia') {
            try {
                const res = await fetchNvidiaWithFallback({
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${nvidiaApiKey}`,
                        'X-Nvidia-Api-Key': nvidiaApiKey,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                    },
                    body: JSON.stringify({
                        model: nvidiaModel,
                        messages: [{ role: 'user', content: prompt }],
                        temperature: 0.7,
                        max_tokens: 2048,
                    }),
                });

                if (res.ok) {
                    const data = await res.json();
                    const rawContent = data.choices?.[0]?.message?.content?.trim() || '';
                    const parsed = parseAiResponse(rawContent);
                    if (parsed) return parsed;
                    throw new Error('Failed to parse response payload');
                } else {
                    const errText = await res.text().catch(() => '');
                    throw new Error(`HTTP ${res.status}: ${errText}`);
                }
            } catch (nErr) {
                console.warn('NVIDIA AI engine error, trying next provider...', nErr);
            }
        }

        if (provider === 'gemini') {
            try {
                let modelPath = geminiModel;
                if (!modelPath.startsWith('models/') && !modelPath.startsWith('tunedModels/')) {
                    modelPath = `models/${modelPath}`;
                }
                const url = `https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent?key=${geminiApiKey}`;
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                    }),
                });
                if (res.ok) {
                    const data = await res.json();
                    const rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
                    const parsed = parseAiResponse(rawContent);
                    if (parsed) return parsed;
                    throw new Error('Failed to parse response payload');
                } else {
                    const errJson = await res.json().catch(() => ({}));
                    const errMsg = errJson?.error?.message || `HTTP ${res.status} error from Gemini API`;
                    throw new Error(errMsg);
                }
            } catch (gErr) {
                console.warn('Gemini AI engine error, trying next provider...', gErr);
            }
        }

        if (provider === 'groq') {
            try {
                const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${groqApiKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        model: groqModel,
                        messages: [{ role: 'user', content: prompt }],
                        temperature: 0.7,
                        max_tokens: 2048,
                    }),
                });
                if (res.ok) {
                    const data = await res.json();
                    const rawContent = data.choices?.[0]?.message?.content?.trim() || '';
                    const parsed = parseAiResponse(rawContent);
                    if (parsed) return parsed;
                    throw new Error('Failed to parse response payload');
                } else {
                    const errJson = await res.json().catch(() => ({}));
                    const errMsg = errJson?.error?.message || `HTTP ${res.status} error from Groq API`;
                    throw new Error(errMsg);
                }
            } catch (qErr) {
                console.warn('Groq AI engine error, trying next provider...', qErr);
            }
        }

        if (provider === 'openrouter') {
            try {
                const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${openrouterApiKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        model: openrouterModel,
                        messages: [{ role: 'user', content: prompt }],
                        temperature: 0.7,
                        max_tokens: 2048,
                    }),
                });
                if (res.ok) {
                    const data = await res.json();
                    const rawContent = data.choices?.[0]?.message?.content?.trim() || '';
                    const parsed = parseAiResponse(rawContent);
                    if (parsed) return parsed;
                    throw new Error('Failed to parse response payload');
                } else {
                    const errJson = await res.json().catch(() => ({}));
                    const errMsg = errJson?.error?.message || `HTTP ${res.status} error from OpenRouter API`;
                    throw new Error(errMsg);
                }
            } catch (orErr) {
                console.warn('OpenRouter AI engine error, trying next provider...', orErr);
            }
        }

        if (provider === 'openai') {
            try {
                const res = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${openaiApiKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        model: openaiModel,
                        messages: [{ role: 'user', content: prompt }],
                        temperature: 0.7,
                        max_tokens: 2048,
                    }),
                });
                if (res.ok) {
                    const data = await res.json();
                    const rawContent = data.choices?.[0]?.message?.content?.trim() || '';
                    const parsed = parseAiResponse(rawContent);
                    if (parsed) return parsed;
                    throw new Error('Failed to parse response payload');
                } else {
                    const errJson = await res.json().catch(() => ({}));
                    const errMsg = errJson?.error?.message || `HTTP ${res.status} error from OpenAI API`;
                    throw new Error(errMsg);
                }
            } catch (oErr) {
                console.warn('OpenAI engine error, trying next provider...', oErr);
            }
        }
    }

    throw new Error('AI content generation failed. Please verify AI API settings in Admin Settings.');
}

/**
 * AI Resume Parser: Takes raw text from PDF/DOCX/DOC/RTF/TXT/Image and converts it into structured resume JSON.
 * Uses AI with vision for images, always merges heuristic fallback for complete coverage.
 */
export async function parseResumeTextToStructuredData(rawText) {
    let settings = {};
    try {
        settings = await getSystemSettings();
    } catch (e) {
        console.warn('Could not load system settings from Firestore', e);
    }

    const aiConfig = settings?.ai || {};
    const nvidiaApiKey = (aiConfig.nvidiaApiKey || import.meta.env.VITE_NVIDIA_API_KEY || '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').trim();
    const nvidiaModel = resolveDynamicModel('nvidia', aiConfig);
    const geminiApiKey = (aiConfig.geminiApiKey || import.meta.env.VITE_GEMINI_API_KEY || '').trim();
    const geminiModel = resolveDynamicModel('gemini', aiConfig);
    const openaiApiKey = (aiConfig.openaiApiKey || import.meta.env.VITE_OPENAI_API_KEY || '').trim();
    const openaiModel = resolveDynamicModel('openai', aiConfig);

    const isNvidiaEnabled = aiConfig.enableNvidia !== false && !!nvidiaApiKey;
    const isGeminiEnabled = aiConfig.enableGemini !== false && !!geminiApiKey;

    // Detect image input
    let isImageInput = false;
    let mimeType = 'image/jpeg';
    let base64Data = '';
    if (typeof rawText === 'string' && rawText.startsWith('[IMAGE_RESUME_BASE64:')) {
        isImageInput = true;
        const match = rawText.match(/^\[IMAGE_RESUME_BASE64:([^\]]+)\](.*)$/s);
        if (match) {
            mimeType = match[1] || 'image/jpeg';
            base64Data = match[2] || '';
        }
    }

    // Ultra-smart, token-efficient ATS extraction prompt
    const prompt = `Extract all resume data from the text into a valid JSON object following this exact schema:

{
  "firstname": "string",
  "lastname": "string",
  "email": "string",
  "phone": "string",
  "occupation": "string (role title only, no company)",
  "city": "string",
  "country": "string",
  "address": "string",
  "postalcode": "string",
  "summary": "<p>Professional summary</p>",
  "employments": [
    {
      "jobTitle": "string",
      "employer": "string",
      "city": "string",
      "startDate": "string",
      "endDate": "string",
      "description": "<p>bullet 1</p><p>bullet 2</p>"
    }
  ],
  "educations": [
    {
      "school": "string",
      "degree": "string",
      "city": "string",
      "startDate": "string",
      "endDate": "string",
      "description": "string"
    }
  ],
  "skills": [
    { "skillName": "string", "rating": 85 }
  ],
  "languages": [
    { "language": "string", "level": "Fluent" }
  ]
}

STRICT RULES:
1. Return ONLY the raw JSON object. No markdown fences (\`\`\`json), no commentary.
2. Separate jobTitle and employer into distinct fields.
3. Wrap all work description bullets in individual <p> tags.
4. If a field is missing, use an empty string "". Never skip employments, educations, or skills.

RESUME TEXT:
"""
${typeof rawText === 'string' && !isImageInput ? rawText.trim().substring(0, 8000) : 'Image document attached.'}
"""`;

    // Helper: extract JSON
    function extractJson(raw) {
        if (!raw) return null;
        let cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
        try { return JSON.parse(cleaned); } catch (_) { }
        const firstBrace = cleaned.indexOf('{');
        const lastBrace = cleaned.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace > firstBrace) {
            try { return JSON.parse(cleaned.substring(firstBrace, lastBrace + 1)); } catch (_) { }
        }
        return null;
    }

    let aiResult = null;

    // 1. Try NVIDIA (supports vision)
    if (isNvidiaEnabled) {
        try {
            const messageContent = isImageInput ? [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Data}` } }
            ] : prompt;

            const urlsToTry = [
                typeof window !== 'undefined' ? `${window.location.origin}/nvidia-proxy.php` : null,
                typeof window !== 'undefined' ? `${window.location.origin}/public/nvidia-proxy.php` : null,
                '/api/nvidia/v1/chat/completions',
                'https://integrate.api.nvidia.com/v1/chat/completions'
            ].filter(Boolean);

            let res = null;
            for (const url of urlsToTry) {
                try {
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${nvidiaApiKey}`,
                            'X-Nvidia-Api-Key': nvidiaApiKey
                        },
                        body: JSON.stringify({
                            model: nvidiaModel,
                            messages: [{ role: 'user', content: messageContent }],
                            temperature: 0.15,
                            max_tokens: 4096,
                        }),
                    });
                    if (response.ok) { res = response; break; }
                } catch (_) {}
            }

            if (res && res.ok) {
                const data = await res.json();
                const content = data.choices?.[0]?.message?.content?.trim() || '';
                const parsed = extractJson(content);
                if (parsed) aiResult = parsed;
                else console.warn('NVIDIA JSON parse returned null for raw content:', content);
            }
        } catch (nErr) {
            console.warn('NVIDIA parser error, trying Gemini fallback...', nErr);
        }
    }

    // 2. Try Gemini (supports vision)
    if (!aiResult && isGeminiEnabled) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`;
            const geminiParts = isImageInput ? [
                { inline_data: { mime_type: mimeType, data: base64Data } },
                { text: prompt }
            ] : [{ text: prompt }];

            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: geminiParts }],
                    generationConfig: { maxOutputTokens: 4096, temperature: 0.15 },
                }),
            });
            if (res.ok) {
                const data = await res.json();
                const rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
                const parsed = extractJson(rawContent);
                if (parsed) aiResult = parsed;
            }
        } catch (gErr) {
            console.warn('Gemini parser error...', gErr);
        }
    }

    if (!aiResult) {
        throw new Error('AI resume parsing failed. Please verify AI API settings in Admin Settings or try uploading again.');
    }

    // Convert strictly AI-parsed JSON into standard builder payload shape
    return normalizeRawDataToTempJson(aiResult, rawText);
}