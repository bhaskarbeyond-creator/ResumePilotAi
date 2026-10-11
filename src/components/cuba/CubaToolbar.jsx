import React from 'react';
import { useCubaDensity } from './CubaDensityProvider';

const cx = (...parts) => parts.filter(Boolean).join(' ');

/**
 * DIR-082 — the sticky page toolbar.
 *
 * Sits directly under the page header inside a bounded viewport, so search, filters
 * and the density control stay reachable no matter how long the list is. It also
 * owns the ONE density control for the app, exposed as a labelled radiogroup rather
 * than an unlabelled icon toggle.
 */
const CubaToolbar = ({ left = null, right = null, className = '', sticky = true, showDensity = true, label = 'Page tools' }) => {
    const { density, setDensity, densities } = useCubaDensity();

    return (
        <div
            data-testid="cuba-toolbar"
            role="toolbar"
            aria-label={label}
            className={cx(
                'z-20 flex flex-wrap items-center gap-2 border-b border-cuba-line/70 py-2',
                sticky && 'cuba-glass sticky top-[var(--cuba-header-h)]',
                className,
            )}
        >
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{left}</div>
            <div className="flex flex-none items-center gap-2">
                {right}
                {showDensity && (
                    <div
                        role="radiogroup"
                        aria-label="Display density"
                        className="flex items-center gap-0.5 rounded-full border border-cuba-line bg-cuba-card/70 p-0.5"
                    >
                        {densities.map((option) => (
                            <button
                                key={option}
                                type="button"
                                role="radio"
                                aria-checked={density === option}
                                onClick={() => setDensity(option)}
                                className={cx(
                                    'cuba-focusable rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize transition-colors',
                                    density === option
                                        ? 'bg-cuba-primary text-cuba-primary-ink'
                                        : 'text-cuba-ink-muted hover:text-cuba-ink',
                                )}
                            >
                                {option}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default CubaToolbar;
