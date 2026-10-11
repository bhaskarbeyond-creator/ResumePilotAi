import React from 'react';
import CubaPageHeader from './CubaPageHeader';
import CubaErrorState from './CubaErrorState';
import CubaEmptyState, { CubaLoadingState } from './CubaEmptyState';
import CubaViewport from './CubaViewport';

const cx = (...parts) => parts.filter(Boolean).join(' ');

/**
 * CubaPageFrame — the DIR-081 page-state invariant, extended by DIR-082.
 *
 * A page's header, breadcrumb and action slot belong to the PAGE, not to the
 * data. Before DIR-081, Job Tracker and Submitted Applications rendered three
 * full-page early returns (`if (!user) return <main>…`, `if (loading) return
 * <main>…`, `if (loadError) return <main>…`) placed BEFORE the real page body, so
 * every non-happy state replaced the entire document and the user saw a correctly
 * framed shell with an EMPTY page body — the "blank screen on load" defect.
 *
 * The frame renders the header ONCE and swaps only the content region, so the
 * page title, breadcrumb and actions stay mounted in all four states:
 *   ready | loading | empty | error
 *
 * DIR-082 adds `dense`: the header, an optional HUD and an optional toolbar are
 * PINNED, and the content region becomes a bounded `CubaViewport` scroll area, so
 * acting on a row no longer pushes the page title out of view. `dense` is opt-in,
 * so every existing caller keeps its current behaviour byte for byte.
 *
 * `data-page-state` exposes the active state to the DOM so the QA suite can assert
 * that the header survives every transition.
 */
const CubaPageFrame = ({
    title,
    subtitle,
    eyebrow,
    actions,
    breadcrumb = null,
    headingLevel,
    state = 'ready',
    error = '',
    onRetry,
    retrying = false,
    retryLabel,
    emptyState = null,
    loadingLabel = 'Loading',
    loadingRows = 4,
    hud = null,
    toolbar = null,
    dense = false,
    className = '',
    contentClassName = '',
    children,
}) => {
    const resolvedState = state === 'ready' && error
        ? 'error'
        : state === 'ready' && emptyState
            ? 'empty'
            : state;

    const body = (
        <>
            {resolvedState === 'loading' && (
                <CubaLoadingState label={loadingLabel} rows={loadingRows} />
            )}
            {resolvedState === 'error' && (
                <CubaErrorState
                    title="This page could not be loaded"
                    message={error}
                    onRetry={onRetry}
                    retrying={retrying}
                    retryLabel={retryLabel || 'Try again'}
                />
            )}
            {resolvedState === 'empty' && (
                emptyState || (
                    <CubaEmptyState
                        title="Nothing here yet"
                        description="Once there is real data to show, it will appear here."
                    />
                )
            )}
            {resolvedState === 'ready' && children}
        </>
    );

    return (
        <main
            data-testid="cuba-page-frame"
            data-page-state={resolvedState}
            data-cuba-dense={dense ? 'true' : 'false'}
            className={cx('min-w-0', dense && 'flex h-[calc(100vh-var(--cuba-header-h))] flex-col overflow-hidden', className)}
        >
            <div className={cx(dense && 'flex-none px-4 pt-4 sm:px-6 lg:px-8')}>
                <CubaPageHeader
                    title={title}
                    subtitle={subtitle}
                    eyebrow={eyebrow}
                    actions={actions}
                    breadcrumb={breadcrumb}
                    headingLevel={headingLevel}
                />
                {hud && <div className="mt-3">{hud}</div>}
                {toolbar}
            </div>
            {dense ? (
                <CubaViewport className={contentClassName}>{body}</CubaViewport>
            ) : (
                <div className={cx('mt-5', contentClassName)}>{body}</div>
            )}
        </main>
    );
};

export default CubaPageFrame;

