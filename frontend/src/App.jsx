import React from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import { SnackbarProvider } from 'notistack';
import { ThemeModeProvider } from './context/ThemeContext';
import { LanguageProvider } from './context/LanguageContext';
import AppRoutes from './routes';
import { AuthProvider } from './context/AuthContext';
import { ShipmentProvider } from './context/ShipmentContext';
import { SupportChatProvider } from './context/SupportChatContext';
import './ui/tokens.css'; // Import Design System Tokens

// Configure React Router future flags
const routerFutureConfig = {
  v7_startTransition: true,
  v7_relativeSplatPath: true
};

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[AppErrorBoundary] Uncaught runtime error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-base-200 p-6">
          <div className="max-w-md w-full bg-base-100 border border-base-300 rounded-2xl shadow-lg p-6 text-center space-y-4">
            <h2 className="text-xl font-bold text-error">Something went wrong</h2>
            <p className="text-sm text-base-content/70">
              An unexpected interface error occurred. Your shipment data is safe.
            </p>
            {this.state.error?.message && (
              <pre className="text-xs bg-base-200 p-3 rounded-lg overflow-x-auto text-left text-base-content/80">
                {this.state.error.message}
              </pre>
            )}
            <div className="flex justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="btn btn-primary btn-sm"
              >
                Reload Page
              </button>
              <button
                type="button"
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.location.href = '/dashboard';
                }}
                className="btn btn-ghost btn-sm"
              >
                Go to Dashboard
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  return (
    <AppErrorBoundary>
      <LanguageProvider>
        <ThemeModeProvider>
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
                  <SupportChatProvider>
                    <AppRoutes />
                  </SupportChatProvider>
                </Router>
              </ShipmentProvider>
            </AuthProvider>
          </SnackbarProvider>
        </ThemeModeProvider>
      </LanguageProvider>
    </AppErrorBoundary>
  );
}

export default App;
