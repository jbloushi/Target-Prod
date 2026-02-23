import React from 'react';
import { Box, Typography, Button, Breadcrumbs, Link, Chip, Skeleton, useTheme } from '@mui/material';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';

/**
 * PageHeader - Standardized top-of-page component
 * 
 * @param {string} title - Main page title
 * @param {string} description - Subtitle or context
 * @param {Array} breadcrumbs - Optional breadcrumbs [{ label, href }]
 * @param {ReactNode} action - Primary action button or component
 * @param {ReactNode} secondaryAction - Secondary action or filter
 * @param {boolean} loading - Show skeleton state
 */
const PageHeader = ({
    title,
    description,
    breadcrumbs = [],
    action,
    secondaryAction,
    loading = false
}) => {
    const theme = useTheme();

    return (
        <Box sx={{ mb: 4 }}>
            {/* Breadcrumbs (Optional) */}
            {breadcrumbs.length > 0 && (
                <Breadcrumbs
                    separator={<NavigateNextIcon fontSize="small" />}
                    aria-label="breadcrumb"
                    sx={{ mb: 1, '& .MuiLink-root': { color: '#9ca3af', fontSize: '0.875rem' } }}
                >
                    {breadcrumbs.map((crumb, index) => (
                        <Link
                            key={index}
                            underline="hover"
                            color={index === breadcrumbs.length - 1 ? "text.primary" : "inherit"}
                            href={crumb.href || '#'}
                            sx={{ display: 'flex', alignItems: 'center' }}
                        >
                            {crumb.label}
                        </Link>
                    ))}
                </Breadcrumbs>
            )}

            <Box display="flex" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={2}>
                <Box>
                    {loading ? (
                        <>
                            <Skeleton width={200} height={50} />
                            <Skeleton width={300} height={24} />
                        </>
                    ) : (
                        <>
                            <Typography variant="h3" component="h1" fontWeight="800" gutterBottom sx={{
                                letterSpacing: '-0.03em',
                                color: '#e8eaf0'
                            }}>
                                {title}
                            </Typography>
                            {description && (
                                <Typography variant="subtitle1" color="text.secondary" sx={{ maxWidth: '800px' }}>
                                    {description}
                                </Typography>
                            )}
                        </>
                    )}
                </Box>

                <Box display="flex" gap={2} alignItems="center">
                    {secondaryAction}
                    {action}
                </Box>
            </Box>
        </Box>
    );
};

export default PageHeader;
