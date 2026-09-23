/**
 * Bullet & Role Quality Engine — IME365
 *
 * Provides deterministic, client-side evaluation of Work History bullets and roles.
 * Powers live 🟢/🟡/🔴 bullet scoring, the Role ATS Health Card, and anti-stuffing heuristics.
 */

import { ACTION_VERBS as ATS_ACTION_VERBS, extractJdKeywords } from './atsScore.js';

export const ACTION_VERBS = new Set([
    'accelerated', 'achieved', 'administered', 'advanced', 'analyzed', 'architected', 'assembled', 'audited',
    'authored', 'automated', 'boosted', 'built', 'calculated', 'centralized', 'championed', 'coached',
    'collaborated', 'composed', 'computed', 'conceptualized', 'configured', 'consolidated', 'constructed',
    'coordinated', 'crafted', 'created', 'customized', 'cut', 'debugged', 'decreased', 'delivered',
    'deployed', 'designed', 'developed', 'devised', 'directed', 'distributed', 'documented', 'doubled',
    'drove', 'eliminated', 'enabled', 'enacted', 'engineered', 'enhanced', 'established', 'evaluated',
    'exceeded', 'executed', 'expanded', 'expedited', 'facilitated', 'formulated', 'fostered', 'founded',
    'generated', 'guided', 'headed', 'identified', 'implemented', 'improved', 'increased', 'initiated',
    'innovated', 'inspected', 'installed', 'instituted', 'integrated', 'introduced', 'invented', 'launched',
    'led', 'leveraged', 'maintained', 'managed', 'maximized', 'mentored', 'migrated', 'minimized',
    'modernized', 'monitored', 'negotiated', 'optimized', 'orchestrated', 'organized', 'overhauled',
    'oversaw', 'partnered', 'performed', 'pioneered', 'planned', 'produced', 'programmed', 'published',
    'raised', 'rearchitected', 'rebuilt', 'redesigned', 'reduced', 'refactored', 'refined', 'remodeled',
    'reorganized', 'resolved', 'restructured', 'revamped', 'revolutionized', 'saved', 'scaled', 'scheduled',
    'secured', 'selected', 'shaped', 'shipped', 'simplified', 'slashed', 'solved', 'spearheaded',
    'standardized', 'steered', 'streamlined', 'strengthened', 'structured', 'supervised', 'surpassed',
    'synthesized', 'systematized', 'targeted', 'tested', 'trained', 'transformed', 'transitioned',
    'translated', 'trimmed', 'tripled', 'uncovered', 'unified', 'upgraded', 'validated', 'verified',
    'wrote', 'yielded',
    // Healthcare, Clinical & Sciences
    'diagnosed', 'treated', 'administered', 'prescribed', 'rehabilitated', 'monitored',
    'triaged', 'counseled', 'restored', 'extracted', 'operated', 'examined',
    // Legal & Regulatory
    'litigated', 'drafted', 'arbitrated', 'advocated', 'defended', 'prosecuted', 'settled', 'briefed', 'advised',
    // Pedagogical & Culinary / Operations
    'taught', 'instructed', 'curated', 'prepared', 'procured', 'dispatched'
]);

export const WEAK_PASSIVE_REGEX = /^(?:responsible for|worked on|helped with|assisted in|tasks included|duties included|doing daily|handled tasks|was involved in|participated in|contributed to|was tasked with|responsible to|helped out)/i;

/**
 * Detects legitimate quantitative metrics, business outcomes, or scale in bullet text.
 * Strictly excludes standalone 4-digit calendar years (1980–2035) so "Worked in 2021" is not misidentified.
 */
export function detectLegitimateMetric(text) {
    if (!text || typeof text !== 'string') return false;
    const clean = text.trim();
    if (!clean) return false;

    // 1. Currency with amounts ($500, €20k, £1.2M, ₹50L, ¥10M, 50k USD)
    if (/[$€£₹¥]\s*[\d,.]+(?:\s*(?:k|m|b|cr|lakh|million|billion))?|[\d,.]+\s*(?:usd|eur|gbp|inr|cad|aud)/i.test(clean)) {
        return true;
    }

    // 2. Percentages (30%, 4.5%, 100 percent)
    if (/[\d,.]+\s*(?:%|percent|percentage points)/i.test(clean)) {
        return true;
    }

    // 3. Multipliers, scale, or ranges (2x, 10x, 50k, 1.2M, 500+, 10,000)
    if (/\b\d+(?:\.\d+)?(?:x|k|m|b)\b|\b\d{1,3}(?:,\d{3})+\b|\b\d+\s*\+/i.test(clean)) {
        return true;
    }

    // 4. Technical latency, throughput, volume, speed (50ms, 120fps, 10gb, 500tb, 20tps, 5k rps)
    if (/\b\d+\s*(?:ms|fps|gb|tb|pb|kb|mb|tps|qps|rps|req\/s)\b/i.test(clean)) {
        return true;
    }

    // 5. Team size, scope, or headcount ("team of 12", "managed 8 engineers", "supervised 15 technicians")
    if (/\b(?:team of|managed|led|supervised|trained|mentored|team size of)\s+\d+\b/i.test(clean)) {
        return true;
    }

    // 6. Action-outcome verbs followed by numbers ("reduced by 40", "saved 15 hours", "increased by 25")
    if (/\b(?:reduced|cut|saved|increased|boosted|grew|accelerated|streamlined)\s+(?:by\s+)?[\d,.]+/i.test(clean)) {
        return true;
    }

    // 7. Domain business metrics (ROAS, CPA, CTR, NPS, CSAT, ARR, MRR, SLA, ROI) accompanied by a number
    if (/\b(?:roas|cpa|ctr|nps|csat|arr|mrr|sla|roi)\b/i.test(clean) && /\d+/.test(clean)) {
        return true;
    }

    // 8. General numbers — excluding standalone calendar years (1980–2035)
    const numbers = clean.match(/\b\d+\b/g) || [];
    const nonYearNumbers = numbers.filter((n) => {
        const num = parseInt(n, 10);
        return num < 1980 || num > 2035;
    });

    return nonYearNumbers.length > 0;
}

export const BULLET_PREFIX_REGEX = /^[ \t]*(?:[•*–—\-][•*–—\-\s]*|(?:\(?\d+\)?[\.\)]|\d+[-–—])[ \t]+)/;

/**
 * Checks if a bullet starts with a strong active verb.
 */
export function hasStrongActionVerb(text) {
    if (!text || typeof text !== 'string') return false;
    const clean = text.replace(BULLET_PREFIX_REGEX, '').trim();
    if (!clean) return false;
    const firstWord = clean.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '');
    return ACTION_VERBS.has(firstWord) || (Array.isArray(ATS_ACTION_VERBS) && ATS_ACTION_VERBS.includes(firstWord));
}

/**
 * Performs comprehensive analysis on an individual bullet point.
 */
export function getBulletAnalysis(text, maxLength = 260) {
    const clean = String(text || '').replace(BULLET_PREFIX_REGEX, '').trim();
    const charCount = clean.length;

    if (!clean || charCount < 15) {
        return {
            status: 'red',
            label: 'Too Short',
            badgeText: 'Draft / Too Short',
            isPassive: false,
            hasActionVerb: false,
            hasMetric: false,
            tip: 'Add what you accomplished and tools used (at least 35 characters).',
        };
    }

    const isPassive = WEAK_PASSIVE_REGEX.test(clean);
    const hasActionVerb = hasStrongActionVerb(clean);
    const hasMetric = detectLegitimateMetric(clean);

    if (charCount > maxLength) {
        return {
            status: 'red',
            label: 'Too Long',
            badgeText: 'Exceeds Length Limit',
            isPassive,
            hasActionVerb,
            hasMetric,
            tip: `Trim to under ${maxLength} characters for clean ATS layout.`,
        };
    }

    if (isPassive) {
        return {
            status: 'red',
            label: 'Passive Opener',
            badgeText: 'Needs Action Verb',
            isPassive: true,
            hasActionVerb: false,
            hasMetric,
            tip: 'Replace passive phrases like "Responsible for" with a strong action verb (e.g. Architected, Built, Optimized).',
        };
    }

    // Between 220 and maxLength (260), check if slightly long but structurally complete
    if (charCount > 220) {
        if (hasActionVerb && hasMetric) {
            return {
                status: 'amber',
                label: 'Good (Slightly Long)',
                badgeText: 'Good (Trim to ~200)',
                isPassive: false,
                hasActionVerb: true,
                hasMetric: true,
                tip: 'Strong content, but slightly long. Consider trimming under 220 characters for a crisp 2-line layout.',
            };
        }
    }

    if (hasActionVerb && hasMetric && charCount >= 35) {
        return {
            status: 'green',
            label: 'Strong',
            badgeText: 'Strong (Action + Metrics)',
            isPassive: false,
            hasActionVerb: true,
            hasMetric: true,
            tip: 'Excellent bullet point! Follows the standard ATS action-outcome framework.',
        };
    }

    if (hasActionVerb || hasMetric || charCount >= 40) {
        return {
            status: 'amber',
            label: 'Good',
            badgeText: hasActionVerb ? 'Good (Add Metrics)' : 'Needs Action Verb',
            isPassive: false,
            hasActionVerb,
            hasMetric,
            tip: hasActionVerb
                ? 'Add quantifiable impact (%, $, scale, or volume) to elevate to Strong.'
                : 'Start with a strong past-tense action verb (e.g. Built, Designed, Shipped).',
        };
    }

    return {
        status: 'red',
        label: 'Needs Work',
        badgeText: 'Needs Detail & Verb',
        isPassive: false,
        hasActionVerb: false,
        hasMetric: false,
        tip: 'Start with an action verb and add specific technologies or measurable outcomes.',
    };
}

/**
 * Parses raw text into distinct bullet items.
 */
export function extractBulletList(rawText) {
    if (!rawText || typeof rawText !== 'string') return [];
    return rawText
        .replace(/<[^>]*>/g, '')
        .split(/\r?\n/)
        .map((line) => line.replace(/^[ \t]*(?:[•*–—\-][•*–—\-\s]*|(?:\(?\d+\)?[\.\)]|\d+[-–—])[ \t]+)/, '').trim())
        .filter(Boolean);
}

/**
 * Formats an array of bullet strings into standard unicode bulleted text.
 */
export function serializeBullets(bullets = []) {
    return (bullets || [])
        .map((b) => (typeof b === 'string' ? b.trim() : ''))
        .filter(Boolean)
        .map((b) => (b.startsWith('•') ? b : `• ${b}`))
        .join('\n');
}

/**
 * Computes a role-level ATS health score and actionable checklist pills for a single employment entry.
 */
export function getRoleHealth(employment = {}, targetJd = '') {
    const title = String(employment.jobTitle || '').trim();
    const employer = String(employment.employer || '').trim();
    const begin = String(employment.begin || employment.startDate || '').trim();
    const isCurrent = Boolean(employment.current);
    const end = String(employment.end || employment.endDate || '').trim();

    const bullets = extractBulletList(employment.description);
    const bulletCount = bullets.length;

    const analyses = bullets.map(b => getBulletAnalysis(b));
    const strongBullets = analyses.filter(a => a.status === 'green').length;
    const goodBullets = analyses.filter(a => a.status === 'amber').length;
    const weakBullets = analyses.filter(a => a.isPassive || a.status === 'red').length;
    const bulletsWithVerbs = analyses.filter(a => a.hasActionVerb).length;
    const bulletsWithMetrics = analyses.filter(a => a.hasMetric).length;

    const hasTitle = Boolean(title);
    const hasEmployer = Boolean(employer);
    const hasDates = Boolean(begin && (isCurrent || end));

    // Keyword matching against Target JD
    let jdMatches = [];
    if (targetJd && targetJd.trim().length >= 10 && bulletCount > 0) {
        const jdKeywords = extractJdKeywords(targetJd);
        const roleText = `${title} ${employer} ${bullets.join(' ')}`.toLowerCase();
        jdMatches = jdKeywords
            .filter(k => roleText.includes(k.term.toLowerCase()))
            .map(k => k.term);
    }

    // Role Score calculation (out of 100)
    let score = 0;
    if (hasTitle) score += 20;
    if (hasEmployer) score += 15;
    if (hasDates) score += 15;
    if (bulletCount >= 1) score += 10;
    if (bulletCount >= 2) score += 10;
    if (bulletsWithVerbs >= 1) score += 10;
    if (bulletsWithVerbs >= 2) score += 5;
    if (bulletsWithMetrics >= 1) score += 10;
    if (bulletsWithMetrics >= 2) score += 5;

    // Action checklist pills
    const pills = [];

    // Pill 1: Role identity
    if (hasTitle && hasEmployer) {
        pills.push({ id: 'identity', ok: true, label: 'Role & Organization ✓', color: 'emerald' });
    } else {
        pills.push({ id: 'identity', ok: false, label: hasTitle ? 'Missing Employer' : 'Missing Job Title', color: 'amber' });
    }

    // Pill 2: Chronology
    if (hasDates) {
        pills.push({ id: 'dates', ok: true, label: isCurrent ? 'Present Role ✓' : 'Dates Set ✓', color: 'emerald' });
    } else {
        pills.push({ id: 'dates', ok: false, label: 'Set Start & End Dates', color: 'amber' });
    }

    // Pill 3: Bullet Count
    if (bulletCount >= 3) {
        pills.push({ id: 'bullets', ok: true, label: `${bulletCount} Bullets ✓`, color: 'emerald' });
    } else if (bulletCount >= 1) {
        pills.push({ id: 'bullets', ok: true, label: `${bulletCount} Bullet${bulletCount === 1 ? '' : 's'} (Add 2-4)`, color: 'amber' });
    } else {
        pills.push({ id: 'bullets', ok: false, label: 'Add Responsibilities', color: 'red' });
    }

    // Pill 4: Action Verbs
    if (bulletsWithVerbs >= 2) {
        pills.push({ id: 'verbs', ok: true, label: 'Action Verbs ✓', color: 'emerald' });
    } else if (bulletCount > 0) {
        pills.push({ id: 'verbs', ok: false, label: 'Start with Action Verbs', color: 'amber' });
    }

    // Pill 5: Metrics & Scale
    if (bulletsWithMetrics >= 2) {
        pills.push({ id: 'metrics', ok: true, label: `${bulletsWithMetrics} Measurable Outcomes ✓`, color: 'emerald' });
    } else if (bulletsWithMetrics === 1) {
        pills.push({ id: 'metrics', ok: true, label: '1 Metric (Add 1 More)', color: 'amber' });
    } else if (bulletCount > 0) {
        pills.push({ id: 'metrics', ok: false, label: 'Add Measurable Results (%, $, scale)', color: 'amber' });
    }

    // Pill 6: Target JD Match
    if (jdMatches.length > 0) {
        pills.push({ id: 'jd', ok: true, label: `${jdMatches.length} JD Keywords Aligned 🎯`, color: 'indigo' });
    }

    let status = 'getting-started';
    if (score >= 85) status = 'excellent';
    else if (score >= 70) status = 'strong';
    else if (score >= 45) status = 'needs-improvement';

    return {
        score: Math.min(100, score),
        status,
        hasTitle,
        hasEmployer,
        hasDates,
        bulletCount,
        strongBullets,
        goodBullets,
        weakBullets,
        bulletsWithVerbs,
        bulletsWithMetrics,
        jdMatches,
        pills,
    };
}

/**
 * Computes an education-level ATS health score and actionable checklist pills for a single qualification entry.
 */
export function getEducationHealth(education = {}, targetJd = '') {
    const school = String(education.school || education.institution || '').trim();
    const degree = String(education.degree || education.qualification || '').trim();
    const fieldOfStudy = String(education.fieldOfStudy || education.major || education.field || '').trim();
    const started = String(education.started || education.begin || education.startDate || '').trim();
    const finished = String(education.finished || education.end || education.endDate || '').trim();
    const isCurrent = Boolean(education.current || finished.toLowerCase() === 'present');
    const grade = String(education.grade || education.gpa || '').trim();

    const bullets = extractBulletList(education.description);
    const bulletCount = bullets.length;

    const hasSchool = Boolean(school);
    const hasDegree = Boolean(degree);
    const hasField = Boolean(fieldOfStudy || /\b(in|of)\s+[A-Za-z]/i.test(degree));
    const hasDates = Boolean(started || finished || isCurrent);
    const hasGrade = Boolean(grade || /\b(GPA|\d\.\d|Honors|Cum Laude|Dean'?s\s+List)\b/i.test(education.description || ''));

    // Keyword matching against Target JD
    let jdMatches = [];
    if (targetJd && targetJd.trim().length >= 10) {
        const jdKeywords = extractJdKeywords(targetJd);
        const eduText = `${school} ${degree} ${fieldOfStudy} ${bullets.join(' ')}`.toLowerCase();
        jdMatches = jdKeywords
            .filter(k => eduText.includes(k.term.toLowerCase()))
            .map(k => k.term);
    }

    // Education ATS Score calculation (pure academic credentials out of 100)
    let score = 0;
    if (hasSchool) score += 30;
    if (hasDegree) score += 30;
    if (hasField) score += 20;
    if (hasDates) score += 20;
    if (hasGrade) score += 10;

    // Action checklist pills (focused purely on ATS qualification standards)
    const pills = [];

    // Pill 1: Institution
    if (hasSchool) {
        pills.push({ id: 'school', ok: true, label: 'Institution Recognized ✓', color: 'emerald' });
    } else {
        pills.push({ id: 'school', ok: false, label: 'Missing Institution', color: 'amber' });
    }

    // Pill 2: Degree Level
    if (hasDegree) {
        pills.push({ id: 'degree', ok: true, label: 'Degree Level Set ✓', color: 'emerald' });
    } else {
        pills.push({ id: 'degree', ok: false, label: 'Missing Degree', color: 'amber' });
    }

    // Pill 3: Field of Study / Major
    if (hasField) {
        pills.push({ id: 'field', ok: true, label: 'Field of Study ✓', color: 'emerald' });
    } else {
        pills.push({ id: 'field', ok: false, label: 'Specify Major / Field', color: 'amber' });
    }

    // Pill 4: Timeline / Graduation
    if (hasDates) {
        pills.push({ id: 'dates', ok: true, label: isCurrent ? 'Currently Studying ✓' : 'Graduation Date Set ✓', color: 'emerald' });
    } else {
        pills.push({ id: 'dates', ok: false, label: 'Set Graduation Date', color: 'amber' });
    }

    // Pill 5: Honors / GPA (Optional bonus)
    if (hasGrade) {
        pills.push({ id: 'grade', ok: true, label: 'Honors & GPA Added ✓', color: 'emerald' });
    } else {
        pills.push({ id: 'grade', ok: true, label: 'Honors / GPA (Optional)', color: 'slate' });
    }

    // Pill 6: Target JD Match
    if (jdMatches.length > 0) {
        pills.push({ id: 'jd', ok: true, label: `${jdMatches.length} JD Keywords Aligned 🎯`, color: 'indigo' });
    }

    let status = 'getting-started';
    if (score >= 85) status = 'excellent';
    else if (score >= 70) status = 'strong';
    else if (score >= 45) status = 'needs-improvement';

    return {
        score: Math.min(100, score),
        status,
        hasSchool,
        hasDegree,
        hasField,
        hasDates,
        hasGrade,
        bulletCount,
        jdMatches,
        pills,
    };
}

export function ensureAtsOptimizedBullet(rawText, originalDraft = '') {
    let text = String(rawText || '')
        .replace(BULLET_PREFIX_REGEX, '')
        .replace(/["'\s]+$/g, '')
        .replace(/\\"/g, '"')
        .trim();
    if (!text) return text;

    // Formatting only. This runs on AI output and on the candidate's own text, so it
    // must never add facts: no injected metrics ("…by 20%"), no appended outcome
    // clauses, and no verb swaps that inflate the claim ("responsible for" is not
    // "Spearheaded"). Stronger phrasing is the AI's job, under grounding checks.
    text = text.charAt(0).toUpperCase() + text.slice(1);

    // Streamline verbose filler phrases that blow character counts past 200
    text = text
        .replace(/\bthrough (?:the )?optimized (?:use|utilization) of\b/gi, 'utilizing')
        .replace(/\bthrough (?:the )?application of\b/gi, 'using')
        .replace(/\bleveraging (?:the )?(?:advanced )?capabilities of\b/gi, 'using')
        .replace(/\bresponsible for the execution of\b/gi, 'executing')
        .replace(/\bwith a comprehensive focus on\b/gi, 'focusing on')
        .replace(/\bin order to achieve\b/gi, 'achieving')
        .replace(/\bin an effort to\b/gi, 'to');

    // Clean spacing and terminal punctuation
    text = text.replace(/\s{2,}/g, ' ').trim();
    if (!/[.!?]$/.test(text)) text += '.';

    return text;
}

export function getRolePlaceholder(jobTitle = '') {
    const roleLower = String(jobTitle || '').toLowerCase();
    if (/\b(?:doctor|physician|surgeon|cardiologist|pediatrician|resident|medical officer|general practitioner|gp|md|clinician)\b/.test(roleLower)) {
        return 'e.g. Diagnosed and treated 25+ daily acute and complex patient cases, maintaining a 98% patient satisfaction and clinical quality rating...';
    }
    if (/\b(?:nurse|nursing|rn|lpn|np|practitioner|clinical care)\b/.test(roleLower)) {
        return 'e.g. Administered acute bedside care and vital monitoring for 15+ patients per shift, achieving 99% medication administration accuracy...';
    }
    if (/\b(?:software|developer|frontend|backend|full\s*stack|engineer|devops|sre|cloud|architect)\b/.test(roleLower)) {
        return 'e.g. Architected distributed backend services in Go and Node.js, cutting p99 response latency by 45% for 5M+ daily requests...';
    }
    if (/\b(?:data|analyst|analytics|machine learning|ml|ai|scientist|bi)\b/.test(roleLower)) {
        return 'e.g. Engineered predictive machine learning models in Python, lifting operational forecasting accuracy by 22%...';
    }
    if (/\b(?:product|pm|owner)\b/.test(roleLower)) {
        return 'e.g. Directed product roadmap and agile sprint execution, lifting 90-day user retention by 22% across flagship products...';
    }
    if (/\b(?:sales|account executive|ae|bdr|sdr|business development|revenue)\b/.test(roleLower)) {
        return 'e.g. Exceeded annual sales quota by 125%, generating $1.4M in new enterprise contract value through strategic outreach...';
    }
    if (/\b(?:marketing|growth|seo|brand|content|campaign)\b/.test(roleLower)) {
        return 'e.g. Orchestrated multi-channel acquisition campaigns, decreasing customer acquisition cost (CAC) by 28% while doubling MQL volume...';
    }
    if (/\b(?:finance|financial|accountant|accounting|audit|controller)\b/.test(roleLower)) {
        return 'e.g. Managed month-end financial closings and audit reconciliations, completing statutory filings with zero compliance deficiencies...';
    }
    if (/\b(?:operations|supply chain|logistics|procurement|warehouse)\b/.test(roleLower)) {
        return 'e.g. Optimized warehouse fulfillment and order dispatch workflows, accelerating order turnaround time by 32%...';
    }
    if (/\b(?:hr|human resources|recruiter|recruiting|talent)\b/.test(roleLower)) {
        return 'e.g. Spearheaded full-lifecycle talent acquisition for 45+ roles, reducing average time-to-hire from 52 to 31 days...';
    }
    if (/\b(?:teacher|teaching|professor|instructor|tutor|educator)\b/.test(roleLower)) {
        return 'e.g. Delivered differentiated classroom instruction for 75+ students, raising standardized assessment pass rates by 18%...';
    }
    if (/\b(?:customer success|customer service|support|csm|client success)\b/.test(roleLower)) {
        return 'e.g. Managed enterprise customer onboarding and relationship health, achieving a 98% CSAT score across 500+ client accounts...';
    }
    if (/\b(?:legal|compliance|counsel|attorney)\b/.test(roleLower)) {
        return 'e.g. Negotiated and executed 120+ commercial agreements and vendor contracts, accelerating contract turnaround by 30%...';
    }
    return 'e.g. Delivered key operational deliverables, improving team workflow efficiency by 25% with 100% on-time milestone delivery...';
}

export function getRolePillars(jobTitle = '') {
    const roleLower = String(jobTitle || '').toLowerCase();
    if (/\b(?:doctor|physician|surgeon|cardiologist|pediatrician|resident|medical officer|general practitioner|gp|md|clinician)\b/.test(roleLower)) {
        return [
            { label: 'Clinical Care', icon: '🩺' },
            { label: 'Quality & Protocols', icon: '📋' },
            { label: 'Inpatient Rounds', icon: '🏥' },
            { label: 'Emergency Triage', icon: '⚡' },
        ];
    }
    if (/\b(?:nurse|nursing|rn|lpn|np|practitioner|clinical care)\b/.test(roleLower)) {
        return [
            { label: 'Bedside Care', icon: '🩺' },
            { label: 'Triage & Charting', icon: '📋' },
            { label: 'Patient Education', icon: '🏥' },
            { label: 'Safety & Hygiene', icon: '🛡️' },
        ];
    }
    if (/\b(?:software|developer|frontend|backend|full\s*stack|engineer|devops|sre|cloud|architect)\b/.test(roleLower)) {
        return [
            { label: 'System Architecture', icon: '⚙️' },
            { label: 'Performance Optimization', icon: '⚡' },
            { label: 'Reliability & CI/CD', icon: '🚀' },
            { label: 'Code Quality', icon: '🧪' },
        ];
    }
    if (/\b(?:data|analyst|analytics|machine learning|ml|ai|scientist|bi)\b/.test(roleLower)) {
        return [
            { label: 'Machine Learning', icon: '🤖' },
            { label: 'Data Pipelines', icon: '🔄' },
            { label: 'Business Insights', icon: '📊' },
            { label: 'Data Quality', icon: '🛡️' },
        ];
    }
    if (/\b(?:product|pm|owner)\b/.test(roleLower)) {
        return [
            { label: 'Product Roadmap', icon: '🗺️' },
            { label: 'User Discovery', icon: '🔍' },
            { label: 'Funnel Optimization', icon: '📈' },
            { label: 'Feature Delivery', icon: '🎯' },
        ];
    }
    if (/\b(?:sales|account executive|ae|bdr|sdr|business development|revenue)\b/.test(roleLower)) {
        return [
            { label: 'Quota Attainment', icon: '💰' },
            { label: 'Pipeline Growth', icon: '📊' },
            { label: 'Client Renewals', icon: '🤝' },
            { label: 'Sales Pitch', icon: '🎯' },
        ];
    }
    if (/\b(?:marketing|growth|seo|brand|content|campaign)\b/.test(roleLower)) {
        return [
            { label: 'Paid Acquisition', icon: '🎯' },
            { label: 'Organic Growth', icon: '🚀' },
            { label: 'Conversion Lift', icon: '🧪' },
            { label: 'Brand Reach', icon: '📢' },
        ];
    }
    if (/\b(?:finance|financial|accountant|accounting|audit|controller)\b/.test(roleLower)) {
        return [
            { label: 'Financial Reporting', icon: '📑' },
            { label: 'Cost Reduction', icon: '📉' },
            { label: 'Forecasting', icon: '📊' },
            { label: 'Internal Controls', icon: '🛡️' },
        ];
    }
    if (/\b(?:operations|supply chain|logistics|procurement|warehouse)\b/.test(roleLower)) {
        return [
            { label: 'Fulfillment Turnaround', icon: '📦' },
            { label: 'Vendor Negotiation', icon: '🤝' },
            { label: 'Process Improvement', icon: '⚙️' },
            { label: 'Inventory Control', icon: '📋' },
        ];
    }
    if (/\b(?:hr|human resources|recruiter|recruiting|talent)\b/.test(roleLower)) {
        return [
            { label: 'Full-Cycle Hiring', icon: '👥' },
            { label: 'Employee Retention', icon: '🌱' },
            { label: 'HR Operations', icon: '📋' },
            { label: 'Talent Outreach', icon: '🌟' },
        ];
    }
    if (/\b(?:teacher|teaching|professor|instructor|tutor|educator)\b/.test(roleLower)) {
        return [
            { label: 'Student Achievement', icon: '🎓' },
            { label: 'Curriculum Design', icon: '📚' },
            { label: 'Mentorship', icon: '🤝' },
            { label: 'Academic Standards', icon: '📋' },
        ];
    }
    if (/\b(?:customer success|customer service|support|csm|client success)\b/.test(roleLower)) {
        return [
            { label: 'CSAT & NPS Lift', icon: '⭐' },
            { label: 'Ticket Resolution', icon: '⚡' },
            { label: 'Churn Prevention', icon: '🛡️' },
            { label: 'Account Expansion', icon: '📈' },
        ];
    }
    return [
        { label: 'Operational Execution', icon: '🎯' },
        { label: 'Process Optimization', icon: '⚡' },
        { label: 'Strategic Initiatives', icon: '🚀' },
        { label: 'Quality Standards', icon: '🛡️' },
    ];
}

// generateClientRoleBullet (role-template bullets with invented metrics) was
// removed: when AI is unavailable the editor shows a notice instead.
