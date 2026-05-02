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
  Chip,
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
import { styled } from '@mui/material/styles';
import { useAuth } from '../../context/AuthContext';
import { useThemeMode } from '../../context/ThemeContext';
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
  fontFamily: 'Manrope, sans-serif',
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
          <Typography variant="h6" component={RouterLink} to="/" sx={{ textDecoration: 'none', color: 'text.primary', fontWeight: 900, flexGrow: 1, fontFamily: 'Manrope, sans-serif', letterSpacing: '-0.04em' }}>
            TARGET<Box component="span" sx={{ color: 'primary.main', opacity: 0.8 }}> LOGISTICS</Box> GLOBAL
          </Typography>
          
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
            placeholder="Search..."
            inputProps={{ 'aria-label': 'search' }}
          />
        </Search>

        <Box sx={{ flexGrow: 1 }} />

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
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
                fontFamily: 'Manrope, sans-serif',
              }}
            >
              <AccountBalanceWalletIcon sx={{ fontSize: 20 }} />
              {parseFloat(financeSummary?.balance || 0).toFixed(3)} KD
            </Box>
          )}

          <IconButton onClick={toggleTheme} sx={{ color: 'text.secondary' }}>
            {isDark ? <LightModeIcon /> : <DarkModeIcon />}
          </IconButton>

          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            component={RouterLink}
            to="/create"
            sx={{
              borderRadius: 3,
              px: 3,
              py: 1.5,
              fontWeight: 700,
              textTransform: 'none',
              fontSize: '14px',
            }}
          >
            New Shipment
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
            <MenuItem component={RouterLink} to="/profile" onClick={handleCloseUserMenu}>
              <ListItemIcon>
                <PersonIcon fontSize="small" />
              </ListItemIcon>
              <Typography textAlign="center">Profile</Typography>
            </MenuItem>
            <Divider />
            <MenuItem onClick={() => { handleCloseUserMenu(); logout(); }}>
              <ListItemIcon>
                <LogoutIcon fontSize="small" color="error" />
              </ListItemIcon>
              <Typography textAlign="center" color="error">Logout</Typography>
            </MenuItem>
          </Menu>
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Header;
