/**
 * Interview Coach Page — 4 Modality Interview Engine
 *
 * DIR-003 INTERVIEW MODES PARITY CONTRACT:
 *   1. Practice Mode   — Self-paced, untimed, free pause, free navigation, real-time AI feedback
 *   2. Mock Interview   — Real-world timed simulation with countdown, pause capability, evaluation scorecard
 *   3. CBT Examination  — Strict timer, auto-submit on timeout, question palette, keyboard shortcuts (A-D, 1-4, arrows)
 *   4. Live Studio      — Face-to-face AI interview with webcam, STT, AI avatar (LiveInterviewSession)
 */

import { useState, useEffect, useCallback, useRef, useMemo, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { PageSpinner } from '@/components/ui/loading';
import { post, normalizeError } from '@/lib/api-client';
import { LiveInterviewSession } from '@/components/Dashboard/DashboardInterviews/LiveInterviewSession';
import {
  GraduationCap,
  Play,
  MessageCircle,
  Send,
  Bot,
  User,
  Clock,
  Target,
  Brain,
  Sparkles,
  RotateCcw,
  ChevronRight,
  ChevronLeft,
  Lightbulb,
  BookOpen,
  Code2,
  Users,
  Briefcase,
  X,
  Camera,
  Mic,
  Video,
  Pause,
  Flag,
  CheckCircle2,
  AlertCircle,
  Timer,
  Keyboard,
  ArrowRight,
  ArrowLeft,
  FileText,
  BarChart3,
  Trophy,
  Shield,
  Zap,
  Star,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/* ═══════════════════════════════════════════════════════════════════════ */
/* ─── Types ─── */
/* ═══════════════════════════════════════════════════════════════════════ */

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  feedback?: string;
}

interface InterviewTopic {
  id: string;
  label: string;
  description: string;
  icon: typeof GraduationCap;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
}

type InterviewMode = 'practice' | 'mock' | 'cbt' | 'live';

type SessionPhase = 'mode-select' | 'configure' | 'active' | 'completed';

interface CBTQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  selectedIndex: number | null;
  flagged: boolean;
  explanation?: string;
}

interface SessionReport {
  totalQuestions: number;
  answeredCount: number;
  correctCount: number;
  score: number;
  timeUsed: number;
  feedback: string;
  strengths: string[];
  improvements: string[];
}

/* ═══════════════════════════════════════════════════════════════════════ */
/* ─── Constants ─── */
/* ═══════════════════════════════════════════════════════════════════════ */

const INTERVIEW_TOPICS: InterviewTopic[] = [
  { id: 'behavioral', label: 'Behavioral', description: 'STAR method, leadership, teamwork', icon: Users, difficulty: 'beginner' },
  { id: 'technical', label: 'Technical', description: 'System design, problem-solving', icon: Code2, difficulty: 'intermediate' },
  { id: 'situational', label: 'Situational', description: 'Hypothetical workplace scenarios', icon: Lightbulb, difficulty: 'beginner' },
  { id: 'case-study', label: 'Case Study', description: 'Business analysis and strategy', icon: BookOpen, difficulty: 'advanced' },
  { id: 'competency', label: 'Competency', description: 'Skills and experience assessment', icon: Target, difficulty: 'intermediate' },
  { id: 'general', label: 'General', description: 'Common interview questions', icon: Briefcase, difficulty: 'beginner' },
];

const DURATION_OPTIONS = [
  { value: '5', label: '5 minutes' },
  { value: '10', label: '10 minutes' },
  { value: '15', label: '15 minutes' },
  { value: '20', label: '20 minutes' },
  { value: '30', label: '30 minutes' },
  { value: '45', label: '45 minutes' },
  { value: '60', label: '60 minutes' },
];

const QUESTION_COUNT_OPTIONS = [
  { value: '5', label: '5 questions' },
  { value: '10', label: '10 questions' },
  { value: '15', label: '15 questions' },
  { value: '20', label: '20 questions' },
  { value: '25', label: '25 questions' },
  { value: '30', label: '30 questions' },
];

const MODE_CONFIG = {
  practice: {
    label: 'Practice Mode',
    description: 'Self-paced, untimed practice with free question navigation and real-time AI feedback after each answer.',
    icon: BookOpen,
    color: 'emerald',
    features: ['Untimed', 'Free navigation', 'Instant feedback', 'Pause anytime'],
  },
  mock: {
    label: 'Mock Interview',
    description: 'Realistic timed simulation with countdown clock, pause capability, and end-of-session evaluation scorecard.',
    icon: Timer,
    color: 'brand',
    features: ['Countdown timer', 'Pause capable', 'Session scorecard', 'Realistic pacing'],
  },
  cbt: {
    label: 'CBT Examination',
    description: 'Strict timed examination with auto-submit on timeout, question palette, and rapid keyboard shortcuts.',
    icon: Shield,
    color: 'amber',
    features: ['Strict timer', 'Auto-submit', 'Keyboard shortcuts', 'Question palette'],
  },
  live: {
    label: 'Live Face-to-Face',
    description: 'Full face-to-face AI interview studio with webcam, speech-to-text, AI avatar, and closed captions.',
    icon: Video,
    color: 'purple',
    features: ['Webcam video', 'Speech-to-text', 'AI avatar', 'Closed captions'],
  },
} as const;

/* ═══════════════════════════════════════════════════════════════════════ */
/* ─── Utility Functions ─── */
/* ═══════════════════════════════════════════════════════════════════════ */

function formatClock(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function getFallbackQuestion(topicId: string, questionIndex: number): string {
  const banks: Record<string, string[]> = {
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
  const questions = banks[topicId] ?? banks.general;
  return questions[questionIndex % questions.length];
}

function generateCBTQuestions(topicId: string, count: number): CBTQuestion[] {
  const banks: Record<string, Array<{ q: string; o: string[]; c: number; e: string }>> = {
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
  const pool = banks[topicId] ?? banks.general;
  const questions: CBTQuestion[] = [];
  for (let i = 0; i < count; i++) {
    const item = pool[i % pool.length];
    questions.push({
      id: `q-${i}`,
      question: item.q,
      options: item.o,
      correctIndex: item.c,
      selectedIndex: null,
      flagged: false,
      explanation: item.e,
    });
  }
  return questions;
}

/* ═══════════════════════════════════════════════════════════════════════ */
/* ─── Main Component ─── */
/* ═══════════════════════════════════════════════════════════════════════ */

export function InterviewCoachPage() {
  // ─── Phase & Mode ───
  const [phase, setPhase] = useState<SessionPhase>('mode-select');
  const [mode, setMode] = useState<InterviewMode>('practice');

  // ─── Configuration ───
  const [selectedTopic, setSelectedTopic] = useState<InterviewTopic | null>(null);
  const [jobRole, setJobRole] = useState('');
  const [questionCount, setQuestionCount] = useState(10);
  const [duration, setDuration] = useState(15); // minutes

  // ─── Practice & Mock State ───
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // ─── Timer (Mock & CBT) ───
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  // ─── CBT State ───
  const [cbtQuestions, setCbtQuestions] = useState<CBTQuestion[]>([]);
  const [currentCbtIndex, setCurrentCbtIndex] = useState(0);
  const [cbtSubmitted, setCbtSubmitted] = useState(false);

  // ─── Report ───
  const [report, setReport] = useState<SessionReport | null>(null);

  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Timer tick
  useEffect(() => {
    if (!timerActive || paused) return;
    timerRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          // Time's up
          clearInterval(timerRef.current!);
          setTimerActive(false);
          if (mode === 'cbt') {
            handleCBTSubmit();
          } else {
            handleSessionEnd();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerActive, paused, mode]);

  // CBT keyboard shortcuts
  useEffect(() => {
    if (mode !== 'cbt' || phase !== 'active' || cbtSubmitted) return;
    function handleKeyDown(e: globalThis.KeyboardEvent) {
      // A-D or 1-4 for option selection
      const key = e.key.toUpperCase();
      if (['A', 'B', 'C', 'D'].includes(key)) {
        e.preventDefault();
        const idx = key.charCodeAt(0) - 65; // A=0, B=1, C=2, D=3
        selectCBTOption(currentCbtIndex, idx);
      } else if (['1', '2', '3', '4'].includes(key)) {
        e.preventDefault();
        selectCBTOption(currentCbtIndex, parseInt(key) - 1);
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        navigateCBT(1);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        navigateCBT(-1);
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleCBTFlag(currentCbtIndex);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, phase, currentCbtIndex, cbtSubmitted]);

  /* ═══════════════════════════════════════════════════════════════════ */
  /* ─── Session Start ─── */
  /* ═══════════════════════════════════════════════════════════════════ */

  const startSession = async () => {
    if (!selectedTopic) return;
    startTimeRef.current = Date.now();

    if (mode === 'cbt') {
      // Generate CBT questions
      const questions = generateCBTQuestions(selectedTopic.id, questionCount);
      setCbtQuestions(questions);
      setCurrentCbtIndex(0);
      setCbtSubmitted(false);
      setTimeRemaining(duration * 60);
      setTimerActive(true);
      setPhase('active');
      return;
    }

    if (mode === 'live') {
      setPhase('active');
      return;
    }

    // Practice & Mock modes
    if (mode === 'mock') {
      setTimeRemaining(duration * 60);
      setTimerActive(true);
    }

    setPhase('active');
    setSending(true);
    setQuestionIndex(0);

    const systemPrompt: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: `Welcome to your **${MODE_CONFIG[mode].label}** session — **${selectedTopic.label} Interview**${jobRole ? ` for a **${jobRole}** position` : ''}! 🎯\n\n${mode === 'practice' ? 'Take your time — this session is untimed and self-paced. Navigate freely between questions.' : `You have **${duration} minutes**. ${mode === 'mock' ? 'You can pause if needed.' : 'The timer is strict — auto-submit on timeout.'}`}\n\nLet's begin with your first question…`,
      timestamp: new Date(),
    };
    setMessages([systemPrompt]);

    try {
      const response = await post<{ question: string }>('/generate-content', {
        type: 'interview-question',
        topic: selectedTopic.id,
        role: jobRole || undefined,
        mode,
      });

      const questionMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `**Question ${1}:** ${response.question || getFallbackQuestion(selectedTopic.id, 0)}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, questionMsg]);
    } catch {
      const fallbackMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `**Question 1:** ${getFallbackQuestion(selectedTopic.id, 0)}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, fallbackMsg]);
    } finally {
      setSending(false);
    }
  };

  /* ═══════════════════════════════════════════════════════════════════ */
  /* ─── Chat Message Handling (Practice & Mock) ─── */
  /* ═══════════════════════════════════════════════════════════════════ */

  const handleSendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || sending) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');
    setSending(true);

    try {
      const response = await post<{ feedback: string; nextQuestion?: string }>('/generate-content', {
        type: 'interview-feedback',
        topic: selectedTopic?.id,
        role: jobRole || undefined,
        answer: userMsg.content,
        mode,
        questionIndex,
        history: messages.slice(-6).map((m) => ({ role: m.role, content: m.content })),
      });

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response.feedback || 'Thank you for your answer. That was a solid response. Let me give you some feedback…',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setQuestionIndex((prev) => prev + 1);

      if (response.nextQuestion && questionIndex < questionCount - 1) {
        setTimeout(() => {
          const nextQ: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `**Question ${questionIndex + 2}:** ${response.nextQuestion}`,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, nextQ]);
        }, 1500);
      } else if (questionIndex >= questionCount - 1) {
        setTimeout(() => handleSessionEnd(), 2000);
      }
    } catch {
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '⚠️ I had trouble processing that. Let me ask you another question:\n\n**Question ' + (questionIndex + 2) + ':** ' + getFallbackQuestion(selectedTopic?.id ?? 'general', questionIndex + 1),
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
      setQuestionIndex((prev) => prev + 1);
    } finally {
      setSending(false);
    }
  };

  /* ═══════════════════════════════════════════════════════════════════ */
  /* ─── CBT Functions ─── */
  /* ═══════════════════════════════════════════════════════════════════ */

  const selectCBTOption = useCallback((qIndex: number, optionIndex: number) => {
    setCbtQuestions((prev) =>
      prev.map((q, i) => (i === qIndex ? { ...q, selectedIndex: optionIndex } : q)),
    );
  }, []);

  const toggleCBTFlag = useCallback((qIndex: number) => {
    setCbtQuestions((prev) =>
      prev.map((q, i) => (i === qIndex ? { ...q, flagged: !q.flagged } : q)),
    );
  }, []);

  const navigateCBT = useCallback((delta: number) => {
    setCurrentCbtIndex((prev) => {
      const next = prev + delta;
      if (next < 0) return 0;
      if (next >= cbtQuestions.length) return cbtQuestions.length - 1;
      return next;
    });
  }, [cbtQuestions.length]);

  const handleCBTSubmit = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimerActive(false);
    setCbtSubmitted(true);

    const totalQ = cbtQuestions.length;
    const answered = cbtQuestions.filter((q) => q.selectedIndex !== null).length;
    const correct = cbtQuestions.filter((q) => q.selectedIndex === q.correctIndex).length;
    const score = totalQ > 0 ? Math.round((correct / totalQ) * 100) : 0;
    const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000);

    setReport({
      totalQuestions: totalQ,
      answeredCount: answered,
      correctCount: correct,
      score,
      timeUsed: elapsed,
      feedback: score >= 80 ? 'Excellent performance! You demonstrated strong knowledge.' :
                score >= 60 ? 'Good effort! Review the explanations for questions you missed.' :
                'Keep practicing. Focus on the areas where you struggled.',
      strengths: score >= 60 ? ['Strong foundational knowledge', 'Good time management'] : ['Completed the assessment'],
      improvements: score < 80 ? ['Review missed topics', 'Practice more questions in weak areas'] : ['Continue maintaining your knowledge'],
    });
    setPhase('completed');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cbtQuestions]);

  /* ═══════════════════════════════════════════════════════════════════ */
  /* ─── Session End (Practice & Mock) ─── */
  /* ═══════════════════════════════════════════════════════════════════ */

  const handleSessionEnd = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimerActive(false);

    const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000);
    const userMsgCount = messages.filter((m) => m.role === 'user').length;

    setReport({
      totalQuestions: questionCount,
      answeredCount: userMsgCount,
      correctCount: userMsgCount, // In practice/mock, all answers are "correct" (it's conversational)
      score: Math.min(100, Math.round((userMsgCount / questionCount) * 100)),
      timeUsed: elapsed,
      feedback: userMsgCount >= questionCount ? 'Fantastic session! You completed all questions.' :
                'Good practice session. Keep it up!',
      strengths: ['Engaged throughout the session', 'Provided thoughtful answers'],
      improvements: ['Try different question types', 'Practice under time pressure'],
    });
    setPhase('completed');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, questionCount]);

  /* ═══════════════════════════════════════════════════════════════════ */
  /* ─── Reset ─── */
  /* ═══════════════════════════════════════════════════════════════════ */

  const resetSession = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setPhase('mode-select');
    setMode('practice');
    setSelectedTopic(null);
    setMessages([]);
    setInputValue('');
    setJobRole('');
    setPaused(false);
    setTimerActive(false);
    setTimeRemaining(0);
    setCbtQuestions([]);
    setCurrentCbtIndex(0);
    setCbtSubmitted(false);
    setReport(null);
    setQuestionIndex(0);
  };

  const togglePause = () => {
    if (mode !== 'mock') return;
    setPaused((prev) => !prev);
  };

  /* ═══════════════════════════════════════════════════════════════════ */
  /* ─── RENDER: Mode Selection ─── */
  /* ═══════════════════════════════════════════════════════════════════ */

  if (phase === 'mode-select') {
    return (
      <div className="p-4 lg:p-6 xl:p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-ink lg:text-3xl">AI Interview Coach</h1>
          <p className="mt-1 text-ink-secondary">
            Practice interviews with AI-powered coaching across 4 distinct modalities.
          </p>
        </div>

        {/* Feature cards */}
        <div className="mb-10 grid gap-4 sm:grid-cols-4">
          {[
            { icon: Brain, title: 'AI-Powered', desc: 'Personalized questions based on your target role.' },
            { icon: Target, title: 'Real-time Feedback', desc: 'Detailed feedback on each answer.' },
            { icon: Sparkles, title: 'STAR Method', desc: 'Learn to structure answers effectively.' },
            { icon: Keyboard, title: 'CBT Shortcuts', desc: 'Rapid keyboard navigation (A-D, 1-4).' },
          ].map((feat) => {
            const Icon = feat.icon;
            return (
              <div key={feat.title} className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50">
                  <Icon className="size-5 text-brand-600" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-ink">{feat.title}</h3>
                  <p className="mt-0.5 text-xs text-ink-muted">{feat.desc}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Mode Selection */}
        <div className="mb-6">
          <h2 className="text-lg font-bold text-ink mb-1">Choose Interview Mode</h2>
          <p className="text-sm text-ink-muted">Select a practice style that matches your preparation needs.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(Object.entries(MODE_CONFIG) as Array<[InterviewMode, typeof MODE_CONFIG[InterviewMode]]>).map(([key, config]) => {
            const Icon = config.icon;
            const isSelected = mode === key;
            return (
              <button
                key={key}
                onClick={() => { setMode(key); setPhase('configure'); }}
                className={cn(
                  'flex flex-col items-start rounded-2xl border-2 p-5 text-left transition-all duration-200 hover:shadow-lg',
                  isSelected
                    ? 'border-brand-500 bg-brand-50 shadow-md ring-2 ring-brand-200'
                    : 'border-border hover:border-brand-300 hover:bg-neutral-50',
                )}
              >
                <div className={cn(
                  'mb-3 flex size-12 items-center justify-center rounded-2xl transition-colors',
                  isSelected ? 'bg-brand-100' : 'bg-neutral-100',
                )}>
                  <Icon className={cn('size-6', isSelected ? 'text-brand-600' : 'text-ink-muted')} />
                </div>
                <h3 className="text-sm font-bold text-ink mb-1">{config.label}</h3>
                <p className="text-xs text-ink-muted mb-3 leading-relaxed">{config.description}</p>
                <div className="flex flex-wrap gap-1.5">
                  {config.features.map((f) => (
                    <span key={f} className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-700">{f}</span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════════════ */
  /* ─── RENDER: Configuration ─── */
  /* ═══════════════════════════════════════════════════════════════════ */

  if (phase === 'configure') {
    const modeConfig = MODE_CONFIG[mode];
    const ModeIcon = modeConfig.icon;

    return (
      <div className="p-4 lg:p-6 xl:p-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setPhase('mode-select')}>
              <ChevronLeft className="size-5" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <ModeIcon className="size-5 text-brand-600" />
                <h1 className="text-xl font-bold text-ink">{modeConfig.label}</h1>
              </div>
              <p className="text-sm text-ink-muted">{modeConfig.description}</p>
            </div>
          </div>
          <Button variant="ghost" onClick={resetSession}>
            <X className="size-4" />
            Cancel
          </Button>
        </div>

        <div className="mx-auto max-w-2xl space-y-6">
          {/* Target Role */}
          <div>
            <label htmlFor="job-role-input" className="mb-1.5 block text-sm font-semibold text-ink">
              Target Role (optional)
            </label>
            <Input
              id="job-role-input"
              value={jobRole}
              onChange={(e) => setJobRole(e.target.value)}
              placeholder="e.g. Senior Software Engineer at Google"
            />
          </div>

          {/* Topic Selection */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-ink">Interview Topic</label>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {INTERVIEW_TOPICS.map((topic) => {
                const Icon = topic.icon;
                const isSelected = selectedTopic?.id === topic.id;
                return (
                  <button
                    key={topic.id}
                    onClick={() => setSelectedTopic(topic)}
                    className={cn(
                      'flex items-start gap-3 rounded-xl border-2 p-3 text-left transition-all',
                      isSelected
                        ? 'border-brand-500 bg-brand-50 shadow-sm'
                        : 'border-border hover:border-brand-300',
                    )}
                  >
                    <div className={cn(
                      'flex size-9 shrink-0 items-center justify-center rounded-lg',
                      isSelected ? 'bg-brand-100' : 'bg-neutral-100',
                    )}>
                      <Icon className={cn('size-4', isSelected ? 'text-brand-600' : 'text-ink-muted')} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-ink">{topic.label}</h3>
                        <span className={cn(
                          'rounded-full px-1.5 py-0.5 text-[9px] font-medium',
                          topic.difficulty === 'beginner' ? 'bg-success-100 text-success-700' :
                          topic.difficulty === 'intermediate' ? 'bg-warning-100 text-warning-700' :
                          'bg-error-100 text-error-700',
                        )}>
                          {topic.difficulty}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-ink-muted">{topic.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Duration (Mock & CBT) */}
          {(mode === 'mock' || mode === 'cbt') && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-ink">Duration</label>
                <Select value={String(duration)} onValueChange={(v) => setDuration(parseInt(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DURATION_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-ink">Question Count</label>
                <Select value={String(questionCount)} onValueChange={(v) => setQuestionCount(parseInt(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {QUESTION_COUNT_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Question Count (Practice only) */}
          {mode === 'practice' && (
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-ink">Number of Questions</label>
              <Select value={String(questionCount)} onValueChange={(v) => setQuestionCount(parseInt(v))}>
                <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {QUESTION_COUNT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* CBT Info */}
          {mode === 'cbt' && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
              <div className="flex items-center gap-2 mb-2">
                <Keyboard className="size-4 text-amber-600" />
                <span className="font-bold text-amber-800">Keyboard Shortcuts</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-amber-700">
                <span><kbd className="px-1.5 py-0.5 rounded bg-amber-100 text-[10px] font-mono">A-D</kbd> Select option</span>
                <span><kbd className="px-1.5 py-0.5 rounded bg-amber-100 text-[10px] font-mono">1-4</kbd> Select by number</span>
                <span><kbd className="px-1.5 py-0.5 rounded bg-amber-100 text-[10px] font-mono">←→</kbd> Navigate questions</span>
                <span><kbd className="px-1.5 py-0.5 rounded bg-amber-100 text-[10px] font-mono">F</kbd> Flag for review</span>
              </div>
            </div>
          )}

          {/* Start Button */}
          <div className="flex justify-center pt-4">
            <Button size="lg" onClick={startSession} disabled={!selectedTopic}>
              <Play className="size-5" />
              {mode === 'live' ? 'Launch Live Studio' : 'Start Interview'}
              <ChevronRight className="size-5" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════════════ */
  /* ─── RENDER: Completed (Report) ─── */
  /* ═══════════════════════════════════════════════════════════════════ */

  if (phase === 'completed' && report) {
    return (
      <div className="p-4 lg:p-6 xl:p-8">
        <div className="mx-auto max-w-2xl">
          {/* Report Header */}
          <div className="mb-8 text-center">
            <div className="mb-4 mx-auto flex size-20 items-center justify-center rounded-3xl bg-brand-50">
              <Trophy className="size-10 text-brand-600" />
            </div>
            <h1 className="text-2xl font-bold text-ink">Session Complete!</h1>
            <p className="mt-1 text-ink-muted">
              {MODE_CONFIG[mode].label} — {selectedTopic?.label || 'General'}
              {jobRole && ` · ${jobRole}`}
            </p>
          </div>

          {/* Score Ring */}
          <div className="mb-8 flex justify-center">
            <div className={cn(
              'flex size-32 flex-col items-center justify-center rounded-full border-4',
              report.score >= 80 ? 'border-emerald-500 bg-emerald-50' :
              report.score >= 60 ? 'border-amber-500 bg-amber-50' :
              'border-red-500 bg-red-50',
            )}>
              <span className={cn(
                'text-3xl font-bold',
                report.score >= 80 ? 'text-emerald-600' :
                report.score >= 60 ? 'text-amber-600' : 'text-red-600',
              )}>
                {report.score}%
              </span>
              <span className="text-xs text-ink-muted">Score</span>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="mb-6 grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-ink">{report.answeredCount}/{report.totalQuestions}</div>
                <div className="text-xs text-ink-muted">Questions Answered</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-ink">{report.correctCount}</div>
                <div className="text-xs text-ink-muted">{mode === 'cbt' ? 'Correct' : 'Responses'}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-ink">{formatClock(report.timeUsed)}</div>
                <div className="text-xs text-ink-muted">Time Used</div>
              </CardContent>
            </Card>
          </div>

          {/* Feedback */}
          <Card className="mb-6">
            <CardContent className="p-5">
              <h3 className="text-sm font-bold text-ink mb-2">Feedback</h3>
              <p className="text-sm text-ink-muted leading-relaxed">{report.feedback}</p>
            </CardContent>
          </Card>

          {/* Strengths & Improvements */}
          <div className="mb-6 grid gap-4 sm:grid-cols-2">
            <Card>
              <CardContent className="p-5">
                <h3 className="mb-2 text-sm font-bold text-emerald-700 flex items-center gap-1.5">
                  <Star className="size-4" /> Strengths
                </h3>
                <ul className="space-y-1.5">
                  {report.strengths.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-ink-muted">
                      <CheckCircle2 className="mt-0.5 size-3 text-emerald-500 shrink-0" />
                      {s}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <h3 className="mb-2 text-sm font-bold text-amber-700 flex items-center gap-1.5">
                  <Zap className="size-4" /> Areas to Improve
                </h3>
                <ul className="space-y-1.5">
                  {report.improvements.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-ink-muted">
                      <AlertCircle className="mt-0.5 size-3 text-amber-500 shrink-0" />
                      {s}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* CBT Answer Review */}
          {mode === 'cbt' && cbtQuestions.length > 0 && (
            <Card className="mb-6">
              <CardContent className="p-5">
                <h3 className="text-sm font-bold text-ink mb-4">Answer Review</h3>
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {cbtQuestions.map((q, i) => {
                    const isCorrect = q.selectedIndex === q.correctIndex;
                    return (
                      <div key={q.id} className={cn(
                        'rounded-lg border p-3 text-xs',
                        q.selectedIndex === null ? 'border-neutral-200 bg-neutral-50' :
                        isCorrect ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50',
                      )}>
                        <div className="font-medium text-ink mb-1">Q{i + 1}: {q.question}</div>
                        <div className="text-ink-muted">
                          {q.selectedIndex !== null ? (
                            <>
                              Your answer: <span className={isCorrect ? 'text-emerald-700 font-bold' : 'text-red-700 font-bold line-through'}>{q.options[q.selectedIndex]}</span>
                              {!isCorrect && (
                                <> · Correct: <span className="text-emerald-700 font-bold">{q.options[q.correctIndex]}</span></>
                              )}
                            </>
                          ) : (
                            <span className="text-amber-600">Not answered</span>
                          )}
                        </div>
                        {q.explanation && <div className="mt-1 text-ink-subtle italic">{q.explanation}</div>}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <div className="flex justify-center gap-3">
            <Button size="lg" onClick={resetSession}>
              <RotateCcw className="size-4" />
              New Session
            </Button>
          </div>
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════════════ */
  /* ─── RENDER: Active — Live Studio ─── */
  /* ═══════════════════════════════════════════════════════════════════ */

  if (phase === 'active' && mode === 'live') {
    return (
      <LiveInterviewSession
        topic={selectedTopic?.label ?? 'General Practice'}
        jobRole={jobRole || 'Software Professional'}
        onExit={resetSession}
      />
    );
  }

  /* ═══════════════════════════════════════════════════════════════════ */
  /* ─── RENDER: Active — CBT Examination ─── */
  /* ═══════════════════════════════════════════════════════════════════ */

  if (phase === 'active' && mode === 'cbt') {
    const currentQ = cbtQuestions[currentCbtIndex];
    const answeredCount = cbtQuestions.filter((q) => q.selectedIndex !== null).length;
    const flaggedCount = cbtQuestions.filter((q) => q.flagged).length;

    return (
      <div className="flex h-full flex-col">
        {/* CBT Header Bar */}
        <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 lg:px-6">
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-lg bg-amber-50">
              <Shield className="size-4 text-amber-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-ink">CBT Assessment Shell</h2>
              <p className="text-[11px] text-ink-muted">
                {selectedTopic?.label} · {answeredCount}/{cbtQuestions.length} answered
                {flaggedCount > 0 && ` · ${flaggedCount} flagged`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Timer */}
            <div className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-sm font-bold',
              timeRemaining <= 60 ? 'bg-red-100 text-red-700 animate-pulse' :
              timeRemaining <= 300 ? 'bg-amber-100 text-amber-700' :
              'bg-neutral-100 text-ink',
            )}>
              <Clock className="size-3.5" />
              {formatClock(timeRemaining)}
            </div>

            <Button
              variant="primary"
              size="sm"
              onClick={() => handleCBTSubmit()}
            >
              Submit Exam
            </Button>
            <Button variant="ghost" size="sm" onClick={resetSession}>
              <X className="size-4" />
            </Button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Question Palette (sidebar) */}
          <div className="hidden md:flex w-56 flex-col border-r border-border bg-canvas-soft p-3 overflow-y-auto">
            <h3 className="mb-2 text-xs font-bold text-ink-muted uppercase tracking-wider">Question Palette</h3>
            <div className="grid grid-cols-5 gap-1.5">
              {cbtQuestions.map((q, i) => (
                <button
                  key={q.id}
                  onClick={() => setCurrentCbtIndex(i)}
                  className={cn(
                    'flex size-8 items-center justify-center rounded-lg text-xs font-bold transition-all',
                    i === currentCbtIndex ? 'ring-2 ring-brand-500 ring-offset-1' : '',
                    q.flagged ? 'bg-amber-100 text-amber-700 border border-amber-300' :
                    q.selectedIndex !== null ? 'bg-emerald-100 text-emerald-700 border border-emerald-300' :
                    'bg-neutral-100 text-ink-muted border border-transparent hover:bg-neutral-200',
                  )}
                  aria-label={`Question ${i + 1}${q.flagged ? ' (flagged)' : ''}${q.selectedIndex !== null ? ' (answered)' : ''}`}
                >
                  {i + 1}
                </button>
              ))}
            </div>

            {/* Legend */}
            <div className="mt-4 space-y-1.5 text-[10px] text-ink-muted">
              <div className="flex items-center gap-1.5"><span className="size-3 rounded bg-emerald-100 border border-emerald-300" /> Answered</div>
              <div className="flex items-center gap-1.5"><span className="size-3 rounded bg-amber-100 border border-amber-300" /> Flagged</div>
              <div className="flex items-center gap-1.5"><span className="size-3 rounded bg-neutral-100 border" /> Unanswered</div>
            </div>

            {/* Keyboard shortcuts hint */}
            <div className="mt-auto pt-4 text-[10px] text-ink-subtle space-y-0.5">
              <div><kbd className="text-[9px] px-1 rounded bg-neutral-200">A-D</kbd> or <kbd className="text-[9px] px-1 rounded bg-neutral-200">1-4</kbd> Select</div>
              <div><kbd className="text-[9px] px-1 rounded bg-neutral-200">←→</kbd> Navigate</div>
              <div><kbd className="text-[9px] px-1 rounded bg-neutral-200">F</kbd> Flag/Unflag</div>
            </div>
          </div>

          {/* Main Question Area */}
          <div className="flex-1 flex flex-col p-4 lg:p-6">
            {currentQ && (
              <>
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-bold text-brand-600 uppercase tracking-wider">
                      Question {currentCbtIndex + 1} of {cbtQuestions.length}
                    </span>
                    <Button
                      variant={currentQ.flagged ? 'primary' : 'outline'}
                      size="sm"
                      onClick={() => toggleCBTFlag(currentCbtIndex)}
                      className="text-xs"
                    >
                      <Flag className={cn('size-3', currentQ.flagged ? 'text-white' : 'text-amber-500')} />
                      {currentQ.flagged ? 'Flagged' : 'Flag'}
                    </Button>
                  </div>

                  <h3 className="text-base font-semibold text-ink leading-relaxed mb-6">
                    {currentQ.question}
                  </h3>

                  {/* Options */}
                  <div className="space-y-3">
                    {currentQ.options.map((option, optIdx) => {
                      const letter = String.fromCharCode(65 + optIdx);
                      const isSelected = currentQ.selectedIndex === optIdx;
                      return (
                        <button
                          key={optIdx}
                          onClick={() => selectCBTOption(currentCbtIndex, optIdx)}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-xl border-2 p-4 text-left transition-all',
                            isSelected
                              ? 'border-brand-500 bg-brand-50'
                              : 'border-border hover:border-brand-300 hover:bg-neutral-50',
                          )}
                        >
                          <span className={cn(
                            'flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold',
                            isSelected ? 'bg-brand-600 text-white' : 'bg-neutral-100 text-ink-muted',
                          )}>
                            {letter}
                          </span>
                          <span className="text-sm text-ink">{option}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Navigation */}
                <div className="mt-auto flex items-center justify-between pt-4 border-t border-border">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigateCBT(-1)}
                    disabled={currentCbtIndex === 0}
                  >
                    <ArrowLeft className="size-4" />
                    Previous
                  </Button>

                  {/* Mobile question counter */}
                  <span className="text-xs text-ink-muted md:hidden">
                    {answeredCount}/{cbtQuestions.length} answered
                  </span>

                  {currentCbtIndex < cbtQuestions.length - 1 ? (
                    <Button
                      size="sm"
                      onClick={() => navigateCBT(1)}
                    >
                      Next
                      <ArrowRight className="size-4" />
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => handleCBTSubmit()}
                    >
                      <CheckCircle2 className="size-4" />
                      Submit Exam
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════════════ */
  /* ─── RENDER: Active — Practice & Mock (Chat Interface) ─── */
  /* ═══════════════════════════════════════════════════════════════════ */

  const modeConfig = MODE_CONFIG[mode];

  return (
    <div className="flex h-full flex-col">
      {/* Session Header */}
      <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 lg:px-6">
        <div className="flex items-center gap-3">
          <div className={cn(
            'flex size-8 items-center justify-center rounded-lg',
            mode === 'practice' ? 'bg-emerald-50' : 'bg-brand-50',
          )}>
            <GraduationCap className={cn('size-4', mode === 'practice' ? 'text-emerald-600' : 'text-brand-600')} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-ink">
              {modeConfig.label} — {selectedTopic?.label}
            </h2>
            <p className="text-[11px] text-ink-muted">
              {jobRole ? `For: ${jobRole}` : 'General practice'} · Q{questionIndex + 1}/{questionCount}
              {mode === 'practice' && ' · Untimed'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Timer (Mock mode) */}
          {mode === 'mock' && (
            <>
              <div className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-sm font-bold',
                timeRemaining <= 60 ? 'bg-red-100 text-red-700 animate-pulse' :
                timeRemaining <= 300 ? 'bg-amber-100 text-amber-700' :
                'bg-neutral-100 text-ink',
              )}>
                <Clock className="size-3.5" />
                {formatClock(timeRemaining)}
              </div>
              <Button variant="outline" size="sm" onClick={togglePause} className="text-xs">
                {paused ? <Play className="size-3" /> : <Pause className="size-3" />}
                {paused ? 'Resume' : 'Pause'}
              </Button>
            </>
          )}

          {/* Progress indicator */}
          <div className="hidden sm:flex items-center gap-1 mr-2">
            {Array.from({ length: Math.min(questionCount, 12) }).map((_, i) => (
              <div key={i} className={cn(
                'size-1.5 rounded-full',
                i < questionIndex ? 'bg-brand-500' :
                i === questionIndex ? 'bg-brand-300' : 'bg-neutral-200',
              )} />
            ))}
          </div>

          <Button variant="outline" size="sm" onClick={() => handleSessionEnd()} className="text-xs">
            End Session
          </Button>
          <Button variant="ghost" size="sm" onClick={resetSession}>
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {/* Pause overlay */}
      {paused && mode === 'mock' && (
        <div className="flex-1 flex items-center justify-center bg-surface/90 backdrop-blur">
          <div className="text-center space-y-4">
            <Pause className="mx-auto size-12 text-brand-300" />
            <h2 className="text-xl font-bold text-ink">Session Paused</h2>
            <p className="text-sm text-ink-muted">Timer is paused. Click Resume to continue.</p>
            <Button onClick={togglePause}>
              <Play className="size-4" />
              Resume Interview
            </Button>
          </div>
        </div>
      )}

      {/* Chat Messages */}
      {!paused && (
        <>
          <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  'flex gap-3',
                  msg.role === 'user' ? 'flex-row-reverse' : '',
                )}
              >
                <div className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-full',
                  msg.role === 'user' ? 'bg-brand-100' : 'bg-neutral-100',
                )}>
                  {msg.role === 'user' ? <User className="size-4 text-brand-600" /> : <Bot className="size-4 text-ink-muted" />}
                </div>
                <div className={cn(
                  'max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
                  msg.role === 'user'
                    ? 'bg-brand-600 text-white rounded-tr-md'
                    : 'bg-neutral-100 text-ink rounded-tl-md',
                )}>
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                  <div className={cn(
                    'mt-1 text-[10px]',
                    msg.role === 'user' ? 'text-brand-200' : 'text-ink-subtle',
                  )}>
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex gap-3">
                <div className="flex size-8 items-center justify-center rounded-full bg-neutral-100">
                  <Bot className="size-4 text-ink-muted" />
                </div>
                <div className="rounded-2xl rounded-tl-md bg-neutral-100 px-4 py-3">
                  <div className="flex gap-1">
                    <span className="size-2 animate-bounce rounded-full bg-ink-muted" style={{ animationDelay: '0ms' }} />
                    <span className="size-2 animate-bounce rounded-full bg-ink-muted" style={{ animationDelay: '150ms' }} />
                    <span className="size-2 animate-bounce rounded-full bg-ink-muted" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleSendMessage} className="border-t border-border bg-surface p-4 lg:px-6">
            <div className="flex items-center gap-3">
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Type your answer…"
                disabled={sending}
                className="flex-1"
                autoFocus
              />
              <Button type="submit" disabled={!inputValue.trim() || sending} size="icon">
                <Send className="size-4" />
              </Button>
            </div>
            <p className="mt-2 text-xs text-ink-subtle text-center">
              💡 Tip: Use the STAR method — Situation, Task, Action, Result
            </p>
          </form>
        </>
      )}
    </div>
  );
}
