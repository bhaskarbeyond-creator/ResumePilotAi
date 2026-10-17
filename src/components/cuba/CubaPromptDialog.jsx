import React, { useEffect, useId, useRef, useState } from 'react';
import CubaModal from './CubaModal';
import CubaButton from './CubaButton';

/**
 * CubaPromptDialog — the in-product replacement for `window.prompt` (DIR-048).
 *
 * WHY THIS EXISTS
 *   Four surfaces still asked the browser for text: renaming a resume, renaming
 *   a portfolio, the clipboard fallback on the enterprise audit deep link, and
 *   the admin SMS test recipient. `window.prompt` is a native dialog — it cannot
 *   be themed, cannot be reached by the Playwright suite as an element, is
 *   suppressible by the browser, blocks the main thread, and on mobile renders as
 *   an OS sheet that breaks the app's visual continuity. It is also the only
 *   input surface in the product with no validation and no accessible label.
 *
 * THE CONTRACT
 *   - Built on `CubaModal`, so it inherits the single accessible dialog
 *     implementation: portal, focus trap, Escape dismissal, `aria-modal`, and the
 *     bottom-sheet presentation under `sm` the rest of the product uses.
 *   - `onSubmit` receives the TRIMMED value and is only reachable when the value
 *     is non-empty and passes the optional `validate` predicate, so a caller can
 *     never receive the empty string `window.prompt` happily returns.
 *   - Validation failure is announced, not merely visible: `aria-invalid` plus an
 *     `aria-describedby` link to a `role="alert"` message against the field.
 *   - `busy` keeps the dialog open with both actions disabled while the confirmed
 *     action runs, so a slow rename cannot be double-submitted.
 *
 * ZERO FABRICATION: the dialog holds no value beyond the caller's `initialValue`;
 * it never invents a default title.
 */
const CubaPromptDialog = ({
    open,
    onClose,
    onSubmit,
    title = 'Enter a value',
    description = '',
    label = 'Value',
    initialValue = '',
    placeholder = '',
    confirmLabel = 'Save',
    cancelLabel = 'Cancel',
    maxLength = 160,
    multiline = false,
    busy = false,
    validate,
    testId = 'cuba-prompt-dialog',
}) => {
    const [value, setValue] = useState(initialValue);
    const [problem, setProblem] = useState('');
    const inputRef = useRef(null);
    const fieldId = useId();

    // Re-seed on every open so a second rename cannot inherit the first one's
    // edit, and clear any stale validation message.
    useEffect(() => {
        if (!open) return;
        setValue(initialValue);
        setProblem('');
    }, [open, initialValue]);

    const submit = () => {
        const next = String(value || '').trim();
        if (!next) {
            setProblem('This field cannot be empty.');
            inputRef.current?.focus();
            return;
        }
        if (typeof validate === 'function') {
            const verdict = validate(next);
            if (verdict !== true) {
                setProblem(typeof verdict === 'string' && verdict ? verdict : 'That value is not accepted.');
                inputRef.current?.focus();
                return;
            }
        }
        setProblem('');
        onSubmit?.(next);
    };

    if (!open) return null;

    const fieldClass = 'cuba-field w-full resize-none px-3 py-2.5 text-sm text-cuba-ink';
    const describedBy = problem ? `${fieldId}-error` : undefined;
    const sharedFieldProps = {
        id: fieldId,
        ref: inputRef,
        value,
        placeholder,
        maxLength,
        'aria-invalid': problem ? 'true' : 'false',
        'aria-describedby': describedBy,
        onChange: (event) => { setValue(event.target.value); if (problem) setProblem(''); },
        className: fieldClass,
    };

    return (
        <CubaModal className="modal-dialog modal-content card bs-card-executive"
            open={open}
            onClose={busy ? undefined : onClose}
            closeOnBackdrop={!busy}
            title={title}
            description={description}
            size="sm"
            testId={testId}
            initialFocusRef={inputRef}
            footer={(
                <>
                    <CubaButton variant="ghost" type="button" onClick={onClose} disabled={busy}>
                        {cancelLabel}
                    </CubaButton>
                    <CubaButton
                        variant="primary"
                        type="button"
                        onClick={submit}
                        disabled={busy || !String(value || '').trim()}
                        data-testid={`${testId}-submit`}
                    >
                        {busy ? 'Working…' : confirmLabel}
                    </CubaButton>
                </>
            )}
        >
            <label htmlFor={fieldId} className="mb-1.5 block text-sm font-medium text-cuba-ink">
                {label}
            </label>
            {multiline ? (
                <textarea
                    {...sharedFieldProps}
                    rows={3}
                    onKeyDown={(event) => {
                        // Ctrl/Cmd+Enter submits; a bare Enter must stay a newline.
                        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                            event.preventDefault();
                            submit();
                        }
                    }}
                />
            ) : (
                <input
                    {...sharedFieldProps}
                    type="text"
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            submit();
                        }
                    }}
                />
            )}
            <div className="mt-1.5 flex items-start justify-between gap-3">
                {problem ? (
                    <p id={`${fieldId}-error`} role="alert" className="text-xs font-medium text-cuba-danger">
                        {problem}
                    </p>
                ) : <span />}
                <span className="flex-none text-[11px] text-cuba-ink-subtle">
                    {String(value || '').trim().length}/{maxLength}
                </span>
            </div>
        </CubaModal>
    );
};

export default CubaPromptDialog;
