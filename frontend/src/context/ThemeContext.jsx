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
  const normalizeMode = (rawMode) => (rawMode === 'dark' ? 'dark' : 'light');

  // Initialize from localStorage (default: light)
  const [mode, setMode] = useState(() => {
    const savedMode = localStorage.getItem('theme-mode');
    return normalizeMode(savedMode);
  });

  const toggleTheme = () => {
    setMode((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  useEffect(() => {
    localStorage.setItem('theme-mode', mode);
    // Apply classes/attributes to both html and body for CSS vars + Tailwind dark mode consistency
    document.documentElement.setAttribute('data-theme', mode);
    document.body.setAttribute('data-theme', mode);

    if (mode === 'dark') {
      document.body.classList.add('dark-mode');
      document.body.classList.add('dark');
      document.documentElement.classList.add('dark');
    } else {
      document.body.classList.remove('dark-mode');
      document.body.classList.remove('dark');
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
