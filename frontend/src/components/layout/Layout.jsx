import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Header } from '../../ui';
import Footer from './Footer';

/**
 * Layout Component — Target Logistics Global Operating System
 * Full-width top-navigation canvas layout without sidebar constraints.
 */
const Layout = () => {
    const { pathname } = useLocation();
    const isSupportWorkspace = pathname.startsWith('/support-v2');

    return (
        <div className={`${isSupportWorkspace ? 'h-dvh overflow-hidden' : 'min-h-screen'} flex flex-col bg-base-200/50 dark:bg-slate-900 bg-target-pattern transition-colors duration-300 overflow-x-clip`}>
            {/* Master Top Navigation Bar */}
            <Header />

            {/* Main Content Area */}
            <main className={isSupportWorkspace
                ? 'flex-1 min-h-0 w-full max-w-none mx-0 pt-16 overflow-hidden'
                : 'flex-grow pt-20 px-4 sm:px-6 lg:px-8 max-w-[1800px] w-full mx-auto'}>
                {isSupportWorkspace ? <Outlet /> : <div className="pb-12"><Outlet /></div>}
            </main>

            {/* Global Footer */}
            {!isSupportWorkspace && <Footer />}
        </div>
    );
};

export default Layout;
