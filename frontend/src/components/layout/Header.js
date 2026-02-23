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
import { styled } from '@mui/material/styles';
import { useAuth } from '../../context/AuthContext';
import { financeService } from '../../services/api';

const Search = styled('div')(({ theme }) => ({
  position: 'relative',
  borderRadius: 10,
  backgroundColor: '#1a2035',
  border: '1px solid #2a3347',
  transition: 'all 0.2s ease',
  '&:hover': {
    borderColor: '#00d9b8',
  },
  '&:focus-within': {
    borderColor: '#00d9b8',
    boxShadow: '0 0 0 3px rgba(0, 217, 184, 0.1)',
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
  color: '#9ca3af',
}));

const StyledInputBase = styled(InputBase)(({ theme }) => ({
  color: '#e8eaf0',
  width: '100%',
  '& .MuiInputBase-input': {
    padding: theme.spacing(1.5, 1, 1.5, 0),
    paddingLeft: `calc(1em + ${theme.spacing(4)})`,
    transition: theme.transitions.create('width'),
    width: '100%',
    fontSize: '14px',
    '&::placeholder': {
      color: '#9ca3af',
      opacity: 1,
    }
  },
}));

const UserIconWrapper = styled(Box)(({ theme }) => ({
  width: 38,
  height: 38,
  borderRadius: '50%',
  backgroundColor: '#1a2035',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  transition: 'all 0.2s ease',
  '&:hover': {
    backgroundColor: '#2a3347',
  }
}));

const Header = () => {
  const theme = useTheme();
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
      <AppBar position="sticky" color="transparent" elevation={0} sx={{ bgcolor: 'background.paper', borderBottom: `1px solid ${theme.palette.divider}` }}>
        <Toolbar>
          <Typography variant="h6" component={RouterLink} to="/" sx={{ textDecoration: 'none', color: 'text.primary', fontWeight: 700, flexGrow: 1 }}>
            SHIPMENT<Box component="span" sx={{ color: 'primary.main' }}>TRACKER</Box>
          </Typography>
          <Button component={RouterLink} to="/about" startIcon={<InfoIcon />}>About</Button>
          <Button component={RouterLink} to="/contact" startIcon={<ContactSupportIcon />}>Contact</Button>
          <Box sx={{ mx: 1 }} />
          <Button component={RouterLink} to="/login" startIcon={<LoginIcon />} variant="outlined" sx={{ mr: 1 }}>Login</Button>
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
      sx={{
        bgcolor: '#141929',
        backdropFilter: 'blur(10px)',
        borderBottom: '1px solid #2a3347',
        py: 1,
      }}
    >
      <Toolbar sx={{ px: 4 }}>
        {/* Search Bar */}
        <Search>
          <SearchIconWrapper>
            <SearchIcon />
          </SearchIconWrapper>
          <StyledInputBase
            placeholder="Search..."
            inputProps={{ 'aria-label': 'search' }}
          />
        </Search>

        {/* Spacer */}
        <Box sx={{ flexGrow: 1 }} />

        {/* Actions */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {/* Balance Display */}
          {user && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 2,
                py: 1,
                bgcolor: 'rgba(0, 217, 184, 0.1)',
                borderRadius: 2,
                fontWeight: 600,
                fontSize: '14px',
                color: '#00d9b8',
              }}
            >
              <AccountBalanceWalletIcon sx={{ fontSize: 20 }} />
              {parseFloat(financeSummary?.balance || 0).toFixed(3)} KD
            </Box>
          )}

          {/* New Shipment Button */}
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            component={RouterLink}
            to="/create"
            sx={{
              borderRadius: 2.5,
              px: 3,
              py: 1.5,
              fontWeight: 600,
              textTransform: 'none',
              fontSize: '14px',
            }}
          >
            New Shipment
          </Button>

          {/* User Menu */}
          <UserIconWrapper onClick={handleOpenUserMenu}>
            {user?.avatar ? (
              <Avatar alt={user?.name} src={user?.avatar} sx={{ width: 38, height: 38 }} />
            ) : (
              <PersonIcon sx={{ color: '#9ca3af', fontSize: 20 }} />
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
              <Typography textAlign="center">Settings</Typography>
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
