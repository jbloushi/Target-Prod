import React from 'react';

const Button = ({ children, variant = 'primary', icon, fullWidth, className = '', ...props }) => {
  const variantClass = variant === 'primary'
    ? 'btn-primary'
    : variant === 'secondary'
      ? 'btn-outline'
      : variant === 'ghost'
        ? 'btn-ghost'
        : variant === 'outline'
          ? 'btn-outline'
          : variant === 'icon'
            ? 'btn-square btn-ghost'
            : 'btn-neutral';

  return (
    <button
      className={`btn ${variantClass} ${fullWidth ? 'w-full' : ''} font-bold text-xs gap-2 ${className}`}
      {...props}
    >
      {icon && <span className="btn-icon inline-flex items-center">{icon}</span>}
      {children}
    </button>
  );
};

export default Button;
