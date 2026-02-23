import React from 'react';
import { Box, Typography, Button, Paper } from '@mui/material';
import { alpha } from '@mui/material/styles';

/**
 * EmptyState - Premium empty state placeholder
 * 
 * @param {string} title - Main message
 * @param {string} description - Detailed helper text
 * @param {ReactNode} icon - Icon component
 * @param {ReactNode} action - Primary CTA button
 * @param {string} image - Optional image URL
 */
const EmptyState = ({
    title = "No data available",
    description = "Get started by creating your first item.",
    icon,
    action,
    image
}) => {
    return (
        <Paper
            variant="outlined"
            sx={{
                p: 6,
                textAlign: 'center',
                borderRadius: 4,
                backgroundColor: (theme) => alpha(theme.palette.background.paper, 0.4),
                borderStyle: 'dashed',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 300,
                height: '100%'
            }}
        >
            {image ? (
                <Box component="img" src={image} alt="Empty" sx={{ width: 200, height: 'auto', mb: 3, opacity: 0.8 }} />
            ) : icon ? (
                <Box sx={{
                    p: 3,
                    borderRadius: '50%',
                    bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
                    color: 'primary.main',
                    mb: 3,
                    display: 'inline-flex'
                }}>
                    {React.cloneElement(icon, { sx: { fontSize: 48 } })}
                </Box>
            ) : null}

            <Typography variant="h5" fontWeight="bold" gutterBottom>
                {title}
            </Typography>

            <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 500, mb: 4, mx: 'auto' }}>
                {description}
            </Typography>

            {action && (
                <Box>
                    {action}
                </Box>
            )}
        </Paper>
    );
};

export default EmptyState;
