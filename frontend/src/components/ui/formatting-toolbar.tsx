/**
 * FormattingToolbar Component
 *
 * Lightweight rich-text / markdown formatting toolbar for Experience & Summary inputs.
 * Supports bullet list insertion, bold, italic, numbered lists, and powerful action verbs.
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Sparkles,
} from 'lucide-react';

interface FormattingToolbarProps {
  textareaRef?: React.RefObject<HTMLTextAreaElement>;
  value: string;
  onChange: (val: string) => void;
  onOpenAiCopilot?: () => void;
  className?: string;
}

const POWER_ACTION_VERBS = [
  'Spearheaded',
  'Architected',
  'Accelerated',
  'Engineered',
  'Orchestrated',
  'Streamlined',
  'Maximized',
  'Delivered',
  'Automated',
  'Pioneered',
];

export function FormattingToolbar({
  textareaRef,
  value,
  onChange,
  onOpenAiCopilot,
  className = '',
}: FormattingToolbarProps) {
  const insertFormatting = (prefix: string, suffix: string = '') => {
    if (!textareaRef?.current) {
      // Fallback if ref isn't passed
      onChange(`${value}\n${prefix} ${suffix}`);
      return;
    }

    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.substring(start, end);

    let replacement = '';
    if (selected) {
      replacement = `${prefix}${selected}${suffix}`;
    } else {
      replacement = `${prefix} `;
    }

    const nextValue = value.substring(0, start) + replacement + value.substring(end);
    onChange(nextValue);

    // Reposition cursor
    setTimeout(() => {
      textarea.focus();
      const newPos = start + replacement.length;
      textarea.setSelectionRange(newPos, newPos);
    }, 10);
  };

  const handleAddBullet = () => {
    if (!textareaRef?.current) {
      onChange(value ? `${value}\n• ` : '• ');
      return;
    }
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.substring(start, end);

    let replacement = '';
    if (selected.includes('\n')) {
      replacement = selected
        .split('\n')
        .map((line) => (line.trim().startsWith('•') ? line : `• ${line}`))
        .join('\n');
    } else {
      replacement = selected ? `• ${selected}` : '\n• ';
    }

    const nextValue = value.substring(0, start) + replacement + value.substring(end);
    onChange(nextValue);
    setTimeout(() => {
      textarea.focus();
      const newPos = start + replacement.length;
      textarea.setSelectionRange(newPos, newPos);
    }, 10);
  };

  const handleInsertVerb = (verb: string) => {
    insertFormatting(verb + ' ');
  };

  return (
    <div className={`flex flex-wrap items-center justify-between gap-1.5 rounded-t-lg border border-b-0 border-border bg-canvas-soft px-2.5 py-1.5 text-xs ${className}`}>
      {/* Format actions */}
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-7 rounded hover:bg-neutral-200"
          onClick={() => insertFormatting('**', '**')}
          title="Bold (**text**)"
        >
          <Bold className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-7 rounded hover:bg-neutral-200"
          onClick={() => insertFormatting('*', '*')}
          title="Italic (*text*)"
        >
          <Italic className="size-3.5" />
        </Button>
        <div className="h-4 w-px bg-border mx-0.5" />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-7 rounded hover:bg-neutral-200"
          onClick={handleAddBullet}
          title="Insert Bullet Point (• )"
        >
          <List className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-7 rounded hover:bg-neutral-200"
          onClick={() => insertFormatting('1. ')}
          title="Numbered List"
        >
          <ListOrdered className="size-3.5" />
        </Button>
      </div>

      {/* Action Verbs Quick Helpers & AI Copilot Trigger */}
      <div className="flex items-center gap-1.5 text-xs text-ink-muted">
        {onOpenAiCopilot && (
          <button
            type="button"
            onClick={onOpenAiCopilot}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold text-xs text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200/90 transition-all shadow-2xs cursor-pointer active:scale-95"
            title="Open AI Role Copilot to suggest bullet points"
          >
            <Sparkles className="size-2.5 text-purple-600" />
            <span>Suggest with AI</span>
          </button>
        )}
        <span className="hidden md:inline font-medium text-xs uppercase tracking-wider text-ink-muted">Verbs:</span>
        <div className="flex items-center gap-1 overflow-x-auto max-w-[260px] sm:max-w-none">
          {POWER_ACTION_VERBS.slice(0, 4).map((verb) => (
            <button
              key={verb}
              type="button"
              onClick={() => handleInsertVerb(verb)}
              className="rounded bg-surface px-1.5 py-0.5 font-medium text-xs text-ink-secondary hover:bg-brand-50 hover:text-brand-700 border border-border/70 transition-colors"
            >
              +{verb}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
