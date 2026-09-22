import React, { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  AppBar,
  Box,
  Toolbar,
  IconButton,
  Button,
  InputBase,
  alpha,
  useTheme,
  Avatar,
  Menu,
  MenuItem,
  ListItemIcon,
  Typography,
  Divider,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import SettingsIcon from '@mui/icons-material/Settings';
import LogoutIcon from '@mui/icons-material/Logout';
import InfoIcon from '@mui/icons-material/Info';
import ContactSupportIcon from '@mui/icons-material/ContactSupport';
import LoginIcon from '@mui/icons-material/Login';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import PersonIcon from '@mui/icons-material/Person';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import TranslateIcon from '@mui/icons-material/Translate';
import { styled } from '@mui/material/styles';
import { useAuth } from '../../context/AuthContext';
import { useThemeMode } from '../../context/ThemeContext';
import { useLanguage } from '../../context/LanguageContext';
import { financeService } from '../../services/api';

const Search = styled('div')(({ theme }) => ({
  position: 'relative',
  borderRadius: 12,
  backgroundColor: theme.palette.mode === 'light' ? '#dde3e8' : alpha(theme.palette.background.paper, 0.1),
  border: 'none',
  transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
  '&:focus-within': {
    backgroundColor: theme.palette.mode === 'light' ? '#ffffff' : theme.palette.background.paper,
    boxShadow: `0 0 0 4px ${alpha(theme.palette.primary.main, 0.2)}`,
  },
  marginRight: theme.spacing(2),
  marginLeft: 0,
  width: '100%',
  [theme.breakpoints.up('sm')]: {
    marginLeft: theme.spacing(3),
    width: 'auto',
    minWidth: '400px',
  },
}));

const SearchIconWrapper = styled('div')(({ theme }) => ({
  padding: theme.spacing(0, 2),
  height: '100%',
  position: 'absolute',
  pointerEvents: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: theme.palette.text.secondary,
}));

const StyledInputBase = styled(InputBase)(({ theme }) => ({
  color: theme.palette.text.primary,
  width: '100%',
  '& .MuiInputBase-input': {
    padding: theme.spacing(1.5, 1, 1.5, 0),
    paddingLeft: `calc(1em + ${theme.spacing(4)})`,
    transition: theme.transitions.create('width'),
    width: '100%',
    fontSize: '14px',
    '&::placeholder': {
      color: theme.palette.text.disabled,
      opacity: 1,
    }
  },
}));

const UserIconWrapper = styled(Box)(({ theme }) => ({
  width: 38,
  height: 38,
  borderRadius: 12,
  backgroundColor: theme.palette.mode === 'light' ? '#dde3e8' : alpha(theme.palette.background.paper, 0.1),
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  transition: 'all 0.2s ease',
  '&:hover': {
    backgroundColor: alpha(theme.palette.primary.main, 0.08),
  }
}));

const Header = () => {
  const theme = useTheme();
  const { isDark, toggleTheme } = useThemeMode();
  const { lang, toggleLanguage, t } = useLanguage();
  const { user, isAuthenticated, logout } = useAuth();
  const [anchorElUser, setAnchorElUser] = useState(null);
  const [financeSummary, setFinanceSummary] = useState(null);

  const handleOpenUserMenu = (event) => {
    setAnchorElUser(event.currentTarget);
  };

  const handleCloseUserMenu = () => {
    setAnchorElUser(null);
  };

  useEffect(() => {
    const loadFinance = async () => {
      if (!user?.organization) return;
      try {
        const response = await financeService.getBalance();
        setFinanceSummary(response.data);
      } catch (error) {
        console.error('Failed to fetch finance summary:', error);
      }
    };

    loadFinance();
  }, [user?.organization]);

  if (!isAuthenticated) {
    return (
      <AppBar position="sticky" color="transparent" elevation={0} sx={{ py: 1 }}>
        <Toolbar>
          <Typography variant="h6" component={RouterLink} to="/" sx={{ textDecoration: 'none', color: 'text.primary', fontWeight: 900, flexGrow: 1, letterSpacing: '-0.04em' }}>
            TARGET<Box component="span" sx={{ color: 'primary.main', opacity: 0.8 }}> LOGISTICS</Box> GLOBAL
          </Typography>

          <Button
            onClick={toggleLanguage}
            size="small"
            sx={{
              mr: 2,
              px: 1.5,
              py: 0.5,
              borderRadius: 2,
              border: `1px solid ${alpha(theme.palette.text.secondary, 0.2)}`,
              color: 'text.primary',
              fontWeight: 700,
              fontSize: '12px'
            }}
          >
            EN &lt;&gt; ع
          </Button>
          
          <IconButton onClick={toggleTheme} sx={{ color: 'text.secondary', mr: 2 }}>
            {isDark ? <LightModeIcon /> : <DarkModeIcon />}
          </IconButton>

          <Button component={RouterLink} to="/about" startIcon={<InfoIcon />} sx={{ color: 'text.secondary' }}>About</Button>
          <Button component={RouterLink} to="/contact" startIcon={<ContactSupportIcon />} sx={{ color: 'text.secondary' }}>Contact</Button>
          <Box sx={{ mx: 1 }} />
          <Button component={RouterLink} to="/login" startIcon={<LoginIcon />} variant="outlined" sx={{ mr: 1, borderColor: alpha(theme.palette.text.secondary, 0.2), color: 'text.primary' }}>Login</Button>
          <Button component={RouterLink} to="/signup" startIcon={<PersonAddIcon />} variant="contained">Join</Button>
        </Toolbar>
      </AppBar>
    );
  }

  return (
    <AppBar
      position="sticky"
      color="transparent"
      elevation={0}
      sx={{ py: 1 }}
    >
      <Toolbar sx={{ px: 4 }}>
        <Search>
          <SearchIconWrapper>
            <SearchIcon />
          </SearchIconWrapper>
          <StyledInputBase
            placeholder={t('search_placeholder', 'Search waybill #, recipient, or phone...')}
            inputProps={{ 'aria-label': 'search' }}
          />
        </Search>

        <Box sx={{ flexGrow: 1 }} />

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {user && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 2,
                py: 1,
                bgcolor: isDark ? alpha(theme.palette.primary.main, 0.15) : alpha(theme.palette.primary.main, 0.06),
                borderRadius: '9999px',
                fontWeight: 700,
                fontSize: '14px',
                color: 'primary.main',
              }}
            >
              <AccountBalanceWalletIcon sx={{ fontSize: 20 }} />
              {parseFloat(financeSummary?.balance || 0).toFixed(3)} {lang === 'ar' ? 'د.ك' : 'KD'}
            </Box>
          )}

          {/* Language Switcher Button */}
          <Button
            onClick={toggleLanguage}
            size="small"
            sx={{
              px: 1.5,
              py: 0.8,
              borderRadius: 2.5,
              border: `1px solid ${alpha(theme.palette.divider, 0.6)}`,
              color: 'text.primary',
              fontWeight: 800,
              fontSize: '12.5px',
              textTransform: 'none',
              bgcolor: isDark ? alpha(theme.palette.background.paper, 0.1) : '#ffffff',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              display: 'flex',
              alignItems: 'center',
              gap: 0.6,
              '&:hover': {
                borderColor: 'primary.main',
                bgcolor: alpha(theme.palette.primary.main, 0.05)
              }
            }}
          >
            <TranslateIcon sx={{ fontSize: 16, color: 'primary.main' }} />
            EN &lt;&gt; ع
          </Button>

          <IconButton onClick={toggleTheme} sx={{ color: 'text.secondary' }}>
            {isDark ? <LightModeIcon /> : <DarkModeIcon />}
          </IconButton>

          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            component={RouterLink}
            to="/shipment/new"
            sx={{
              borderRadius: 3,
              px: 2.5,
              py: 1.2,
              fontWeight: 700,
              textTransform: 'none',
              fontSize: '13.5px',
            }}
          >
            {t('new_shipment', 'New Shipment')}
          </Button>

          <UserIconWrapper onClick={handleOpenUserMenu}>
            {user?.avatar ? (
              <Avatar alt={user?.name} src={user?.avatar} sx={{ width: 38, height: 38, borderRadius: '12px' }} />
            ) : (
              <PersonIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
            )}
          </UserIconWrapper>
          <Menu
            sx={{ mt: '45px' }}
            id="menu-appbar"
            anchorEl={anchorElUser}
            anchorOrigin={{
              vertical: 'top',
              horizontal: 'right',
            }}
            keepMounted
            transformOrigin={{
              vertical: 'top',
              horizontal: 'right',
            }}
            open={Boolean(anchorElUser)}
            onClose={handleCloseUserMenu}
          >
            <MenuItem component={RouterLink} to="/settings" onClick={handleCloseUserMenu}>
              <ListItemIcon>
                <SettingsIcon fontSize="small" />
              </ListItemIcon>
              <Typography textAlign="center">{t('nav_settings', 'Settings')}</Typography>
            </MenuItem>
            <Divider />
            <MenuItem onClick={() => { handleCloseUserMenu(); logout(); }}>
              <ListItemIcon>
                <LogoutIcon fontSize="small" color="error" />
              </ListItemIcon>
              <Typography textAlign="center" color="error">{t('sign_out', 'Logout')}</Typography>
            </MenuItem>
          </Menu>
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Header;
