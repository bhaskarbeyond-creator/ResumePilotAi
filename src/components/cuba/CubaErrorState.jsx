import React from 'react';
import { FiAlertTriangle, FiRefreshCw } from 'react-icons/fi';
import CubaButton from './CubaButton';

const cx = (...parts) => parts.filter(Boolean).join(' ');

/**
 * CubaErrorState — a truthful failure surface.
 *
 * Renders the REAL message the platform produced. It never substitutes a generic
 * string for an actual error and never implies the operation succeeded.
 * `retry` renders only when the caller can actually retry.
 */
const CubaErrorState = ({
    title = 'Something went wrong',
    message,
    onRetry,
    retryLabel = 'Try again',
    retrying = false,
    secondaryAction,
    className = '',
}) => (
    <div
        role="alert"
        aria-live="assertive"
        className={cx(
            'flex flex-col items-center justify-center rounded-cuba-lg border border-cuba-danger/35 bg-cuba-danger-soft/40 px-6 py-12 text-center',
            className,
        )}
    >
        <div
            className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-cuba-danger-soft text-cuba-danger"
            aria-hidden="true"
        >
            <FiAlertTriangle className="h-6 w-6" />
        </div>
        <h3 className="text-base font-semibold tracking-tight text-cuba-ink">{title}</h3>
        {message && <p className="mt-2 max-w-lg text-sm text-cuba-ink-muted">{message}</p>}
        {(onRetry || secondaryAction) && (
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                {onRetry && (
                    <CubaButton
                        variant="outline"
                        onClick={onRetry}
                        loading={retrying}
                        icon={!retrying ? <FiRefreshCw className="h-4 w-4" aria-hidden="true" /> : null}
                    >
                        {retryLabel}
                    </CubaButton>
                )}
                {secondaryAction}
            </div>
        )}
    </div>
);

export default CubaErrorState;
