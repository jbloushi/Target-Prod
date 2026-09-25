import React from 'react';

/**
 * EmptyState - DaisyUI v4 + Tailwind CSS component
 */
export const EmptyState = ({
  title = 'No data available',
  description = 'Get started by creating your first item.',
  icon,
  action,
  image,
}) => {
  return (
    <div className="card bg-base-100 border border-dashed border-base-300 p-8 sm:p-12 text-center flex flex-col items-center justify-center min-h-[300px]">
      {image ? (
        <img src={image} alt="Empty" className="w-48 h-auto mb-4 opacity-80" />
      ) : icon ? (
        <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4 text-3xl">
          {icon}
        </div>
      ) : null}

      <h3 className="text-lg sm:text-xl font-black text-base-content tracking-tight mb-1">
        {title}
      </h3>

      <p className="text-xs sm:text-sm text-base-content/60 max-w-md mx-auto mb-6 leading-relaxed">
        {description}
      </p>

      {action && <div>{action}</div>}
    </div>
  );
};

export default EmptyState;
