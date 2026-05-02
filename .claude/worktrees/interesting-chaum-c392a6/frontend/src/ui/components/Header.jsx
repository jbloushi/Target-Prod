import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useThemeMode } from '../../context/ThemeContext';
import { financeService } from '../../services/api';

/**
 * Premium Header Component (Kinetic Horizon)
 * Rebuilt to match the glassmorphic, high-fidelity mockup provided.
 * Features:
 * - Real-time Balance Display
 * - Global Search
 * - Light/Dark Mode Toggle
 * - User Profile Management
 */
const Header = ({ isSidebarCollapsed }) => {
    const { user, logout, isAuthenticated } = useAuth();
    const { isDark, toggleTheme } = useThemeMode();
    const [menuOpen, setMenuOpen] = useState(false);
    const [financeSummary, setFinanceSummary] = useState(null);
    const menuRef = useRef();
    const navigate = useNavigate();
    const location = useLocation();

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Fetch finance data for authenticated users
    useEffect(() => {
        if (!isAuthenticated || !user?.organization) return;
        financeService.getBalance()
            .then(res => setFinanceSummary(res.data))
            .catch(err => console.error('Header Finance Load Error:', err));
    }, [isAuthenticated, user]);

    const navLinks = [
        { label: 'Dashboard', path: '/dashboard' },
        { label: 'Analytics', path: '/analytics' },
        { label: 'Shipments', path: '/shipments' },
        { label: 'Finance', path: '/finance' }
    ];

    return (
        <header className={`fixed top-0 right-0 left-0 z-[100] h-16 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl border-b border-outline/10 dark:border-white/5 flex items-center justify-between px-6 transition-all duration-300 ${
            isSidebarCollapsed ? 'lg:left-20' : 'lg:left-[240px]'
        }`}>
            
            {/* Left Section: Brand or Search */}
            <div className="flex items-center gap-10">
                {!isAuthenticated ? (
                    <Link to="/" className="text-xl font-black tracking-tighter text-primary uppercase">Target Logistics</Link>
                ) : (
                    <div className="hidden md:flex gap-6 items-center">
                        {navLinks.map((link) => (
                            <Link 
                                key={link.path}
                                to={link.path}
                                className={`text-sm font-bold tracking-tight transition-all pb-1 border-b-2 ${
                                    location.pathname.startsWith(link.path) 
                                        ? 'text-primary border-primary' 
                                        : 'text-on-surface-variant hover:text-primary border-transparent'
                                }`}
                            >
                                {link.label}
                            </Link>
                        ))}
                    </div>
                )}

                {isAuthenticated && (
                    <div className="relative hidden xl:block ml-4">
                        <input 
                            type="text" 
                            placeholder="Quick search (⌘K)..." 
                            className="bg-surface-container-low dark:bg-white/5 border-none rounded-xl pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-primary/20 w-72 transition-all"
                        />
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
                    </div>
                )}
            </div>

            {/* Right Section: Profile & Actions */}
            <div className="flex items-center gap-4">
                
                {/* Finance Balance */}
                {isAuthenticated && user && (
                    <div className="hidden sm:flex items-center gap-2 px-4 py-2 bg-primary/5 dark:bg-primary/10 rounded-full border border-primary/10 transition-all hover:bg-primary/10">
                        <span className="material-symbols-outlined text-primary text-lg">account_balance_wallet</span>
                        <span className="text-sm font-black text-primary tracking-tight">
                            {parseFloat(financeSummary?.balance || 0).toFixed(3)} KD
                        </span>
                    </div>
                )}

                {/* Theme Toggle */}
                <button 
                    onClick={toggleTheme}
                    className="p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 transition-all text-on-surface-variant group border border-transparent hover:border-outline/10"
                    title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
                >
                    <span className="material-symbols-outlined text-xl group-hover:rotate-12 transition-transform">
                        {isDark ? 'light_mode' : 'dark_mode'}
                    </span>
                </button>

                {/* Notifications (Mock) */}
                {isAuthenticated && (
                    <button className="p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 transition-all text-on-surface-variant group relative border border-transparent hover:border-outline/10">
                        <span className="material-symbols-outlined text-xl">notifications</span>
                        <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-primary rounded-full border-2 border-white dark:border-slate-900"></span>
                    </button>
                )}

                {/* User Dropdown */}
                {isAuthenticated && (
                    <div className="relative" ref={menuRef}>
                        <button 
                            onClick={() => setMenuOpen(!menuOpen)}
                            className="flex items-center gap-3 pl-2 pr-1 py-1 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 transition-all group border border-transparent hover:border-outline/10"
                        >
                            <div className="w-8 h-8 rounded-lg kinetic-gradient flex items-center justify-center text-white text-xs font-black shadow-lg shadow-primary/20 overflow-hidden ring-2 ring-primary/5">
                                {user?.avatar ? (
                                    <img src={user.avatar} alt="User" className="w-full h-full object-cover" />
                                ) : (
                                    <span>{user?.name?.[0] || 'U'}</span>
                                )}
                            </div>
                            <span className="material-symbols-outlined text-on-surface-variant text-lg group-hover:translate-y-0.5 transition-transform">expand_more</span>
                        </button>

                        {/* Dropdown Menu */}
                        {menuOpen && (
                            <div className="absolute top-[calc(100%+8px)] right-0 w-64 bg-white/90 dark:bg-slate-900/90 backdrop-blur-2xl border border-outline/10 dark:border-white/5 rounded-2xl shadow-2xl p-2 animate-in fade-in slide-in-from-top-2 duration-200 z-[101]">
                                <div className="px-4 py-3 mb-2 border-b border-outline/5 dark:border-white/5">
                                    <p className="text-sm font-black text-on-surface truncate">{user?.name}</p>
                                    <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">{user?.role}</p>
                                </div>
                                <button 
                                    onClick={() => { navigate('/profile'); setMenuOpen(false); }}
                                    className="flex items-center gap-3 w-full px-4 py-2.5 text-sm font-bold text-on-surface-variant hover:text-primary hover:bg-slate-50 dark:hover:bg-white/5 rounded-xl transition-all"
                                >
                                    <span className="material-symbols-outlined text-lg">person</span>
                                    My Profile
                                </button>
                                <button 
                                    onClick={() => { navigate('/settings'); setMenuOpen(false); }}
                                    className="flex items-center gap-3 w-full px-4 py-2.5 text-sm font-bold text-on-surface-variant hover:text-primary hover:bg-slate-50 dark:hover:bg-white/5 rounded-xl transition-all"
                                >
                                    <span className="material-symbols-outlined text-lg">settings</span>
                                    Account Settings
                                </button>
                                <div className="my-2 border-t border-outline/5 dark:border-white/5"></div>
                                <button 
                                    onClick={() => { logout(); setMenuOpen(false); }}
                                    className="flex items-center gap-3 w-full px-4 py-2.5 text-sm font-black text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-all"
                                >
                                    <span className="material-symbols-outlined text-lg">logout</span>
                                    Sign Out
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </header>
    );
};

export default Header;
