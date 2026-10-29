/**
 * Live AI interview: a text client of the server-authoritative live interview
 * API (see lib/interview-coach.ts). The server owns questions, turn order,
 * evaluations, completion and the report; this component only renders what the
 * server returns and never substitutes canned questions, feedback or scores.
 */
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Info,
  Lightbulb,
  Loader2,
  MessageSquare,
  RotateCcw,
  Send,
  Square,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Radio,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DIFFICULTY_OPTIONS,
  EXPERIENCE_LEVEL_OPTIONS,
  InterviewApiError,
  LIVE_ANSWER_MAX_CHARS,
  LIVE_ANSWER_MIN_CHARS,
  abandonLiveInterview,
  answerLiveInterview,
  completeLiveInterview,
  getLiveInterview,
  liveInterviewClosed,
  newIdempotencyKey,
  type LiveEvaluation,
  type LiveInterviewSession,
} from '@/lib/interview-coach';
import { VoiceInterviewRecorder, getVoiceCapabilities } from '@/lib/voice-interview';
import { cn } from '@/lib/utils';

const INTERVIEW_TYPE_LABELS: Record<string, string> = {
  behavioral: 'Behavioral',
  technical: 'Technical',
  mixed: 'Mixed',
  hr: 'HR screening',
  managerial: 'Managerial',
  case: 'Case study',
};

const labelFor = (options: ReadonlyArray<{ value: string; label: string }>, value: string) =>
  options.find((option) => option.value === value)?.label ?? value;

interface LiveInterviewPanelProps {
  session: LiveInterviewSession;
  onSessionChange: (session: LiveInterviewSession) => void;
  /** Called after the session was abandoned on the server, or when the candidate starts over. */
  onLeave: () => void;
}

type Action = 'answer' | 'complete' | 'abandon';
type Busy = null | Action;

const ERROR_TITLES: Record<Action, string> = {
  answer: 'Your answer was not processed',
  complete: 'The report could not be created',
  abandon: 'The interview could not be ended',
};

const CONFLICT_NOTICES: Record<Action, string> = {
  answer: 'This interview changed in another tab, so its latest state is shown. Your unsent answer was cleared.',
  complete: 'This interview changed in another tab, so its latest state is shown.',
  abandon: 'This interview changed in another tab, so its latest state is shown.',
};

const CANCEL_NOTICES: Record<Action, string> = {
  answer: 'Request cancelled. Your answer is still in the box.',
  complete: 'Request cancelled. Select Get my report when you are ready.',
  abandon: 'Request cancelled.',
};

/** The server no longer has this session (removed elsewhere, or expired). Retrying cannot help. */
const sessionGone = (failure: InterviewApiError) => failure.status === 404 || failure.status === 410;
/** Validation failures need a different answer, not a retry. */
const retryable = (failure: InterviewApiError) => failure.status !== 400 && failure.status !== 413 && !sessionGone(failure);

export function LiveInterviewPanel({ session, onSessionChange, onLeave }: LiveInterviewPanelProps) {
  const [answer, setAnswer] = useState('');
  const [answerError, setAnswerError] = useState('');
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<{ action: Action; failure: InterviewApiError } | null>(null);
  /** Screen-reader-only confirmation of successful actions; the visible UI already changes. */
  const [status, setStatus] = useState('');
  /** Visible, non-error explanation of something the candidate did not directly cause or see. */
  const [notice, setNotice] = useState('');
  const [showHints, setShowHints] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const pendingRef = useRef<{ turnId: string | null; answer: string; key: string } | null>(null);
  const completeKeyRef = useRef<string | null>(null);
  const questionRef = useRef<HTMLHeadingElement>(null);
  const reportRef = useRef<HTMLHeadingElement>(null);
  const endButtonRef = useRef<HTMLButtonElement>(null);
  const keepButtonRef = useRef<HTMLButtonElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const answerId = useId();
  const answerHelpId = useId();
  const answerErrorId = useId();
  const hintsId = useId();
  const voiceNoticeId = useId();

  // Voice Interview Mode State (DISC-038). Capabilities are re-detected when the
  // page becomes visible again, because they depend on a real browser API.
  const [capabilities, setCapabilities] = useState(() => getVoiceCapabilities());
  const [isRecording, setIsRecording] = useState(false);
  const [interim, setInterim] = useState('');
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioVolume, setAudioVolume] = useState(0);
  const [hasAudioSignal, setHasAudioSignal] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const voiceRecorderRef = useRef<VoiceInterviewRecorder | null>(null);

  // Initialize voice recorder. Everything it captures is released on unmount.
  useEffect(() => {
    const recorder = new VoiceInterviewRecorder(
      (transcript) => {
        setAnswer((prev) => (prev ? `${prev.trim()} ${transcript}`.trim() : transcript));
        setAnswerError('');
        setInterim('');
      },
      (volume) => setAudioVolume(volume),
      (message) => setVoiceNotice(message),
      {
        onInterim: (text) => setInterim(text),
        onListeningChange: (listening) => {
          setIsRecording(listening);
          setHasAudioSignal(listening && recorder.hasAudioSignal);
          if (!listening) setInterim('');
        },
      },
    );
    voiceRecorderRef.current = recorder;

    const refreshCapabilities = () => {
      if (document.visibilityState === 'visible') setCapabilities(getVoiceCapabilities());
    };
    document.addEventListener('visibilitychange', refreshCapabilities);

    return () => {
      document.removeEventListener('visibilitychange', refreshCapabilities);
      recorder.dispose();
      voiceRecorderRef.current = null;
    };
  }, []);

  const handleToggleVoice = async () => {
    const recorder = voiceRecorderRef.current;
    if (!recorder) return;
    setVoiceNotice(null);
    if (isRecording) {
      recorder.stopListening();
      setIsRecording(false);
      setInterim('');
      return;
    }
    // Playback and dictation at once would let the interviewer's voice be
    // transcribed as the candidate's answer.
    if (isPlayingAudio) {
      recorder.stopSpeaking();
      setIsPlayingAudio(false);
    }
    const started = await recorder.startListening();
    setIsRecording(started);
    setHasAudioSignal(started && recorder.hasAudioSignal);
  };

  const handleSpeakQuestion = () => {
    const recorder = voiceRecorderRef.current;
    if (!recorder) return;
    if (isPlayingAudio) {
      recorder.stopSpeaking();
      setIsPlayingAudio(false);
      return;
    }
    const textToSpeak = `${session.interviewer.message ? `${session.interviewer.message}. ` : ''}${session.interviewer.question}`;
    const started = recorder.speak(textToSpeak, () => setIsPlayingAudio(false));
    setIsPlayingAudio(started);
    if (started) setVoiceNotice(null);
  };

  const closed = liveInterviewClosed(session);
  const report = session.report;
  const { completedTurns, targetTurns } = session.progress;
  const config = session.configuration;
  const previousTurnId = useRef(session.interviewer.turnId);

  // A new question (or a reloaded session) starts with an empty answer box and
  // no capture running: a dictation session never carries over to the next
  // question (its transcript would be appended to the wrong answer).
  useEffect(() => {
    if (previousTurnId.current === session.interviewer.turnId) return;
    previousTurnId.current = session.interviewer.turnId;
    setAnswer('');
    setAnswerError('');
    if (voiceRecorderRef.current) {
      voiceRecorderRef.current.stopListening();
      voiceRecorderRef.current.stopSpeaking();
    }
    setIsRecording(false);
    setInterim('');
    setHasAudioSignal(false);
    setAudioVolume(0);
    setIsPlayingAudio(false);
    setShowHints(false);
    questionRef.current?.focus();
  }, [session.interviewer.turnId]);

  useEffect(() => {
    if (report) reportRef.current?.focus();
  }, [report]);

  // Errors and notices render above the content, but the control that caused them
  // (Send answer, Get my report) can be a full screen further down on small
  // viewports. Declared after the question-focus effect so this scroll wins.
  useEffect(() => {
    if (error) alertRef.current?.scrollIntoView({ block: 'nearest' });
  }, [error]);

  useEffect(() => {
    if (notice) noticeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [notice]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const run = async (kind: Action, work: (signal: AbortSignal) => Promise<LiveInterviewSession | void>) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(kind);
    setError(null);
    setNotice('');
    try {
      const next = await work(controller.signal);
      if (next) onSessionChange(next);
      return true;
    } catch (cause) {
      // A newer action replaced this one; its own outcome is what the candidate sees.
      if (abortRef.current !== controller) return false;
      let failure = cause instanceof InterviewApiError ? cause : new InterviewApiError(0, 'UNKNOWN_ERROR', String(cause));
      if (failure.cancelled) {
        setNotice(CANCEL_NOTICES[kind]);
        return false;
      }
      if (failure.status === 409) {
        // Another tab moved the interview on. Adopt the server's latest state:
        // most conflicts carry it; otherwise (e.g. finished elsewhere) reload it.
        let latest = failure.session;
        if (!latest) {
          try {
            latest = await getLiveInterview(session.sessionId, controller.signal);
          } catch (reloadCause) {
            if (abortRef.current !== controller) return false;
            if (reloadCause instanceof InterviewApiError) failure = reloadCause;
          }
        }
        if (latest) {
          onSessionChange(latest);
          setNotice(CONFLICT_NOTICES[kind]);
          return false;
        }
        if (failure.cancelled) {
          setNotice(CANCEL_NOTICES[kind]);
          return false;
        }
      }
      setError({ action: kind, failure });
      return false;
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setBusy(null);
      }
    }
  };

  const submitAnswer = async (event?: FormEvent) => {
    event?.preventDefault();
    const text = answer.trim();
    if (text.length < LIVE_ANSWER_MIN_CHARS) {
      setAnswerError('Write your answer before sending it.');
      return;
    }
    setAnswerError('');
    // Retrying the same answer to the same question reuses its key, so the server
    // can never record it twice even if the first attempt eventually succeeded.
    const pending = pendingRef.current;
    const key = pending && pending.turnId === session.interviewer.turnId && pending.answer === text ? pending.key : newIdempotencyKey();
    pendingRef.current = { turnId: session.interviewer.turnId, answer: text, key };
    // Numbered so consecutive confirmations differ and are each announced.
    const answerNumber = session.progress.completedTurns + 1;
    const ok = await run('answer', (signal) => answerLiveInterview(session, text, key, signal));
    if (ok) {
      pendingRef.current = null;
      setStatus(`Answer ${answerNumber} recorded.`);
    }
  };

  const buildReport = async () => {
    completeKeyRef.current ??= newIdempotencyKey();
    const key = completeKeyRef.current;
    const ok = await run('complete', (signal) => completeLiveInterview(session, key, signal));
    if (ok) {
      completeKeyRef.current = null;
      setStatus('Your interview report is ready.');
    }
  };

  const endInterview = async () => {
    const ok = await run('abandon', () =>
      abandonLiveInterview(session.sessionId).catch((cause: unknown) => {
        // Already removed (ended in another tab): the interview is over either way.
        if (cause instanceof InterviewApiError && cause.status === 404) return;
        throw cause;
      }),
    );
    setConfirmEnd(false);
    if (ok) onLeave();
  };

  const retry = () => {
    if (!error) return;
    if (error.action === 'complete') void buildReport();
    else if (error.action === 'abandon') void endInterview();
    else void submitAnswer();
  };

  return (
    <div className="p-4 lg:p-6 xl:p-8">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-ink">Live AI interview</h1>
            <p className="mt-0.5 text-sm text-ink-muted break-words">
              {config.role} · {INTERVIEW_TYPE_LABELS[config.interviewType] ?? config.interviewType} · {labelFor(EXPERIENCE_LEVEL_OPTIONS, config.experienceLevel)} · {labelFor(DIFFICULTY_OPTIONS, config.difficulty)}
            </p>
          </div>
          {report ? (
            <Button variant="outline" onClick={onLeave}>
              <RotateCcw aria-hidden="true" /> New session
            </Button>
          ) : (
            <Button ref={endButtonRef} variant="outline" onClick={() => setConfirmEnd(true)} disabled={busy === 'abandon'}>
              <Square aria-hidden="true" /> End interview
            </Button>
          )}
        </header>

        <div>
          <div className="mb-1 flex justify-between text-xs text-ink-muted">
            <span>{closed ? 'All questions answered' : `Question ${Math.min(completedTurns + 1, targetTurns)} of about ${targetTurns}`}</span>
            <span>{completedTurns} answered</span>
          </div>
          <div
            role="progressbar"
            aria-label="Interview progress"
            aria-valuemin={0}
            aria-valuemax={targetTurns}
            aria-valuenow={completedTurns}
            className="h-2 overflow-hidden rounded-full bg-neutral-100"
          >
            <div className="h-full rounded-full bg-brand-600 transition-[width]" style={{ width: `${session.progress.percent}%` }} />
          </div>
        </div>

        <p role="status" aria-live="polite" className="sr-only">{status}</p>

        {/* Always rendered so assistive technology registers the live region before it fills. */}
        <div ref={noticeRef} role="status" aria-live="polite" className={notice ? 'scroll-mt-4' : 'sr-only'}>
          {notice && (
            <p className="flex items-start gap-3 rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm text-brand-800">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 break-words">{notice}</span>
            </p>
          )}
        </div>

        {error && (
          <div ref={alertRef} role="alert" className="scroll-mt-4 rounded-xl border border-error-200 bg-error-50 p-4 text-sm text-error-800">
            <p className="flex items-start gap-2 font-semibold">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 break-words">{sessionGone(error.failure) ? 'This interview is no longer available' : ERROR_TITLES[error.action]}</span>
            </p>
            <p className="mt-1 break-words">{error.failure.message}</p>
            {(sessionGone(error.failure) || retryable(error.failure)) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {sessionGone(error.failure) ? (
                  <Button size="sm" variant="outline" onClick={onLeave}>
                    <RotateCcw aria-hidden="true" /> Start a new interview
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={retry} disabled={busy !== null}>
                    <RotateCcw aria-hidden="true" /> Try again
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {report ? (
          <LiveReportView session={session} headingRef={reportRef} />
        ) : closed ? (
          <section aria-labelledby="live-closing-heading" className="rounded-2xl border border-border bg-surface p-5">
            <h2 id="live-closing-heading" ref={questionRef} tabIndex={-1} className="text-base font-semibold text-ink outline-none">
              The interview is complete
            </h2>
            {session.interviewer.message && <p className="mt-2 text-sm text-ink-secondary break-words">{session.interviewer.message}</p>}
            {session.latestEvaluation && <EvaluationCard evaluation={session.latestEvaluation} />}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button onClick={() => void buildReport()} disabled={busy !== null}>
                {busy === 'complete' ? <Loader2 className="animate-spin" aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
                {busy === 'complete' ? 'Building your report…' : 'Get my report'}
              </Button>
              {busy === 'complete' && (
                <Button variant="ghost" onClick={() => abortRef.current?.abort()}>Cancel</Button>
              )}
            </div>
          </section>
        ) : (
          <>
            {session.latestEvaluation && session.transcript.length > 0 && <EvaluationCard evaluation={session.latestEvaluation} />}

            <section aria-labelledby="live-question-heading" className="rounded-2xl border border-border bg-surface p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-brand-700">
                  <MessageSquare className="size-3.5" aria-hidden="true" /> Interviewer
                </p>
                {capabilities.speechSynthesis && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleSpeakQuestion}
                    aria-pressed={isPlayingAudio}
                    className="h-7 gap-1.5 px-2 text-xs font-semibold text-brand-700 hover:text-brand-800"
                    title={isPlayingAudio ? 'Stop reading the question aloud' : 'Read the question aloud'}
                  >
                    {isPlayingAudio ? (
                      <>
                        <VolumeX className="size-3.5 text-rose-600 motion-safe:animate-pulse" aria-hidden="true" />
                        <span className="text-rose-600">Stop voice</span>
                      </>
                    ) : (
                      <>
                        <Volume2 className="size-3.5" aria-hidden="true" />
                        <span>Listen to question</span>
                      </>
                    )}
                  </Button>
                )}
              </div>
              {session.interviewer.message && <p className="mt-2 text-sm text-ink-secondary break-words">{session.interviewer.message}</p>}
              <h2 id="live-question-heading" ref={questionRef} tabIndex={-1} className="mt-2 text-base font-semibold leading-relaxed text-ink outline-none break-words">
                {session.interviewer.question}
              </h2>

              {(session.interviewer.tip || session.interviewer.talkingPoints.length > 0 || session.interviewer.starters.length > 0 || session.interviewer.modelAnswer) && (
                <div className="mt-3">
                  <Button variant="ghost" size="sm" aria-expanded={showHints} aria-controls={hintsId} onClick={() => setShowHints((value) => !value)}>
                    <Lightbulb aria-hidden="true" /> {showHints ? 'Hide hints' : 'Show hints'}
                    <ChevronDown className={cn('transition-transform', showHints && 'rotate-180')} aria-hidden="true" />
                  </Button>
                  <div id={hintsId} hidden={!showHints} className="mt-2 space-y-2 rounded-xl bg-canvas-soft p-3 text-sm text-ink-secondary">
                    {session.interviewer.tip && <p><span className="font-semibold text-ink">Tip: </span>{session.interviewer.tip}</p>}
                    {session.interviewer.talkingPoints.length > 0 && (
                      <ul className="list-disc space-y-1 pl-5">{session.interviewer.talkingPoints.map((point) => <li key={point}>{point}</li>)}</ul>
                    )}
                    {session.interviewer.starters.length > 0 && (
                      <p><span className="font-semibold text-ink">Ways to start: </span>{session.interviewer.starters.join(' · ')}</p>
                    )}
                    {session.interviewer.modelAnswer && (
                      <p><span className="font-semibold text-ink">Example answer: </span>{session.interviewer.modelAnswer}</p>
                    )}
                  </div>
                </div>
              )}
            </section>

            <form onSubmit={(event) => void submitAnswer(event)} className="space-y-3" noValidate>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label htmlFor={answerId} className="block text-sm font-semibold text-ink">Your answer</label>
                
                {/* Voice Input Toolbar (DISC-038) */}
                <div className="flex flex-wrap items-center gap-2">
                  {isRecording && (
                    <div className="flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700">
                      <Radio className="size-3" aria-hidden="true" />
                      <span>Listening</span>
                      {hasAudioSignal ? (
                        <>
                          <span className="sr-only">Microphone activity</span>
                          <div className="ml-1 flex h-3 items-end gap-0.5" aria-hidden="true">
                            {[0.4, 0.8, 1, 0.6, 0.3].map((factor, index) => (
                              <span
                                key={index}
                                className="w-1 rounded-full bg-rose-600 transition-[height] duration-75 motion-reduce:transition-none"
                                style={{ height: `${Math.max(3, Math.min(12, Math.round((audioVolume * factor) / 8)))}px` }}
                              />
                            ))}
                          </div>
                        </>
                      ) : (
                        <span className="ml-1 font-medium text-rose-600">level unavailable</span>
                      )}
                    </div>
                  )}
                  {capabilities.speechRecognition ? (
                    <Button
                      type="button"
                      variant={isRecording ? 'destructive' : 'outline'}
                      size="sm"
                      onClick={() => void handleToggleVoice()}
                      disabled={busy !== null}
                      aria-pressed={isRecording}
                      aria-describedby={voiceNotice ? voiceNoticeId : undefined}
                      className="h-7 gap-1.5 px-2.5 text-xs font-semibold"
                      title={isRecording ? 'Stop voice dictation' : 'Speak your answer using the microphone'}
                    >
                      {isRecording ? <MicOff className="size-3.5" aria-hidden="true" /> : <Mic className="size-3.5 text-brand-600" aria-hidden="true" />}
                      <span>{isRecording ? 'Stop mic' : 'Voice answer'}</span>
                    </Button>
                  ) : (
                    <span className="text-[11px] text-ink-muted">
                      {capabilities.speechRecognitionReason ?? 'Voice dictation is not available in this browser.'}
                    </span>
                  )}
                </div>
              </div>

              {isRecording && interim && (
                <p aria-live="off" className="text-xs italic text-ink-muted">
                  Hearing: “{interim}”
                </p>
              )}

              {voiceNotice && (
                <div id={voiceNoticeId} className="flex items-start justify-between gap-2 rounded-xl border border-warning-200 bg-warning-50 p-2.5 text-xs font-medium text-warning-800">
                  <span className="min-w-0 break-words">{voiceNotice}</span>
                  <button
                    type="button"
                    onClick={() => setVoiceNotice(null)}
                    className="shrink-0 rounded text-xs font-bold underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              <Textarea
                id={answerId}
                value={answer}
                onChange={(event) => { setAnswer(event.target.value); if (answerError) setAnswerError(''); }}
                rows={6}
                maxLength={LIVE_ANSWER_MAX_CHARS}
                disabled={busy !== null}
                aria-invalid={answerError ? true : undefined}
                aria-describedby={answerError ? `${answerHelpId} ${answerErrorId}` : answerHelpId}
                placeholder={isRecording ? 'Listening to your speech... speak your answer naturally.' : 'Answer as you would in the interview, or use Voice Answer to dictate.'}
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p id={answerHelpId} className="text-xs text-ink-muted">
                  {answer.length.toLocaleString()} / {LIVE_ANSWER_MAX_CHARS.toLocaleString()} characters. The interviewer evaluates each answer.
                </p>
                <div className="flex items-center gap-2">
                  {busy === 'answer' && (
                    <Button type="button" variant="ghost" onClick={() => abortRef.current?.abort()}>Cancel</Button>
                  )}
                  <Button type="submit" disabled={busy !== null}>
                    {busy === 'answer' ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Send aria-hidden="true" />}
                    {busy === 'answer' ? 'Evaluating your answer…' : 'Send answer'}
                  </Button>
                </div>
              </div>
              {answerError && <p id={answerErrorId} className="text-sm text-error-700">{answerError}</p>}
            </form>
          </>
        )}

        {!report && session.transcript.length > 0 && (
          <details className="rounded-xl border border-border bg-surface p-4">
            <summary className="cursor-pointer text-sm font-semibold text-ink">Previous answers ({session.transcript.length})</summary>
            <ol className="mt-3 space-y-3">
              {session.transcript.map((turn, index) => (
                <li key={turn.turnId} className="text-sm">
                  <p className="font-medium text-ink break-words">{index + 1}. {turn.question}</p>
                  <p className="mt-1 text-ink-secondary break-words">{turn.answer}</p>
                  {turn.evaluation?.score != null && <p className="mt-1 text-xs text-ink-muted">Score: {turn.evaluation.score}/100</p>}
                </li>
              ))}
            </ol>
          </details>
        )}
      </div>

      <Dialog open={confirmEnd} onOpenChange={(open) => { if (busy !== 'abandon') setConfirmEnd(open); }}>
        <DialogContent
          className="w-[calc(100%-2rem)] max-w-md rounded-2xl"
          onOpenAutoFocus={(event) => { event.preventDefault(); keepButtonRef.current?.focus(); }}
          onCloseAutoFocus={(event) => { event.preventDefault(); endButtonRef.current?.focus(); }}
        >
          <DialogHeader>
            <DialogTitle>End this interview?</DialogTitle>
            <DialogDescription>
              Your answers so far will be discarded and no report will be created.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button ref={keepButtonRef} variant="outline" onClick={() => setConfirmEnd(false)} disabled={busy === 'abandon'}>Keep interviewing</Button>
            <Button variant="destructive" onClick={() => void endInterview()} disabled={busy === 'abandon'}>
              {busy === 'abandon' && <Loader2 className="animate-spin" aria-hidden="true" />}
              End interview
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EvaluationCard({ evaluation }: { evaluation: LiveEvaluation }) {
  if (evaluation.score == null && !evaluation.observations.length && !evaluation.coachingTip) return null;
  return (
    <section aria-label="Feedback on your last answer" className="mt-3 rounded-2xl border border-success-200 bg-success-50 p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-success-800">Feedback on your last answer</h3>
        {evaluation.score != null && (
          <span className="rounded-full bg-surface px-2.5 py-0.5 text-xs font-bold text-success-800">Score {evaluation.score}/100</span>
        )}
      </div>
      {evaluation.observations.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-secondary">{evaluation.observations.map((item) => <li key={item}>{item}</li>)}</ul>
      )}
      {evaluation.coachingTip && <p className="mt-2 text-ink-secondary"><span className="font-semibold text-ink">Next time: </span>{evaluation.coachingTip}</p>}
    </section>
  );
}

function LiveReportView({ session, headingRef }: { session: LiveInterviewSession; headingRef: React.RefObject<HTMLHeadingElement | null> }) {
  const report = session.report!;
  const list = (title: string, items: string[]) => items.length > 0 && (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-secondary">{items.map((item) => <li key={item}>{item}</li>)}</ul>
    </section>
  );
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 ref={headingRef} tabIndex={-1} className="text-lg font-bold text-ink outline-none">Interview report</h2>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          {report.overallScore != null && (
            <p className="text-3xl font-bold text-brand-700">{report.overallScore}<span className="text-base font-medium text-ink-muted">/100</span></p>
          )}
          {report.readiness && <p className="text-sm font-semibold text-ink">{report.readiness}</p>}
        </div>
        <p className="mt-3 text-sm text-ink-secondary break-words">{report.summary}</p>
      </section>
      {list('Strengths', report.strengths)}
      {report.focusAreas.length > 0 && (
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h3 className="text-sm font-semibold text-ink">Focus areas</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {report.focusAreas.map((item) => (
              <li key={`${item.area}-${item.detail}`}><span className="font-medium text-ink">{item.area}</span>{item.detail && <span className="text-ink-secondary"> — {item.detail}</span>}</li>
            ))}
          </ul>
        </section>
      )}
      {list('Practice plan', report.practicePlan)}
      {list('Evidence from your answers', report.evidence)}
      {report.competencies.length > 0 && (
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h3 className="text-sm font-semibold text-ink">Competencies</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {report.competencies.map((item) => (
              <li key={item.name}><span className="font-medium text-ink">{item.name}: {item.score}/100</span><span className="block text-ink-secondary">{item.evidence}</span></li>
            ))}
          </ul>
        </section>
      )}
      <section className="rounded-2xl border border-border bg-surface p-5">
        <h3 className="text-sm font-semibold text-ink">Transcript</h3>
        <ol className="mt-3 space-y-3">
          {session.transcript.map((turn, index) => (
            <li key={turn.turnId} className="text-sm">
              <p className="font-medium text-ink break-words">{index + 1}. {turn.question}</p>
              <p className="mt-1 text-ink-secondary break-words">{turn.answer}</p>
              {turn.evaluation?.score != null && <p className="mt-1 text-xs text-ink-muted">Score: {turn.evaluation.score}/100</p>}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
