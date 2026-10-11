import React from 'react';
import CubaPageHeader from './CubaPageHeader';
import CubaErrorState from './CubaErrorState';
import CubaEmptyState, { CubaLoadingState } from './CubaEmptyState';

const cx = (...parts) => parts.filter(Boolean).join(' ');

/**
 * CubaPageFrame — the DIR-081 page-state invariant.
 *
 * A page's header, breadcrumb and action slot belong to the PAGE, not to the
 * data. Before this frame, Job Tracker and Submitted Applications rendered three
 * full-page early returns (`if (!user) return <main>…`, `if (loading) return
 * <main>…`, `if (loadError) return <main>…`) placed BEFORE the real page body, so
 * every non-happy state replaced the entire document and the user saw a correctly
 * framed shell with an EMPTY page body — the "blank screen on load" defect.
 *
 * The frame renders the header ONCE and swaps only the content region, so the
 * page title, breadcrumb and actions stay mounted in all four states:
 *   ready | loading | empty | error
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
    className = '',
    contentClassName = '',
    children,
}) => {
    const resolvedState = state === 'ready' && error
        ? 'error'
        : state === 'ready' && emptyState
            ? 'empty'
            : state;

    return (
        <main
            data-testid="cuba-page-frame"
            data-page-state={resolvedState}
            className={cx('min-w-0', className)}
        >
            <CubaPageHeader
                title={title}
                subtitle={subtitle}
                eyebrow={eyebrow}
                actions={actions}
                breadcrumb={breadcrumb}
                headingLevel={headingLevel}
            />
            <div className={cx('mt-5', contentClassName)}>
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
            </div>
        </main>
    );
};

export default CubaPageFrame;
