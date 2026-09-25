import React from 'react';

const PageHeader = ({ title, description, action, secondaryAction, align = 'left', className = '' }) => {
    const isCenter = align === 'center';

    return (
        <div className={`mb-8 flex flex-wrap gap-4 ${isCenter ? 'justify-center text-center' : 'justify-between items-start'} ${className}`}>
            <div className={`flex flex-col gap-1.5 ${isCenter ? 'items-center' : 'items-start'}`}>
                <h1 className="text-2xl sm:text-3xl font-black text-base-content tracking-tight leading-tight">
                    {title}
                </h1>
                {description && (
                    <p className="text-xs sm:text-sm text-base-content/60 max-w-2xl leading-relaxed">
                        {description}
                    </p>
                )}
            </div>

            {(action || secondaryAction) && (
                <div className="flex items-center gap-2.5">
                    {secondaryAction}
                    {action}
                </div>
            )}
        </div>
    );
};

export default PageHeader;
