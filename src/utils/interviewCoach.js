export const INTERVIEW_MODES = {
    live: { id: 'live', label: 'Live AI', timerRequired: false, allowPause: true, freeNav: true },
    practice: { id: 'practice', label: 'Practice', timerRequired: false, allowPause: true, freeNav: true },
    mock: { id: 'mock', label: 'Mock Interview', timerRequired: true, allowPause: true, freeNav: true },
    assessment: { id: 'assessment', label: 'CBT Assessment', timerRequired: true, allowPause: false, freeNav: true },
};

export const DURATION_PRESETS = [15, 30, 45, 60];

export const INTERVIEW_TYPES = [
    { id: 'technical', label: 'Technical' },
    { id: 'behavioral', label: 'Behavioral' },
    { id: 'hr', label: 'HR' },
    { id: 'managerial', label: 'Managerial' },
    { id: 'case', label: 'Case Study' },
    { id: 'mixed', label: 'Mixed' },
];

export const EXPERIENCE_LEVELS = [
    { id: 'fresher', label: 'Fresher' },
    { id: 'junior', label: 'Junior' },
    { id: 'mid', label: 'Mid-level' },
    { id: 'senior', label: 'Senior' },
    { id: 'lead', label: 'Lead' },
    { id: 'executive', label: 'Executive' },
];

export const DIFFICULTIES = [
    { id: 'easy', label: 'Easy' },
    { id: 'medium', label: 'Medium' },
    { id: 'hard', label: 'Hard' },
    { id: 'expert', label: 'Expert' },
];

export function resolveDurationSeconds({ presetMinutes, customMinutes, timerEnabled }) {
    if (timerEnabled === false) return 0;
    const minutes = Number(presetMinutes === 'custom' ? customMinutes : presetMinutes);
    if (!Number.isFinite(minutes) || minutes < 5) return 15 * 60;
    return Math.min(180, Math.max(5, Math.round(minutes))) * 60;
}

export function remainingFromDeadline(deadlineAt, now = Date.now()) {
    if (!deadlineAt) return null;
    return Math.max(0, Math.floor((Number(deadlineAt) - now) / 1000));
}

export function formatClock(seconds) {
    const total = Math.max(0, Number(seconds) || 0);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const rest = total % 60;
    if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
    return `${minutes}:${String(rest).padStart(2, '0')}`;
}

export function paletteStatus({ questionId, currentId, answers, visited, marked }) {
    if (questionId === currentId) return 'current';
    const answered = Object.prototype.hasOwnProperty.call(answers || {}, questionId);
    const isMarked = (marked || new Set()).has(questionId);
    if (answered && isMarked) return 'answered-review';
    if (isMarked) return 'review';
    if (answered) return 'answered';
    if ((visited || new Set()).has(questionId)) return 'visited';
    return 'not-visited';
}

export const PALETTE_META = {
    current: { label: 'Current', letter: 'C', className: 'bg-indigo-700 text-white ring-2 ring-offset-1 ring-indigo-400' },
    answered: { label: 'Answered', letter: 'A', className: 'bg-emerald-600 text-white' },
    'answered-review': { label: 'Answered + Review', letter: 'R', className: 'bg-violet-700 text-white' },
    review: { label: 'Marked for Review', letter: 'M', className: 'bg-amber-500 text-slate-900' },
    visited: { label: 'Visited', letter: 'V', className: 'bg-red-100 text-red-800 border border-red-300' },
    'not-visited': { label: 'Not Visited', letter: 'N', className: 'bg-slate-200 text-slate-700' },
};

export function sanitizeResumeFacts(resume) {
    if (!resume || typeof resume !== 'object') return '';
    const source = resume.item && typeof resume.item === 'object' ? { ...resume, ...resume.item } : resume;
    const lines = [];
    const name = [source.firstname, source.lastname].filter(Boolean).join(' ').trim();
    if (name) lines.push(`Name: ${name}`);
    if (source.occupation) lines.push(`Occupation: ${String(source.occupation).slice(0, 160)}`);
    if (source.summary) lines.push(`Summary: ${String(source.summary).replace(/<[^>]+>/g, '').slice(0, 500)}`);
    const jobs = (source.employments || []).slice(0, 6).map(job => {
        const title = job.jobTitle || job.title || '';
        const employer = job.employer || job.company || '';
        return [title, employer].filter(Boolean).join(' at ');
    }).filter(Boolean);
    if (jobs.length) lines.push(`Work: ${jobs.join('; ').slice(0, 600)}`);
    const projects = (source.projects || []).slice(0, 5).map(project => project.title || project.name).filter(Boolean);
    if (projects.length) lines.push(`Projects: ${projects.join(', ').slice(0, 400)}`);
    const skills = (source.skills || []).slice(0, 16).map(skill => skill.name || skill.skillName || skill.skill).filter(Boolean);
    if (skills.length) lines.push(`Skills: ${skills.join(', ').slice(0, 400)}`);
    const certs = (source.certifications || []).slice(0, 8).map(item => item.title || item.name).filter(Boolean);
    if (certs.length) lines.push(`Certifications: ${certs.join(', ').slice(0, 300)}`);
    const education = (source.educations || source.education || []).slice(0, 4).map(item => [item.degree, item.school].filter(Boolean).join(' — ')).filter(Boolean);
    if (education.length) lines.push(`Education: ${education.join('; ').slice(0, 300)}`);
    return lines.join('\n').slice(0, 2500);
}

// Deterministic multi-pass cleaner to strip any leaked UI labels, form headers, or robotic preambles.
export function cleanInterviewMetadataArtifacts(text) {
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

export function sanitizeJobDescription(text) {
    if (!text || typeof text !== 'string') return '';
    const clean = cleanInterviewMetadataArtifacts(text);
    return clean.replace(/\s+/g, ' ').trim().slice(0, 4000);
}

export function buildInterviewReport({ questions = [], answers = {}, timePerQuestion = {}, timeLimit = 0, timeRemaining = 0, interviewType = 'technical', jobDescription = '' }) {
    const total = questions.length || 1;
    const rows = questions.map((question, index) => {
        const userAnswer = answers[question.id];
        const answered = userAnswer !== undefined && userAnswer !== null && userAnswer !== '';
        const correct = answered && Number(userAnswer) === Number(question.correctAnswer);
        const optionText = answered && Array.isArray(question.options) ? question.options[userAnswer] : '';
        const ideal = Array.isArray(question.options) ? question.options[question.correctAnswer] : '';
        return {
            id: question.id,
            index: index + 1,
            question: question.question,
            category: question.category || interviewType,
            difficulty: question.difficulty || 'Intermediate',
            userAnswer: optionText || (answered ? String(userAnswer) : ''),
            idealAnswer: ideal,
            explanation: question.explanation || '',
            correct,
            answered,
            score: correct ? 100 : answered ? 25 : 0,
            whatWasGood: correct ? 'Selected the accurate option and demonstrated role knowledge.' : answered ? 'Attempted the question and engaged with the scenario.' : 'No answer recorded.',
            whatWasMissing: correct ? 'Nothing material for this item.' : answered ? 'The chosen option missed the key criterion in the explanation.' : 'No response was submitted.',
            improvement: correct ? 'Keep using a structured, evidence-based approach.' : 'State the action and a measurable outcome before concluding.',
            timeMs: timePerQuestion[question.id] || 0,
        };
    });
    const answeredCount = rows.filter(row => row.answered).length;
    const overall = Math.round(rows.reduce((sum, row) => sum + row.score, 0) / total);
    const byCategory = {};
    rows.forEach(row => {
        if (!byCategory[row.category]) byCategory[row.category] = { total: 0, score: 0 };
        byCategory[row.category].total += 1;
        byCategory[row.category].score += row.score;
    });
    const categoryScores = Object.fromEntries(Object.entries(byCategory).map(([key, value]) => [key, Math.round(value.score / value.total)]));
    const strengths = rows.filter(row => row.score >= 100).map(row => row.category);
    const weaknesses = rows.filter(row => row.score < 70).map(row => ({
        area: row.category,
        detail: row.whatWasMissing,
    }));
    const jdTerms = sanitizeJobDescription(jobDescription)
        .split(/[,.;\n]/)
        .map(part => part.trim())
        .filter(part => part.length > 3)
        .slice(0, 8);
    const missingSkills = jdTerms.map(term => ({
        requirement: term,
        resumeEvidence: 'Only facts supplied at setup were used; nothing extra was inferred.',
        interviewEvidence: rows.some(row => String(row.question).toLowerCase().includes(term.toLowerCase()) && row.correct) ? 'Demonstrated' : 'Not demonstrated',
        gap: rows.some(row => String(row.question).toLowerCase().includes(term.toLowerCase()) && row.correct) ? 'Covered' : 'Rehearse this requirement with a STAR example.',
    }));
    return {
        overall,
        readiness: overall >= 80 ? 'Interview ready' : overall >= 60 ? 'Nearly ready' : 'Needs rehearsal',
        completionRate: Math.round((answeredCount / total) * 100),
        timeUsed: Math.max(0, timeLimit - timeRemaining),
        timeLimit,
        categoryScores,
        questions: rows,
        strengths: [...new Set(strengths)].slice(0, 6),
        weaknesses: weaknesses.slice(0, 8),
        missingSkills,
        plan: {
            immediate: ['Rewrite weak answers with Situation → Action → Result.', 'Add one metric to every example.'],
            sevenDay: ['Day 1–2: role fundamentals', 'Day 3–4: STAR stories from real resume facts', 'Day 5–6: timed mock', 'Day 7: review weakest categories'],
        },
    };
}

// ── AI OUTPUT VALIDATION ─────────────────────────────────────────────────────
// The frontend never blindly trusts model-generated structures: every question
// coming from the network or from persisted storage is normalized through here
// before it can reach the exam renderer.
export function normalizeQuestions(rawQuestions) {
    if (!Array.isArray(rawQuestions)) return [];
    const cleaned = [];
    rawQuestions.forEach((question, index) => {
        if (!question || typeof question !== 'object') return;
        const rawText = typeof question.question === 'string' ? question.question.trim().slice(0, 1000) : '';
        const text = cleanInterviewMetadataArtifacts(rawText);
        if (!text) return;
        const options = (Array.isArray(question.options) ? question.options : [])
            .map(option => cleanInterviewMetadataArtifacts((typeof option === 'string' ? option.trim() : String(option ?? '').trim()).slice(0, 500)))
            .filter(option => option.length > 0)
            .slice(0, 6);
        if (options.length < 2) return;
        const correct = Number(question.correctAnswer);
        if (!Number.isInteger(correct) || correct < 0 || correct >= options.length) return;
        const id = question.id !== undefined && question.id !== null && String(question.id).length > 0
            ? String(question.id).slice(0, 64)
            : `q-${index + 1}`;
        cleaned.push({
            id,
            question: text,
            options,
            correctAnswer: correct,
            category: typeof question.category === 'string' && question.category.trim() ? question.category.trim().slice(0, 80) : '',
            difficulty: typeof question.difficulty === 'string' && question.difficulty.trim() ? question.difficulty.trim().slice(0, 40) : '',
            explanation: typeof question.explanation === 'string' ? question.explanation.trim().slice(0, 1200) : '',
            estimatedTime: Number.isFinite(Number(question.estimatedTime)) ? Math.min(600, Math.max(30, Math.round(Number(question.estimatedTime)))) : null,
        });
    });
    const seen = new Set();
    return cleaned.map((question, index) => {
        let id = question.id;
        if (seen.has(id)) id = `${id}-${index + 1}`;
        seen.add(id);
        return { ...question, id };
    });
}

export function validateInterviewPayload(data) {
    if (!data || typeof data !== 'object') return null;
    const questions = normalizeQuestions(data.questions);
    if (!questions.length) return null;
    return {
        title: typeof data.title === 'string' ? data.title.slice(0, 160) : '',
        company: typeof data.company === 'string' ? data.company.slice(0, 120) : '',
        department: typeof data.department === 'string' ? data.department.slice(0, 120) : '',
        duration: typeof data.duration === 'string' ? data.duration.slice(0, 60) : '',
        totalQuestions: questions.length,
        questions,
    };
}

// ── SESSION PERSISTENCE (UID-SCOPED, SCHEMA-VERSIONED) ───────────────────────
export const SESSION_SCHEMA_VERSION = 3;
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
export const HISTORY_LIMIT = 25;

export function sessionStorageKey(userId) {
    return userId ? `interviewSession:${userId}` : 'interviewProgress';
}

export function historyStorageKey(userId) {
    return userId ? `interviewHistory:${userId}` : 'interviewHistory:guest';
}

export function writeOwnerSession(userId, payload) {
    try {
        // Live state belongs to the authenticated server session. Even if a
        // future caller accidentally hands us transcript/answer fields, never
        // put them in local storage alongside the recovery pointer.
        const safePayload = payload?.phase === 'live'
            ? {
                phase: 'live',
                sessionId: String(payload.sessionId || '').slice(0, 128),
                ownerUid: payload.ownerUid || userId || null,
                tabId: typeof payload.tabId === 'string' ? payload.tabId.slice(0, 160) : undefined,
            }
            : payload;
        localStorage.setItem(sessionStorageKey(userId), JSON.stringify({
            ...safePayload,
            schemaVersion: SESSION_SCHEMA_VERSION,
            lastSaved: Date.now(),
        }));
    } catch { /* optional */ }
}

export function readOwnerSession(userId) {
    let parsed = null;
    try {
        const raw = localStorage.getItem(sessionStorageKey(userId)) || (!userId ? localStorage.getItem('interviewProgress') : null);
        if (!raw) return null;
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.schemaVersion !== undefined && Number(parsed.schemaVersion) > SESSION_SCHEMA_VERSION) return null;
    if (!parsed.lastSaved || Date.now() - parsed.lastSaved > SESSION_TTL_MS) return null;
    if (userId && parsed.ownerUid && parsed.ownerUid !== userId) return null;
    if (parsed.phase === 'exam') {
        const questions = normalizeQuestions(parsed.interviewData?.questions);
        if (!questions.length) return null;
        parsed.interviewData = { ...(parsed.interviewData || {}), questions };
    } else if (parsed.phase === 'live') {
        // The durable API owns live state; browser storage intentionally retains
        // only an opaque recovery pointer rather than answers or AI feedback.
        if (!/^[A-Za-z0-9_-]{16,128}$/.test(String(parsed.sessionId || ''))) return null;
    } else if (parsed.phase !== 'setup') {
        return null;
    }
    // Historical setup snapshots carried no active interview state. Keep them
    // readable for migration compatibility; the dashboard self-heals them.
    return parsed;
}

// Self-heals storage: removes sessions that readOwnerSession would reject
// (corrupt JSON, expired TTL, incompatible future schema, malformed exam/live pointers)
// while never deleting another owner's data.
export function purgeStaleOwnerSession(userId) {
    try {
        const key = sessionStorageKey(userId);
        const raw = localStorage.getItem(key);
        if (!raw) return false;
        let parsed = null;
        try { parsed = JSON.parse(raw); } catch { localStorage.removeItem(key); return true; }
        if (!parsed || typeof parsed !== 'object') { localStorage.removeItem(key); return true; }
        if (userId && parsed.ownerUid && parsed.ownerUid !== userId) return false;
        const expired = !parsed.lastSaved || Date.now() - parsed.lastSaved > SESSION_TTL_MS;
        const futureSchema = parsed.schemaVersion !== undefined && Number(parsed.schemaVersion) > SESSION_SCHEMA_VERSION;
        const invalidExam = parsed.phase === 'exam' && !normalizeQuestions(parsed.interviewData?.questions).length;
        const invalidLive = parsed.phase === 'live' && !/^[A-Za-z0-9_-]{16,128}$/.test(String(parsed.sessionId || ''));
        if (expired || futureSchema || invalidExam || invalidLive || !['exam', 'live'].includes(parsed.phase)) {
            localStorage.removeItem(key);
            return true;
        }
        return false;
    } catch {
        return false;
    }
}

export function clearOwnerSession(userId) {
    try {
        localStorage.removeItem(sessionStorageKey(userId));
        localStorage.removeItem('interviewProgress');
    } catch { /* optional */ }
}

// ── HISTORY (UID-SCOPED, SANITIZED, STABLE ORDER) ────────────────────────────
export function readHistory(userId) {
    let list = [];
    try {
        const raw = localStorage.getItem(historyStorageKey(userId));
        const parsed = raw ? JSON.parse(raw) : [];
        list = Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
    return list
        .filter(item => item && typeof item === 'object' && (!userId || !item.ownerUid || item.ownerUid === userId))
        .map((item, index) => ({
            ...item,
            id: item.id !== undefined && item.id !== null && String(item.id).length > 0 ? String(item.id) : `iv-legacy-${index}`,
            completedAt: item.completedAt || new Date(0).toISOString(),
            score: Number.isFinite(Number(item.score)) ? Number(item.score) : 0,
        }))
        .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
}

export function appendHistory(userId, entry) {
    if (!entry || typeof entry !== 'object') return readHistory(userId);
    const id = entry.id !== undefined && entry.id !== null && String(entry.id).length > 0
        ? String(entry.id)
        : `iv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const next = [
        { ...entry, id, ownerUid: userId || null },
        ...readHistory(userId).filter(item => item.id !== id),
    ].slice(0, HISTORY_LIMIT);
    try { localStorage.setItem(historyStorageKey(userId), JSON.stringify(next)); } catch { /* optional */ }
    return next;
}

export function removeHistoryEntry(userId, entryId) {
    const next = readHistory(userId).filter(item => String(item.id) !== String(entryId));
    try { localStorage.setItem(historyStorageKey(userId), JSON.stringify(next)); } catch { /* optional */ }
    return next;
}

export function clearAllHistory(userId) {
    try { localStorage.setItem(historyStorageKey(userId), JSON.stringify([])); } catch { /* optional */ }
    return [];
}

export function scoreTrend(history) {
    return (history || []).slice().reverse().map(item => ({
        date: item.completedAt,
        score: Number(item.score) || 0,
        type: item.interviewType,
    }));
}

// Bounded, privacy-preserving list of the most recent question texts for the same
// role + interview type, used so generation can avoid repeating them. Kept small on
// purpose — we never ship unlimited history into the prompt.
export function recentInterviewQuestions(history, { role, interviewType, limit = 8 } = {}) {
    if (!Array.isArray(history)) return [];
    const normalizedRole = String(role || '').trim().toLowerCase();
    const normalizedType = String(interviewType || '').toLowerCase();
    const out = [];
    const recent = (history || [])
        .filter(item => item && typeof item === 'object')
        .filter(item => !normalizedRole || String(item.role || '').trim().toLowerCase() === normalizedRole)
        .filter(item => !normalizedType || String(item.interviewType || '').trim().toLowerCase() === normalizedType)
        .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
    for (const item of recent) {
        const questions = (item.interviewData?.questions || item.questions || [])
            .map(q => (q && typeof q.question === 'string' ? q.question.trim() : ''))
            .filter(Boolean);
        for (const q of questions) {
            out.push(q);
            if (out.length >= limit) return out;
        }
    }
    return out;
}

// ── KEYBOARD SHORTCUT SAFETY ─────────────────────────────────────────────────
const TEXT_INPUT_TYPES = new Set([
    'text', 'search', 'email', 'url', 'password', 'number', 'tel',
    'date', 'time', 'datetime-local', 'month', 'week',
]);

// True when a keydown originates from a control where the user is typing or
// where the control consumes keys natively (shortcuts must not fire).
export function isTextEntryTarget(target) {
    if (!target || typeof target !== 'object') return false;
    const tag = String(target.tagName || '').toUpperCase();
    if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (target.isContentEditable) return true;
    if (tag === 'INPUT') {
        const type = String(target.type || 'text').toLowerCase();
        return TEXT_INPUT_TYPES.has(type);
    }
    return false;
}

// Radio groups, selects and text fields consume arrow keys natively; the CBT
// layer must not hijack them while such a control is focused.
export function consumesArrowKeys(target) {
    if (!target || typeof target !== 'object') return false;
    const tag = String(target.tagName || '').toUpperCase();
    return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || !!target.isContentEditable;
}

export function optionIndexFromKey(key, optionCount) {
    if (typeof key !== 'string' || key.length !== 1) return null;
    const count = Number(optionCount) || 0;
    if (count < 2) return null;
    const lower = key.toLowerCase();
    const code = lower.charCodeAt(0);
    let index = null;
    if (code >= 97 && code <= 122) index = code - 97;
    else if (code >= 49 && code <= 57) index = code - 49;
    if (index === null || index < 0 || index >= count) return null;
    return index;
}

// ── TIMER ACCESSIBILITY ──────────────────────────────────────────────────────
const TIMER_MILESTONES = {
    600: '10 minutes remaining',
    300: '5 minutes remaining',
    60: '1 minute remaining',
    30: '30 seconds remaining',
    10: '10 seconds remaining',
    0: 'Time is up. Your assessment is being submitted automatically.',
};

export function timerAnnouncement(seconds) {
    const value = Math.max(0, Math.floor(Number(seconds) || 0));
    return Object.prototype.hasOwnProperty.call(TIMER_MILESTONES, value) ? TIMER_MILESTONES[value] : null;
}

// ── MULTI-TAB CONFLICT RESOLUTION ────────────────────────────────────────────
// Decides what the current tab should do when another tab writes the same
// UID-scoped session key. Deterministic: the most recent write wins. Strict
// inequality guarantees two tabs can never simultaneously claim (and both
// close) the session; equal timestamps defer to the next write.
export function resolveStorageConflict(parsed, { tabId, lastWriteAt }) {
    if (!parsed || typeof parsed !== 'object') return 'ignore';
    if (typeof parsed.tabId === 'string' && parsed.tabId === tabId) return 'ignore';
    const theirWriteAt = Number(parsed.lastSaved) || 0;
    const ourWriteAt = Number(lastWriteAt) || 0;
    return theirWriteAt > ourWriteAt ? 'yield' : 'ignore';
}

// ── STAR MARKDOWN EXPORT ─────────────────────────────────────────────────────
export function buildStarMarkdown({ report, meta = {} }) {
    if (!report || typeof report !== 'object') return '';
    const role = String(meta.role || meta.occupation || 'Target Role').trim() || 'Target Role';
    const completed = meta.completedAt ? new Date(meta.completedAt) : new Date();
    const dateLabel = Number.isFinite(completed.getTime()) ? completed.toLocaleDateString() : new Date().toLocaleDateString();
    const rows = Array.isArray(report.questions) ? report.questions : [];
    const answeredCount = rows.filter(row => row.answered).length;
    const lines = [];

    lines.push(`# Interview STAR Summary — ${role}`);
    lines.push('');
    lines.push(`- **Track:** ${String(meta.interviewType || 'technical')}`);
    lines.push(`- **Mode:** ${String(meta.mode || 'assessment')}`);
    lines.push(`- **Completed:** ${dateLabel}`);
    if (meta.submissionReason === 'timeout') lines.push('- **Submission:** Auto-submitted when the timer expired');
    lines.push(`- **Overall Score:** ${report.overall}% — ${report.readiness}`);
    lines.push(`- **Completion:** ${report.completionRate}% (${answeredCount}/${rows.length} answered)`);
    lines.push(`- **Time Used:** ${formatClock(report.timeUsed)}${report.timeLimit ? ` of ${formatClock(report.timeLimit)}` : ''}`);

    const categories = Object.entries(report.categoryScores || {});
    if (categories.length) {
        lines.push('');
        lines.push('## Category Breakdown');
        lines.push('');
        lines.push('| Category | Score |');
        lines.push('| --- | --- |');
        categories.forEach(([name, score]) => lines.push(`| ${name} | ${score}% |`));
    }

    lines.push('');
    lines.push('## Demonstrated Strengths');
    lines.push('');
    if (report.strengths?.length) report.strengths.forEach(item => lines.push(`- ${item}`));
    else lines.push('- None identified yet — review the model answers below.');

    lines.push('');
    lines.push('## Focus & Improvement Areas');
    lines.push('');
    if (report.weaknesses?.length) report.weaknesses.forEach(item => lines.push(`- **${item.area}:** ${item.detail}`));
    else lines.push('- No major weaknesses identified.');

    lines.push('');
    lines.push('## Question-by-Question STAR Coaching');
    lines.push('');
    rows.forEach(row => {
        lines.push(`### Q${row.index}. ${row.question}`);
        lines.push('');
        lines.push(`- **Result:** ${row.correct ? 'Correct' : row.answered ? 'Needs work' : 'Unanswered'}`);
        lines.push(`- **Your answer:** ${row.userAnswer || '— no answer selected'}`);
        lines.push(`- **Model answer:** ${row.idealAnswer || '—'}`);
        lines.push(`- **What was good:** ${row.whatWasGood || '—'}`);
        lines.push(`- **What was missing:** ${row.whatWasMissing || '—'}`);
        lines.push(`- **STAR recommendation:** ${row.improvement || '—'}`);
        if (row.explanation) lines.push(`- **Concept:** ${row.explanation}`);
        lines.push('');
    });

    const plan = [...(report.plan?.immediate || []), ...(report.plan?.sevenDay || [])];
    lines.push('## 7-Day Action Plan');
    lines.push('');
    plan.forEach((item, index) => lines.push(`${index + 1}. ${item}`));

    if (report.missingSkills?.length) {
        lines.push('');
        lines.push('## Job Description Alignment');
        lines.push('');
        report.missingSkills.forEach(item => lines.push(`- **${item.requirement}:** ${item.gap}`));
    }

    lines.push('');
    lines.push('_Generated by IME365 Interview Coach._');
    return lines.join('\n');
}

// ── CLIPBOARD & DOWNLOAD HELPERS ─────────────────────────────────────────────
export async function copyTextToClipboard(text) {
    const value = String(text ?? '');
    if (!value) return { ok: false, reason: 'empty' };
    try {
        if (typeof navigator !== 'undefined' && navigator?.clipboard?.writeText) {
            await navigator.clipboard.writeText(value);
            return { ok: true, method: 'async' };
        }
    } catch { /* fall through to the legacy path */ }
    try {
        if (typeof document === 'undefined' || typeof document.execCommand !== 'function') {
            return { ok: false, reason: 'unavailable' };
        }
        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.top = '-9999px';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        if (typeof textarea.setSelectionRange === 'function') textarea.setSelectionRange(0, value.length);
        const copied = document.execCommand('copy');
        textarea.remove();
        return copied ? { ok: true, method: 'legacy' } : { ok: false, reason: 'copy-rejected' };
    } catch {
        return { ok: false, reason: 'unavailable' };
    }
}

export function downloadTextFile(filename, text, mimeType = 'text/plain') {
    try {
        if (typeof document === 'undefined' || typeof Blob === 'undefined'
            || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return false;
        const blob = new Blob([String(text ?? '')], { type: `${mimeType};charset=utf-8` });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = String(filename || 'download.txt').replace(/[^\w.-]+/g, '-');
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return true;
    } catch {
        return false;
    }
}
