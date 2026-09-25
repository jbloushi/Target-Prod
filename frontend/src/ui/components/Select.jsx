import React from 'react';

const Select = ({ label, children, className = '', ...props }) => {
    return (
        <div className="w-full space-y-1">
            {label && (
                <label className="block text-[11px] font-bold uppercase tracking-wider text-base-content/70">
                    {label}
                </label>
            )}
            <select
                className={`select select-bordered w-full text-xs font-medium bg-base-100 ${className}`}
                {...props}
            >
                {children}
            </select>
        </div>
    );
};

export default Select;
