export const INTERVIEW_MODES = {
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

export function paletteStatus({ questionId, currentId, answers, visited, marked, markedAndAnswered }) {
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

export function sanitizeJobDescription(text) {
    return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 4000);
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

export function sessionStorageKey(userId) {
    return userId ? `interviewSession:${userId}` : 'interviewProgress';
}

export function historyStorageKey(userId) {
    return userId ? `interviewHistory:${userId}` : 'interviewHistory:guest';
}

export function writeOwnerSession(userId, payload) {
    try {
        localStorage.setItem(sessionStorageKey(userId), JSON.stringify({ ...payload, lastSaved: Date.now() }));
    } catch { /* optional */ }
}

export function readOwnerSession(userId) {
    try {
        const raw = localStorage.getItem(sessionStorageKey(userId)) || (!userId ? localStorage.getItem('interviewProgress') : null);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed?.lastSaved || Date.now() - parsed.lastSaved > 24 * 60 * 60 * 1000) return null;
        if (userId && parsed.ownerUid && parsed.ownerUid !== userId) return null;
        return parsed;
    } catch {
        return null;
    }
}

export function clearOwnerSession(userId) {
    try {
        localStorage.removeItem(sessionStorageKey(userId));
        localStorage.removeItem('interviewProgress');
    } catch { /* optional */ }
}

export function readHistory(userId) {
    try {
        const raw = localStorage.getItem(historyStorageKey(userId));
        const list = raw ? JSON.parse(raw) : [];
        return Array.isArray(list) ? list.filter(item => !userId || !item.ownerUid || item.ownerUid === userId) : [];
    } catch {
        return [];
    }
}

export function appendHistory(userId, entry) {
    const list = readHistory(userId);
    const next = [{ ...entry, ownerUid: userId || null, id: entry.id || `iv-${Date.now()}` }, ...list].slice(0, 25);
    try { localStorage.setItem(historyStorageKey(userId), JSON.stringify(next)); } catch { /* optional */ }
    return next;
}

export function scoreTrend(history) {
    return (history || []).slice().reverse().map(item => ({
        date: item.completedAt,
        score: Number(item.score) || 0,
        type: item.interviewType,
    }));
}
