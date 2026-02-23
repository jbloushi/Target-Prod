import React from 'react';
import {
    Paper, Box, Typography, FormControlLabel, Switch, Collapse, Grid, TextField, FormControl, InputLabel, Select, MenuItem, Alert
} from '@mui/material';
import WarningIcon from '@mui/icons-material/Warning';

const DG_TYPES = [
    { label: 'Standard/Manual', code: '', serviceCode: '', contentId: '', hazard: '', psn: '' },
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
    const handleChange = (field, value) => {
        const prev = dangerousGoods || {};
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
    if ((dangerousGoods.properShippingName || '').length > DG_LIMITS.properShippingName) warnings.push(`Proper Shipping Name exceeds ${DG_LIMITS.properShippingName} characters.`);
    if ((dangerousGoods.customDescription || '').length > DG_LIMITS.customDescription) warnings.push(`DG Marks & Instructions exceeds ${DG_LIMITS.customDescription} characters.`);

    return (
        <Paper sx={{
            p: 2, mb: 3,
            border: dangerousGoods.contains ? '1px solid' : '1px solid transparent',
            borderColor: 'error.main',
            bgcolor: dangerousGoods.contains ? 'rgba(211, 47, 47, 0.08)' : 'background.paper',
            transition: 'all 0.3s ease'
        }}>
            <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box display="flex" alignItems="center" gap={1}>
                    <WarningIcon color={dangerousGoods.contains ? "error" : "action"} />
                    <Typography variant="subtitle1" fontWeight="bold" color={dangerousGoods.contains ? "error.main" : "text.primary"}>
                        Dangerous Goods Declaration
                    </Typography>
                </Box>
                <FormControlLabel
                    control={
                        <Switch
                            checked={dangerousGoods.contains}
                            onChange={(e) => handleChange('contains', e.target.checked)}
                            color="error"
                        />
                    }
                    label={dangerousGoods.contains ? "Yes, Contains DG" : "No, Standard Cargo"}
                />
            </Box>

            <Collapse in={dangerousGoods.contains}>
                <Box mt={2}>
                    <Grid container spacing={2}>
                        <Grid item xs={12}>
                            <FormControl fullWidth size="small" color="error">
                                <InputLabel>Standard DG Type (Quick Select)</InputLabel>
                                <Select
                                    label="Standard DG Type (Quick Select)"
                                    onChange={handleTypeChange}
                                    defaultValue=""
                                >
                                    {DG_TYPES.map(t => (
                                        <MenuItem key={t.label} value={t.label}>{t.label}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Grid>

                        <Grid item xs={12} md={4}>
                            <TextField
                                fullWidth
                                label="UN/ID Code"
                                value={dangerousGoods.code || ''}
                                onChange={(e) => handleChange('code', e.target.value)}
                                color="error"
                                placeholder="1266"
                                size="small"
                                helperText={`${(dangerousGoods.code || '').length}/${DG_LIMITS.code}`}
                                InputProps={{ startAdornment: <Typography color="text.secondary" variant="caption" mr={1}>UN/ID</Typography> }}
                            />
                        </Grid>

                        <Grid item xs={12} md={4}>
                            <TextField
                                fullWidth
                                label="DGR Service Code"
                                value={dangerousGoods.serviceCode || ''}
                                onChange={(e) => handleChange('serviceCode', e.target.value)}
                                color="error"
                                placeholder="HE"
                                size="small"
                                helperText="2 chars, e.g. HE, HV, HK"
                            />
                        </Grid>

                        <Grid item xs={12} md={4}>
                            <TextField
                                fullWidth
                                label="DGR Content ID"
                                value={dangerousGoods.contentId || ''}
                                onChange={(e) => handleChange('contentId', e.target.value)}
                                color="error"
                                placeholder="910"
                                size="small"
                                helperText={`${(dangerousGoods.contentId || '').length}/${DG_LIMITS.contentId}`}
                            />
                        </Grid>

                        {dangerousGoods.code === '1845' && (
                            <Grid item xs={12} md={6}>
                                <TextField
                                    fullWidth
                                    label="Dry Ice Weight (kg)"
                                    type="number"
                                    value={dangerousGoods.dryIceWeight || ''}
                                    onChange={(e) => handleChange('dryIceWeight', e.target.value)}
                                    color="error"
                                    placeholder="1.0"
                                    size="small"
                                />
                            </Grid>
                        )}

                        <Grid item xs={12} md={4}>
                            <FormControl fullWidth size="small" color="error">
                                <InputLabel>Packing Group</InputLabel>
                                <Select
                                    value={dangerousGoods.packingGroup || 'II'}
                                    label="Packing Group"
                                    onChange={(e) => handleChange('packingGroup', e.target.value)}
                                >
                                    <MenuItem value="I">I (High Danger)</MenuItem>
                                    <MenuItem value="II">II (Medium Danger)</MenuItem>
                                    <MenuItem value="III">III (Low Danger)</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>

                        <Grid item xs={12} md={4}>
                            <TextField
                                fullWidth
                                label="Hazard Class"
                                value={dangerousGoods.hazardClass || ''}
                                onChange={(e) => handleChange('hazardClass', e.target.value)}
                                color="error"
                                placeholder="e.g. 3"
                                size="small"
                                helperText="e.g. 3, 9"
                            />
                        </Grid>

                        <Grid item xs={12} md={4}>
                            <TextField
                                fullWidth
                                label="Proper Shipping Name"
                                value={dangerousGoods.properShippingName || ''}
                                onChange={(e) => handleChange('properShippingName', e.target.value)}
                                color="error"
                                placeholder="e.g. PERFUMERY PRODUCTS"
                                size="small"
                                error={(dangerousGoods.properShippingName || '').length > DG_LIMITS.properShippingName}
                                helperText={`${(dangerousGoods.properShippingName || '').length}/${DG_LIMITS.properShippingName}`}
                            />
                        </Grid>

                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                label="DG Marks & Instructions"
                                multiline
                                rows={2}
                                value={dangerousGoods.customDescription || ''}
                                onChange={(e) => handleChange('customDescription', e.target.value)}
                                color="error"
                                placeholder="Additional details for the declaration..."
                                size="small"
                                error={(dangerousGoods.customDescription || '').length > DG_LIMITS.customDescription}
                                helperText={`${(dangerousGoods.customDescription || '').length}/${DG_LIMITS.customDescription}`}
                            />
                        </Grid>
                    </Grid>
                    {warnings.length > 0 && (
                        <Alert severity="warning" sx={{ mt: 2 }}>
                            {warnings.map((warning) => (
                                <Typography key={warning} variant="body2">• {warning}</Typography>
                            ))}
                        </Alert>
                    )}
                </Box>
            </Collapse>
        </Paper>
    );
};

export default DangerousGoodsPanel;
