import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useShipmentStats } from '../utils/useShipmentStats';
import { useShipments } from '../utils/useShipments';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { Loader } from '../ui';
import { 
  Box, 
  Grid, 
  Typography, 
  Card, 
  CardContent, 
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  alpha,
  useTheme,
  Stack,
  Avatar,
  ButtonGroup
} from '@mui/material';
import { TK, STATUS_CONFIG } from '../tokens/kineticHorizon';
import VolumeBarChart from '../components/charts/VolumeBarChart';
import VelocityProgressBar from '../components/charts/VelocityProgressBar';

/**
 * Target Logistics Global - Kinetic Horizon Dashboard
 * High-polish operational analytics cockpit with zero-dependency SVG charts and Kuwaiti Arabic bilingual support.
 */
const DashboardPage = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { t, lang } = useLanguage();
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';
    
    // UI State for interactivity
    const [hoveredCard, setHoveredCard] = useState(null);
    const [timeframe, setTimeframe] = useState('weekly'); // 'weekly' | 'monthly'
    
    const { stats, loading: statsLoading } = useShipmentStats();
    const { shipments: recentShipments, loading: recentLoading } = useShipments({ limit: 8 });

    const statsCards = [
        { 
            label: t('dash_total_shipments', 'Total Shipments'), 
            value: stats.total || 0, 
            icon: <span className="material-symbols-outlined" style={{ fontSize: 22 }}>local_shipping</span>, 
            color: TK.primary,
            trend: '+12.5%',
            trendIcon: <span className="material-symbols-outlined" style={{ fontSize: 16 }}>trending_up</span>,
            isPositive: true,
            description: t('dash_total_desc', 'Total active lifecycle')
        },
        { 
            label: t('dash_pending_gate', 'Pending Gate'), 
            value: stats.pending || 0, 
            icon: <span className="material-symbols-outlined" style={{ fontSize: 22 }}>pending_actions</span>, 
            color: TK.warning,
            trend: t('stable', 'Stable'),
            trendIcon: null,
            isPositive: null,
            description: t('dash_pending_desc', 'Awaiting manifest approval')
        },
        { 
            label: t('dash_global_transit', 'Global Transit'), 
            value: stats.inTransit || 0, 
            icon: <span className="material-symbols-outlined" style={{ fontSize: 22 }}>public</span>, 
            color: TK.info,
            trend: '+4.2%',
            trendIcon: <span className="material-symbols-outlined" style={{ fontSize: 16 }}>trending_up</span>,
            isPositive: true,
            description: t('dash_transit_desc', 'Cross-border movement')
        },
        { 
            label: t('dash_exceptions', 'Critical Exceptions'), 
            value: stats.exceptions || 0, 
            icon: <span className="material-symbols-outlined" style={{ fontSize: 22 }}>warning</span>, 
            color: TK.error,
            trend: '-2.4%',
            trendIcon: <span className="material-symbols-outlined" style={{ fontSize: 16 }}>trending_down</span>,
            isPositive: true,
            description: t('dash_exceptions_desc', 'Requires intervention')
        },
        { 
            label: t('dash_success_rate', 'Success Rate'), 
            value: stats.delivered || 0, 
            icon: <span className="material-symbols-outlined" style={{ fontSize: 22 }}>check_circle</span>, 
            color: TK.success,
            trend: '99.2%',
            trendIcon: <span className="material-symbols-outlined" style={{ fontSize: 16 }}>speed</span>,
            isPositive: true,
            isPrimary: true,
            description: t('dash_success_desc', 'Successfully delivered')
        },
    ];

    // Data for weekly vs monthly volume chart
    const weeklyChartData = useMemo(() => {
        const days = lang === 'ar' 
            ? ['الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد']
            : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        return [
            { label: days[0], count: Math.max(12, Math.round((stats.total || 45) * 0.14)) },
            { label: days[1], count: Math.max(18, Math.round((stats.total || 45) * 0.19)) },
            { label: days[2], count: Math.max(15, Math.round((stats.total || 45) * 0.16)) },
            { label: days[3], count: Math.max(28, Math.round((stats.total || 45) * 0.28)) },
            { label: days[4], count: Math.max(22, Math.round((stats.total || 45) * 0.22)) },
            { label: days[5], count: Math.max(8, Math.round((stats.total || 45) * 0.08)) },
            { label: days[6], count: Math.max(14, Math.round((stats.total || 45) * 0.15)) },
        ];
    }, [stats.total, lang]);

    const monthlyChartData = useMemo(() => {
        const months = [];
        const monthNames = lang === 'ar'
            ? ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
            : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const now = new Date();
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const mName = monthNames[d.getMonth()];
            const count = Math.max(25, Math.round((stats.total || 35) * (4.5 + (5 - i) * 0.8)));
            months.push({ label: mName, count });
        }
        return months;
    }, [stats.total, lang]);

    // Simulated Real-Time Activity Feed based on recent shipments
    const activityFeed = useMemo(() => {
        if (!recentShipments || recentShipments.length === 0) {
            return [
                { id: 1, title: lang === 'ar' ? 'تم ترحيل المانيفست' : 'Manifest Dispatched', desc: lang === 'ar' ? 'انطلاق الشحنة من مستودع الكويت إلى دبي' : 'TLG-20250429-001 departed Kuwait Hub to DXB', time: '12m', icon: 'flight_takeoff', color: TK.primary },
                { id: 2, title: lang === 'ar' ? 'تم التخليص الجمركي' : 'Customs Cleared', desc: lang === 'ar' ? 'اكتمال الإفراج الجمركي في المطار' : 'TLG-20250429-004 cleared Frankfurt customs', time: '45m', icon: 'verified', color: TK.success },
                { id: 3, title: lang === 'ar' ? 'تم تسليم الطرد' : 'Package Delivered', desc: lang === 'ar' ? 'توقيع المستلم في الرياض' : 'TLG-20250429-002 signed by receiver in Riyadh', time: '2h', icon: 'check_circle', color: TK.success },
                { id: 4, title: lang === 'ar' ? 'جدولة استلام' : 'Pickup Scheduled', desc: lang === 'ar' ? 'تكليف المندوب باستلام الشحنة' : 'Driver assigned for origin pickup', time: '3h', icon: 'schedule', color: TK.info },
            ];
        }
        return recentShipments.slice(0, 4).map((s, idx) => ({
            id: s.id || idx,
            title: s.status === 'delivered' ? (lang === 'ar' ? 'تم تسليم الشحنة' : 'Shipment Delivered') : s.status === 'in_transit' ? (lang === 'ar' ? 'شحنة قيد النقل' : 'In Global Transit') : (lang === 'ar' ? 'تم إصدار البوليصة' : 'Manifest Created'),
            desc: `#${s.trackingNumber} (${s.origin?.city || 'Kuwait'} → ${s.destination?.city || 'Dest'})`,
            time: `${(idx + 1) * 25}m`,
            icon: s.status === 'delivered' ? 'check_circle' : s.status === 'in_transit' ? 'flight' : 'add_circle',
            color: s.status === 'delivered' ? TK.success : s.status === 'in_transit' ? TK.primary : TK.info,
        }));
    }, [recentShipments, lang]);

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
            background: `radial-gradient(circle at 10% 20%, ${alpha(TK.primary, 0.03)} 0%, transparent 40%)`
        }}>
            {/* Header: Target Logistics Global Branding */}
            <Box sx={{ mb: 4, display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, gap: 3 }}>
                <Box>
                    <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1 }}>
                        <Box sx={{ 
                            width: 46, 
                            height: 46, 
                            borderRadius: '20px', 
                            background: isDark ? 'rgba(255,255,255,0.02)' : '#ffffff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
                            color: '#0050d4'
                        }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 24 }}>hub</span>
                        </Box>
                        <Box>
                            <Typography variant="h4" sx={{ fontWeight: 900, letterSpacing: '-0.03em', color: TK.text1, display: 'flex', alignItems: 'center', gap: 1 }}>
                                {t('dash_hello', 'Hello,')} {user?.name?.split(' ')[0] || (lang === 'ar' ? 'المشغل' : 'Operator')}
                                <Box component="span" sx={{ fontSize: '22px', opacity: 0.85 }}>⚡</Box>
                            </Typography>
                            <Typography variant="body2" sx={{ color: TK.text2, fontWeight: 600 }}>
                                {t('dash_subtitle', 'Target Logistics Global Operations Cockpit & Telemetry')}
                            </Typography>
                        </Box>
                    </Stack>
                </Box>
                <Box sx={{ display: 'flex', gap: 1.5 }}>
                    <Button 
                        startIcon={<span className="material-symbols-outlined" style={{ fontSize: 18 }}>support_agent</span>}
                        variant="outlined" 
                        sx={{ borderRadius: `${TK.radiusMd}px`, px: 2.5, fontWeight: 700, textTransform: 'none', borderColor: TK.border, color: TK.text1 }}
                        onClick={() => navigate('/contact')}
                    >
                        {t('dash_support', 'Support')}
                    </Button>
                    <Button 
                        startIcon={<span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>}
                        variant="contained" 
                        onClick={() => navigate('/shipment/new')}
                        sx={{ 
                            borderRadius: `${TK.radiusMd}px`, 
                            px: 3, 
                            fontWeight: 800, 
                            textTransform: 'none',
                            background: 'linear-gradient(135deg, #0050d4 0%, #003eaf 100%)',
                            boxShadow: '0 4px 14px rgba(0,80,212,0.25)',
                            '&:hover': { boxShadow: '0 8px 24px -4px rgba(0,80,212,0.4)' }
                        }}
                    >
                        {t('dash_create_shipment', 'Create Shipment')}
                    </Button>
                </Box>
            </Box>

            {/* Global Stats Grid (5 Cards) */}
            <Grid container spacing={2.5} sx={{ mb: 4 }}>
                {statsCards.map((stat, idx) => (
                    <Grid item xs={12} sm={6} lg={2.4} key={idx}>
                        <Card 
                            onMouseEnter={() => setHoveredCard(idx)}
                            onMouseLeave={() => setHoveredCard(null)}
                            sx={{ 
                                height: '100%', 
                                position: 'relative',
                                borderRadius: '20px',
                                background: isDark ? 'rgba(255,255,255,0.02)' : '#ffffff',
                                border: `1px solid ${hoveredCard === idx ? stat.color : TK.border}`,
                                transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                                transform: hoveredCard === idx ? 'translateY(-4px)' : 'none',
                                boxShadow: hoveredCard === idx ? `0 16px 36px -8px ${alpha(stat.color, 0.18)}` : '0 4px 20px rgba(0,0,0,0.05)',
                                overflow: 'hidden'
                            }}
                        >
                            <CardContent sx={{ p: 3 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                                    <Box sx={{ 
                                        width: 40,
                                        height: 40,
                                        borderRadius: '11px', 
                                        bgcolor: alpha(stat.color, 0.1), 
                                        color: stat.color,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}>
                                        {stat.icon}
                                    </Box>
                                    <Box sx={{ 
                                        px: 1.25, 
                                        py: 0.35, 
                                        borderRadius: '99px', 
                                        bgcolor: stat.isPositive === null ? 'rgba(0,0,0,0.04)' : stat.isPositive ? TK.successBg : TK.errorBg,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 0.5
                                    }}>
                                        <Typography variant="caption" sx={{ fontWeight: 800, color: stat.isPositive === null ? TK.text2 : stat.isPositive ? TK.success : TK.error, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                            {stat.trendIcon} {stat.trend}
                                        </Typography>
                                    </Box>
                                </Box>
                                <Typography variant="caption" sx={{ fontWeight: 800, color: TK.text3, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                    {stat.label}
                                </Typography>
                                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, mt: 0.5 }}>
                                    <Typography variant="h4" sx={{ fontWeight: 900, letterSpacing: '-0.03em', color: TK.text1 }}>
                                        {stat.value.toLocaleString()}
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: TK.text3, fontWeight: 600 }}>
                                        {t('units', 'units')}
                                    </Typography>
                                </Box>
                                <Typography variant="caption" sx={{ display: 'block', mt: 1, color: TK.text2, fontSize: 11.5 }}>
                                    {stat.description}
                                </Typography>
                            </CardContent>
                            
                            {/* Decorative Sparkline */}
                            <Box sx={{ 
                                position: 'absolute', 
                                bottom: 0, 
                                left: 0, 
                                right: 0, 
                                height: 3, 
                                bgcolor: alpha(stat.color, 0.15) 
                            }}>
                                <Box sx={{ 
                                    height: '100%', 
                                    width: hoveredCard === idx ? '100%' : '35%', 
                                    bgcolor: stat.color,
                                    transition: 'width 0.8s ease-in-out'
                                }} />
                            </Box>
                        </Card>
                    </Grid>
                ))}
            </Grid>

            {/* Operational Deep-Dive & Visualizations */}
            <Grid container spacing={3} sx={{ mb: 4 }}>
                {/* Advanced SVG Volume Analytics Chart */}
                <Grid item xs={12} lg={8}>
                    <Card sx={{ 
                        borderRadius: '20px', 
                        background: isDark ? 'rgba(255,255,255,0.02)' : '#ffffff',
                        border: `1px solid ${TK.border}`, 
                        boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column'
                    }}>
                        <Box sx={{ p: 3, pb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}>
                            <Box>
                                <Typography variant="h6" sx={{ fontWeight: 800, color: TK.text1, fontSize: '1.1rem' }}>
                                    {t('dash_throughput_title', 'Global Throughput Volume')}
                                </Typography>
                                <Typography variant="body2" sx={{ color: TK.text2, fontSize: '0.82rem' }}>
                                    {t('dash_throughput_desc', 'Cargo volume distribution across international dispatch hubs')}
                                </Typography>
                            </Box>
                            
                            {/* Timeframe selector */}
                            <ButtonGroup size="small" sx={{ borderRadius: `${TK.radiusSm}px`, overflow: 'hidden' }}>
                                <Button 
                                    onClick={() => setTimeframe('weekly')}
                                    variant={timeframe === 'weekly' ? 'contained' : 'outlined'}
                                    sx={{ 
                                        fontWeight: 700, 
                                        fontSize: 12, 
                                        textTransform: 'none',
                                        bgcolor: timeframe === 'weekly' ? TK.primary : 'transparent',
                                        borderColor: TK.border
                                    }}
                                >
                                    {t('weekly', 'Weekly')}
                                </Button>
                                <Button 
                                    onClick={() => setTimeframe('monthly')}
                                    variant={timeframe === 'monthly' ? 'contained' : 'outlined'}
                                    sx={{ 
                                        fontWeight: 700, 
                                        fontSize: 12, 
                                        textTransform: 'none',
                                        bgcolor: timeframe === 'monthly' ? TK.primary : 'transparent',
                                        borderColor: TK.border
                                    }}
                                >
                                    {t('monthly', 'Monthly')}
                                </Button>
                            </ButtonGroup>
                        </Box>
                        
                        <CardContent sx={{ p: 3, pt: 1, flex: 1, display: 'flex', alignItems: 'center' }}>
                            <VolumeBarChart 
                                data={timeframe === 'weekly' ? weeklyChartData : monthlyChartData} 
                                height={210}
                                unit={lang === 'ar' ? 'طرد' : 'pkgs'}
                            />
                        </CardContent>
                    </Card>
                </Grid>

                {/* Efficiency & Velocity Indicators */}
                <Grid item xs={12} lg={4}>
                    <Card sx={{ 
                        borderRadius: '20px', 
                        background: isDark ? 'rgba(255,255,255,0.02)' : '#ffffff',
                        border: `1px solid ${TK.border}`, 
                        boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between'
                    }}>
                        <Box sx={{ p: 3, pb: 1.5, borderBottom: `1px solid ${TK.border}` }}>
                            <Typography variant="h6" sx={{ fontWeight: 800, color: TK.text1, fontSize: '1.1rem' }}>
                                {t('dash_dispatch_performance', 'Dispatch Performance')}
                            </Typography>
                            <Typography variant="body2" sx={{ color: TK.text2, fontSize: '0.82rem' }}>
                                {t('dash_kvi_subtitle', 'Key Velocity Indicators (KVI)')}
                            </Typography>
                        </Box>
                        <CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                            <VelocityProgressBar 
                                label={t('dash_carrier_response', 'Carrier Response Rate')} 
                                value={96.4} 
                                displayValue="96.4%" 
                                target=">95%" 
                                color={TK.success} 
                                icon="speed" 
                            />
                            <VelocityProgressBar 
                                label={t('dash_air_punctuality', 'Air-Freight Punctuality')} 
                                value={91.8} 
                                displayValue="91.8%" 
                                target=">90%" 
                                color={TK.primary} 
                                icon="flight" 
                            />
                            <VelocityProgressBar 
                                label={t('dash_customs_avg', 'Customs Clearance avg.')} 
                                value={85} 
                                displayValue={lang === 'ar' ? '4.2 ساعة' : '4.2 hrs'} 
                                target="<6h" 
                                color={TK.purple} 
                                icon="verified_user" 
                            />
                            <VelocityProgressBar 
                                label={t('dash_client_nps', 'Client Satisfaction (NPS)')} 
                                value={74} 
                                displayValue="+74" 
                                target=">70" 
                                color={TK.warning} 
                                icon="sentiment_satisfied" 
                            />

                            {/* Volume Forecast Card */}
                            <Box sx={{ 
                                mt: 1, 
                                p: 2, 
                                borderRadius: '20px', 
                                background: isDark ? 'rgba(255,255,255,0.02)' : '#ffffff',
                                boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
                                border: `1px solid rgba(0,80,212,0.15)`,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1.5
                            }}>
                                <Avatar sx={{ bgcolor: TK.primary, width: 36, height: 36, color: '#fff' }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>trending_up</span>
                                </Avatar>
                                <Box>
                                    <Typography variant="caption" sx={{ fontWeight: 800, color: TK.primary, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                        {t('dash_forecast_title', 'Forecast')}
                                    </Typography>
                                    <Typography variant="body2" sx={{ fontWeight: 700, color: TK.text1, fontSize: '0.85rem' }}>
                                        {t('dash_forecast_desc', '+15% Volume projected next week (~340 pkgs)')}
                                    </Typography>
                                </Box>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {/* Live Activity Timeline & Manifest Grid */}
            <Grid container spacing={3}>
                {/* Live Activity Stream */}
                <Grid item xs={12} lg={4}>
                    <Card sx={{ 
                        borderRadius: '20px', 
                        background: isDark ? 'rgba(255,255,255,0.02)' : '#ffffff',
                        border: `1px solid ${TK.border}`, 
                        boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
                        height: '100%' 
                    }}>
                        <Box sx={{ p: 3, pb: 2, borderBottom: `1px solid ${TK.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Box>
                                <Typography variant="h6" sx={{ fontWeight: 800, color: TK.text1, fontSize: '1.05rem' }}>
                                    {t('dash_live_feed_title', 'Live Operations Feed')}
                                </Typography>
                                <Typography variant="body2" sx={{ color: TK.text2, fontSize: '0.8rem' }}>
                                    {t('dash_live_feed_desc', 'Real-time network events & dispatches')}
                                </Typography>
                            </Box>
                            <span className="material-symbols-outlined" style={{ fontSize: 20, color: TK.primary }}>
                                sensors
                            </span>
                        </Box>
                        <CardContent sx={{ p: 3 }}>
                            <Stack spacing={2.5}>
                                {activityFeed.map((item) => (
                                    <Box key={item.id} sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                                        <Box sx={{ 
                                            width: 34, 
                                            height: 34, 
                                            borderRadius: '50%', 
                                            bgcolor: alpha(item.color, 0.12), 
                                            color: item.color,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            flexShrink: 0
                                        }}>
                                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{item.icon}</span>
                                        </Box>
                                        <Box sx={{ flex: 1, minWidth: 0 }}>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                                <Typography sx={{ fontWeight: 700, fontSize: 13, color: TK.text1 }}>
                                                    {item.title}
                                                </Typography>
                                                <Typography sx={{ fontSize: 11, color: TK.text3, fontWeight: 500 }}>
                                                    {item.time}
                                                </Typography>
                                            </Box>
                                            <Typography sx={{ fontSize: 12, color: TK.text2, mt: 0.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {item.desc}
                                            </Typography>
                                        </Box>
                                    </Box>
                                ))}
                            </Stack>
                        </CardContent>
                    </Card>
                </Grid>

                {/* Operations Manifest Table */}
                <Grid item xs={12} lg={8}>
                    <Card sx={{ 
                        borderRadius: '20px', 
                        background: isDark ? 'rgba(255,255,255,0.02)' : '#ffffff',
                        border: `1px solid ${TK.border}`, 
                        boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
                        overflow: 'hidden' 
                    }}>
                        <Box sx={{ p: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${TK.border}` }}>
                            <Box>
                                <Typography variant="h6" sx={{ fontWeight: 800, color: TK.text1, fontSize: '1.05rem' }}>
                                    {t('dash_recent_manifests', 'Recent Active Manifests')}
                                </Typography>
                                <Typography variant="body2" sx={{ color: TK.text2, fontSize: '0.8rem' }}>
                                    {t('dash_recent_manifests_desc', 'Live telemetry from Target Logistics Global pipeline')}
                                </Typography>
                            </Box>
                            <Button 
                                variant="outlined" 
                                size="small" 
                                sx={{ borderRadius: `${TK.radiusSm}px`, fontWeight: 700, textTransform: 'none', borderColor: TK.border, color: TK.text1 }}
                                onClick={() => navigate('/shipments')}
                            >
                                {t('dash_view_all', 'View All')}
                            </Button>
                        </Box>
                        <TableContainer sx={{ border: 'none' }}>
                            <Table sx={{ minWidth: 650, textAlign: lang === 'ar' ? 'right' : 'left' }}>
                                <TableHead sx={{ bgcolor: '#f8fafc' }}>
                                    <TableRow>
                                        <TableCell sx={{ fontWeight: 800, fontSize: 11, color: TK.text3, textTransform: 'uppercase', py: 1.5, px: 3 }}>
                                            {t('dash_th_tracking', 'Tracking & Service')}
                                        </TableCell>
                                        <TableCell sx={{ fontWeight: 800, fontSize: 11, color: TK.text3, textTransform: 'uppercase' }}>
                                            {t('dash_th_route', 'Route')}
                                        </TableCell>
                                        <TableCell sx={{ fontWeight: 800, fontSize: 11, color: TK.text3, textTransform: 'uppercase' }}>
                                            {t('dash_th_recipient', 'Recipient')}
                                        </TableCell>
                                        <TableCell sx={{ fontWeight: 800, fontSize: 11, color: TK.text3, textTransform: 'uppercase' }} align={lang === 'ar' ? 'left' : 'right'}>
                                            {t('dash_th_status', 'Status')}
                                        </TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {recentLoading ? (
                                        <TableRow><TableCell colSpan={4} align="center" sx={{ py: 6 }}><Loader /></TableCell></TableRow>
                                    ) : recentShipments.map((shipment) => {
                                        const cfg = STATUS_CONFIG[shipment.status] || STATUS_CONFIG.in_transit;
                                        return (
                                            <TableRow 
                                                key={shipment.id} 
                                                hover 
                                                onClick={() => navigate(`/shipment/${shipment.trackingNumber}`)}
                                                sx={{ 
                                                    cursor: 'pointer', 
                                                    '&:hover .tracking-id': { color: TK.primary },
                                                    transition: 'background 0.12s'
                                                }}
                                            >
                                                <TableCell sx={{ px: 3, py: 1.5 }}>
                                                    <Typography className="tracking-id" sx={{ fontWeight: 800, fontSize: 13, color: TK.text1, transition: 'color 0.15s' }}>
                                                        {shipment.trackingNumber}
                                                    </Typography>
                                                    <Typography sx={{ color: TK.text3, fontSize: 11 }}>
                                                        {shipment.carrierCode || 'Express Air'}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell sx={{ py: 1.5 }}>
                                                    <Stack direction="row" spacing={1} alignItems="center">
                                                        <Typography sx={{ fontWeight: 600, fontSize: 12.5, color: TK.text1 }}>
                                                            {shipment.origin?.city || (lang === 'ar' ? 'الكويت' : 'Kuwait')}
                                                        </Typography>
                                                        <Typography sx={{ color: TK.primary, fontWeight: 700 }}>
                                                            {lang === 'ar' ? '←' : '→'}
                                                        </Typography>
                                                        <Typography sx={{ fontWeight: 600, fontSize: 12.5, color: TK.text1 }}>
                                                            {shipment.destination?.city || (lang === 'ar' ? 'الرياض' : 'Riyadh')}
                                                        </Typography>
                                                    </Stack>
                                                </TableCell>
                                                <TableCell sx={{ py: 1.5 }}>
                                                    <Typography sx={{ fontWeight: 600, fontSize: 12.5, color: TK.text1 }}>
                                                        {shipment.receiver?.contactPerson || shipment.receiver?.name || shipment.receiver?.company || (lang === 'ar' ? 'المستلم' : 'Consignee')}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell align={lang === 'ar' ? 'left' : 'right'} sx={{ px: 3, py: 1.5 }}>
                                                    <Box sx={{ 
                                                        display: 'inline-flex', 
                                                        alignItems: 'center',
                                                        gap: 0.75,
                                                        px: 1.5, 
                                                        py: 0.5, 
                                                        borderRadius: '99px',
                                                        fontSize: '11px',
                                                        fontWeight: 700,
                                                        bgcolor: cfg.bg,
                                                        color: cfg.color,
                                                        border: `1px solid ${cfg.border}`
                                                    }}>
                                                        <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: cfg.color }} />
                                                        {t(`status_${shipment.status}`, cfg.label)}
                                                    </Box>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
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
