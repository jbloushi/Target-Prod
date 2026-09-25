import React from 'react';

const Alert = ({ severity = 'info', children, title, className = '' }) => {
    const alertClass = severity === 'error'
        ? 'alert-error'
        : severity === 'success'
            ? 'alert-success'
            : severity === 'warning'
                ? 'alert-warning'
                : 'alert-info';

    return (
        <div className={`alert ${alertClass} text-xs py-3 px-4 rounded-xl shadow-xs mb-4 flex items-start gap-3 ${className}`}>
            <span className="material-symbols-outlined text-lg">
                {severity === 'error' ? 'error' : severity === 'success' ? 'check_circle' : severity === 'warning' ? 'warning' : 'info'}
            </span>
            <div className="flex-1">
                {title && <div className="font-extrabold mb-0.5">{title}</div>}
                <div>{children}</div>
            </div>
        </div>
    );
};

export default Alert;
