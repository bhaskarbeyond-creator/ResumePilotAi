import React from 'react';
import { FiArrowLeft } from 'react-icons/fi';

const cx = (...parts) => parts.filter(Boolean).join(' ');

/**
 * DIR-082 — the list/detail split view.
 *
 * The benchmark found exactly one split view in the whole candidate suite
 * (Messages, delivered by DIR-081). This primitive generalises it: two labelled
 * panes side by side from `lg` up, and a strict single-pane swap below that with an
 * explicit back-to-list control, so a 375px phone never renders a 320px list and a
 * thread at the same time.
 */
const CubaSplitView = ({
    list,
    detail,
    hasDetail = false,
    onBack,
    backLabel = 'Back to list',
    listLabel = 'Items',
    detailLabel = 'Details',
    listWidthClass = 'lg:w-[340px]',
    className = '',
    emptyDetail = null,
}) => (
    <div
        data-testid="cuba-split-view"
        data-has-detail={hasDetail ? 'true' : 'false'}
        className={cx('flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:gap-6', className)}
    >
        <div
            data-testid="cuba-split-list"
            aria-label={listLabel}
            className={cx(
                'min-w-0 lg:max-h-[calc(100vh-var(--cuba-header-h)-6rem)] lg:overflow-y-auto cuba-scrollbar lg:flex-none',
                listWidthClass,
                hasDetail ? 'hidden lg:block' : 'block',
            )}
        >
            {list}
        </div>
        <div
            data-testid="cuba-split-detail"
            aria-label={detailLabel}
            className={cx(
                'min-w-0 flex-1 lg:max-h-[calc(100vh-var(--cuba-header-h)-6rem)] lg:overflow-y-auto cuba-scrollbar',
                hasDetail ? 'block' : 'hidden lg:block',
            )}
        >
            {hasDetail && (
                <button
                    type="button"
                    onClick={onBack}
                    className="cuba-focusable mb-3 inline-flex items-center gap-1.5 rounded-cuba-sm border border-cuba-line px-3 py-1.5 text-xs font-semibold text-cuba-ink-muted lg:hidden"
                >
                    <FiArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                    {backLabel}
                </button>
            )}
            {detail || emptyDetail}
        </div>
    </div>
);

export default CubaSplitView;
