import { createTheme, alpha } from '@mui/material/styles';

// ── Kinetic Horizon Design Factory ──
export const getThemeConfig = (mode) => ({
  palette: {
    mode,
    common: {
      black: '#000000',
      white: '#ffffff',
    },
    primary: {
      main: mode === 'light' ? '#2563EB' : '#4e92ff',
      light: mode === 'light' ? '#60A5FA' : '#7eaeff',
      dark: mode === 'light' ? '#1E40AF' : '#3a75e0',
      contrastText: '#ffffff',
    },
    secondary: {
      main: mode === 'light' ? '#0F172A' : '#94a3b8',
      light: '#334155',
      dark: '#000000',
      contrastText: '#ffffff',
    },
    background: {
      default: mode === 'light' ? '#F8FAFC' : '#020617',
      paper: mode === 'light' ? '#ffffff' : '#0F172A',
    },
    text: {
      primary: mode === 'light' ? '#0F172A' : '#F8FAFC',
      secondary: mode === 'light' ? '#475569' : '#94a3b8',
      disabled: mode === 'light' ? '#94a3b8' : '#475569',
    },
    info: { 
      main: '#0EA5E9', 
      light: '#7dd3fc',
      dark: '#0369a1',
      contrastText: '#ffffff'
    },
    error: {
      main: '#EF4444',
      light: '#fca5a5',
      dark: '#b91c1c',
      contrastText: '#ffffff'
    },
    warning: {
      main: '#F59E0B',
      light: '#fcd34d',
      dark: '#b45309',
      contrastText: '#ffffff'
    },
    success: {
      main: '#10B981',
      light: '#6ee7b7',
      dark: '#047857',
      contrastText: '#ffffff'
    },
    divider: mode === 'light' ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.08)',
    action: {
      active: mode === 'light' ? 'rgba(0, 0, 0, 0.54)' : 'rgba(255, 255, 255, 0.7)',
      hover: mode === 'light' ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.08)',
      selected: mode === 'light' ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.16)',
      disabled: mode === 'light' ? 'rgba(0, 0, 0, 0.26)' : 'rgba(255, 255, 255, 0.3)',
      disabledBackground: mode === 'light' ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.12)',
      focus: mode === 'light' ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.12)',
    },
  },
  typography: {
    fontFamily: '"Manrope", "Inter", "system-ui", sans-serif',
    h1: { fontWeight: 800, fontSize: '2.5rem', letterSpacing: '-0.025em' },
    h2: { fontWeight: 800, fontSize: '2rem', letterSpacing: '-0.025em' },
    h3: { fontWeight: 700, fontSize: '1.5rem', letterSpacing: '-0.02em' },
    h4: { fontWeight: 700, fontSize: '1.25rem' },
    h5: { fontWeight: 700, fontSize: '1.1rem' },
    h6: { fontWeight: 700, fontSize: '1rem' },
    button: { textTransform: 'none', fontWeight: 700 },
    subtitle1: { fontWeight: 600 },
    body1: { fontSize: '0.9375rem' },
    body2: { fontSize: '0.875rem' },
    caption: { fontSize: '0.75rem', fontWeight: 600 },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: (theme) => ({
        body: {
          backgroundColor: theme.palette.background.default,
          color: theme.palette.text.primary,
          transition: 'background-color 0.3s ease, color 0.3s ease',
        },
      }),
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          padding: '10px 24px',
          fontWeight: 700,
          boxShadow: 'none',
          '&:hover': {
            boxShadow: 'none',
          },
        },
        containedPrimary: {
          background: mode === 'light' 
            ? 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)' 
            : 'linear-gradient(135deg, #4e92ff 0%, #3a75e0 100%)',
          '&:hover': {
             transform: 'translateY(-1px)',
             boxShadow: '0 10px 15px -3px rgba(37, 99, 235, 0.3)',
          }
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          borderRadius: 16,
          border: mode === 'light' ? '1px solid #E2E8F0' : '1px solid #1E293B',
          boxShadow: 'none',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          boxShadow: 'none',
          backgroundColor: mode === 'light' ? 'rgba(255, 255, 255, 0.8)' : 'rgba(2, 6, 23, 0.8)',
          backdropFilter: 'blur(12px)',
          borderBottom: `1px solid ${mode === 'light' ? '#E2E8F0' : '#1E293B'}`,
          color: mode === 'light' ? '#0F172A' : '#F8FAFC',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: mode === 'light' ? '#ffffff' : '#020617',
          borderRight: `1px solid ${mode === 'light' ? '#E2E8F0' : '#1E293B'}`,
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 12,
            backgroundColor: mode === 'light' ? '#f1f5f9' : '#1e293b',
            '& fieldset': { borderColor: 'transparent' },
            '&:hover fieldset': { borderColor: 'transparent' },
            '&.Mui-focused fieldset': { borderColor: 'transparent' },
            '&.Mui-focused': {
               backgroundColor: mode === 'light' ? '#ffffff' : '#21262d',
               boxShadow: `0 0 0 3px ${alpha(mode === 'light' ? '#2563EB' : '#4e92ff', 0.2)}`,
            }
          },
        },
      },
    },
  },
});

export default createTheme(getThemeConfig('light'));
