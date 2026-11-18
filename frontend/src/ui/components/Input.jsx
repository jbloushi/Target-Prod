import React, { useId } from 'react';

const Input = ({
    id: propId,
    label,
    icon,
    error,
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
            <div className="relative flex items-center">
                {icon && (
                    <span className="absolute start-3 text-base-content/50 pointer-events-none flex items-center justify-center">
                        {icon}
                    </span>
                )}
                <input
                    id={id}
                    className={`input input-bordered w-full text-xs font-medium bg-base-100 ${icon ? 'ps-9' : ''} ${error ? 'input-error' : ''} ${className}`}
                    {...props}
                    aria-invalid={Boolean(error)}
                    aria-describedby={ariaDescribedBy}
                />
            </div>
            {error && (
                <span id={errorId} className="block text-[11px] text-error font-semibold mt-0.5">
                    {error}
                </span>
            )}
        </div>
    );
};

export default Input;
