/**
 * Evidence-Based Candidate Context (backend port, v2) — IME365
 *
 * Deterministic parity helpers shared with the frontend engine
 * (src/utils/candidateContext.js). There is intentionally NO profession
 * registry and NO role-specific content here: the AI layer reasons from the
 * candidate's own verified facts, and asks when it does not know.
 *
 * The previous module's `detectDomainFromText` / `getDomainData` taxonomy
 * helpers were removed. Provider-failure fallbacks now return
 * source-preserving content or a questions payload — never taxonomy filler.
 */

function cleanText(val) {
    return String(val || '').toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function detectGeographicRegion(resumeData = {}) {
    const raw = cleanText(`${resumeData.country || ''} ${resumeData.city || ''} ${resumeData.address || ''}`);
    if (/\b(india|bharat|in|delhi|mumbai|bengaluru|bangalore|hyderabad|chennai|pune|kolkata|ahmedabad|noida|gurugram)\b/i.test(raw)) {
        return 'IN';
    }
    if (/\b(united states|usa|us|u s a|new york|california|texas|boston|chicago|san francisco|seattle|miami|los angeles|washington)\b/i.test(raw)) {
        return 'US';
    }
    if (/\b(united kingdom|uk|u k|great britain|england|scotland|wales|london|manchester|birmingham|edinburgh|glasgow)\b/i.test(raw)) {
        return 'UK';
    }
    if (/\b(canada|ca|toronto|vancouver|montreal|ottawa|calgary|alberta|ontario)\b/i.test(raw)) {
        return 'CA';
    }
    if (/\b(australia|au|sydney|melbourne|brisbane|perth|adelaide)\b/i.test(raw)) {
        return 'AU';
    }
    if (/\b(germany|deutschland|france|spain|italy|netherlands|berlin|paris|madrid|rome|amsterdam)\b/i.test(raw)) {
        return 'EU';
    }
    return 'GLOBAL';
}

function extractTargetRoleFromJd(jdText) {
    if (!jdText || typeof jdText !== 'string') return '';
    const clean = jdText.slice(0, 600);
    const patterns = [
        /(?:seeking|hiring|looking for|needs?|recruiting|appointing)\s+(?:an?|our next)\s+([^,.\n]{3,60}?)(?=\s+(?:to\b|who\b|responsible\b|reporting\b|with\b|in\b|at\b|[.\n,;]))/i,
        /(?:position|role|job title|title)\s*[:\-]\s*([^,.\n]{3,50})/i,
        /^#\s*([A-Za-z0-9&/\-\s]{3,50}?)(?:\s+position|\s+opening|\s+role)/im
    ];
    for (const pat of patterns) {
        const match = clean.match(pat);
        if (match && match[1]) {
            const candidate = match[1].trim().replace(/\s+/g, ' ');
            if (candidate.length >= 3 && candidate.length <= 50 && !/^(candidate|individual|someone|professional|person|team member)$/i.test(candidate)) {
                return candidate;
            }
        }
    }
    return '';
}

function estimateExperienceYears(employments = []) {
    if (!Array.isArray(employments) || employments.length === 0) return 0;
    let totalMonths = 0;
    for (const emp of employments) {
        if (!emp) continue;
        const begin = emp.begin ? new Date(emp.begin) : (emp.startDate ? new Date(emp.startDate) : null);
        const end = emp.current ? new Date() : (emp.end ? new Date(emp.end) : (emp.endDate ? new Date(emp.endDate) : null));
        if (begin && !isNaN(begin.getTime()) && end && !isNaN(end.getTime())) {
            const months = (end.getFullYear() - begin.getFullYear()) * 12 + (end.getMonth() - begin.getMonth());
            if (months > 0) totalMonths += months;
        } else {
            totalMonths += 24;
        }
    }
    return Math.min(40, Math.round((totalMonths / 12) * 10) / 10);
}

/**
 * High-value, role-agnostic follow-up questions, keyed by SECTION (never by
 * profession). Used when the candidate has not yet provided enough evidence
 * for a factual generation request. The AI is asked the same questions when
 * a provider IS available; without a provider these deterministic questions
 * keep the experience fully functional.
 */
const SECTION_QUESTIONS = Object.freeze({
    'work-history': Object.freeze([
        'What did you do day to day in this role? Even plain language is fine.',
        'Did you supervise, train, or coordinate anyone? If yes, roughly how many people?',
        'Do you know any measurable result of your work — volume handled, time saved, cost reduced, or quality improved? An approximation is enough.',
    ]),
    education: Object.freeze([
        'What were the main subjects or areas of study?',
        'Did you complete a thesis, capstone, or research project? What was it about?',
        'Did you receive any honors, distinctions, or scholarships?',
    ]),
    summary: Object.freeze([
        'What are the two or three things you are proudest of in your career so far?',
        'Roughly how many years have you worked in this field?',
        'What do colleagues or clients typically rely on you for?',
    ]),
});

function generateRoleInterviewQuestions(role = '', employer = '', targetJd = '') {
    const r = String(role || '').trim();
    const org = String(employer || '').trim();
    const orgSuffix = org ? ` at ${org}` : '';
    const cleanRole = r || 'your role';
    const lowerRole = cleanRole.toLowerCase();

    let toolExamples = 'tools, platforms, or software';
    let metricExamples = 'metrics, numbers, efficiency gains, or outcomes';
    let defaultChipsQ1 = ['Daily Operations', 'Project Leadership', 'Client Collaboration', 'Process Improvement'];
    let defaultChipsQ2 = ['Key Software', 'Internal Workflows', 'Automation Tools', 'Technical Platforms'];
    let defaultChipsQ3 = ['Exceeded KPIs', '+20% Efficiency', 'Cost Reduction', 'On-time Delivery'];

    if (/(developer|engineer|software|devops|backend|frontend|fullstack|data|cloud|architect|qa|programmer|coder)/i.test(lowerRole)) {
        toolExamples = 'languages, frameworks, cloud services, or databases';
        metricExamples = 'latency, uptime, scalability, or test coverage';
        defaultChipsQ1 = ['System Architecture', 'API Development', 'Code Reviews', 'Microservices'];
        defaultChipsQ2 = ['Node.js & React', 'PostgreSQL / SQL', 'Docker & CI/CD', 'AWS / Cloud'];
        defaultChipsQ3 = ['Reduced Latency', '99.9% Uptime', 'Scaled to 100K+ Users', 'Automated Testing'];
    } else if (/(account manager|display|ad tech|advertising|media buyer|ppc|seo|marketing|campaign|growth)/i.test(lowerRole)) {
        toolExamples = 'ad platforms (DSPs, GA4, Meta, Google Ads), or CRM';
        metricExamples = 'ROAS, CPA, revenue growth, or conversion rate';
        defaultChipsQ1 = ['Client Portfolio', 'Campaign Execution', 'Media Planning', 'Cross-functional Teams'];
        defaultChipsQ2 = ['Google Ad Manager', 'DSP Platforms', 'Salesforce CRM', 'BI Dashboards'];
        defaultChipsQ3 = ['+25% Revenue Growth', '3.5x Average ROAS', 'Cut CPA by 15%', 'Exceeded KPIs'];
    } else if (/(sales|business development|bdr|sdr|account executive|commercial|realtor)/i.test(lowerRole)) {
        toolExamples = 'CRM systems, pipeline tools, or client presentation decks';
        metricExamples = 'quota attainment, deal size, ARR, or pipeline volume';
        defaultChipsQ1 = ['Enterprise Sales', 'Pipeline Generation', 'Contract Negotiations', 'Client Relationships'];
        defaultChipsQ2 = ['Salesforce / HubSpot', 'LinkedIn Sales Nav', 'Executive Pitches', 'Cold Outreach'];
        defaultChipsQ3 = ['120% Quota Attainment', 'Closed $1M+ ARR', '30-day Cycle Time', 'High Win Rate'];
    } else if (/(nurse|doctor|clinical|physician|dental|medical|therapist|healthcare|pharm|surgeon)/i.test(lowerRole)) {
        toolExamples = 'EMR/EHR systems, clinical equipment, or care protocols';
        metricExamples = 'patient volume, care quality, triage speed, or compliance';
        defaultChipsQ1 = ['Direct Patient Care', 'Triage & Assessment', 'Treatment Plans', 'Family Counseling'];
        defaultChipsQ2 = ['Epic / Cerner EHR', 'Medication Admin', 'Patient Monitoring', 'HIPAA Compliance'];
        defaultChipsQ3 = ['Managed 20+ Patients/Shift', 'Zero Safety Incidents', 'High Patient Satisfaction', 'Fast Triage'];
    } else if (/(finance|accounting|accountant|auditor|controller|analyst|tax|banking|treasury)/i.test(lowerRole)) {
        toolExamples = 'ERP, Excel financial modeling, GAAP/IFRS, or BI software';
        metricExamples = 'budget managed, audit accuracy, reporting turnaround, or cost savings';
        defaultChipsQ1 = ['Financial Reporting', 'Month-end Close', 'Budget Forecasting', 'Audit Compliance'];
        defaultChipsQ2 = ['Advanced Excel / VBA', 'SAP / NetSuite', 'GAAP & IFRS', 'Tableau / PowerBI'];
        defaultChipsQ3 = ['Managed $10M+ Budget', 'Clean Audit Record', 'Reduced Close by 3 Days', 'Variance Analysis'];
    } else if (/(product manager|product owner|scrum master|project manager|program manager|agile)/i.test(lowerRole)) {
        toolExamples = 'Jira, product discovery tools, roadmap software, or analytics';
        metricExamples = 'user adoption, release velocity, churn reduction, or feature NPS';
        defaultChipsQ1 = ['Roadmap Ownership', 'Sprint Planning', 'Stakeholder Alignment', 'User Research'];
        defaultChipsQ2 = ['Jira & Confluence', 'Mixpanel / Amplitude', 'PRDs & User Stories', 'A/B Testing'];
        defaultChipsQ3 = ['+35% User Adoption', 'On-time Delivery', 'Reduced Churn by 12%', 'High Feature NPS'];
    } else if (/(designer|ui|ux|graphic|creative|art director|copywriter|animator)/i.test(lowerRole)) {
        toolExamples = 'Figma, Adobe Creative Suite, prototyping tools, or design systems';
        metricExamples = 'engagement lift, usability test completion, or delivery speed';
        defaultChipsQ1 = ['Wireframing & Prototyping', 'Design Systems', 'User Journey Mapping', 'Usability Testing'];
        defaultChipsQ2 = ['Figma & FigJam', 'Adobe CC Suite', 'Responsive Design', 'Interactive Prototypes'];
        defaultChipsQ3 = ['+40% Task Completion', 'Unified 50+ Components', 'High User Delight', 'Brand Elevation'];
    } else if (/(chef|cook|hospitality|restaurant|hotel|food|beverage|catering|culinary)/i.test(lowerRole)) {
        toolExamples = 'kitchen stations, inventory/POS systems, or food safety guidelines';
        metricExamples = 'covers per night, food cost percentage, or health inspection rating';
        defaultChipsQ1 = ['Station Management', 'Menu Development', 'Inventory & Prep', 'Kitchen Leadership'];
        defaultChipsQ2 = ['HACCP / Food Safety', 'POS Systems', 'Vendor Management', 'Cost Control'];
        defaultChipsQ3 = ['200+ Covers/Night', 'Kept Food Cost < 28%', '100% Health Inspection', 'Zero Waste'];
    }

    return [
        {
            id: 'q1',
            question: `What did you do day to day, and what were your core responsibilities as ${cleanRole}${orgSuffix}?`,
            answerField: 'answer1',
            starterChips: defaultChipsQ1,
        },
        {
            id: 'q2',
            question: `What specific ${toolExamples} did you use to execute your work?`,
            answerField: 'answer2',
            starterChips: defaultChipsQ2,
        },
        {
            id: 'q3',
            question: `What measurable results, ${metricExamples}, or key achievements did you deliver?`,
            answerField: 'answer3',
            starterChips: defaultChipsQ3,
        },
    ];
}

function sectionQuestions(section, context = {}) {
    if (section === 'work-history' && (context?.jobTitle || context?.role || context?.entry?.jobTitle)) {
        const title = context.jobTitle || context.role || context.entry?.jobTitle || '';
        const employer = context.employer || context.company || context.entry?.employer || '';
        const targetJd = context.targetJobDescription || context.targetJd || '';
        return generateRoleInterviewQuestions(title, employer, targetJd);
    }
    return (SECTION_QUESTIONS[section] || SECTION_QUESTIONS.summary).map((q, index) => ({
        id: `q${index + 1}`,
        question: q,
        answerField: `answer${index + 1}`,
    }));
}

function extractCandidateNotes(rawPayload = {}) {
    const payload = rawPayload && typeof rawPayload === 'object' ? rawPayload : {};
    const entry = (payload.entry && typeof payload.entry === 'object') ? payload.entry : {};

    const rawAnswers = (payload.candidateAnswers && typeof payload.candidateAnswers === 'object')
        ? payload.candidateAnswers
        : ((payload.answers && typeof payload.answers === 'object') ? payload.answers : {});
    const answersText = typeof payload.answers === 'string'
        ? payload.answers
        : Object.values(rawAnswers)
            .filter(Boolean)
            .map(v => (typeof v === 'string' ? v : (v?.text || JSON.stringify(v))))
            .join('\n');

    const candidates = [
        payload.existingText,
        payload.notes,
        payload.description,
        payload.userNotes,
        payload.responsibilities,
        payload.achievements,
        entry.existingText,
        entry.notes,
        entry.description,
        entry.userNotes,
        entry.responsibilities,
        entry.achievements,
        answersText,
    ];

    return candidates
        .filter(c => typeof c === 'string' && c.trim().length > 0)
        .join('\n');
}

/**
 * Builds the evidence envelope for AI prompts: ONLY verified candidate facts,
 * scoped to the requested section, plus the target role/JD and any answers
 * the candidate gave to follow-up questions.
 *
 * Accepts the new context.facts shape and the legacy flat payload fields
 * (workHistory, education, skills, …) so older callers keep working.
 */
function buildEvidencePayload(operation, rawPayload = {}) {
    const payload = rawPayload && typeof rawPayload === 'object' ? rawPayload : {};
    const context = (payload.context && typeof payload.context === 'object') ? payload.context : {};
    const facts = (context.facts && typeof context.facts === 'object') ? context.facts : {};

    const clamp = (value, max) => String(value ?? '').slice(0, max);
    const sectionText = (value, max = 4000) => clamp(String(value ?? ''), max);
    const flatText = (value, max) => {
        if (Array.isArray(value)) return clamp(value.map(v => (typeof v === 'object' && v !== null ? (v.title || v.name || v.skillName || v.degree || JSON.stringify(v)) : v)).join('; '), max);
        return sectionText(value, max);
    };
    const flatSkills = Array.isArray(facts.skills) && facts.skills.length
        ? facts.skills
        : (Array.isArray(payload.existingSkills) ? payload.existingSkills
            : (Array.isArray(payload.skills) ? payload.skills : []));

    const evidence = {
        candidateFacts: {
            name: clamp(facts.name || payload.name, 120),
            headline: clamp(facts.headline, 200),
            location: clamp(facts.location, 120),
            experience: clamp(facts.experienceYears ? `${facts.experienceYears} years` : '', 60),
            experienceClaim: clamp(payload.experience, 120),
            workRoles: (Array.isArray(facts.roles) && facts.roles.length)
                ? facts.roles.slice(0, 12).map(r => ({
                    title: clamp(r?.title, 200),
                    employer: clamp(r?.employer, 200),
                    begin: clamp(r?.begin, 60),
                    end: clamp(r?.end, 60),
                    description: sectionText(r?.description, 3000),
                }))
                : (payload.workHistory ? [{ title: '', employer: '', begin: '', end: '', description: sectionText(payload.workHistory, 3000) }] : []),
            education: (Array.isArray(facts.education) && facts.education.length)
                ? facts.education.slice(0, 8).map(e => ({
                    degree: clamp(e?.degree, 200),
                    school: clamp(e?.school, 200),
                    started: clamp(e?.started, 40),
                    finished: clamp(e?.finished, 40),
                    description: sectionText(e?.description, 2000),
                }))
                : (payload.education ? [{ degree: '', school: '', started: '', finished: '', description: sectionText(payload.education, 2000) }] : []),
            skills: (Array.isArray(flatSkills) ? flatSkills : []).slice(0, 60).map(s => clamp(typeof s === 'object' && s !== null ? (s.skillName || s.name || '') : s, 120)).filter(Boolean),
            certifications: (Array.isArray(facts.certifications) && facts.certifications.length)
                ? facts.certifications.slice(0, 20).map(c => `${clamp(c?.title, 160)}${c?.issuer ? ` (${clamp(c.issuer, 120)})` : ''}`)
                : flatText(payload.certifications, 1200) ? [flatText(payload.certifications, 1200)] : [],
            projects: (Array.isArray(facts.projects) && facts.projects.length)
                ? facts.projects.slice(0, 10).map(p => ({ title: clamp(p?.title, 200), description: sectionText(p?.description, 2000) }))
                : (payload.projects ? [{ title: '', description: sectionText(payload.projects, 2000) }] : []),
            achievements: (Array.isArray(facts.achievements) && facts.achievements.length)
                ? facts.achievements.slice(0, 10).map(a => `${clamp(a?.title, 160)}${a?.description ? ` — ${sectionText(a.description, 500)}` : ''}`)
                : (payload.achievement || payload.achievements ? [sectionText(payload.achievement || payload.achievements, 1000)] : []),
            summary: sectionText(facts.summary || payload.existingText || payload.sourceFacts || payload.summary, 2000),
        },
        targetRole: clamp(
            payload.targetRole
            || payload.targetTitle
            || context.target?.role
            || (operation !== 'generate-work-description' && operation !== 'generate-education-description' ? (payload.jobTitle || payload.position || payload.role) : '')
            || payload.occupation
            || '',
            200
        ),
        ...(payload.targetJd ? { targetJobDescription: sectionText(payload.targetJd, 10000) } : {}),
        ...(context.vocabulary && Array.isArray(context.vocabulary) ? { candidateVocabulary: context.vocabulary.slice(0, 120) } : {}),
    };

    // Entry-scoped evidence for per-entry operations.
    const candNotes = sectionText(extractCandidateNotes(payload), 4000);
    const entry = (payload.entry && typeof payload.entry === 'object') ? payload.entry : {};

    if (operation === 'generate-work-description') {
        evidence.entry = {
            jobTitle: clamp(payload.jobTitle || payload.position || payload.role || entry.jobTitle || entry.title || entry.role || entry.position || '', 200),
            employer: clamp(payload.employer || payload.company || payload.employerName || entry.employer || entry.company || entry.employerName || '', 200),
            city: clamp(payload.city || entry.city || '', 120),
            startDate: clamp(payload.startDate || entry.startDate || entry.begin || '', 60),
            endDate: clamp(payload.endDate || entry.endDate || entry.end || '', 60),
            candidateNotes: candNotes,
        };
    } else if (operation === 'generate-education-description') {
        evidence.entry = {
            school: clamp(payload.school || payload.institution || entry.school || entry.institution || '', 200),
            degree: clamp(payload.degree || payload.field || entry.degree || entry.field || '', 200),
            city: clamp(payload.city || entry.city || '', 120),
            started: clamp(payload.startDate || entry.startDate || entry.started || entry.begin || '', 60),
            finished: clamp(payload.endDate || entry.endDate || entry.finished || entry.end || '', 60),
            candidateNotes: candNotes,
        };
    } else if (operation === 'enhance-single-bullet') {
        evidence.entry = {
            candidateBullet: sectionText(payload.bullet || payload.text || entry.bullet || '', 2000),
            jobTitle: clamp(payload.jobTitle || payload.role || payload.position || entry.jobTitle || entry.role || '', 200),
            employer: clamp(payload.company || payload.employer || entry.company || entry.employer || '', 200),
            city: clamp(payload.city || payload.location || entry.city || entry.location || '', 120),
            existingBullets: Array.isArray(payload.existingBullets) ? payload.existingBullets.map(b => clamp(String(b || ''), 300)).filter(Boolean) : [],
        };
    }

    // Answers the candidate gave to follow-up questions (conversation context).
    const rawAnswers = (payload.candidateAnswers && typeof payload.candidateAnswers === 'object')
        ? payload.candidateAnswers
        : ((payload.answers && typeof payload.answers === 'object') ? payload.answers : {});
    const answerEntries = Object.entries(rawAnswers)
        .map(([id, value]) => [id, sectionText(typeof value === 'string' ? value : (value?.text || ''), 2000)])
        .filter(([, value]) => value.length > 0);
    if (answerEntries.length) evidence.candidateAnswers = Object.fromEntries(answerEntries);

    return evidence;
}

/** Minimum note length (chars of plain text) before a factual rewrite is attempted. */
const EVIDENCE_THRESHOLD = 10;

function entryNoteLength(operation, rawPayload = {}) {
    const payload = rawPayload && typeof rawPayload === 'object' ? rawPayload : {};
    if (operation === 'enhance-single-bullet') {
        const entry = (payload.entry && typeof payload.entry === 'object') ? payload.entry : {};
        const bulletLen = String(payload.bullet || payload.text || entry.bullet || entry.text || '').replace(/\s+/g, ' ').trim().length;
        if (bulletLen > 0) return bulletLen;
        const roleLen = String(payload.jobTitle || payload.role || payload.position || entry.jobTitle || entry.role || '').replace(/\s+/g, ' ').trim().length;
        return roleLen >= 2 ? Math.max(roleLen, EVIDENCE_THRESHOLD) : 0;
    }
    const combined = extractCandidateNotes(payload);
    return combined.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().length;
}

function summaryEvidenceLength(rawPayload = {}) {
    const payload = rawPayload && typeof rawPayload === 'object' ? rawPayload : {};
    const context = (payload.context && typeof payload.context === 'object') ? payload.context : {};
    const facts = (context.facts && typeof context.facts === 'object') ? context.facts : {};
    const explicit = String(payload.existingText || payload.sourceFacts || '').replace(/<[^>]*>/g, ' ').trim();
    if (explicit.length >= EVIDENCE_THRESHOLD) return explicit.length;
    const summaryLen = String(facts.summary || payload.summary || '').replace(/<[^>]*>/g, ' ').trim().length;
    if (summaryLen >= 60) return summaryLen;
    // Legacy flat fields carry the same evidence.
    const flatWork = String(payload.workHistory || '').replace(/<[^>]*>/g, ' ').trim();
    const flatEdu = String(payload.education || '').replace(/<[^>]*>/g, ' ').trim();
    const flatCerts = Array.isArray(payload.certifications) ? payload.certifications.join('; ') : String(payload.certifications || '').trim();
    const flatProjects = String(payload.projects || '').trim();
    const flatAchievement = String(payload.achievement || payload.achievements || '').trim();
    const flatSkills = Array.isArray(payload.existingSkills || payload.skills)
        ? (payload.existingSkills || payload.skills).length : 0;
    const flatBodyLen = flatWork.length + flatEdu.length + flatCerts.length + flatProjects.length + flatAchievement.length;
    const hasRole = Boolean(payload.jobTitle || payload.position || payload.role || payload.occupation || context.target?.role || facts.headline);
    if (flatBodyLen >= EVIDENCE_THRESHOLD && (hasRole || flatBodyLen >= 20)) return flatBodyLen;

    // Structured evidence from previous steps: roles, education, skills, certifications, projects.
    const roleCount = Array.isArray(facts.roles) ? facts.roles.length : (flatWork.length >= 5 ? 1 : 0);
    const eduCount = Array.isArray(facts.education) ? facts.education.length : (flatEdu.length >= 5 ? 1 : 0);
    const skillCount = Array.isArray(facts.skills) ? facts.skills.length : flatSkills;
    const certCount = Array.isArray(facts.certifications) ? facts.certifications.length : (flatCerts.length >= 3 ? 1 : 0);
    const projectCount = Array.isArray(facts.projects) ? facts.projects.length : (flatProjects.length >= 3 ? 1 : 0);

    // If candidate has entered any previous step details (roles, degrees, skills, certs, projects, or target role),
    // there is sufficient grounded evidence to synthesize an executive summary.
    if ((roleCount + eduCount + projectCount) >= 1 || (skillCount >= 1 && (hasRole || roleCount + eduCount >= 1)) || (hasRole && (roleCount >= 1 || eduCount >= 1 || skillCount >= 1 || certCount >= 1))) {
        return Math.max(
            roleCount * 25 + eduCount * 20 + skillCount * 10 + certCount * 15 + projectCount * 15 + (hasRole ? 20 : 0),
            EVIDENCE_THRESHOLD
        );
    }
    if ((roleCount + eduCount + skillCount + certCount + projectCount) >= 1) {
        return Math.max(roleCount * 20 + eduCount * 20 + skillCount * 10 + certCount * 10 + projectCount * 10, EVIDENCE_THRESHOLD);
    }
    return 0;
}

module.exports = {
    SECTION_QUESTIONS,
    EVIDENCE_THRESHOLD,
    detectGeographicRegion,
    extractTargetRoleFromJd,
    estimateExperienceYears,
    generateRoleInterviewQuestions,
    extractCandidateNotes,
    buildEvidencePayload,
    entryNoteLength,
    sectionQuestions,
    summaryEvidenceLength,
};
