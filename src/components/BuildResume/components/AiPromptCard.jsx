import React, { useEffect, useRef, useState } from 'react';
import { MdCheck, MdClose, MdOutlineEditNote } from 'react-icons/md';
import { describeAssistSource } from '../ai/aiContract.js';

/**
 * AiPromptCard — the single inline AI surface. Replaces
 * WorkHistorySuggestionModal / EducationSuggestionModal / AiDraftReviewModal.
 *
 * States (driven by the useAiAssist result):
 *   trigger      — explicit button; shows what evidence will be used.
 *   loading      — quiet progress, no fake content.
 *   questions    — AI (or the deterministic gate) asks; answer → regenerate.
 *   suggestions  — per-item accept, labeled "needs your confirmation".
 *   draft        — editable draft with explicit "Use this draft"; when the
 *                  field already has content, an explicit replace warning.
 *   error        — friendly message + retry; never a dead end.
 */

function LoadingRow({ label }) {
    return (
        <div className="flex items-center gap-3 py-1" role="status">
            <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-[var(--cuba-line)] border-t-indigo-500" />
            <span className="text-sm text-[var(--cuba-ink-subtle)]">{label || 'Working from what you have written…'}</span>
        </div>
    );
}

function QuestionsPanel({ questions, onSubmit }) {
    const [answers, setAnswers] = useState({});
    useEffect(() => { setAnswers({}); }, [questions]);

    const filled = questions.filter(q => (answers[q.answerField] || '').trim()).length;

    return (
        <div className="space-y-3">
            <p className="text-[13px] leading-relaxed text-[var(--cuba-ink-muted)]">
                There isn’t enough detail in this entry yet, so instead of guessing we ask.
                Answer any of these — only what you type will be used.
            </p>
            <ol className="space-y-3">
                {questions.map((q, index) => (
                    <li key={q.id}>
                        <label htmlFor={`${q.id}-answer`} className="mb-1 block text-[13px] font-semibold text-[var(--cuba-ink-muted)]">
                            {index + 1}. {q.question}
                        </label>
                        <textarea
                            id={`${q.id}-answer`}
                            rows={2}
                            value={answers[q.answerField] || ''}
                            onChange={event => setAnswers(prev => ({ ...prev, [q.answerField]: event.target.value }))}
                            className="w-full resize-y rounded-lg border border-[var(--cuba-line)] bg-white px-3 py-2 text-sm text-[var(--cuba-ink)] shadow-2xs placeholder:text-[var(--cuba-ink-subtle)] focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
                        />
                    </li>
                ))}
            </ol>
            <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-[var(--cuba-ink-subtle)]">{filled}/{questions.length} answered — one is enough to start</p>
                <button
                    type="button"
                    disabled={filled === 0}
                    onClick={() => onSubmit(answers)}
                    className="rounded-lg bg-[var(--cuba-ink)] px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--cuba-ink)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                    Use my answers
                </button>
            </div>
        </div>
    );
}

function SuggestionsPanel({ suggestions, onAccept, metaKind }) {
    const [selected, setSelected] = useState(() => new Set(suggestions.map(s => s.id)));
    useEffect(() => { setSelected(new Set(suggestions.map(s => s.id))); }, [suggestions]);

    const toggle = id => setSelected(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });

    const chosen = suggestions.filter(s => selected.has(s.id));

    return (
        <div className="space-y-3">
            <ul className="divide-y divide-[var(--cuba-line)] rounded-lg border border-[var(--cuba-line)] bg-white">
                {suggestions.map(s => (
                    <li key={s.id} className="flex items-start gap-2.5 px-3 py-2.5">
                        <input
                            type="checkbox"
                            id={`sugg-${s.id}`}
                            checked={selected.has(s.id)}
                            onChange={() => toggle(s.id)}
                            className="mt-0.5 h-4 w-4 shrink-0 rounded border-[var(--cuba-line-strong)] text-indigo-600 focus:ring-indigo-500"
                        />
                        <label htmlFor={`sugg-${s.id}`} className="min-w-0 cursor-pointer">
                            <span className="block text-sm leading-snug text-[var(--cuba-ink)]">{s.text}</span>
                            {s.basis && s.basis !== 'target role' ? (
                                <span className="mt-0.5 block truncate text-xs text-[var(--cuba-ink-subtle)]" title={s.basis}>
                                    based on: “{s.basis}”
                                </span>
                            ) : null}
                        </label>
                    </li>
                ))}
            </ul>
            <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-[var(--cuba-ink-subtle)]">Only add what is true for you — you can remove any of it later.</p>
                <button
                    type="button"
                    disabled={chosen.length === 0}
                    onClick={() => onAccept(chosen)}
                    className="shrink-0 rounded-lg bg-[var(--cuba-ink)] px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--cuba-ink)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                    Add {chosen.length > 0 ? `selected (${chosen.length})` : 'selected'}
                </button>
            </div>
        </div>
    );
}

function DraftPanel({ draft, existing, onUseDraft }) {
    const [text, setText] = useState(draft.text);
    useEffect(() => { setText(draft.text); }, [draft]);
    const willReplace = String(existing || '').trim().length > 0 && text !== String(existing || '').trim();

    return (
        <div className="space-y-3">
            <textarea
                value={text}
                onChange={event => setText(event.target.value)}
                rows={Math.min(10, Math.max(4, Math.ceil(text.length / 90)))}
                aria-label="Draft (editable)"
                className="w-full resize-y rounded-lg border border-[var(--cuba-line)] bg-white px-3 py-2.5 text-sm leading-relaxed text-[var(--cuba-ink)] shadow-2xs focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
            />
            {willReplace ? (
                <p className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">
                    Using this draft replaces what is currently in this field.
                </p>
            ) : null}
            <div className="flex justify-end">
                <button
                    type="button"
                    disabled={!text.trim()}
                    onClick={() => onUseDraft(text)}
                    className="inline-flex items-center gap-2 rounded-lg bg-[var(--cuba-ink)] px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--cuba-ink)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                    <MdCheck className="w-4 h-4" />
                    Use this draft
                </button>
            </div>
        </div>
    );
}

export default function AiPromptCard({
    title = 'Improve with AI',
    buttonLabel = 'Improve with AI',
    evidenceHint = 'Uses only what you have written — nothing is invented.',
    status = 'idle',
    result = null,
    error = null,
    disabled = false,
    disabledReason = '',
    draftExisting = '',
    onRun,
    onAnswers,
    onAccept,
    onUseDraft,
    onDismiss,
}) {
    const panelRef = useRef(null);

    if (status === 'loading') {
        return (
            <div ref={panelRef} className="card bs-card-executive rounded-xl border border-[var(--cuba-line)] bg-[var(--cuba-canvas)]/60 px-4 py-3.5" aria-busy="true">
                <LoadingRow />
            </div>
        );
    }

    if (status === 'error') {
        return (
            <div className="rounded-xl border border-rose-200 bg-rose-50/60 px-4 py-3.5">
                <div className="flex items-start justify-between gap-3">
                    <p className="text-sm leading-relaxed text-rose-700">{error || 'Something went wrong. Your content is unaffected.'}</p>
                    <div className="flex shrink-0 gap-2">
                        <button type="button" onClick={onRun} className="text-xs font-bold text-rose-700 underline underline-offset-2 hover:text-rose-900">
                            Try again
                        </button>
                        {onDismiss && (
                            <button type="button" onClick={onDismiss} aria-label="Dismiss" className="text-rose-400 hover:text-rose-600">
                                <MdClose className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    if (result) {
        const { kind } = result;
        return (
            <div ref={panelRef} className="rounded-xl border border-indigo-100 bg-indigo-50/40 px-4 py-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h3 className="flex items-center gap-1.5 text-sm font-bold text-[var(--cuba-ink)]">
                            <MdOutlineEditNote className="w-4 h-4 text-indigo-500" />
                            {title}
                        </h3>
                        <p className="mt-0.5 text-xs font-medium text-indigo-700/80">{describeAssistSource(result)}</p>
                    </div>
                    {onDismiss && (
                        <button type="button" onClick={onDismiss} aria-label="Dismiss AI suggestions" className="shrink-0 rounded-md p-1 text-[var(--cuba-ink-subtle)] transition-colors hover:bg-white hover:text-[var(--cuba-ink-muted)]">
                            <MdClose className="w-4 h-4" />
                        </button>
                    )}
                </div>

                {kind === 'questions' && <QuestionsPanel questions={result.questions} onSubmit={onAnswers} />}
                {kind === 'suggestions' && <SuggestionsPanel suggestions={result.suggestions} onAccept={onAccept} />}
                {kind === 'draft' && <DraftPanel draft={result.draft} existing={draftExisting} onUseDraft={onUseDraft} />}
                {kind === 'empty' && (
                    <div className="space-y-2">
                        <p className="text-sm leading-relaxed text-[var(--cuba-ink-muted)]">{result.note || 'Nothing to suggest yet — add a little detail and try again.'}</p>
                        <button type="button" onClick={onRun} className="text-xs font-bold text-indigo-700 underline underline-offset-2 hover:text-indigo-900">
                            Try again
                        </button>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--cuba-line)] bg-white px-4 py-3 shadow-2xs">
            <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--cuba-ink)]">{title}</p>
                <p className="text-xs text-[var(--cuba-ink-subtle)]">{disabled ? disabledReason : evidenceHint}</p>
            </div>
            <button
                type="button"
                onClick={onRun}
                disabled={disabled}
                className="shrink-0 rounded-lg border border-[var(--cuba-line-strong)] bg-white px-3.5 py-2 text-sm font-semibold text-[var(--cuba-ink)] shadow-xs transition-colors hover:bg-[var(--cuba-canvas)] focus:outline-none focus:ring-2 focus:ring-[var(--cuba-line-strong)] disabled:cursor-not-allowed disabled:opacity-50"
            >
                {buttonLabel}
            </button>
        </div>
    );
}
