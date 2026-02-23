import { createTheme } from '@mui/material';

export const mawthookTheme = createTheme({
    palette: {
        mode: 'dark',
        primary: { main: '#00d9b8' },
        background: { paper: '#141929', default: '#0a0e1a' },
        text: { primary: '#e2e8f0', secondary: '#94a3b8' }
    },
    typography: {
        fontFamily: '"Outfit", "Inter", "Roboto", sans-serif',
    },
    components: {
        MuiTextField: {
            styleOverrides: {
                root: {
                    '& .MuiOutlinedInput-root': {
                        backgroundColor: '#1a2035',
                        '& fieldset': { borderColor: '#2a3347' },
                        '&:hover fieldset': { borderColor: '#00d9b8' },
                        '&.Mui-focused fieldset': { borderColor: '#00d9b8' }
                    }
                }
            }
        },
        MuiCard: {
            styleOverrides: {
                root: {
                    backgroundColor: '#141929',
                    borderColor: '#2a3347',
                    backgroundImage: 'none',
                    borderRadius: 12
                }
            }
        }
    }
});
