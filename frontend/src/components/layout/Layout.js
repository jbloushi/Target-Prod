import React from 'react';
import { Box, Container } from '@mui/material'; // Keeping for structural utility in public layout
import { Outlet, useLocation } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { Header } from '../../ui'; // New UI components
import Sidebar from './Sidebar'; // Use the full-featured Sidebar component
import theme from '../../theme';
import Footer from './Footer';
import { useAuth } from '../../context/AuthContext';



const Layout = () => {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    // Public Layout Usage
    return (
      <ThemeProvider theme={theme}>
        <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
          {/* Reuse new Header, it handles public state gracefully-ish */}
          <Header />
          <Box component="main" sx={{ flexGrow: 1, py: 4 }}>
            <Container maxWidth="xl">
              <Outlet />
            </Container>
          </Box>
          <Footer compact />
        </Box>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      {/* Global CSS Variables wrapper if needed, but imported in index.js usually. 
                 Assuming App.js imports tokens.css */}
      <Box sx={{ display: 'flex', bgcolor: '#0a0e1a', minHeight: '100vh' }}>
        <Sidebar />

        <Box sx={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0 // Flexbox overflow fix
        }}>
          <Header />

          <Box component="main" sx={{
            flexGrow: 1,
            p: 4,
            maxWidth: '1600px', // Limit width for large screens
            width: '100%',
            margin: '0 auto'
          }}>
            <Outlet />
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  );
};

export default Layout;
