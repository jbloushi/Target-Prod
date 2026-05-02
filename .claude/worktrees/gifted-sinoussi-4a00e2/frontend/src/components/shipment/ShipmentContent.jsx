import React, { useState } from 'react';
import {
    Box, Typography, Button, Grid, FormControl,
    InputLabel, Select, MenuItem, IconButton,
    Alert, TextField, Stack, alpha, useTheme
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import DescriptionIcon from '@mui/icons-material/Description';
import ParcelCard from './ParcelCard';
import DangerousGoodsPanel from './DangerousGoodsPanel';
import StatusPill from '../../ui/components/StatusPill';

const HS_CODE_REGEX = /^\d{4}(\.\d{2}(\.\d{2})?)?$/;
const ISO_COUNTRY_REGEX = /^[A-Z]{2}$/;
const DEFAULT_PACKAGING_OPTIONS = [
    { value: 'user', label: 'My Own Packaging' },
    { value: 'CP', label: 'Custom Packaging' },
    { value: 'EE', label: 'DGR Express Envelope' },
    { value: 'OD', label: 'Other DGR Packaging' }
];

const ShipmentContent = ({
    parcels = [], setParcels,
    items = [], setItems,
    dangerousGoods = {}, setDangerousGoods,
    packagingType = 'user', setPackagingType,
    shipmentType,
    errors = {},
    showDangerousGoods = true,
    packagingOptions,
    currency,
    setCurrency,
    defaultOrigin = 'KW'
}) => {
    const theme = useTheme();
    const [expandedParcel, setExpandedParcel] = useState(0);

    const updateParcel = (index, fieldOrUpdates, val) => {
        setParcels(prev => {
            const next = [...prev];
            if (typeof fieldOrUpdates === 'object') {
                next[index] = { ...next[index], ...fieldOrUpdates };
            } else {
                next[index] = { ...next[index], [fieldOrUpdates]: val };
            }
            return next;
        });
    };

    const removeParcel = (index) => {
        if (parcels.length > 1) {
            setParcels(parcels.filter((_, i) => i !== index));
        }
    };

    const updateItem = (index, field, val) => {
        const newItems = [...items];
        if (field === 'hsCode') {
            newItems[index][field] = String(val).replace(/[^0-9.]/g, '').slice(0, 10);
        } else if (field === 'countryOfOrigin') {
            newItems[index][field] = String(val).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
        } else if (field === 'description') {
            newItems[index][field] = String(val).slice(0, 70);
        } else {
            newItems[index][field] = val;
        }
        setItems(newItems);
    };

    const removeItem = (index) => {
        if (items.length > 1) {
            setItems(items.filter((_, i) => i !== index));
        }
    };

    const itemWarnings = items.flatMap((item, index) => {
        const warns = [];
        if (item.hsCode && !HS_CODE_REGEX.test(item.hsCode)) warns.push(`Item ${index + 1}: HS Code format looks invalid.`);
        if (item.countryOfOrigin && !ISO_COUNTRY_REGEX.test(item.countryOfOrigin)) warns.push(`Item ${index + 1}: Origin must be 2-letter ISO code.`);
        if ((item.description || '').length > 70) warns.push(`Item ${index + 1}: Description exceeds 70 characters.`);
        return warns;
    });

    return (
        <Box className="fade-in">
            {/* Dangerous Goods Section */}
            {showDangerousGoods && (
                <Box mb={4}>
                    <DangerousGoodsPanel
                        dangerousGoods={dangerousGoods}
                        setDangerousGoods={setDangerousGoods}
                    />
                </Box>
            )}

            {/* 1. Physical Packages */}
            <Box 
                sx={{ 
                    p: 4, mb: 4, 
                    bgcolor: 'surface-container-low', 
                    borderRadius: 6,
                    position: 'relative'
                }}
            >
                <Stack direction="row" alignItems="center" spacing={2} mb={4}>
                    <Box sx={{ p: 1.5, borderRadius: 3, bgcolor: alpha(theme.palette.primary.main, 0.1), color: 'primary.main', display: 'flex' }}>
                        <Inventory2Icon />
                    </Box>
                    <Typography variant="h5" fontWeight="800" sx={{ letterSpacing: '-0.02em' }}>
                        Physical Packages
                    </Typography>
                </Stack>

                <Box mb={4}>
                    <Grid container spacing={3} alignItems="flex-end">
                        <Grid item xs={12} md={6}>
                            <FormControl fullWidth size="small">
                                <InputLabel>Packaging Selection</InputLabel>
                                <Select
                                    value={packagingType || 'user'}
                                    label="Packaging Selection"
                                    onChange={(e) => setPackagingType(e.target.value)}
                                >
                                    {(packagingOptions || DEFAULT_PACKAGING_OPTIONS).map((option) => (
                                        <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs />
                        <Grid item>
                           <StatusPill label={`${parcels.length} Unit(s)`} status="primary" />
                        </Grid>
                    </Grid>
                </Box>

                <Grid container spacing={3}>
                    {parcels.map((parcel, index) => (
                        <Grid item xs={12} key={index}>
                            <ParcelCard
                                parcel={parcel}
                                index={index}
                                expanded={expandedParcel === index}
                                onToggle={() => setExpandedParcel(expandedParcel === index ? -1 : index)}
                                onChange={(field, val) => updateParcel(index, field, val)}
                                onRemove={() => removeParcel(index)}
                                errors={errors}
                            />
                        </Grid>
                    ))}
                </Grid>

                <Button
                    variant="outlined"
                    startIcon={<AddIcon />}
                    onClick={() => setParcels([...parcels, { description: '', weight: '', length: '', width: '', height: '', quantity: 1, declaredValue: '' }])}
                    sx={{ mt: 4, borderRadius: 3, textTransform: 'none', fontWeight: 800, py: 1, px: 3 }}
                >
                    Add Physical Unit
                </Button>
            </Box>

            {/* 2. Customs Declaration */}
            {shipmentType !== 'documents' && (
                <Box 
                    sx={{ 
                        p: 4, mb: 4, 
                        bgcolor: 'surface-container-low', 
                        borderRadius: 6
                    }}
                >
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
                        <Stack direction="row" alignItems="center" spacing={2}>
                            <Box sx={{ p: 1.5, borderRadius: 3, bgcolor: alpha(theme.palette.secondary.main, 0.1), color: 'secondary.main', display: 'flex' }}>
                                <DescriptionIcon />
                            </Box>
                            <Typography variant="h5" fontWeight="800" sx={{ letterSpacing: '-0.02em' }}>
                                Customs Declaration
                            </Typography>
                        </Stack>
                        
                        <FormControl size="small" sx={{ minWidth: 160 }}>
                            <InputLabel>Valuation Currency</InputLabel>
                            <Select
                                value={currency || 'KWD'}
                                label="Valuation Currency"
                                onChange={(e) => setCurrency(e.target.value)}
                            >
                                <MenuItem value="KWD">KWD - Kuwaiti Dinar</MenuItem>
                                <MenuItem value="USD">USD - US Dollar</MenuItem>
                                <MenuItem value="EUR">EUR - Euro</MenuItem>
                                <MenuItem value="SAR">SAR - Saudi Riyal</MenuItem>
                                <MenuItem value="AED">AED - UAE Dirham</MenuItem>
                            </Select>
                        </FormControl>
                    </Box>

                    {itemWarnings.length > 0 && (
                        <Alert severity="warning" variant="outlined" sx={{ mb: 4, borderRadius: 4 }}>
                            {itemWarnings.map((warning) => (
                                <Typography key={warning} variant="caption" display="block">• {warning}</Typography>
                            ))}
                        </Alert>
                    )}

                    <Stack spacing={3}>
                        {items.map((item, index) => (
                            <Box 
                                key={index} 
                                className="slide-up"
                                sx={{ 
                                    p: 3, 
                                    borderRadius: 4, 
                                    bgcolor: 'surface-container-high',
                                    border: '1px solid transparent',
                                    transition: 'var(--transition-base)',
                                    '&:hover': { bgcolor: 'surface-container' }
                                }}
                            >
                                <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                                    <Typography variant="subtitle2" fontWeight="800" color="primary.main">
                                        ITEM CONSIGNMENT {index + 1}
                                    </Typography>
                                    <IconButton size="small" onClick={() => removeItem(index)} sx={{ bgcolor: alpha(theme.palette.error.main, 0.05), color: 'error.main' }}>
                                        <DeleteIcon fontSize="small" />
                                    </IconButton>
                                </Box>
                                
                                <Grid container spacing={3}>
                                    <Grid item xs={12} md={6}>
                                        <TextField
                                            fullWidth label="Editorial Description" value={item.description}
                                            onChange={(e) => updateItem(index, 'description', e.target.value)}
                                            error={!!errors[`item${index}desc`] || (item.description || '').length > 70}
                                            helperText={`${(item.description || '').length}/70 — Professional invoice description`}
                                        />
                                    </Grid>
                                    <Grid item xs={6} md={2}>
                                        <TextField
                                            fullWidth type="number" label="Quantity" value={item.quantity}
                                            onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                                            error={!!errors[`item${index}qty`]}
                                        />
                                    </Grid>
                                    <Grid item xs={6} md={4}>
                                        <TextField
                                            fullWidth type="number" label={`Unit Value (${currency})`} value={item.declaredValue}
                                            onChange={(e) => updateItem(index, 'declaredValue', e.target.value)}
                                            error={!!errors[`item${index}val`]}
                                        />
                                    </Grid>
                                    <Grid item xs={6} md={4}>
                                        <TextField
                                            fullWidth type="number" label="Net Weight (kg)" value={item.weight}
                                            onChange={(e) => updateItem(index, 'weight', e.target.value)}
                                            error={!!errors[`item${index}wgt`]}
                                        />
                                    </Grid>
                                    <Grid item xs={6} md={4}>
                                        <TextField
                                            fullWidth label="HS / Harmonized Code" value={item.hsCode}
                                            onChange={(e) => updateItem(index, 'hsCode', e.target.value)}
                                            error={!!errors[`item${index}hs`] || (!!item.hsCode && !HS_CODE_REGEX.test(item.hsCode))}
                                            placeholder="e.g. 3303.00.00"
                                            helperText="Standard Customs Code"
                                        />
                                    </Grid>
                                    <Grid item xs={6} md={4}>
                                        <TextField
                                            fullWidth label="Country of Origin" value={item.countryOfOrigin}
                                            onChange={(e) => updateItem(index, 'countryOfOrigin', e.target.value)}
                                            error={!!errors[`item${index}origin`] || (!!item.countryOfOrigin && !ISO_COUNTRY_REGEX.test(item.countryOfOrigin))}
                                            placeholder="e.g. KW"
                                            helperText="2-letter ISO code"
                                        />
                                    </Grid>
                                </Grid>
                            </Box>
                        ))}
                    </Stack>

                    <Button 
                        variant="outlined"
                        startIcon={<AddIcon />} 
                        onClick={() => setItems([...items, { description: '', quantity: 1, declaredValue: '', currency: currency || 'KWD', weight: '', hsCode: '', countryOfOrigin: defaultOrigin || 'KW' }])}
                        sx={{ mt: 4, borderRadius: 3, fontWeight: 800, py: 1, px: 3 }}
                    >
                        Register Another Asset
                    </Button>
                </Box>
            )}
        </Box>
    );
};

export default ShipmentContent;
