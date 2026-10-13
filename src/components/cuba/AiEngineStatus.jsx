import React from 'react';
import { describeAiStatus, AI_STATUS } from './aiStatus';

const cx = (...parts) => parts.filter(Boolean).join(' ');

const TONE_CLASS = {
    ok: 'text-cuba-success',
    warn: 'text-cuba-warning',
    critical: 'text-cuba-danger',
    muted: 'text-cuba-ink-subtle',
};

/**
 * AiEngineStatus — the header AI beacon (§19, §20).
 *
 * Shows "✦ AI Engine Ready" and nothing more. It never renders a latency, a
 * percentage, or a provider name, because the platform's public availability
 * contract does not publish one and fabricating it would be a false claim (§46).
 * The full meaning is exposed to assistive tech and as a tooltip.
 */
const AiEngineStatus = ({ status = AI_STATUS.UNKNOWN, className = '' }) => {
    const descriptor = describeAiStatus(status);
    const isChecking = status === AI_STATUS.CHECKING;

    return (
        <span
            className={cx(
                // DIR-106: NO display utility here, deliberately. The shell
                // renders this beacon with `className="hidden"`, and a hardcoded
                // `inline-flex` out-ranked `hidden` in the compiled CSS, leaving
                // the beacon visible in place of the allowance chip. Display is
                // the caller's to own — the same contract AiTokenMeter follows.
                'select-none items-center gap-2 rounded-full border border-cuba-line bg-cuba-card px-3 py-1.5 text-xs font-semibold',
                TONE_CLASS[descriptor.tone] || TONE_CLASS.muted,
                className,
            )}
            title={descriptor.meaning}
            data-testid="ai-engine-status"
            data-ai-status={status}
        >
            <span
                className={cx('cuba-ai-beacon', isChecking ? 'animate-pulse' : '')}
                data-active={isChecking ? 'true' : 'false'}
                aria-hidden="true"
            />
            <span aria-hidden="true" className="cuba-ai-mark">✦</span>
            <span>{descriptor.label}</span>
            <span className="cuba-sr-only">. {descriptor.meaning}</span>
        </span>
    );
};

export default AiEngineStatus;
