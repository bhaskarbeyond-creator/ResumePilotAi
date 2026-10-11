import React from 'react';
import { FiArrowRight } from 'react-icons/fi';
import { FaCrown } from 'react-icons/fa';

/**
 * CubaUpgradeCard — DIR-092 area 7: the sidebar "Upgrade to Pro" promo.
 *
 * The reference puts a promotional card at the FOOT of the left sidebar with a title, a short
 * benefit line and an "Upgrade Now →" button.
 *
 * HONEST DATA CONTRACT: this card advertises a PLAN, so it takes no account data and invents
 * none. It renders the same copy for every user — there is no per-user metric here to fake.
 * Whether the user is ALREADY on Pro is the one real input, passed in by the shell; when they
 * are, the card states that plainly instead of trying to upsell them.
 */

const CubaUpgradeCard = ({ collapsed = false, isPro = false, onNavigate, planHref = '/dashboard/plans' }) => {
    const go = (event) => {
        if (onNavigate && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0) {
            event.preventDefault();
            onNavigate(planHref);
        }
    };

    // The collapsed rail has no room for copy — show the crown as the whole affordance.
    if (collapsed) {
        return (
            <div className="flex-none border-t border-cuba-line/50 px-2 py-3">
                <a
                    href={planHref}
                    onClick={go}
                    data-testid="cuba-upgrade-card-collapsed"
                    aria-label={isPro ? 'Your Pro plan' : 'Upgrade to Pro'}
                    title={isPro ? 'Your Pro plan' : 'Upgrade to Pro'}
                    className="cuba-focusable flex h-10 w-full items-center justify-center rounded-cuba-lg border border-cuba-line bg-cuba-card text-cuba-primary-ink-strong"
                >
                    <FaCrown className="h-4 w-4" aria-hidden="true" />
                </a>
            </div>
        );
    }

    return (
        <div className="flex-none border-t border-cuba-line/50 p-3" data-testid="cuba-upgrade-card">
            <div
                className="rounded-cuba-lg border border-cuba-line p-3"
                style={{ background: 'linear-gradient(135deg, var(--cuba-primary-soft), var(--cuba-info-soft))' }}
            >
                <div className="flex items-center gap-2">
                    <span
                        className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-cuba-primary text-cuba-primary-ink"
                        aria-hidden="true"
                    >
                        <FaCrown className="h-3.5 w-3.5" />
                    </span>
                    <p className="text-sm font-bold text-cuba-ink">
                        {isPro ? 'You are on Pro' : 'Upgrade to Pro'}
                    </p>
                </div>

                <p className="mt-2 text-[11px] leading-snug text-cuba-ink-muted">
                    {isPro
                        ? 'Your Pro plan is active. Manage billing and seats any time.'
                        : 'Unlock advanced AI tools, unlimited tailoring and priority interview coaching.'}
                </p>

                <a
                    href={planHref}
                    onClick={go}
                    data-testid="cuba-upgrade-cta"
                    className="cuba-focusable mt-3 flex w-full items-center justify-center gap-1.5 rounded-cuba-md bg-cuba-primary px-3 py-2 text-xs font-bold text-cuba-primary-ink transition-opacity hover:opacity-90"
                >
                    {isPro ? 'Manage plan' : 'Upgrade Now'}
                    <FiArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
            </div>
        </div>
    );
};

export default CubaUpgradeCard;
