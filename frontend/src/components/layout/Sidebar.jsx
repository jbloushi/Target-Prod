import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

/**
 * Premium Sidebar Component (Kinetic Horizon)
 * Rebuilt to match the 'Global Ops' aesthetic from the high-fidelity mockup.
 * Features:
 * - Collapsible state (managed locally for now)
 * - Kinetic Horizon Branding
 * - Dynamic, Role-based Navigation
 * - Styled for Dark/Light mode compatibility
 */
const Sidebar = ({ isCollapsed, toggleCollapse }) => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const menuItems = [
        { text: 'Dashboard', icon: 'speed', path: '/dashboard' },
        { text: 'Shipments', icon: 'local_shipping', path: '/shipments' },
        { text: 'Organizations', icon: 'corporate_fare', path: '/admin/organizations', roles: ['admin', 'staff', 'manager'] },
        { text: 'Users', icon: 'people', path: '/admin/users', roles: ['admin', 'org_manager'] },
        { text: 'Analytics', icon: 'analytics', path: '/analytics', roles: ['admin', 'accounting', 'manager'] },
        { text: 'Fleet Ops', icon: 'directions_bus', path: '/fleets', roles: ['admin', 'accounting', 'manager'] },
        { text: 'Inventory', icon: 'inventory_2', path: '/warehouse/scan', roles: ['admin', 'staff', 'manager'] },
        { text: 'Address Book', icon: 'menu_book', path: '/address-book' },
        { text: 'API Docs', icon: 'api', path: '/api-docs' },
        { text: 'Financials', icon: 'account_balance_wallet', path: '/finance', roles: ['admin', 'accounting', 'manager', 'staff', 'org_manager', 'org_agent', 'client'] },
        { text: 'Settings', icon: 'settings', path: '/settings' },
    ];

    const filteredItems = menuItems.filter(item => 
        !item.roles || item.roles.includes(user?.role)
    );


    return (
        <aside 
            className={`h-screen fixed left-0 top-0 bg-white dark:bg-slate-900 border-r border-outline/10 dark:border-white/5 flex flex-col py-6 transition-all duration-300 z-[150] ${
                isCollapsed ? 'w-20' : 'w-[240px]'
            }`}
        >
            {/* Branding Header */}
            <div className={`px-5 mb-10 transition-all duration-300 ${isCollapsed ? 'items-center flex flex-col' : ''}`}>
                <div className="flex items-center gap-3">
                    <div 
                        onClick={() => navigate('/dashboard')}
                        className="w-10 h-10 kinetic-gradient rounded-xl flex items-center justify-center text-white shadow-lg shadow-primary/25 cursor-pointer hover:scale-105 active:scale-95 transition-all"
                    >
                        <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                            {isCollapsed ? 'dashboard_customize' : 'rocket_launch'}
                        </span>
                    </div>
                    {!isCollapsed && (
                        <div className="animate-in fade-in slide-in-from-left-2 duration-300">
                            <h3 className="text-lg font-black text-on-surface leading-tight tracking-tighter">Target Global</h3>
                            <p className="text-[10px] text-on-surface-variant font-black uppercase tracking-widest opacity-60">Operations Suite</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Navigation Menu */}
            <nav className="flex-1 space-y-1.5 px-3 overflow-y-auto no-scrollbar">
                {filteredItems.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) => `
                            flex items-center gap-3 px-3 py-3 rounded-xl transition-all font-bold group
                            ${isActive 
                                ? 'bg-primary/10 text-primary shadow-sm shadow-primary/5 border-l-4 border-primary rounded-l-none' 
                                : 'text-on-surface-variant hover:bg-slate-50 dark:hover:bg-white/5 hover:text-on-surface'
                            }
                            ${isCollapsed ? 'justify-center px-0' : ''}
                        `}
                    >
                        <span className="material-symbols-outlined text-2xl transition-transform group-active:scale-90">
                            {item.icon}
                        </span>
                        {!isCollapsed && (
                            <span className="text-sm tracking-tight truncate animate-in fade-in duration-300">
                                {item.text}
                            </span>
                        )}
                    </NavLink>
                ))}
            </nav>

            {/* Footer Actions */}
            <div className="px-3 mt-auto space-y-2">
                {/* Collapse Toggle */}
                <button 
                    onClick={toggleCollapse}
                    className="flex items-center gap-3 w-full px-3 py-3 text-on-surface-variant hover:bg-slate-50 dark:hover:bg-white/5 rounded-xl transition-all font-bold group"
                >
                    <span className="material-symbols-outlined text-2xl transition-transform group-hover:rotate-12">
                        {isCollapsed ? 'dock_to_right' : 'dock_to_left'}
                    </span>
                    {!isCollapsed && <span className="text-sm">Collapse View</span>}
                </button>

                {/* Sign Out */}
                <button 
                    onClick={logout}
                    className="flex items-center gap-3 w-full px-3 py-3 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-all font-black group"
                >
                    <span className="material-symbols-outlined text-2xl transition-transform group-hover:-translate-x-1">
                        logout
                    </span>
                    {!isCollapsed && <span className="text-sm">Sign Out</span>}
                </button>
            </div>
            
            {/* User Profile Summary (Bottom) */}
            {!isCollapsed && (
                <div className="mt-6 px-4 py-4 mx-3 bg-surface-container-low dark:bg-white/5 rounded-2xl border border-outline/5 transition-all hover:border-outline/10">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-white dark:bg-slate-800 shadow-sm border border-outline/10 flex items-center justify-center font-black text-primary text-xs">
                            {user?.name?.[0]}
                        </div>
                        <div className="overflow-hidden">
                            <p className="text-xs font-black text-on-surface truncate">{user?.name}</p>
                            <p className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest truncate">{user?.role}</p>
                        </div>
                    </div>
                </div>
            )}
        </aside>
    );
};

export default Sidebar;
