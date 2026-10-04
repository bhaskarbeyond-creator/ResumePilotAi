import React from 'react';
import { FiAlertTriangle, FiCreditCard } from 'react-icons/fi';
import { buildGracePeriodNotice } from './gracePeriodNotice';

/**
 * DIR-022 / AC-4 — Candidate renewal-recovery banner.
 *
 * PURPOSE
 * A failed recurring renewal must not feel like an outage. This banner tells a
 * paying customer exactly how long they have, using the SERVER's authoritative
 * `paymentGraceUntil`, and gives them the one action that resolves it.
 *
 * EVIDENCE DISCIPLINE (the reason the logic lives in gracePeriodNotice.js)
 *   - It renders nothing at all unless the server reports PAST_DUE *and* a
 *     future deadline. No countdown is computed from a local clock estimate.
 *   - Every colour is a semantic Cuba token (`--cuba-warning*`), never a hex, so
 *     the banner passes the WCAG 2.1 AA contrast gate the token set was built for
 *     and adapts to the dark theme automatically.
 *   - It performs no entitlement decision. Access is decided server-side by
 *     `isMembershipActive`; this is communication only.
 *
 * ACCESSIBILITY
 *   `role="status"` with `aria-live="polite"`: a recovery notice is important
 *   but must not interrupt what a screen-reader user is currently hearing.
 */
const PaymentGraceBanner = ({ profile, className = '' }) => {
    const notice = buildGracePeriodNotice(profile);
    if (!notice) return null;

    return (
        <section
            role="status"
            aria-live="polite"
            aria-label="Subscription renewal needs attention"
            data-testid="payment-grace-banner"
            data-grace-until={notice.graceUntil}
            data-days-left={notice.daysLeft}
            className={[
                'flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between',
                'border-cuba-warning/40 bg-cuba-warning-soft',
                className,
            ].filter(Boolean).join(' ')}
        >
            <div className="flex items-start gap-3">
                <FiAlertTriangle
                    aria-hidden="true"
                    className="mt-0.5 h-5 w-5 shrink-0 text-cuba-warning"
                />
                <div className="space-y-1">
                    <h2 className="text-sm font-semibold text-cuba-ink">{notice.title}</h2>
                    <p className="text-sm text-cuba-ink-muted">{notice.message}</p>
                </div>
            </div>
            <a
                href="/dashboard/settings?tab=billing"
                // WCAG 2.1 AA: `bg-cuba-primary` (#7366ff) with white text is only
                // 4.13:1, which FAILS the 4.5:1 body-text threshold — axe caught
                // this on the live DOM. The design system already ships the
                // approved pair (`--cuba-primary-fill` / `--cuba-on-primary`) used
                // by CubaButton, which clears AA and adapts to the dark theme, so
                // this uses those exact tokens rather than inventing a darker hex.
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-cuba-primary-fill px-4 py-2 text-sm font-semibold text-cuba-on-primary transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cuba-primary"
            >
                <FiCreditCard aria-hidden="true" className="h-4 w-4" />
                Update payment method
            </a>
        </section>
    );
};

export default PaymentGraceBanner;