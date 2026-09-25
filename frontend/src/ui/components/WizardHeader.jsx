import React from 'react';

const WizardHeader = ({ title, currentStep, totalSteps, timeEstimate, className = '' }) => {
    const percentage = Math.min(100, Math.max(0, (currentStep / totalSteps) * 100));

    return (
        <div className={`mb-8 ${className}`}>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div>
                    <h1 className="text-2xl font-black text-base-content tracking-tight">{title}</h1>
                    <div className="text-xs font-semibold text-base-content/60">
                        Setup | Step {currentStep} of {totalSteps}
                    </div>
                </div>
                {timeEstimate && (
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-primary/10 text-primary rounded-lg text-xs font-bold">
                        <span className="material-symbols-outlined text-sm">schedule</span>
                        Est: {timeEstimate}
                    </div>
                )}
            </div>
            <progress
                className="progress progress-primary w-full h-1.5"
                value={percentage}
                max="100"
            />
        </div>
    );
};

export default WizardHeader;
