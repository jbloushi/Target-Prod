import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
    Box,
    Drawer,
    List,
    ListItem,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Typography,
    Avatar,
    useTheme,
    Divider,
    Tooltip,
    IconButton
} from '@mui/material';
import HomeIcon from '@mui/icons-material/Home';
import AssessmentIcon from '@mui/icons-material/Assessment';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import MapIcon from '@mui/icons-material/Map';
import WarehouseIcon from '@mui/icons-material/Warehouse';
import DirectionsBusIcon from '@mui/icons-material/DirectionsBus';
import PersonIcon from '@mui/icons-material/Person';
import MessageIcon from '@mui/icons-material/Message';
import NotificationsIcon from '@mui/icons-material/Notifications';
import SettingsIcon from '@mui/icons-material/Settings';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import BusinessIcon from '@mui/icons-material/Business';
import MenuIcon from '@mui/icons-material/Menu';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import { useAuth } from '../../context/AuthContext';
import { getRoleLabel } from '../../utils/roleLabels';

const DRAWER_WIDTH = 240;
const COLLAPSED_WIDTH = 80;

const Sidebar = () => {
    const theme = useTheme();
    const location = useLocation();
    const { user } = useAuth();
    const [collapsed, setCollapsed] = useState(false);

    const drawerWidth = collapsed ? COLLAPSED_WIDTH : DRAWER_WIDTH;
    const textStyles = {
        opacity: collapsed ? 0 : 1,
        width: collapsed ? 0 : 'auto',
        marginLeft: collapsed ? 0 : undefined,
        transition: 'opacity 0.2s ease',
        whiteSpace: 'nowrap'
    };

    const menuItems = [
        { text: 'Dashboard', icon: <HomeIcon />, path: '/dashboard' },
        { text: 'Analytics', icon: <AssessmentIcon />, path: '/analytics', disabled: true, tooltip: 'Coming Soon' },
        { text: 'Calendar', icon: <CalendarMonthIcon />, path: '/calendar', disabled: true, tooltip: 'Coming Soon' },
        { text: 'Shipments', icon: <LocalShippingIcon />, path: '/shipments' },
        { text: 'Tracking', icon: <MapIcon />, path: '/tracking' },
        { text: 'Warehouse', icon: <WarehouseIcon />, path: '/warehouse', disabled: true, tooltip: 'Coming Soon' },
        { text: 'Fleets', icon: <DirectionsBusIcon />, path: '/fleets', disabled: true, tooltip: 'Coming Soon' },
        { text: 'User Management', icon: <PersonIcon />, path: '/admin/users', adminOnly: true },
        { text: 'Organizations', icon: <BusinessIcon />, path: '/admin/organizations', staffOnly: true },
        { text: 'Address Book', icon: <MenuBookIcon />, path: '/address-book', restricted: true },
        { text: 'Drivers', icon: <PersonIcon />, path: '/drivers', disabled: true, restricted: true, tooltip: 'Coming Soon' },
        { text: 'Finance & Credits', icon: <AccountBalanceWalletIcon />, path: '/finance', financeOnly: true },
    ];

    const utilityItems = [
        { text: 'Message', icon: <MessageIcon />, path: '/messages', disabled: true, tooltip: 'Coming Soon' },
        { text: 'Notification', icon: <NotificationsIcon />, path: '/notifications', disabled: true, tooltip: 'Coming Soon' },
        { text: 'Settings', icon: <SettingsIcon />, path: '/settings' },
    ];

    return (
        <Drawer
            variant="permanent"
            sx={{
                width: drawerWidth,
                flexShrink: 0,
                '& .MuiDrawer-paper': {
                    width: drawerWidth,
                    boxSizing: 'border-box',
                    borderRight: '1px solid #2a3347',
                    backgroundColor: '#141929',
                    transition: 'width 0.2s ease',
                    height: '100vh',
                },
            }}
        >
            <Box sx={{ p: 3, pb: 3, display: 'flex', alignItems: 'center', gap: 1.5, borderBottom: '1px solid #2a3347', mb: 3 }}>
                <Avatar
                    src={user?.avatar}
                    alt={user?.name}
                    sx={{
                        width: 44,
                        height: 44,
                        bgcolor: '#00d9b8',
                        color: '#0a0e1a',
                        fontWeight: 700,
                        fontSize: '18px'
                    }}
                >
                    {user?.name?.charAt(0) || 'D'}
                </Avatar>
                {!collapsed && (
                    <Box>
                        <Typography variant="subtitle2" fontWeight={600} sx={{ fontSize: '15px', color: '#e8eaf0' }}>
                            {user?.name || 'Demo Admin'}
                        </Typography>
                        <Typography variant="caption" sx={{ fontSize: '13px', color: '#9ca3af', textTransform: 'capitalize' }}>
                            {getRoleLabel(user?.role) || 'Platform Admin'}
                        </Typography>
                    </Box>
                )}
                <IconButton
                    onClick={() => setCollapsed((prev) => !prev)}
                    sx={{ marginLeft: 'auto', color: '#9ca3af' }}
                    aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                    {collapsed ? <MenuIcon /> : <ChevronLeftIcon />}
                </IconButton>
            </Box>

            <Box sx={{ overflow: 'auto', mt: 2, px: 2 }}>
                <List>
                    {menuItems.map((item) => {
                        // Basic role check
                        if (item.restricted && user?.role === 'driver') return null;
                        if (item.adminOnly && user?.role !== 'admin') return null;
                        if (item.staffOnly && !['admin', 'staff', 'manager'].includes(user?.role)) return null;
                        if (item.financeOnly && !['admin', 'staff', 'accounting', 'manager'].includes(user?.role)) return null;

                        return (
                            <ListItem key={item.text} disablePadding sx={{ mb: 0.5 }}>
                                {item.tooltip ? (
                                    <Tooltip title={item.tooltip} placement="right" arrow>
                                        <span style={{ width: '100%' }}>
                                            <ListItemButton
                                                component={item.disabled ? 'div' : NavLink}
                                                to={item.disabled ? undefined : item.path}
                                                disabled={item.disabled}
                                                sx={{
                                                    borderRadius: 2,
                                                    mx: 1,
                                                    py: 1.5,
                                                    opacity: item.disabled ? 0.4 : 1,
                                                    pointerEvents: item.disabled ? 'none' : 'auto',
                                                    position: 'relative',
                                                    justifyContent: collapsed ? 'center' : 'flex-start',
                                                    '&:hover': {
                                                        backgroundColor: item.disabled ? 'transparent' : 'rgba(0, 217, 184, 0.05)',
                                                        color: item.disabled ? 'inherit' : '#e8eaf0',
                                                    },
                                                    '&.active': {
                                                        backgroundColor: 'rgba(0, 217, 184, 0.1)',
                                                        color: '#e8eaf0',
                                                        '&::before': {
                                                            content: '""',
                                                            position: 'absolute',
                                                            left: 0,
                                                            top: 0,
                                                            bottom: 0,
                                                            width: '3px',
                                                            bgcolor: '#00d9b8',
                                                            borderRadius: '0 3px 3px 0',
                                                        },
                                                    },
                                                }}
                                            >
                                                <ListItemIcon sx={{ minWidth: collapsed ? 'auto' : 40, color: 'inherit' }}>
                                                    {item.icon}
                                                </ListItemIcon>
                                                <ListItemText
                                                    primary={item.text}
                                                    sx={textStyles}
                                                    primaryTypographyProps={{
                                                        fontSize: '14px',
                                                        fontWeight: 500,
                                                        color: 'inherit',
                                                        noWrap: true,
                                                        sx: {
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis'
                                                        }
                                                    }}
                                                />
                                            </ListItemButton>
                                        </span>
                                    </Tooltip>
                                ) : (
                                    <ListItemButton
                                        component={NavLink}
                                        to={item.path}
                                        sx={{
                                            borderRadius: 2,
                                            mx: 1,
                                            py: 1.5,
                                            position: 'relative',
                                            color: '#9ca3af',
                                            justifyContent: collapsed ? 'center' : 'flex-start',
                                            '&:hover': {
                                                backgroundColor: 'rgba(0, 217, 184, 0.05)',
                                                color: '#e8eaf0',
                                                '& .MuiListItemIcon-root': {
                                                    color: '#e8eaf0',
                                                }
                                            },
                                            '&.active': {
                                                backgroundColor: 'rgba(0, 217, 184, 0.1)',
                                                color: '#e8eaf0',
                                                '& .MuiListItemIcon-root': {
                                                    color: '#e8eaf0', // Icon color when active
                                                },
                                                '&::before': {
                                                    content: '""',
                                                    position: 'absolute',
                                                    left: 0,
                                                    top: 0,
                                                    bottom: 0,
                                                    width: '3px',
                                                    bgcolor: '#00d9b8',
                                                    borderRadius: '0 3px 3px 0',
                                                },
                                            },
                                        }}
                                    >
                                        <ListItemIcon sx={{ minWidth: collapsed ? 'auto' : 40, color: 'inherit' }}>
                                            {item.icon}
                                        </ListItemIcon>
                                        <ListItemText
                                            primary={item.text}
                                            sx={textStyles}
                                            primaryTypographyProps={{
                                                fontSize: '14px',
                                                fontWeight: 500,
                                                color: 'inherit',
                                                noWrap: true,
                                                sx: {
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis'
                                                }
                                            }}
                                        />
                                    </ListItemButton>
                                )}
                            </ListItem>
                        );
                    })}
                </List>

                <Divider sx={{ my: 2, opacity: 0.1 }} />

                <List>
                    {utilityItems.map((item) => (
                        <ListItem key={item.text} disablePadding sx={{ mb: 1 }}>
                            <Tooltip title={item.tooltip || ''} placement="right" arrow>
                                <ListItemButton
                                    component={item.disabled ? 'div' : NavLink}
                                    to={item.disabled ? undefined : item.path}
                                    selected={location.pathname === item.path}
                                    disabled={item.disabled}
                                    sx={{
                                        borderRadius: 3,
                                        color: 'text.secondary',
                                        justifyContent: collapsed ? 'center' : 'flex-start',
                                        '&.active': {
                                            backgroundColor: theme.palette.primary.main, // Or a secondary color
                                            color: theme.palette.primary.contrastText,
                                        },
                                    }}
                                >
                                    <ListItemIcon sx={{ minWidth: collapsed ? 'auto' : 40, color: 'inherit' }}>
                                        {item.icon}
                                    </ListItemIcon>
                                    <ListItemText
                                        primary={item.text}
                                        sx={textStyles}
                                        primaryTypographyProps={{ fontSize: '0.9rem', fontWeight: 500 }}
                                    />
                                </ListItemButton>
                            </Tooltip>
                        </ListItem>
                    ))}
                </List>
            </Box>
        </Drawer>
    );
};

export default Sidebar;
