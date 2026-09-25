// ── Kinetic Horizon Design Tokens & Theme Configuration ──
export const getThemeConfig = (mode = 'light') => ({
  mode,
  colors: {
    primary: mode === 'light' ? '#2563EB' : '#4e92ff',
    primaryLight: mode === 'light' ? '#60A5FA' : '#7eaeff',
    primaryDark: mode === 'light' ? '#1E40AF' : '#3a75e0',
    secondary: mode === 'light' ? '#0F172A' : '#94a3b8',
    background: mode === 'light' ? '#F8FAFC' : '#020617',
    paper: mode === 'light' ? '#ffffff' : '#0F172A',
    textPrimary: mode === 'light' ? '#0F172A' : '#F8FAFC',
    textSecondary: mode === 'light' ? '#475569' : '#94a3b8',
    info: '#0EA5E9',
    error: '#EF4444',
    warning: '#F59E0B',
    success: '#10B981',
    divider: mode === 'light' ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.08)',
  },
  typography: {
    fontFamily: '"Cairo", "Tajawal", "Noto Sans Arabic", "Manrope", "Inter", "system-ui", sans-serif',
  },
  shape: {
    borderRadius: 12,
  },
});

export const theme = getThemeConfig('light');
export default theme;
