import React from 'react';
import { Card, CardContent, Typography, Box, Badge, List, ListItem, ListItemIcon, ListItemText, Chip, Button } from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { alpha, useTheme } from '@mui/material/styles';

/**
 * AIInsightsCard - Displays predictive insights
 * 
 * @param {Array} insights - List of insight objects { type, message, impact }
 * @param {boolean} loading - Loading state
 */
const AIInsightsCard = ({ insights = [], loading = false }) => {
    const theme = useTheme();

    return (
        <Card sx={{
            position: 'relative',
            overflow: 'visible',
            background: `linear-gradient(135deg, ${alpha(theme.palette.background.paper, 0.9)}, ${alpha(theme.palette.background.paper, 0.6)})`,
            backdropFilter: 'blur(20px)',
            border: `1px solid ${alpha(theme.palette.secondary.main, 0.2)}`
        }}>
            {/* Premium Glow Effect */}
            <Box sx={{
                position: 'absolute',
                top: -20,
                right: -20,
                width: 100,
                height: 100,
                borderRadius: '50%',
                background: theme.palette.secondary.main,
                filter: 'blur(60px)',
                opacity: 0.15,
                zIndex: 0
            }} />

            <CardContent sx={{ position: 'relative', zIndex: 1 }}>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                    <Box display="flex" alignItems="center" gap={1}>
                        <AutoAwesomeIcon sx={{ color: theme.palette.secondary.main }} />
                        <Typography variant="h6" fontWeight="800">
                            AI Logistics Insights
                        </Typography>
                    </Box>
                    <Chip
                        label="DEMO"
                        size="small"
                        color="warning"
                        variant="outlined"
                        sx={{ fontWeight: 'bold', fontSize: '0.7rem', height: 20 }}
                    />
                </Box>

                {insights.length > 0 ? (
                    <List disablePadding>
                        {insights.map((insight, index) => (
                            <ListItem key={index} sx={{ px: 0, py: 1.5, borderBottom: `1px solid ${alpha(theme.palette.divider, 0.5)}` }}>
                                <ListItemIcon sx={{ minWidth: 40 }}>
                                    {insight.type === 'warning' && <WarningAmberIcon color="warning" fontSize="small" />}
                                    {insight.type === 'opportunity' && <TrendingUpIcon color="success" fontSize="small" />}
                                    {(!insight.type || insight.type === 'info') && <LightbulbIcon color="info" fontSize="small" />}
                                </ListItemIcon>
                                <ListItemText
                                    primary={insight.message}
                                    primaryTypographyProps={{ variant: 'body2', fontWeight: 600 }}
                                    secondary={insight.impact}
                                    secondaryTypographyProps={{ variant: 'caption', color: 'text.secondary' }}
                                />
                            </ListItem>
                        ))}
                    </List>
                ) : (
                    <Box textAlign="center" py={3}>
                        <Typography variant="body2" color="text.secondary" gutterBottom>
                            Our AI is analyzing your shipping patterns to provide predictive insights.
                        </Typography>
                        <Typography variant="caption" display="block" color="text.disabled" sx={{ fontStyle: 'italic', mb: 2 }}>
                            Example: "Shipment #12348 is at risk of delay due to weather in Transit Hub."
                        </Typography>
                        <Button variant="outlined" color="secondary" size="small" startIcon={<AutoAwesomeIcon />}>
                            Enable Advanced Analytics
                        </Button>
                    </Box>
                )}
            </CardContent>
        </Card>
    );
};

export default AIInsightsCard;
