import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from '../../ui';
import Sidebar from './Sidebar';
import Footer from './Footer';
import { useAuth } from '../../context/AuthContext';

/**
 * Layout Component
 * Standard layout containing Header, optional Sidebar (for auth), and Footer.
 * Re-designed to be fully responsive and integrated with the Kinetic Horizon aesthetic.
 * Manages the global sidebar collapse state.
 */
const Layout = () => {
    const { isAuthenticated } = useAuth();
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

    const toggleSidebar = () => setIsSidebarCollapsed(!isSidebarCollapsed);
    const toggleMobileDrawer = () => setIsMobileDrawerOpen(!isMobileDrawerOpen);
    const closeMobileDrawer = () => setIsMobileDrawerOpen(false);

    if (!isAuthenticated) {
        return (
            <div className="min-h-screen flex flex-col bg-surface dark:bg-slate-900 transition-colors duration-300">
                <Header />
                <main className="flex-grow pt-20 px-6 max-w-7xl mx-auto w-full">
                    <Outlet />
                </main>
                <Footer compact />
            </div>
        );
    }

    return (
        <div className="min-h-screen flex bg-surface dark:bg-slate-900 transition-colors duration-300 overflow-x-clip">
            {/* Sidebar (with desktop collapse logic and responsive mobile drawer) */}
            <Sidebar 
                isCollapsed={isSidebarCollapsed} 
                toggleCollapse={toggleSidebar}
                isMobileOpen={isMobileDrawerOpen}
                closeMobile={closeMobileDrawer}
            />

            <div 
                className={`flex-grow flex flex-col min-w-0 transition-all duration-300 ${
                    isSidebarCollapsed 
                        ? 'lg:ms-20' 
                        : 'lg:ms-[240px]'
                }`}
            >
                {/* Header (Reactive to Sidebar state and mobile drawer toggle) */}
                <Header 
                    isSidebarCollapsed={isSidebarCollapsed} 
                    toggleMobileDrawer={toggleMobileDrawer}
                    isMobileDrawerOpen={isMobileDrawerOpen}
                />

                {/* Main Content Area */}
                <main className="flex-grow pt-24 px-4 sm:px-6 lg:px-8 max-w-[1800px] w-full mx-auto">
                    <div className="pb-12 h-full">
                        <Outlet />
                    </div>
                </main>

                <div className="py-2 text-center text-xs text-slate-400 border-t border-slate-200 dark:border-slate-800">
                    Powered by <a href="https://mawthook.io" target="_blank" rel="noreferrer" className="text-primary-600 hover:underline">Mawthook.io</a>
                </div>
            </div>
        </div>
    );
};

export default Layout;
