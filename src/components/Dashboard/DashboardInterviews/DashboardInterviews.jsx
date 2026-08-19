import React, { useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
    FaArrowLeft, FaArrowRight, FaCheckCircle, FaClock, FaExclamationTriangle, FaFlag,
    FaPlay, FaRedo, FaSave, FaTimes,
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
        dispatch({
            type: 'PATCH',
            patch: {
                resumeLabel: resume.item?.title || resume.item?.occupation || resume.id,
                resumeFacts: sanitizeResumeFacts(resume),
                occupation: state.occupation || resume.item?.occupation || '',
            },
        });
    };

    if (viewingHistory) {
        return <ReportView report={viewingHistory.report} meta={viewingHistory} onBack={() => setViewingHistory(null)} history={history} />;
    }

    if (state.phase === 'report' && state.report) {
        return (
            <ReportView
                report={state.report}
                meta={{ role: state.occupation, interviewType: state.interviewType, mode: state.mode, score: state.report.overall }}
                onBack={() => dispatch({ type: 'RESET' })}
                history={history}
            />
        );
    }

    if (state.phase === 'exam' && current) {
        const allowPause = modeMeta.allowPause && state.timeLimit > 0;
        return (
            <div className="min-h-[calc(100vh-2rem)] bg-[#eef2f6] text-slate-900">
                <header className="bg-[#1e3a5f] text-white px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <p className="text-xs uppercase tracking-widest text-slate-200">Computer Based Test</p>
                        <h1 className="text-lg font-semibold">{state.occupation} — {state.interviewType}</h1>
                    </div>
                    <div className="flex items-center gap-3">
                        <div role="timer" aria-live="polite" aria-label={`Time remaining ${formatClock(state.timeRemaining)}`} className={`font-mono text-xl px-3 py-1 rounded ${state.timeRemaining <= 60 ? 'bg-red-600' : 'bg-black/30'}`}>
                            <FaClock className="inline mr-2" aria-hidden="true" />{state.timeLimit ? formatClock(state.timeRemaining) : 'Untimed'}
                        </div>
                        {allowPause && (
                            <button type="button" className="px-3 py-1 bg-white/15 rounded" onClick={() => dispatch({ type: 'PAUSE', value: !state.isPaused })}>
                                {state.isPaused ? 'Resume' : 'Pause'}
                            </button>
                        )}
                        <button type="button" className="lg:hidden px-3 py-1 bg-white text-[#1e3a5f] rounded" onClick={() => setPaletteOpen(true)} aria-label="Open question palette">Palette</button>
                    </div>
                </header>
                {state.warnExpiry && <div role="alert" className="bg-amber-100 text-amber-900 px-4 py-2 text-sm">Less than one minute remaining. Answers already saved will be submitted when time expires.</div>}
                {state.isPaused && <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2 text-sm">Interview paused. The clock is stopped.</div>}

                <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-0">
                    <main className={`p-4 sm:p-6 ${state.isPaused ? 'pointer-events-none opacity-60' : ''}`}>
                        <p className="text-sm font-semibold text-slate-600 mb-2">Question {state.currentQuestion + 1} of {questions.length}</p>
                        <h2 className="text-xl font-semibold leading-snug mb-4">{current.question}</h2>
                        <div className="space-y-2" role="radiogroup" aria-label="Answer options">
                            {(current.options || []).map((option, index) => {
                                const selected = state.selectedAnswers[current.id] === index;
                                return (
                                    <label key={index} className={`flex gap-3 items-start border rounded-md p-3 cursor-pointer ${selected ? 'border-[#1e3a5f] bg-indigo-50' : 'border-slate-200 bg-white'}`}>
                                        <input type="radio" name={`q-${current.id}`} className="mt-1" checked={selected} onChange={() => dispatch({ type: 'ANSWER', questionId: current.id, answerIndex: index })} />
                                        <span><span className="font-semibold mr-2">{String.fromCharCode(65 + index)}.</span>{option}</span>
                                    </label>
                                );
                            })}
                        </div>
                        <div className="mt-6 flex flex-wrap gap-2">
                            <button type="button" className="px-3 py-2 border rounded disabled:opacity-40" disabled={state.currentQuestion === 0} onClick={() => dispatch({ type: 'NAVIGATE', index: state.currentQuestion - 1 })}><FaArrowLeft className="inline mr-1" />Previous</button>
                            <button type="button" className="px-3 py-2 border rounded" onClick={() => dispatch({ type: 'TOGGLE_MARK', questionId: current.id })}><FaFlag className="inline mr-1" />{markedSet.has(current.id) ? 'Unmark Review' : 'Mark for Review'}</button>
                            <button type="button" className="px-3 py-2 border rounded" onClick={() => dispatch({ type: 'CLEAR_ANSWER', questionId: current.id })}><FaTimes className="inline mr-1" />Clear Answer</button>
                            {state.currentQuestion < questions.length - 1 ? (
                                <button type="button" className="px-3 py-2 bg-[#1e3a5f] text-white rounded" onClick={() => dispatch({ type: 'NAVIGATE', index: state.currentQuestion + 1 })}>Save & Next<FaArrowRight className="inline ml-1" /></button>
                            ) : (
                                <button type="button" className="px-3 py-2 bg-emerald-700 text-white rounded" onClick={() => dispatch({ type: 'PATCH', patch: { confirmFinish: true } })}><FaSave className="inline mr-1" />Submit</button>
                            )}
                        </div>
                    </main>

                    <aside className="hidden lg:block border-l bg-white p-4">
                        <PalettePanel
                            questions={questions}
                            state={state}
                            markedSet={markedSet}
                            visitedSet={visitedSet}
                            onJump={index => dispatch({ type: 'NAVIGATE', index })}
                            onSubmit={() => dispatch({ type: 'PATCH', patch: { confirmFinish: true } })}
                        />
                    </aside>
                </div>

                {paletteOpen && (
                    <div className="lg:hidden fixed inset-0 z-50 bg-black/40" onClick={() => setPaletteOpen(false)}>
                        <div className="absolute right-0 top-0 h-full w-[88vw] max-w-sm bg-white p-4 overflow-y-auto" onClick={event => event.stopPropagation()}>
                            <button type="button" className="mb-3 text-sm" onClick={() => setPaletteOpen(false)}>Close palette</button>
                            <PalettePanel
                                questions={questions}
                                state={state}
                                markedSet={markedSet}
                                visitedSet={visitedSet}
                                onJump={index => { dispatch({ type: 'NAVIGATE', index }); setPaletteOpen(false); }}
                                onSubmit={() => { setPaletteOpen(false); dispatch({ type: 'PATCH', patch: { confirmFinish: true } }); }}
                            />
                        </div>
                    </div>
                )}

                {state.confirmFinish && (
                    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                        <div role="dialog" aria-modal="true" aria-labelledby="submit-title" className="bg-white max-w-md w-full rounded-lg p-5">
                            <h3 id="submit-title" className="font-semibold text-lg mb-2">Submit assessment?</h3>
                            <p className="text-sm text-slate-600 mb-4">{Object.keys(state.selectedAnswers).length}/{questions.length} answered. Unanswered items will be scored as incomplete.</p>
                            <div className="flex gap-2">
                                <button type="button" className="flex-1 border rounded py-2" onClick={() => dispatch({ type: 'PATCH', patch: { confirmFinish: false } })}>Continue</button>
                                <button type="button" className="flex-1 bg-red-700 text-white rounded py-2" onClick={finishInterview}>Submit now</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    const trend = scoreTrend(history);
    return (
        <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
            <div className="max-w-5xl mx-auto space-y-6">
                <header className="bg-white border rounded-lg p-6">
                    <h1 className="text-2xl font-semibold text-slate-900">AI Interview Coach</h1>
                    <p className="text-sm text-slate-600 mt-1">Configure a professional CBT-style assessment. Question generation still uses the existing AI interview engine.</p>
                </header>

                <section className="bg-white border rounded-lg p-6 space-y-5">
                    <fieldset>
                        <legend className="text-sm font-semibold mb-2">Mode</legend>
                        <div className="grid sm:grid-cols-3 gap-2">
                            {Object.values(INTERVIEW_MODES).map(mode => (
                                <button key={mode.id} type="button" onClick={() => applyDuration({ mode: mode.id, timerEnabled: mode.timerRequired ? true : state.timerEnabled })} className={`border rounded p-3 text-left ${state.mode === mode.id ? 'border-indigo-600 bg-indigo-50' : ''}`}>
                                    <span className="font-medium">{mode.label}</span>
                                    <span className="block text-xs text-slate-500">{mode.allowPause ? 'Pause allowed' : 'Strict timer'}</span>
                                </button>
                            ))}
                        </div>
                    </fieldset>
                    <label className="block text-sm font-medium">Target role
                        <input className="mt-1 w-full border rounded px-3 py-2" value={state.occupation} onChange={event => dispatch({ type: 'PATCH', patch: { occupation: event.target.value } })} placeholder="Software Engineer" />
                    </label>
                    <div className="grid md:grid-cols-2 gap-4">
                        <label className="text-sm font-medium">Interview type
                            <select className="mt-1 w-full border rounded px-3 py-2" value={state.interviewType} onChange={event => dispatch({ type: 'PATCH', patch: { interviewType: event.target.value } })}>
                                {INTERVIEW_TYPES.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}
                            </select>
                        </label>
                        <label className="text-sm font-medium">Experience
                            <select className="mt-1 w-full border rounded px-3 py-2" value={state.experienceLevel} onChange={event => dispatch({ type: 'PATCH', patch: { experienceLevel: event.target.value } })}>
                                {EXPERIENCE_LEVELS.map(level => <option key={level.id} value={level.id}>{level.label}</option>)}
                            </select>
                        </label>
                        <label className="text-sm font-medium">Difficulty
                            <select className="mt-1 w-full border rounded px-3 py-2" value={state.difficulty} onChange={event => dispatch({ type: 'PATCH', patch: { difficulty: event.target.value } })}>
                                {DIFFICULTIES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
                            </select>
                        </label>
                        <label className="text-sm font-medium">Questions
                            <select className="mt-1 w-full border rounded px-3 py-2" value={state.questionCount} onChange={event => dispatch({ type: 'PATCH', patch: { questionCount: Number(event.target.value) } })}>
                                {[5, 8, 10, 12, 15, 20].map(count => <option key={count} value={count}>{count}</option>)}
                            </select>
                        </label>
                    </div>
                    <fieldset>
                        <legend className="text-sm font-semibold mb-2">Duration</legend>
                        {state.mode === 'practice' && (
                            <label className="flex items-center gap-2 text-sm mb-2">
                                <input type="checkbox" checked={state.timerEnabled} onChange={event => applyDuration({ timerEnabled: event.target.checked })} /> Enable timer
                            </label>
                        )}
                        <div className="flex flex-wrap gap-2">
                            {DURATION_PRESETS.map(minutes => (
                                <button key={minutes} type="button" className={`px-3 py-1.5 border rounded text-sm ${state.durationPreset === minutes ? 'bg-[#1e3a5f] text-white' : ''}`} onClick={() => applyDuration({ durationPreset: minutes })}>{minutes} min</button>
                            ))}
                            <button type="button" className={`px-3 py-1.5 border rounded text-sm ${state.durationPreset === 'custom' ? 'bg-[#1e3a5f] text-white' : ''}`} onClick={() => applyDuration({ durationPreset: 'custom' })}>Custom</button>
                        </div>
                        {state.durationPreset === 'custom' && (
                            <label className="block text-sm mt-2">Minutes
                                <input type="number" min="5" max="180" className="ml-2 border rounded px-2 py-1 w-24" value={state.customMinutes} onChange={event => applyDuration({ customMinutes: Number(event.target.value) })} />
                            </label>
                        )}
                        <p className="text-xs text-slate-500 mt-2">Selected duration: {state.timeLimit ? formatClock(state.timeLimit) : 'Untimed practice'}</p>
                    </fieldset>
                    <label className="block text-sm font-medium">Target job description (optional)
                        <textarea className="mt-1 w-full border rounded px-3 py-2 min-h-[90px]" value={state.jobDescription} onChange={event => dispatch({ type: 'PATCH', patch: { jobDescription: event.target.value } })} placeholder="Paste a JD. Only this text is used — nothing is invented." />
                    </label>
                    <div>
                        <p className="text-sm font-medium mb-2">Resume (optional — facts only)</p>
                        <div className="flex flex-wrap gap-2">
                            {resumes.map(resume => (
                                <button key={resume.id} type="button" onClick={() => selectResume(resume)} className={`px-3 py-1.5 border rounded text-sm ${state.resumeLabel === (resume.item?.title || resume.item?.occupation || resume.id) ? 'border-indigo-600 bg-indigo-50' : ''}`}>
                                    {resume.item?.title || resume.item?.occupation || resume.id}
                                </button>
                            ))}
                            {!resumes.length && <p className="text-xs text-slate-500">No saved resumes in this account.</p>}
                        </div>
                    </div>
                    {state.loadingError && <p role="alert" className="text-sm text-red-700">{state.loadingError}</p>}
                    <button type="button" disabled={!state.occupation.trim() || state.isLoading} onClick={fetchInterviewQuestions} className="inline-flex items-center px-5 py-2.5 bg-[#1e3a5f] text-white rounded disabled:opacity-50">
                        {state.isLoading ? 'Generating questions…' : <><FaPlay className="mr-2" />Start interview</>}
                    </button>
                </section>

                <section className="bg-white border rounded-lg p-6">
                    <h2 className="font-semibold mb-3">Previous interviews</h2>
                    {!history.length && <p className="text-sm text-slate-500">No saved sessions for this account.</p>}
                    <ul className="divide-y">
                        {history.map(item => (
                            <li key={item.id} className="py-3 flex flex-wrap justify-between gap-2 text-sm">
                                <span>{new Date(item.completedAt).toLocaleString()} · {item.role} · {item.interviewType}</span>
                                <span>{item.score}% · {formatClock(item.duration || 0)}</span>
                                <button type="button" className="text-indigo-700 underline" onClick={() => setViewingHistory(item)}>Open report</button>
                            </li>
                        ))}
                    </ul>
                    {trend.length > 1 && (
                        <p className="text-xs text-slate-500 mt-3">Score trend: {trend.map(point => point.score).join(' → ')}</p>
                    )}
                </section>
            </div>
        </div>
    );
};

function PalettePanel({ questions, state, markedSet, visitedSet, onJump, onSubmit }) {
    return (
        <div>
            <h2 className="font-semibold mb-3">Question palette</h2>
            <ul className="grid grid-cols-5 gap-2 mb-4">
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
                            <button type="button" aria-label={`Question ${index + 1}, ${meta.label}`} aria-current={status === 'current' ? 'true' : undefined} className={`w-10 h-10 rounded text-xs font-bold ${meta.className}`} onClick={() => onJump(index)}>
                                {index + 1}<span className="sr-only"> {meta.label}</span>
                            </button>
                        </li>
                    );
                })}
            </ul>
            <ul className="text-xs space-y-1 mb-4">
                {Object.entries(PALETTE_META).map(([key, meta]) => (
                    <li key={key} className="flex items-center gap-2"><span className={`inline-flex w-6 h-6 items-center justify-center rounded ${meta.className}`}>{meta.letter}</span>{meta.label}</li>
                ))}
            </ul>
            <p className="text-sm mb-3">Answered {Object.keys(state.selectedAnswers).length}/{questions.length}</p>
            <button type="button" className="w-full bg-emerald-700 text-white rounded py-2" onClick={onSubmit}>Submit assessment</button>
        </div>
    );
}

function ReportView({ report, meta, onBack, history }) {
    const [openId, setOpenId] = useState(null);
    const trend = scoreTrend(history);
    return (
        <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
            <div className="max-w-5xl mx-auto space-y-5">
                <div className="flex justify-between items-center">
                    <h1 className="text-2xl font-semibold">Assessment report</h1>
                    <button type="button" className="text-sm underline" onClick={onBack}><FaRedo className="inline mr-1" />Back</button>
                </div>
                <p className="text-sm text-slate-600">{meta.role} · {meta.interviewType} · {meta.mode}</p>
                <div className="grid sm:grid-cols-4 gap-3">
                    {[
                        ['Overall', `${report.overall}%`],
                        ['Readiness', report.readiness],
                        ['Completion', `${report.completionRate}%`],
                        ['Time used', formatClock(report.timeUsed)],
                    ].map(([label, value]) => (
                        <div key={label} className="bg-white border rounded-lg p-4 text-center">
                            <p className="text-xs uppercase text-slate-500">{label}</p>
                            <p className="text-xl font-semibold">{value}</p>
                        </div>
                    ))}
                </div>
                <section className="bg-white border rounded-lg p-4">
                    <h2 className="font-semibold mb-3">Category scores</h2>
                    {Object.entries(report.categoryScores || {}).map(([name, score]) => (
                        <div key={name} className="mb-2">
                            <div className="flex justify-between text-sm"><span>{name}</span><span>{score}%</span></div>
                            <div className="h-2 bg-slate-200 rounded"><div className="h-2 bg-[#1e3a5f] rounded" style={{ width: `${score}%` }} /></div>
                        </div>
                    ))}
                </section>
                {!!report.strengths?.length && <section className="bg-white border rounded-lg p-4"><h2 className="font-semibold mb-2">Strengths</h2><ul className="list-disc pl-5 text-sm">{report.strengths.map(item => <li key={item}>{item}</li>)}</ul></section>}
                {!!report.weaknesses?.length && <section className="bg-white border rounded-lg p-4"><h2 className="font-semibold mb-2">Weaknesses</h2><ul className="space-y-2 text-sm">{report.weaknesses.map((item, index) => <li key={index}><strong>{item.area}:</strong> {item.detail}</li>)}</ul></section>}
                {!!report.missingSkills?.length && <section className="bg-white border rounded-lg p-4"><h2 className="font-semibold mb-2">JD alignment</h2>{report.missingSkills.map(item => <p key={item.requirement} className="text-sm mb-2"><strong>{item.requirement}</strong> — {item.gap}</p>)}</section>}
                <section className="bg-white border rounded-lg p-4">
                    <h2 className="font-semibold mb-3">Question analysis</h2>
                    {report.questions.map(row => (
                        <details key={row.id} open={openId === row.id} onToggle={event => setOpenId(event.target.open ? row.id : null)} className="border-b py-2">
                            <summary className="cursor-pointer text-sm font-medium">Q{row.index}: {row.correct ? 'Correct' : row.answered ? 'Needs work' : 'Unanswered'} — {row.question.slice(0, 90)}</summary>
                            <div className="mt-2 text-sm space-y-1">
                                <p><strong>Your answer:</strong> {row.userAnswer || '—'}</p>
                                <p><strong>Ideal structure:</strong> {row.idealAnswer}</p>
                                <p><strong>Good:</strong> {row.whatWasGood}</p>
                                <p><strong>Missing:</strong> {row.whatWasMissing}</p>
                                <p><strong>Improve:</strong> {row.improvement}</p>
                                {row.explanation && <p><strong>Explanation:</strong> {row.explanation}</p>}
                            </div>
                        </details>
                    ))}
                </section>
                <section className="bg-white border rounded-lg p-4">
                    <h2 className="font-semibold mb-2">Improvement plan</h2>
                    <ul className="list-disc pl-5 text-sm">{[...report.plan.immediate, ...report.plan.sevenDay].map(item => <li key={item}>{item}</li>)}</ul>
                </section>
                {trend.length > 1 && <p className="text-sm text-slate-600">Progress: {trend.map(point => `${point.score}%`).join(' → ')}</p>}
            </div>
        </div>
    );
}

export default DashboardInterviews;
