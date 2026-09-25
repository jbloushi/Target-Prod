import React from 'react';

export const Tab = ({ active, onClick, children, icon, className = '' }) => (
    <button
        type="button"
        onClick={onClick}
        className={`tab font-bold text-xs gap-2 transition-all ${active ? 'tab-active text-primary border-b-2 border-primary font-black' : 'text-base-content/60'} ${className}`}
    >
        {icon}
        {children}
    </button>
);

export const Tabs = ({ children, className = '' }) => (
    <div className={`tabs tabs-bordered mb-6 ${className}`}>
        {children}
    </div>
);

export default Tabs;
