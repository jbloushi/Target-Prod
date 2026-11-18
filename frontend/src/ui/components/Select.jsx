import React, { useId } from 'react';

const Select = ({
    id: propId,
    label,
    error,
    children,
    className = '',
    'aria-describedby': ariaDescribedByProp,
    ...props
}) => {
    const reactId = useId();
    const id = propId || reactId;
    const errorId = error ? `${id}-error` : undefined;
    const ariaDescribedBy = [ariaDescribedByProp, errorId].filter(Boolean).join(' ') || undefined;

    return (
        <div className="w-full space-y-1">
            {label && (
                <label htmlFor={id} className="block text-[11px] font-bold uppercase tracking-wider text-base-content/70">
                    {label}
                </label>
            )}
            <select
                id={id}
                className={`select select-bordered w-full text-xs font-medium bg-base-100 ${error ? 'select-error' : ''} ${className}`}
                {...props}
                aria-invalid={Boolean(error)}
                aria-describedby={ariaDescribedBy}
            >
                {children}
            </select>
            {error && (
                <span id={errorId} className="block text-[11px] text-error font-semibold mt-0.5">
                    {error}
                </span>
            )}
        </div>
    );
};

export default Select;
