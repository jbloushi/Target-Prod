import React from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from '../../ui';
import Footer from './Footer';

/**
 * Layout Component — Target Logistics Global Operating System
 * Full-width top-navigation canvas layout without sidebar constraints.
 */
const Layout = () => {
    return (
        <div className="min-h-screen flex flex-col bg-base-200/50 dark:bg-slate-900 transition-colors duration-300 overflow-x-clip">
            {/* Master Top Navigation Bar */}
            <Header />

            {/* Main Content Area */}
            <main className="flex-grow pt-20 px-4 sm:px-6 lg:px-8 max-w-[1800px] w-full mx-auto">
                <div className="pb-12 h-full">
                    <Outlet />
                </div>
            </main>

            {/* Global Footer */}
            <Footer />
        </div>
    );
};

export default Layout;
