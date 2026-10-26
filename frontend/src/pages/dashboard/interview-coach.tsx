/**
 * AI Interview Coach — candidate dashboard (/dashboard/interviews/*).
 *
 * Practice  Untimed practice with the built-in question set, free navigation and
 *           optional AI answer guidance for the current question
 *           (POST /api/live-interview/guide).
 * Mock      The same question set under a countdown with pause/resume; no hints.
 * CBT       Timed multiple-choice exam. With a target role the questions are
 *           AI-calibrated (POST /api/generate-interview); without one — or when
 *           the AI service is unavailable and the candidate chooses it — the
 *           labelled built-in set is used. Scored against each question's key.
 * Live      Server-authoritative live AI interview (LiveInterviewPanel).
 *
 * Free-form practice answers have no evaluating backend, so practice and mock
 * summaries are factual (answered, time) and never show invented feedback.
 */
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Briefcase,
  CheckCircle2,
  ChevronLeft,
  ClipboardCheck,
  Clock,
  Code2,
  Flag,
  Info,
  Keyboard,
  Lightbulb,
  Loader2,
  MessagesSquare,
  NotebookPen,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Target,
  Timer,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AiProcessingModal } from '@/components/ui/ai-processing-modal';
import { LiveInterviewPanel } from '@/components/interview/live-interview-panel';
import { useAuth } from '@/providers/auth-provider';
import {
  AI_ASSESSMENT_COUNTS,
  DIFFICULTY_OPTIONS,
  EXPERIENCE_LEVEL_OPTIONS,
  InterviewApiError,
  forgetLiveSession,
  generateAssessment,
  getLiveInterview,
  liveTargetTurns,
  recallLiveSession,
  rememberLiveSession,
  requestAnswerGuide,
  startLiveInterview,
  type AnswerGuide,
  type AssessmentQuestion,
  type ExperienceLevel,
  type InterviewDifficulty,
  type InterviewTopicId,
  type LiveInterviewSession,
} from '@/lib/interview-coach';
import { cn } from '@/lib/utils';

/* ─── Types ─── */

type InterviewMode = 'practice' | 'mock' | 'cbt' | 'live';
type Phase = 'mode-select' | 'configure' | 'active' | 'completed';

interface InterviewTopic {
  id: InterviewTopicId;
  label: string;
  description: string;
  icon: LucideIcon;
}

interface PracticeState {
  mode: 'practice' | 'mock';
  topicId: InterviewTopicId;
  role: string;
  questions: string[];
  answers: string[];
  index: number;
  startedAt: number;
  durationSeconds: number | null;
  timeUsed: number | null;
  timedOut: boolean;
}

interface ExamQuestion extends AssessmentQuestion {
  selectedIndex: number | null;
  flagged: boolean;
}

interface ExamState {
  topicId: InterviewTopicId;
  role: string;
  source: 'ai' | 'built-in';
  title: string;
  questions: ExamQuestion[];
  index: number;
  durationSeconds: number;
  timeUsed: number | null;
  timedOut: boolean;
}

type GuideEntry = { status: 'loading' } | { status: 'ready'; guide: AnswerGuide } | { status: 'error'; message: string };

/* ─── Static configuration ─── */

const INTERVIEW_TOPICS: InterviewTopic[] = [
  { id: 'behavioral', label: 'Behavioral', description: 'STAR method, leadership, teamwork', icon: Users },
  { id: 'technical', label: 'Technical', description: 'System design, problem-solving', icon: Code2 },
  { id: 'situational', label: 'Situational', description: 'Hypothetical workplace scenarios', icon: Lightbulb },
  { id: 'case-study', label: 'Case Study', description: 'Business analysis and strategy', icon: BookOpen },
  { id: 'competency', label: 'Competency', description: 'Skills and experience assessment', icon: Target },
  { id: 'general', label: 'General', description: 'Common interview questions', icon: Briefcase },
];

/** Built-in open-ended practice questions (no AI involved). */
const PRACTICE_BANK: Record<InterviewTopicId, string[]> = {
  behavioral: [
    'Tell me about a time when you had to work with a difficult team member. How did you handle the situation?',
    'Describe a situation where you took the lead on a challenging project. What was the outcome?',
    'Give me an example of when you had to manage conflicting priorities with tight deadlines.',
    'Tell me about a time you received constructive criticism. How did you respond?',
    'Describe a situation where you had to adapt to a significant change at work.',
    'Tell me about a time you went above and beyond your job responsibilities.',
    'Give an example of a time you had to persuade others to see things your way.',
    'Describe a situation where you failed. What did you learn from it?',
    'Tell me about a time you had to make a difficult decision with limited information.',
    'Give me an example of how you handled a disagreement with a coworker.',
  ],
  technical: [
    'How would you design a scalable URL shortening service? Walk through the architecture.',
    'Explain the trade-offs between SQL and NoSQL databases for a high-traffic e-commerce platform.',
    'How would you design a real-time notification system for millions of users?',
    'What strategies would you use to optimize a slow-performing database query?',
    'Describe how you would implement a rate limiter for an API.',
    'How would you design a distributed cache system?',
    'Explain the concept of microservices vs monolith architecture.',
    'How would you handle data consistency in a distributed system?',
    'Design a file storage system like Google Drive or Dropbox.',
    'How would you implement search functionality for a large dataset?',
  ],
  situational: [
    'Imagine you discover a critical bug in production right before a major release. What steps would you take?',
    'Your team is falling behind on a sprint. How would you address this situation?',
    'A senior stakeholder asks you to cut corners on testing. How do you respond?',
    'You receive two equally urgent requests from different managers. How do you prioritize?',
    'You notice a teammate is struggling but hasn\'t asked for help. What do you do?',
    'A client requests a feature that conflicts with your technical architecture. How do you handle it?',
    'Your proposed solution is rejected in a code review. How do you respond?',
    'You discover that a colleague has been taking credit for your work. What do you do?',
    'A new regulation requires significant changes to your existing system. How do you plan the transition?',
    'You are asked to mentor a junior developer who is resistant to feedback. How do you approach this?',
  ],
  'case-study': [
    'A mid-size e-commerce company is experiencing declining customer retention. How would you diagnose and solve this?',
    'A startup needs to scale from 1,000 to 1 million users. What technical and organizational changes would you recommend?',
    'An enterprise client wants to migrate from on-premise to cloud. Design the migration strategy.',
    'A SaaS company has a 40% churn rate. Analyze potential causes and propose solutions.',
    'A retail chain wants to implement an AI-powered recommendation engine. Walk through the approach.',
  ],
  competency: [
    'Describe a project where you had to learn a new technology quickly. How did you approach the learning?',
    'Give an example of how you\'ve demonstrated attention to detail in your work.',
    'Tell me about a time you improved a process or workflow at your company.',
    'How do you stay current with industry trends and technologies?',
    'Describe your approach to code reviews and maintaining code quality.',
  ],
  general: [
    'Walk me through your background and why you\'re interested in this role.',
    'What do you consider your greatest professional achievement?',
    'Where do you see yourself in five years?',
    'What motivates you in your work?',
    'How do you handle stress and pressure?',
    'What are your strengths and areas for improvement?',
    'Why should we hire you for this position?',
    'Describe your ideal work environment.',
    'What questions do you have for us?',
    'How do you approach learning new skills?',
  ],
};

/** Built-in multiple-choice items with their answer keys (no AI involved). */
const CBT_BANK: Record<InterviewTopicId, Array<{ q: string; o: string[]; c: number; e: string }>> = {
  behavioral: [
    { q: 'Which interview technique structures responses around Situation, Task, Action, and Result?', o: ['SWOT Analysis', 'STAR Method', 'Agile Methodology', 'Design Thinking'], c: 1, e: 'STAR Method helps structure behavioral interview responses effectively.' },
    { q: 'When discussing a conflict with a team member, which approach is most professional?', o: ['Blame the other person', 'Focus on the outcome and lessons learned', 'Avoid the topic entirely', 'Minimize the conflict\'s importance'], c: 1, e: 'Focusing on outcomes and lessons learned demonstrates maturity and growth mindset.' },
    { q: 'What is the best way to demonstrate leadership in an interview?', o: ['Talk about titles held', 'Share specific examples of influence and impact', 'List management training courses', 'Mention team size only'], c: 1, e: 'Concrete examples of influence and impact are more compelling than titles or credentials.' },
    { q: 'When asked about a failure, you should:', o: ['Deny any failures', 'Blame external factors', 'Describe the failure and what you learned', 'Change the subject'], c: 2, e: 'Acknowledging failures and demonstrating learning shows self-awareness and resilience.' },
    { q: 'The most effective way to answer "Tell me about yourself" is to:', o: ['Recite your entire resume', 'Give a focused professional narrative relevant to the role', 'Share personal hobbies first', 'Ask them to be more specific'], c: 1, e: 'A focused professional narrative shows preparation and role alignment.' },
  ],
  technical: [
    { q: 'Which data structure provides O(1) average-case lookup time?', o: ['Linked List', 'Binary Tree', 'Hash Table', 'Array (unsorted)'], c: 2, e: 'Hash Tables provide O(1) average-case lookup through hash function mapping.' },
    { q: 'What is the primary purpose of database indexing?', o: ['Reduce storage space', 'Speed up query performance', 'Improve data integrity', 'Enable transactions'], c: 1, e: 'Indexes create data structures that improve query speed at the cost of extra storage.' },
    { q: 'Which pattern is used to handle varying algorithms at runtime?', o: ['Singleton Pattern', 'Strategy Pattern', 'Observer Pattern', 'Factory Pattern'], c: 1, e: 'Strategy Pattern encapsulates algorithms and makes them interchangeable at runtime.' },
    { q: 'What does CAP theorem state about distributed systems?', o: ['They can have Consistency, Availability, and Partition tolerance', 'They can only guarantee two of three: Consistency, Availability, Partition tolerance', 'They must use SQL databases', 'They cannot scale horizontally'], c: 1, e: 'CAP theorem states distributed systems can guarantee at most two of: Consistency, Availability, Partition tolerance.' },
    { q: 'Which sorting algorithm has the best average-case time complexity?', o: ['Bubble Sort — O(n²)', 'Quick Sort — O(n log n)', 'Selection Sort — O(n²)', 'Insertion Sort — O(n²)'], c: 1, e: 'Quick Sort has O(n log n) average-case time complexity.' },
  ],
  situational: [
    { q: 'A production deployment fails at midnight. Your first action should be:', o: ['Go back to sleep', 'Rollback to the previous stable version', 'Start debugging immediately without rollback', 'Blame the deployment pipeline'], c: 1, e: 'Rolling back ensures service restoration while you investigate the root cause.' },
    { q: 'Two team members have a technical disagreement. As the lead, you should:', o: ['Pick a side immediately', 'Let them fight it out', 'Facilitate a data-driven discussion', 'Escalate to management'], c: 2, e: 'Facilitating data-driven discussion helps reach consensus based on facts, not opinions.' },
    { q: 'A client requests a feature that violates security best practices. You should:', o: ['Implement it as requested', 'Refuse without explanation', 'Explain the risks and propose a secure alternative', 'Ignore the request'], c: 2, e: 'Explaining risks and proposing alternatives shows both security awareness and client orientation.' },
    { q: 'Your sprint velocity has dropped 30%. The best approach is to:', o: ['Add more developers', 'Extend working hours', 'Analyze the root cause and adjust processes', 'Remove testing to save time'], c: 2, e: 'Root cause analysis helps identify whether it\'s scope creep, tech debt, or other systemic issues.' },
    { q: 'A junior developer pushes code that breaks CI/CD. You should:', o: ['Publicly shame them', 'Silently fix it yourself', 'Help them understand the issue and fix it together', 'Report them to HR'], c: 2, e: 'Teaching moments build team capability and psychological safety.' },
  ],
  'case-study': [
    { q: 'When analyzing declining retention, the first metric to examine is:', o: ['Revenue per user', 'Churn rate by cohort', 'Number of features', 'Marketing spend'], c: 1, e: 'Cohort analysis reveals when users churn, helping identify the problematic stage.' },
    { q: 'The most critical factor when scaling from 1K to 1M users is:', o: ['Adding more servers', 'Architectural redesign for horizontal scalability', 'Hiring more developers', 'Increasing marketing budget'], c: 1, e: 'Architecture must be redesigned for horizontal scalability to handle 1000x growth.' },
    { q: 'Which migration strategy minimizes risk when moving to cloud?', o: ['Big bang migration', 'Strangler fig pattern (gradual migration)', 'Rewrite everything from scratch', 'Lift and shift only'], c: 1, e: 'Strangler fig pattern gradually migrates services, reducing risk at each step.' },
  ],
  competency: [
    { q: 'The most effective way to learn a new technology quickly is:', o: ['Read the entire documentation', 'Build a small project using the technology', 'Watch tutorial videos only', 'Wait for formal training'], c: 1, e: 'Hands-on projects accelerate learning through practical application.' },
    { q: 'Code quality is best maintained through:', o: ['Individual effort only', 'Automated tests and peer code reviews', 'Management oversight', 'Documentation only'], c: 1, e: 'Automated tests catch regressions while code reviews share knowledge and maintain standards.' },
    { q: 'When receiving feedback on your code, the best response is:', o: ['Defend your implementation', 'Listen, ask clarifying questions, and iterate', 'Ignore it', 'Accept everything without question'], c: 1, e: 'Active listening and asking clarifying questions leads to better code and professional growth.' },
  ],
  general: [
    { q: 'The most effective way to answer "Where do you see yourself in 5 years?" is:', o: ['Say you want the interviewer\'s job', 'Describe growth aligned with the company\'s direction', 'Say you haven\'t thought about it', 'Mention starting your own company'], c: 1, e: 'Aligning your growth with the company shows commitment and strategic thinking.' },
    { q: 'When asked about salary expectations, the best approach is:', o: ['Give an exact number immediately', 'Research market rates and provide a justified range', 'Say you\'ll accept anything', 'Refuse to answer'], c: 1, e: 'Researched salary ranges show preparation and reasonable expectations.' },
    { q: 'Following up after an interview, you should:', o: ['Call multiple times per day', 'Send a thoughtful thank-you email within 24 hours', 'Wait indefinitely', 'Send a generic template email'], c: 1, e: 'A personalized thank-you email shows professionalism and genuine interest.' },
  ],
};

const DURATION_OPTIONS = [5, 10, 15, 20, 30, 45, 60];
const PRACTICE_COUNT_OPTIONS = [3, 5, 10];

const MODE_CONFIG: Record<InterviewMode, { label: string; description: string; icon: LucideIcon; features: string[] }> = {
  practice: {
    label: 'Practice',
    description: 'Untimed practice with the built-in question set. Move freely between questions and ask the AI for answer guidance when you want it.',
    icon: NotebookPen,
    features: ['Untimed', 'Free navigation', 'AI answer guidance'],
  },
  mock: {
    label: 'Mock interview',
    description: 'The practice questions under a countdown. Pause if you need to; the session ends when time runs out. No hints.',
    icon: Timer,
    features: ['Countdown timer', 'Pause and resume', 'No hints'],
  },
  cbt: {
    label: 'CBT examination',
    description: 'Timed multiple-choice exam with a question palette. Questions are AI-calibrated for your target role, or come from the built-in set.',
    icon: ClipboardCheck,
    features: ['Strict timer', 'Auto-submit', 'Scored review'],
  },
  live: {
    label: 'Live AI interview',
    description: 'A text interview with an adaptive AI interviewer that evaluates each answer and writes a final report.',
    icon: MessagesSquare,
    features: ['Adaptive questions', 'Per-answer feedback', 'Final report'],
  },
};

const FEATURES: Array<{ icon: LucideIcon; title: string; description: string }> = [
  { icon: Sparkles, title: 'Role-calibrated exams', description: 'CBT questions generated for your target role and level when the AI service is available.' },
  { icon: MessagesSquare, title: 'Evaluated live answers', description: 'The live interviewer scores each answer and writes a report at the end.' },
  { icon: Lightbulb, title: 'Answer guidance', description: 'Ask for an AI example answer and tip on any practice question.' },
  { icon: Keyboard, title: 'Keyboard-friendly exams', description: 'A–D or 1–4 to answer, arrows to move, F to flag, while the exam has focus.' },
];

const topicById = (id: InterviewTopicId) => INTERVIEW_TOPICS.find((topic) => topic.id === id) ?? INTERVIEW_TOPICS[0];

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

function builtInExam(topicId: InterviewTopicId): ExamQuestion[] {
  return CBT_BANK[topicId].map((item, index) => ({
    id: `built-in-${topicId}-${index + 1}`,
    question: item.q,
    options: item.o,
    correctIndex: item.c,
    explanation: item.e,
    selectedIndex: null,
    flagged: false,
  }));
}

function toApiError(error: unknown): InterviewApiError {
  return error instanceof InterviewApiError ? error : new InterviewApiError(0, 'UNKNOWN_ERROR', String(error));
}

const timeAnnouncement = (seconds: number) => (seconds === 300 ? 'Five minutes remaining.' : seconds === 60 ? 'One minute remaining.' : '');

/* ─── Page ─── */

export function InterviewCoachPage() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const [phase, setPhase] = useState<Phase>('mode-select');
  const [mode, setMode] = useState<InterviewMode>('practice');

  const [topicId, setTopicId] = useState<InterviewTopicId | null>(null);
  const [jobRole, setJobRole] = useState('');
  const [practiceCount, setPracticeCount] = useState(5);
  const [aiCount, setAiCount] = useState<number>(10);
  const [duration, setDuration] = useState(15);
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>('mid');
  const [difficulty, setDifficulty] = useState<InterviewDifficulty>('medium');
  const [topicError, setTopicError] = useState('');
  const [roleError, setRoleError] = useState('');
  const [pending, setPending] = useState<null | 'assessment' | 'live'>(null);
  const [startError, setStartError] = useState<{ kind: 'assessment' | 'live'; error: InterviewApiError } | null>(null);
  const startAbortRef = useRef<AbortController | null>(null);

  const [practice, setPractice] = useState<PracticeState | null>(null);
  const [exam, setExam] = useState<ExamState | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [paused, setPaused] = useState(false);
  const [liveSession, setLiveSession] = useState<LiveInterviewSession | null>(null);
  const [resumable, setResumable] = useState<LiveInterviewSession | null>(null);

  const roleInputRef = useRef<HTMLInputElement>(null);
  const firstTopicRef = useRef<HTMLButtonElement>(null);
  const ids = { role: useId(), roleHelp: useId(), roleError: useId(), topicError: useId(), count: useId(), duration: useId(), level: useId(), difficulty: useId() };

  useEffect(() => () => startAbortRef.current?.abort(), []);

  // A live interview survives a reload: the tab keeps only the session id and
  // the server returns the session to its owner (anyone else gets 404).
  useEffect(() => {
    if (!uid) return;
    const sessionId = recallLiveSession(uid);
    if (!sessionId) return;
    const controller = new AbortController();
    getLiveInterview(sessionId, controller.signal)
      .then((session) => setResumable(session))
      .catch((error: unknown) => {
        const failure = toApiError(error);
        if ([400, 401, 403, 404, 410].includes(failure.status)) forgetLiveSession(uid);
      });
    return () => controller.abort();
  }, [uid]);

  /* ─── Timers (mock + CBT) ─── */
  const timerRunning = phase === 'active' && !paused && ((mode === 'mock' && practice !== null) || (mode === 'cbt' && exam !== null));

  useEffect(() => {
    if (!timerRunning) return;
    const id = window.setInterval(() => setTimeRemaining((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearInterval(id);
  }, [timerRunning]);

  const finishPractice = useCallback((timedOut: boolean) => {
    setPractice((previous) => previous && {
      ...previous,
      timedOut,
      timeUsed: previous.durationSeconds != null
        ? previous.durationSeconds - (timedOut ? 0 : timeRemaining)
        : Math.max(0, Math.round((Date.now() - previous.startedAt) / 1000)),
    });
    setPaused(false);
    setPhase('completed');
  }, [timeRemaining]);

  const submitExam = useCallback((timedOut: boolean) => {
    setExam((previous) => previous && { ...previous, timedOut, timeUsed: previous.durationSeconds - (timedOut ? 0 : timeRemaining) });
    setPhase('completed');
  }, [timeRemaining]);

  // Runs with the latest state on every render, so a timeout scores the answers
  // the candidate actually gave (the old interval captured a stale snapshot).
  useEffect(() => {
    if (!timerRunning || timeRemaining > 0) return;
    if (mode === 'cbt') submitExam(true);
    else finishPractice(true);
  }, [timerRunning, timeRemaining, mode, submitExam, finishPractice]);

  /* ─── Navigation between phases ─── */
  const backToModes = () => {
    startAbortRef.current?.abort();
    setPhase('mode-select');
    setPractice(null);
    setExam(null);
    setLiveSession(null);
    setStartError(null);
    setPaused(false);
    setTimeRemaining(0);
  };

  const chooseMode = (next: InterviewMode) => {
    setMode(next);
    setStartError(null);
    setTopicError('');
    setRoleError('');
    setPhase('configure');
  };

  /* ─── Starting sessions ─── */
  const practiceBankSize = topicId ? PRACTICE_BANK[topicId].length : PRACTICE_COUNT_OPTIONS[PRACTICE_COUNT_OPTIONS.length - 1];
  const practiceOptions = PRACTICE_COUNT_OPTIONS.filter((count) => count <= practiceBankSize);
  const effectivePracticeCount = Math.min(practiceCount, practiceBankSize);
  const trimmedRole = jobRole.trim();

  const startPractice = (topic: InterviewTopicId, practiceMode: 'practice' | 'mock') => {
    const questions = PRACTICE_BANK[topic].slice(0, effectivePracticeCount);
    const seconds = practiceMode === 'mock' ? duration * 60 : null;
    setPractice({ mode: practiceMode, topicId: topic, role: trimmedRole, questions, answers: questions.map(() => ''), index: 0, startedAt: Date.now(), durationSeconds: seconds, timeUsed: null, timedOut: false });
    setTimeRemaining(seconds ?? 0);
    setPaused(false);
    setPhase('active');
  };

  const beginExam = (topic: InterviewTopicId, questions: ExamQuestion[], source: ExamState['source'], title: string) => {
    setExam({ topicId: topic, role: trimmedRole, source, title, questions, index: 0, durationSeconds: duration * 60, timeUsed: null, timedOut: false });
    setTimeRemaining(duration * 60);
    setStartError(null);
    setPhase('active');
  };

  const startExam = async (topic: InterviewTopicId, useBuiltIn: boolean) => {
    if (useBuiltIn || !trimmedRole) {
      beginExam(topic, builtInExam(topic), 'built-in', '');
      return;
    }
    const controller = new AbortController();
    startAbortRef.current = controller;
    setPending('assessment');
    setStartError(null);
    try {
      const assessment = await generateAssessment({ occupation: trimmedRole, topic, questionCount: aiCount, experienceLevel, difficulty }, controller.signal);
      beginExam(topic, assessment.questions.map((question) => ({ ...question, selectedIndex: null, flagged: false })), 'ai', assessment.title);
    } catch (error) {
      const failure = toApiError(error);
      if (!failure.cancelled) setStartError({ kind: 'assessment', error: failure });
    } finally {
      if (startAbortRef.current === controller) startAbortRef.current = null;
      setPending(null);
    }
  };

  const startLive = async (topic: InterviewTopicId) => {
    const controller = new AbortController();
    startAbortRef.current = controller;
    setPending('live');
    setStartError(null);
    try {
      const session = await startLiveInterview({ role: trimmedRole, topic, experienceLevel, difficulty, durationMinutes: duration }, controller.signal);
      if (uid) rememberLiveSession(uid, session.sessionId);
      setResumable(null);
      setLiveSession(session);
      setPhase('active');
    } catch (error) {
      const failure = toApiError(error);
      if (!failure.cancelled) setStartError({ kind: 'live', error: failure });
    } finally {
      if (startAbortRef.current === controller) startAbortRef.current = null;
      setPending(null);
    }
  };

  const handleStart = () => {
    let valid = true;
    if (!topicId) {
      setTopicError('Choose an interview topic.');
      valid = false;
    }
    if (mode === 'live' && trimmedRole.length < 2) {
      setRoleError('Add a target role before starting the live interview.');
      valid = false;
    }
    if (!valid || !topicId) {
      if (mode === 'live' && trimmedRole.length < 2) roleInputRef.current?.focus();
      else firstTopicRef.current?.focus();
      return;
    }
    if (mode === 'practice' || mode === 'mock') startPractice(topicId, mode);
    else if (mode === 'cbt') void startExam(topicId, false);
    else void startLive(topicId);
  };

  const leaveLive = () => {
    if (uid) forgetLiveSession(uid);
    setResumable(null);
    backToModes();
  };

  /* ─── Render: active sessions and reports ─── */
  if (phase === 'active' && mode === 'live' && liveSession) {
    return <LiveInterviewPanel session={liveSession} onSessionChange={setLiveSession} onLeave={leaveLive} />;
  }

  if (phase === 'active' && (mode === 'practice' || mode === 'mock') && practice) {
    return (
      <PracticeSessionView
        key={practice.startedAt}
        state={practice}
        timeRemaining={timeRemaining}
        paused={paused}
        onTogglePause={() => setPaused((value) => !value)}
        onAnswerChange={(index, value) => setPractice((previous) => previous && { ...previous, answers: previous.answers.map((answer, i) => (i === index ? value : answer)) })}
        onNavigate={(index) => setPractice((previous) => previous && { ...previous, index: Math.max(0, Math.min(previous.questions.length - 1, index)) })}
        onFinish={() => finishPractice(false)}
        onLeave={backToModes}
      />
    );
  }

  if (phase === 'active' && mode === 'cbt' && exam) {
    return (
      <ExamView
        state={exam}
        timeRemaining={timeRemaining}
        onSelect={(optionIndex) => setExam((previous) => previous && { ...previous, questions: previous.questions.map((question, i) => (i === previous.index ? { ...question, selectedIndex: optionIndex } : question)) })}
        onToggleFlag={() => setExam((previous) => previous && { ...previous, questions: previous.questions.map((question, i) => (i === previous.index ? { ...question, flagged: !question.flagged } : question)) })}
        onNavigate={(index) => setExam((previous) => previous && { ...previous, index: Math.max(0, Math.min(previous.questions.length - 1, index)) })}
        onSubmit={() => submitExam(false)}
        onLeave={backToModes}
      />
    );
  }

  if (phase === 'completed' && (mode === 'practice' || mode === 'mock') && practice) {
    return (
      <PracticeReport
        state={practice}
        onRestart={() => {
          setPractice({ ...practice, answers: practice.questions.map(() => ''), index: 0, startedAt: Date.now(), timeUsed: null, timedOut: false });
          setTimeRemaining(practice.durationSeconds ?? 0);
          setPaused(false);
          setPhase('active');
        }}
        onNewSession={backToModes}
      />
    );
  }

  if (phase === 'completed' && mode === 'cbt' && exam) {
    return (
      <ExamReport
        state={exam}
        onRetake={() => {
          setExam({ ...exam, questions: exam.questions.map((question) => ({ ...question, selectedIndex: null, flagged: false })), index: 0, timeUsed: null, timedOut: false });
          setTimeRemaining(exam.durationSeconds);
          setPhase('active');
        }}
        onNewSession={backToModes}
      />
    );
  }

  /* ─── Render: configuration ─── */
  if (phase === 'configure') {
    const config = MODE_CONFIG[mode];
    const ModeIcon = config.icon;
    const roleRequired = mode === 'live';
    const usesAiSettings = mode === 'live' || (mode === 'cbt' && trimmedRole.length > 0);
    const builtInExamSize = topicId ? CBT_BANK[topicId].length : null;
    const startLabel = mode === 'practice' ? 'Start practice'
      : mode === 'mock' ? 'Start mock interview'
      : mode === 'cbt' ? (trimmedRole ? 'Generate exam' : 'Start exam with built-in questions')
      : 'Start live interview';

    return (
      <div className="p-4 lg:p-6 xl:p-8">
        <div className="mx-auto max-w-2xl">
          <Button variant="ghost" size="sm" onClick={backToModes} className="-ml-2 mb-3">
            <ChevronLeft aria-hidden="true" /> All modes
          </Button>
          <div className="mb-6 flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50">
              <ModeIcon className="size-5 text-brand-600" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-ink">{config.label}</h1>
              <p className="text-sm text-ink-muted">{config.description}</p>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <label htmlFor={ids.role} className="mb-1.5 block text-sm font-semibold text-ink">
                Target role{roleRequired ? '' : ' (optional)'}
              </label>
              <Input
                id={ids.role}
                ref={roleInputRef}
                value={jobRole}
                maxLength={160}
                onChange={(event) => { setJobRole(event.target.value); if (roleError) setRoleError(''); }}
                placeholder="e.g. Data Analyst"
                aria-invalid={roleError ? true : undefined}
                aria-describedby={roleError ? `${ids.roleHelp} ${ids.roleError}` : ids.roleHelp}
                aria-required={roleRequired || undefined}
              />
              <p id={ids.roleHelp} className="mt-1 text-xs text-ink-muted">
                {mode === 'live' && 'The interviewer tailors its questions to this role.'}
                {mode === 'cbt' && 'Required for AI-generated questions. Leave it empty to use the built-in question set.'}
                {(mode === 'practice' || mode === 'mock') && 'Used to tailor AI answer guidance. Practice questions come from the built-in set.'}
              </p>
              {roleError && <p id={ids.roleError} className="mt-1 text-sm text-error-700">{roleError}</p>}
            </div>

            <fieldset aria-describedby={topicError ? ids.topicError : undefined}>
              <legend className="mb-2 text-sm font-semibold text-ink">Interview topic</legend>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {INTERVIEW_TOPICS.map((topic, index) => {
                  const Icon = topic.icon;
                  const selected = topicId === topic.id;
                  return (
                    <button
                      key={topic.id}
                      ref={index === 0 ? firstTopicRef : undefined}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => { setTopicId(topic.id); setTopicError(''); }}
                      className={cn(
                        'flex items-start gap-3 rounded-xl border-2 p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                        selected ? 'border-brand-500 bg-brand-50' : 'border-border bg-surface hover:border-brand-300',
                      )}
                    >
                      <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', selected ? 'bg-brand-100' : 'bg-neutral-100')}>
                        <Icon className={cn('size-4', selected ? 'text-brand-600' : 'text-ink-muted')} aria-hidden="true" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-ink">{topic.label}</span>
                        <span className="mt-0.5 block text-xs text-ink-muted">{topic.description}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {topicError && <p id={ids.topicError} className="mt-2 text-sm text-error-700">{topicError}</p>}
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              {(mode === 'practice' || mode === 'mock') && (
                <div>
                  <label id={ids.count} className="mb-1.5 block text-sm font-semibold text-ink">Number of questions</label>
                  <Select value={String(effectivePracticeCount)} onValueChange={(value) => setPracticeCount(Number(value))}>
                    <SelectTrigger aria-labelledby={ids.count}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {practiceOptions.map((count) => <SelectItem key={count} value={String(count)}>{count} questions</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {topicId && <p className="mt-1 text-xs text-ink-muted">The built-in {topicById(topicId).label} set has {practiceBankSize} questions.</p>}
                </div>
              )}
              {mode === 'cbt' && trimmedRole && (
                <div>
                  <label id={ids.count} className="mb-1.5 block text-sm font-semibold text-ink">Number of questions</label>
                  <Select value={String(aiCount)} onValueChange={(value) => setAiCount(Number(value))}>
                    <SelectTrigger aria-labelledby={ids.count}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {AI_ASSESSMENT_COUNTS.map((count) => <SelectItem key={count} value={String(count)}>{count} questions</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {mode !== 'practice' && (
                <div>
                  <label id={ids.duration} className="mb-1.5 block text-sm font-semibold text-ink">Duration</label>
                  <Select value={String(duration)} onValueChange={(value) => setDuration(Number(value))}>
                    <SelectTrigger aria-labelledby={ids.duration}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DURATION_OPTIONS.map((minutes) => <SelectItem key={minutes} value={String(minutes)}>{minutes} minutes</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {mode === 'live' && <p className="mt-1 text-xs text-ink-muted">About {liveTargetTurns(duration)} questions.</p>}
                </div>
              )}
              {usesAiSettings && (
                <>
                  <div>
                    <label id={ids.level} className="mb-1.5 block text-sm font-semibold text-ink">Experience level</label>
                    <Select value={experienceLevel} onValueChange={(value) => setExperienceLevel(value as ExperienceLevel)}>
                      <SelectTrigger aria-labelledby={ids.level}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {EXPERIENCE_LEVEL_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label id={ids.difficulty} className="mb-1.5 block text-sm font-semibold text-ink">Difficulty</label>
                    <Select value={difficulty} onValueChange={(value) => setDifficulty(value as InterviewDifficulty)}>
                      <SelectTrigger aria-labelledby={ids.difficulty}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {DIFFICULTY_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </div>

            {mode === 'cbt' && !trimmedRole && (
              <p className="flex items-start gap-2 rounded-xl border border-border bg-canvas-soft p-3 text-sm text-ink-secondary">
                <Info className="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden="true" />
                {builtInExamSize != null
                  ? `Without a target role the exam uses the built-in ${topicById(topicId!).label} set (${builtInExamSize} questions).`
                  : 'Without a target role the exam uses the built-in question set for the topic you choose.'}
              </p>
            )}

            {startError && (
              <div role="alert" className="rounded-xl border border-error-200 bg-error-50 p-4 text-sm text-error-800">
                <p className="flex items-center gap-2 font-semibold">
                  <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
                  {startError.kind === 'assessment' ? 'AI questions are unavailable' : 'The live interviewer couldn’t start'}
                </p>
                <p className="mt-1 break-words">{startError.error.message}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={handleStart} disabled={pending !== null}>
                    <RotateCcw aria-hidden="true" /> Try again
                  </Button>
                  {startError.kind === 'assessment' && topicId && (
                    <Button size="sm" variant="outline" onClick={() => void startExam(topicId, true)} disabled={pending !== null}>
                      Use the built-in questions instead
                    </Button>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Button size="lg" onClick={handleStart} disabled={pending !== null}>
                {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Play aria-hidden="true" />}
                {pending === 'assessment' ? 'Generating questions…' : pending === 'live' ? 'Starting interview…' : startLabel}
              </Button>
              {pending && (
                <Button size="lg" variant="ghost" onClick={() => startAbortRef.current?.abort()}>Cancel</Button>
              )}
            </div>
          </div>
        </div>
        <AiProcessingModal
          isOpen={pending === 'assessment' || pending === 'live'}
          onCancel={() => startAbortRef.current?.abort()}
          kind="interview"
          title={pending === 'live' ? 'Connecting to AI Interviewer' : 'AI Interview Blueprint Engine'}
          subtitle={
            pending === 'live'
              ? `Initializing adaptive interviewer for ${trimmedRole || 'your target role'}...`
              : `Calibrating Bloom's taxonomy, difficulty & scenario questions for ${trimmedRole || 'your target role'}`
          }
        />
      </div>
    );
  }

  /* ─── Render: mode selection ─── */
  return (
    <div className="p-4 lg:p-6 xl:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-ink lg:text-3xl">AI Interview Coach</h1>
        <p className="mt-1 text-ink-secondary">Prepare with practice questions, timed exams and a live AI interviewer.</p>
      </div>

      {resumable && (
        <section aria-labelledby="resume-live-heading" className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-4">
          <div className="min-w-0">
            <h2 id="resume-live-heading" className="text-sm font-semibold text-ink">
              {resumable.report ? 'Your live interview report is ready' : 'You have a live interview in progress'}
            </h2>
            <p className="mt-0.5 text-sm text-ink-secondary break-words">
              {resumable.configuration.role} · {resumable.progress.completedTurns} of about {resumable.progress.targetTurns} questions answered
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => { setMode('live'); setLiveSession(resumable); setPhase('active'); }}>
              {resumable.report ? 'View report' : 'Resume interview'}
            </Button>
            {resumable.report && (
              <Button variant="outline" onClick={() => { if (uid) { forgetLiveSession(uid); } setResumable(null); }}>Dismiss</Button>
            )}
          </div>
        </section>
      )}

      <ul className="mb-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {FEATURES.map((feature) => {
          const Icon = feature.icon;
          return (
            <li key={feature.title} className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50">
                <Icon className="size-5 text-brand-600" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-ink">{feature.title}</span>
                <span className="mt-0.5 block text-xs text-ink-muted">{feature.description}</span>
              </span>
            </li>
          );
        })}
      </ul>

      <h2 className="mb-1 text-lg font-bold text-ink">Choose a mode</h2>
      <p className="mb-6 text-sm text-ink-muted">Pick the preparation style that fits where you are.</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(Object.entries(MODE_CONFIG) as Array<[InterviewMode, (typeof MODE_CONFIG)[InterviewMode]]>).map(([key, config]) => {
          const Icon = config.icon;
          return (
            <button
              key={key}
              type="button"
              onClick={() => chooseMode(key)}
              className="flex flex-col items-start rounded-2xl border-2 border-border bg-surface p-5 text-left transition-colors hover:border-brand-300 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <span className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-neutral-100">
                <Icon className="size-6 text-brand-600" aria-hidden="true" />
              </span>
              <span className="mb-1 text-sm font-bold text-ink">{config.label}</span>
              <span className="mb-3 text-xs leading-relaxed text-ink-muted">{config.description}</span>
              <span className="flex flex-wrap gap-1.5">
                {config.features.map((feature) => (
                  <span key={feature} className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">{feature}</span>
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Practice & mock session ─── */

interface PracticeSessionViewProps {
  state: PracticeState;
  timeRemaining: number;
  paused: boolean;
  onTogglePause: () => void;
  onAnswerChange: (index: number, value: string) => void;
  onNavigate: (index: number) => void;
  onFinish: () => void;
  onLeave: () => void;
}

function PracticeSessionView({ state, timeRemaining, paused, onTogglePause, onAnswerChange, onNavigate, onFinish, onLeave }: PracticeSessionViewProps) {
  const [guides, setGuides] = useState<Record<number, GuideEntry>>({});
  const [confirmLeave, setConfirmLeave] = useState(false);
  const guideAbortRef = useRef<AbortController | null>(null);
  const leaveButtonRef = useRef<HTMLButtonElement>(null);
  const stayButtonRef = useRef<HTMLButtonElement>(null);
  const resumeButtonRef = useRef<HTMLButtonElement>(null);
  const pauseButtonRef = useRef<HTMLButtonElement>(null);
  const answerId = useId();
  const isMock = state.mode === 'mock';
  const topic = topicById(state.topicId);
  const total = state.questions.length;
  const index = state.index;
  const question = state.questions[index];
  const answeredCount = state.answers.filter((answer) => answer.trim()).length;
  const guide = guides[index];

  useEffect(() => () => guideAbortRef.current?.abort(), []);
  useEffect(() => {
    if (paused) resumeButtonRef.current?.focus();
  }, [paused]);

  const askForGuide = async (regenerate: boolean) => {
    guideAbortRef.current?.abort();
    const controller = new AbortController();
    guideAbortRef.current = controller;
    const forIndex = index;
    setGuides((current) => ({ ...current, [forIndex]: { status: 'loading' } }));
    try {
      const result = await requestAnswerGuide({ question, role: state.role || undefined, topic: topic.label, regenerate }, controller.signal);
      setGuides((current) => ({ ...current, [forIndex]: { status: 'ready', guide: result } }));
    } catch (error) {
      const failure = toApiError(error);
      setGuides((current) => {
        const next = { ...current };
        if (failure.cancelled) delete next[forIndex];
        else next[forIndex] = { status: 'error', message: failure.message };
        return next;
      });
    }
  };

  const requestLeave = () => {
    if (answeredCount > 0) setConfirmLeave(true);
    else onLeave();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3 lg:px-6">
        <div className="min-w-0">
          <h1 className="text-sm font-semibold text-ink">{isMock ? 'Mock interview' : 'Practice'}: {topic.label}</h1>
          <p className="text-xs text-ink-muted">
            Built-in question set · Question {index + 1} of {total} · {answeredCount} answered{isMock ? '' : ' · Untimed'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isMock && (
            <>
              <div
                role="timer"
                aria-label="Time remaining"
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-sm font-bold',
                  timeRemaining <= 60 ? 'bg-error-100 text-error-800' : timeRemaining <= 300 ? 'bg-warning-100 text-warning-800' : 'bg-neutral-100 text-ink',
                )}
              >
                <Clock className="size-3.5" aria-hidden="true" />
                {formatClock(timeRemaining)}
              </div>
              <Button ref={pauseButtonRef} variant="outline" size="sm" onClick={onTogglePause}>
                {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
                {paused ? 'Resume' : 'Pause'}
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={onFinish}>Finish session</Button>
          <Button ref={leaveButtonRef} variant="ghost" size="icon" onClick={requestLeave} aria-label="Leave session">
            <X aria-hidden="true" />
          </Button>
        </div>
      </div>
      <p role="status" aria-live="polite" className="sr-only">{isMock ? timeAnnouncement(timeRemaining) : ''}</p>

      {paused ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="space-y-4 text-center">
            <Pause className="mx-auto size-12 text-brand-300" aria-hidden="true" />
            <h2 className="text-xl font-bold text-ink">Session paused</h2>
            <p className="text-sm text-ink-muted">The timer is stopped and the question is hidden until you resume.</p>
            <Button ref={resumeButtonRef} onClick={() => { onTogglePause(); requestAnimationFrame(() => pauseButtonRef.current?.focus()); }}>
              <Play aria-hidden="true" /> Resume interview
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 lg:p-6">
          <div className="mx-auto max-w-3xl space-y-4">
            <nav aria-label="Questions" className="flex flex-wrap gap-1.5">
              {state.questions.map((_, i) => {
                const answered = Boolean(state.answers[i].trim());
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onNavigate(i)}
                    aria-current={i === index ? 'step' : undefined}
                    aria-label={`Question ${i + 1}${answered ? ', answered' : ''}`}
                    className={cn(
                      'flex size-8 items-center justify-center rounded-lg border text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                      i === index ? 'border-brand-600 bg-brand-600 text-white' : answered ? 'border-success-300 bg-success-50 text-success-800' : 'border-border bg-surface text-ink-muted',
                    )}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </nav>

            <section aria-labelledby="practice-question" className="rounded-2xl border border-border bg-surface p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">Question {index + 1} of {total}</p>
              <h2 id="practice-question" className="mt-2 text-base font-semibold leading-relaxed text-ink">{question}</h2>
              <label htmlFor={answerId} className="mt-4 block text-sm font-semibold text-ink">Your answer</label>
              <Textarea
                id={answerId}
                value={state.answers[index]}
                onChange={(event) => onAnswerChange(index, event.target.value)}
                rows={7}
                className="mt-1.5"
                placeholder="Answer as you would in the interview."
              />
              <p className="mt-1 text-xs text-ink-muted">Answers stay in this tab for your review at the end; they are not saved to your account.</p>
              {state.topicId === 'behavioral' && <p className="mt-1 text-xs text-ink-muted">Tip: structure the answer as Situation, Task, Action and Result.</p>}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
                <Button variant="outline" size="sm" onClick={() => onNavigate(index - 1)} disabled={index === 0}>
                  <ArrowLeft aria-hidden="true" /> Previous
                </Button>
                {index < total - 1 ? (
                  <Button size="sm" onClick={() => onNavigate(index + 1)}>
                    Next <ArrowRight aria-hidden="true" />
                  </Button>
                ) : (
                  <Button size="sm" onClick={onFinish}>
                    <CheckCircle2 aria-hidden="true" /> Finish session
                  </Button>
                )}
              </div>
            </section>

            {isMock ? (
              <p className="text-center text-xs text-ink-muted">Hints are off in mock interviews.</p>
            ) : (
              <section aria-labelledby="guide-heading" className="rounded-2xl border border-border bg-surface p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 id="guide-heading" className="text-sm font-semibold text-ink">AI answer guidance</h2>
                  {guide?.status === 'loading' ? (
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1.5 text-xs text-ink-muted"><Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> Requesting guidance…</span>
                      <Button variant="ghost" size="sm" onClick={() => guideAbortRef.current?.abort()}>Cancel</Button>
                    </div>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => void askForGuide(guide?.status === 'ready')}>
                      <Lightbulb aria-hidden="true" /> {guide?.status === 'ready' ? 'Regenerate guidance' : guide?.status === 'error' ? 'Try again' : 'Get answer guidance'}
                    </Button>
                  )}
                </div>
                <div aria-live="polite">
                  {!guide && <p className="mt-2 text-sm text-ink-muted">Get the goal behind this question, an example answer and a tip from the AI service.</p>}
                  {guide?.status === 'error' && (
                    <p role="alert" className="mt-2 flex items-start gap-2 text-sm text-error-700">
                      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> {guide.message}
                    </p>
                  )}
                  {guide?.status === 'ready' && (
                    <div className="mt-3 space-y-2 text-sm text-ink-secondary">
                      {guide.guide.goal && <p><span className="font-semibold text-ink">What they want to learn: </span>{guide.guide.goal}</p>}
                      <p><span className="font-semibold text-ink">Example answer: </span>{guide.guide.modelAnswer}</p>
                      {guide.guide.tip && <p><span className="font-semibold text-ink">Tip: </span>{guide.guide.tip}</p>}
                      <p className="text-xs text-ink-muted">Generated by the AI service for this question. Use it as a reference, not a script.</p>
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>
        </div>
      )}

      <Dialog open={confirmLeave} onOpenChange={setConfirmLeave}>
        <DialogContent
          className="w-[calc(100%-2rem)] max-w-md rounded-2xl"
          onOpenAutoFocus={(event) => { event.preventDefault(); stayButtonRef.current?.focus(); }}
          onCloseAutoFocus={(event) => { event.preventDefault(); leaveButtonRef.current?.focus(); }}
        >
          <DialogHeader>
            <DialogTitle>Leave this session?</DialogTitle>
            <DialogDescription>Your {answeredCount === 1 ? 'answer' : `${answeredCount} answers`} will be discarded.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button ref={stayButtonRef} variant="outline" onClick={() => setConfirmLeave(false)}>Stay</Button>
            <Button variant="destructive" onClick={() => { setConfirmLeave(false); onLeave(); }}>Leave session</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PracticeReport({ state, onRestart, onNewSession }: { state: PracticeState; onRestart: () => void; onNewSession: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const topic = topicById(state.topicId);
  const answered = state.answers.filter((answer) => answer.trim()).length;
  useEffect(() => { headingRef.current?.focus(); }, []);

  return (
    <div className="p-4 lg:p-6 xl:p-8">
      <div className="mx-auto max-w-3xl space-y-5">
        <div>
          <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-bold text-ink outline-none">Session summary</h1>
          <p className="mt-1 text-sm text-ink-muted">{state.mode === 'mock' ? 'Mock interview' : 'Practice'} · {topic.label}{state.role ? ` · ${state.role}` : ''}</p>
        </div>
        <dl className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-surface p-4">
            <dt className="text-xs text-ink-muted">Answered</dt>
            <dd className="text-2xl font-bold text-ink">{answered} of {state.questions.length}</dd>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4">
            <dt className="text-xs text-ink-muted">Time used</dt>
            <dd className="text-2xl font-bold text-ink">{formatClock(state.timeUsed ?? 0)}</dd>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4">
            <dt className="text-xs text-ink-muted">Ended</dt>
            <dd className="text-base font-semibold text-ink">{state.timedOut ? 'Time ran out' : 'Finished by you'}</dd>
          </div>
        </dl>
        <p className="flex items-start gap-2 rounded-xl border border-border bg-canvas-soft p-3 text-sm text-ink-secondary">
          <Info className="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden="true" />
          Practice and mock sessions are not scored. Review your answers below, or use the Live AI interview for evaluated answers.
        </p>
        <section aria-labelledby="practice-review-heading" className="rounded-2xl border border-border bg-surface p-5">
          <h2 id="practice-review-heading" className="text-sm font-semibold text-ink">Your answers</h2>
          <ol className="mt-3 space-y-4">
            {state.questions.map((question, index) => (
              <li key={question} className="text-sm">
                <p className="font-medium text-ink">{index + 1}. {question}</p>
                {state.answers[index].trim()
                  ? <p className="mt-1 whitespace-pre-wrap break-words text-ink-secondary">{state.answers[index].trim()}</p>
                  : <p className="mt-1 text-warning-800">Not answered</p>}
              </li>
            ))}
          </ol>
        </section>
        <div className="flex flex-wrap justify-center gap-3">
          <Button variant="outline" onClick={onRestart}><RotateCcw aria-hidden="true" /> Practise again</Button>
          <Button onClick={onNewSession}>New session</Button>
        </div>
      </div>
    </div>
  );
}

/* ─── CBT examination ─── */

interface ExamViewProps {
  state: ExamState;
  timeRemaining: number;
  onSelect: (optionIndex: number) => void;
  onToggleFlag: () => void;
  onNavigate: (index: number) => void;
  onSubmit: () => void;
  onLeave: () => void;
}

function ExamView({ state, timeRemaining, onSelect, onToggleFlag, onNavigate, onSubmit, onLeave }: ExamViewProps) {
  const [dialog, setDialog] = useState<null | 'submit' | 'leave'>(null);
  const examRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const safeButtonRef = useRef<HTMLButtonElement>(null);
  const topic = topicById(state.topicId);
  const current = state.questions[state.index];
  const total = state.questions.length;
  const answeredCount = state.questions.filter((question) => question.selectedIndex !== null).length;
  const flaggedCount = state.questions.filter((question) => question.flagged).length;
  const unanswered = total - answeredCount;

  // Shortcuts are active only while focus is inside the exam (WCAG 2.1.4), and
  // never swallow browser shortcuts such as Ctrl+F.
  useEffect(() => { examRef.current?.focus(); }, []);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return;
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="listbox"]')) return;
    const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
    const optionIndex = /^[A-D]$/.test(key) ? key.charCodeAt(0) - 65 : /^[1-4]$/.test(key) ? Number(key) - 1 : -1;
    if (optionIndex >= 0) {
      if (optionIndex < current.options.length) { event.preventDefault(); onSelect(optionIndex); }
    } else if (key === 'ArrowRight') { event.preventDefault(); onNavigate(state.index + 1); }
    else if (key === 'ArrowLeft') { event.preventDefault(); onNavigate(state.index - 1); }
    else if (key === 'F') { event.preventDefault(); onToggleFlag(); }
  };

  const openDialog = (kind: 'submit' | 'leave', trigger: HTMLButtonElement) => {
    triggerRef.current = trigger;
    setDialog(kind);
  };

  const palette = (className: string) => (
    <nav aria-label="Question palette" className={className}>
      {state.questions.map((question, i) => (
        <button
          key={question.id}
          type="button"
          onClick={() => onNavigate(i)}
          aria-current={i === state.index ? 'step' : undefined}
          aria-label={`Question ${i + 1}${question.selectedIndex !== null ? ', answered' : ''}${question.flagged ? ', flagged' : ''}`}
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-lg border text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
            i === state.index && 'ring-2 ring-brand-500 ring-offset-1',
            question.flagged ? 'border-warning-300 bg-warning-100 text-warning-800'
              : question.selectedIndex !== null ? 'border-success-300 bg-success-50 text-success-800'
              : 'border-border bg-surface text-ink-muted',
          )}
        >
          {i + 1}
        </button>
      ))}
    </nav>
  );

  return (
    <section ref={examRef} tabIndex={-1} onKeyDown={onKeyDown} aria-label="CBT examination" className="flex h-full flex-col outline-none">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3 lg:px-6">
        <div className="min-w-0">
          <h1 className="text-sm font-bold text-ink">CBT examination: {topic.label}</h1>
          <p className="text-xs text-ink-muted break-words">
            {state.source === 'ai' ? `AI-generated${state.title ? ` · ${state.title}` : ''}` : 'Built-in question set'} · {answeredCount}/{total} answered{flaggedCount ? ` · ${flaggedCount} flagged` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div
            role="timer"
            aria-label="Time remaining"
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-sm font-bold',
              timeRemaining <= 60 ? 'bg-error-100 text-error-800' : timeRemaining <= 300 ? 'bg-warning-100 text-warning-800' : 'bg-neutral-100 text-ink',
            )}
          >
            <Clock className="size-3.5" aria-hidden="true" />
            {formatClock(timeRemaining)}
          </div>
          <Button size="sm" onClick={(event) => openDialog('submit', event.currentTarget)}>Submit exam</Button>
          <Button variant="ghost" size="icon" aria-label="Leave exam" onClick={(event) => openDialog('leave', event.currentTarget)}>
            <X aria-hidden="true" />
          </Button>
        </div>
      </div>
      <p role="status" aria-live="polite" className="sr-only">{timeAnnouncement(timeRemaining)}</p>

      <div className="flex flex-1 overflow-hidden">
        <aside className="hidden w-56 flex-col overflow-y-auto border-r border-border bg-canvas-soft p-3 md:flex">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-muted">Question palette</h2>
          {palette('grid grid-cols-5 gap-1.5')}
          <ul className="mt-4 space-y-1.5 text-xs text-ink-muted">
            <li className="flex items-center gap-1.5"><span className="size-3 rounded border border-success-300 bg-success-50" aria-hidden="true" /> Answered</li>
            <li className="flex items-center gap-1.5"><span className="size-3 rounded border border-warning-300 bg-warning-100" aria-hidden="true" /> Flagged</li>
            <li className="flex items-center gap-1.5"><span className="size-3 rounded border border-border bg-surface" aria-hidden="true" /> Unanswered</li>
          </ul>
          <p className="mt-auto pt-4 text-xs text-ink-muted">Shortcuts while the exam has focus: A–D or 1–4 answer, ← → move, F flag.</p>
        </aside>

        <div className="flex flex-1 flex-col overflow-y-auto p-4 lg:p-6">
          {palette('mb-4 flex gap-1.5 overflow-x-auto pb-1 md:hidden')}
          <div className="mb-4 flex items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-700">Question {state.index + 1} of {total}</span>
            <Button variant={current.flagged ? 'primary' : 'outline'} size="sm" aria-pressed={current.flagged} onClick={onToggleFlag}>
              <Flag aria-hidden="true" /> {current.flagged ? 'Flagged' : 'Flag for review'}
            </Button>
          </div>
          <h2 id="exam-question" className="mb-5 text-base font-semibold leading-relaxed text-ink break-words">{current.question}</h2>
          <div role="group" aria-labelledby="exam-question" className="space-y-3">
            {current.options.map((option, optionIndex) => {
              const letter = String.fromCharCode(65 + optionIndex);
              const selected = current.selectedIndex === optionIndex;
              return (
                <button
                  key={`${current.id}-${optionIndex}`}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelect(optionIndex)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl border-2 p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                    selected ? 'border-brand-500 bg-brand-50' : 'border-border bg-surface hover:border-brand-300',
                  )}
                >
                  <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold', selected ? 'bg-brand-600 text-white' : 'bg-neutral-100 text-ink-muted')}>
                    {letter}
                  </span>
                  <span className="text-sm text-ink break-words">{option}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-4">
            <Button variant="outline" size="sm" onClick={() => onNavigate(state.index - 1)} disabled={state.index === 0}>
              <ArrowLeft aria-hidden="true" /> Previous
            </Button>
            {state.index < total - 1 ? (
              <Button size="sm" onClick={() => onNavigate(state.index + 1)}>Next <ArrowRight aria-hidden="true" /></Button>
            ) : (
              <Button size="sm" onClick={(event) => openDialog('submit', event.currentTarget)}><CheckCircle2 aria-hidden="true" /> Submit exam</Button>
            )}
          </div>
        </div>
      </div>

      <Dialog open={dialog !== null} onOpenChange={(open) => { if (!open) setDialog(null); }}>
        <DialogContent
          className="w-[calc(100%-2rem)] max-w-md rounded-2xl"
          onOpenAutoFocus={(event) => { event.preventDefault(); safeButtonRef.current?.focus(); }}
          onCloseAutoFocus={(event) => { event.preventDefault(); triggerRef.current?.focus(); }}
        >
          {dialog === 'leave' ? (
            <>
              <DialogHeader>
                <DialogTitle>Leave the exam?</DialogTitle>
                <DialogDescription>Your answers will be discarded and the exam won’t be scored.</DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2">
                <Button ref={safeButtonRef} variant="outline" onClick={() => setDialog(null)}>Stay in exam</Button>
                <Button variant="destructive" onClick={() => { setDialog(null); onLeave(); }}>Leave exam</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Submit your exam?</DialogTitle>
                <DialogDescription>
                  You answered {answeredCount} of {total} questions{unanswered ? `; ${unanswered} unanswered will count as incorrect` : ''}{flaggedCount ? ` (${flaggedCount} flagged)` : ''}. You can’t change answers after submitting.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2">
                <Button ref={safeButtonRef} variant="outline" onClick={() => setDialog(null)}>Keep reviewing</Button>
                <Button onClick={() => { setDialog(null); onSubmit(); }}>Submit exam</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function ExamReport({ state, onRetake, onNewSession }: { state: ExamState; onRetake: () => void; onNewSession: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const topic = topicById(state.topicId);
  const total = state.questions.length;
  const correct = state.questions.filter((question) => question.selectedIndex === question.correctIndex).length;
  const unanswered = state.questions.filter((question) => question.selectedIndex === null).length;
  const incorrect = total - correct - unanswered;
  const score = total ? Math.round((correct / total) * 100) : 0;
  const tone = score >= 80 ? 'success' : score >= 60 ? 'warning' : 'error';
  useEffect(() => { headingRef.current?.focus(); }, []);

  return (
    <div className="p-4 lg:p-6 xl:p-8">
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="text-center">
          <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-bold text-ink outline-none">Exam results</h1>
          <p className="mt-1 text-sm text-ink-muted break-words">
            {topic.label} · {state.source === 'ai' ? `AI-generated questions for ${state.role}${state.title ? ` (${state.title})` : ''}` : `Built-in ${topic.label} question set`}
          </p>
        </div>
        <div className="flex justify-center">
          <div className={cn(
            'flex size-32 flex-col items-center justify-center rounded-full border-4',
            tone === 'success' ? 'border-success-500 bg-success-50' : tone === 'warning' ? 'border-warning-500 bg-warning-50' : 'border-error-500 bg-error-50',
          )}>
            <span className={cn('text-3xl font-bold', tone === 'success' ? 'text-success-800' : tone === 'warning' ? 'text-warning-800' : 'text-error-800')}>{score}%</span>
            <span className="text-xs text-ink-muted">{correct} of {total} correct</span>
          </div>
        </div>
        {state.timedOut && (
          <p className="rounded-xl border border-warning-200 bg-warning-50 p-3 text-center text-sm text-warning-800">
            Time ran out. The exam was submitted automatically with the answers you had given.
          </p>
        )}
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Correct', String(correct)],
            ['Incorrect', String(incorrect)],
            ['Unanswered', String(unanswered)],
            ['Time used', formatClock(state.timeUsed ?? 0)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-border bg-surface p-4 text-center">
              <dt className="text-xs text-ink-muted">{label}</dt>
              <dd className="text-2xl font-bold text-ink">{value}</dd>
            </div>
          ))}
        </dl>
        <section aria-labelledby="exam-review-heading" className="rounded-2xl border border-border bg-surface p-5">
          <h2 id="exam-review-heading" className="text-sm font-semibold text-ink">Answer review</h2>
          <ol className="mt-3 space-y-3">
            {state.questions.map((question, index) => {
              const isCorrect = question.selectedIndex === question.correctIndex;
              return (
                <li
                  key={question.id}
                  className={cn(
                    'rounded-lg border p-3 text-sm',
                    question.selectedIndex === null ? 'border-border bg-canvas-soft' : isCorrect ? 'border-success-200 bg-success-50' : 'border-error-200 bg-error-50',
                  )}
                >
                  <p className="font-medium text-ink break-words">{index + 1}. {question.question}</p>
                  <p className="mt-1 text-ink-secondary break-words">
                    {question.selectedIndex === null ? <span className="font-semibold text-warning-800">Not answered</span> : (
                      <>Your answer: <span className={cn('font-semibold', isCorrect ? 'text-success-800' : 'text-error-800')}>{question.options[question.selectedIndex]}</span> ({isCorrect ? 'correct' : 'incorrect'})</>
                    )}
                    {!isCorrect && <> · Correct answer: <span className="font-semibold text-success-800">{question.options[question.correctIndex]}</span></>}
                  </p>
                  {question.explanation && <p className="mt-1 text-ink-muted break-words">{question.explanation}</p>}
                </li>
              );
            })}
          </ol>
        </section>
        <div className="flex flex-wrap justify-center gap-3">
          <Button variant="outline" onClick={onRetake}><RotateCcw aria-hidden="true" /> Retake these questions</Button>
          <Button onClick={onNewSession}>New session</Button>
        </div>
      </div>
    </div>
  );
}
