import React, { useEffect, useId, useRef, useState } from 'react';

const cx = (...parts) => parts.filter(Boolean).join(' ');

/**
 * Toned surfaces, one per semantic state. Every tone is a token pair from
 * `cuba-tokens.css` (soft fill + on-* ink) — never a raw hex, never a Tailwind
 * palette colour invented on the spot. The on-* inks are the AAA text colours
 * already audited in DIR-022, so contrast is inherited rather than re-guessed.
 */
const TONES = {
    success: {
        wrap: 'bg-cuba-success-soft border-cuba-success/25 text-cuba-on-success',
        icon: '✓',
    },
    error: {
        wrap: 'bg-cuba-danger-soft border-cuba-danger/25 text-cuba-on-danger',
        icon: '!',
    },
    warning: {
        wrap: 'bg-cuba-warning-soft border-cuba-warning/30 text-cuba-on-warning',
        icon: '⚠',
    },
    info: {
        wrap: 'bg-cuba-primary-soft border-cuba-primary/25 text-cuba-primary',
        icon: 'i',
    },
};

/**
 * CubaInlineNotice — the in-page replacement for `window.alert` (DIR-048).
 *
 * WHY THIS EXISTS
 *   `window.alert` is a blocking, unthemeable, suppressible OS dialog: it cannot
 *   be screenshotted, cannot be reached by the automation suite as an element,
 *   steals focus from the page, and on mobile breaks the app's visual continuity.
 *   Every informational message it carried belongs inline, next to the control
 *   that produced it, so the user keeps their place.
 *
 * CONTRACT
 *   - `tone="error"` uses `role="alert"` (assertive — announced immediately);
 *     every other tone uses `role="status"` (polite), so a screen reader is not
 *     interrupted by a success message.
 *   - The message is linked from the notice root via `aria-describedby`, so the
 *     whole body is announced rather than just the role.
 *   - `onDismiss` renders a real close control with an accessible name; without it
 *     the notice simply stays, which is correct for a permanent error banner.
 *   - `autoDismissMs` clears the notice after a real interval and the timer is
 *     cancelled on unmount, so no timer can fire against a dead component.
 *
 * ZERO FABRICATION: the component renders only the message it is given. It never
 *   invents copy, never guesses a tone (default `info`), and never reports a state
 *   the caller did not supply.
 */
const CubaInlineNotice = ({
    tone = 'info',
    message = '',
    title = '',
    onDismiss = null,
    autoDismissMs = 0,
    className = '',
    testId = 'cuba-inline-notice',
}) => {
    const [visible, setVisible] = useState(true);
    const bodyId = useId();
    const timerRef = useRef(null);

    useEffect(() => {
        setVisible(true);
    }, [message, tone]);

    useEffect(() => {
        if (!autoDismissMs || !onDismiss) return undefined;
        timerRef.current = setTimeout(() => {
            setVisible(false);
            onDismiss();
        }, autoDismissMs);
        return () => clearTimeout(timerRef.current);
    }, [autoDismissMs, onDismiss, message]);

    if (!message || !visible) return null;

    const config = TONES[tone] || TONES.info;

    return (
        <div
            data-testid={testId}
            data-tone={tone}
            role={tone === 'error' ? 'alert' : 'status'}
            aria-describedby={bodyId}
            className={cx(
                'flex items-start gap-2.5 rounded-cuba-sm border px-3 py-2.5 text-xs font-medium',
                config.wrap,
                className,
            )}
        >
            <span
                aria-hidden="true"
                className="mt-px flex h-4 w-4 flex-none items-center justify-center rounded-full bg-current/15 text-[10px] font-bold"
            >
                {config.icon}
            </span>
            <div className="min-w-0 flex-1">
                {title && <p className="mb-0.5 text-[13px] font-semibold">{title}</p>}
                <p id={bodyId} className="leading-relaxed">{message}</p>
            </div>
            {onDismiss && (
                <button
                    type="button"
                    onClick={() => { setVisible(false); onDismiss(); }}
                    aria-label="Dismiss notice"
                    data-testid={`${testId}-dismiss`}
                    className="cuba-focusable -mr-1 flex h-6 w-6 flex-none items-center justify-center rounded-cuba-xs text-sm opacity-70 transition hover:opacity-100"
                >
                    ×
                </button>
            )}
        </div>
    );
};

export default CubaInlineNotice;
