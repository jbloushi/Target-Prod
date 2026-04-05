import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useShipmentStats } from '../utils/useShipmentStats';
import { useShipments } from '../utils/useShipments';
import { useAuth } from '../context/AuthContext';
import { Loader } from '../ui';
import { 
  Box, 
  Grid, 
  Typography, 
  Card, 
  CardContent, 
  IconButton, 
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  alpha,
  useTheme,
  Stack,
  Avatar,
  Tooltip,
  Fade,
  LinearProgress
} from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import PendingActionsIcon from '@mui/icons-material/PendingActions';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import AddIcon from '@mui/icons-material/Add';
import FilterListIcon from '@mui/icons-material/FilterList';
import PublicIcon from '@mui/icons-material/Public';
import SpeedIcon from '@mui/icons-material/Speed';
import HubIcon from '@mui/icons-material/Hub';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';

/**
 * Target Logistics Global - Premium Dashboard
 * Ultra-modern, glassmorphic design for global logistics operations.
 */
const DashboardPage = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';
    
    // UI State for interactivity
    const [hoveredCard, setHoveredCard] = useState(null);
    
    const { stats, loading: statsLoading } = useShipmentStats();
    const { shipments: recentShipments, loading: recentLoading } = useShipments({ limit: 8 });

    const statsCards = [
        { 
            label: 'Total Shipments', 
            value: stats.total || 0, 
            icon: <LocalShippingIcon />, 
            color: '#0050d4',
            trend: '+12.5%',
            trendIcon: <TrendingUpIcon fontSize="inherit" />,
            isPositive: true,
            description: 'Total active lifecycle'
        },
        { 
            label: 'Pending Gate', 
            value: stats.pending || 0, 
            icon: <PendingActionsIcon />, 
            color: '#F59E0B',
            trend: 'Stable',
            trendIcon: null,
            isPositive: null,
            description: 'Awaiting manifest approval'
        },
        { 
            label: 'Global Transit', 
            value: stats.inTransit || 0, 
            icon: <PublicIcon />, 
            color: '#0EA5E9',
            trend: '+4.2%',
            trendIcon: <TrendingUpIcon fontSize="inherit" />,
            isPositive: true,
            description: 'Cross-border movement'
        },
        { 
            label: 'Critical Exceptions', 
            value: stats.exceptions || 0, 
            icon: <WarningAmberIcon />, 
            color: '#EF4444',
            trend: '-2.4%',
            trendIcon: <TrendingDownIcon fontSize="inherit" />,
            isPositive: true,
            description: 'Requires intervention'
        },
        { 
            label: 'Success Rate', 
            value: stats.delivered || 0, 
            icon: <CheckCircleOutlineIcon />, 
            color: '#10B981',
            trend: '99.2%',
            trendIcon: <SpeedIcon fontSize="inherit" />,
            isPositive: true,
            isPrimary: true,
            description: 'Successfully delivered'
        },
    ];

    if (statsLoading && !stats.total) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh">
                <Loader />
            </Box>
        );
    }

    return (
        <Box sx={{ 
            p: { xs: 2, md: 4 }, 
            maxWidth: 1600, 
            mx: 'auto',
            background: `radial-gradient(circle at 10% 20%, ${alpha(theme.palette.primary.main, 0.03)} 0%, transparent 40%)`
        }}>
            {/* Header: Target Logistics Global Branding */}
            <Box sx={{ mb: 6, display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, gap: 3 }}>
                <Box>
                    <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1.5 }}>
                        <Box sx={{ 
                            width: 48, 
                            height: 48, 
                            borderRadius: '14px', 
                            background: 'linear-gradient(135deg, #0050d4 0%, #003eaf 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 8px 16px -4px rgba(0,80,212,0.3)',
                            color: '#fff'
                        }}>
                            <HubIcon />
                        </Box>
                        <Box>
                            <Typography variant="h4" sx={{ fontWeight: 900, letterSpacing: '-0.04em', color: 'var(--on-surface)', display: 'flex', alignItems: 'center', gap: 1 }}>
                                Hello, {user?.name?.split(' ')[0] || 'Operator'}
                                <Box component="span" sx={{ fontSize: '24px', opacity: 0.8 }}>⚡</Box>
                            </Typography>
                            <Typography variant="body2" sx={{ color: 'var(--on-surface-variant)', fontWeight: 600 }}>
                                Managed by <Box component="span" sx={{ color: 'var(--primary)', fontWeight: 800 }}>Target Logistics Global</Box> Operations Suite
                            </Typography>
                        </Box>
                    </Stack>
                </Box>
                <Box sx={{ display: 'flex', gap: 2 }}>
                    <Button 
                        startIcon={<SupportAgentIcon />}
                        variant="outlined" 
                        sx={{ borderRadius: '12px', px: 3, fontWeight: 800, textTransform: 'none', borderColor: 'var(--outline-variant)', color: 'var(--on-surface)' }}
                    >
                        Support
                    </Button>
                    <Button 
                        startIcon={<AddIcon />}
                        variant="contained" 
                        onClick={() => navigate('/create')}
                        sx={{ 
                            borderRadius: '12px', 
                            px: 3, 
                            fontWeight: 800, 
                            textTransform: 'none',
                            background: 'linear-gradient(135deg, #0050d4 0%, #003eaf 100%)',
                            '&:hover': { boxShadow: '0 8px 24px -4px rgba(0,80,212,0.4)' }
                        }}
                    >
                        Create Shipment
                    </Button>
                </Box>
            </Box>

            {/* Global Stats Grid */}
            <Grid container spacing={3} sx={{ mb: 6 }}>
                {statsCards.map((stat, idx) => (
                    <Grid item xs={12} sm={6} lg={2.4} key={idx}>
                        <Card 
                            onMouseEnter={() => setHoveredCard(idx)}
                            onMouseLeave={() => setHoveredCard(null)}
                            sx={{ 
                                height: '100%', 
                                position: 'relative',
                                borderRadius: '24px',
                                background: isDark ? 'rgba(255,255,255,0.02)' : '#ffffff',
                                border: '1px solid',
                                borderColor: hoveredCard === idx ? stat.color : 'rgba(0,0,0,0.05)',
                                transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                                transform: hoveredCard === idx ? 'translateY(-8px)' : 'none',
                                boxShadow: hoveredCard === idx ? `0 24px 48px -12px ${alpha(stat.color, 0.2)}` : '0 4px 6px -1px rgba(0,0,0,0.02)',
                                overflow: 'hidden'
                            }}
                        >
                            <CardContent sx={{ p: 4 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
                                    <Box sx={{ 
                                        p: 1.5, 
                                        borderRadius: '14px', 
                                        bgcolor: alpha(stat.color, 0.1), 
                                        color: stat.color,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}>
                                        {stat.icon}
                                    </Box>
                                    <Box sx={{ 
                                        px: 1.5, 
                                        py: 0.5, 
                                        borderRadius: '99px', 
                                        bgcolor: stat.isPositive === null ? 'rgba(0,0,0,0.04)' : stat.isPositive ? alpha('#10B981', 0.1) : alpha('#EF4444', 0.1),
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 0.5
                                    }}>
                                        <Typography variant="caption" sx={{ fontWeight: 900, color: stat.isPositive === null ? 'text.secondary' : stat.isPositive ? '#059669' : '#DC2626', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                            {stat.trendIcon} {stat.trend}
                                        </Typography>
                                    </Box>
                                </Box>
                                <Typography variant="caption" sx={{ fontWeight: 800, color: 'var(--on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                                    {stat.label}
                                </Typography>
                                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mt: 1 }}>
                                    <Typography variant="h3" sx={{ fontWeight: 900, letterSpacing: '-0.04em', color: 'var(--on-surface)' }}>
                                        {stat.value.toLocaleString()}
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: 'var(--on-surface-variant)', fontWeight: 600 }}>
                                        units
                                    </Typography>
                                </Box>
                                <Typography variant="caption" sx={{ display: 'block', mt: 2, color: 'var(--on-surface-variant)', fontStyle: 'italic' }}>
                                    {stat.description}
                                </Typography>
                            </CardContent>
                            {/* Decorative Sparkline Simulation */}
                            <Box sx={{ 
                                position: 'absolute', 
                                bottom: 0, 
                                left: 0, 
                                right: 0, 
                                height: 4, 
                                bgcolor: alpha(stat.color, 0.2) 
                            }}>
                                <Box sx={{ 
                                    height: '100%', 
                                    width: hoveredCard === idx ? '100%' : '30%', 
                                    bgcolor: stat.color,
                                    transition: 'width 1s ease-in-out'
                                }} />
                            </Box>
                        </Card>
                    </Grid>
                ))}
            </Grid>

            {/* Operational Deep-Dive */}
            <Grid container spacing={4}>
                {/* Advanced Analytics Chart */}
                <Grid item xs={12} lg={8}>
                    <Card sx={{ borderRadius: '24px', border: '1px solid rgba(0,0,0,0.05)', height: '100%' }}>
                        <Box sx={{ p: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Box>
                                <Typography variant="h6" sx={{ fontWeight: 900 }}>Global Throughput Velocity</Typography>
                                <Typography variant="body2" sx={{ color: 'var(--on-surface-variant)' }}>Weekly cargo volume distribution across international hubs</Typography>
                            </Box>
                            <Stack direction="row" spacing={1}>
                                <Button size="small" variant="text" sx={{ fontWeight: 800 }}>Weekly</Button>
                                <Button size="small" variant="text" sx={{ fontWeight: 800, color: 'text.disabled' }}>Monthly</Button>
                            </Stack>
                        </Box>
                        <CardContent sx={{ p: 4, pt: 0 }}>
                            <Box sx={{ height: 350, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 2, pb: 4 }}>
                                {[70, 50, 85, 60, 95, 45, 90].map((h, i) => (
                                    <Box key={i} sx={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                        <Tooltip title={`${h}% Capacity`} arrow>
                                            <Box sx={{ 
                                                height: `${h}%`, 
                                                width: '100%', 
                                                maxWidth: 48,
                                                background: i === 4 
                                                    ? 'linear-gradient(to top, #0050d4, #00d9b8)' 
                                                    : alpha('#0050d4', 0.1),
                                                borderRadius: '12px 12px 6px 6px',
                                                transition: 'all 0.5s ease',
                                                cursor: 'pointer',
                                                '&:hover': { transform: 'scaleX(1.1)', boxShadow: i === 4 ? '0 8px 24px rgba(0,80,212,0.3)' : 'none' }
                                            }} />
                                        </Tooltip>
                                        <Typography variant="caption" sx={{ mt: 2, fontWeight: 800, color: 'var(--on-surface-variant)', textTransform: 'uppercase' }}>
                                            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i]}
                                        </Typography>
                                    </Box>
                                ))}
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>

                {/* Efficiency Sidebar */}
                <Grid item xs={12} lg={4}>
                    <Card sx={{ borderRadius: '24px', border: '1px solid rgba(0,0,0,0.05)', height: '100%' }}>
                        <Box sx={{ p: 4, bgcolor: alpha(theme.palette.primary.main, 0.02) }}>
                            <Typography variant="h6" sx={{ fontWeight: 900 }}>Dispatch Performance</Typography>
                            <Typography variant="body2" sx={{ color: 'var(--on-surface-variant)' }}>KVI (Key Velocity Indicators)</Typography>
                        </Box>
                        <CardContent sx={{ p: 4 }}>
                            <Stack spacing={4}>
                                {[
                                    { label: 'Carrier Response Rate', value: '99.4%', color: '#10B981', icon: <SpeedIcon fontSize="small" /> },
                                    { label: 'Air-Freight Punctuality', value: '96.2%', color: '#0050d4', icon: <PublicIcon fontSize="small" /> },
                                    { label: 'Customs Clearance avg.', value: '1.4h', color: '#F59E0B', icon: <PendingActionsIcon fontSize="small" /> },
                                    { label: 'Client Satisfaction (NPS)', value: '88', color: '#8B5CF6', icon: <CheckCircleOutlineIcon fontSize="small" /> },
                                ].map((item, idx) => (
                                    <Box key={idx}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                                            <Stack direction="row" spacing={1} alignItems="center">
                                                <Box sx={{ color: item.color }}>{item.icon}</Box>
                                                <Typography variant="body2" sx={{ fontWeight: 800, color: 'var(--on-surface)' }}>{item.label}</Typography>
                                            </Stack>
                                            <Typography variant="body2" sx={{ fontWeight: 900, color: item.color }}>{item.value}</Typography>
                                        </Box>
                                        <Box sx={{ height: 6, width: '100%', bgcolor: alpha(item.color, 0.1), borderRadius: '10px', overflow: 'hidden' }}>
                                            <Box sx={{ height: '100%', width: item.value.includes('%') ? item.value : '88%', bgcolor: item.color, borderRadius: '10px' }} />
                                        </Box>
                                    </Box>
                                ))}
                            </Stack>
                            
                            <Box sx={{ 
                                mt: 5, 
                                p: 3, 
                                borderRadius: '20px', 
                                background: 'linear-gradient(135deg, rgba(0,80,212,0.1) 0%, rgba(0,217,184,0.1) 100%)',
                                border: '1px solid rgba(0,80,212,0.1)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 2
                            }}>
                                <Avatar sx={{ bgcolor: 'var(--primary)', width: 44, height: 44 }}><TrendingUpIcon /></Avatar>
                                <Box>
                                    <Typography variant="caption" sx={{ fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase' }}>Forecast</Typography>
                                    <Typography variant="body2" sx={{ fontWeight: 700 }}>Volume expected to rise by 15% next week.</Typography>
                                </Box>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>

                {/* Manifest Manifest Table */}
                <Grid item xs={12}>
                    <Card sx={{ borderRadius: '24px', border: '1px solid rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                        <Box sx={{ p: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                            <Box>
                                <Typography variant="h6" sx={{ fontWeight: 900 }}>Live Operations Manifest</Typography>
                                <Typography variant="body2" sx={{ color: 'var(--on-surface-variant)' }}>Real-time telemetry from Target Logistics Global network</Typography>
                            </Box>
                            <Button 
                                variant="outlined" 
                                color="primary" 
                                size="small" 
                                sx={{ borderRadius: '10px', fontWeight: 800 }}
                                onClick={() => navigate('/shipments')}
                            >
                                All Shipments
                            </Button>
                        </Box>
                        <TableContainer sx={{ border: 'none' }}>
                            <Table sx={{ minWidth: 1000 }}>
                                <TableHead sx={{ bgcolor: alpha(theme.palette.primary.main, 0.01) }}>
                                    <TableRow>
                                        <TableCell sx={{ fontWeight: 900, typography: 'caption', color: 'var(--on-surface-variant)', textTransform: 'uppercase', py: 2.5, px: 4 }}>Asset Tracking</TableCell>
                                        <TableCell sx={{ fontWeight: 900, typography: 'caption', color: 'var(--on-surface-variant)', textTransform: 'uppercase' }}>Logistics Route</TableCell>
                                        <TableCell sx={{ fontWeight: 900, typography: 'caption', color: 'var(--on-surface-variant)', textTransform: 'uppercase' }}>Key Entity</TableCell>
                                        <TableCell sx={{ fontWeight: 900, typography: 'caption', color: 'var(--on-surface-variant)', textTransform: 'uppercase' }}>Schedule ETA</TableCell>
                                        <TableCell sx={{ fontWeight: 900, typography: 'caption', color: 'var(--on-surface-variant)', textTransform: 'uppercase' }} align="right">Dynamic Status</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {recentLoading ? (
                                        <TableRow><TableCell colSpan={5} align="center" sx={{ py: 12 }}><Loader /></TableCell></TableRow>
                                    ) : recentShipments.map((shipment) => (
                                        <TableRow 
                                            key={shipment.id} 
                                            hover 
                                            onClick={() => navigate(`/shipment/${shipment.trackingNumber}`)}
                                            sx={{ 
                                                cursor: 'pointer', 
                                                '&:hover .tracking-id': { color: 'var(--primary)' },
                                                '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.02) }
                                            }}
                                        >
                                            <TableCell sx={{ px: 4 }}>
                                                <Typography className="tracking-id" variant="body1" sx={{ fontWeight: 900, color: 'var(--on-surface)', transition: 'color 0.2s' }}>
                                                    #{shipment.trackingNumber}
                                                </Typography>
                                                <Typography variant="caption" sx={{ color: 'var(--on-surface-variant)', fontWeight: 600 }}>
                                                    {shipment.carrierCode || 'STANDARD'} Manifest
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Stack direction="row" spacing={1.5} alignItems="center">
                                                    <Box sx={{ p: 0.5, borderRadius: '6px', bgcolor: 'rgba(0,0,0,0.03)', fontWeight: 800, fontSize: '12px' }}>{shipment.origin?.countryCode || 'KW'}</Box>
                                                    <Typography variant="body2" sx={{ fontWeight: 800 }}>
                                                        {shipment.origin?.city} <Box component="span" sx={{ color: 'var(--primary)', mx: 1 }}>→</Box> {shipment.destination?.city}
                                                    </Typography>
                                                    <Box sx={{ p: 0.5, borderRadius: '6px', bgcolor: 'rgba(0,0,0,0.03)', fontWeight: 800, fontSize: '12px' }}>{shipment.destination?.countryCode || '—'}</Box>
                                                </Stack>
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2" sx={{ fontWeight: 700 }}>{shipment.receiver?.company || shipment.receiver?.name || 'Private Individual'}</Typography>
                                                <Typography variant="caption" sx={{ color: 'var(--on-surface-variant)' }}>Consignee Entity</Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2" sx={{ fontWeight: 800 }}>
                                                    {shipment.estimatedDelivery ? new Date(shipment.estimatedDelivery).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'Calculated...'}
                                                </Typography>
                                                <Typography variant="caption" sx={{ color: shipment.status === 'delayed' ? 'error.main' : 'success.main', fontWeight: 800 }}>
                                                    On Schedule
                                                </Typography>
                                            </TableCell>
                                            <TableCell align="right" sx={{ px: 4 }}>
                                                <Box sx={{ 
                                                    display: 'inline-flex', 
                                                    alignItems: 'center',
                                                    gap: 1,
                                                    px: 2.5, 
                                                    py: 1, 
                                                    borderRadius: '12px',
                                                    fontSize: '11px',
                                                    fontWeight: 900,
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '0.04em',
                                                    bgcolor: shipment.status === 'delivered' ? alpha('#10B981', 0.1) : alpha('#0050d4', 0.1),
                                                    color: shipment.status === 'delivered' ? '#059669' : '#0050d4',
                                                    border: '1px solid',
                                                    borderColor: shipment.status === 'delivered' ? alpha('#10B981', 0.2) : alpha('#0050d4', 0.2)
                                                }}>
                                                    <Box sx={{ width: 6, height: 6, borderRadius: 'full', bgcolor: 'currentColor', animation: 'pulse 2s infinite' }} />
                                                    {shipment.status.replace(/_/g, ' ')}
                                                </Box>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Card>
                </Grid>
            </Grid>
        </Box>
    );
};

export default DashboardPage;
