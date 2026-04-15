import React from 'react';
import { Paper, Box, Typography, Grid, Divider, Stack, useTheme, alpha } from '@mui/material';
import { formatPartyAddress } from '../utils/addressFormatter';

const AddressSummaryCard = ({ label, data }) => {
    const formatted = formatPartyAddress(data);

    return (
        <Box sx={{
            border: 1,
            borderColor: 'divider',
            borderRadius: 2,
            height: '100%',
            bgcolor: 'background.paper',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
        }}>
            <Box sx={{
                bgcolor: 'text.primary',
                color: 'background.paper',
                px: 2,
                py: 0.75,
                borderBottom: 1,
                borderColor: 'divider'
            }}>
                <Typography variant="overline" sx={{ fontWeight: 800, letterSpacing: 1.2, fontSize: '0.65rem' }}>
                    {label}
                </Typography>
            </Box>

            <Box p={2.5} sx={{ flex: 1 }}>
                {formatted.company ? (
                    <Typography variant="h6" sx={{ fontWeight: 900, lineHeight: 1.2, mb: 0.5, color: 'primary.main' }}>
                        {formatted.company.toUpperCase()}
                    </Typography>
                ) : (
                    <Typography variant="h6" sx={{ fontWeight: 900, lineHeight: 1.2, mb: 0.5 }}>
                        {formatted.contact.toUpperCase()}
                    </Typography>
                )}

                {formatted.company && (
                    <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, opacity: 0.8 }}>
                        Attn: {formatted.contact}
                    </Typography>
                )}

                <Stack spacing={0.5} mb={2}>
                    <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontWeight: 600 }}>
                        <span style={{ opacity: 0.6 }}>TEL:</span> {formatted.phone}
                    </Typography>
                    <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontWeight: 600 }}>
                        <span style={{ opacity: 0.6 }}>VAT/REF:</span> {formatted.vatNumber || formatted.reference || 'N/A'}
                    </Typography>
                </Stack>

                <Divider sx={{ mb: 2, borderStyle: 'dashed', opacity: 0.5 }} />

                <Box sx={{ '& .MuiTypography-root': { lineHeight: 1.5 } }}>
                    {formatted.building && <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatted.building}</Typography>}
                    <Typography variant="body2">{formatted.street}</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>{formatted.location}</Typography>
                    <Typography variant="body1" sx={{ fontWeight: 800, mt: 0.5 }}>{formatted.country.toUpperCase()}</Typography>
                </Box>
            </Box>
        </Box>
    );
};

const ShipmentLabelPreview = ({ sender, receiver, parcels, service, date, totals }) => {
    const theme = useTheme();

    // Redundant if parent passes it, but safe-keep
    const localTotals = totals || parcels.reduce((acc, p) => {
        const qty = Number(p.quantity) || 1;
        const volPer = (p.length * p.width * p.height) / 5000;
        acc.pieces += qty;
        acc.actualWeight += Number(p.weight || 0) * qty;
        acc.volumetricWeight += volPer * qty;
        acc.declaredValue += Number(p.declaredValue || 0) * qty;
        return acc;
    }, { pieces: 0, actualWeight: 0, volumetricWeight: 0, declaredValue: 0 });

    const billableWeight = localTotals.billableWeight || Math.max(localTotals.actualWeight, localTotals.volumetricWeight);

    return (
        <Paper
            className="shipment-label-preview"
            elevation={3}
            sx={{
                p: { xs: 2, md: 4 },
                borderRadius: 2,
                maxWidth: '210mm',
                mx: 'auto',
                bgcolor: 'background.paper',
                color: 'text.primary',
                border: 1,
                borderColor: 'divider',
                '@media print': {
                    boxShadow: 'none',
                    bgcolor: 'white !important',
                    color: 'black !important',
                    maxWidth: '100%',
                    border: 'none',
                    p: 0,
                    '.MuiBox-root, .MuiPaper-root': { borderColor: 'black !important', color: 'black !important' },
                    '.header-strip': { bgcolor: 'black !important', color: 'white !important', WebkitPrintColorAdjust: 'exact' }
                }
            }}
        >
            {/* Header */}
            <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={3} borderBottom={4} borderColor="primary.main" pb={2}>
                <Box>
                    <Typography variant="h4" fontWeight="950" sx={{ letterSpacing: -1 }}>TARGET<span style={{ color: theme.palette.primary.main }}>LOGISTICS</span></Typography>
                    <Stack direction="row" spacing={4} mt={1}>
                        <Box>
                            <Typography variant="caption" sx={{ fontWeight: 800, opacity: 0.6, display: 'block' }}>SHIP DATE</Typography>
                            <Typography variant="subtitle2" fontWeight="700">{date ? new Date(date).toLocaleDateString() : new Date().toLocaleDateString()}</Typography>
                        </Box>
                        <Box>
                            <Typography variant="caption" sx={{ fontWeight: 800, opacity: 0.6, display: 'block' }}>SERVICE</Typography>
                            <Typography variant="subtitle2" fontWeight="700">{service?.serviceName?.toUpperCase() || 'STANDARD'}</Typography>
                        </Box>
                    </Stack>
                </Box>
                <Box textAlign="right">
                    <Typography variant="h6" color="primary.main" fontWeight="900">SHIPMENT LABEL</Typography>
                    <Typography variant="caption" display="block" sx={{ fontWeight: 700, mt: 0.5, opacity: 0.6 }}>A4 PRINT VERSION</Typography>
                </Box>
            </Box>

            {/* Calculations Summary */}
            <Box sx={{ bgcolor: alpha(theme.palette.primary.main, 0.04), p: 2, mb: 4, borderRadius: 2, display: 'flex', justifyContent: 'space-around', border: 1, borderColor: alpha(theme.palette.primary.main, 0.1) }}>
                <Box textAlign="center"><Typography variant="caption" sx={{ fontWeight: 800, opacity: 0.6 }}>TOTAL PCS</Typography><Typography variant="h6" fontWeight="800">{localTotals.pieces}</Typography></Box>
                <Divider orientation="vertical" flexItem />
                <Box textAlign="center"><Typography variant="caption" sx={{ fontWeight: 800, opacity: 0.6 }}>BILLABLE WGT</Typography><Typography variant="h6" fontWeight="800">{billableWeight.toFixed(2)} KG</Typography></Box>
                <Divider orientation="vertical" flexItem />
                <Box textAlign="center"><Typography variant="caption" sx={{ fontWeight: 800, opacity: 0.6 }}>TOTAL VALUE</Typography><Typography variant="h6" fontWeight="800">${localTotals.declaredValue.toFixed(2)}</Typography></Box>
            </Box>

            {/* Addresses */}
            <Grid container spacing={3} mb={4}>
                <Grid item xs={12} md={6}><AddressSummaryCard label="SENDER / SHIPPER" data={sender} /></Grid>
                <Grid item xs={12} md={6}><AddressSummaryCard label="RECEIVER / CONSIGNEE" data={receiver} /></Grid>
            </Grid>

            {/* Detailed Table */}
            <Box border={1} borderColor="divider" borderRadius={2} overflow="hidden">
                <Box className="header-strip" sx={{ bgcolor: 'text.primary', color: 'background.paper', p: 1, px: 2, display: 'grid', gridTemplateColumns: '0.8fr 3fr 1.2fr 1.5fr 1fr 1.5fr' }}>
                    <Typography variant="caption" fontWeight="800">PCS</Typography>
                    <Typography variant="caption" fontWeight="800">DESCRIPTION</Typography>
                    <Typography variant="caption" fontWeight="800">U.WGT</Typography>
                    <Typography variant="caption" fontWeight="800">U.DIMS</Typography>
                    <Typography variant="caption" fontWeight="800">QTY</Typography>
                    <Typography variant="caption" fontWeight="800">LINE VAL</Typography>
                </Box>
                {parcels.map((p, i) => (
                    <Box key={i} p={1.5} px={2} display="grid" gridTemplateColumns="0.8fr 3fr 1.2fr 1.5fr 1fr 1.5fr" borderTop={1} borderColor="divider" sx={{ bgcolor: i % 2 === 0 ? 'transparent' : alpha(theme.palette.action.hover, 0.4) }}>
                        <Typography variant="body2" fontWeight="800">{i + 1}</Typography>
                        <Typography variant="body2">{p.description || 'CONSIGNMENT CONTENT'}</Typography>
                        <Typography variant="body2">{Number(p.weight).toFixed(2)} KG</Typography>
                        <Typography variant="body2" sx={{ opacity: 0.7 }}>{p.length}x{p.width}x{p.height}</Typography>
                        <Typography variant="body2">{p.quantity}</Typography>
                        <Typography variant="body2" fontWeight="600">${(Number(p.declaredValue) * Number(p.quantity)).toFixed(2)}</Typography>
                    </Box>
                ))}
            </Box>
        </Paper>
    );
};

export default ShipmentLabelPreview;
