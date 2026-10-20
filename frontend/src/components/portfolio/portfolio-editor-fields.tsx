/**
 * Form building blocks for the portfolio builder: labelled text fields and a
 * repeatable-entry editor (experience, education, projects, skills).
 *
 * Every control has a visible label. Each entry is a fieldset whose legend names
 * it ("Experience 2"), so a remove button can say which entry it removes. Adding
 * an entry moves focus to its first field. Removing one returns focus to the Add
 * button and announces the change.
 */
import { useEffect, useId, useRef, useState, type Ref } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  maxLength?: number;
  className?: string;
}

function describedBy(...ids: Array<string | false | undefined>) {
  const value = ids.filter(Boolean).join(' ');
  return value || undefined;
}

export function TextField({ label, value, onChange, placeholder, hint, error, required, maxLength, className, type = 'text', autoComplete, id: givenId, inputRef }: FieldProps & { type?: string; autoComplete?: string; id?: string; inputRef?: Ref<HTMLInputElement> }) {
  const generated = useId();
  const id = givenId ?? generated;
  return (
    <div className={cn('min-w-0', className)}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink">
        {label}{required && <span className="text-error-700" aria-hidden="true"> *</span>}
      </label>
      <Input
        id={id}
        ref={inputRef}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        maxLength={maxLength}
        error={Boolean(error)}
        aria-describedby={describedBy(hint && `${id}-hint`, error && `${id}-error`)}
      />
      {hint && <p id={`${id}-hint`} className="mt-1 text-xs text-ink-muted">{hint}</p>}
      {error && <p id={`${id}-error`} className="mt-1 text-xs text-error-700">{error}</p>}
    </div>
  );
}

export function TextAreaField({ label, value, onChange, placeholder, hint, error, maxLength, className, rows = 4 }: FieldProps & { rows?: number }) {
  const id = useId();
  return (
    <div className={cn('min-w-0', className)}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink">{label}</label>
      <Textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(hint && `${id}-hint`, error && `${id}-error`)}
      />
      {hint && <p id={`${id}-hint`} className="mt-1 text-xs text-ink-muted">{hint}</p>}
      {error && <p id={`${id}-error`} className="mt-1 text-xs text-error-700">{error}</p>}
    </div>
  );
}

export interface EntryField<T> {
  key: Extract<keyof T, string>;
  label: string;
  placeholder?: string;
  hint?: string;
  multiline?: boolean;
  /** Spans both columns on wide screens. */
  wide?: boolean;
}

interface EntryListEditorProps<T extends { id: string }> {
  /** Singular noun used in legends and button names, e.g. "Experience". */
  noun: string;
  entries: T[];
  fields: Array<EntryField<T>>;
  onChange: (entries: T[]) => void;
  create: () => T;
  /** Keeps derived fields in step after an edit (e.g. a project's technology list). */
  normalize?: (entry: T) => T;
  emptyText: string;
}

export function EntryListEditor<T extends { id: string }>({ noun, entries, fields, onChange, create, normalize, emptyText }: EntryListEditorProps<T>) {
  const baseId = useId();
  const addRef = useRef<HTMLButtonElement>(null);
  const focusEntry = useRef<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const fieldId = (entryId: string, key: string) => `${baseId}-${entryId}-${key}`;

  useEffect(() => {
    if (!focusEntry.current) return;
    document.getElementById(fieldId(focusEntry.current, fields[0].key))?.focus();
    focusEntry.current = null;
  });

  const update = (index: number, key: string, value: string) => {
    const next = entries.map((entry, position) => {
      if (position !== index) return entry;
      const changed = { ...entry, [key]: value } as T;
      return normalize ? normalize(changed) : changed;
    });
    onChange(next);
  };

  const add = () => {
    const entry = create();
    focusEntry.current = entry.id;
    onChange([...entries, entry]);
    setAnnouncement(`${noun} ${entries.length + 1} added.`);
  };

  const remove = (index: number) => {
    onChange(entries.filter((_, position) => position !== index));
    setAnnouncement(`${noun} ${index + 1} removed.`);
    addRef.current?.focus();
  };

  return (
    <div className="space-y-4">
      {entries.length === 0 && <p className="text-sm text-ink-muted">{emptyText}</p>}
      {entries.map((entry, index) => (
        <fieldset key={entry.id} className="rounded-xl border border-border p-4">
          {/* A legend names its fieldset only as the first child; the visible title mirrors it. */}
          <legend className="sr-only">{noun} {index + 1}</legend>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-ink" aria-hidden="true">{noun} {index + 1}</p>
            <Button type="button" variant="ghost" size="sm" onClick={() => remove(index)}>
              <Trash2 aria-hidden="true" /> Remove<span className="sr-only"> {noun.toLowerCase()} {index + 1}</span>
            </Button>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {fields.map((field) => {
              const value = String((entry as Record<string, unknown>)[field.key] ?? '');
              const common = { label: field.label, value, placeholder: field.placeholder, hint: field.hint, onChange: (next: string) => update(index, field.key, next) };
              return field.multiline
                ? <TextAreaField key={field.key} {...common} className="sm:col-span-2" rows={3} />
                : <TextField key={field.key} {...common} id={fieldId(entry.id, field.key)} className={field.wide ? 'sm:col-span-2' : undefined} />;
            })}
          </div>
        </fieldset>
      ))}
      <Button ref={addRef} type="button" variant="outline" size="sm" onClick={add}>
        <Plus aria-hidden="true" /> Add {noun.toLowerCase()}
      </Button>
      <p role="status" className="sr-only">{announcement}</p>
    </div>
  );
}
