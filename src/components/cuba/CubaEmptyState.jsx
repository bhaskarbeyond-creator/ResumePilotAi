import CubaSkeleton from './CubaSkeleton';
import CubaButton from './CubaButton';
import './cuba-skeleton.css';

const cx = (...parts) => parts.filter(Boolean).join(' ');

/**
 * CubaEmptyState â€” the actionable zero-data state.
 *
 * A zero-result read is a real, meaningful state, not an error. The component
 * never invents sample content to fill the void (Â§46); it renders exactly what
 * the caller knows, plus an optional recovery action.
 */
const CubaEmptyState = ({
    icon = null,
    title,
    description,
    action,
    secondaryAction,
    compact = false,
    className = '',
}) => (
    <div
        className={cx(
            'flex flex-col items-center justify-center rounded-cuba-lg border border-dashed border-cuba-line-strong bg-cuba-card/60 text-center',
            compact ? 'px-4 py-8' : 'px-6 py-14',
            className,
        )}
    >
        {icon && (
            <div
                className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-cuba-primary-soft text-cuba-primary-ink-strong"
                aria-hidden="true"
            >
                {icon}
            </div>
        )}
        <h3 className="text-base font-semibold tracking-tight text-cuba-ink">{title}</h3>
        {description && <p className="mt-2 max-w-md text-sm text-cuba-ink-muted">{description}</p>}
        {(action || secondaryAction) && (
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                {action}
                {secondaryAction}
            </div>
        )}
    </div>
);

/** Convenience wrapper used while a real read is in flight. */
export const CubaLoadingState = ({ label = 'Loading', rows = 3, className = '' }) => (
    <div className={cx('rounded-cuba-lg border border-cuba-line bg-cuba-card p-5', className)}>
        <span className="cuba-sr-only" role="status" aria-live="polite">{label}</span>
        <div className="space-y-3" aria-hidden="true">
            {Array.from({ length: rows }).map((_, index) => (
                <CubaSkeleton
                    key={index}
                    height="0.85rem"
                    width={index === rows - 1 ? '60%' : '100%'}
                    text={`${label} progress`}
                />
            ))}
        </div>
    </div>
);

export { CubaButton };
export default CubaEmptyState;
