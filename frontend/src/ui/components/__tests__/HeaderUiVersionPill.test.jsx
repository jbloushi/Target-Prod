import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Header from '../Header';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { useThemeMode } from '../../../context/ThemeContext';
import SupportChatContext from '../../../context/SupportChatContext';
import {
  UI_VERSION_STORAGE_KEY,
  getStoredUiVersion,
  setStoredUiVersion,
  getDefaultLandingPath
} from '../../../utils/uiVersion';

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
    getBalance: vi.fn().mockResolvedValue({ data: { balance: 0 } })
  }
}));

describe('UI Version Persistence & Header V1/V2 Switch Pill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    useLanguage.mockReturnValue({
      lang: 'en',
      isRTL: false,
      t: (key, fallback) => fallback || key,
      toggleLanguage: vi.fn()
    });
    useThemeMode.mockReturnValue({
      isDark: false,
      toggleTheme: vi.fn()
    });
    useAuth.mockReturnValue({
      user: { id: 'u1', name: 'Ops User', role: 'admin' },
      isAuthenticated: true,
      logout: vi.fn()
    });
  });

  it('defaults stored UI version to v2 and resolves /dashboard-v2 (or /driver/pickup-v2 for drivers)', () => {
    expect(getStoredUiVersion()).toBe('v2');
    expect(getDefaultLandingPath('admin')).toBe('/dashboard-v2');
    expect(getDefaultLandingPath('driver')).toBe('/driver/pickup-v2');

    setStoredUiVersion('v1');
    expect(getStoredUiVersion()).toBe('v1');
    expect(getDefaultLandingPath('admin')).toBe('/dashboard');
    expect(getDefaultLandingPath('driver')).toBe('/driver/pickup');
  });

  it('shows V2 indicator on V2 routes and switches to V1 with 1 click + notification', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard-v2']}>
        <SupportChatContext.Provider value={{ unreadCount: 0 }}>
          <Header />
          <Routes>
            <Route path="/dashboard-v2" element={<div data-testid="page-v2">V2</div>} />
            <Route path="/dashboard" element={<div data-testid="page-v1">V1</div>} />
          </Routes>
        </SupportChatContext.Provider>
      </MemoryRouter>
    );

    const pill = screen.getByTestId('header-ui-version-pill');
    expect(pill).toHaveTextContent('V2');

    fireEvent.click(pill);

    expect(window.localStorage.getItem(UI_VERSION_STORAGE_KEY)).toBe('v1');
    expect(screen.getByTestId('page-v1')).toBeInTheDocument();
    expect(screen.getByTestId('header-ui-version-notice')).toHaveTextContent('Switched to V1 Standard');
    expect(screen.getByTestId('header-ui-version-pill')).toHaveTextContent('V1');
  });

  it('shows V1 indicator on V1 routes and switches to V2 with 1 click + notification', () => {
    setStoredUiVersion('v1');

    render(
      <MemoryRouter initialEntries={['/shipments']}>
        <SupportChatContext.Provider value={{ unreadCount: 0 }}>
          <Header />
          <Routes>
            <Route path="/shipments" element={<div data-testid="shipments-v1">V1</div>} />
            <Route path="/shipments-v2" element={<div data-testid="shipments-v2">V2</div>} />
          </Routes>
        </SupportChatContext.Provider>
      </MemoryRouter>
    );

    const pill = screen.getByTestId('header-ui-version-pill');
    expect(pill).toHaveTextContent('V1');

    fireEvent.click(pill);

    expect(window.localStorage.getItem(UI_VERSION_STORAGE_KEY)).toBe('v2');
    expect(screen.getByTestId('shipments-v2')).toBeInTheDocument();
    expect(screen.getByTestId('header-ui-version-notice')).toHaveTextContent('Switched to V2 Cockpit');
  });
});
