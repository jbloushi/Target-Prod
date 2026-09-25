import React from 'react';

export const FilterChip = ({ label, selected = false, onClick, icon, count, disabled = false, className = '', ...props }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`btn btn-xs rounded-lg gap-1.5 font-bold transition-all ${
        selected
          ? 'btn-primary text-primary-content shadow-xs'
          : 'btn-outline border-base-300 text-base-content/70 hover:border-primary hover:text-primary'
      } ${className}`}
      {...props}
    >
      {icon && <span className="material-symbols-outlined text-sm">{icon}</span>}
      <span>{label}</span>
      {count !== undefined && count !== null && (
        <span
          className={`badge badge-xs font-bold ${
            selected ? 'bg-primary-content text-primary' : 'bg-base-200 text-base-content/60'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
};

export default FilterChip;
