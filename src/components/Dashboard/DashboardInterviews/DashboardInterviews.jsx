import React, { useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
    FaArrowLeft, FaArrowRight, FaAward, FaBrain, FaBriefcase, FaBullseye,
    FaCalendarAlt, FaCheck, FaCheckCircle, FaChevronDown, FaChevronRight,
    FaClock, FaExclamationTriangle, FaFileAlt, FaFlag, FaGraduationCap,
    FaLaptopCode, FaLightbulb, FaMagic, FaPlay, FaRedo, FaSave, FaTimes,
    FaTrophy, FaUndo, FaUserTie,
} from 'react-icons/fa';
import { AuthContext } from '../../../main';
import config from '../../../conf/configuration';
import fire from '../../../conf/fire';
import { getResumes } from '../../../firestore/dbOperations';
import {
    DIFFICULTIES, DURATION_PRESETS, EXPERIENCE_LEVELS, INTERVIEW_MODES, INTERVIEW_TYPES, PALETTE_META,
    appendHistory, buildInterviewReport, clearOwnerSession, formatClock, paletteStatus,
    readHistory, readOwnerSession, remainingFromDeadline, resolveDurationSeconds,
    sanitizeJobDescription, sanitizeResumeFacts, scoreTrend, writeOwnerSession,
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
            return { ...state, phase: 'report', report: action.report, confirmFinish: false, isPaused: false };
        case 'RESTORE':
            return { ...state, ...action.snapshot, isLoading: false };
        case 'RESET':
            return { ...initialState, mode: state.mode, interviewType: state.interviewType, occupation: state.occupation };
        default:
            return state;
    }
}

const DashboardInterviews = () => {
    const user = useContext(AuthContext);
    const ownerUid = user?.uid || null;
    const [state, dispatch] = useReducer(interviewReducer, initialState);
    const [resumes, setResumes] = useState([]);
    const [history, setHistory] = useState([]);
    const [paletteOpen, setPaletteOpen] = useState(false);
    const [viewingHistory, setViewingHistory] = useState(null);
    const requestControllerRef = useRef(null);
    const modeMeta = INTERVIEW_MODES[state.mode] || INTERVIEW_MODES.assessment;

    useEffect(() => {
        setHistory(readHistory(ownerUid));
        const saved = readOwnerSession(ownerUid);
        if (saved?.phase === 'exam' && saved.interviewData?.questions) {
            const remaining = saved.deadlineAt ? remainingFromDeadline(saved.deadlineAt) : saved.timeRemaining;
            dispatch({ type: 'RESTORE', snapshot: { ...saved, timeRemaining: remaining ?? saved.timeRemaining, ownerUid } });
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

    useEffect(() => {
        if (state.phase !== 'exam') return undefined;
        writeOwnerSession(ownerUid, { ...state, flaggedQuestions: state.marked, ownerUid });
    }, [state, ownerUid]);

    useEffect(() => {
        if (state.phase !== 'exam' || state.isPaused || !state.deadlineAt) return undefined;
        const tick = () => {
            const remaining = remainingFromDeadline(state.deadlineAt);
            dispatch({ type: 'TICK', remaining });
            if (remaining === 0) finishInterview();
        };
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [state.phase, state.isPaused, state.deadlineAt]);

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
            const headers = { 'Content-Type': 'application/json' };
            try {
                const currentUser = fire?.auth?.()?.currentUser;
                if (currentUser) {
                    const token = await currentUser.getIdToken();
                    if (token) headers['Authorization'] = `Bearer ${token}`;
                }
            } catch (_) {}

            const response = await fetch(`${config.provider}://${config.backendUrl}/api/generate-interview`, {
                method: 'POST',
                headers,
                signal: requestController.signal,
                body: JSON.stringify({
                    occupation: state.occupation,
                    interviewType: state.interviewType,
                    questionCount: state.questionCount,
                    language: currentLanguage,
                    experienceLevel: state.experienceLevel,
                    difficulty: state.difficulty,
                    jobDescription: sanitizeJobDescription(state.jobDescription),
                    resumeFacts: state.resumeFacts,
                }),
            });
            if (!response.ok) throw new Error(`API error: ${response.status}`);
            const data = await response.json();
            if (!data?.questions?.length) throw new Error('No questions were generated');
            dispatch({ type: 'FETCH_OK', data });
        } catch (error) {
            if (error?.name !== 'AbortError') dispatch({ type: 'FETCH_ERR', error: error.message });
        } finally {
            if (requestControllerRef.current === requestController) requestControllerRef.current = null;
        }
    }, [state.occupation, state.interviewType, state.questionCount, state.experienceLevel, state.difficulty, state.jobDescription, state.resumeFacts]);

    const finishInterview = useCallback(() => {
        const questions = state.interviewData?.questions || [];
        const report = buildInterviewReport({
            questions,
            answers: state.selectedAnswers,
            timePerQuestion: state.timePerQuestion,
            timeLimit: state.timeLimit,
            timeRemaining: state.timeRemaining,
            interviewType: state.interviewType,
            jobDescription: state.jobDescription,
        });
        const entry = {
            completedAt: new Date().toISOString(),
            role: state.occupation,
            interviewType: state.interviewType,
            mode: state.mode,
            score: report.overall,
            duration: report.timeUsed,
            status: 'completed',
            report,
            interviewData: state.interviewData,
            selectedAnswers: state.selectedAnswers,
        };
        setHistory(appendHistory(ownerUid, entry));
        clearOwnerSession(ownerUid);
        dispatch({ type: 'COMPLETE', report });
    }, [state, ownerUid]);

    const questions = state.interviewData?.questions || [];
    const current = questions[state.currentQuestion];
    const markedSet = useMemo(() => asSet(state.marked), [state.marked]);
    const visitedSet = useMemo(() => asSet(state.visited), [state.visited]);

    const selectResume = (resume) => {
        const fallbackTitle = resume.item?.title && resume.item?.title !== 'Untitled Resume'
            ? resume.item.title
            : (resume.item?.occupation || (resume.item?.firstname ? `${resume.item.firstname}'s Resume` : `Resume #${resume.id?.slice(0, 6)}`));

        if (state.resumeLabel === fallbackTitle) {
            // Deselect
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
        return <ReportView report={viewingHistory.report} meta={viewingHistory} onBack={() => setViewingHistory(null)} history={history} onRetake={() => { setViewingHistory(null); dispatch({ type: 'RESET' }); }} />;
    }

    if (state.phase === 'report' && state.report) {
        return (
            <ReportView
                report={state.report}
                meta={{ role: state.occupation, interviewType: state.interviewType, mode: state.mode, score: state.report.overall }}
                onBack={() => dispatch({ type: 'RESET' })}
                history={history}
                onRetake={() => dispatch({ type: 'RESET' })}
            />
        );
    }

    // ── CBT EXAMINATION VIEW ──────────────────────────────────────────────────
    if (state.phase === 'exam' && current) {
        const allowPause = modeMeta.allowPause && state.timeLimit > 0;
        const answeredCount = Object.keys(state.selectedAnswers).length;
        const progressPct = Math.round((answeredCount / questions.length) * 100);

        return (
            <div className="min-h-[calc(100vh-2rem)] bg-slate-900 text-slate-100 flex flex-col font-sans">
                {/* ── Modern CBT Header Bar ── */}
                <header className="bg-slate-950/90 backdrop-blur-md border-b border-slate-800 px-4 sm:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-40 shadow-xl">
                    <div className="flex items-center gap-3.5">
                        <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-extrabold shrink-0 shadow-xs">
                            <FaLaptopCode className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <p className="text-xs uppercase tracking-widest text-indigo-400 font-bold">Computer Based Test</p>
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                    CBT Assessment Shell
                                </span>
                                <span className="text-xs text-slate-400 hidden sm:inline">· {state.interviewType}</span>
                            </div>
                            <h1 className="text-base sm:text-lg font-bold text-white tracking-tight line-clamp-1">{state.occupation}</h1>
                        </div>
                    </div>

                    {/* Timer & Controls */}
                    <div className="flex items-center gap-2.5 sm:gap-4">
                        <div
                            role="timer"
                            aria-live="polite"
                            aria-label={`Time remaining ${formatClock(state.timeRemaining)}`}
                            className={`flex items-center gap-2 font-mono text-base sm:text-lg font-bold px-3.5 py-1.5 rounded-xl border transition-all duration-300 shadow-inner ${
                                state.timeRemaining <= 60 && state.timeLimit > 0
                                    ? 'bg-rose-500/20 border-rose-500 text-rose-300 animate-pulse ring-2 ring-rose-500/40'
                                    : 'bg-slate-900/80 border-slate-700/80 text-emerald-400'
                            }`}>
                            <FaClock className={`w-4 h-4 ${state.timeRemaining <= 60 ? 'text-rose-400' : 'text-emerald-400'}`} aria-hidden="true" />
                            <span>{state.timeLimit ? formatClock(state.timeRemaining) : 'Untimed Rehearsal'}</span>
                        </div>

                        {allowPause && (
                            <button
                                type="button"
                                className="px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 transition-all cursor-pointer flex items-center gap-1.5"
                                onClick={() => dispatch({ type: 'PAUSE', value: !state.isPaused })}>
                                <FaClock className="w-3 h-3 text-amber-400" />
                                <span>{state.isPaused ? 'Resume' : 'Pause'}</span>
                            </button>
                        )}

                        <button
                            type="button"
                            className="lg:hidden px-3.5 py-1.5 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition-all cursor-pointer flex items-center gap-1.5 shadow-md shadow-indigo-600/20"
                            onClick={() => setPaletteOpen(true)}
                            aria-label="Open question palette">
                            <span>Palette</span>
                            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20">{answeredCount}/{questions.length}</span>
                        </button>
                    </div>
                </header>

                {/* Expiry Warning Alert */}
                {state.warnExpiry && (
                    <div role="alert" className="bg-amber-500/15 border-b border-amber-500/30 text-amber-300 px-6 py-2.5 text-xs sm:text-sm font-medium flex items-center justify-center gap-2">
                        <FaExclamationTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>Less than 60 seconds remaining! All recorded answers will automatically be evaluated when the timer reaches 0.</span>
                    </div>
                )}

                {/* Paused Overlay Notice */}
                {state.isPaused && (
                    <div className="bg-amber-500/10 border-b border-amber-500/30 text-amber-300 px-6 py-2 text-xs font-semibold text-center">
                        Assessment Paused · Clock is stopped. Click &quot;Resume&quot; above to continue.
                    </div>
                )}

                {/* ── Main Two-Column Exam Grid ── */}
                <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 grid lg:grid-cols-[1fr_340px] gap-6 items-start">
                    {/* Left: Question Workspace Card */}
                    <main className={`bg-slate-800/80 backdrop-blur-md rounded-3xl border border-slate-700/80 p-6 sm:p-8 shadow-2xl flex flex-col justify-between min-h-[520px] transition-opacity duration-200 ${state.isPaused ? 'pointer-events-none opacity-40' : ''}`}>
                        <div>
                            {/* Question Meta Bar */}
                            <div className="flex flex-wrap items-center justify-between gap-3 mb-5 pb-4 border-b border-slate-700/60">
                                <div className="flex items-center gap-2">
                                    <span className="px-3 py-1 rounded-xl text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                        Question {state.currentQuestion + 1} of {questions.length}
                                    </span>
                                    {current.category && (
                                        <span className="px-2.5 py-1 rounded-xl text-xs font-medium bg-slate-700/70 text-slate-300 border border-slate-600/50">
                                            {current.category}
                                        </span>
                                    )}
                                    {current.difficulty && (
                                        <span className="px-2.5 py-1 rounded-xl text-xs font-medium bg-slate-700/70 text-slate-300 border border-slate-600/50 hidden sm:inline">
                                            {current.difficulty}
                                        </span>
                                    )}
                                </div>
                                {markedSet.has(current.id) && (
                                    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1.5">
                                        <FaFlag className="w-3 h-3 text-amber-400" /> Marked for Review
                                    </span>
                                )}
                            </div>

                            {/* Question Title */}
                            <h2 className="text-lg sm:text-xl font-bold text-white leading-relaxed mb-6">
                                {current.question}
                            </h2>

                            {/* Options Radio List */}
                            <div className="space-y-3" role="radiogroup" aria-label="Answer options">
                                {(current.options || []).map((option, index) => {
                                    const selected = state.selectedAnswers[current.id] === index;
                                    const letter = String.fromCharCode(65 + index);
                                    return (
                                        <label
                                            key={index}
                                            className={`flex items-start gap-4 p-4 rounded-2xl border transition-all duration-200 cursor-pointer select-none group ${
                                                selected
                                                    ? 'bg-gradient-to-r from-indigo-900/60 to-purple-900/40 border-indigo-500 shadow-md ring-1 ring-indigo-400/40 text-white'
                                                    : 'bg-slate-900/50 hover:bg-slate-700/50 border-slate-700/70 text-slate-200 hover:border-slate-600'
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
                                                    ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-400'
                                                    : 'bg-slate-800 group-hover:bg-slate-700 text-slate-400 border border-slate-700'
                                            }`}>
                                                {selected ? <FaCheck className="w-3.5 h-3.5 text-white" /> : letter}
                                            </div>
                                            <span className="text-sm sm:text-base leading-relaxed pt-1 flex-1 font-medium">
                                                <span className="font-bold mr-2 text-indigo-300">{letter}.</span>
                                                {option}
                                            </span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Bottom Action Controls */}
                        <div className="mt-8 pt-6 border-t border-slate-700/60 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    className="px-4 py-2.5 text-xs sm:text-sm font-semibold rounded-xl bg-slate-900/80 hover:bg-slate-700 border border-slate-700 text-slate-300 disabled:opacity-40 disabled:pointer-events-none transition-all flex items-center gap-2 cursor-pointer"
                                    disabled={state.currentQuestion === 0}
                                    onClick={() => dispatch({ type: 'NAVIGATE', index: state.currentQuestion - 1 })}>
                                    <FaArrowLeft className="w-3.5 h-3.5" />
                                    <span>Previous</span>
                                </button>
                                <button
                                    type="button"
                                    className={`px-3.5 py-2.5 text-xs sm:text-sm font-semibold rounded-xl border transition-all flex items-center gap-2 cursor-pointer ${
                                        markedSet.has(current.id)
                                            ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 hover:bg-amber-500/30'
                                            : 'bg-slate-900/80 border-slate-700 text-slate-300 hover:bg-slate-700'
                                    }`}
                                    onClick={() => dispatch({ type: 'TOGGLE_MARK', questionId: current.id })}>
                                    <FaFlag className={`w-3.5 h-3.5 ${markedSet.has(current.id) ? 'text-amber-400' : 'text-slate-400'}`} />
                                    <span className="hidden sm:inline">{markedSet.has(current.id) ? 'Unmark Review' : 'Mark for Review'}</span>
                                    <span className="sm:hidden">Flag</span>
                                </button>
                                <button
                                    type="button"
                                    className="px-3.5 py-2.5 text-xs sm:text-sm font-semibold rounded-xl bg-slate-900/80 hover:bg-rose-950/30 border border-slate-700 hover:border-rose-500/40 text-slate-400 hover:text-rose-300 transition-all flex items-center gap-2 cursor-pointer"
                                    onClick={() => dispatch({ type: 'CLEAR_ANSWER', questionId: current.id })}>
                                    <FaTimes className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline">Clear Answer</span>
                                    <span className="sm:hidden">Clear</span>
                                </button>
                            </div>

                            <div>
                                {state.currentQuestion < questions.length - 1 ? (
                                    <button
                                        type="button"
                                        className="px-6 py-2.5 text-xs sm:text-sm font-bold rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-lg shadow-indigo-600/30 hover:shadow-indigo-600/50 transition-all flex items-center gap-2 cursor-pointer"
                                        onClick={() => dispatch({ type: 'NAVIGATE', index: state.currentQuestion + 1 })}>
                                        <span>Save &amp; Next</span>
                                        <FaArrowRight className="w-3.5 h-3.5" />
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        className="px-6 py-2.5 text-xs sm:text-sm font-bold rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-600/30 hover:shadow-emerald-600/50 transition-all flex items-center gap-2 cursor-pointer"
                                        onClick={() => dispatch({ type: 'PATCH', patch: { confirmFinish: true } })}>
                                        <FaSave className="w-3.5 h-3.5" />
                                        <span>Submit</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </main>

                    {/* Right: Question Palette Sidebar (Desktop) */}
                    <aside className="hidden lg:block bg-slate-800/80 backdrop-blur-md rounded-3xl border border-slate-700/80 p-6 shadow-2xl sticky top-24">
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
                    <div className="lg:hidden fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-end" onClick={() => setPaletteOpen(false)}>
                        <div className="w-[88vw] max-w-sm h-full bg-slate-900 border-l border-slate-700 p-6 overflow-y-auto" onClick={event => event.stopPropagation()}>
                            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
                                <h3 className="font-bold text-white text-base">Question Palette</h3>
                                <button type="button" className="px-3 py-1.5 text-slate-300 hover:text-white rounded-xl bg-slate-800 border border-slate-700 flex items-center gap-1.5 text-xs font-semibold" onClick={() => setPaletteOpen(false)}>
                                    <FaTimes className="w-3.5 h-3.5" />
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

                {/* Submit Confirmation Modal */}
                {state.confirmFinish && (
                    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
                        <div role="dialog" aria-modal="true" aria-labelledby="submit-title" className="bg-slate-900 border border-slate-700 rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl text-white">
                            <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-extrabold mb-4">
                                <FaAward className="w-6 h-6 text-indigo-400" />
                            </div>
                            <h3 id="submit-title" className="font-bold text-xl mb-2 text-white">Submit assessment?</h3>
                            <p className="text-sm text-slate-300 mb-6 leading-relaxed">
                                You have answered <span className="font-bold text-white">{Object.keys(state.selectedAnswers).length}</span> of <span className="font-bold text-white">{questions.length}</span> questions.
                                Unanswered items will be evaluated as incomplete. Are you ready to view your assessment score and STAR analysis?
                            </p>
                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    className="flex-1 py-3 text-xs sm:text-sm font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all cursor-pointer"
                                    onClick={() => dispatch({ type: 'PATCH', patch: { confirmFinish: false } })}>
                                    Continue Test
                                </button>
                                <button
                                    type="button"
                                    className="flex-1 py-3 text-xs sm:text-sm font-bold rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-600/30 transition-all cursor-pointer"
                                    onClick={finishInterview}>
                                    Submit now
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // ── SETUP SCREEN VIEW ─────────────────────────────────────────────────────
    const trend = scoreTrend(history);
    const selectedResume = resumes.find(r => (r.item?.title || r.item?.occupation || r.id) === state.resumeLabel);

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-8 font-sans">
            <div className="max-w-6xl mx-auto space-y-8">

                {/* ── 1. Hero Header Banner ── */}
                <header className="relative bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 sm:p-10 border border-slate-800 shadow-2xl overflow-hidden">
                    <div className="absolute -right-16 -top-16 w-80 h-80 bg-indigo-500/15 rounded-full blur-3xl pointer-events-none"></div>
                    <div className="absolute -left-16 -bottom-16 w-80 h-80 bg-purple-500/15 rounded-full blur-3xl pointer-events-none"></div>

                    <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="max-w-2xl">
                            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 mb-3 shadow-inner">
                                <FaMagic className="w-3 h-3 text-amber-400 animate-pulse" />
                                <span>AI-Powered CBT Exam Suite</span>
                            </span>
                            <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight mb-2">
                                AI Interview Coach
                            </h1>
                            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                                Practice real-world technical, behavioral, and architectural interviews with timed CBT examination rules, instant scoring, and actionable STAR coaching.
                            </p>
                        </div>

                        {/* Quick Stats Widget */}
                        <div className="grid grid-cols-2 gap-3 shrink-0">
                            <div className="bg-slate-900/80 backdrop-blur-sm border border-slate-800 rounded-2xl p-3.5 text-center shadow-md">
                                <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Total Drills</p>
                                <p className="text-xl sm:text-2xl font-black text-white">{history.length}</p>
                            </div>
                            <div className="bg-slate-900/80 backdrop-blur-sm border border-slate-800 rounded-2xl p-3.5 text-center shadow-md">
                                <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Avg Score</p>
                                <p className="text-xl sm:text-2xl font-black text-emerald-400">
                                    {history.length ? `${Math.round(history.reduce((a, b) => a + (Number(b.score) || 0), 0) / history.length)}%` : '—'}
                                </p>
                            </div>
                        </div>
                    </div>
                </header>

                {/* ── 2. Interactive Setup Configuration Card ── */}
                <section className="bg-slate-900/90 backdrop-blur-md rounded-3xl border border-slate-800 p-6 sm:p-10 shadow-2xl space-y-8">

                    {/* Step 1: Mode Selection */}
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] flex items-center justify-center font-black">1</span>
                                <span>Choose Interview Mode</span>
                            </h2>
                            <span className="text-xs text-slate-500">CBT rules adapt dynamically</span>
                        </div>

                        <div className="grid sm:grid-cols-3 gap-3.5">
                            {/* Practice Card */}
                            <div
                                onClick={() => applyDuration({ mode: 'practice', timerEnabled: false })}
                                className={`p-5 rounded-2xl border transition-all duration-200 cursor-pointer relative overflow-hidden group ${
                                    state.mode === 'practice'
                                        ? 'bg-gradient-to-b from-indigo-950/70 to-slate-900 border-indigo-500 shadow-lg ring-1 ring-indigo-400/40 text-white'
                                        : 'bg-slate-950/50 hover:bg-slate-800/50 border-slate-800 text-slate-300 hover:border-slate-700'
                                }`}>
                                <div className="flex items-center justify-between mb-3">
                                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                                        <FaGraduationCap className="w-5 h-5" />
                                    </div>
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                        Self-Paced
                                    </span>
                                </div>
                                <h3 className="font-bold text-base text-white mb-1">Practice Mode</h3>
                                <p className="text-xs text-slate-400 leading-relaxed">Untimed drill with free pause and question navigation.</p>
                            </div>

                            {/* Mock Interview Card */}
                            <div
                                onClick={() => applyDuration({ mode: 'mock', timerEnabled: true })}
                                className={`p-5 rounded-2xl border transition-all duration-200 cursor-pointer relative overflow-hidden group ${
                                    state.mode === 'mock'
                                        ? 'bg-gradient-to-b from-indigo-950/70 to-slate-900 border-indigo-500 shadow-lg ring-1 ring-indigo-400/40 text-white'
                                        : 'bg-slate-950/50 hover:bg-slate-800/50 border-slate-800 text-slate-300 hover:border-slate-700'
                                }`}>
                                <div className="flex items-center justify-between mb-3">
                                    <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                                        <FaUserTie className="w-5 h-5" />
                                    </div>
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                        Realistic
                                    </span>
                                </div>
                                <h3 className="font-bold text-base text-white mb-1">Mock Interview</h3>
                                <p className="text-xs text-slate-400 leading-relaxed">Timed interview simulation with pause capability.</p>
                            </div>

                            {/* CBT Assessment Card */}
                            <div
                                onClick={() => applyDuration({ mode: 'assessment', timerEnabled: true })}
                                className={`p-5 rounded-2xl border transition-all duration-200 cursor-pointer relative overflow-hidden group ${
                                    state.mode === 'assessment'
                                        ? 'bg-gradient-to-b from-indigo-950/70 to-slate-900 border-indigo-500 shadow-lg ring-1 ring-indigo-400/40 text-white'
                                        : 'bg-slate-950/50 hover:bg-slate-800/50 border-slate-800 text-slate-300 hover:border-slate-700'
                                }`}>
                                <div className="flex items-center justify-between mb-3">
                                    <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
                                        <FaLaptopCode className="w-5 h-5" />
                                    </div>
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                        Strict CBT
                                    </span>
                                </div>
                                <h3 className="font-bold text-base text-white mb-1">CBT Examination</h3>
                                <p className="text-xs text-slate-400 leading-relaxed">Strict examination timer with automated timeout submission.</p>
                            </div>
                        </div>
                    </div>

                    {/* Step 2: Target Role & Quick-Pick Chips */}
                    <div>
                        <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-300 mb-3 flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] flex items-center justify-center font-black">2</span>
                            <span>Target Role &amp; Discipline</span>
                        </h2>

                        <div className="relative mb-3">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                                <FaBriefcase className="w-4 h-4" />
                            </div>
                            <input
                                type="text"
                                className="w-full bg-slate-950/80 border border-slate-700/80 rounded-2xl pl-11 pr-4 py-3.5 text-sm sm:text-base font-semibold text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 transition-all shadow-inner"
                                value={state.occupation}
                                onChange={event => dispatch({ type: 'PATCH', patch: { occupation: event.target.value } })}
                                placeholder="Software Engineer"
                            />
                        </div>

                        {/* Quick Selection Pills */}
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-slate-400 font-medium mr-1">Suggested:</span>
                            {POPULAR_ROLES.map(role => (
                                <button
                                    key={role.title}
                                    type="button"
                                    onClick={() => dispatch({ type: 'PATCH', patch: { occupation: role.title, interviewType: role.type } })}
                                    className={`px-3 py-1 text-xs font-semibold rounded-full border transition-all cursor-pointer ${
                                        state.occupation === role.title
                                            ? 'bg-indigo-600 border-indigo-500 text-white shadow-xs'
                                            : 'bg-slate-950/60 hover:bg-slate-800 border-slate-800 text-slate-400 hover:text-slate-200'
                                    }`}>
                                    {role.title}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Step 3: Configuration Grid */}
                    <div>
                        <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-300 mb-4 flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] flex items-center justify-center font-black">3</span>
                            <span>Evaluation Parameters</span>
                        </h2>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            {/* Track / Type */}
                            <label className="block">
                                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5 block">Interview Track</span>
                                <select
                                    className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm font-medium text-white focus:outline-hidden focus:border-indigo-500 transition-all cursor-pointer"
                                    value={state.interviewType}
                                    onChange={event => dispatch({ type: 'PATCH', patch: { interviewType: event.target.value } })}>
                                    {INTERVIEW_TYPES.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}
                                </select>
                            </label>

                            {/* Experience */}
                            <label className="block">
                                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5 block">Seniority Level</span>
                                <select
                                    className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm font-medium text-white focus:outline-hidden focus:border-indigo-500 transition-all cursor-pointer"
                                    value={state.experienceLevel}
                                    onChange={event => dispatch({ type: 'PATCH', patch: { experienceLevel: event.target.value } })}>
                                    {EXPERIENCE_LEVELS.map(level => <option key={level.id} value={level.id}>{level.label}</option>)}
                                </select>
                            </label>

                            {/* Difficulty */}
                            <label className="block">
                                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5 block">Difficulty</span>
                                <select
                                    className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm font-medium text-white focus:outline-hidden focus:border-indigo-500 transition-all cursor-pointer"
                                    value={state.difficulty}
                                    onChange={event => dispatch({ type: 'PATCH', patch: { difficulty: event.target.value } })}>
                                    {DIFFICULTIES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
                                </select>
                            </label>

                            {/* Question Count */}
                            <label className="block">
                                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5 block">Question Count</span>
                                <select
                                    className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm font-medium text-white focus:outline-hidden focus:border-indigo-500 transition-all cursor-pointer"
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
                        <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-300 mb-3 flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] flex items-center justify-center font-black">4</span>
                            <span>Examination Duration</span>
                        </h2>

                        {state.mode === 'practice' && (
                            <label className="flex items-center gap-2.5 text-xs text-slate-300 mb-3 select-none cursor-pointer">
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
                                    className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                                        state.durationPreset === minutes
                                            ? 'bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-600/30'
                                            : 'bg-slate-950/60 hover:bg-slate-800 border-slate-800 text-slate-400 hover:text-slate-200'
                                    }`}
                                    onClick={() => applyDuration({ durationPreset: minutes })}>
                                    {minutes} min
                                </button>
                            ))}
                            <button
                                type="button"
                                className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                                    state.durationPreset === 'custom'
                                        ? 'bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-600/30'
                                        : 'bg-slate-950/60 hover:bg-slate-800 border-slate-800 text-slate-400 hover:text-slate-200'
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
                                        className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 w-20 text-xs font-bold text-white"
                                        value={state.customMinutes}
                                        onChange={event => applyDuration({ customMinutes: Number(event.target.value) })}
                                    />
                                    <span className="text-xs text-slate-400">minutes (5–180)</span>
                                </div>
                            )}
                        </div>
                        <p className="text-xs text-slate-400 mt-2 font-medium">
                            Selected duration: <span className="text-emerald-400 font-bold">{state.timeLimit ? formatClock(state.timeLimit) : 'Untimed practice'}</span>
                            {state.timeLimit > 0 && <span className="text-slate-400"> · Approx {((state.timeLimit / 60) / state.questionCount).toFixed(1)} min per question</span>}
                        </p>
                    </div>

                    {/* Step 5: Tailoring & Context */}
                    <div className="space-y-6 pt-4 border-t border-slate-800/80">
                        {/* Target Job Description */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                                    <FaBullseye className="w-3.5 h-3.5 text-indigo-400" />
                                    <span>Target Job Description (Optional — AI Tailoring)</span>
                                </label>
                                <span className="text-[10px] text-slate-400">Facts strictly grounded</span>
                            </div>
                            <textarea
                                className="w-full bg-slate-950/80 border border-slate-700/80 rounded-2xl px-4 py-3 text-xs sm:text-sm text-slate-200 placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 min-h-[90px] transition-all shadow-inner"
                                value={state.jobDescription}
                                onChange={event => dispatch({ type: 'PATCH', patch: { jobDescription: event.target.value } })}
                                placeholder="Paste a JD. Only this text is used — nothing is invented."
                            />
                        </div>

                        {/* Resume Selection */}
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                                    <FaFileAlt className="w-3.5 h-3.5 text-indigo-400" />
                                    <span>Resume Personalization (Optional — Uses Candidate History)</span>
                                </label>
                                {state.resumeLabel && (
                                    <button
                                        type="button"
                                        onClick={() => dispatch({ type: 'PATCH', patch: { resumeLabel: '', resumeFacts: '' } })}
                                        className="text-[11px] font-semibold text-rose-400 hover:text-rose-300 underline cursor-pointer">
                                        Clear Selected Resume
                                    </button>
                                )}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {resumes.map(resume => {
                                    const title = resume.item?.title && resume.item?.title !== 'Untitled Resume'
                                        ? resume.item.title
                                        : (resume.item?.occupation || (resume.item?.firstname ? `${resume.item.firstname}'s Resume` : `Resume #${resume.id?.slice(0, 6)}`));
                                    const isSelected = state.resumeLabel === title;

                                    return (
                                        <div
                                            key={resume.id}
                                            onClick={() => selectResume(resume)}
                                            className={`p-3.5 rounded-2xl border transition-all duration-200 cursor-pointer flex items-center gap-3 select-none ${
                                                isSelected
                                                    ? 'bg-indigo-950/80 border-indigo-500 shadow-md ring-1 ring-indigo-400/40 text-white'
                                                    : 'bg-slate-950/60 hover:bg-slate-800/60 border-slate-800 text-slate-300'
                                            }`}>
                                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                                                {isSelected ? <FaCheck className="w-3.5 h-3.5 text-white" /> : <FaFileAlt className="w-3.5 h-3.5" />}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-xs font-bold text-white truncate">{title}</p>
                                                <p className="text-[10px] text-slate-400 truncate">{resume.item?.occupation || 'Candidate Profile'}</p>
                                            </div>
                                        </div>
                                    );
                                })}

                                {!resumes.length && (
                                    <div className="col-span-full p-4 rounded-2xl bg-slate-950/40 border border-slate-800/80 text-center">
                                        <p className="text-xs text-slate-400">No saved resumes found. The assessment will generate standard industry-level questions.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Error Notice */}
                    {state.loadingError && (
                        <div role="alert" className="p-4 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs sm:text-sm flex items-center gap-2">
                            <FaExclamationTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                            <span>{state.loadingError}</span>
                        </div>
                    )}

                    {/* Start Button */}
                    <div className="pt-2">
                        <button
                            type="button"
                            disabled={!state.occupation.trim() || state.isLoading}
                            onClick={fetchInterviewQuestions}
                            className="w-full sm:w-auto px-8 py-4 rounded-2xl font-bold text-sm sm:text-base text-white bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-600 hover:from-indigo-500 hover:to-purple-500 shadow-xl shadow-indigo-600/30 hover:shadow-indigo-600/50 hover:-translate-y-0.5 disabled:opacity-50 disabled:pointer-events-none transition-all duration-200 flex items-center justify-center gap-3 cursor-pointer">
                            {state.isLoading ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                    <span>Generating Questions with AI…</span>
                                </>
                            ) : (
                                <>
                                    <FaPlay className="w-4 h-4" />
                                    <span>Start interview</span>
                                </>
                            )}
                        </button>
                    </div>
                </section>

                {/* ── 3. Previous Assessments History ── */}
                <section className="bg-slate-900/90 backdrop-blur-md rounded-3xl border border-slate-800 p-6 sm:p-8 shadow-2xl space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-base font-bold text-white flex items-center gap-2">
                            <FaAward className="w-4 h-4 text-amber-400" />
                            <span>Previous Assessments</span>
                        </h2>
                        {trend.length > 1 && (
                            <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
                                Trend: {trend.map(p => `${p.score}%`).join(' → ')}
                            </span>
                        )}
                    </div>

                    {!history.length ? (
                        <div className="p-8 text-center rounded-2xl bg-slate-950/40 border border-slate-800">
                            <FaBrain className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                            <p className="text-xs text-slate-400">No previous sessions yet. Start your first AI mock interview above!</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                            {history.map(item => (
                                <div
                                    key={item.id}
                                    className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 flex items-center justify-between gap-4 hover:border-slate-700 transition-all">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-xs font-bold text-white truncate">{item.role}</span>
                                            <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase bg-slate-800 text-slate-300">
                                                {item.interviewType}
                                            </span>
                                        </div>
                                        <p className="text-[11px] text-slate-400">
                                            {new Date(item.completedAt).toLocaleDateString()} · Time Used: {formatClock(item.duration || 0)}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0">
                                        <div className="text-right">
                                            <span className={`text-base font-black ${
                                                item.score >= 80 ? 'text-emerald-400' : item.score >= 60 ? 'text-indigo-400' : 'text-amber-400'
                                            }`}>
                                                {item.score}%
                                            </span>
                                            <p className="text-[9px] uppercase tracking-wider text-slate-400">Score</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setViewingHistory(item)}
                                            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 text-indigo-300 transition-all cursor-pointer">
                                            Open report
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

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
                    <h3 className="font-bold text-sm text-white uppercase tracking-wider">Question Palette</h3>
                    <span className="text-xs font-bold text-indigo-400">{answeredCount}/{questions.length}</span>
                </div>
                <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-700/60">
                    <div className="bg-gradient-to-r from-indigo-500 to-purple-500 h-full rounded-full transition-all duration-300" style={{ width: `${progressPct}%` }}></div>
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
                                className={`w-full aspect-square rounded-xl text-xs font-extrabold transition-all duration-150 flex items-center justify-center cursor-pointer shadow-xs ${meta.className}`}
                                onClick={() => onJump(index)}>
                                {index + 1}
                                <span className="sr-only"> {meta.label}</span>
                            </button>
                        </li>
                    );
                })}
            </ul>

            {/* Status Legend */}
            <div className="pt-3 border-t border-slate-700/60">
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">Status Legend</p>
                <ul className="grid grid-cols-2 gap-2 text-[11px] text-slate-300">
                    {Object.entries(PALETTE_META).map(([key, meta]) => (
                        <li key={key} className="flex items-center gap-2">
                            <span className={`w-5 h-5 rounded-md flex items-center justify-center font-bold text-[10px] shrink-0 ${meta.className}`}>
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
                className="w-full py-3 rounded-xl font-bold text-xs uppercase tracking-wider text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-lg shadow-emerald-600/30 transition-all cursor-pointer flex items-center justify-center gap-2"
                onClick={onSubmit}>
                <FaSave className="w-3.5 h-3.5" />
                <span>Submit Assessment</span>
            </button>
        </div>
    );
}

// ── ASSESSMENT REPORT VIEW ────────────────────────────────────────────────────
function ReportView({ report, meta, onBack, history, onRetake }) {
    const [openId, setOpenId] = useState(null);
    const trend = scoreTrend(history);

    const scoreColor = report.overall >= 80 ? 'text-emerald-400' : report.overall >= 60 ? 'text-indigo-400' : 'text-amber-400';
    const scoreBadge = report.overall >= 80
        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
        : report.overall >= 60
            ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
            : 'bg-amber-500/20 text-amber-300 border-amber-500/30';

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-8 font-sans">
            <div className="max-w-5xl mx-auto space-y-6">

                {/* ── Top Header Navigation ── */}
                <div className="flex items-center justify-between">
                    <button
                        type="button"
                        onClick={onBack}
                        className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 transition-all flex items-center gap-2 cursor-pointer shadow-sm">
                        <FaArrowLeft className="w-3 h-3" />
                        <span>Back</span>
                    </button>
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={onRetake}
                            className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-all flex items-center gap-2 cursor-pointer shadow-md shadow-indigo-600/30">
                            <FaRedo className="w-3 h-3" />
                            <span>Retake Interview</span>
                        </button>
                    </div>
                </div>

                {/* ── Celebratory Analytics Banner ── */}
                <header className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-800 shadow-2xl relative overflow-hidden">
                    <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <span className={`px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider border mb-2 inline-block ${scoreBadge}`}>
                                {report.readiness}
                            </span>
                            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">Assessment report</h1>
                            <p className="text-xs sm:text-sm text-slate-300 mt-1">
                                {meta.role} · <span className="capitalize">{meta.interviewType}</span> Track · <span className="capitalize">{meta.mode}</span> Mode
                            </p>
                        </div>
                        <div className="text-left sm:text-right">
                            <span className={`text-4xl sm:text-5xl font-black ${scoreColor}`}>
                                {report.overall}%
                            </span>
                            <p className="text-xs text-slate-400 font-medium">Final Percentage</p>
                        </div>
                    </div>
                </header>

                {/* ── 4 Primary Metric Cards ── */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 text-center shadow-lg">
                        <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">Overall</p>
                        <p className={`text-2xl font-black ${scoreColor}`}>{report.overall}%</p>
                    </div>
                    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 text-center shadow-lg">
                        <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">Readiness</p>
                        <p className="text-sm sm:text-base font-bold text-white truncate">{report.readiness}</p>
                    </div>
                    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 text-center shadow-lg">
                        <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">Completion</p>
                        <p className="text-2xl font-black text-indigo-400">{report.completionRate}%</p>
                    </div>
                    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 text-center shadow-lg">
                        <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">Time Used</p>
                        <p className="text-2xl font-black text-emerald-400">{formatClock(report.timeUsed)}</p>
                    </div>
                </div>

                {/* ── Category Scores ── */}
                <section className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-4">
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                        <FaBrain className="w-4 h-4 text-indigo-400" />
                        <span>Category Mastery Breakdown</span>
                    </h2>
                    <div className="space-y-3">
                        {Object.entries(report.categoryScores || {}).map(([name, score]) => (
                            <div key={name} className="space-y-1">
                                <div className="flex justify-between text-xs font-semibold">
                                    <span className="text-slate-300">{name}</span>
                                    <span className={score >= 80 ? 'text-emerald-400' : score >= 60 ? 'text-indigo-400' : 'text-amber-400'}>
                                        {score}%
                                    </span>
                                </div>
                                <div className="h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                                    <div
                                        className={`h-full rounded-full transition-all duration-500 ${
                                            score >= 80 ? 'bg-gradient-to-r from-emerald-500 to-teal-500' : score >= 60 ? 'bg-gradient-to-r from-indigo-500 to-purple-500' : 'bg-gradient-to-r from-amber-500 to-orange-500'
                                        }`}
                                        style={{ width: `${score}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* ── Strengths & Weaknesses ── */}
                <div className="grid sm:grid-cols-2 gap-4">
                    {/* Strengths */}
                    <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-3">
                        <h2 className="text-sm font-bold text-white flex items-center gap-2">
                            <FaCheckCircle className="w-4 h-4 text-emerald-400" />
                            <span>Demonstrated Strengths</span>
                        </h2>
                        {report.strengths?.length ? (
                            <ul className="space-y-2 text-xs text-slate-300">
                                {report.strengths.map(item => (
                                    <li key={item} className="flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                                        <span>{item}</span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-xs text-slate-400">Complete more questions correctly to unlock strengths.</p>
                        )}
                    </div>

                    {/* Weaknesses */}
                    <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-3">
                        <h2 className="text-sm font-bold text-white flex items-center gap-2">
                            <FaLightbulb className="w-4 h-4 text-amber-400" />
                            <span>Focus &amp; Improvement Areas</span>
                        </h2>
                        {report.weaknesses?.length ? (
                            <ul className="space-y-2 text-xs text-slate-300">
                                {report.weaknesses.map((item, index) => (
                                    <li key={index} className="flex items-start gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1 shrink-0"></span>
                                        <span><strong>{item.area}:</strong> {item.detail}</span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-xs text-slate-400">No major weakness areas identified! Great work.</p>
                        )}
                    </div>
                </div>

                {/* ── JD Alignment ── */}
                {!!report.missingSkills?.length && (
                    <section className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-3">
                        <h2 className="text-sm font-bold text-white flex items-center gap-2">
                            <FaBullseye className="w-4 h-4 text-indigo-400" />
                            <span>Job Description (JD) Alignment Matrix</span>
                        </h2>
                        <div className="grid sm:grid-cols-2 gap-2.5">
                            {report.missingSkills.map(item => (
                                <div key={item.requirement} className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs">
                                    <p className="font-bold text-indigo-300">{item.requirement}</p>
                                    <p className="text-slate-400 mt-1">{item.gap}</p>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* ── Detailed Question Breakdown ── */}
                <section className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-4">
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                        <FaAward className="w-4 h-4 text-amber-400" />
                        <span>Question-Level STAR Analysis</span>
                    </h2>
                    <div className="space-y-2.5">
                        {report.questions.map(row => (
                            <details
                                key={row.id}
                                open={openId === row.id}
                                onToggle={event => setOpenId(event.target.open ? row.id : null)}
                                className="group rounded-2xl border border-slate-800 bg-slate-950/50 overflow-hidden transition-all">
                                <summary className="cursor-pointer p-4 list-none flex items-center justify-between gap-3 hover:bg-slate-800/40 transition-colors select-none">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span className={`px-2.5 py-0.5 rounded-lg text-xs font-bold shrink-0 ${
                                            row.correct
                                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                                : row.answered
                                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                        }`}>
                                            Q{row.index}: {row.correct ? 'Correct' : row.answered ? 'Needs work' : 'Unanswered'}
                                        </span>
                                        <span className="text-xs sm:text-sm font-semibold text-slate-200 truncate">{row.question}</span>
                                    </div>
                                    <div className="text-slate-400 shrink-0">
                                        <FaChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" />
                                    </div>
                                </summary>

                                <div className="p-4 pt-2 border-t border-slate-800/80 bg-slate-950 text-xs text-slate-300 space-y-2">
                                    <p><strong className="text-slate-200">Your answer:</strong> {row.userAnswer || '—'}</p>
                                    <p><strong className="text-emerald-400">Ideal structure:</strong> {row.idealAnswer}</p>
                                    <p><strong className="text-indigo-400">Good:</strong> {row.whatWasGood}</p>
                                    <p><strong className="text-amber-400">Missing:</strong> {row.whatWasMissing}</p>
                                    <p><strong className="text-purple-400">STAR Improvement:</strong> {row.improvement}</p>
                                    {row.explanation && (
                                        <div className="mt-2 p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-400">
                                            <strong className="text-slate-300">Explanation:</strong> {row.explanation}
                                        </div>
                                    )}
                                </div>
                            </details>
                        ))}
                    </div>
                </section>

                {/* ── 7-Day Action Plan ── */}
                <section className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-3">
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                        <FaCalendarAlt className="w-4 h-4 text-indigo-400" />
                        <span>Personalized 7-Day Improvement Plan</span>
                    </h2>
                    <ul className="space-y-2.5 text-xs sm:text-sm text-slate-300">
                        {[...report.plan.immediate, ...report.plan.sevenDay].map((item, idx) => (
                            <li key={idx} className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center gap-3">
                                <span className="w-6 h-6 rounded-lg bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 font-bold text-xs flex items-center justify-center shrink-0">
                                    {idx + 1}
                                </span>
                                <span>{item}</span>
                            </li>
                        ))}
                    </ul>
                </section>

            </div>
        </div>
    );
}

export default DashboardInterviews;
