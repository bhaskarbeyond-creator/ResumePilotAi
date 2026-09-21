import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    FaArrowLeft, FaBolt, FaBrain, FaCamera, FaCheckCircle, FaCircle, FaClock,
    FaCommentDots, FaExclamationTriangle, FaMicrophone, FaMicrophoneSlash,
    FaPaperPlane, FaRedo, FaRobot, FaSpinner, FaStop, FaVolumeUp,
    FaVideo, FaVideoSlash,
} from 'react-icons/fa';
import {
    abandonLiveInterviewSession,
    completeLiveInterviewSession,
    submitLiveInterviewTurn,
} from '../../../services/liveInterviewApi';

function uniqueRequestKey() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `live_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
}

function friendlyError(error) {
    if (error?.name === 'AbortError') return 'That request was cancelled. Your answer is still here; you can send it again.';
    if (error?.code === 'SESSION_VERSION_CONFLICT' || error?.code === 'TURN_CONFLICT') return 'This interview was updated elsewhere. We loaded the latest question for you.';
    if (error?.code === 'SESSION_EXPIRED') return 'This practice session expired after inactivity. Start a new one when you are ready.';
    if (error?.status >= 500 || error?.code === 'AI_PROVIDER_UNAVAILABLE' || error?.code === 'AI_OUTPUT_INVALID') return 'The interviewer is temporarily unavailable. Your answer is kept here—please try again in a moment.';
    if (error instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(String(error?.message || ''))) return 'Network error — check your connection and try again. Your answer is still here.';
    if (error?.message) return error.message;
    return 'We could not reach the interviewer. Check your connection and try again.';
}

function stageLabel(stage) {
    return String(stage || 'conversation').replace(/_/g, ' ');
}

function AiAvatar({ busy = false, speaking = false, small = false }) {
    return (
        <div className={`${small ? 'w-10 h-10' : 'w-16 h-16'} rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/25 relative shrink-0`} aria-hidden="true">
            <FaRobot className={small ? 'w-5 h-5' : 'w-8 h-8'} />
            {(busy || speaking) && <span className="absolute -right-1 -bottom-1 w-4 h-4 rounded-full bg-emerald-400 border-2 border-white animate-pulse" />}
        </div>
    );
}

function InterviewerVideo({ session, busy, speaking }) {
    return (
        <section className="relative rounded-3xl overflow-hidden min-h-[220px] sm:min-h-[310px] bg-slate-950 border border-slate-800 shadow-xl shadow-slate-900/15" aria-label="AI interviewer panel">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(99,102,241,.45),transparent_42%),linear-gradient(135deg,#111827,#1e1b4b_52%,#312e81)]" />
            <div className="absolute inset-0 opacity-35 bg-[linear-gradient(110deg,transparent_0%,rgba(255,255,255,.10)_46%,transparent_52%)] animate-[pulse_3s_ease-in-out_infinite]" />
            <div className="relative h-full min-h-[220px] sm:min-h-[310px] flex flex-col items-center justify-center p-6 text-center text-white">
                <AiAvatar busy={busy} speaking={speaking} />
                <p className="mt-4 font-extrabold tracking-tight text-lg">ResumePilot interviewer</p>
                <p className="mt-1 text-xs sm:text-sm text-indigo-100 max-w-xs">Adaptive, evidence-grounded practice for {session.configuration?.role || 'your target role'}.</p>
                <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-black/25 border border-white/15 px-3 py-1.5 text-xs font-bold">
                    {busy ? <FaSpinner className="animate-spin" /> : speaking ? <FaVolumeUp /> : <FaCircle className="w-2 h-2 text-emerald-300" />}
                    {busy ? 'Thinking through your answer' : speaking ? 'Speaking' : 'Listening'}
                </div>
            </div>
            <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-xl bg-slate-950/60 backdrop-blur-sm border border-white/10 px-3 py-2 text-[11px] text-slate-100">
                <FaBrain className="text-indigo-300" />
                <span>{stageLabel(session.progress?.stage)}</span>
            </div>
        </section>
    );
}

function CandidateVideo({ media }) {
    const active = media.status === 'ready';
    return (
        <section className="relative rounded-3xl overflow-hidden min-h-[180px] bg-slate-900 border border-slate-700 shadow-lg" aria-label="Your camera preview">
            <video ref={media.attachVideo} muted playsInline autoPlay className={`absolute inset-0 w-full h-full object-cover ${active && media.videoEnabled ? 'opacity-100' : 'opacity-0'}`} />
            <div className={`absolute inset-0 flex flex-col items-center justify-center p-5 text-center text-slate-200 ${active && media.videoEnabled ? 'bg-gradient-to-t from-slate-950/60 via-transparent to-transparent justify-end items-start text-left' : 'bg-[radial-gradient(circle_at_50%_10%,rgba(71,85,105,.45),transparent_48%)]'}`}>
                {active && media.videoEnabled ? (
                    <p className="text-xs font-bold bg-slate-950/55 rounded-lg px-2.5 py-1.5">You · preview only</p>
                ) : (
                    <>
                        {media.status === 'requesting' ? <FaSpinner className="w-7 h-7 animate-spin text-indigo-300" /> : <FaCamera className="w-7 h-7 text-slate-400" />}
                        <p className="mt-3 font-bold text-sm">{media.status === 'requesting' ? 'Starting your camera…' : 'Camera preview is off'}</p>
                        <p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-400">Your camera and microphone stay in your browser. This practice does not record or upload media.</p>
                    </>
                )}
            </div>
            <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-lg bg-slate-950/60 px-2.5 py-1.5 text-[10px] font-bold text-white border border-white/10">
                <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-400' : 'bg-slate-400'}`} /> Preview
            </div>
        </section>
    );
}

function Transcript({ transcript, current }) {
    const visibleTurns = (Array.isArray(transcript) ? transcript : []).slice(-3);
    return (
        <section aria-label="Conversation transcript" className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
                <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2"><FaCommentDots className="text-indigo-600" /> Conversation</h2>
                <span className="text-[11px] font-semibold text-slate-500">Last {Math.max(1, visibleTurns.length + (current?.question ? 1 : 0))} prompt{visibleTurns.length + (current?.question ? 1 : 0) === 1 ? '' : 's'}</span>
            </div>
            <div className="p-4 space-y-3 max-h-[360px] overflow-y-auto">
                {visibleTurns.length === 0 && <p className="text-sm text-slate-500">The conversation will appear here as you answer.</p>}
                {visibleTurns.map(turn => (
                    <div key={turn.turnId} className="space-y-2">
                        <div className="flex gap-2.5"><AiAvatar small /><div className="rounded-2xl rounded-tl-sm bg-indigo-50 border border-indigo-100 px-3 py-2.5 text-sm text-slate-800 leading-relaxed">{turn.question}</div></div>
                        <div className="flex gap-2.5 justify-end"><div className="rounded-2xl rounded-tr-sm bg-slate-100 border border-slate-200 px-3 py-2.5 text-sm text-slate-800 leading-relaxed max-w-[88%]">{turn.answer}</div></div>
                    </div>
                ))}
                {current?.question && <div className="flex gap-2.5"><AiAvatar small /><div className="rounded-2xl rounded-tl-sm bg-indigo-600 text-white px-3 py-2.5 text-sm leading-relaxed shadow-sm">{current.question}</div></div>}
            </div>
        </section>
    );
}

export function LiveInterviewReadiness({ media }) {
    const [expanded, setExpanded] = useState(false);
    const needsAttention = ['denied', 'unavailable', 'busy', 'error'].includes(media.status);
    return (
        <div className={`rounded-2xl border p-4 ${needsAttention ? 'border-amber-200 bg-amber-50/70' : 'border-indigo-100 bg-indigo-50/55'}`}>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                <div className="min-w-0">
                    <p className="text-sm font-extrabold text-slate-900 flex items-center gap-2"><FaVideo className="text-indigo-600" /> Face-to-face readiness</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">Optional camera and mic preview. Video and audio are not recorded or sent to ResumePilot.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button type="button" onClick={() => media.request()} disabled={media.status === 'requesting'} className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold disabled:opacity-60 transition-colors cursor-pointer">
                        {media.status === 'requesting' ? 'Requesting…' : media.status === 'ready' ? 'Refresh devices' : 'Test camera & mic'}
                    </button>
                    <button type="button" onClick={() => setExpanded(value => !value)} className="px-3 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-white text-xs font-bold transition-colors cursor-pointer" aria-expanded={expanded}>Privacy</button>
                </div>
            </div>
            {media.message && <p role={needsAttention ? 'alert' : 'status'} className={`mt-3 text-xs leading-relaxed flex gap-2 ${needsAttention ? 'text-amber-900' : 'text-slate-600'}`}>{needsAttention && <FaExclamationTriangle className="shrink-0 mt-0.5" />}{media.message}</p>}
            {expanded && <p className="mt-3 pt-3 border-t border-indigo-100 text-xs leading-relaxed text-slate-600">You can continue with typing if permissions are denied, a device is unavailable, or you prefer not to enable media. Speech recognition and browser voice are optional browser features and may not be available.</p>}
        </div>
    );
}

export default function LiveInterviewSession({ session, media, onSessionChange, onCompleted, onDiscard }) {
    const [answer, setAnswer] = useState('');
    const [status, setStatus] = useState('listening');
    const [error, setError] = useState('');
    const [dictating, setDictating] = useState(false);
    const [speaking, setSpeaking] = useState(false);
    const [voiceOn, setVoiceOn] = useState(false);
    const [confirmFinish, setConfirmFinish] = useState(false);
    const [confirmDiscard, setConfirmDiscard] = useState(false);
    const recognitionRef = useRef(null);
    const sentRef = useRef(null);
    const abortRef = useRef(null);
    const promptRef = useRef(null);

    const interviewer = session?.interviewer || {};
    const configuration = session?.configuration || {};
    const canUseRecognition = useMemo(() => typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition), []);
    const completedTurns = session?.progress?.completedTurns || 0;
    const isComplete = session?.status === 'completed' || session?.progress?.interviewComplete;
    const isBusy = status === 'thinking' || status === 'finishing';

    const cancelSpeech = useCallback(() => {
        if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
        setSpeaking(false);
    }, []);

    const readAloud = useCallback(() => {
        const text = [interviewer.message, interviewer.question].filter(Boolean).join('. ');
        if (!text) return;
        if (typeof window === 'undefined' || !window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') {
            setError('Browser voice is not available here. You can continue reading or typing.');
            return;
        }
        cancelSpeech();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.98;
        utterance.onstart = () => setSpeaking(true);
        utterance.onend = () => setSpeaking(false);
        utterance.onerror = () => setSpeaking(false);
        window.speechSynthesis.speak(utterance);
    }, [cancelSpeech, interviewer.message, interviewer.question]);

    useEffect(() => {
        const promptKey = `${session?.sessionId || ''}:${interviewer.turnId || ''}`;
        if (voiceOn && interviewer.turnId && promptRef.current !== promptKey) {
            promptRef.current = promptKey;
            readAloud();
        }
    }, [interviewer.turnId, readAloud, session?.sessionId, voiceOn]);

    useEffect(() => () => {
        recognitionRef.current?.abort?.();
        abortRef.current?.abort?.();
        if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
    }, []);

    const startDictation = useCallback(() => {
        cancelSpeech();
        if (!canUseRecognition) {
            setError('Speech-to-text is not supported by this browser. You can type your response instead.');
            return;
        }
        setError('');
        const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new Recognition();
        recognition.lang = navigator.language || 'en-US';
        recognition.continuous = false;
        recognition.interimResults = true;
        const answerBeforeDictation = answer.trim();
        recognition.onstart = () => setDictating(true);
        recognition.onresult = (event) => {
            let transcript = '';
            // Browser engines often re-send previous interim words. Rebuild the
            // current utterance instead of appending each event and duplicating it.
            for (let index = 0; index < event.results.length; index += 1) {
                transcript += event.results[index][0]?.transcript || '';
            }
            setAnswer(`${answerBeforeDictation}${answerBeforeDictation && transcript.trim() ? ' ' : ''}${transcript}`.replace(/\s+/g, ' '));
        };
        recognition.onerror = (event) => {
            if (event.error !== 'aborted' && event.error !== 'no-speech') setError('Speech-to-text stopped unexpectedly. Your typed response is still available.');
        };
        recognition.onend = () => setDictating(false);
        recognitionRef.current = recognition;
        try { recognition.start(); } catch (_) { setDictating(false); }
    }, [answer, canUseRecognition, cancelSpeech]);

    const stopDictation = useCallback(() => {
        recognitionRef.current?.stop?.();
    }, []);

    const applyConflict = useCallback((failure) => {
        if (failure?.session) {
            onSessionChange(failure.session);
            setAnswer('');
            sentRef.current = null;
        }
    }, [onSessionChange]);

    const sendAnswer = useCallback(async () => {
        const cleaned = answer.trim();
        if (cleaned.length < 2 || isBusy || isComplete) return;
        setError('');
        setStatus('thinking');
        stopDictation();
        cancelSpeech();
        const sameAnswer = sentRef.current?.turnId === interviewer.turnId && sentRef.current?.answer === cleaned;
        const requestKey = sameAnswer ? sentRef.current.key : uniqueRequestKey();
        sentRef.current = { turnId: interviewer.turnId, answer: cleaned, key: requestKey };
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            const next = await submitLiveInterviewTurn(session.sessionId, {
                turnId: interviewer.turnId,
                expectedRevision: session.revision,
                answer: cleaned,
                idempotencyKey: requestKey,
            }, { signal: controller.signal });
            onSessionChange(next);
            setAnswer('');
            sentRef.current = null;
            setStatus(next.progress?.interviewComplete ? 'ready-to-finish' : 'listening');
        } catch (failure) {
            applyConflict(failure);
            setError(friendlyError(failure));
            setStatus('listening');
        } finally {
            if (abortRef.current === controller) abortRef.current = null;
        }
    }, [answer, applyConflict, cancelSpeech, interviewer.turnId, isBusy, isComplete, onSessionChange, session.revision, session.sessionId, stopDictation]);

    const finish = useCallback(async () => {
        if (isBusy || !session?.sessionId) return;
        setError('');
        setStatus('finishing');
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            const completed = await completeLiveInterviewSession(session.sessionId, { expectedRevision: session.revision }, { signal: controller.signal });
            onSessionChange(completed);
            onCompleted(completed);
        } catch (failure) {
            applyConflict(failure);
            setError(friendlyError(failure));
            setStatus('ready-to-finish');
        } finally {
            if (abortRef.current === controller) abortRef.current = null;
        }
    }, [applyConflict, isBusy, onCompleted, onSessionChange, session?.sessionId, session?.revision]);

    const discard = useCallback(async () => {
        if (!session?.sessionId) return;
        abortRef.current?.abort();
        recognitionRef.current?.abort?.();
        cancelSpeech();
        setStatus('finishing');
        try {
            await abandonLiveInterviewSession(session.sessionId);
            media.stop();
            onDiscard();
        } catch (failure) {
            // A 404 means the server already removed it; other failures must
            // retain the session pointer so a temporary outage cannot discard
            // a recoverable interview locally while it remains server-side.
            if (failure?.status === 404) {
                media.stop();
                onDiscard();
                return;
            }
            setConfirmDiscard(false);
            setError(friendlyError(failure));
            setStatus('listening');
        }
    }, [cancelSpeech, media, onDiscard, session?.sessionId]);

    if (!session) return null;
    return (
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-5 sm:py-8 pb-16">
            <div className="sr-only" role="status" aria-live="polite">{isBusy ? (status === 'finishing' ? 'Creating your interview feedback.' : 'The interviewer is thinking about your response.') : speaking ? 'The interviewer is speaking.' : dictating ? 'Speech-to-text is listening.' : isComplete ? 'The conversation is ready to finish.' : 'The interviewer is listening.'}</div>
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-6">
                <div>
                    <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] font-extrabold text-indigo-600"><FaBolt /> Live AI practice</div>
                    <h1 className="mt-1 text-2xl sm:text-3xl font-black tracking-tight text-slate-950">Face-to-face interview</h1>
                    <p className="mt-1 text-sm text-slate-600">{configuration.role || 'Target role'} · {configuration.interviewType || 'mixed'} · adaptive conversation</p>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                    <span className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"><FaClock className="text-indigo-500" /> {completedTurns} of about {session.progress?.targetTurns || '—'} turns</span>
                    <button type="button" onClick={() => setConfirmDiscard(true)} className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 hover:text-rose-700 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 transition-colors cursor-pointer">Leave interview</button>
                </div>
            </div>

            <div className="h-2 rounded-full bg-slate-200 overflow-hidden mb-6" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={session.progress?.percent || 0} aria-label="Interview progress">
                <div className="h-full bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 transition-all duration-500" style={{ width: `${session.progress?.percent || 0}%` }} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.18fr)_minmax(300px,.82fr)] gap-5 xl:gap-7">
                <div className="space-y-5">
                    <InterviewerVideo session={session} busy={isBusy} speaking={speaking} />
                    <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-7 shadow-sm">
                        <div className="flex gap-3 sm:gap-4 items-start">
                            <AiAvatar busy={isBusy} speaking={speaking} />
                            <div className="min-w-0 flex-1">
                                <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">{isBusy ? 'Processing your response' : isComplete ? 'Conversation complete' : 'Your interviewer'}</p>
                                {interviewer.message && <p className="mt-1.5 text-sm sm:text-base leading-relaxed text-slate-700">{interviewer.message}</p>}
                                {interviewer.question && <h2 className="mt-3 text-lg sm:text-xl font-bold leading-snug text-slate-950" tabIndex="-1">{interviewer.question}</h2>}
                            </div>
                        </div>
                        <div className="mt-5 flex flex-wrap gap-2">
                            <button type="button" onClick={speaking ? cancelSpeech : readAloud} disabled={!interviewer.question && !interviewer.message} className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-800 hover:bg-indigo-100 disabled:opacity-50 transition-colors cursor-pointer">
                                {speaking ? <FaStop /> : <FaVolumeUp />} {speaking ? 'Stop voice' : 'Read aloud'}
                            </button>
                            <button type="button" onClick={() => { setVoiceOn(value => !value); if (voiceOn) cancelSpeech(); }} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition-colors cursor-pointer ${voiceOn ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`} aria-pressed={voiceOn}>
                                <FaVolumeUp /> Auto voice {voiceOn ? 'on' : 'off'}
                            </button>
                            {session.latestEvaluation?.coachingTip && <span className="inline-flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900"><FaBolt /> Private coaching note ready after your response</span>}
                        </div>
                    </section>

                    {!isComplete ? <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-7 shadow-sm">
                        <div className="flex items-center justify-between gap-3 mb-3">
                            <label htmlFor="live-interview-answer" className="text-base font-extrabold text-slate-950">Your response</label>
                            <span className="text-[11px] text-slate-500">You may answer or ask a brief interview-process question.</span>
                        </div>
                        <textarea id="live-interview-answer" value={answer} onFocus={cancelSpeech} onChange={event => { cancelSpeech(); setAnswer(event.target.value); setError(''); }} disabled={isBusy} maxLength={6000} rows={7} placeholder="Speak naturally—share the situation, decisions, evidence, and outcome. You can type if voice input is unavailable." className="w-full resize-y rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm leading-relaxed text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-600 disabled:bg-slate-50 disabled:text-slate-500" />
                        <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex flex-wrap gap-2 items-center">
                                {canUseRecognition && <button type="button" onClick={dictating ? stopDictation : startDictation} disabled={isBusy} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 ${dictating ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}><FaMicrophone /> {dictating ? 'Stop listening' : 'Dictate answer'}</button>}
                                {!canUseRecognition && <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500"><FaMicrophoneSlash /> Speech-to-text is unavailable; typing works normally.</span>}
                                <span className="text-[11px] text-slate-400">{answer.length.toLocaleString()}/6,000</span>
                            </div>
                            <button type="button" onClick={sendAnswer} disabled={isBusy || answer.trim().length < 2} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-3 text-sm font-extrabold text-white shadow-md shadow-indigo-600/25 hover:from-indigo-700 hover:to-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer">
                                {isBusy ? <FaSpinner className="animate-spin" /> : <FaPaperPlane />} {isBusy ? 'Interviewer is thinking…' : 'Send response'}
                            </button>
                        </div>
                    </section> : <section className="rounded-3xl border border-emerald-200 bg-emerald-50/60 p-5 sm:p-7">
                        <div className="flex items-start gap-3"><FaCheckCircle className="w-6 h-6 text-emerald-600 mt-0.5" /><div><h2 className="font-extrabold text-emerald-950">The conversation is ready to wrap up.</h2><p className="mt-1 text-sm leading-relaxed text-emerald-900">Generate your evidence-grounded practice report when you are ready. You can also finish early at any time; the feedback only uses what you actually shared.</p></div></div>
                        <button type="button" onClick={() => setConfirmFinish(true)} disabled={isBusy} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-5 py-3 text-sm font-extrabold text-white disabled:opacity-50 transition-colors cursor-pointer"><FaCheckCircle /> Generate feedback</button>
                    </section>}

                    {!isComplete && <div className="flex justify-between gap-3"><button type="button" onClick={() => setConfirmFinish(true)} disabled={isBusy || completedTurns === 0} className="text-xs font-bold text-slate-600 hover:text-indigo-700 disabled:opacity-50 transition-colors cursor-pointer">Finish early and get feedback</button><p className="text-[11px] text-slate-500">Your session survives a refresh. Do not close this tab while a response is processing.</p></div>}
                    {error && <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 flex items-start gap-2"><FaExclamationTriangle className="mt-0.5 shrink-0" /> <span>{error}</span>{status === 'listening' && <button type="button" onClick={() => setError('')} className="ml-auto text-xs font-bold underline cursor-pointer">Dismiss</button>}</div>}
                </div>

                <aside className="space-y-5 lg:sticky lg:top-5 self-start">
                    <CandidateVideo media={media} />
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <p className="text-sm font-extrabold text-slate-900">Media controls</p>
                        <p className="mt-1 text-xs text-slate-500">Preview is local only. You can interview by text at any time.</p>
                        <div className="mt-3 grid grid-cols-3 gap-2">
                            <button type="button" onClick={() => media.request()} disabled={media.status === 'requesting'} className="rounded-xl border border-slate-300 px-2 py-2.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer">{media.status === 'ready' ? 'Refresh' : 'Start'}</button>
                            <button type="button" onClick={media.toggleVideo} disabled={!media.hasStream} aria-pressed={media.videoEnabled} className="rounded-xl border border-slate-300 px-2 py-2.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer" title={media.videoEnabled ? 'Turn camera off' : 'Turn camera on'}>{media.videoEnabled ? <FaVideo className="mx-auto" /> : <FaVideoSlash className="mx-auto" />}</button>
                            <button type="button" onClick={media.toggleAudio} disabled={!media.hasStream} aria-pressed={media.audioEnabled} className="rounded-xl border border-slate-300 px-2 py-2.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer" title={media.audioEnabled ? 'Mute microphone' : 'Unmute microphone'}>{media.audioEnabled ? <FaMicrophone className="mx-auto" /> : <FaMicrophoneSlash className="mx-auto" />}</button>
                        </div>
                        {media.message && <p className="mt-3 text-[11px] leading-relaxed text-slate-500">{media.message}</p>}
                    </div>
                    <Transcript transcript={session.transcript} current={isComplete ? null : interviewer} />
                </aside>
            </div>

            {confirmFinish && <ConfirmDialog title="Finish this interview?" description="Your feedback will use only the answers you have shared so far. This cannot add another interview question." confirmLabel={isBusy ? 'Creating feedback…' : 'Finish & generate feedback'} busy={isBusy} onCancel={() => setConfirmFinish(false)} onConfirm={finish} />}
            {confirmDiscard && <ConfirmDialog danger title="Leave this interview?" description="This active session will be discarded. Your camera and microphone preview will be stopped." confirmLabel="Leave & discard" onCancel={() => setConfirmDiscard(false)} onConfirm={discard} />}
        </main>
    );
}

function ConfirmDialog({ title, description, confirmLabel, onCancel, onConfirm, busy = false, danger = false }) {
    const dialogRef = useRef(null);
    useEffect(() => {
        const node = dialogRef.current;
        if (!node) return undefined;
        const focusable = () => Array.from(node.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'));
        const first = focusable()[0];
        first?.focus?.();
        const onKeyDown = (event) => {
            if (event.key === 'Escape' && !busy) {
                event.preventDefault();
                onCancel();
                return;
            }
            if (event.key !== 'Tab') return;
            const items = focusable();
            if (!items.length) return;
            const firstItem = items[0];
            const lastItem = items[items.length - 1];
            if (event.shiftKey && document.activeElement === firstItem) {
                event.preventDefault();
                lastItem.focus();
            } else if (!event.shiftKey && document.activeElement === lastItem) {
                event.preventDefault();
                firstItem.focus();
            }
        };
        node.addEventListener('keydown', onKeyDown);
        return () => node.removeEventListener('keydown', onKeyDown);
    }, [busy, onCancel]);
    return (
        <div className="fixed inset-0 z-[90] bg-slate-950/55 backdrop-blur-sm flex items-center justify-center p-4" role="presentation">
            <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="live-confirm-title" aria-describedby="live-confirm-description" className="w-full max-w-md rounded-3xl bg-white border border-slate-200 p-6 shadow-2xl">
                <h2 id="live-confirm-title" className="text-xl font-black text-slate-950">{title}</h2>
                <p id="live-confirm-description" className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
                <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                    <button type="button" onClick={onCancel} disabled={busy} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer">Keep interviewing</button>
                    <button type="button" onClick={onConfirm} disabled={busy} className={`rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50 cursor-pointer ${danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}>{busy && <FaSpinner className="inline mr-2 animate-spin" />}{confirmLabel}</button>
                </div>
            </section>
        </div>
    );
}

export function LiveInterviewReport({ session, onBack }) {
    const report = session?.report || {};
    const configuration = session?.configuration || {};
    return <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 pb-16"><button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-indigo-700 cursor-pointer"><FaArrowLeft /> Back to interview practice</button><section className="mt-5 rounded-3xl overflow-hidden bg-gradient-to-br from-indigo-700 via-violet-700 to-fuchsia-700 text-white p-6 sm:p-9 shadow-xl"><p className="text-xs uppercase tracking-[.18em] font-bold text-indigo-100">Live interview complete</p><div className="mt-3 flex flex-col sm:flex-row sm:items-end justify-between gap-5"><div><h1 className="text-3xl sm:text-4xl font-black tracking-tight">Practice feedback</h1><p className="mt-2 max-w-2xl text-sm sm:text-base leading-relaxed text-indigo-100">{report.summary || 'Your report is ready.'}</p></div><div className="rounded-2xl bg-white/15 border border-white/25 px-5 py-4 min-w-[124px]"><p className="text-[11px] uppercase tracking-wider text-indigo-100">Readiness</p><p className="mt-1 text-xl font-black">{report.readiness || 'Practice complete'}</p>{Number.isFinite(Number(report.overallScore)) && <p className="mt-1 text-sm text-indigo-100">{Math.round(Number(report.overallScore))}/100</p>}</div></div><p className="mt-5 text-xs text-indigo-100">{configuration.role || 'Target role'} · {configuration.interviewType || 'mixed'} · {session.transcript?.length || 0} answered turn{session.transcript?.length === 1 ? '' : 's'}</p></section><div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-5"><ReportList title="What came through clearly" icon={<FaCheckCircle className="text-emerald-600" />} items={report.strengths} empty="Complete more of the conversation to surface evidence-grounded strengths." /><ReportList title="Where to focus next" icon={<FaBolt className="text-amber-600" />} items={(report.focusAreas || []).map(item => typeof item === 'string' ? item : `${item.area || 'Focus area'}${item.detail ? ` — ${item.detail}` : ''}`)} empty="No additional focus areas were returned." /><ReportList title="Practice plan" icon={<FaRedo className="text-indigo-600" />} items={report.practicePlan} empty="No practice plan was returned." /><ReportList title="Evidence used" icon={<FaCommentDots className="text-violet-600" />} items={report.evidence} empty="Feedback is based only on the conversation above." /></div></main>;
}

function ReportList({ title, icon, items, empty }) {
    const values = Array.isArray(items) ? items.filter(Boolean) : [];
    return <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm"><h2 className="flex items-center gap-2 font-extrabold text-slate-950">{icon} {title}</h2>{values.length ? <ul className="mt-4 space-y-3">{values.map((item, index) => <li key={`${index}-${item}`} className="flex gap-2.5 text-sm leading-relaxed text-slate-700"><span className="mt-2 w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />{item}</li>)}</ul> : <p className="mt-4 text-sm leading-relaxed text-slate-500">{empty}</p>}</section>;
}
