/**
 * Interview Coach Page
 *
 * AI-powered interview preparation with session management,
 * topic selection, and real-time feedback.
 */

import { useState, useEffect, useCallback, useRef, type FormEvent } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageSpinner } from '@/components/ui/loading';
import { post, normalizeError } from '@/lib/api-client';
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
  Lightbulb,
  BookOpen,
  Code2,
  Users,
  Briefcase,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

interface InterviewTopic {
  id: string;
  label: string;
  description: string;
  icon: typeof GraduationCap;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
}

const interviewTopics: InterviewTopic[] = [
  { id: 'behavioral', label: 'Behavioral', description: 'STAR method, leadership, teamwork', icon: Users, difficulty: 'beginner' },
  { id: 'technical', label: 'Technical', description: 'System design, problem-solving', icon: Code2, difficulty: 'intermediate' },
  { id: 'situational', label: 'Situational', description: 'Hypothetical workplace scenarios', icon: Lightbulb, difficulty: 'beginner' },
  { id: 'case-study', label: 'Case Study', description: 'Business analysis and strategy', icon: BookOpen, difficulty: 'advanced' },
  { id: 'competency', label: 'Competency', description: 'Skills and experience assessment', icon: Target, difficulty: 'intermediate' },
  { id: 'general', label: 'General', description: 'Common interview questions', icon: Briefcase, difficulty: 'beginner' },
];

type SessionState = 'idle' | 'selecting' | 'active' | 'completed';

export function InterviewCoachPage() {
  const [sessionState, setSessionState] = useState<SessionState>('idle');
  const [selectedTopic, setSelectedTopic] = useState<InterviewTopic | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const [jobRole, setJobRole] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const startSession = async () => {
    if (!selectedTopic) return;
    setSessionState('active');
    setSending(true);

    const systemPrompt: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: `Welcome to your **${selectedTopic.label} Interview** practice session${jobRole ? ` for a **${jobRole}** position` : ''}! 🎯\n\nI'll ask you interview questions and provide detailed feedback on your responses. Answer as you would in a real interview.\n\nLet's begin with your first question…`,
      timestamp: new Date(),
    };
    setMessages([systemPrompt]);

    try {
      const response = await post<{ question: string }>('/generate-content', {
        type: 'interview-question',
        topic: selectedTopic.id,
        role: jobRole || undefined,
      });

      const questionMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response.question || `Tell me about a time when you demonstrated strong ${selectedTopic.label.toLowerCase()} skills. What was the situation, what did you do, and what was the outcome?`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, questionMsg]);
    } catch {
      const fallbackMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: getFallbackQuestion(selectedTopic.id),
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, fallbackMsg]);
    } finally {
      setSending(false);
    }
  };

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
        history: messages.slice(-6).map((m) => ({ role: m.role, content: m.content })),
      });

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response.feedback || 'Thank you for your answer. That was a solid response. Let me give you some feedback and then we\'ll move to the next question.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      if (response.nextQuestion) {
        setTimeout(() => {
          const nextQ: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: response.nextQuestion!,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, nextQ]);
        }, 1500);
      }
    } catch (err) {
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '⚠️ I had trouble processing that. Let me ask you another question instead:\n\n' + getFallbackQuestion(selectedTopic?.id ?? 'general'),
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setSending(false);
    }
  };

  const resetSession = () => {
    setSessionState('idle');
    setSelectedTopic(null);
    setMessages([]);
    setInputValue('');
    setJobRole('');
  };

  // ─── Idle: Welcome screen ───
  if (sessionState === 'idle') {
    return (
      <div className="p-4 lg:p-6 xl:p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-ink lg:text-3xl">AI Interview Coach</h1>
          <p className="mt-1 text-ink-secondary">Practice interviews with AI-powered coaching and real-time feedback.</p>
        </div>

        {/* Feature cards */}
        <div className="mb-10 grid gap-4 sm:grid-cols-3">
          {[
            { icon: Brain, title: 'AI-Powered', desc: 'Get personalized questions based on your target role.' },
            { icon: Target, title: 'Real-time Feedback', desc: 'Receive detailed feedback on each answer.' },
            { icon: Sparkles, title: 'STAR Method', desc: 'Learn to structure answers using the STAR framework.' },
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

        <div className="mx-auto max-w-lg text-center">
          <div className="mb-6 flex size-20 mx-auto items-center justify-center rounded-3xl bg-brand-50">
            <GraduationCap className="size-10 text-brand-600" />
          </div>
          <h2 className="text-xl font-bold text-ink">Ready to practice?</h2>
          <p className="mt-2 text-ink-muted">Choose a topic and start a mock interview session.</p>
          <Button className="mt-6" size="lg" onClick={() => setSessionState('selecting')}>
            <Play className="size-5" />
            Start Practice Session
          </Button>
        </div>
      </div>
    );
  }

  // ─── Topic selection ───
  if (sessionState === 'selecting') {
    return (
      <div className="p-4 lg:p-6 xl:p-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-ink">Choose Your Topic</h1>
            <p className="mt-1 text-sm text-ink-muted">Select an interview category to practice.</p>
          </div>
          <Button variant="ghost" onClick={resetSession}>
            <X className="size-4" />
            Cancel
          </Button>
        </div>

        {/* Optional: Target role */}
        <div className="mb-6 max-w-md">
          <label htmlFor="job-role-input" className="mb-1.5 block text-sm font-medium text-ink">Target role (optional)</label>
          <Input
            id="job-role-input"
            value={jobRole}
            onChange={(e) => setJobRole(e.target.value)}
            placeholder="e.g. Senior Software Engineer at Google"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {interviewTopics.map((topic) => {
            const Icon = topic.icon;
            const isSelected = selectedTopic?.id === topic.id;
            return (
              <button
                key={topic.id}
                onClick={() => setSelectedTopic(topic)}
                className={cn(
                  'flex items-start gap-4 rounded-xl border-2 p-4 text-left transition-all',
                  isSelected
                    ? 'border-brand-500 bg-brand-50 shadow-md'
                    : 'border-border hover:border-brand-300 hover:bg-neutral-50',
                )}
              >
                <div className={cn(
                  'flex size-10 shrink-0 items-center justify-center rounded-xl',
                  isSelected ? 'bg-brand-100' : 'bg-neutral-100',
                )}>
                  <Icon className={cn('size-5', isSelected ? 'text-brand-600' : 'text-ink-muted')} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-ink">{topic.label}</h3>
                    <span className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-medium',
                      topic.difficulty === 'beginner' ? 'bg-success-100 text-success-700' :
                      topic.difficulty === 'intermediate' ? 'bg-warning-100 text-warning-700' :
                      'bg-error-100 text-error-700',
                    )}>
                      {topic.difficulty}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-ink-muted">{topic.description}</p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-8 flex justify-center">
          <Button size="lg" onClick={startSession} disabled={!selectedTopic}>
            Start Interview
            <ChevronRight className="size-5" />
          </Button>
        </div>
      </div>
    );
  }

  // ─── Active session: Chat ───
  return (
    <div className="flex h-full flex-col">
      {/* Session header */}
      <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 lg:px-6">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-lg bg-brand-50">
            <GraduationCap className="size-4 text-brand-600" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-ink">{selectedTopic?.label} Interview</h2>
            <p className="text-xs text-ink-muted">
              {jobRole ? `For: ${jobRole}` : 'General practice'} · {messages.filter((m) => m.role === 'user').length} answers
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={resetSession}>
            <RotateCcw className="size-3.5" />
            New Session
          </Button>
        </div>
      </div>

      {/* Chat messages */}
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
    </div>
  );
}

function getFallbackQuestion(topicId: string): string {
  const questions: Record<string, string> = {
    behavioral: 'Tell me about a time when you had to work with a difficult team member. How did you handle the situation and what was the outcome?',
    technical: 'How would you design a scalable URL shortening service like bit.ly? Walk me through the high-level architecture and key trade-offs.',
    situational: 'Imagine you discover a critical bug in production right before a major release. What steps would you take to address it?',
    'case-study': 'A mid-size e-commerce company is experiencing declining customer retention. How would you approach diagnosing and solving this problem?',
    competency: 'Describe a project where you had to learn a new technology or skill quickly. How did you approach the learning process?',
    general: 'Walk me through your background and tell me why you\'re interested in this role. What makes you a strong candidate?',
  };
  return questions[topicId] ?? questions.general;
}
