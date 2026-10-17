import React, { useId } from 'react';

const cx = (...parts) => parts.filter(Boolean).join(' ');

const FIELD_BASE = [
    'form-control cuba-focus-ring w-full w-100 rounded-cuba-sm border bg-cuba-card px-3 text-sm text-cuba-ink',
    'placeholder:text-cuba-ink-subtle transition-colors duration-200',
    'disabled:cursor-not-allowed disabled:opacity-60',
].join(' ');

const borderFor = (invalid) => (invalid ? 'border-cuba-danger is-invalid' : 'border-cuba-line-strong hover:border-cuba-primary/60');

/**
 * Shared field shell. Every control in the system uses this so label
 * association, hint text and error messaging are implemented once and cannot
 * drift per component (§12, §37).
 *
 * The error is wired with `aria-describedby` + `aria-invalid`, so it is announced
 * rather than being colour-only.
 */
export const CubaField = ({ id, label, hint, error, required, children, className = '' }) => (
    <div className={cx('w-full w-100 mb-3', className)}>
        {label && (
            <label htmlFor={id} className="form-label mb-1.5 block text-sm font-medium text-cuba-ink">
                {label}
                {required && <span className="ml-0.5 text-cuba-danger text-danger" aria-hidden="true">*</span>}
                {required && <span className="cuba-sr-only visually-hidden"> (required)</span>}
            </label>
        )}
        {children}
        {hint && !error && (
            <p id={`${id}-hint`} className="form-text mt-1.5 text-xs text-cuba-ink-muted text-muted">{hint}</p>
        )}
        {error && (
            <p id={`${id}-error`} className="invalid-feedback d-block mt-1.5 text-xs font-medium text-cuba-danger text-danger">
                {error}
            </p>
        )}
    </div>
);

const describedBy = (id, hint, error) =>
    [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(' ') || undefined;

export const CubaInput = ({ label, hint, error, required, className = '', id: providedId, ...rest }) => {
    const generatedId = useId();
    const id = providedId || generatedId;
    return (
        <CubaField id={id} label={label} hint={hint} error={error} required={required} className={className}>
            <input
                id={id}
                required={required}
                aria-invalid={error ? 'true' : undefined}
                aria-describedby={describedBy(id, hint, error)}
                className={cx(FIELD_BASE, borderFor(Boolean(error)), 'h-10')}
                {...rest}
            />
        </CubaField>
    );
};

export const CubaTextarea = ({ label, hint, error, required, className = '', id: providedId, rows = 4, ...rest }) => {
    const generatedId = useId();
    const id = providedId || generatedId;
    return (
        <CubaField id={id} label={label} hint={hint} error={error} required={required} className={className}>
            <textarea
                id={id}
                rows={rows}
                required={required}
                aria-invalid={error ? 'true' : undefined}
                aria-describedby={describedBy(id, hint, error)}
                className={cx(FIELD_BASE, borderFor(Boolean(error)), 'py-2.5 leading-relaxed')}
                {...rest}
            />
        </CubaField>
    );
};

export const CubaSelect = ({ label, hint, error, required, className = '', id: providedId, children, ...rest }) => {
    const generatedId = useId();
    const id = providedId || generatedId;
    return (
        <CubaField id={id} label={label} hint={hint} error={error} required={required} className={className}>
            <select
                id={id}
                required={required}
                aria-invalid={error ? 'true' : undefined}
                aria-describedby={describedBy(id, hint, error)}
                className={cx(FIELD_BASE, 'form-select', borderFor(Boolean(error)), 'h-10 cursor-pointer')}
                {...rest}
            >
                {children}
            </select>
        </CubaField>
    );
};

export default CubaInput;
