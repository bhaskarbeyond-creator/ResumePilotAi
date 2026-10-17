import React from 'react';

const cx = (...parts) => parts.filter(Boolean).join(' ');

const VARIANTS = {
    primary:
        'btn btn-primary bg-cuba-primary-fill text-cuba-on-primary hover:brightness-110 disabled:hover:bg-cuba-primary-fill shadow-cuba-sm shadow-sm',
    secondary:
        'btn btn-light bg-cuba-primary-soft text-cuba-primary hover:bg-cuba-primary-soft-hover border border-transparent',
    outline:
        'btn btn-outline-secondary border border-cuba-line-strong bg-transparent text-cuba-ink hover:bg-cuba-primary-soft',
    ghost:
        'btn btn-link bg-transparent text-cuba-ink-muted hover:bg-cuba-primary-soft hover:text-cuba-ink text-decoration-none',
    danger: 'btn btn-danger bg-cuba-danger text-white hover:brightness-95 shadow-cuba-sm shadow-sm',
};

const SIZES = {
    sm: 'h-9 px-3 text-[13px] gap-1.5',
    md: 'h-10 px-4 text-sm gap-2',
    lg: 'h-12 px-6 text-[15px] gap-2',
};

const cxIcon = (size) => (size === 'lg' ? 'h-5 w-5' : size === 'sm' ? 'h-4 w-4' : 'h-[18px] w-[18px]');

/**
 * CubaButton — the single button primitive.
 *
 * A real loading state is implemented: while `loading` is true the button is
 * `disabled` AND `aria-busy`, so assistive technology and pointer users are told
 * the truth simultaneously. Never renders a fake success (§46).
 */
const CubaButton = ({
    as: Tag = 'button',
    variant = 'primary',
    size = 'md',
    loading = false,
    icon = null,
    iconRight = null,
    fullWidth = false,
    className = '',
    children,
    disabled,
    type,
    ...rest
}) => {
    const isNativeButton = Tag === 'button';
    const isDisabled = disabled || loading;

    return (
        <Tag
            // A native <button> inside a form must not default to type="submit"
            // unless the caller asked for it.
            type={isNativeButton ? (type || 'button') : undefined}
            disabled={isNativeButton ? isDisabled : undefined}
            aria-disabled={!isNativeButton && isDisabled ? 'true' : undefined}
            aria-busy={loading ? 'true' : undefined}
            className={cx(
                'btn cuba-focusable inline-flex items-center justify-center rounded-cuba-sm font-semibold',
                'transition-[background-color,box-shadow,transform] duration-200 ease-cuba',
                'active:translate-y-px motion-reduce:transform-none',
                'disabled:cursor-not-allowed disabled:opacity-55',
                VARIANTS[variant] || VARIANTS.primary,
                SIZES[size] || SIZES.md,
                fullWidth && 'w-full',
                className,
            )}
            {...rest}
        >
            {loading && (
                <span
                    className={cx('inline-block animate-spin rounded-full border-2 border-current border-t-transparent', cxIcon(size))}
                    aria-hidden="true"
                />
            )}
            {!loading && icon}
            {children && <span className="truncate">{children}</span>}
            {!loading && iconRight}
        </Tag>
    );
};

export default CubaButton;
