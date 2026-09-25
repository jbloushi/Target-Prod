import React from 'react';

const Input = ({ label, icon, error, className = '', ...props }) => {
    return (
        <div className="w-full space-y-1">
            {label && (
                <label className="block text-[11px] font-bold uppercase tracking-wider text-base-content/70">
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
                    className={`input input-bordered w-full text-xs font-medium bg-base-100 ${icon ? 'ps-9' : ''} ${error ? 'input-error' : ''} ${className}`}
                    {...props}
                />
            </div>
            {error && <span className="block text-[11px] text-error font-semibold mt-0.5">{error}</span>}
        </div>
    );
};

export default Input;
