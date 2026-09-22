import React from 'react';
import {
    Box, Typography, FormControlLabel, Switch, Collapse, Grid, TextField, FormControl, InputLabel, Select, MenuItem, Alert, alpha, useTheme, Stack
} from '@mui/material';
import WarningIcon from '@mui/icons-material/Warning';
import BusinessCenterIcon from '@mui/icons-material/BusinessCenter';
import { TK } from '../../tokens/kineticHorizon';

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

const DangerousGoodsPanel = ({ dangerousGoods, setDangerousGoods }) => {
    const theme = useTheme();
    const dg = {
        contains: false,
        ...(dangerousGoods || {})
    };

    const handleChange = (field, value) => {
        const prev = dg;
        let next = { ...prev };

        if (field === 'contains') {
            next.contains = value;
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
                ...dg,
                code: type.code,
                serviceCode: type.serviceCode,
                contentId: type.contentId,
                hazardClass: type.hazard,
                properShippingName: type.psn,
                packingGroup: type.pg || 'II',
                customDescription: dg.customDescription || DG_MARKS_DEFAULT
            });
        }
    };

    const warnings = [];
    if ((dg.properShippingName || '').length > DG_LIMITS.properShippingName) warnings.push(`Proper Shipping Name exceeds ${DG_LIMITS.properShippingName} characters.`);
    if ((dg.customDescription || '').length > DG_LIMITS.customDescription) warnings.push(`DG Marks & Instructions exceeds ${DG_LIMITS.customDescription} characters.`);

    return (
        <Box 
            sx={{ 
                p: { xs: 2, sm: 2.5, md: 3 }, mb: 3, 
                bgcolor: dg.contains ? '#fff5f5' : '#ffffff', 
                borderRadius: `${TK.radiusCard}px`,
                border: `1.5px solid ${dg.contains ? TK.errorBorder : TK.border}`,
                boxShadow: TK.shadowSm,
                transition: 'all 0.2s ease'
            }}
        >
            <Box display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1.5}>
                <Stack direction="row" alignItems="center" spacing={1.5}>
                    <Box sx={{ width: 38, height: 38, borderRadius: '10px', bgcolor: dg.contains ? TK.errorBg : '#f1f5f9', color: dg.contains ? TK.error : TK.text2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <WarningIcon sx={{ fontSize: 20 }} />
                    </Box>
                    <Box>
                        <Typography variant="subtitle1" fontWeight="800" sx={{ color: TK.text1, letterSpacing: '-0.01em', lineHeight: 1.2 }}>
                            Dangerous Goods Declaration
                        </Typography>
                        <Typography variant="caption" sx={{ color: TK.text3, fontWeight: 700 }}>
                            Regulatory validation for hazardous assets (IATA / DGR)
                        </Typography>
                    </Box>
                </Stack>
                
                <FormControlLabel
                    control={
                        <Switch
                            checked={Boolean(dg.contains)}
                            onChange={(e) => handleChange('contains', e.target.checked)}
                            color="error"
                        />
                    }
                    label={<Typography variant="body2" fontWeight="700" sx={{ color: TK.text2 }}>Asset requires DGR handling</Typography>}
                    labelPlacement="start"
                    sx={{ gap: 1 }}
                />
            </Box>

            <Collapse in={Boolean(dg.contains)}>
                <Box mt={3} className="slide-up">
                    <Grid container spacing={2}>
                        <Grid item xs={12}>
                            <Box sx={{ mb: 1, p: 2, borderRadius: `${TK.radiusMd}px`, bgcolor: '#ffffff', border: `1px solid ${TK.border}`, display: 'flex', alignItems: 'center', gap: 2 }}>
                                <BusinessCenterIcon sx={{ color: TK.error, fontSize: 20 }} />
                                <Box flex={1}>
                                    <FormControl fullWidth size="small" variant="standard">
                                        <InputLabel sx={{ fontWeight: 800, color: TK.error }}>Logistics Template (Quick Select)</InputLabel>
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
                                size="small"
                                label="UN/ID Primary Code"
                                value={dg.code || ''}
                                onChange={(e) => handleChange('code', e.target.value)}
                                error={(dg.code || '').length > DG_LIMITS.code}
                                placeholder="1266"
                                helperText="4-digit regulatory code"
                            />
                        </Grid>

                        <Grid item xs={12} md={4}>
                            <TextField
                                fullWidth
                                label="Logistics Service Code"
                                value={dg.serviceCode || ''}
                                onChange={(e) => handleChange('serviceCode', e.target.value)}
                                placeholder="HE"
                                helperText="HE, HV, HK, or HA"
                            />
                        </Grid>

                        <Grid item xs={12} md={4}>
                            <TextField
                                fullWidth
                                label="Internal Content ID"
                                value={dg.contentId || ''}
                                onChange={(e) => handleChange('contentId', e.target.value)}
                                placeholder="910"
                                helperText="Route-specific DGR identifier"
                            />
                        </Grid>

                        {dg.code === '1845' && (
                            <Grid item xs={12} md={6}>
                                <TextField
                                    fullWidth
                                    label="Cryogenic Dry Ice Weight (kg)"
                                    type="number"
                                    value={dg.dryIceWeight || ''}
                                    onChange={(e) => handleChange('dryIceWeight', e.target.value)}
                                    placeholder="1.0"
                                />
                            </Grid>
                        )}

                        <Grid item xs={12} md={4}>
                            <FormControl fullWidth size="small">
                                <InputLabel>Packing Sensitivity Group</InputLabel>
                                <Select
                                    value={dg.packingGroup || 'II'}
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
                                value={dg.hazardClass || ''}
                                onChange={(e) => handleChange('hazardClass', e.target.value)}
                                placeholder="e.g. 3"
                                helperText="Regulatory Class (1-9)"
                            />
                        </Grid>

                        <Grid item xs={12} md={4}>
                            <TextField
                                fullWidth
                                label="Proper International Shipping Name"
                                value={dg.properShippingName || ''}
                                onChange={(e) => handleChange('properShippingName', e.target.value)}
                                placeholder="e.g. PERFUMERY PRODUCTS"
                                error={(dg.properShippingName || '').length > DG_LIMITS.properShippingName}
                                helperText={`${(dg.properShippingName || '').length}/${DG_LIMITS.properShippingName}`}
                            />
                        </Grid>

                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                label="Detailed Declaration Instruction"
                                multiline
                                rows={3}
                                value={dg.customDescription || ''}
                                onChange={(e) => handleChange('customDescription', e.target.value)}
                                placeholder="Enter specific hazardous handling instructions..."
                                error={(dg.customDescription || '').length > DG_LIMITS.customDescription}
                                helperText={`${(dg.customDescription || '').length}/${DG_LIMITS.customDescription}`}
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
