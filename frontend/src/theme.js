import { createTheme, alpha } from '@mui/material/styles';

// Dark Theme Color Palette - Matching Design Sample
const palette = {
  mode: 'dark',
  primary: {
    main: '#00d9b8', // Accent primary from sample
    light: '#5eead4',
    dark: '#00c4a7',
    contrastText: '#0a0e1a',
  },
  secondary: {
    main: '#818cf8',
    light: '#a5b4fc',
    dark: '#6366f1',
    contrastText: '#ffffff',
  },
  error: {
    main: '#ef5350',
    light: '#fda4af',
    dark: '#e11d48',
  },
  warning: {
    main: '#ffa726',
    light: '#fcd34d',
    dark: '#d97706',
  },
  info: {
    main: '#42a5f5',
    light: '#7dd3fc',
    dark: '#0284c7',
  },
  success: {
    main: '#00d9b8',
    light: '#6ee7b7',
    dark: '#059669',
  },
  background: {
    default: '#0a0e1a', // bg-primary
    paper: '#141929',    // bg-secondary
    subtle: '#1a2035',   // bg-tertiary
  },
  text: {
    primary: '#e8eaf0',
    secondary: '#9ca3af',
    disabled: '#475569',
  },
  divider: '#2a3347',
  action: {
    hover: 'rgba(0, 217, 184, 0.05)',
    selected: 'rgba(0, 217, 184, 0.1)',
  }
};

const typography = {
  fontFamily: [
    'DM Sans',
    'Outfit',
    'Inter',
    'sans-serif',
  ].join(','),
  h1: { fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: '2.5rem', letterSpacing: '-0.03em', lineHeight: 1.2 },
  h2: { fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: '2rem', letterSpacing: '-0.03em', lineHeight: 1.3 },
  h3: { fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: '1.75rem', letterSpacing: '-0.02em', lineHeight: 1.4 },
  h4: { fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: '1.5rem', letterSpacing: '-0.02em' },
  h5: { fontFamily: 'Outfit, sans-serif', fontWeight: 600, fontSize: '1.25rem' },
  h6: { fontFamily: 'Outfit, sans-serif', fontWeight: 600, fontSize: '1rem' },
  button: { textTransform: 'none', fontWeight: 600, letterSpacing: '0.01em' },
  subtitle1: { fontWeight: 500, letterSpacing: '0.01em' },
  subtitle2: { fontWeight: 600, fontSize: '0.875rem', letterSpacing: '0.01em' },
  body1: { fontSize: '1rem', lineHeight: 1.6 },
  body2: { fontSize: '0.875rem', lineHeight: 1.6 },
};

const theme = createTheme({
  palette,
  typography,
  shape: {
    borderRadius: 16,
  },
  shadows: [
    'none',
    '0px 2px 4px rgba(0,0,0,0.1)',
    '0px 4px 8px rgba(0,0,0,0.15)',
    '0px 8px 16px rgba( 0,0,0,0.2)',
    '0px 12px 24px rgba(0,0,0,0.2)',
    '0px 16px 32px rgba(0,0,0,0.25)',
    '0px 24px 48px rgba(0,0,0,0.3)',
    ...Array(18).fill('none')
  ],
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          padding: '12px 24px',
          transition: 'all 0.2s ease',
          fontWeight: 600,
        },
        contained: {
          boxShadow: '0 4px 12px rgba(0, 217, 184, 0.3)',
          '&:hover': {
            transform: 'translateY(-1px)',
            boxShadow: '0 6px 20px rgba(0, 217, 184, 0.4)',
          },
        },
        outlined: {
          borderWidth: '1px',
          '&:hover': {
            borderWidth: '1px',
            borderColor: '#00d9b8',
            background: 'rgba(0, 217, 184, 0.05)',
          }
        }
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: '#141929',
          border: '1px solid #2a3347',
          borderRadius: 16,
          transition: 'transform 0.3s ease, box-shadow 0.3s ease, border-color 0.3s ease',
          '&:hover': {
            transform: 'translateY(-2px)',
            boxShadow: '0 8px 24px rgba(0, 217, 184, 0.15)',
          }
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: '#141929',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          boxShadow: 'none',
          borderBottom: '1px solid #2a3347',
          background: '#141929',
          backdropFilter: 'blur(10px)',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 10,
            backgroundColor: '#1a2035',
            '& fieldset': {
              borderColor: '#2a3347',
            },
            '&:hover fieldset': {
              borderColor: '#00d9b8',
            },
            '&.Mui-focused fieldset': {
              borderWidth: 1,
              borderColor: '#00d9b8',
              boxShadow: '0 0 0 3px rgba(0, 217, 184, 0.1)',
            }
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 600,
          borderRadius: 6,
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: '1px solid #2a3347',
          padding: '16px',
        },
        head: {
          fontWeight: 600,
          color: '#9ca3af',
          textTransform: 'uppercase',
          fontSize: '0.75rem',
          letterSpacing: '0.5px',
          backgroundColor: '#1a2035',
        }
      }
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: '#141929',
          borderRight: '1px solid #2a3347',
        }
      }
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          '&.Mui-selected': {
            backgroundColor: 'rgba(0, 217, 184, 0.1)',
            borderLeft: '3px solid #00d9b8',
            '&:hover': {
              backgroundColor: 'rgba(0, 217, 184, 0.15)',
            }
          },
          '&:hover': {
            backgroundColor: 'rgba(0, 217, 184, 0.05)',
          }
        }
      }
    },
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          scrollbarColor: "#2a3347 #0a0e1a",
          "&::-webkit-scrollbar": {
            width: 8,
            height: 8,
          },
          "&::-webkit-scrollbar-thumb": {
            backgroundColor: "#2a3347",
            borderRadius: 4,
          },
          "&::-webkit-scrollbar-track": {
            backgroundColor: "#0a0e1a",
          },
        },
      },
    },
  },
});

export default theme;
