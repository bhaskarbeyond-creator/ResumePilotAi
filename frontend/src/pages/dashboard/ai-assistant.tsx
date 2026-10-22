/**
 * AI Writing Assistant — grounded rewrites and suggestions.
 *
 * Route: /dashboard/ai (splat). `?tool=bullet|summary|skills` keeps the chosen
 * tool in the URL so refresh and shared links restore it.
 *
 * Every result comes from POST /api/generate-content. The server only rewords
 * facts the candidate typed; when AI is unavailable it returns the candidate's
 * own text flagged `aiUnavailable`, which this page reports as "unavailable"
 * and never shows as a result. Tools without a backend operation (interview
 * answers, LinkedIn pitches) are not offered.
 */
import { useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle, ClipboardCopy, FileText, History, ListChecks, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useRestoreFocusWhenIdle } from '@/hooks/use-restore-focus-when-idle';
import { cn } from '@/lib/utils';
import { AI_TONES, runContentOperation, splitList, type AiOperation, type AiOutcome, type AiTone } from '@/lib/ai-content';

type ToolId = 'bullet' | 'summary' | 'skills';
type ResultOutcome = Extract<AiOutcome, { kind: 'text' | 'skills' }>;

const TOOLS: ReadonlyArray<{
  id: ToolId;
  operation: AiOperation;
  name: string;
  description: string;
  icon: typeof Sparkles;
  resultTitle: string;
}> = [
  {
    id: 'bullet',
    operation: 'enhance-single-bullet',
    name: 'Improve a resume bullet',
    description: 'Reword one bullet more clearly. Your facts and numbers stay as they are.',
    icon: Wand2,
    resultTitle: 'Suggested bullet',
  },
  {
    id: 'summary',
    operation: 'generate-summary',
    name: 'Professional summary',
    description: 'Draft a short summary from your own notes and experience.',
    icon: FileText,
    resultTitle: 'Suggested summary',
  },
  {
    id: 'skills',
    operation: 'generate-skills',
    name: 'Skill suggestions',
    description: 'Skills commonly expected for a target role, for you to review.',
    icon: ListChecks,
    resultTitle: 'Suggested skills',
  },
];

interface FormState {
  bullet: string;
  role: string;
  notes: string;
  skills: string;
  tone: AiTone;
}
type FieldKey = Exclude<keyof FormState, 'tone'>;

interface HistoryItem {
  id: number;
  tool: ToolId;
  label: string;
  outcome: ResultOutcome;
  time: string;
}

const isToolId = (value: string | null): value is ToolId => value === 'bullet' || value === 'summary' || value === 'skills';
const fieldId = (field: FieldKey) => `ai-${field}`;

function validate(tool: ToolId, form: FormState): { field: FieldKey; message: string } | null {
  if (tool === 'bullet' && !form.bullet.trim()) return { field: 'bullet', message: 'Enter the bullet you want to improve.' };
  if (tool === 'summary' && !form.notes.trim() && !form.role.trim() && !form.skills.trim()) {
    return { field: 'notes', message: 'Add notes about your experience, a target role or key skills first.' };
  }
  if (tool === 'skills' && !form.role.trim()) return { field: 'role', message: 'Enter the target role.' };
  return null;
}

function payloadFor(tool: ToolId, form: FormState): Record<string, unknown> {
  const role = form.role.trim();
  if (tool === 'bullet') return { bullet: form.bullet.trim(), ...(role ? { jobTitle: role } : {}), tone: form.tone };
  if (tool === 'summary') return { existingText: form.notes.trim(), ...(role ? { jobTitle: role } : {}), skills: splitList(form.skills), tone: form.tone };
  return { jobTitle: role, context: { facts: { skills: splitList(form.skills) } } };
}

function inputLabel(tool: ToolId, form: FormState): string {
  const source = tool === 'bullet' ? form.bullet : tool === 'summary' ? form.notes || form.role : form.role;
  const clean = source.replace(/\s+/g, ' ').trim();
  return clean.length > 60 ? `${clean.slice(0, 57)}…` : clean;
}

const resultText = (outcome: ResultOutcome) => (outcome.kind === 'text' ? outcome.text : outcome.skills.map((skill) => skill.name).join('\n'));

export function AIAssistantPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const toolParam = searchParams.get('tool');
  const toolId: ToolId = isToolId(toolParam) ? toolParam : 'bullet';
  const tool = TOOLS.find((item) => item.id === toolId) ?? TOOLS[0];

  const [form, setForm] = useState<FormState>({ bullet: '', role: '', notes: '', skills: '', tone: 'balanced' });
  const [fieldError, setFieldError] = useState<{ field: FieldKey; message: string } | null>(null);
  const [outcome, setOutcome] = useState<{ tool: ToolId; value: AiOutcome } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'done' | 'failed'>('idle');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const historyId = useRef(0);
  const generateRef = useRef<HTMLButtonElement>(null);
  useRestoreFocusWhenIdle(busy, generateRef);

  const visible = outcome && outcome.tool === toolId ? outcome.value : null;

  const update = (field: keyof FormState, value: string) => {
    setForm((previous) => ({ ...previous, [field]: value }));
    if (fieldError && (fieldError.field === field || (toolId === 'summary' && field !== 'tone'))) setFieldError(null);
  };

  const selectTool = (id: ToolId) => {
    const next = new URLSearchParams(searchParams);
    if (id === 'bullet') next.delete('tool');
    else next.set('tool', id);
    setSearchParams(next, { replace: true });
    setFieldError(null);
    setCopyState('idle');
  };

  const generate = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const invalid = validate(toolId, form);
    if (invalid) {
      setFieldError(invalid);
      setOutcome(null);
      window.requestAnimationFrame(() => document.getElementById(fieldId(invalid.field))?.focus());
      return;
    }
    setFieldError(null);
    setCopyState('idle');
    setOutcome(null);
    setBusy(true);
    try {
      const value = await runContentOperation(tool.operation, payloadFor(toolId, form));
      setOutcome({ tool: toolId, value });
      if (value.kind === 'text' || value.kind === 'skills') {
        const id = ++historyId.current;
        const item: HistoryItem = {
          id,
          tool: toolId,
          label: inputLabel(toolId, form),
          outcome: value,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setHistory((previous) => [item, ...previous].slice(0, 5));
      }
    } finally {
      setBusy(false);
    }
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyState('done');
    } catch {
      setCopyState('failed');
    }
  };

  const statusText = busy
    ? 'Generating…'
    : !visible
      ? ''
      : visible.kind === 'text' || visible.kind === 'skills' || visible.kind === 'certifications' || visible.kind === 'suggestions'
        ? 'Suggestion ready. Review it before using it.'
        : visible.kind === 'questions'
          ? 'More detail is needed before a summary can be written. See the questions below.'
          : 'message' in visible ? visible.message : '';
  const statusIsProblem = !!visible && (visible.kind === 'unavailable' || visible.kind === 'rejected' || visible.kind === 'rate-limited' || visible.kind === 'error');

  const fieldProps = (field: FieldKey, hint?: string) => {
    const error = fieldError?.field === field ? fieldError.message : null;
    return {
      id: fieldId(field),
      value: form[field],
      error: Boolean(error),
      'aria-describedby': error ? `${fieldId(field)}-error` : hint ? `${fieldId(field)}-hint` : undefined,
      onChange: (event: { target: { value: string } }) => update(field, event.target.value),
    };
  };
  const fieldMessage = (field: FieldKey, hint?: string) => {
    if (fieldError?.field === field) return <p id={`${fieldId(field)}-error`} className="mt-1 text-xs text-error-700">{fieldError.message}</p>;
    return hint ? <p id={`${fieldId(field)}-hint`} className="mt-1 text-xs text-ink-muted">{hint}</p> : null;
  };

  return (
    <div className="mx-auto w-full max-w-6xl p-4 sm:p-6 lg:p-8">
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-ink">
          <Sparkles className="size-6 shrink-0 text-brand-600" aria-hidden="true" />
          AI Writing Assistant
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-muted">
          Uses only what you type. If a detail is not in your input, it will not appear in the result. When AI is
          unavailable, nothing is generated.
        </p>
      </header>

      <fieldset className="mb-6 min-w-0">
        <legend className="mb-2 text-sm font-semibold text-ink">What do you want to write?</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {TOOLS.map((item) => {
            const Icon = item.icon;
            const selected = item.id === toolId;
            return (
              <label
                key={item.id}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand-500',
                  selected ? 'border-brand-500 bg-brand-50' : 'border-border bg-surface hover:bg-canvas',
                )}
              >
                <input
                  type="radio"
                  name="ai-tool"
                  value={item.id}
                  checked={selected}
                  onChange={() => selectTool(item.id)}
                  className="sr-only"
                />
                <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', selected ? 'bg-brand-600 text-white' : 'bg-canvas text-ink-muted')}>
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink">{item.name}</span>
                  <span className="mt-0.5 block text-xs text-ink-muted">{item.description}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-6 lg:grid-cols-2">
        <form
          onSubmit={(event) => void generate(event)}
          noValidate
          aria-label={tool.name}
          className="min-w-0 space-y-4 rounded-2xl border border-border bg-surface p-4 sm:p-5"
        >
          <h2 className="text-base font-semibold text-ink">{tool.name}</h2>

          {toolId === 'bullet' && (
            <div className="min-w-0">
              <label htmlFor={fieldId('bullet')} className="mb-1 block text-sm font-medium text-ink">Bullet to improve</label>
              <Textarea {...fieldProps('bullet', 'Paste one bullet from your resume, including any real numbers.')} rows={4} maxLength={1000} className="resize-y" />
              {fieldMessage('bullet', 'Paste one bullet from your resume, including any real numbers.')}
            </div>
          )}

          {toolId === 'summary' && (
            <>
              <div className="min-w-0">
                <label htmlFor={fieldId('notes')} className="mb-1 block text-sm font-medium text-ink">Your notes or current summary</label>
                <Textarea {...fieldProps('notes', 'Years of experience, main skills and one or two results, in your own words.')} rows={6} maxLength={4000} className="resize-y" />
                {fieldMessage('notes', 'Years of experience, main skills and one or two results, in your own words.')}
              </div>
              <div className="min-w-0">
                <label htmlFor={fieldId('skills')} className="mb-1 block text-sm font-medium text-ink">Key skills (optional)</label>
                <Input {...fieldProps('skills', 'Separate skills with commas.')} maxLength={1000} />
                {fieldMessage('skills', 'Separate skills with commas.')}
              </div>
            </>
          )}

          <div className="min-w-0">
            <label htmlFor={fieldId('role')} className="mb-1 block text-sm font-medium text-ink">
              {toolId === 'skills' ? 'Target role' : 'Target role (optional)'}
            </label>
            <Input {...fieldProps('role')} maxLength={200} autoComplete="off" />
            {fieldMessage('role')}
          </div>

          {toolId === 'skills' && (
            <div className="min-w-0">
              <label htmlFor={fieldId('skills')} className="mb-1 block text-sm font-medium text-ink">Skills you already have (optional)</label>
              <Input {...fieldProps('skills', 'Separate skills with commas. Suggestions are checked against them.')} maxLength={1000} />
              {fieldMessage('skills', 'Separate skills with commas. Suggestions are checked against them.')}
            </div>
          )}

          {toolId !== 'skills' && (
            <fieldset className="min-w-0">
              <legend className="mb-2 text-sm font-medium text-ink">Tone</legend>
              <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 xl:grid-cols-3">
                {AI_TONES.map((option) => (
                  <label
                    key={option.value}
                    className={cn(
                      'flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand-500',
                      form.tone === option.value ? 'border-brand-500 bg-brand-50' : 'border-border hover:bg-canvas',
                    )}
                  >
                    <input
                      type="radio"
                      name="ai-tone"
                      value={option.value}
                      checked={form.tone === option.value}
                      onChange={() => update('tone', option.value)}
                      className="mt-0.5 accent-brand-600"
                    />
                    <span className="min-w-0">
                      <span className="block font-medium text-ink">{option.label}</span>
                      <span className="block text-xs text-ink-muted">{option.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <Button ref={generateRef} type="submit" loading={busy} className="w-full sm:w-auto">
            <Sparkles aria-hidden="true" /> {busy ? 'Generating…' : 'Generate'}
          </Button>
        </form>

        <div className="min-w-0 space-y-6">
          <section aria-labelledby="ai-result-heading" className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
            <h2 id="ai-result-heading" className="text-base font-semibold text-ink">{tool.resultTitle}</h2>
            <div role="status" aria-live="polite" aria-busy={busy}>
              {statusText && (
                <p className={cn(
                  'mt-3 flex items-start gap-2 rounded-xl p-3 text-sm',
                  statusIsProblem ? 'border border-error-200 bg-error-50 text-error-800' : 'bg-canvas text-ink-secondary',
                )}>
                  {statusIsProblem && <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
                  <span className="min-w-0 break-words">{statusText}</span>
                </p>
              )}
            </div>

            {!busy && !visible && (
              <p className="mt-3 text-sm text-ink-muted">Results appear here. They are suggestions to review, not final text.</p>
            )}

            {visible?.kind === 'text' && (
              <div className="mt-3">
                <p className="whitespace-pre-wrap break-words rounded-xl border border-border bg-canvas p-4 text-sm leading-relaxed text-ink" data-testid="ai-result-text">
                  {visible.text}
                </p>
              </div>
            )}

            {visible?.kind === 'skills' && (
              <ul className="mt-3 space-y-2" aria-label="Suggested skills">
                {visible.skills.map((skill) => (
                  <li key={skill.name} className="rounded-lg border border-border bg-canvas px-3 py-2 text-sm">
                    <span className="font-medium text-ink">{skill.name}</span>
                    {skill.basis && <span className="mt-0.5 block text-xs text-ink-muted">Why: {skill.basis}</span>}
                  </li>
                ))}
              </ul>
            )}

            {visible?.kind === 'questions' && (
              <div className="mt-3">
                <ol className="list-decimal space-y-1 pl-5 text-sm text-ink" aria-label="Questions to answer in your notes">
                  {visible.questions.map((question) => <li key={question}>{question}</li>)}
                </ol>
                <p className="mt-2 text-xs text-ink-muted">Add your answers to the notes field, then generate again.</p>
              </div>
            )}

            {(visible?.kind === 'text' || visible?.kind === 'skills') && (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Button variant="outline" size="sm" onClick={() => void copy(resultText(visible))}>
                  <ClipboardCopy aria-hidden="true" /> Copy
                </Button>
                <span aria-live="polite" className="text-xs text-ink-muted">
                  {copyState === 'done' ? 'Copied to the clipboard.' : copyState === 'failed' ? 'Copy failed. Select the text and copy it manually.' : ''}
                </span>
              </div>
            )}
          </section>

          <section aria-labelledby="ai-history-heading" className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 id="ai-history-heading" className="flex items-center gap-2 text-base font-semibold text-ink">
                <History className="size-4 text-ink-muted" aria-hidden="true" /> Recent results
              </h2>
              {history.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setHistory([])}>
                  <Trash2 aria-hidden="true" /> Clear
                </Button>
              )}
            </div>
            <p className="mt-1 text-xs text-ink-muted">Kept for this visit only. Unavailable or failed requests are never listed.</p>
            {history.length === 0 ? (
              <p className="mt-3 text-sm text-ink-muted">No results yet.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {history.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => {
                        selectTool(item.tool);
                        setOutcome({ tool: item.tool, value: item.outcome });
                      }}
                      className="w-full rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand-500"
                    >
                      <span className="block truncate font-medium text-ink">{item.label || 'Untitled input'}</span>
                      <span className="text-xs text-ink-muted">
                        {TOOLS.find((entry) => entry.id === item.tool)?.name} · {item.time}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
