import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';

/**
 * Premium Sidebar Component (Kinetic Horizon)
 * Rebuilt to match the 'Global Ops' aesthetic with full English & Kuwaiti Arabic bilingual support.
 */
const Sidebar = ({ isCollapsed, toggleCollapse, isMobileOpen = false, closeMobile }) => {
    const { user, logout } = useAuth();
    const { t, lang, toggleLanguage } = useLanguage();
    const navigate = useNavigate();

    const menuItems = [
        { key: 'nav_dashboard', defaultText: 'Dashboard', icon: 'speed', path: '/dashboard' },
        { key: 'nav_shipments', defaultText: 'Shipments', icon: 'local_shipping', path: '/shipments' },
        { key: 'nav_organizations', defaultText: 'Organizations', icon: 'corporate_fare', path: '/admin/organizations', roles: ['admin', 'staff', 'manager'] },
        { key: 'nav_users', defaultText: 'Users', icon: 'people', path: '/admin/users', roles: ['admin', 'org_manager'] },
        { key: 'nav_analytics', defaultText: 'Analytics', icon: 'analytics', path: '/analytics', roles: ['admin', 'accounting', 'manager'] },
        { key: 'nav_fleets', defaultText: 'Fleet Ops', icon: 'directions_bus', path: '/fleets', roles: ['admin', 'accounting', 'manager'] },
        { key: 'nav_warehouse', defaultText: 'Inventory', icon: 'inventory_2', path: '/warehouse/scan', roles: ['admin', 'staff', 'manager'] },
        { key: 'nav_address_book', defaultText: 'Address Book', icon: 'menu_book', path: '/address-book' },
        { key: 'nav_whatsapp_logs', defaultText: 'WhatsApp Logs', icon: 'chat', path: '/admin/whatsapp-logs', roles: ['admin', 'staff', 'manager'] },
        { key: 'nav_api_docs', defaultText: 'API Docs', icon: 'api', path: '/api-docs' },
        { key: 'nav_financials', defaultText: 'Financials', icon: 'account_balance_wallet', path: '/finance', roles: ['admin', 'accounting', 'manager', 'staff', 'org_manager', 'org_agent', 'client'] },
        { key: 'nav_settings', defaultText: 'Settings', icon: 'settings', path: '/settings' },
    ];

    const filteredItems = menuItems.filter(item => 
        !item.roles || item.roles.includes(user?.role)
    );

    return (
        <>
            {/* Mobile Backdrop Overlay */}
            {isMobileOpen && (
                <div 
                    onClick={closeMobile}
                    className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[140] lg:hidden transition-opacity duration-300 animate-in fade-in"
                    aria-hidden="true"
                />
            )}

            <aside 
                className={`h-screen fixed top-0 start-0 bg-white dark:bg-slate-900 border-e border-outline/10 dark:border-white/5 flex flex-col py-6 transition-transform duration-300 z-[150] ${
                    isCollapsed ? 'lg:w-20' : 'lg:w-[240px]'
                } w-[240px] ${
                    isMobileOpen 
                        ? 'translate-x-0 rtl:translate-x-0 shadow-2xl' 
                        : '-translate-x-full rtl:translate-x-full lg:translate-x-0 rtl:lg:translate-x-0'
                }`}
            >
                {/* Branding Header */}
                <div className={`px-5 mb-8 transition-all duration-300 ${isCollapsed ? 'lg:items-center lg:flex lg:flex-col' : ''}`}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div 
                                onClick={() => { navigate('/dashboard'); closeMobile?.(); }}
                                className="w-10 h-10 kinetic-gradient rounded-xl flex items-center justify-center text-white shadow-lg shadow-primary/25 cursor-pointer hover:scale-105 active:scale-95 transition-all"
                            >
                                <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                                    {isCollapsed ? 'dashboard_customize' : 'rocket_launch'}
                                </span>
                            </div>
                            {(!isCollapsed || isMobileOpen) && (
                                <div className="animate-in fade-in slide-in-from-left-2 rtl:slide-in-from-right-2 duration-300">
                                    <h3 className="text-base font-black text-on-surface leading-tight tracking-tight">
                                        {t('brand_name', 'Target Global')}
                                    </h3>
                                    <p className="text-[10px] text-on-surface-variant font-black uppercase tracking-widest opacity-60">
                                        {t('ops_suite', 'Operations Suite')}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Mobile Close Button */}
                        <button
                            type="button"
                            onClick={closeMobile}
                            className="lg:hidden p-1.5 rounded-xl text-on-surface-variant hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                            aria-label="Close navigation menu"
                        >
                            <span className="material-symbols-outlined text-xl">close</span>
                        </button>
                    </div>
                </div>

                {/* Navigation Menu */}
                <nav className="flex-1 space-y-1.5 px-3 overflow-y-auto no-scrollbar">
                    {filteredItems.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            onClick={() => closeMobile?.()}
                            className={({ isActive }) => `
                                flex items-center gap-3 px-3 py-3 rounded-xl transition-all font-bold group
                                ${isActive 
                                    ? 'bg-primary/10 text-primary shadow-sm shadow-primary/5 border-l-4 rtl:border-r-4 rtl:border-l-0 border-primary rounded-l-none rtl:rounded-r-none rtl:rounded-l-xl' 
                                    : 'text-on-surface-variant hover:bg-slate-50 dark:hover:bg-white/5 hover:text-on-surface'
                                }
                                ${isCollapsed ? 'lg:justify-center lg:px-0' : ''}
                            `}
                        >
                            <span className="material-symbols-outlined text-2xl transition-transform group-active:scale-90">
                                {item.icon}
                            </span>
                            {(!isCollapsed || isMobileOpen) && (
                                <span className="text-sm tracking-tight truncate animate-in fade-in duration-300">
                                    {t(item.key, item.defaultText)}
                                </span>
                            )}
                        </NavLink>
                    ))}
                </nav>

                {/* Footer Actions */}
                <div className="px-3 mt-auto space-y-1.5">
                    {/* Language Switcher */}
                    <button
                        onClick={toggleLanguage}
                        className="flex items-center gap-3 w-full px-3 py-2.5 bg-surface-container-low dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl transition-all font-bold group border border-outline/5 text-on-surface justify-center"
                        title={lang === 'en' ? "التحويل للغة العربية (الكويت)" : "Switch to English"}
                    >
                        <span className="material-symbols-outlined text-xl text-primary transition-transform group-hover:scale-110">
                            translate
                        </span>
                        {(!isCollapsed || isMobileOpen) && (
                            <span className="text-sm font-black tracking-widest text-primary flex items-center justify-center">
                                EN &lt;&gt; ع
                            </span>
                        )}
                    </button>

                    {/* Collapse Toggle (Desktop only) */}
                    <button 
                        onClick={toggleCollapse}
                        className="hidden lg:flex items-center gap-3 w-full px-3 py-2.5 text-on-surface-variant hover:bg-slate-50 dark:hover:bg-white/5 rounded-xl transition-all font-bold group"
                    >
                        <span className="material-symbols-outlined text-2xl transition-transform group-hover:rotate-12">
                            {isCollapsed ? 'dock_to_right' : 'dock_to_left'}
                        </span>
                        {!isCollapsed && <span className="text-sm">{t('collapse_view', 'Collapse View')}</span>}
                    </button>
                </div>
                
                {/* User Profile Summary (Bottom) */}
                {(!isCollapsed || isMobileOpen) && (
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
        </>
    );
};

export default Sidebar;
