import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Header from '../Header';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { useThemeMode } from '../../../context/ThemeContext';
import SupportChatContext from '../../../context/SupportChatContext';

vi.mock('../../../context/AuthContext', () => ({
    useAuth: vi.fn()
}));

vi.mock('../../../context/LanguageContext', () => ({
    useLanguage: vi.fn()
}));

vi.mock('../../../context/ThemeContext', () => ({
    useThemeMode: vi.fn()
}));

vi.mock('../../../services/api', () => ({
    financeService: {
        getPaywallStatus: vi.fn().mockResolvedValue({ isLocked: false })
    }
}));

describe('Header Support Link & Real-Time Unread Badge', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useLanguage.mockReturnValue({
            language: 'en',
            isRTL: false,
            t: (key, fallback) => fallback || key,
            setLanguage: vi.fn()
        });
        useThemeMode.mockReturnValue({
            isDark: false,
            toggleTheme: vi.fn()
        });
    });

    const renderHeaderWithContext = ({ userRole = 'staff', unreadCount = 0 } = {}) => {
        useAuth.mockReturnValue({
            user: { id: 'u1', name: 'Agent Saleh', role: userRole },
            isAuthenticated: true,
            isStaff: ['admin', 'staff', 'manager', 'accounting'].includes(userRole),
            isEnterprise: false,
            logout: vi.fn()
        });

        return render(
            <MemoryRouter initialEntries={['/dashboard']}>
                <SupportChatContext.Provider value={{ unreadCount }}>
                    <Header />
                </SupportChatContext.Provider>
            </MemoryRouter>
        );
    };

    it('renders the Support link for staff users', () => {
        renderHeaderWithContext({ userRole: 'staff', unreadCount: 0 });

        const supportLink = screen.getByTestId('header-support-link');
        expect(supportLink).toBeInTheDocument();
        expect(supportLink.getAttribute('href')).toBe('/support');
    });

    it('renders the Support link for org_manager role', () => {
        renderHeaderWithContext({ userRole: 'org_manager', unreadCount: 0 });

        const supportLink = screen.getByTestId('header-support-link');
        expect(supportLink).toBeInTheDocument();
    });

    it('displays the unread badge when unreadCount > 0', () => {
        renderHeaderWithContext({ userRole: 'admin', unreadCount: 5 });

        const badge = screen.getByTestId('header-support-unread-badge');
        expect(badge).toBeInTheDocument();
        expect(badge.textContent.trim()).toBe('5');

        // Open mobile menu to verify mobile drawer badge
        const hamburgerBtn = screen.getByLabelText('Toggle navigation menu');
        fireEvent.click(hamburgerBtn);

        const mobileBadge = screen.getByTestId('mobile-support-unread-badge');
        expect(mobileBadge).toBeInTheDocument();
        expect(mobileBadge.textContent.trim()).toBe('5');
    });

    it('caps unread badge display at 99+ when unreadCount exceeds 99', () => {
        renderHeaderWithContext({ userRole: 'staff', unreadCount: 120 });

        const badge = screen.getByTestId('header-support-unread-badge');
        expect(badge.textContent.trim()).toBe('99+');
    });

    it('does not render the unread badge when unreadCount is 0', () => {
        renderHeaderWithContext({ userRole: 'staff', unreadCount: 0 });

        expect(screen.queryByTestId('header-support-unread-badge')).toBeNull();
        expect(screen.queryByTestId('mobile-support-unread-badge')).toBeNull();
    });

    it('hides the Support link for unauthorized roles (e.g. driver or standard client)', () => {
        renderHeaderWithContext({ userRole: 'driver', unreadCount: 3 });

        expect(screen.queryByTestId('header-support-link')).toBeNull();
        expect(screen.queryByTestId('mobile-support-link')).toBeNull();
    });
});
