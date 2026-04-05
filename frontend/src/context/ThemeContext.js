import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { ThemeProvider as MUIThemeProvider, createTheme } from '@mui/material/styles';
import { getThemeConfig } from '../theme';

const ThemeContext = createContext();

export const useThemeMode = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeMode must be used within a ThemeModeProvider');
  }
  return context;
};

export const ThemeModeProvider = ({ children }) => {
  // Initialize from localStorage or system preference
  const [mode, setMode] = useState(() => {
    const savedMode = localStorage.getItem('theme-mode');
    if (savedMode) return savedMode;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const toggleTheme = () => {
    setMode((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  useEffect(() => {
    localStorage.setItem('theme-mode', mode);
    // Apply class to body and html for CSS variable overrides and Tailwind dark mode
    if (mode === 'dark') {
      document.body.classList.add('dark-mode');
      document.documentElement.classList.add('dark');
    } else {
      document.body.classList.remove('dark-mode');
      document.documentElement.classList.remove('dark');
    }
    
    // Add temporary transition class for smooth switching
    document.body.classList.add('theme-transition');
    const timer = setTimeout(() => {
      document.body.classList.remove('theme-transition');
    }, 450);
    
    return () => clearTimeout(timer);
  }, [mode]);

  const theme = useMemo(() => createTheme(getThemeConfig(mode)), [mode]);

  const value = useMemo(() => ({
    mode,
    toggleTheme,
    isDark: mode === 'dark'
  }), [mode]);

  return (
    <ThemeContext.Provider value={value}>
      <MUIThemeProvider theme={theme}>
        {children}
      </MUIThemeProvider>
    </ThemeContext.Provider>
  );
};
