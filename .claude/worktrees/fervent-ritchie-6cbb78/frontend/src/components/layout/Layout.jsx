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

    const toggleSidebar = () => setIsSidebarCollapsed(!isSidebarCollapsed);

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
            {/* Sidebar (with local collapse logic but also reactive width) */}
            {/* Note: In a production app, this state would be in a Context or Redux */}
            <Sidebar isCollapsed={isSidebarCollapsed} toggleCollapse={toggleSidebar} />

            <div 
                className={`flex-grow flex flex-col min-w-0 transition-all duration-300 ${
                    isSidebarCollapsed ? 'ml-20' : 'ml-0 lg:ml-[240px]'
                }`}
            >
                {/* Header (Reactive to Sidebar state) */}
                <Header isSidebarCollapsed={isSidebarCollapsed} />

                {/* Main Content Area */}
                <main className="flex-grow pt-24 px-4 sm:px-6 lg:px-8 max-w-[1800px] w-full mx-auto">
                    <div className="pb-12 h-full">
                        <Outlet />
                    </div>
                </main>

                <Footer />
            </div>
        </div>
    );
};

export default Layout;
