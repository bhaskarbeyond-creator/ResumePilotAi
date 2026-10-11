import React, { useId } from 'react';

/**
 * Field — the single visual language for every input in the builder.
 * Label + control + hint + error. Placeholders are instructional only
 * (passed in by the caller from the safe static placeholder module).
 */
export default function Field({
    label,
    hint,
    error,
    required = false,
    optional = false,
    type = 'text',
    value,
    onChange,
    onBlur,
    placeholder = '',
    multiline = false,
    rows = 3,
    list,
    inputMode,
    autoComplete,
    maxLength,
    className = '',
    ...rest
}) {
    const autoId = useId();
    const id = rest.id || autoId;
    const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;

    const controlClass = [
        'w-full rounded-lg border bg-white px-3 py-2 text-sm text-[var(--cuba-ink)] shadow-2xs transition-colors',
        'placeholder:text-[var(--cuba-ink-subtle)] focus:outline-none focus:ring-2 focus:ring-indigo-500/25',
        error ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-500/20' : 'border-[var(--cuba-line)] focus:border-indigo-400',
    ].join(' ');

    return (
        <div className={`min-w-0 ${className}`}>
            {label ? (
                <label htmlFor={id} className="mb-1.5 flex items-baseline gap-1.5 text-[13px] font-semibold text-[var(--cuba-ink-muted)]">
                    <span>{label}</span>
                    {required && <span aria-hidden="true" className="text-rose-500">*</span>}
                    {optional && <span className="text-[11px] font-medium text-[var(--cuba-ink-subtle)]">optional</span>}
                </label>
            ) : null}

            {multiline ? (
                <textarea
                    id={id}
                    name={rest.name}
                    value={value}
                    onChange={onChange}
                    onBlur={onBlur}
                    placeholder={placeholder}
                    rows={rows}
                    maxLength={maxLength}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={describedBy}
                    className={`${controlClass} resize-y leading-relaxed`}
                    {...rest}
                />
            ) : (
                <input
                    id={id}
                    name={rest.name}
                    type={type}
                    value={value}
                    onChange={onChange}
                    onBlur={onBlur}
                    placeholder={placeholder}
                    list={list}
                    inputMode={inputMode}
                    autoComplete={autoComplete}
                    maxLength={maxLength}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={describedBy}
                    className={controlClass}
                    {...rest}
                />
            )}

            {error ? (
                <p id={`${id}-error`} className="mt-1.5 text-xs font-medium text-rose-600" role="alert">{error}</p>
            ) : hint ? (
                <p id={`${id}-hint`} className="mt-1.5 text-xs text-[var(--cuba-ink-subtle)]">{hint}</p>
            ) : null}
        </div>
    );
}
