import React from 'react';
import { AI_USAGE_STATUS, useAiTokenUsage } from '../../hooks/useAiTokenUsage';

const cx = (...parts) => parts.filter(Boolean).join(' ');

/**
 * Renders an allowance figure the way the directive specifies it: a plain
 * count. No abbreviation — "Usage: 0/1000" is unambiguous, whereas "0/1k"
 * invites the reader to guess whether a remainder was rounded away.
 * Module-private: the menubar chip is the allowance's only surface, so there is
 * no second caller that could format the same figure differently.
 */
const formatAiRequestCount = (value) => {
    const count = Number(value);
    return Number.isFinite(count) && count > 0 ? String(Math.floor(count)) : '0';
};

const TONE = {
    ok: 'text-cuba-success',
    warn: 'text-cuba-warning',
    critical: 'text-cuba-danger',
};

/**
 * AiTokenMeter — the menubar readout of the signed-in user's AI allowance.
 *
 * Displays the SAME server-authoritative numbers the AI quota gate enforces
 * (`usedToday` / `effectiveLimit`), so a user can see their headroom before a
 * request is refused rather than only after. It renders NOTHING when the viewer
 * is signed out or the ledger cannot be read — a placeholder figure would be a
 * claim the platform never made (§46).
 *
 * The full meaning (plan, remaining, reset cadence) is exposed to assistive
 * tech and as a tooltip; the visible text is only the used/limit pair.
 */
const AiTokenMeter = ({ enabled = true, className = 'inline-flex' }) => {
    const { status, plan, usedToday, effectiveLimit, remainingToday, isExhausted, quotaScope } = useAiTokenUsage({ enabled });

    if (!enabled || status !== AI_USAGE_STATUS.READY) return null;

    const lowWaterMark = Math.max(1, Math.ceil(effectiveLimit * 0.2));
    const tone = isExhausted
        ? TONE.critical
        : remainingToday <= lowWaterMark ? TONE.warn : TONE.ok;

    // DIR-106: the server decides which budget governs this user. Naming it here
    // is what stops an organization member from believing they are spending a
    // personal allowance (and vice versa).
    const isOrganization = quotaScope === 'ORGANIZATION';
    const budgetLabel = isOrganization ? 'organization' : 'personal';
    const label = isExhausted
        ? `Daily ${budgetLabel} AI allowance used up`
        : `${remainingToday} of ${effectiveLimit} AI requests left today on your ${budgetLabel} allowance`;

    return (
        <span
            className={cx(
                // NOTE: no display utility in the base list, deliberately. An
                // unscoped `inline-flex` here would out-rank a caller's `hidden`
                // and leave the chip on screen at 320px; leaving display to the
                // caller is what makes `hidden md:inline-flex` behave exactly
                // like the certified search-bar kbd-badge pattern.
                'select-none items-center gap-1.5 rounded-full border border-cuba-line bg-cuba-card px-3 py-1.5 text-xs font-semibold',
                tone,
                className,
            )}
            title={`${label}${plan ? ` — ${plan} plan` : ''}. Resets daily (UTC).`}
            data-testid="ai-token-meter"
            data-ai-plan={plan || 'unknown'}
            data-ai-scope={quotaScope || 'UNKNOWN'}
            data-ai-used={usedToday}
            data-ai-limit={effectiveLimit}
            data-ai-remaining={remainingToday}
            data-ai-exhausted={isExhausted ? 'true' : 'false'}
        >
            <span aria-hidden="true" className="cuba-ai-mark">✦</span>
            {isOrganization && (
                <span aria-hidden="true" className="text-cuba-ink-subtle">Org</span>
            )}
            {/* The directive's wording, trimmed to `Usage: XXX/XXX`. The unit
                ("req/day") is carried by the tooltip and the sr-only sentence
                rather than repeated in the chrome on every page. The label is
                decorative and mirrors that sentence, so assistive tech hears
                the meaning once rather than twice. */}
            <span aria-hidden="true" className="whitespace-nowrap">
                <span className="text-cuba-ink-subtle">Usage: </span>
                <span className="font-mono font-bold tabular-nums">
                    {formatAiRequestCount(usedToday)}/{formatAiRequestCount(effectiveLimit)}
                </span>
            </span>
            <span className="cuba-sr-only">
                {`. ${label}${plan ? ` on the ${plan} plan` : ''}. Resets daily.`}
            </span>
        </span>
    );
};

export default AiTokenMeter;
