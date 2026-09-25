import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useThemeMode } from '../../context/ThemeContext';
import { useLanguage } from '../../context/LanguageContext';
import { financeService } from '../../services/api';
import { getRoleLabel } from '../../utils/roleLabels';

/**
 * Target Logistics Global — Master Top Navigation Bar
 * Replaces the legacy sidebar with a unified, high-speed top cockpit deck.
 * Supports dual-perspective viewports (Target Operations vs Client Organizations)
 * with full Kuwait Arabic (RTL) & English (LTR) responsiveness.
 */
const Header = () => {
    const { user, logout, isAuthenticated } = useAuth();
    const { isDark, toggleTheme } = useThemeMode();
    const { lang, toggleLanguage, t, isRTL } = useLanguage();
    const navigate = useNavigate();
    const location = useLocation();

    const [userMenuOpen, setUserMenuOpen] = useState(false);
    const [opsMenuOpen, setOpsMenuOpen] = useState(false);
    const [mgmtMenuOpen, setMgmtMenuOpen] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [financeSummary, setFinanceSummary] = useState(null);

    const userMenuRef = useRef(null);
    const opsMenuRef = useRef(null);
    const mgmtMenuRef = useRef(null);

    // Close dropdowns on outside click
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
                setUserMenuOpen(false);
            }
            if (opsMenuRef.current && !opsMenuRef.current.contains(event.target)) {
                setOpsMenuOpen(false);
            }
            if (mgmtMenuRef.current && !mgmtMenuRef.current.contains(event.target)) {
                setMgmtMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Close mobile menu on route change
    useEffect(() => {
        setMobileMenuOpen(false);
        setUserMenuOpen(false);
        setOpsMenuOpen(false);
        setMgmtMenuOpen(false);
    }, [location.pathname]);

    // Fetch finance balance for accounts
    useEffect(() => {
        if (!isAuthenticated) return;
        financeService.getBalance()
            .then(res => setFinanceSummary(res.data))
            .catch(() => {});
    }, [isAuthenticated, user]);

    // Role-based capabilities
    const userRole = user?.role || 'client';
    const isStaff = ['admin', 'manager', 'accounting', 'staff'].includes(userRole);
    const isAdminOrOwnerOrAcct = ['admin', 'manager', 'accounting'].includes(userRole);
    const isDriver = userRole === 'driver';
    const isCompanyManager = userRole === 'org_manager';

    // Check if route is active
    const isActive = (path) => {
        if (path === '/dashboard') return location.pathname === '/dashboard' || location.pathname === '/dashboard-v2';
        return location.pathname.startsWith(path);
    };

    return (
        <header className="fixed top-0 inset-x-0 z-50 h-16 bg-base-100/90 dark:bg-slate-900/90 backdrop-blur-xl border-b border-base-200 dark:border-slate-800 transition-colors duration-200">
            <div className="max-w-[1800px] mx-auto h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
                
                {/* ── Brand & Navigation Group ──────────────────────── */}
                <div className="flex items-center gap-3 lg:gap-8">
                    {/* Mobile Hamburger Button */}
                    {isAuthenticated && (
                        <button
                            type="button"
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            className="lg:hidden btn btn-ghost btn-square btn-sm rounded-xl text-base-content"
                            aria-label="Toggle navigation menu"
                        >
                            <span className="material-symbols-outlined text-2xl">
                                {mobileMenuOpen ? 'close' : 'menu'}
                            </span>
                        </button>
                    )}

                    {/* Target Logistics Brand Logo */}
                    <Link 
                        to={isAuthenticated ? "/dashboard" : "/"} 
                        className="flex items-center gap-2.5 group cursor-pointer"
                    >
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-blue-700 flex items-center justify-center text-white shadow-md shadow-primary/25 group-hover:scale-105 active:scale-95 transition-transform duration-200">
                            <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                                rocket_launch
                            </span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-base font-black tracking-tight text-base-content group-hover:text-primary transition-colors">
                                TARGET<span className="text-primary font-bold">.</span>
                            </span>
                            <span className="text-[9.5px] font-extrabold tracking-widest uppercase text-base-content/50 -mt-1">
                                {isStaff ? (isRTL ? 'إدارة الشبكة' : 'Network Ops') : (isRTL ? 'حساب الشركات' : 'Client Portal')}
                            </span>
                        </div>
                    </Link>

                    {/* Desktop Navigation Links */}
                    {isAuthenticated && (
                        <nav className="hidden lg:flex items-center gap-1 xl:gap-2">
                            {/* Dashboard */}
                            <Link
                                to="/dashboard"
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                                    isActive('/dashboard')
                                        ? 'bg-primary/10 text-primary font-black shadow-xs'
                                        : 'text-base-content/70 hover:text-base-content hover:bg-base-200/60'
                                }`}
                            >
                                <span className="material-symbols-outlined text-base">speed</span>
                                <span>{t('nav_dashboard', 'Dashboard')}</span>
                            </Link>

                            {/* Shipments */}
                            <Link
                                to="/shipments"
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                                    isActive('/shipments')
                                        ? 'bg-primary/10 text-primary font-black shadow-xs'
                                        : 'text-base-content/70 hover:text-base-content hover:bg-base-200/60'
                                }`}
                            >
                                <span className="material-symbols-outlined text-base">local_shipping</span>
                                <span>{t('nav_shipments', 'Shipments')}</span>
                            </Link>

                            {/* Operations Dropdown */}
                            <div className="relative" ref={opsMenuRef}>
                                <button
                                    type="button"
                                    onClick={() => { setOpsMenuOpen(!opsMenuOpen); setMgmtMenuOpen(false); }}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                                        isActive('/warehouse') || isActive('/driver') || isActive('/address-book') || isActive('/shipment/new')
                                            ? 'bg-primary/10 text-primary font-black'
                                            : 'text-base-content/70 hover:text-base-content hover:bg-base-200/60'
                                    }`}
                                >
                                    <span className="material-symbols-outlined text-base">alt_route</span>
                                    <span>{isRTL ? 'العمليات' : 'Operations'}</span>
                                    <span className="material-symbols-outlined text-xs opacity-60">expand_more</span>
                                </button>

                                {opsMenuOpen && (
                                    <div className="absolute top-full mt-2 start-0 w-56 p-1.5 bg-base-100 border border-base-200 rounded-2xl shadow-xl z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                                        <Link
                                            to="/shipment/new"
                                            className="flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-base-content hover:bg-primary/10 hover:text-primary rounded-xl transition-colors"
                                        >
                                            <span className="material-symbols-outlined text-base text-primary">add_circle</span>
                                            <span>{isRTL ? 'إنشاء شحنة جديدة' : 'New Consignment'}</span>
                                        </Link>

                                        {isStaff && (
                                            <Link
                                                to="/warehouse/scan"
                                                className="flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-base-content hover:bg-primary/10 hover:text-primary rounded-xl transition-colors"
                                            >
                                                <span className="material-symbols-outlined text-base text-info">qr_code_scanner</span>
                                                <span>{isRTL ? 'ماسح المستودع' : 'Warehouse Scanner'}</span>
                                            </Link>
                                        )}

                                        {(isStaff || isDriver) && (
                                            <Link
                                                to="/driver/pickup"
                                                className="flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-base-content hover:bg-primary/10 hover:text-primary rounded-xl transition-colors"
                                            >
                                                <span className="material-symbols-outlined text-base text-warning">local_shipping</span>
                                                <span>{isRTL ? 'مسار السائق والاستلام' : 'Driver Pickups'}</span>
                                            </Link>
                                        )}

                                        <Link
                                            to="/address-book"
                                            className="flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-base-content hover:bg-primary/10 hover:text-primary rounded-xl transition-colors"
                                        >
                                            <span className="material-symbols-outlined text-base text-base-content/60">menu_book</span>
                                            <span>{isRTL ? 'دليل العناوين' : 'Address Book'}</span>
                                        </Link>
                                    </div>
                                )}
                            </div>

                            {/* Management Dropdown (Admin, Owner, Accounting, Org Manager) */}
                            {(isAdminOrOwnerOrAcct || isCompanyManager) && (
                                <div className="relative" ref={mgmtMenuRef}>
                                    <button
                                        type="button"
                                        onClick={() => { setMgmtMenuOpen(!mgmtMenuOpen); setOpsMenuOpen(false); }}
                                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                                            isActive('/admin') || isActive('/api-docs')
                                                ? 'bg-primary/10 text-primary font-black'
                                                : 'text-base-content/70 hover:text-base-content hover:bg-base-200/60'
                                        }`}
                                    >
                                        <span className="material-symbols-outlined text-base">admin_panel_settings</span>
                                        <span>{isRTL ? 'الإدارة والشركات' : 'Management'}</span>
                                        <span className="material-symbols-outlined text-xs opacity-60">expand_more</span>
                                    </button>

                                    {mgmtMenuOpen && (
                                        <div className="absolute top-full mt-2 start-0 w-60 p-1.5 bg-base-100 border border-base-200 rounded-2xl shadow-xl z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                                            {isAdminOrOwnerOrAcct && (
                                                <Link
                                                    to="/admin/organizations"
                                                    className="flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-base-content hover:bg-primary/10 hover:text-primary rounded-xl transition-colors"
                                                >
                                                    <span className="material-symbols-outlined text-base text-primary">corporate_fare</span>
                                                    <div>
                                                        <p>{isRTL ? 'المؤسسات وهوامش الربح' : 'Organizations & Markups'}</p>
                                                        <p className="text-[10px] text-base-content/50 font-normal">{isRTL ? 'تسعير النواقل والائتمان' : 'Pricing & Credit Limits'}</p>
                                                    </div>
                                                </Link>
                                            )}

                                            <Link
                                                to="/admin/users"
                                                className="flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-base-content hover:bg-primary/10 hover:text-primary rounded-xl transition-colors"
                                            >
                                                <span className="material-symbols-outlined text-base text-secondary">people</span>
                                                <div>
                                                    <p>{isRTL ? 'المستخدمون والصلاحيات' : 'Users & RBAC'}</p>
                                                    <p className="text-[10px] text-base-content/50 font-normal">{isRTL ? 'إدارة الأعضاء والوصول' : 'Roles & Permissions'}</p>
                                                </div>
                                            </Link>

                                            {isAdminOrOwnerOrAcct && (
                                                <Link
                                                    to="/admin/whatsapp-logs"
                                                    className="flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-base-content hover:bg-primary/10 hover:text-primary rounded-xl transition-colors"
                                                >
                                                    <span className="material-symbols-outlined text-base text-success">chat</span>
                                                    <div>
                                                        <p>{isRTL ? 'سجلات وإشعارات واتساب' : 'WhatsApp Delivery Logs'}</p>
                                                        <p className="text-[10px] text-base-content/50 font-normal">{isRTL ? 'تتبع رسائل العملاء' : 'Meta Cloud API Telemetry'}</p>
                                                    </div>
                                                </Link>
                                            )}

                                            <div className="my-1 border-t border-base-200" />

                                            <Link
                                                to="/api-docs"
                                                className="flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-base-content hover:bg-primary/10 hover:text-primary rounded-xl transition-colors"
                                            >
                                                <span className="material-symbols-outlined text-base text-base-content/60">code</span>
                                                <span>{isRTL ? 'دليل الربط والمطورين (API)' : 'API Documentation'}</span>
                                            </Link>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Financials (Admin, Manager, Accounting, Staff, Org Manager, Client) */}
                            <Link
                                to="/finance"
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                                    isActive('/finance')
                                        ? 'bg-primary/10 text-primary font-black shadow-xs'
                                        : 'text-base-content/70 hover:text-base-content hover:bg-base-200/60'
                                }`}
                            >
                                <span className="material-symbols-outlined text-base">account_balance_wallet</span>
                                <span>{t('nav_financials', 'Financials')}</span>
                            </Link>
                        </nav>
                    )}
                </div>

                {/* ── Right Actions & Profile Hub ───────────────────── */}
                <div className="flex items-center gap-2 sm:gap-3">
                    {/* Quick "+ New Shipment" CTA Button */}
                    {isAuthenticated && (
                        <Link
                            to="/shipment/new"
                            className="hidden sm:inline-flex btn btn-primary btn-sm rounded-xl font-bold gap-1.5 shadow-sm text-xs"
                        >
                            <span className="material-symbols-outlined text-base">add</span>
                            <span>{isRTL ? 'شحنة جديدة' : 'New Shipment'}</span>
                        </Link>
                    )}

                    {/* Financial Balance Badge (For Client & B2B accounts) */}
                    {isAuthenticated && (
                        <Link
                            to="/finance"
                            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/5 hover:bg-primary/10 border border-primary/15 transition-colors cursor-pointer"
                            title={isRTL ? 'الرصيد المتاح' : 'Available Balance'}
                        >
                            <span className="material-symbols-outlined text-primary text-base">payments</span>
                            <span className="text-xs font-extrabold text-primary font-mono">
                                {parseFloat(financeSummary?.balance || user?.organization?.creditLimit || 0).toFixed(3)} {isRTL ? 'د.ك' : 'KWD'}
                            </span>
                        </Link>
                    )}

                    {/* Language Switcher */}
                    <button
                        type="button"
                        onClick={toggleLanguage}
                        className="btn btn-ghost btn-sm px-2.5 rounded-xl font-extrabold text-xs flex items-center gap-1.5 border border-base-300/80 hover:bg-base-200 transition-colors"
                        title={lang === 'en' ? "التحويل للغة العربية" : "Switch to English"}
                    >
                        <span className="material-symbols-outlined text-sm text-primary">translate</span>
                        <span className="font-semibold">{lang === 'en' ? '🇰🇼 عربي' : '🇬🇧 EN'}</span>
                    </button>

                    {/* Dark/Light Theme Toggle */}
                    <button
                        type="button"
                        onClick={toggleTheme}
                        className="btn btn-ghost btn-square btn-sm rounded-xl text-base-content/70 hover:text-base-content border border-base-300/80 hover:bg-base-200 transition-colors"
                        title={isDark ? "Light Mode" : "Dark Mode"}
                    >
                        <span className="material-symbols-outlined text-lg">
                            {isDark ? 'light_mode' : 'dark_mode'}
                        </span>
                    </button>

                    {/* User Profile Menu */}
                    {isAuthenticated ? (
                        <div className="relative" ref={userMenuRef}>
                            <button
                                type="button"
                                onClick={() => setUserMenuOpen(!userMenuOpen)}
                                className="flex items-center gap-2 p-1 rounded-xl hover:bg-base-200/80 transition-colors cursor-pointer border border-transparent hover:border-base-300"
                            >
                                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-blue-700 flex items-center justify-center text-white text-xs font-black shadow-sm overflow-hidden">
                                    {user?.avatar ? (
                                        <img src={user.avatar} alt="User" className="w-full h-full object-cover" />
                                    ) : (
                                        <span>{user?.name?.[0]?.toUpperCase() || 'U'}</span>
                                    )}
                                </div>
                                <span className="hidden sm:inline-block material-symbols-outlined text-base-content/60 text-sm">
                                    expand_more
                                </span>
                            </button>

                            {/* User Profile Dropdown */}
                            {userMenuOpen && (
                                <div className="absolute top-full mt-2 end-0 w-64 p-2 bg-base-100 border border-base-200 rounded-2xl shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                                    <div className="px-3 py-2.5 mb-1 bg-base-200/50 rounded-xl">
                                        <p className="text-xs font-black text-base-content truncate">{user?.name}</p>
                                        <p className="text-[11px] text-base-content/60 truncate">{user?.email}</p>
                                        <div className="mt-1.5 flex items-center gap-1.5">
                                            <span className="badge badge-primary badge-xs font-bold uppercase text-[9px] px-2 py-1">
                                                {getRoleLabel(user?.role)}
                                            </span>
                                            {user?.organization?.name && (
                                                <span className="text-[10px] text-base-content/60 font-semibold truncate">
                                                    • {user.organization.name}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <Link
                                        to="/settings"
                                        onClick={() => setUserMenuOpen(false)}
                                        className="flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-base-content hover:bg-base-200 rounded-xl transition-colors"
                                    >
                                        <span className="material-symbols-outlined text-base text-base-content/60">settings</span>
                                        <span>{isRTL ? 'إعدادات الحساب' : 'Account Settings'}</span>
                                    </Link>

                                    <Link
                                        to="/track"
                                        onClick={() => setUserMenuOpen(false)}
                                        className="flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-base-content hover:bg-base-200 rounded-xl transition-colors"
                                    >
                                        <span className="material-symbols-outlined text-base text-base-content/60">travel_explore</span>
                                        <span>{isRTL ? 'بوابة التتبع العامة' : 'Public Tracking Portal'}</span>
                                    </Link>

                                    <div className="my-1 border-t border-base-200" />

                                    <button
                                        type="button"
                                        onClick={() => { setUserMenuOpen(false); logout(); }}
                                        className="flex items-center gap-2.5 w-full px-3 py-2 text-xs font-bold text-error hover:bg-error/10 rounded-xl transition-colors text-start"
                                    >
                                        <span className="material-symbols-outlined text-base">logout</span>
                                        <span>{isRTL ? 'تسجيل الخروج' : 'Sign Out'}</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <Link
                            to="/login"
                            className="btn btn-primary btn-sm rounded-xl font-bold text-xs"
                        >
                            {isRTL ? 'تسجيل الدخول' : 'Sign In'}
                        </Link>
                    )}
                </div>
            </div>

            {/* ── Mobile Navigation Drawer Menu ──────────────────── */}
            {mobileMenuOpen && (
                <div className="lg:hidden bg-base-100 border-b border-base-200 px-4 py-4 space-y-3 shadow-xl max-h-[80vh] overflow-y-auto">
                    <div className="grid grid-cols-2 gap-2">
                        <Link
                            to="/dashboard"
                            className={`p-3 rounded-xl flex items-center gap-2 text-xs font-bold border ${
                                isActive('/dashboard') ? 'bg-primary/10 border-primary text-primary' : 'bg-base-200/50 border-base-200 text-base-content'
                            }`}
                        >
                            <span className="material-symbols-outlined text-lg">speed</span>
                            <span>{t('nav_dashboard', 'Dashboard')}</span>
                        </Link>

                        <Link
                            to="/shipments"
                            className={`p-3 rounded-xl flex items-center gap-2 text-xs font-bold border ${
                                isActive('/shipments') ? 'bg-primary/10 border-primary text-primary' : 'bg-base-200/50 border-base-200 text-base-content'
                            }`}
                        >
                            <span className="material-symbols-outlined text-lg">local_shipping</span>
                            <span>{t('nav_shipments', 'Shipments')}</span>
                        </Link>

                        <Link
                            to="/shipment/new"
                            className="p-3 rounded-xl flex items-center gap-2 text-xs font-bold bg-primary text-primary-content"
                        >
                            <span className="material-symbols-outlined text-lg">add_circle</span>
                            <span>{isRTL ? 'شحنة جديدة' : 'New Shipment'}</span>
                        </Link>

                        <Link
                            to="/finance"
                            className={`p-3 rounded-xl flex items-center gap-2 text-xs font-bold border ${
                                isActive('/finance') ? 'bg-primary/10 border-primary text-primary' : 'bg-base-200/50 border-base-200 text-base-content'
                            }`}
                        >
                            <span className="material-symbols-outlined text-lg">account_balance_wallet</span>
                            <span>{t('nav_financials', 'Financials')}</span>
                        </Link>
                    </div>

                    {/* Operations Hub */}
                    <div className="pt-2 border-t border-base-200">
                        <p className="text-[10px] font-black uppercase tracking-wider text-base-content/50 mb-2">
                            {isRTL ? 'العمليات والميدان' : 'Field Operations'}
                        </p>
                        <div className="space-y-1">
                            {isStaff && (
                                <Link
                                    to="/warehouse/scan"
                                    className="flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-lg hover:bg-base-200 text-base-content"
                                >
                                    <span className="material-symbols-outlined text-base text-info">qr_code_scanner</span>
                                    <span>{isRTL ? 'ماسح المستودع' : 'Warehouse Scanner'}</span>
                                </Link>
                            )}
                            {(isStaff || isDriver) && (
                                <Link
                                    to="/driver/pickup"
                                    className="flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-lg hover:bg-base-200 text-base-content"
                                >
                                    <span className="material-symbols-outlined text-base text-warning">local_shipping</span>
                                    <span>{isRTL ? 'مسار السائق والاستلام' : 'Driver Pickups'}</span>
                                </Link>
                            )}
                            <Link
                                to="/address-book"
                                className="flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-lg hover:bg-base-200 text-base-content"
                            >
                                <span className="material-symbols-outlined text-base text-base-content/60">menu_book</span>
                                <span>{isRTL ? 'دليل العناوين' : 'Address Book'}</span>
                            </Link>
                        </div>
                    </div>

                    {/* Management Section */}
                    {(isAdminOrOwnerOrAcct || isCompanyManager) && (
                        <div className="pt-2 border-t border-base-200">
                            <p className="text-[10px] font-black uppercase tracking-wider text-base-content/50 mb-2">
                                {isRTL ? 'الإدارة والحسابات' : 'Management & Governance'}
                            </p>
                            <div className="space-y-1">
                                {isAdminOrOwnerOrAcct && (
                                    <Link
                                        to="/admin/organizations"
                                        className="flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-lg hover:bg-base-200 text-base-content"
                                    >
                                        <span className="material-symbols-outlined text-base text-primary">corporate_fare</span>
                                        <span>{isRTL ? 'المؤسسات وهوامش الربح' : 'Organizations & Markups'}</span>
                                    </Link>
                                )}
                                <Link
                                    to="/admin/users"
                                    className="flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-lg hover:bg-base-200 text-base-content"
                                >
                                    <span className="material-symbols-outlined text-base text-secondary">people</span>
                                    <span>{isRTL ? 'المستخدمون والصلاحيات' : 'Users & RBAC'}</span>
                                </Link>
                                {isAdminOrOwnerOrAcct && (
                                    <Link
                                        to="/admin/whatsapp-logs"
                                        className="flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-lg hover:bg-base-200 text-base-content"
                                    >
                                        <span className="material-symbols-outlined text-base text-success">chat</span>
                                        <span>{isRTL ? 'سجلات واتساب' : 'WhatsApp Delivery Logs'}</span>
                                    </Link>
                                )}
                                <Link
                                    to="/api-docs"
                                    className="flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-lg hover:bg-base-200 text-base-content"
                                >
                                    <span className="material-symbols-outlined text-base text-base-content/60">code</span>
                                    <span>{isRTL ? 'دليل الربط والمطورين (API)' : 'API Documentation'}</span>
                                </Link>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </header>
    );
};

export default Header;
