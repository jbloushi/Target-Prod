import { BrowserRouter as Router } from 'react-router-dom';
import CssBaseline from '@mui/material/CssBaseline';
import { SnackbarProvider } from 'notistack';
import { ThemeModeProvider } from './context/ThemeContext';
import AppRoutes from './routes';
import { AuthProvider } from './context/AuthContext';
import { ShipmentProvider } from './context/ShipmentContext';
import './ui/tokens.css'; // Import Design System Tokens

// Configure React Router future flags
const routerFutureConfig = {
  v7_startTransition: true,
  v7_relativeSplatPath: true
};

function App() {
  return (
    <ThemeModeProvider>
      <CssBaseline />
      <SnackbarProvider
        maxSnack={3}
        anchorOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        autoHideDuration={3000}
      >
        <AuthProvider>
          <ShipmentProvider>
            <Router future={routerFutureConfig}>
              <AppRoutes />
            </Router>
          </ShipmentProvider>
        </AuthProvider>
      </SnackbarProvider>
    </ThemeModeProvider>
  );
}

export default App;
