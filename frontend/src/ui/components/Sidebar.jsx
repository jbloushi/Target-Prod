import React from 'react';
import { useNavigate } from 'react-router-dom';

const Sidebar = ({ user, items = [], activeItem, className = '' }) => {
  const navigate = useNavigate();

  return (
    <aside className={`w-60 bg-base-100 border-e border-base-200 py-6 h-screen flex flex-col ${className}`}>
      <div className="flex flex-col items-center gap-2 px-3 pb-5 border-b border-base-200 mb-4">
        <div className="w-10 h-10 rounded-full bg-primary text-primary-content flex items-center justify-center font-bold">
          {user?.name?.[0] || 'U'}
        </div>
        <div className="text-center">
          <h3 className="text-xs font-bold text-base-content m-0">{user?.name || 'User'}</h3>
          <p className="text-[11px] text-base-content/60 m-0">{user?.role || 'Staff'}</p>
        </div>
      </div>
      <ul className="menu menu-sm w-full p-2 space-y-1">
        {items.map((item, index) => (
          <li key={index}>
            <button
              type="button"
              disabled={item.disabled}
              className={`flex items-center gap-2.5 font-bold ${activeItem === item.id ? 'active' : ''}`}
              onClick={() => !item.disabled && item.path && navigate(item.path)}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
};

export default Sidebar;
