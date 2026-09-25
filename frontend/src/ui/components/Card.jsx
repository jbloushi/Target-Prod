import React from 'react';

const Card = ({ children, title, variant = 'default', actions, className = '', ...props }) => {
  const borderHighlight = variant === 'shipper' 
    ? 'ring-2 ring-primary' 
    : variant === 'receiver' 
      ? 'ring-2 ring-secondary' 
      : '';

  return (
    <div
      className={`card bg-base-100 border border-base-200 p-6 shadow-xs rounded-2xl ${borderHighlight} ${className}`}
      {...props}
    >
      {title ? (
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-base-200">
          <h3 className="font-extrabold text-base text-base-content flex items-center gap-2">
            {title}
          </h3>
          {actions && <div className="ms-auto flex items-center gap-2">{actions}</div>}
        </div>
      ) : null}
      {children}
    </div>
  );
};

export default Card;
