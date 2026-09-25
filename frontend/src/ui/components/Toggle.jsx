import React from 'react';

const Toggle = ({ label, subLabel, checked, onChange, className = '' }) => {
    return (
        <label className={`flex items-center gap-3 p-3 bg-base-100 border border-base-200 rounded-xl cursor-pointer select-none hover:bg-base-200/40 transition-colors ${className}`}>
            <input
                type="checkbox"
                checked={checked}
                onChange={(e) => onChange && onChange(e.target.checked)}
                className="toggle toggle-primary toggle-sm"
            />
            {(label || subLabel) && (
                <div className="flex flex-col gap-0.5">
                    {label && <strong className="text-xs font-bold text-base-content">{label}</strong>}
                    {subLabel && <small className="text-[11px] text-base-content/60">{subLabel}</small>}
                </div>
            )}
        </label>
    );
};

export default Toggle;
