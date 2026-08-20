import React, { useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
    FaArrowLeft, FaArrowRight, FaAward, FaBrain, FaBriefcase, FaBullseye,
    FaCalendarAlt, FaCheck, FaCheckCircle, FaChevronDown, FaChevronRight,
    FaClock, FaDownload, FaExclamationTriangle, FaFileAlt, FaFlag, FaGraduationCap,
    FaKeyboard, FaLaptopCode, FaLightbulb, FaMagic, FaPlay, FaPrint, FaRedo, FaRegClipboard,
    FaSave, FaSignOutAlt, FaTimes, FaTrashAlt, FaTrophy, FaUserTie,
} from 'react-icons/fa';
import { AuthContext } from '../../../main';
import { generateUserAiContent } from '../../../services/aiService';
import { getResumes } from '../../../firestore/dbOperations';
import {
    DIFFICULTIES, DURATION_PRESETS, EXPERIENCE_LEVELS, INTERVIEW_MODES, INTERVIEW_TYPES, PALETTE_META,
    appendHistory, buildInterviewReport, buildStarMarkdown, clearAllHistory, clearOwnerSession,
    consumesArrowKeys, copyTextToClipboard, downloadTextFile, formatClock, isTextEntryTarget,
    optionIndexFromKey, paletteStatus, readHistory, readOwnerSession, recentInterviewQuestions,
    remainingFromDeadline, removeHistoryEntry, resolveDurationSeconds, resolveStorageConflict,
    sanitizeJobDescription, sanitizeResumeFacts, scoreTrend, purgeStaleOwnerSession,
    timerAnnouncement, validateInterviewPayload, writeOwnerSession,
} from '../../../utils/interviewCoach';

const POPULAR_ROLES = [
    { title: 'Frontend Developer', type: 'technical' },
    { title: 'Fullstack Engineer', type: 'technical' },
    { title: 'Backend Developer', type: 'technical' },
    { title: 'Product Manager', type: 'managerial' },
    { title: 'Data Analyst / Scientist', type: 'technical' },
    { title: 'DevOps & Cloud Engineer', type: 'technical' },
    { title: 'UI/UX Designer', type: 'case' },
    { title: 'Engineering Lead', type: 'managerial' },
];

const EXAM_PERSIST_DEBOUNCE_MS = 600;
const EXAM_HEARTBEAT_MS = 5000;

const initialState = {
    phase: 'setup',
    mode: 'assessment',
    occupation: '',
    interviewType: 'technical',
    experienceLevel: 'mid',
    difficulty: 'medium',
    questionCount: 10,
    durationPreset: 30,
    customMinutes: 25,
    timerEnabled: true,
    jobDescription: '',
    resumeLabel: '',
    resumeFacts: '',
    currentQuestion: 0,
    selectedAnswers: {},
    marked: [],
    visited: [],
    isPaused: false,
    timeRemaining: 1800,
    timeLimit: 1800,
    deadlineAt: null,
    timePerQuestion: {},
    questionStartTime: null,
    interviewData: null,
    isLoading: false,
    loadingError: null,
    confirmFinish: false,
    warnExpiry: false,
    report: null,
    reportMeta: null,
    historyId: null,
};

function asSet(list) {
    return new Set(Array.isArray(list) ? list : []);
}

function interviewReducer(state, action) {
    switch (action.type) {
        case 'PATCH':
            return { ...state, ...action.patch };
        case 'START_FETCH':
            return { ...state, isLoading: true, loadingError: null };
        case 'FETCH_OK': {
            const firstId = action.data?.questions?.[0]?.id;
            return {
                ...state,
                isLoading: false,
                interviewData: action.data,
                phase: 'exam',
                currentQuestion: 0,
                selectedAnswers: {},
                marked: [],
                visited: firstId !== undefined ? [firstId] : [],
                questionStartTime: Date.now(),
                deadlineAt: state.timeLimit > 0 ? Date.now() + state.timeLimit * 1000 : null,
                timeRemaining: state.timeLimit,
            };
        }
        case 'FETCH_ERR':
            return { ...state, isLoading: false, loadingError: action.error };
        case 'FETCH_CANCEL':
            return { ...state, isLoading: false, loadingError: null };
        case 'ANSWER':
            return { ...state, selectedAnswers: { ...state.selectedAnswers, [action.questionId]: action.answerIndex } };
        case 'CLEAR_ANSWER': {
            const next = { ...state.selectedAnswers };
            delete next[action.questionId];
            return { ...state, selectedAnswers: next };
        }
        case 'TOGGLE_MARK': {
            const marked = new Set(state.marked);
            if (marked.has(action.questionId)) marked.delete(action.questionId);
            else marked.add(action.questionId);
            return { ...state, marked: [...marked] };
        }
        case 'NAVIGATE': {
            const visited = new Set(state.visited);
            const nextId = state.interviewData?.questions?.[action.index]?.id;
            if (nextId !== undefined) visited.add(nextId);
            const currentId = state.interviewData?.questions?.[state.currentQuestion]?.id;
            const spent = state.questionStartTime ? Date.now() - state.questionStartTime : 0;
            return {
                ...state,
                currentQuestion: action.index,
                visited: [...visited],
                questionStartTime: Date.now(),
                timePerQuestion: currentId === undefined ? state.timePerQuestion : {
                    ...state.timePerQuestion,
                    [currentId]: (state.timePerQuestion[currentId] || 0) + spent,
                },
            };
        }
        case 'TICK':
            return { ...state, timeRemaining: action.remaining, warnExpiry: action.remaining > 0 && action.remaining <= 60 };
        case 'PAUSE':
            return {
                ...state,
                isPaused: action.value,
                deadlineAt: action.value
                    ? null
                    : (state.timeRemaining > 0 ? Date.now() + state.timeRemaining * 1000 : null),
                questionStartTime: action.value ? null : Date.now(),
            };
        case 'COMPLETE':
            return {
                ...state,
                phase: 'report',
                report: action.report,
                reportMeta: action.meta || null,
                confirmFinish: false,
                isPaused: false,
                deadlineAt: null,
                isLoading: false,
                loadingError: null,
            };
        case 'RESTORE':
            return { ...state, ...action.snapshot, isLoading: false, loadingError: null, confirmFinish: false };
        case 'RESET':
            return { ...initialState, mode: state.mode, interviewType: state.interviewType, occupation: state.occupation };
        default:
            return state;
    }
}

// Builds the report + history entry from any exam snapshot (live state or one
// restored from storage). The completed exam is persisted to history BEFORE the
// report is rendered, so a report-render failure can never lose the attempt.
function finalizeExamSnapshot(snapshot, ownerUid, reason) {
    const questions = snapshot.interviewData?.questions || [];
    const timeRemaining = snapshot.deadlineAt
        ? remainingFromDeadline(snapshot.deadlineAt)
        : Math.max(0, Number(snapshot.timeRemaining) || 0);
    const report = buildInterviewReport({
        questions,
        answers: snapshot.selectedAnswers || {},
        timePerQuestion: snapshot.timePerQuestion || {},
        timeLimit: snapshot.timeLimit || 0,
        timeRemaining,
        interviewType: snapshot.interviewType,
        jobDescription: snapshot.jobDescription || '',
    });
    const answeredCount = Object.keys(snapshot.selectedAnswers || {}).length;
    const entry = {
        id: `iv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        completedAt: new Date().toISOString(),
        role: snapshot.occupation || '',
        interviewType: snapshot.interviewType || 'technical',
        mode: snapshot.mode || 'assessment',
        score: report.overall,
        duration: report.timeUsed,
        status: 'completed',
        submissionReason: reason || 'manual',
        questionCount: questions.length,
        answeredCount,
        report,
        interviewData: snapshot.interviewData,
        selectedAnswers: snapshot.selectedAnswers || {},
    };
    return { report, entry, meta: entry, history: appendHistory(ownerUid, entry) };
}

// Deterministic, user-safe messages — raw status codes and stack traces never
// reach the candidate.
function describeInterviewError(error, status) {
    if (error?.name === 'TimeoutError' || error?.code === 'AI_TIMEOUT') {
        return 'Question generation timed out. Your settings are saved — please try again.';
    }
    if (status === 401) return 'Your sign-in session expired. Please sign in again, then retry.';
    if (status === 403) return 'Daily AI question quota reached. Try again tomorrow or upgrade your plan.';
    if (status === 429) return 'Too many requests in a short time. Please wait a moment and try again.';
    if (status === 413) return 'The job description or resume context is too large. Shorten it and retry.';
    if (status === 400) return 'The request was rejected. Review the role and job description, then retry.';
    if (status >= 500) return 'The interview service is temporarily unavailable. Please retry in a moment.';
    if (error?.code === 'INVALID_AI_OUTPUT') return 'The AI returned an unusable question set. Please try again — no attempt was started.';
    if (error instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(String(error?.message || ''))) {
        return 'Network error — check your connection and try again.';
    }
    return 'Questions could not be generated. Please try again.';
}

function createTabId() {
    try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    } catch { /* fall through */ }
    return `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ── ACCESSIBLE MODAL (focus trap + Escape + focus return) ────────────────────
function ModalDialog({ labelledBy, describedBy, onClose, className, children }) {
    const dialogRef = useRef(null);
    const restoreFocusRef = useRef(null);

    useEffect(() => {
        const node = dialogRef.current;
        if (!node) return undefined;
        const active = typeof document !== 'undefined' ? document.activeElement : null;
        restoreFocusRef.current = active && typeof active.focus === 'function' ? active : null;
        const focusables = () => Array.from(node.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
            .filter(el => !el.disabled);
        const initial = focusables()[0];
        (initial || node).focus();
        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                onClose();
                return;
            }
            if (event.key !== 'Tab') return;
            const items = focusables();
            if (!items.length) return;
            const first = items[0];
            const last = items[items.length - 1];
            const current = document.activeElement;
            if (event.shiftKey && (current === first || current === node)) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && current === last) {
                event.preventDefault();
                first.focus();
            }
        };
        node.addEventListener('keydown', onKeyDown);
        return () => {
            node.removeEventListener('keydown', onKeyDown);
            restoreFocusRef.current?.focus?.();
        };
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 motion-reduce:backdrop-blur-none"
            onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={labelledBy}
                aria-describedby={describedBy}
                tabIndex={-1}
                className={`bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl text-slate-900 max-h-[90vh] overflow-y-auto ${className || ''}`}>
                {children}
            </div>
        </div>
    );
}

// ── KEYBOARD SHORTCUT HELP DIALOG ────────────────────────────────────────────
const SHORTCUT_ROWS = [
    { keys: ['A', 'B', 'C', 'D'], label: 'Select the matching answer option' },
    { keys: ['1', '2', '3', '4'], label: 'Select the matching answer option' },
    { keys: ['Enter'], label: 'Save & next — opens the submit review on the last question' },
    { keys: ['→'], label: 'Next question' },
    { keys: ['←'], label: 'Previous question' },
    { keys: ['?'], label: 'Open or close this shortcut guide' },
    { keys: ['Esc'], label: 'Close dialogs and drawers' },
];

function Kbd({ children }) {
    return (
        <kbd className="inline-block px-1.5 py-0.5 rounded-md border border-slate-300 bg-slate-100 text-slate-700 text-[11px] font-bold font-mono shadow-xs">
            {children}
        </kbd>
    );
}

function KeyboardHelpDialog({ onClose }) {
    return (
        <ModalDialog labelledBy="kbd-help-title" describedBy="kbd-help-note" onClose={onClose}>
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 mb-4 shadow-xs">
                <FaKeyboard className="w-6 h-6" aria-hidden="true" />
            </div>
            <h3 id="kbd-help-title" className="font-bold text-xl mb-2 text-slate-900">Keyboard shortcuts</h3>
            <p id="kbd-help-note" className="text-xs text-slate-500 mb-5 leading-relaxed">
                The full assessment is completable without a mouse. Shortcuts pause automatically while you type in a text field.
            </p>
            <ul className="space-y-2.5 mb-6">
                {SHORTCUT_ROWS.map(row => (
                    <li key={row.label + row.keys.join('')} className="flex items-center justify-between gap-4 text-xs text-slate-700">
                        <span className="flex items-center gap-1">
                            {row.keys.map(key => <Kbd key={key}>{key}</Kbd>)}
                        </span>
                        <span className="text-right flex-1 font-medium">{row.label}</span>
                    </li>
                ))}
            </ul>
            <button
                type="button"
                autoFocus
                className="w-full py-3 text-sm font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
                onClick={onClose}>
                Got it
            </button>
        </ModalDialog>
    );
}

// ── AI GENERATION PROCESSING POPUP (Engaging, Multi-Stage Progress Modal) ─────
const GENERATION_STAGES = [
    {
        title: 'Synthesizing Candidate Profile & Evidence',
        desc: 'Parsing verified career achievements, technical skills & past roles without hallucination.',
        icon: FaUserTie,
    },
    {
        title: 'Mapping Target Role Competencies',
        desc: 'Aligning industry frameworks, core competencies & domain responsibilities.',
        icon: FaBullseye,
    },
    {
        title: 'Formulating Practical Scenario Challenges',
        desc: 'Designing real-world problem solving, troubleshooting & architecture questions.',
        icon: FaLaptopCode,
    },
    {
        title: 'Calibrating Question Difficulty & Depth',
        desc: 'Calibrating Bloom taxonomy and scenario complexity for senior-level rigor.',
        icon: FaAward,
    },
    {
        title: 'Assembling CBT Shell & Rubrics',
        desc: 'Verifying answer distractors, scoring criteria & STAR-method evaluation hints.',
        icon: FaMagic,
    },
];

const PRO_TIPS = [
    'Use the STAR method (Situation, Task, Action, Result) to structure behavioral and scenario answers.',
    'Focus on measurable business impact, cost savings, and latency improvements in your decisions.',
    'During the CBT exam, you can use keyboard shortcuts (A-D, 1-4, Arrow keys) for rapid navigation.',
    'Mark complex questions for review to reconsider them before your final exam submission.',
    'Clear explanations and trade-off evaluations earn the highest readiness and mastery ratings.',
];

function AiGenerationProcessingModal({ state, onCancel }) {
    const [seconds, setSeconds] = useState(0);
    const [tipIndex, setTipIndex] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setSeconds(prev => prev + 1);
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const tipInterval = setInterval(() => {
            setTipIndex(prev => (prev + 1) % PRO_TIPS.length);
        }, 4500);
        return () => clearInterval(tipInterval);
    }, []);

    // Escape key closes/cancels generation
    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                onCancel();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onCancel]);

    // Calculate stage based on elapsed time
    const stageIndex = useMemo(() => {
        if (seconds < 3) return 0;
        if (seconds < 7) return 1;
        if (seconds < 12) return 2;
        if (seconds < 18) return 3;
        return 4;
    }, [seconds]);

    // Smooth asymptotic progress calculation (approaches 95%)
    const progressPct = useMemo(() => {
        if (seconds <= 0) return 8;
        if (seconds < 5) return Math.min(25, 8 + seconds * 4);
        if (seconds < 12) return Math.min(55, 25 + (seconds - 5) * 4.5);
        if (seconds < 20) return Math.min(80, 55 + (seconds - 12) * 3);
        return Math.min(94, 80 + (seconds - 20) * 0.8);
    }, [seconds]);

    const activeStage = GENERATION_STAGES[stageIndex] || GENERATION_STAGES[0];

    return (
        <div
            className="fixed inset-0 z-[70] bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 transition-all duration-300 motion-reduce:backdrop-blur-none"
            role="dialog"
            aria-modal="true"
            aria-busy="true"
            aria-labelledby="ai-proc-title"
            aria-describedby="ai-proc-desc">
            
            <div className="relative bg-white border border-slate-200/90 rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl shadow-slate-900/15 text-slate-900 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                {/* Ambient light glow backgrounds */}
                <div className="absolute -top-24 -left-24 w-60 h-60 bg-indigo-100/50 rounded-full blur-3xl pointer-events-none" aria-hidden="true" />
                <div className="absolute -bottom-24 -right-24 w-60 h-60 bg-purple-100/50 rounded-full blur-3xl pointer-events-none" aria-hidden="true" />

                {/* Header Icon + Titles */}
                <div className="flex items-start gap-4 mb-6 relative">
                    <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 p-0.5 shadow-md shadow-indigo-500/20 flex items-center justify-center shrink-0">
                        <div className="w-full h-full bg-white rounded-[14px] flex items-center justify-center relative overflow-hidden">
                            <FaBrain className="w-7 h-7 text-indigo-600 animate-pulse motion-reduce:animate-none" aria-hidden="true" />
                            <span className="absolute inset-0 rounded-full bg-indigo-500/15 animate-ping motion-reduce:animate-none" aria-hidden="true" />
                        </div>
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-indigo-50 border border-indigo-200 text-indigo-700">
                                AI Assessment Architect
                            </span>
                            <span className="text-[11px] text-slate-500 font-mono font-semibold flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping motion-reduce:animate-none" />
                                {seconds}s
                            </span>
                        </div>
                        <h2 id="ai-proc-title" className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight truncate">
                            Generating Contextual Interview
                        </h2>
                        <p id="ai-proc-desc" className="text-xs text-slate-500 truncate">
                            Tailoring {state.questionCount} {state.difficulty} questions for <span className="text-indigo-600 font-bold">{state.occupation || 'Candidate'}</span>
                        </p>
                    </div>
                </div>

                {/* Context Pills */}
                <div className="flex flex-wrap items-center gap-2 mb-6">
                    <span className="px-2.5 py-1 rounded-xl text-[11px] font-semibold bg-slate-100 border border-slate-200 text-slate-800 flex items-center gap-1.5">
                        <FaBriefcase className="w-3 h-3 text-indigo-600" />
                        {state.occupation}
                    </span>
                    <span className="px-2.5 py-1 rounded-xl text-[11px] font-semibold bg-amber-50 border border-amber-200 text-amber-900 flex items-center gap-1.5">
                        <FaAward className="w-3 h-3 text-amber-600" />
                        {state.difficulty} difficulty
                    </span>
                    {state.resumeLabel && (
                        <span className="px-2.5 py-1 rounded-xl text-[11px] font-semibold bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-1.5">
                            <FaCheck className="w-2.5 h-2.5 text-emerald-600" />
                            Resume Linked
                        </span>
                    )}
                    {state.jobDescription && (
                        <span className="px-2.5 py-1 rounded-xl text-[11px] font-semibold bg-purple-50 border border-purple-200 text-purple-800 flex items-center gap-1.5">
                            <FaBullseye className="w-2.5 h-2.5 text-purple-600" />
                            JD Tailored
                        </span>
                    )}
                </div>

                {/* Progress Bar */}
                <div className="mb-6">
                    <div className="flex items-center justify-between text-xs mb-2">
                        <span className="font-bold text-indigo-700 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />
                            {activeStage.title}
                        </span>
                        <span className="font-mono font-bold text-slate-700">{Math.round(progressPct)}%</span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200 p-0.5">
                        <div
                            className="h-full bg-gradient-to-r from-indigo-600 via-purple-600 to-emerald-500 rounded-full transition-all duration-700 ease-out shadow-xs shadow-indigo-500/30"
                            style={{ width: `${progressPct}%` }}
                        />
                    </div>
                </div>

                {/* Stage Steps List */}
                <div className="space-y-2.5 mb-6">
                    {GENERATION_STAGES.map((stage, idx) => {
                        const isDone = idx < stageIndex;
                        const isCurrent = idx === stageIndex;

                        return (
                            <div
                                key={stage.title}
                                className={`flex items-start gap-3 p-2.5 rounded-2xl border transition-all duration-300 ${
                                    isCurrent
                                        ? 'bg-indigo-50/90 border-indigo-300 text-indigo-950 shadow-xs ring-1 ring-indigo-200'
                                        : isDone
                                            ? 'bg-emerald-50/40 border-emerald-200/80 text-slate-700'
                                            : 'bg-slate-50/50 border-slate-100 text-slate-400 opacity-60'
                                }`}>
                                <div className={`w-6 h-6 rounded-xl flex items-center justify-center shrink-0 mt-0.5 text-xs transition-colors ${
                                    isDone
                                        ? 'bg-emerald-100 text-emerald-700 border border-emerald-300 font-bold'
                                        : isCurrent
                                            ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30 font-bold animate-pulse'
                                            : 'bg-slate-100 text-slate-400 border border-slate-200 font-medium'
                                }`}>
                                    {isDone ? <FaCheck className="w-3 h-3" /> : (idx + 1)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className={`text-xs leading-tight ${isCurrent ? 'font-bold text-indigo-950' : isDone ? 'font-semibold text-slate-700' : 'font-medium text-slate-400'}`}>
                                        {stage.title}
                                    </p>
                                    {isCurrent && (
                                        <p className="text-[11px] text-indigo-700 leading-snug mt-0.5 animate-in fade-in duration-300">
                                            {stage.desc}
                                        </p>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Pro-Tip Box */}
                <div className="p-3.5 rounded-2xl bg-amber-50/80 border border-amber-200/80 text-amber-950 text-xs flex items-start gap-2.5 mb-6 leading-relaxed">
                    <FaLightbulb className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
                    <div className="flex-1 min-w-0">
                        <span className="font-bold text-amber-900 mr-1.5">Interview Tip:</span>
                        <span className="text-amber-900/90">{PRO_TIPS[tipIndex]}</span>
                    </div>
                </div>

                {/* Footer / Cancel */}
                <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-100">
                    <span className="text-[11px] text-slate-500 flex items-center gap-1.5 font-medium">
                        <FaClock className="w-3 h-3 text-indigo-500" />
                        Usually ready in 15–30 seconds
                    </span>
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-200 shadow-xs transition-all cursor-pointer">
                        Cancel Generation
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── SR STATUS + TOAST ────────────────────────────────────────────────────────
function SrStatus({ message }) {
    return <div className="sr-only" role="status" aria-live="polite">{message}</div>;
}

function StatusToast({ message }) {
    if (!message) return null;
    return (
        <div
            role="status"
            className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-semibold shadow-xl border border-slate-700 max-w-[90vw] text-center pointer-events-none">
            {message}
        </div>
    );
}

const DashboardInterviews = () => {
    const user = useContext(AuthContext);
    const ownerUid = user?.uid || null;
    const [state, dispatch] = useReducer(interviewReducer, initialState);
    const [resumes, setResumes] = useState([]);
    const [history, setHistory] = useState([]);
    const [paletteOpen, setPaletteOpen] = useState(false);
    const [viewingHistory, setViewingHistory] = useState(null);
    const [helpOpen, setHelpOpen] = useState(false);
    const [confirmExit, setConfirmExit] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [confirmClearAll, setConfirmClearAll] = useState(false);
    const [notice, setNotice] = useState(null);
    const [toast, setToast] = useState(null);
    const [liveMessage, setLiveMessage] = useState('');

    const requestControllerRef = useRef(null);
    const finishInFlightRef = useRef(false);
    const stateRef = useRef(state);
    const tabIdRef = useRef(createTabId());
    const persistTimerRef = useRef(null);
    const lastWriteAtRef = useRef(0);
    const announcedMilestonesRef = useRef(new Set());
    const questionHeadingRef = useRef(null);
    const prevQuestionRef = useRef(null);
    const paletteTriggerRef = useRef(null);
    const drawerCloseRef = useRef(null);
    const toastTimerRef = useRef(null);
    const wasPaletteOpenRef = useRef(false);
    const finishRef = useRef(() => {});

    const modeMeta = INTERVIEW_MODES[state.mode] || INTERVIEW_MODES.assessment;

    useEffect(() => { stateRef.current = state; });
    useEffect(() => { finishRef.current = finishInterview; });

    const showToast = useCallback((message) => {
        setToast(message);
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => setToast(null), 3200);
    }, []);

    // ── RESTORE / SELF-HEAL ON MOUNT (per owner) ─────────────────────────────
    useEffect(() => {
        setHistory(readHistory(ownerUid));
        const saved = readOwnerSession(ownerUid);
        if (saved?.phase === 'exam' && saved.interviewData?.questions?.length) {
            const remaining = saved.deadlineAt ? remainingFromDeadline(saved.deadlineAt) : saved.timeRemaining;
            if (saved.deadlineAt && remaining === 0) {
                // The deadline passed while the tab was closed. Never force a
                // retake: finalize the attempt from the persisted answers.
                try {
                    const outcome = finalizeExamSnapshot(saved, ownerUid, 'timeout');
                    setHistory(outcome.history);
                    clearOwnerSession(ownerUid);
                    dispatch({ type: 'COMPLETE', report: outcome.report, meta: outcome.meta });
                    setNotice('The timer expired while you were away, so the assessment was auto-submitted with your saved answers.');
                    return;
                } catch { clearOwnerSession(ownerUid); }
            }
            dispatch({ type: 'RESTORE', snapshot: { ...saved, timeRemaining: remaining ?? saved.timeRemaining, ownerUid } });
            setLiveMessage('Recovered your in-progress attempt. The timer continued in the background.');
        } else {
            purgeStaleOwnerSession(ownerUid);
        }
    }, [ownerUid]);

    useEffect(() => {
        if (!ownerUid) return undefined;
        let active = true;
        getResumes(ownerUid, 1, 20).then(result => {
            if (active) setResumes(result?.resumes || []);
        }).catch(() => {});
        return () => { active = false; };
    }, [ownerUid]);

    // ── SESSION PERSISTENCE (debounced + heartbeat + flush) ──────────────────
    const persistSession = useCallback((immediate = false) => {
        if (persistTimerRef.current) {
            clearTimeout(persistTimerRef.current);
            persistTimerRef.current = null;
        }
        const run = () => {
            const snapshot = stateRef.current;
            if (snapshot.phase !== 'exam') return;
            writeOwnerSession(ownerUid, { ...snapshot, flaggedQuestions: snapshot.marked, ownerUid, tabId: tabIdRef.current });
            lastWriteAtRef.current = Date.now();
        };
        if (immediate) run();
        else persistTimerRef.current = setTimeout(() => { persistTimerRef.current = null; run(); }, EXAM_PERSIST_DEBOUNCE_MS);
    }, [ownerUid]);

    useEffect(() => {
        if (state.phase !== 'exam') return undefined;
        persistSession(false);
        return undefined;
    }, [state.phase, state.selectedAnswers, state.marked, state.visited, state.currentQuestion,
        state.isPaused, state.deadlineAt, state.interviewData, ownerUid, persistSession]);

    useEffect(() => {
        if (state.phase !== 'exam') return undefined;
        const heartbeat = setInterval(() => persistSession(true), EXAM_HEARTBEAT_MS);
        const flush = () => persistSession(true);
        document.addEventListener('visibilitychange', flush);
        window.addEventListener('pagehide', flush);
        return () => {
            clearInterval(heartbeat);
            document.removeEventListener('visibilitychange', flush);
            window.removeEventListener('pagehide', flush);
            if (persistTimerRef.current) { clearTimeout(persistTimerRef.current); persistTimerRef.current = null; }
        };
    }, [state.phase, persistSession]);

    // ── EXIT / REFRESH PROTECTION (active exam only) ─────────────────────────
    useEffect(() => {
        if (state.phase !== 'exam') return undefined;
        const onBeforeUnload = (event) => {
            persistSession(true);
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, [state.phase, persistSession]);

    // ── ABSOLUTE-DEADLINE TIMER ──────────────────────────────────────────────
    useEffect(() => {
        if (state.phase !== 'exam' || state.isPaused || !state.deadlineAt) return undefined;
        let submitted = false;
        const tick = () => {
            const remaining = remainingFromDeadline(state.deadlineAt);
            dispatch({ type: 'TICK', remaining });
            if (remaining === 0 && !submitted) {
                submitted = true;
                finishRef.current('timeout');
            }
        };
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [state.phase, state.isPaused, state.deadlineAt]);

    // Timer milestone announcements for screen readers (the ticking clock
    // itself stays silent to avoid per-second chatter).
    useEffect(() => {
        if (state.phase !== 'exam' || state.isPaused || !state.deadlineAt || !state.timeLimit) return;
        const message = timerAnnouncement(state.timeRemaining);
        if (message && !announcedMilestonesRef.current.has(message)) {
            announcedMilestonesRef.current.add(message);
            setLiveMessage(message);
        }
    }, [state.timeRemaining, state.phase, state.isPaused, state.deadlineAt, state.timeLimit]);

    useEffect(() => { announcedMilestonesRef.current = new Set(); }, [state.deadlineAt, state.interviewData]);

    // ── MULTI-TAB SAFETY ─────────────────────────────────────────────────────
    useEffect(() => {
        const onHistoryStorage = (event) => {
            if (event.key === `interviewHistory:${ownerUid}` || (!ownerUid && event.key === 'interviewHistory:guest')) {
                setHistory(readHistory(ownerUid));
            }
        };
        window.addEventListener('storage', onHistoryStorage);
        return () => window.removeEventListener('storage', onHistoryStorage);
    }, [ownerUid]);

    useEffect(() => {
        if (state.phase !== 'exam' || !ownerUid) return undefined;
        const sessionKey = `interviewSession:${ownerUid}`;
        const onSessionStorage = (event) => {
            if (event.key !== sessionKey) return;
            if (event.newValue === null) {
                // Submitted or cleared in another tab: leave cleanly, no corrupt state.
                dispatch({ type: 'RESET' });
                setNotice('This assessment was finished in another tab, so it was closed here.');
                return;
            }
            let parsed = null;
            try { parsed = JSON.parse(event.newValue); } catch { return; }
            if (resolveStorageConflict(parsed, { tabId: tabIdRef.current, lastWriteAt: lastWriteAtRef.current }) === 'yield') {
                dispatch({ type: 'RESET' });
                setNotice('This assessment was continued in another tab, so it was closed here to protect your answers.');
            }
        };
        window.addEventListener('storage', onSessionStorage);
        return () => window.removeEventListener('storage', onSessionStorage);
    }, [state.phase, ownerUid]);

    // ── CBT KEYBOARD SHORTCUTS ───────────────────────────────────────────────
    useEffect(() => {
        if (state.phase !== 'exam' || state.isPaused) return undefined;
        const dialogOpen = state.confirmFinish || helpOpen || confirmExit || paletteOpen;
        const onKeyDown = (event) => {
            if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
            if (dialogOpen) return; // dialogs own their keyboard handling
            const target = event.target;
            if (event.key === '?') {
                event.preventDefault();
                setHelpOpen(true);
                return;
            }
            const questions = stateRef.current.interviewData?.questions || [];
            const total = questions.length;
            if (!total) return;
            const index = stateRef.current.currentQuestion;
            const current = questions[index];
            if (!current) return;

            if (event.key === 'ArrowRight') {
                if (consumesArrowKeys(target)) return;
                if (index < total - 1) {
                    event.preventDefault();
                    dispatch({ type: 'NAVIGATE', index: index + 1 });
                }
                return;
            }
            if (event.key === 'ArrowLeft') {
                if (consumesArrowKeys(target)) return;
                if (index > 0) {
                    event.preventDefault();
                    dispatch({ type: 'NAVIGATE', index: index - 1 });
                }
                return;
            }
            if (event.key === 'Enter') {
                if (target?.closest?.('button, a, input, select, textarea, label, summary, [contenteditable="true"]')) return;
                event.preventDefault();
                if (index < total - 1) dispatch({ type: 'NAVIGATE', index: index + 1 });
                else dispatch({ type: 'PATCH', patch: { confirmFinish: true } });
                return;
            }
            if (isTextEntryTarget(target)) return;
            const optionIndex = optionIndexFromKey(event.key, (current.options || []).length);
            if (optionIndex !== null) {
                event.preventDefault();
                dispatch({ type: 'ANSWER', questionId: current.id, answerIndex: optionIndex });
                setLiveMessage(`Answer ${String.fromCharCode(65 + optionIndex)} selected for question ${index + 1}.`);
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [state.phase, state.isPaused, state.confirmFinish, helpOpen, confirmExit, paletteOpen]);

    // ── PREDICTABLE FOCUS BETWEEN QUESTIONS ──────────────────────────────────
    useEffect(() => {
        if (state.phase !== 'exam') {
            prevQuestionRef.current = null;
            return;
        }
        if (prevQuestionRef.current === state.currentQuestion) return;
        prevQuestionRef.current = state.currentQuestion;
        questionHeadingRef.current?.focus?.();
    }, [state.phase, state.currentQuestion]);

    // ── PALETTE DRAWER FOCUS MANAGEMENT ──────────────────────────────────────
    useEffect(() => {
        if (paletteOpen) {
            wasPaletteOpenRef.current = true;
            drawerCloseRef.current?.focus?.();
        } else if (wasPaletteOpenRef.current) {
            wasPaletteOpenRef.current = false;
            paletteTriggerRef.current?.focus?.();
        }
    }, [paletteOpen]);

    // Abort any in-flight generation when the view unmounts.
    useEffect(() => () => {
        requestControllerRef.current?.abort();
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    }, []);

    const applyDuration = useCallback((patch = {}) => {
        const next = { ...state, ...patch };
        const seconds = resolveDurationSeconds({
            presetMinutes: next.durationPreset,
            customMinutes: next.customMinutes,
            timerEnabled: next.mode === 'practice' ? next.timerEnabled : true,
        });
        dispatch({ type: 'PATCH', patch: { ...patch, timeLimit: seconds, timeRemaining: seconds } });
    }, [state]);

    const fetchInterviewQuestions = useCallback(async () => {
        requestControllerRef.current?.abort();
        const requestController = new AbortController();
        requestControllerRef.current = requestController;
        dispatch({ type: 'START_FETCH' });
        try {
            const currentLanguage = localStorage.getItem('preferredLanguage') || localStorage.getItem('language') || 'en';
            // Use generateUserAiContent from aiService for consistent auth handling.
            // aiService.getAuthHeaders() waits up to 1.2 s for onAuthStateChanged, eliminating
            // the cold-load race where fire.auth().currentUser is briefly null on mount.
            const data = await generateUserAiContent(
                'generate-interview',
                {
                    occupation: state.occupation,
                    interviewType: state.interviewType,
                    questionCount: state.questionCount,
                    language: currentLanguage,
                    experienceLevel: state.experienceLevel,
                    difficulty: state.difficulty,
                    jobDescription: sanitizeJobDescription(state.jobDescription),
                    resumeFacts: state.resumeFacts,
                    // Bounded recent-history so generation avoids repeating earlier questions.
                    previousQuestions: recentInterviewQuestions(history, {
                        role: state.occupation,
                        interviewType: state.interviewType,
                        limit: 8,
                    }),
                },
                { signal: requestController.signal, timeoutMs: 90_000 }
            );
            // Never trust the model structure: validate before rendering.
            const validated = validateInterviewPayload(data);
            if (!validated) throw Object.assign(new Error('Invalid AI output'), { code: 'INVALID_AI_OUTPUT' });
            dispatch({ type: 'FETCH_OK', data: validated });
        } catch (error) {
            const userCancelled = requestController.signal.aborted || requestControllerRef.current !== requestController;
            if (userCancelled) dispatch({ type: 'FETCH_CANCEL' });
            else dispatch({ type: 'FETCH_ERR', error: describeInterviewError(error, error?.status) });
        } finally {
            if (requestControllerRef.current === requestController) requestControllerRef.current = null;
        }
    }, [state.occupation, state.interviewType, state.questionCount, state.experienceLevel, state.difficulty, state.jobDescription, state.resumeFacts, history]);

    const cancelGeneration = useCallback(() => {
        requestControllerRef.current?.abort();
    }, []);

    // ── SUBMISSION (idempotent; attempt persisted before report) ─────────────
    const finishInterview = useCallback((reason = 'manual') => {
        if (finishInFlightRef.current || stateRef.current.phase !== 'exam') return;
        finishInFlightRef.current = true;
        try {
            const outcome = finalizeExamSnapshot(stateRef.current, ownerUid, reason);
            setHistory(outcome.history);
            clearOwnerSession(ownerUid);
            dispatch({ type: 'COMPLETE', report: outcome.report, meta: outcome.meta });
            setLiveMessage(reason === 'timeout'
                ? 'Time expired. Your assessment was submitted automatically and your report is ready.'
                : 'Assessment submitted. Your report is ready.');
        } catch {
            // The exam must never trap the user even if report generation fails.
            clearOwnerSession(ownerUid);
            dispatch({ type: 'RESET' });
            setNotice('The attempt was closed, but its report could not be generated.');
        } finally {
            finishInFlightRef.current = false;
        }
    }, [ownerUid]);

    const exitExam = useCallback(() => {
        clearOwnerSession(ownerUid);
        setConfirmExit(false);
        dispatch({ type: 'RESET' });
        setNotice('Attempt discarded. Your completed history was not affected.');
    }, [ownerUid]);

    const deleteHistoryEntry = useCallback((entry) => {
        setHistory(removeHistoryEntry(ownerUid, entry.id));
        setConfirmDelete(null);
        showToast('Assessment deleted from history.');
    }, [ownerUid, showToast]);

    const deleteAllHistory = useCallback(() => {
        setHistory(clearAllHistory(ownerUid));
        setConfirmClearAll(false);
        setViewingHistory(null);
        showToast('Assessment history cleared.');
    }, [ownerUid, showToast]);

    const questions = state.interviewData?.questions || [];
    const current = questions[state.currentQuestion];
    const markedSet = useMemo(() => asSet(state.marked), [state.marked]);
    const visitedSet = useMemo(() => asSet(state.visited), [state.visited]);

    const selectResume = (resume) => {
        const fallbackTitle = resume.item?.title && resume.item?.title !== 'Untitled Resume'
            ? resume.item.title
            : (resume.item?.occupation || (resume.item?.firstname ? `${resume.item.firstname}'s Resume` : `Resume #${resume.id?.slice(0, 6)}`));

        if (state.resumeLabel === fallbackTitle) {
            dispatch({
                type: 'PATCH',
                patch: { resumeLabel: '', resumeFacts: '' },
            });
        } else {
            dispatch({
                type: 'PATCH',
                patch: {
                    resumeLabel: fallbackTitle,
                    resumeFacts: sanitizeResumeFacts(resume),
                    occupation: state.occupation || resume.item?.occupation || '',
                },
            });
        }
    };

    if (viewingHistory) {
        return (
            <div className="min-h-[calc(100vh-2rem)] w-full font-sans">
                <SrStatus message={liveMessage} />
                <StatusToast message={toast} />
                <ReportView
                    report={viewingHistory.report}
                    meta={viewingHistory}
                    onBack={() => setViewingHistory(null)}
                    history={history}
                    onRetake={() => { setViewingHistory(null); dispatch({ type: 'RESET' }); }}
                />
            </div>
        );
    }

    if (state.phase === 'report' && state.report) {
        return (
            <div className="min-h-[calc(100vh-2rem)] w-full font-sans">
                <SrStatus message={liveMessage} />
                <StatusToast message={toast} />
                <ReportView
                    report={state.report}
                    meta={state.reportMeta || { role: state.occupation, interviewType: state.interviewType, mode: state.mode, score: state.report.overall }}
                    onBack={() => dispatch({ type: 'RESET' })}
                    history={history}
                    onRetake={() => dispatch({ type: 'RESET' })}
                />
            </div>
        );
    }

    // ── LIGHT MODERN CBT EXAMINATION VIEW ──────────────────────────────────────
    if (state.phase === 'exam' && current) {
        const allowPause = modeMeta.allowPause && state.timeLimit > 0;
        const answeredCount = Object.keys(state.selectedAnswers).length;
        const progressPct = Math.round((answeredCount / questions.length) * 100);

        return (
            <div className="min-h-[calc(100vh-2rem)] w-full bg-slate-50 text-slate-900 flex flex-col font-sans">
                <SrStatus message={liveMessage} />
                <StatusToast message={toast} />

                {/* ── Light Modern CBT Header Bar ── */}
                <header className="bg-white/95 backdrop-blur-md border-b border-slate-200/90 px-4 sm:px-8 py-3.5 flex flex-wrap items-center justify-between gap-3 sm:gap-4 sticky top-0 z-40 shadow-xs">
                    <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center font-extrabold shrink-0 shadow-xs">
                            <FaLaptopCode className="w-5 h-5" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <p className="text-xs uppercase tracking-widest text-indigo-600 font-bold">Computer Based Test</p>
                                <span className="hidden md:inline px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-indigo-100 text-indigo-700 border border-indigo-200">
                                    CBT Assessment Shell
                                </span>
                                <span className="text-xs text-slate-500 hidden sm:inline">· {state.interviewType}</span>
                            </div>
                            <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight line-clamp-1">{state.occupation}</h1>
                        </div>
                    </div>

                    {/* Timer & Controls */}
                    <div className="flex items-center gap-2 sm:gap-3">
                        <div
                            role="timer"
                            aria-label={`Time remaining: ${state.timeLimit ? formatClock(state.timeRemaining) : 'untimed practice'}`}
                            className={`flex items-center gap-2 font-mono text-base sm:text-lg font-bold px-3.5 py-1.5 rounded-xl border transition-all duration-300 shadow-xs tabular-nums ${
                                state.timeRemaining <= 60 && state.timeLimit > 0
                                    ? 'bg-rose-50 border-rose-300 text-rose-700 animate-pulse ring-2 ring-rose-300/60 motion-reduce:animate-none'
                                    : 'bg-slate-100 border-slate-200 text-slate-800'
                            }`}>
                            <FaClock className={`w-4 h-4 ${state.timeRemaining <= 60 && state.timeLimit > 0 ? 'text-rose-600' : 'text-indigo-600'}`} aria-hidden="true" />
                            <span>{state.timeLimit ? formatClock(state.timeRemaining) : 'Untimed Rehearsal'}</span>
                        </div>

                        {allowPause && (
                            <button
                                type="button"
                                className="px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
                                onClick={() => dispatch({ type: 'PAUSE', value: !state.isPaused })}>
                                <FaClock className="w-3 h-3 text-amber-500" aria-hidden="true" />
                                <span>{state.isPaused ? 'Resume' : 'Pause'}</span>
                            </button>
                        )}

                        <button
                            ref={paletteTriggerRef}
                            type="button"
                            className="lg:hidden px-3.5 py-1.5 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition-all cursor-pointer flex items-center gap-1.5 shadow-md shadow-indigo-500/20"
                            onClick={() => setPaletteOpen(true)}
                            aria-label="Open question palette"
                            aria-haspopup="dialog">
                            <span>Palette</span>
                            <span className="px-1.5 rounded-full text-[10px] bg-white/25">{answeredCount}/{questions.length}</span>
                        </button>

                        <button
                            type="button"
                            className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
                            onClick={() => setHelpOpen(true)}
                            aria-label="Keyboard shortcuts (press question mark)"
                            title="Keyboard shortcuts (?)">
                            <FaKeyboard className="w-3.5 h-3.5 text-indigo-500" aria-hidden="true" />
                            <span className="hidden xl:inline">Shortcuts</span>
                        </button>

                        <button
                            type="button"
                            className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 text-slate-600 hover:text-rose-700 shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
                            onClick={() => setConfirmExit(true)}
                            aria-label="Exit assessment">
                            <FaSignOutAlt className="w-3.5 h-3.5" aria-hidden="true" />
                            <span className="hidden xl:inline">Exit</span>
                        </button>
                    </div>
                </header>

                {/* Expiry Warning Alert */}
                {state.warnExpiry && (
                    <div role="alert" className="bg-amber-50 border-b border-amber-200 text-amber-900 px-6 py-2.5 text-xs sm:text-sm font-medium flex items-center justify-center gap-2">
                        <FaExclamationTriangle className="w-4 h-4 text-amber-600 shrink-0" aria-hidden="true" />
                        <span>Less than 60 seconds remaining! All recorded answers will automatically be evaluated when the timer reaches 0.</span>
                    </div>
                )}

                {/* Paused Overlay Notice */}
                {state.isPaused && (
                    <div className="bg-amber-50 border-b border-amber-200 text-amber-800 px-6 py-2 text-xs font-semibold text-center">
                        Assessment Paused · Clock is stopped. Click &quot;Resume&quot; above to continue.
                    </div>
                )}

                {/* ── Main Two-Column Exam Grid (Full Width) ── */}
                <div className="flex-1 w-full p-4 sm:p-6 lg:p-8 grid lg:grid-cols-[1fr_360px] gap-6 items-start">
                    {/* Left: Question Workspace Card */}
                    <main className={`bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-8 shadow-sm flex flex-col justify-between min-h-[520px] transition-opacity duration-200 motion-reduce:transition-none ${state.isPaused ? 'pointer-events-none opacity-50' : ''}`}>
                        <div>
                            {/* Question Meta Bar */}
                            <div className="flex flex-wrap items-center justify-between gap-3 mb-5 pb-4 border-b border-slate-100">
                                <div className="flex items-center gap-2">
                                    <span className="px-3 py-1 rounded-xl text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                                        Question {state.currentQuestion + 1} of {questions.length}
                                    </span>
                                    {current.category && (
                                        <span className="px-2.5 py-1 rounded-xl text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200/60">
                                            {current.category}
                                        </span>
                                    )}
                                    {current.difficulty && (
                                        <span className="px-2.5 py-1 rounded-xl text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200/60 hidden sm:inline">
                                            {current.difficulty}
                                        </span>
                                    )}
                                </div>
                                {markedSet.has(current.id) && (
                                    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1.5">
                                        <FaFlag className="w-3 h-3 text-amber-500" aria-hidden="true" /> Marked for Review
                                    </span>
                                )}
                            </div>

                            {/* Question Title */}
                            <h2
                                ref={questionHeadingRef}
                                tabIndex={-1}
                                className="text-lg sm:text-xl font-bold text-slate-900 leading-relaxed mb-6 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-lg">
                                {current.question}
                            </h2>

                            {/* Options Radio List */}
                            <div className="space-y-3" role="radiogroup" aria-label={`Answer options for question ${state.currentQuestion + 1}`}>
                                {(current.options || []).map((option, index) => {
                                    const selected = state.selectedAnswers[current.id] === index;
                                    const letter = String.fromCharCode(65 + index);
                                    return (
                                        <label
                                            key={index}
                                            className={`flex items-start gap-4 p-4 rounded-2xl border transition-all duration-200 cursor-pointer select-none group focus-within:ring-2 focus-within:ring-indigo-500 focus-within:ring-offset-2 motion-reduce:transition-none ${
                                                selected
                                                    ? 'bg-indigo-50/80 border-indigo-600 shadow-sm ring-2 ring-indigo-600/20 text-indigo-950'
                                                    : 'bg-white hover:bg-slate-50/80 border-slate-200/90 text-slate-800 hover:border-slate-300'
                                            }`}>
                                            <input
                                                type="radio"
                                                name={`q-${current.id}`}
                                                className="sr-only"
                                                checked={selected}
                                                onChange={() => dispatch({ type: 'ANSWER', questionId: current.id, answerIndex: index })}
                                            />
                                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 transition-all ${
                                                selected
                                                    ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-300'
                                                    : 'bg-slate-100 group-hover:bg-slate-200 text-slate-600 border border-slate-200'
                                            }`} aria-hidden="true">
                                                {selected ? <FaCheck className="w-3.5 h-3.5 text-white" /> : letter}
                                            </div>
                                            <span className="text-sm sm:text-base leading-relaxed pt-1 flex-1 font-medium">
                                                <span className="font-bold mr-2 text-indigo-600">{letter}.</span>
                                                {option}
                                            </span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Bottom Action Controls */}
                        <div className="mt-8 pt-6 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    className="px-4 py-2.5 text-xs sm:text-sm font-semibold rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 disabled:opacity-40 disabled:pointer-events-none shadow-xs transition-all flex items-center gap-2 cursor-pointer"
                                    disabled={state.currentQuestion === 0}
                                    onClick={() => dispatch({ type: 'NAVIGATE', index: state.currentQuestion - 1 })}>
                                    <FaArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                                    <span>Previous</span>
                                </button>
                                <button
                                    type="button"
                                    aria-pressed={markedSet.has(current.id)}
                                    className={`px-3.5 py-2.5 text-xs sm:text-sm font-semibold rounded-xl border transition-all flex items-center gap-2 cursor-pointer ${
                                        markedSet.has(current.id)
                                            ? 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100'
                                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                                    }`}
                                    onClick={() => dispatch({ type: 'TOGGLE_MARK', questionId: current.id })}>
                                    <FaFlag className={`w-3.5 h-3.5 ${markedSet.has(current.id) ? 'text-amber-500' : 'text-slate-400'}`} aria-hidden="true" />
                                    <span className="hidden sm:inline">{markedSet.has(current.id) ? 'Unmark Review' : 'Mark for Review'}</span>
                                    <span className="sm:hidden">Flag</span>
                                </button>
                                <button
                                    type="button"
                                    className="px-3.5 py-2.5 text-xs sm:text-sm font-semibold rounded-xl bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 text-slate-600 hover:text-rose-700 transition-all flex items-center gap-2 cursor-pointer"
                                    onClick={() => dispatch({ type: 'CLEAR_ANSWER', questionId: current.id })}
                                    disabled={!Object.prototype.hasOwnProperty.call(state.selectedAnswers, current.id)}>
                                    <FaTimes className="w-3.5 h-3.5" aria-hidden="true" />
                                    <span className="hidden sm:inline">Clear Answer</span>
                                    <span className="sm:hidden">Clear</span>
                                </button>
                            </div>

                            <div>
                                {state.currentQuestion < questions.length - 1 ? (
                                    <button
                                        type="button"
                                        className="px-6 py-2.5 text-xs sm:text-sm font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20 hover:shadow-indigo-600/30 transition-all flex items-center gap-2 cursor-pointer"
                                        onClick={() => dispatch({ type: 'NAVIGATE', index: state.currentQuestion + 1 })}>
                                        <span>Save &amp; Next</span>
                                        <FaArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        className="px-6 py-2.5 text-xs sm:text-sm font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20 hover:shadow-emerald-600/30 transition-all flex items-center gap-2 cursor-pointer"
                                        onClick={() => dispatch({ type: 'PATCH', patch: { confirmFinish: true } })}>
                                        <FaSave className="w-3.5 h-3.5" aria-hidden="true" />
                                        <span>Submit</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </main>

                    {/* Right: Question Palette Sidebar (Desktop) */}
                    <aside className="hidden lg:block bg-white rounded-3xl border border-slate-200/90 p-6 shadow-sm sticky top-24" aria-label="Question palette">
                        <PalettePanel
                            questions={questions}
                            state={state}
                            markedSet={markedSet}
                            visitedSet={visitedSet}
                            progressPct={progressPct}
                            onJump={index => dispatch({ type: 'NAVIGATE', index })}
                            onSubmit={() => dispatch({ type: 'PATCH', patch: { confirmFinish: true } })}
                        />
                    </aside>
                </div>

                {/* Mobile Slide-Over Drawer */}
                {paletteOpen && (
                    <div
                        className="lg:hidden fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex justify-end"
                        onClick={() => setPaletteOpen(false)}>
                        <div
                            role="dialog"
                            aria-modal="true"
                            aria-label="Question palette"
                            onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setPaletteOpen(false); } }}
                            className="w-[88vw] max-w-sm h-full bg-white border-l border-slate-200 p-6 overflow-y-auto shadow-2xl"
                            onClick={event => event.stopPropagation()}>
                            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
                                <h3 className="font-bold text-slate-900 text-base">Question Palette</h3>
                                <button
                                    ref={drawerCloseRef}
                                    type="button"
                                    className="px-3 py-1.5 text-slate-700 hover:text-slate-900 rounded-xl bg-slate-100 border border-slate-200 flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
                                    onClick={() => setPaletteOpen(false)}>
                                    <FaTimes className="w-3.5 h-3.5" aria-hidden="true" />
                                    <span>Close palette</span>
                                </button>
                            </div>
                            <PalettePanel
                                questions={questions}
                                state={state}
                                markedSet={markedSet}
                                visitedSet={visitedSet}
                                progressPct={progressPct}
                                onJump={index => { dispatch({ type: 'NAVIGATE', index }); setPaletteOpen(false); }}
                                onSubmit={() => { setPaletteOpen(false); dispatch({ type: 'PATCH', patch: { confirmFinish: true } }); }}
                            />
                        </div>
                    </div>
                )}

                {/* Keyboard Shortcut Help */}
                {helpOpen && <KeyboardHelpDialog onClose={() => setHelpOpen(false)} />}

                {/* Exit Confirmation */}
                {confirmExit && (
                    <ModalDialog labelledBy="exit-title" describedBy="exit-desc" onClose={() => setConfirmExit(false)}>
                        <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mb-4 shadow-xs">
                            <FaSignOutAlt className="w-6 h-6" aria-hidden="true" />
                        </div>
                        <h3 id="exit-title" className="font-bold text-xl mb-2 text-slate-900">Exit this attempt?</h3>
                        <p id="exit-desc" className="text-sm text-slate-600 mb-6 leading-relaxed">
                            You have answered <span className="font-bold text-slate-900">{Object.keys(state.selectedAnswers).length}</span> of <span className="font-bold text-slate-900">{questions.length}</span> questions.
                            Exiting discards this attempt and its answers — this cannot be undone.
                        </p>
                        <div className="flex gap-3">
                            <button
                                type="button"
                                className="flex-1 py-3 text-xs sm:text-sm font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all cursor-pointer border border-slate-200"
                                onClick={() => setConfirmExit(false)}>
                                Keep working
                            </button>
                            <button
                                type="button"
                                className="flex-1 py-3 text-xs sm:text-sm font-bold rounded-xl bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-600/20 transition-all cursor-pointer"
                                onClick={exitExam}>
                                Exit &amp; discard
                            </button>
                        </div>
                    </ModalDialog>
                )}

                {/* Submit Confirmation Modal */}
                {state.confirmFinish && (
                    <ModalDialog labelledBy="submit-title" describedBy="submit-desc" onClose={() => dispatch({ type: 'PATCH', patch: { confirmFinish: false } })}>
                        <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 font-extrabold mb-4 shadow-xs">
                            <FaAward className="w-6 h-6 text-indigo-600" aria-hidden="true" />
                        </div>
                        <h3 id="submit-title" className="font-bold text-xl mb-2 text-slate-900">Submit assessment?</h3>
                        <p id="submit-desc" className="text-sm text-slate-600 mb-6 leading-relaxed">
                            You have answered <span className="font-bold text-slate-900">{Object.keys(state.selectedAnswers).length}</span> of <span className="font-bold text-slate-900">{questions.length}</span> questions.
                            {Object.keys(state.selectedAnswers).length < questions.length && (
                                <span className="block mt-2 text-amber-700 font-semibold">
                                    {questions.length - Object.keys(state.selectedAnswers).length} unanswered question{questions.length - Object.keys(state.selectedAnswers).length === 1 ? '' : 's'} will be evaluated as incomplete.
                                </span>
                            )}
                            {' '}Are you ready to view your assessment score and STAR analysis?
                        </p>
                        <div className="flex gap-3">
                            <button
                                type="button"
                                className="flex-1 py-3 text-xs sm:text-sm font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all cursor-pointer border border-slate-200"
                                onClick={() => dispatch({ type: 'PATCH', patch: { confirmFinish: false } })}>
                                Continue Test
                            </button>
                            <button
                                type="button"
                                className="flex-1 py-3 text-xs sm:text-sm font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
                                onClick={() => finishInterview('manual')}>
                                Submit now
                            </button>
                        </div>
                    </ModalDialog>
                )}
            </div>
        );
    }

    // ── LIGHT MODERN SETUP SCREEN VIEW ────────────────────────────────────────
    const trend = scoreTrend(history);
    const recentTrend = trend.slice(-5);

    return (
        <div className="min-h-screen w-full bg-slate-50 text-slate-900 p-4 sm:p-6 lg:p-8 font-sans">
            <SrStatus message={liveMessage} />
            <StatusToast message={toast} />

            <div className="w-full space-y-8">

                {/* ── Contextual notice (tab conflicts, discards, expiries) ── */}
                {notice && (
                    <div role="status" className="w-full flex items-start justify-between gap-4 bg-indigo-50 border border-indigo-200 rounded-2xl px-5 py-4 text-sm text-indigo-900">
                        <span className="flex items-start gap-2.5 leading-relaxed">
                            <FaExclamationTriangle className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" aria-hidden="true" />
                            {notice}
                        </span>
                        <button
                            type="button"
                            className="shrink-0 text-indigo-600 hover:text-indigo-800 font-bold text-xs underline cursor-pointer"
                            onClick={() => setNotice(null)}>
                            Dismiss
                        </button>
                    </div>
                )}

                {/* ── 1. Light Modern Hero Header Banner ── */}
                <header className="relative w-full bg-gradient-to-r from-indigo-50 via-purple-50/50 to-blue-50 rounded-3xl p-6 sm:p-10 border border-indigo-100 shadow-xs overflow-hidden">
                    <div className="absolute -right-16 -top-16 w-80 h-80 bg-indigo-200/30 rounded-full blur-3xl pointer-events-none" aria-hidden="true"></div>
                    <div className="absolute -left-16 -bottom-16 w-80 h-80 bg-purple-200/30 rounded-full blur-3xl pointer-events-none" aria-hidden="true"></div>

                    <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="max-w-3xl">
                            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-indigo-100 text-indigo-700 border border-indigo-200 mb-3 shadow-xs">
                                <FaMagic className="w-3 h-3 text-amber-500 animate-pulse motion-reduce:animate-none" aria-hidden="true" />
                                <span>AI-Powered CBT Exam Suite</span>
                            </span>
                            <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mb-2">
                                AI Interview Coach
                            </h1>
                            <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
                                Practice real-world technical, behavioral, and architectural interviews with timed CBT examination rules, instant scoring, and actionable STAR coaching.
                            </p>
                        </div>

                        {/* Quick Stats Widget */}
                        <div className="grid grid-cols-2 gap-3 shrink-0">
                            <div className="bg-white/90 backdrop-blur-xs border border-slate-200/80 rounded-2xl p-4 text-center shadow-xs min-w-[120px]">
                                <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Total Drills</p>
                                <p className="text-xl sm:text-2xl font-black text-slate-900">{history.length}</p>
                            </div>
                            <div className="bg-white/90 backdrop-blur-xs border border-slate-200/80 rounded-2xl p-4 text-center shadow-xs min-w-[120px]">
                                <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Avg Score</p>
                                <p className="text-xl sm:text-2xl font-black text-emerald-600">
                                    {history.length ? `${Math.round(history.reduce((a, b) => a + (Number(b.score) || 0), 0) / history.length)}%` : '—'}
                                </p>
                            </div>
                        </div>
                    </div>
                </header>

                {/* ── 2. Interactive Setup Configuration Card ── */}
                <section className="w-full bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-10 shadow-sm space-y-8">

                    {/* Step 1: Mode Selection */}
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-800 flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] flex items-center justify-center font-black" aria-hidden="true">1</span>
                                <span>Choose Interview Mode</span>
                            </h2>
                            <span className="text-xs text-slate-500">CBT rules adapt dynamically</span>
                        </div>

                        <div className="grid sm:grid-cols-3 gap-3.5">
                            {/* Practice Card */}
                            <button
                                type="button"
                                aria-pressed={state.mode === 'practice'}
                                onClick={() => applyDuration({ mode: 'practice', timerEnabled: false })}
                                className={`text-left p-5 rounded-2xl border transition-all duration-200 cursor-pointer relative overflow-hidden group motion-reduce:transition-none ${
                                    state.mode === 'practice'
                                        ? 'bg-indigo-50/70 border-indigo-600 shadow-md ring-2 ring-indigo-600/20 text-indigo-950'
                                        : 'bg-white hover:bg-slate-50/80 border-slate-200 text-slate-700 hover:border-slate-300'
                                }`}>
                                <div className="flex items-center justify-between mb-3">
                                    <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center">
                                        <FaGraduationCap className="w-5 h-5" aria-hidden="true" />
                                    </div>
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                                        Self-Paced
                                    </span>
                                </div>
                                <h3 className="font-bold text-base text-slate-900 mb-1">Practice Mode</h3>
                                <p className="text-xs text-slate-500 leading-relaxed">Untimed drill with free pause and question navigation.</p>
                            </button>

                            {/* Mock Interview Card */}
                            <button
                                type="button"
                                aria-pressed={state.mode === 'mock'}
                                onClick={() => applyDuration({ mode: 'mock', timerEnabled: true })}
                                className={`text-left p-5 rounded-2xl border transition-all duration-200 cursor-pointer relative overflow-hidden group motion-reduce:transition-none ${
                                    state.mode === 'mock'
                                        ? 'bg-indigo-50/70 border-indigo-600 shadow-md ring-2 ring-indigo-600/20 text-indigo-950'
                                        : 'bg-white hover:bg-slate-50/80 border-slate-200 text-slate-700 hover:border-slate-300'
                                }`}>
                                <div className="flex items-center justify-between mb-3">
                                    <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center">
                                        <FaUserTie className="w-5 h-5" aria-hidden="true" />
                                    </div>
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-indigo-100 text-indigo-800 border border-indigo-200">
                                        Realistic
                                    </span>
                                </div>
                                <h3 className="font-bold text-base text-slate-900 mb-1">Mock Interview</h3>
                                <p className="text-xs text-slate-500 leading-relaxed">Timed interview simulation with pause capability.</p>
                            </button>

                            {/* CBT Assessment Card */}
                            <button
                                type="button"
                                aria-pressed={state.mode === 'assessment'}
                                onClick={() => applyDuration({ mode: 'assessment', timerEnabled: true })}
                                className={`text-left p-5 rounded-2xl border transition-all duration-200 cursor-pointer relative overflow-hidden group motion-reduce:transition-none ${
                                    state.mode === 'assessment'
                                        ? 'bg-indigo-50/70 border-indigo-600 shadow-md ring-2 ring-indigo-600/20 text-indigo-950'
                                        : 'bg-white hover:bg-slate-50/80 border-slate-200 text-slate-700 hover:border-slate-300'
                                }`}>
                                <div className="flex items-center justify-between mb-3">
                                    <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 border border-purple-100 flex items-center justify-center">
                                        <FaLaptopCode className="w-5 h-5" aria-hidden="true" />
                                    </div>
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-purple-100 text-purple-800 border border-purple-200">
                                        Strict CBT
                                    </span>
                                </div>
                                <h3 className="font-bold text-base text-slate-900 mb-1">CBT Examination</h3>
                                <p className="text-xs text-slate-500 leading-relaxed">Strict examination timer with automated timeout submission.</p>
                            </button>
                        </div>
                    </div>

                    {/* Step 2: Target Role & Quick-Pick Chips */}
                    <div>
                        <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-800 mb-3 flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] flex items-center justify-center font-black" aria-hidden="true">2</span>
                            <span>Target Role &amp; Discipline</span>
                        </h2>

                        <div className="relative mb-3">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                                <FaBriefcase className="w-4 h-4" aria-hidden="true" />
                            </div>
                            <input
                                type="text"
                                aria-label="Target role"
                                className="w-full bg-white border border-slate-300 rounded-2xl pl-11 pr-4 py-3.5 text-sm sm:text-base font-semibold text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100 transition-all shadow-xs"
                                value={state.occupation}
                                onChange={event => dispatch({ type: 'PATCH', patch: { occupation: event.target.value } })}
                                placeholder="Software Engineer"
                            />
                        </div>

                        {/* Quick Selection Pills */}
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-slate-500 font-medium mr-1">Suggested:</span>
                            {POPULAR_ROLES.map(role => (
                                <button
                                    key={role.title}
                                    type="button"
                                    onClick={() => dispatch({ type: 'PATCH', patch: { occupation: role.title, interviewType: role.type } })}
                                    aria-pressed={state.occupation === role.title}
                                    className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-all cursor-pointer ${
                                        state.occupation === role.title
                                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                                            : 'bg-slate-100 hover:bg-slate-200 border-slate-200/80 text-slate-700'
                                    }`}>
                                    {role.title}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Step 3: Configuration Grid */}
                    <div>
                        <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-800 mb-4 flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] flex items-center justify-center font-black" aria-hidden="true">3</span>
                            <span>Evaluation Parameters</span>
                        </h2>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            {/* Track / Type */}
                            <label className="block">
                                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 block">Interview Track</span>
                                <select
                                    className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-900 focus:outline-hidden focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 transition-all cursor-pointer shadow-xs"
                                    value={state.interviewType}
                                    onChange={event => dispatch({ type: 'PATCH', patch: { interviewType: event.target.value } })}>
                                    {INTERVIEW_TYPES.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}
                                </select>
                            </label>

                            {/* Experience */}
                            <label className="block">
                                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 block">Seniority Level</span>
                                <select
                                    className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-900 focus:outline-hidden focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 transition-all cursor-pointer shadow-xs"
                                    value={state.experienceLevel}
                                    onChange={event => dispatch({ type: 'PATCH', patch: { experienceLevel: event.target.value } })}>
                                    {EXPERIENCE_LEVELS.map(level => <option key={level.id} value={level.id}>{level.label}</option>)}
                                </select>
                            </label>

                            {/* Difficulty */}
                            <label className="block">
                                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 block">Difficulty</span>
                                <select
                                    className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-900 focus:outline-hidden focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 transition-all cursor-pointer shadow-xs"
                                    value={state.difficulty}
                                    onChange={event => dispatch({ type: 'PATCH', patch: { difficulty: event.target.value } })}>
                                    {DIFFICULTIES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
                                </select>
                            </label>

                            {/* Question Count */}
                            <label className="block">
                                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 block">Question Count</span>
                                <select
                                    className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-900 focus:outline-hidden focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 transition-all cursor-pointer shadow-xs"
                                    value={state.questionCount}
                                    onChange={event => dispatch({ type: 'PATCH', patch: { questionCount: Number(event.target.value) } })}>
                                    {[5, 8, 10, 12, 15, 20].map(count => (
                                        <option key={count} value={count}>{count} Questions</option>
                                    ))}
                                </select>
                            </label>
                        </div>
                    </div>

                    {/* Step 4: Duration Selector */}
                    <div>
                        <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-800 mb-3 flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] flex items-center justify-center font-black" aria-hidden="true">4</span>
                            <span>Examination Duration</span>
                        </h2>

                        {state.mode === 'practice' && (
                            <label className="flex items-center gap-2.5 text-xs text-slate-700 mb-3 select-none cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="w-4 h-4 rounded text-indigo-600 focus:ring-0 cursor-pointer"
                                    checked={state.timerEnabled}
                                    onChange={event => applyDuration({ timerEnabled: event.target.checked })}
                                />
                                <span>Enable countdown timer for practice mode</span>
                            </label>
                        )}

                        <div className="flex flex-wrap items-center gap-2.5">
                            {DURATION_PRESETS.map(minutes => (
                                <button
                                    key={minutes}
                                    type="button"
                                    aria-pressed={state.durationPreset === minutes}
                                    className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                                        state.durationPreset === minutes
                                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-600/20'
                                            : 'bg-slate-100 hover:bg-slate-200 border-slate-200/80 text-slate-700'
                                    }`}
                                    onClick={() => applyDuration({ durationPreset: minutes })}>
                                    {minutes} min
                                </button>
                            ))}
                            <button
                                type="button"
                                aria-pressed={state.durationPreset === 'custom'}
                                className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                                    state.durationPreset === 'custom'
                                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-600/20'
                                        : 'bg-slate-100 hover:bg-slate-200 border-slate-200/80 text-slate-700'
                                }`}
                                onClick={() => applyDuration({ durationPreset: 'custom' })}>
                                Custom
                            </button>
                            {state.durationPreset === 'custom' && (
                                <div className="flex items-center gap-2 ml-2">
                                    <input
                                        type="number"
                                        min="5"
                                        max="180"
                                        aria-label="Custom duration in minutes"
                                        className="bg-white border border-slate-300 rounded-xl px-3 py-1.5 w-20 text-xs font-bold text-slate-900"
                                        value={state.customMinutes}
                                        onChange={event => applyDuration({ customMinutes: Number(event.target.value) })}
                                    />
                                    <span className="text-xs text-slate-500">minutes (5–180)</span>
                                </div>
                            )}
                        </div>
                        <p className="text-xs text-slate-500 mt-2 font-medium">
                            Selected duration: <span className="text-indigo-600 font-bold">{state.timeLimit ? formatClock(state.timeLimit) : 'Untimed practice'}</span>
                            {state.timeLimit > 0 && <span className="text-slate-500"> · Approx {((state.timeLimit / 60) / state.questionCount).toFixed(1)} min per question</span>}
                        </p>
                    </div>

                    {/* Step 5: Tailoring & Context */}
                    <div className="space-y-6 pt-4 border-t border-slate-100">
                        {/* Target Job Description */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label htmlFor="interview-jd" className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                                    <FaBullseye className="w-3.5 h-3.5 text-indigo-600" aria-hidden="true" />
                                    <span>Target Job Description (Optional — AI Tailoring)</span>
                                </label>
                                <span className="text-[10px] text-slate-500">Facts strictly grounded</span>
                            </div>
                            <textarea
                                id="interview-jd"
                                className="w-full bg-white border border-slate-300 rounded-2xl px-4 py-3 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 min-h-[90px] transition-all shadow-xs"
                                value={state.jobDescription}
                                onChange={event => dispatch({ type: 'PATCH', patch: { jobDescription: event.target.value } })}
                                placeholder="Paste a JD. Only this text is used — nothing is invented."
                            />
                        </div>

                        {/* Resume Selection */}
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                                    <FaFileAlt className="w-3.5 h-3.5 text-indigo-600" aria-hidden="true" />
                                    <span>Resume Personalization (Optional — Uses Candidate History)</span>
                                </h3>
                                {state.resumeLabel && (
                                    <button
                                        type="button"
                                        onClick={() => dispatch({ type: 'PATCH', patch: { resumeLabel: '', resumeFacts: '' } })}
                                        className="text-[11px] font-semibold text-rose-600 hover:text-rose-700 underline cursor-pointer">
                                        Clear Selected Resume
                                    </button>
                                )}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" role="group" aria-label="Select a resume for personalization">
                                {resumes.map(resume => {
                                    const title = resume.item?.title && resume.item?.title !== 'Untitled Resume'
                                        ? resume.item.title
                                        : (resume.item?.occupation || (resume.item?.firstname ? `${resume.item.firstname}'s Resume` : `Resume #${resume.id?.slice(0, 6)}`));
                                    const isSelected = state.resumeLabel === title;

                                    return (
                                        <button
                                            key={resume.id}
                                            type="button"
                                            aria-pressed={isSelected}
                                            onClick={() => selectResume(resume)}
                                            className={`text-left p-3.5 rounded-2xl border transition-all duration-200 cursor-pointer flex items-center gap-3 select-none ${
                                                isSelected
                                                    ? 'bg-indigo-50/80 border-indigo-600 shadow-sm ring-2 ring-indigo-600/20 text-indigo-950'
                                                    : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300'
                                            }`}>
                                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`} aria-hidden="true">
                                                {isSelected ? <FaCheck className="w-3.5 h-3.5 text-white" /> : <FaFileAlt className="w-3.5 h-3.5" />}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-xs font-bold text-slate-900 truncate">{title}</p>
                                                <p className="text-[10px] text-slate-500 truncate">{resume.item?.occupation || 'Candidate Profile'}</p>
                                            </div>
                                        </button>
                                    );
                                })}

                                {!resumes.length && (
                                    <div className="col-span-full p-4 rounded-2xl bg-slate-50 border border-slate-200/80 text-center">
                                        <p className="text-xs text-slate-500">No saved resumes found. The assessment will generate standard industry-level questions.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Error Notice */}
                    {state.loadingError && (
                        <div role="alert" className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm flex flex-wrap items-center gap-3">
                            <span className="flex items-center gap-2 flex-1 min-w-0">
                                <FaExclamationTriangle className="w-4 h-4 text-rose-600 shrink-0" aria-hidden="true" />
                                <span>{state.loadingError}</span>
                            </span>
                            <button
                                type="button"
                                onClick={fetchInterviewQuestions}
                                className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-white hover:bg-rose-50 border border-rose-300 text-rose-700 transition-all cursor-pointer shadow-xs">
                                Try again
                            </button>
                        </div>
                    )}

                    {/* Start / Cancel */}
                    <div className="pt-2 flex flex-wrap items-center gap-3">
                        <button
                            type="button"
                            disabled={!state.occupation.trim() || state.isLoading}
                            onClick={fetchInterviewQuestions}
                            className="w-full sm:w-auto px-8 py-4 rounded-2xl font-bold text-sm sm:text-base text-white bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-600 hover:from-indigo-700 hover:to-purple-700 shadow-lg shadow-indigo-600/25 hover:shadow-indigo-600/40 hover:-translate-y-0.5 disabled:opacity-50 disabled:pointer-events-none disabled:hover:translate-y-0 transition-all duration-200 flex items-center justify-center gap-3 cursor-pointer motion-reduce:transition-none">
                            {state.isLoading ? (
                                <>
                                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin motion-reduce:animate-none" aria-hidden="true"></span>
                                    <span>Generating Questions with AI…</span>
                                </>
                            ) : (
                                <>
                                    <FaPlay className="w-4 h-4" aria-hidden="true" />
                                    <span>Start interview</span>
                                </>
                            )}
                        </button>
                        {state.isLoading && (
                            <button
                                type="button"
                                onClick={cancelGeneration}
                                className="px-5 py-3 rounded-2xl text-xs font-bold bg-white hover:bg-slate-50 border border-slate-300 text-slate-600 transition-all cursor-pointer shadow-xs">
                                Cancel
                            </button>
                        )}
                    </div>
                </section>

                {/* ── 3. Previous Assessments History (Full Width) ── */}
                <section className="w-full bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-8 shadow-sm space-y-4" aria-label="Previous assessments">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                            <FaAward className="w-4 h-4 text-amber-500" aria-hidden="true" />
                            <span>Previous Assessments</span>
                            {history.length > 0 && (
                                <span className="text-xs font-semibold text-slate-500">({history.length})</span>
                            )}
                        </h2>
                        <div className="flex items-center gap-2.5">
                            {trend.length > 1 && (
                                <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                                    Trend: {recentTrend.map(p => `${p.score}%`).join(' → ')}{trend.length > recentTrend.length ? ` (+${trend.length - recentTrend.length} earlier)` : ''}
                                </span>
                            )}
                            {history.length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setConfirmClearAll(true)}
                                    className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 text-slate-600 hover:text-rose-700 transition-all cursor-pointer flex items-center gap-1.5 shadow-xs">
                                    <FaTrashAlt className="w-3 h-3" aria-hidden="true" />
                                    <span>Clear all</span>
                                </button>
                            )}
                        </div>
                    </div>

                    {!history.length ? (
                        <div className="p-8 text-center rounded-2xl bg-slate-50 border border-slate-200/80">
                            <FaBrain className="w-8 h-8 text-slate-400 mx-auto mb-2" aria-hidden="true" />
                            <p className="text-xs text-slate-500">No previous sessions yet. Start your first AI mock interview above!</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                            {history.map(item => (
                                <div
                                    key={item.id}
                                    className="bg-slate-50/80 border border-slate-200 rounded-2xl p-4 flex items-center justify-between gap-4 hover:border-slate-300 hover:bg-white transition-all shadow-2xs">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                                            <span className="text-xs font-bold text-slate-900 truncate max-w-[160px]">{item.role || 'Interview drill'}</span>
                                            <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase bg-slate-200/80 text-slate-700">
                                                {item.interviewType}
                                            </span>
                                            {item.mode && item.mode !== 'assessment' && (
                                                <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase bg-indigo-50 text-indigo-700 border border-indigo-100">
                                                    {item.mode}
                                                </span>
                                            )}
                                            {item.submissionReason === 'timeout' && (
                                                <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase bg-amber-50 text-amber-800 border border-amber-200">
                                                    Auto-submitted
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-[11px] text-slate-500">
                                            {new Date(item.completedAt).toLocaleDateString()} · Time Used: {formatClock(item.duration || 0)}
                                            {item.questionCount ? ` · ${item.questionCount} questions` : ''}
                                            {item.answeredCount !== undefined ? ` · ${item.answeredCount} answered` : ''}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2.5 shrink-0">
                                        <div className="text-right">
                                            <span className={`text-base font-black ${
                                                item.score >= 80 ? 'text-emerald-600' : item.score >= 60 ? 'text-indigo-600' : 'text-amber-600'
                                            }`}>
                                                {item.score}%
                                            </span>
                                            <p className="text-[9px] uppercase tracking-wider text-slate-500">Score</p>
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            <button
                                                type="button"
                                                onClick={() => setViewingHistory(item)}
                                                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 transition-all cursor-pointer">
                                                Open report
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setConfirmDelete(item)}
                                                aria-label={`Delete assessment for ${item.role || 'interview drill'} from history`}
                                                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 text-slate-500 hover:text-rose-700 transition-all cursor-pointer flex items-center justify-center gap-1.5">
                                                <FaTrashAlt className="w-3 h-3" aria-hidden="true" />
                                                <span>Delete</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {/* Delete confirmation */}
                {confirmDelete && (
                    <ModalDialog labelledBy="delete-title" describedBy="delete-desc" onClose={() => setConfirmDelete(null)}>
                        <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mb-4 shadow-xs">
                            <FaTrashAlt className="w-5 h-5" aria-hidden="true" />
                        </div>
                        <h3 id="delete-title" className="font-bold text-xl mb-2 text-slate-900">Delete this assessment?</h3>
                        <p id="delete-desc" className="text-sm text-slate-600 mb-6 leading-relaxed">
                            <span className="font-bold text-slate-900">{confirmDelete.role || 'Interview drill'}</span> · {confirmDelete.score}% · {new Date(confirmDelete.completedAt).toLocaleDateString()}
                            <span className="block mt-2">This permanently removes the report from your history. This action cannot be undone.</span>
                        </p>
                        <div className="flex gap-3">
                            <button
                                type="button"
                                className="flex-1 py-3 text-xs sm:text-sm font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all cursor-pointer border border-slate-200"
                                onClick={() => setConfirmDelete(null)}>
                                Keep it
                            </button>
                            <button
                                type="button"
                                className="flex-1 py-3 text-xs sm:text-sm font-bold rounded-xl bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-600/20 transition-all cursor-pointer"
                                onClick={() => deleteHistoryEntry(confirmDelete)}>
                                Delete
                            </button>
                        </div>
                    </ModalDialog>
                )}

                {/* Clear-all confirmation */}
                {confirmClearAll && (
                    <ModalDialog labelledBy="clear-title" describedBy="clear-desc" onClose={() => setConfirmClearAll(false)}>
                        <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mb-4 shadow-xs">
                            <FaTrashAlt className="w-5 h-5" aria-hidden="true" />
                        </div>
                        <h3 id="clear-title" className="font-bold text-xl mb-2 text-slate-900">Clear all assessment history?</h3>
                        <p id="clear-desc" className="text-sm text-slate-600 mb-6 leading-relaxed">
                            All {history.length} saved assessment{history.length === 1 ? '' : 's'} will be permanently removed from this device. This action cannot be undone.
                        </p>
                        <div className="flex gap-3">
                            <button
                                type="button"
                                className="flex-1 py-3 text-xs sm:text-sm font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all cursor-pointer border border-slate-200"
                                onClick={() => setConfirmClearAll(false)}>
                                Keep history
                            </button>
                            <button
                                type="button"
                                className="flex-1 py-3 text-xs sm:text-sm font-bold rounded-xl bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-600/20 transition-all cursor-pointer"
                                onClick={deleteAllHistory}>
                                Clear all
                            </button>
                        </div>
                    </ModalDialog>
                )}

                {/* AI Processing & Questionnaire Generation Modal */}
                {state.isLoading && (
                    <AiGenerationProcessingModal
                        state={state}
                        onCancel={cancelGeneration}
                    />
                )}

            </div>
        </div>
    );
};

// ── PALETTE PANEL COMPONENT ───────────────────────────────────────────────────
function PalettePanel({ questions, state, markedSet, visitedSet, progressPct, onJump, onSubmit }) {
    const answeredCount = Object.keys(state.selectedAnswers).length;

    return (
        <div className="space-y-5">
            {/* Header & Progress */}
            <div>
                <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold text-sm text-slate-900 uppercase tracking-wider">Question Palette</h3>
                    <span className="text-xs font-bold text-indigo-600">{answeredCount}/{questions.length}</span>
                </div>
                <div
                    role="progressbar"
                    aria-valuenow={answeredCount}
                    aria-valuemin={0}
                    aria-valuemax={questions.length}
                    aria-label="Questions answered"
                    className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
                    <div className="bg-gradient-to-r from-indigo-600 to-purple-600 h-full rounded-full transition-all duration-300" style={{ width: `${progressPct}%` }}></div>
                </div>
            </div>

            {/* 5-Column Question Grid */}
            <ul className="grid grid-cols-5 gap-2" aria-label="Questions list">
                {questions.map((question, index) => {
                    const status = paletteStatus({
                        questionId: question.id,
                        currentId: questions[state.currentQuestion]?.id,
                        answers: state.selectedAnswers,
                        visited: visitedSet,
                        marked: markedSet,
                    });
                    const meta = PALETTE_META[status];
                    return (
                        <li key={question.id}>
                            <button
                                type="button"
                                aria-label={`Question ${index + 1}, ${meta.label}`}
                                aria-current={status === 'current' ? 'true' : undefined}
                                className={`w-full aspect-square rounded-xl text-xs font-extrabold transition-all duration-150 flex items-center justify-center cursor-pointer shadow-xs min-h-[40px] ${meta.className}`}
                                onClick={() => onJump(index)}>
                                {index + 1}
                                <span className="sr-only"> {meta.label}</span>
                            </button>
                        </li>
                    );
                })}
            </ul>

            {/* Status Legend */}
            <div className="pt-3 border-t border-slate-100">
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-2">Status Legend</p>
                <ul className="grid grid-cols-2 gap-2 text-[11px] text-slate-700">
                    {Object.entries(PALETTE_META).map(([key, meta]) => (
                        <li key={key} className="flex items-center gap-2">
                            <span className={`w-5 h-5 rounded-md flex items-center justify-center font-bold text-[10px] shrink-0 ${meta.className}`} aria-hidden="true">
                                {meta.letter}
                            </span>
                            <span className="truncate">{meta.label}</span>
                        </li>
                    ))}
                </ul>
            </div>

            {/* Submit Button */}
            <button
                type="button"
                className="w-full py-3 rounded-xl font-bold text-xs uppercase tracking-wider text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-md shadow-emerald-600/20 transition-all cursor-pointer flex items-center justify-center gap-2"
                onClick={onSubmit}>
                <FaSave className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Submit Assessment</span>
            </button>
        </div>
    );
}

// ── ASSESSMENT REPORT VIEW (FULL-WIDTH EXECUTIVE ANALYTICS DASHBOARD) ──────────
function ReportView({ report, meta, onBack, history: _history, onRetake }) {
    const [openId, setOpenId] = useState(null);
    const [questionFilter, setQuestionFilter] = useState('all'); // 'all' | 'correct' | 'needs_work'
    const [copyState, setCopyState] = useState('idle'); // idle | copied | failed
    const copyTimerRef = useRef(null);

    useEffect(() => () => {
        if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    }, []);

    const completedLabel = meta?.completedAt
        ? new Date(meta.completedAt).toLocaleDateString()
        : new Date().toLocaleDateString();

    const markdown = useMemo(() => buildStarMarkdown({ report, meta }), [report, meta]);
    const downloadSlug = String(meta?.role || meta?.occupation || 'interview').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'interview';

    const handleCopyStar = useCallback(async () => {
        if (copyState === 'copied') return; // no repeated toast spam
        const result = await copyTextToClipboard(markdown);
        if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
        if (result.ok) {
            setCopyState('copied');
            copyTimerRef.current = setTimeout(() => setCopyState('idle'), 2600);
        } else {
            setCopyState('failed');
            copyTimerRef.current = setTimeout(() => setCopyState('idle'), 4200);
        }
    }, [markdown, copyState]);

    const handleDownloadStar = useCallback(() => {
        downloadTextFile(`interview-star-summary-${downloadSlug}.md`, markdown, 'text/markdown');
    }, [downloadSlug, markdown]);

    const scoreColor = report.overall >= 80 ? 'text-emerald-600' : report.overall >= 60 ? 'text-indigo-600' : 'text-amber-600';
    const scoreBg = report.overall >= 80 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : report.overall >= 60 ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-amber-50 text-amber-700 border-amber-200';
    const scoreBadge = report.overall >= 80
        ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
        : report.overall >= 60
            ? 'bg-indigo-100 text-indigo-800 border-indigo-200'
            : 'bg-amber-100 text-amber-800 border-amber-200';

    const questionsList = useMemo(() => report.questions || [], [report]);
    const correctQuestions = useMemo(() => questionsList.filter(q => q.correct), [questionsList]);
    const needsWorkQuestions = useMemo(() => questionsList.filter(q => !q.correct), [questionsList]);

    const displayedQuestions = useMemo(() => {
        if (questionFilter === 'correct') return correctQuestions;
        if (questionFilter === 'needs_work') return needsWorkQuestions;
        return questionsList;
    }, [questionsList, questionFilter, correctQuestions, needsWorkQuestions]);

    return (
        <div className="min-h-[calc(100vh-2rem)] w-full bg-slate-50 text-slate-900 p-3 sm:p-5 lg:p-8 font-sans">
            <SrStatus message={copyState === 'copied' ? 'STAR summary copied to the clipboard as Markdown.' : copyState === 'failed' ? 'Clipboard copy failed. Use the Markdown download instead.' : ''} />
            <div className="w-full space-y-6">

                {/* ── Top Header Navigation (Full Width) ── */}
                <div className="w-full flex flex-wrap items-center justify-between gap-4 print:hidden">
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={onBack}
                            className="px-4 py-2 rounded-xl text-xs font-bold bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 transition-all flex items-center gap-2 cursor-pointer shadow-xs">
                            <FaArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Back to Interviews</span>
                        </button>
                        <span className="hidden sm:inline-block px-3 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200/60">
                            ID: {meta?.id?.slice(0, 8) || 'current-drill'}
                        </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                        <span className="sr-only" role="status" aria-live="polite"></span>
                        <button
                            type="button"
                            onClick={handleCopyStar}
                            aria-label="Copy STAR summary to clipboard as Markdown"
                            className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer shadow-xs ${
                                copyState === 'copied'
                                    ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                                    : copyState === 'failed'
                                        ? 'bg-rose-50 border-rose-300 text-rose-700'
                                        : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                            }`}>
                            {copyState === 'copied' ? <FaCheck className="w-3.5 h-3.5" aria-hidden="true" /> : <FaRegClipboard className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />}
                            <span data-copy-state={copyState}>
                                {copyState === 'copied' ? 'Copied!' : copyState === 'failed' ? 'Copy failed — try download' : 'Copy STAR Summary'}
                            </span>
                        </button>
                        <button
                            type="button"
                            onClick={handleDownloadStar}
                            aria-label="Download STAR summary as a Markdown file"
                            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs">
                            <FaDownload className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                            <span className="hidden sm:inline">Markdown (.md)</span>
                            <span className="sm:hidden">.md</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => window.print()}
                            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs">
                            <FaPrint className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                            <span className="hidden sm:inline">Print / Save PDF</span>
                        </button>
                        <button
                            type="button"
                            onClick={onRetake}
                            className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white transition-all flex items-center gap-2 cursor-pointer shadow-md shadow-indigo-600/20">
                            <FaRedo className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Retake Interview</span>
                        </button>
                    </div>
                </div>

                {/* ── Celebratory Analytics Banner (Full Width) ── */}
                <header className="w-full bg-gradient-to-r from-indigo-50 via-purple-50/70 to-blue-50 rounded-3xl p-6 sm:p-8 lg:p-10 border border-indigo-100 shadow-xs relative overflow-hidden print:border-slate-300 print:shadow-none">
                    <div className="absolute -right-20 -top-20 w-96 h-96 bg-indigo-200/25 rounded-full blur-3xl pointer-events-none" aria-hidden="true"></div>
                    <div className="absolute -left-20 -bottom-20 w-96 h-96 bg-purple-200/25 rounded-full blur-3xl pointer-events-none" aria-hidden="true"></div>

                    <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div>
                            <div className="flex flex-wrap items-center gap-2.5 mb-2.5">
                                <span className={`px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider border inline-flex items-center gap-1.5 ${scoreBadge}`}>
                                    <span className="w-2 h-2 rounded-full bg-current" aria-hidden="true"></span>
                                    {report.readiness}
                                </span>
                                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white/80 border border-indigo-200 text-indigo-800">
                                    <span className="capitalize">{meta.interviewType}</span> Track
                                </span>
                                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white/80 border border-purple-200 text-purple-800">
                                    <span className="capitalize">{meta.mode}</span> Mode
                                </span>
                                {meta.submissionReason === 'timeout' && (
                                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 border border-amber-300 text-amber-800">
                                        Auto-submitted at time expiry
                                    </span>
                                )}
                            </div>

                            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-slate-900 tracking-tight mb-1">
                                Assessment report
                            </h1>
                            <p className="text-sm sm:text-base text-slate-600 font-medium">
                                Target Role: <strong className="text-slate-900 font-bold">{meta.role || 'Software Engineer'}</strong> · Completed {completedLabel}
                            </p>
                        </div>

                        {/* Overall Score Dial */}
                        <div className="flex items-center gap-5 shrink-0 bg-white/90 backdrop-blur-xs border border-slate-200/90 rounded-3xl p-5 sm:p-6 shadow-xs">
                            <div className="text-right">
                                <span className={`text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight ${scoreColor}`}>
                                    {report.overall}%
                                </span>
                                <p className="text-xs uppercase tracking-wider font-extrabold text-slate-500 mt-0.5">Final Percentage</p>
                            </div>
                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-2xl border ${scoreBg}`} aria-hidden="true">
                                <FaTrophy className="w-7 h-7" />
                            </div>
                        </div>
                    </div>
                </header>

                {/* ── 4 Primary Metric Cards (Full Width 4-Column Grid) ── */}
                <div className="w-full grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-xs flex items-center gap-3.5">
                        <div className="w-11 h-11 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shrink-0" aria-hidden="true">
                            <FaTrophy className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Overall Score</p>
                            <p className={`text-xl sm:text-2xl font-black ${scoreColor}`}>{report.overall}%</p>
                            <p className="text-[11px] text-slate-500 truncate">Weighted accuracy</p>
                        </div>
                    </div>

                    <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-xs flex items-center gap-3.5">
                        <div className="w-11 h-11 rounded-xl bg-purple-50 border border-purple-100 text-purple-600 flex items-center justify-center shrink-0" aria-hidden="true">
                            <FaAward className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Readiness Tier</p>
                            <p className="text-base sm:text-lg font-bold text-slate-900 truncate">{report.readiness}</p>
                            <p className="text-[11px] text-slate-500 truncate">Hiring likelihood</p>
                        </div>
                    </div>

                    <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-xs flex items-center gap-3.5">
                        <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center shrink-0" aria-hidden="true">
                            <FaCheckCircle className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Completion</p>
                            <p className="text-xl sm:text-2xl font-black text-emerald-600">{report.completionRate}%</p>
                            <p className="text-[11px] text-slate-500 truncate">{questionsList.filter(q => q.answered).length}/{questionsList.length} answered</p>
                        </div>
                    </div>

                    <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-xs flex items-center gap-3.5">
                        <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-100 text-amber-600 flex items-center justify-center shrink-0" aria-hidden="true">
                            <FaClock className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Time Used</p>
                            <p className="text-xl sm:text-2xl font-black text-slate-900 tabular-nums">{formatClock(report.timeUsed)}</p>
                            <p className="text-[11px] text-slate-500 truncate">{((report.timeUsed / 60) / Math.max(1, questionsList.length)).toFixed(1)} min / question</p>
                        </div>
                    </div>
                </div>

                {/* ── Main Multi-Column Executive Analytics Dashboard ── */}
                <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-6 items-start print:block">

                    {/* ── Left Column (7 cols): Question STAR Feedback & 7-Day Action Plan ── */}
                    <div className="lg:col-span-7 space-y-6">

                        {/* 1. Question-Level STAR Analysis */}
                        <section className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-xs space-y-5" aria-labelledby="star-analysis-title">
                            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                                <div>
                                    <h2 id="star-analysis-title" className="text-base font-bold text-slate-900 flex items-center gap-2">
                                        <FaAward className="w-4 h-4 text-amber-500" aria-hidden="true" />
                                        <span>Question-Level STAR Analysis</span>
                                    </h2>
                                    <p className="text-xs text-slate-500 mt-0.5">Click any question to view detailed STAR coaching &amp; model answers.</p>
                                </div>

                                {/* Filter Tabs */}
                                <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200/80" role="group" aria-label="Filter questions by result">
                                    <button
                                        type="button"
                                        aria-pressed={questionFilter === 'all'}
                                        onClick={() => setQuestionFilter('all')}
                                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                            questionFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                                        }`}>
                                        All ({questionsList.length})
                                    </button>
                                    <button
                                        type="button"
                                        aria-pressed={questionFilter === 'correct'}
                                        onClick={() => setQuestionFilter('correct')}
                                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                            questionFilter === 'correct' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-600 hover:text-emerald-700'
                                        }`}>
                                        Correct ({correctQuestions.length})
                                    </button>
                                    <button
                                        type="button"
                                        aria-pressed={questionFilter === 'needs_work'}
                                        onClick={() => setQuestionFilter('needs_work')}
                                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                            questionFilter === 'needs_work' ? 'bg-white text-amber-700 shadow-2xs' : 'text-slate-600 hover:text-amber-700'
                                        }`}>
                                        Needs Work ({needsWorkQuestions.length})
                                    </button>
                                </div>
                            </div>

                            {/* Accordion Questions List */}
                            <div className="space-y-3">
                                {displayedQuestions.map(row => (
                                    <details
                                        key={row.id}
                                        open={openId === row.id}
                                        onToggle={event => setOpenId(event.target.open ? row.id : null)}
                                        className="group rounded-2xl border border-slate-200 bg-white overflow-hidden transition-all shadow-2xs hover:border-slate-300">
                                        <summary className="cursor-pointer p-4 list-none flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors select-none [&::-webkit-details-marker]:hidden">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <span className={`px-2.5 py-1 rounded-lg text-xs font-extrabold shrink-0 border ${
                                                    row.correct
                                                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                                        : row.answered
                                                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                                                            : 'bg-rose-50 text-rose-800 border-rose-200'
                                                }`}>
                                                    Q{row.index}: {row.correct ? 'Correct' : row.answered ? 'Needs work' : 'Unanswered'}
                                                </span>
                                                <span className="text-xs sm:text-sm font-semibold text-slate-800 truncate">{row.question}</span>
                                            </div>
                                            <div className="text-slate-400 shrink-0" aria-hidden="true">
                                                <FaChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
                                            </div>
                                        </summary>

                                        <div className="p-5 pt-3 border-t border-slate-100 bg-slate-50/60 text-xs text-slate-700 space-y-3">
                                            <div className="grid sm:grid-cols-2 gap-3">
                                                <div className="p-3 rounded-xl bg-white border border-slate-200">
                                                    <p className="font-bold text-slate-500 uppercase text-[10px] mb-1">Your Submitted Answer</p>
                                                    <p className="font-semibold text-slate-900">{row.userAnswer || '— No answer selected'}</p>
                                                </div>
                                                <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200">
                                                    <p className="font-bold text-emerald-800 uppercase text-[10px] mb-1">Ideal structure: (Model Answer)</p>
                                                    <p className="font-semibold text-emerald-950">{row.idealAnswer}</p>
                                                </div>
                                            </div>

                                            <div className="space-y-2 pt-1">
                                                <div className="p-3 rounded-xl bg-white border border-slate-200">
                                                    <p className="font-bold text-indigo-700 mb-0.5">✓ What was good:</p>
                                                    <p className="text-slate-700">{row.whatWasGood}</p>
                                                </div>
                                                <div className="p-3 rounded-xl bg-white border border-slate-200">
                                                    <p className="font-bold text-amber-700 mb-0.5">⚠ What was missing / Gap:</p>
                                                    <p className="text-slate-700">{row.whatWasMissing}</p>
                                                </div>
                                                <div className="p-3 rounded-xl bg-purple-50/60 border border-purple-200">
                                                    <p className="font-bold text-purple-900 mb-0.5">★ STAR Method Recommendation:</p>
                                                    <p className="text-purple-950 font-medium">{row.improvement}</p>
                                                </div>
                                                {row.explanation && (
                                                    <div className="p-3 rounded-xl bg-white border border-slate-200 text-slate-600">
                                                        <strong className="text-slate-800">Concept Explanation:</strong> {row.explanation}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </details>
                                ))}
                            </div>
                        </section>

                        {/* 2. Personalized 7-Day Roadmap */}
                        <section className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-xs space-y-4" aria-labelledby="plan-title">
                            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                                <h2 id="plan-title" className="text-base font-bold text-slate-900 flex items-center gap-2">
                                    <FaCalendarAlt className="w-4 h-4 text-indigo-600" aria-hidden="true" />
                                    <span>Personalized 7-Day Improvement Plan</span>
                                </h2>
                                <span className="text-xs font-bold text-indigo-600">Step-by-step Milestones</span>
                            </div>

                            <ul className="space-y-3 text-xs sm:text-sm text-slate-700">
                                {[...report.plan.immediate, ...report.plan.sevenDay].map((item, idx) => (
                                    <li key={idx} className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-start gap-3.5">
                                        <span className="w-7 h-7 rounded-xl bg-indigo-100 border border-indigo-200 text-indigo-700 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5" aria-hidden="true">
                                            {idx + 1}
                                        </span>
                                        <div className="flex-1">
                                            <p className="font-semibold text-slate-900 leading-relaxed">{item}</p>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </section>

                    </div>

                    {/* ── Right Column (5 cols): Mastery Breakdown, Strengths & Focus Areas ── */}
                    <div className="lg:col-span-5 space-y-6">

                        {/* 1. Category Mastery Breakdown */}
                        <section className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-7 shadow-xs space-y-4" aria-labelledby="mastery-title">
                            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                                <h2 id="mastery-title" className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                    <FaBrain className="w-4 h-4 text-indigo-600" aria-hidden="true" />
                                    <span>Category Mastery Breakdown</span>
                                </h2>
                                <span className="text-xs font-semibold text-slate-500">{Object.keys(report.categoryScores || {}).length} Tracks</span>
                            </div>

                            <div className="space-y-3.5">
                                {Object.entries(report.categoryScores || {}).map(([name, score]) => (
                                    <div key={name} className="space-y-1.5">
                                        <div className="flex justify-between text-xs font-semibold">
                                            <span className="text-slate-800">{name}</span>
                                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold ${
                                                score >= 80
                                                    ? 'bg-emerald-100 text-emerald-800'
                                                    : score >= 60
                                                        ? 'bg-indigo-100 text-indigo-800'
                                                        : 'bg-amber-100 text-amber-800'
                                            }`}>
                                                {score}%
                                            </span>
                                        </div>
                                        <div
                                            role="progressbar"
                                            aria-valuenow={score}
                                            aria-valuemin={0}
                                            aria-valuemax={100}
                                            aria-label={`${name} mastery`}
                                            className="h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200/80">
                                            <div
                                                className={`h-full rounded-full transition-all duration-500 motion-reduce:transition-none ${
                                                    score >= 80
                                                        ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
                                                        : score >= 60
                                                            ? 'bg-gradient-to-r from-indigo-500 to-purple-500'
                                                            : 'bg-gradient-to-r from-amber-500 to-orange-500'
                                                }`}
                                                style={{ width: `${score}%` }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>

                        {/* 2. Demonstrated Strengths */}
                        <section className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-7 shadow-xs space-y-3" aria-labelledby="strengths-title">
                            <h2 id="strengths-title" className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                <FaCheckCircle className="w-4 h-4 text-emerald-600" aria-hidden="true" />
                                <span>Demonstrated Strengths</span>
                            </h2>
                            {report.strengths?.length ? (
                                <ul className="space-y-2 text-xs text-slate-700">
                                    {report.strengths.map((item, idx) => (
                                        <li key={idx} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-emerald-50/50 border border-emerald-100">
                                            <FaCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
                                            <span className="font-semibold text-emerald-950">{item}</span>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-xs text-slate-500">Answer more questions accurately to unlock strengths.</p>
                            )}
                        </section>

                        {/* 3. Focus & Improvement Areas */}
                        <section className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-7 shadow-xs space-y-3" aria-labelledby="focus-title">
                            <h2 id="focus-title" className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                <FaLightbulb className="w-4 h-4 text-amber-500" aria-hidden="true" />
                                <span>Focus &amp; Improvement Areas</span>
                            </h2>
                            {report.weaknesses?.length ? (
                                <ul className="space-y-2 text-xs text-slate-700">
                                    {report.weaknesses.map((item, index) => (
                                        <li key={index} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-amber-50/60 border border-amber-200">
                                            <FaExclamationTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
                                            <span className="text-amber-950 leading-relaxed">
                                                <strong>{item.area}:</strong> {item.detail}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-xs text-slate-500">No major weakness areas identified! Stellar work.</p>
                            )}
                        </section>

                        {/* 4. JD Alignment Matrix (When present) */}
                        {!!report.missingSkills?.length && (
                            <section className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-7 shadow-xs space-y-3" aria-labelledby="jd-title">
                                <h2 id="jd-title" className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                    <FaBullseye className="w-4 h-4 text-indigo-600" aria-hidden="true" />
                                    <span>Job Description (JD) Alignment Matrix</span>
                                </h2>
                                <div className="space-y-2">
                                    {report.missingSkills.map((item, idx) => (
                                        <div key={idx} className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                                            <p className="font-bold text-indigo-900">{item.requirement}</p>
                                            <p className="text-slate-600 mt-1">{item.gap}</p>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* 5. Quick Rehearsal CTA Card */}
                        <div className="p-6 rounded-3xl bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 text-center space-y-3 print:hidden">
                            <p className="font-bold text-sm text-slate-900">Ready for another drill?</p>
                            <p className="text-xs text-slate-600">Retaking tests builds confidence and improves memory recall for technical questions.</p>
                            <button
                                type="button"
                                onClick={onRetake}
                                className="w-full py-3 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-600/20 transition-all cursor-pointer flex items-center justify-center gap-2">
                                <FaRedo className="w-3 h-3" aria-hidden="true" />
                                <span>Start Next Simulation</span>
                            </button>
                        </div>

                    </div>
                </div>

            </div>
        </div>
    );
}

export default DashboardInterviews;
