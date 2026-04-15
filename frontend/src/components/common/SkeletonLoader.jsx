import React from 'react';
import { Skeleton, Box, Grid, Card, CardContent } from '@mui/material';

export const TableSkeleton = ({ rows = 5 }) => (
    <Box>
        <Skeleton height={50} width="100%" sx={{ mb: 2, borderRadius: 2 }} /> {/* Header */}
        {[...Array(rows)].map((_, i) => (
            <Skeleton key={i} height={70} width="100%" sx={{ mb: 1, borderRadius: 2 }} />
        ))}
    </Box>
);

export const CardSkeleton = ({ count = 3 }) => (
    <Grid container spacing={3}>
        {[...Array(count)].map((_, i) => (
            <Grid item xs={12} md={4} key={i}>
                <Card>
                    <CardContent>
                        <Skeleton variant="circular" width={40} height={40} sx={{ mb: 2 }} />
                        <Skeleton variant="text" width="60%" height={32} sx={{ mb: 1 }} />
                        <Skeleton variant="text" width="40%" />
                    </CardContent>
                </Card>
            </Grid>
        ))}
    </Grid>
);

export const FormSkeleton = () => (
    <Box>
        <Skeleton height={80} width="100%" sx={{ mb: 3 }} />
        <Grid container spacing={3}>
            <Grid item xs={6}><Skeleton height={56} /></Grid>
            <Grid item xs={6}><Skeleton height={56} /></Grid>
            <Grid item xs={12}><Skeleton height={56} /></Grid>
            <Grid item xs={12}><Skeleton height={150} /></Grid>
        </Grid>
    </Box>
);
