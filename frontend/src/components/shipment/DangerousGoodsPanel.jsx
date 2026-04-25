import React from 'react';
import {
    Box, Typography, FormControlLabel, Switch, Collapse, Grid, TextField, FormControl, InputLabel, Select, MenuItem, Alert, alpha, useTheme, Stack
} from '@mui/material';
import WarningIcon from '@mui/icons-material/Warning';
import BusinessCenterIcon from '@mui/icons-material/BusinessCenter';

const DG_TYPES = [
    { label: 'Standard', code: '', serviceCode: '', contentId: '', hazard: '', psn: '' },
    { label: 'Perfumes (UN1266) - Passenger/Cargo', code: '1266', serviceCode: 'HE', contentId: '910', hazard: '3', psn: 'PERFUMERY PRODUCTS', pg: 'II' },
    { label: 'Perfumes (UN1266) - Cargo Only', code: '1266', serviceCode: 'HE', contentId: '911', hazard: '3', psn: 'PERFUMERY PRODUCTS', pg: 'II' },
    { label: 'Lithium Ion Batteries (UN3481) - PI967', code: '3481', serviceCode: 'HV', contentId: '967', hazard: '9', psn: 'Lithium ion batteries contained in equipment' },
    { label: 'Consumer Commodity (ID8000)', code: '8000', serviceCode: 'HK', contentId: '700', hazard: '9', psn: 'Consumer Commodity' },
    { label: 'Dry Ice (UN1845)', code: '1845', serviceCode: 'HC', contentId: '901', hazard: '9', psn: 'Dry Ice' },
];

const DG_MARKS_DEFAULT = 'DANGEROUS GOODS AS PER ASSOCIATED DGD';
const DG_LIMITS = {
    code: 4,
    serviceCode: 2,
    contentId: 3,
    hazardClass: 3,
    properShippingName: 70,
    customDescription: 200
};

const DangerousGoodsPanel = ({ dangerousGoods = { contains: false }, setDangerousGoods }) => {
    const theme = useTheme();
    const safeDangerousGoods = (dangerousGoods && typeof dangerousGoods === 'object' && !Array.isArray(dangerousGoods))
        ? dangerousGoods
        : { contains: false };
    const containsDangerousGoods = Boolean(safeDangerousGoods.contains);

    const handleChange = (field, value) => {
        const prev = safeDangerousGoods;
        let next = { ...prev };

        if (field === 'contains') {
            next.contains = Boolean(value);
            next.customDescription = value ? (prev.customDescription || DG_MARKS_DEFAULT) : prev.customDescription;
            setDangerousGoods(next);
            return;
        }

        const sanitizedValue = typeof value === 'string' ? value : value;
        if (field === 'serviceCode') {
            next[field] = String(sanitizedValue).toUpperCase().slice(0, DG_LIMITS.serviceCode);
        } else if (field === 'contentId' || field === 'code') {
            next[field] = String(sanitizedValue).replace(/[^0-9]/g, '').slice(0, DG_LIMITS[field]);
        } else if (field === 'hazardClass') {
            next[field] = String(sanitizedValue).slice(0, DG_LIMITS.hazardClass);
        } else if (field === 'properShippingName') {
            next[field] = String(sanitizedValue).slice(0, DG_LIMITS.properShippingName + 20);
        } else if (field === 'customDescription') {
            next[field] = String(sanitizedValue).slice(0, DG_LIMITS.customDescription + 40);
        } else {
            next[field] = sanitizedValue;
        }

        setDangerousGoods(next);
    };

    const handleTypeChange = (e) => {
        const type = DG_TYPES.find(t => t.label === e.target.value);
        if (type) {
            setDangerousGoods({
                ...(dangerousGoods || {}),
                code: type.code,
                serviceCode: type.serviceCode,
                contentId: type.contentId,
                hazardClass: type.hazard,
                properShippingName: type.psn,
                packingGroup: type.pg || 'II',
                customDescription: (dangerousGoods || {}).customDescription || DG_MARKS_DEFAULT
            });
        }
    };

    const warnings = [];
    if ((safeDangerousGoods.properShippingName || '').length > DG_LIMITS.properShippingName) warnings.push(`Proper Shipping Name exceeds ${DG_LIMITS.properShippingName} characters.`);
    if ((safeDangerousGoods.customDescription || '').length > DG_LIMITS.customDescription) warnings.push(`DG Marks & Instructions exceeds ${DG_LIMITS.customDescription} characters.`);

    return (
        <Box 
            sx={{ 
                p: 4, mb: 4, 
                bgcolor: containsDangerousGoods ? alpha(theme.palette.error.main, 0.05) : 'surface-container-low', 
                borderRadius: 6,
                border: '1px solid',
                borderColor: containsDangerousGoods ? 'error.main' : 'transparent',
                transition: 'var(--transition-base)'
            }}
        >
            <Box display="flex" alignItems="center" justifyContent="space-between">
                <Stack direction="row" alignItems="center" spacing={2.5}>
                    <Box sx={{ p: 1.5, borderRadius: 3, bgcolor: containsDangerousGoods ? alpha(theme.palette.error.main, 0.1) : alpha(theme.palette.primary.main, 0.1), color: containsDangerousGoods ? 'error.main' : 'primary.main', display: 'flex' }}>
                        <WarningIcon />
                    </Box>
                    <Box>
                        <Typography variant="h5" fontWeight="800" sx={{ letterSpacing: '-0.02em' }}>
                            Dangerous Goods Declaration
                        </Typography>
                        <Typography variant="caption" color="text.secondary" fontWeight="700">
                            Regulatory validation for hazardous assets
                        </Typography>
                    </Box>
                </Stack>
                
                <FormControlLabel
                    control={
                        <Switch
                            checked={containsDangerousGoods}
                            onChange={(e) => handleChange('contains', e.target.checked)}
                            color="error"
                        />
                    }
                    label={<Typography variant="body2" fontWeight="800" color="text.secondary">Asset requires DGR handling</Typography>}
                    labelPlacement="start"
                    sx={{ gap: 2 }}
                />
            </Box>

            <Collapse in={containsDangerousGoods}>
                <Box mt={5} className="slide-up">
                    <Grid container spacing={3}>
                        <Grid item xs={12}>
                            <Box sx={{ mb: 2, p: 3, borderRadius: 4, bgcolor: 'surface-container-high', display: 'flex', alignItems: 'center', gap: 2 }}>
                                <BusinessCenterIcon color="error" />
                                <Box flex={1}>
                                    <FormControl fullWidth size="small" variant="standard">
                                        <InputLabel sx={{ fontWeight: 800, color: 'error.main' }}>Logistics Template (Quick Select)</InputLabel>
                                        <Select
                                            onChange={handleTypeChange}
                                            defaultValue=""
                                            disableUnderline
                                        >
                                            {DG_TYPES.map(t => (
                                                <MenuItem key={t.label} value={t.label}>{t.label}</MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                </Box>
                            </Box>
                        </Grid>

                        <Grid item xs={12} md={4}>
                            <TextField
                                fullWidth
                                label="UN/ID Primary Code"
                                value={safeDangerousGoods.code || ''}
                                onChange={(e) => handleChange('code', e.target.value)}
                                error={(safeDangerousGoods.code || '').length > DG_LIMITS.code}
                                placeholder="1266"
                                helperText="4-digit regulatory code"
                            />
                        </Grid>

                        <Grid item xs={12} md={4}>
                            <TextField
                                fullWidth
                                label="Logistics Service Code"
                                value={safeDangerousGoods.serviceCode || ''}
                                onChange={(e) => handleChange('serviceCode', e.target.value)}
                                placeholder="HE"
                                helperText="HE, HV, HK, or HA"
                            />
                        </Grid>

                        <Grid item xs={12} md={4}>
                            <TextField
                                fullWidth
                                label="Internal Content ID"
                                value={safeDangerousGoods.contentId || ''}
                                onChange={(e) => handleChange('contentId', e.target.value)}
                                placeholder="910"
                                helperText="Route-specific DGR identifier"
                            />
                        </Grid>

                        {safeDangerousGoods.code === '1845' && (
                            <Grid item xs={12} md={6}>
                                <TextField
                                    fullWidth
                                    label="Cryogenic Dry Ice Weight (kg)"
                                    type="number"
                                    value={safeDangerousGoods.dryIceWeight || ''}
                                    onChange={(e) => handleChange('dryIceWeight', e.target.value)}
                                    placeholder="1.0"
                                />
                            </Grid>
                        )}

                        <Grid item xs={12} md={4}>
                            <FormControl fullWidth size="small">
                                <InputLabel>Packing Sensitivity Group</InputLabel>
                                <Select
                                    value={safeDangerousGoods.packingGroup || 'II'}
                                    label="Packing Sensitivity Group"
                                    onChange={(e) => handleChange('packingGroup', e.target.value)}
                                >
                                    <MenuItem value="I">Group I (Extreme Sensitivity)</MenuItem>
                                    <MenuItem value="II">Group II (Medium Sensitivity)</MenuItem>
                                    <MenuItem value="III">Group III (Low Sensitivity)</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>

                        <Grid item xs={12} md={4}>
                            <TextField
                                fullWidth
                                label="Primary Hazard Class"
                                value={safeDangerousGoods.hazardClass || ''}
                                onChange={(e) => handleChange('hazardClass', e.target.value)}
                                placeholder="e.g. 3"
                                helperText="Regulatory Class (1-9)"
                            />
                        </Grid>

                        <Grid item xs={12} md={4}>
                            <TextField
                                fullWidth
                                label="Proper International Shipping Name"
                                value={safeDangerousGoods.properShippingName || ''}
                                onChange={(e) => handleChange('properShippingName', e.target.value)}
                                placeholder="e.g. PERFUMERY PRODUCTS"
                                error={(safeDangerousGoods.properShippingName || '').length > DG_LIMITS.properShippingName}
                                helperText={`${(safeDangerousGoods.properShippingName || '').length}/${DG_LIMITS.properShippingName}`}
                            />
                        </Grid>

                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                label="Detailed Declaration Instruction"
                                multiline
                                rows={3}
                                value={safeDangerousGoods.customDescription || ''}
                                onChange={(e) => handleChange('customDescription', e.target.value)}
                                placeholder="Enter specific hazardous handling instructions..."
                                error={(safeDangerousGoods.customDescription || '').length > DG_LIMITS.customDescription}
                                helperText={`${(safeDangerousGoods.customDescription || '').length}/${DG_LIMITS.customDescription}`}
                            />
                        </Grid>
                    </Grid>

                    {warnings.length > 0 && (
                        <Alert severity="warning" variant="outlined" sx={{ mt: 4, borderRadius: 4 }}>
                            {warnings.map((warning) => (
                                <Typography key={warning} variant="caption" display="block">• {warning}</Typography>
                            ))}
                        </Alert>
                    )}
                </Box>
            </Collapse>
        </Box>
    );
};

export default DangerousGoodsPanel;
