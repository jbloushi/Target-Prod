import React from 'react';
import {
    Box, Typography, Tooltip, IconButton, Collapse, Grid, TextField, Alert, alpha, useTheme
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import CalculateIcon from '@mui/icons-material/Calculate';
import InventoryIcon from '@mui/icons-material/Inventory';

const VOLUME_FACTOR = 5000;

const ParcelCard = ({ parcel, index, onChange, onRemove, expanded, onToggle, errors = {} }) => {
    const theme = useTheme();
    const pLen = Number(parcel.length || parcel.dimensions?.length || 0);
    const pWid = Number(parcel.width || parcel.dimensions?.width || 0);
    const pHgt = Number(parcel.height || parcel.dimensions?.height || 0);

    const updateDim = (field, val) => {
        const numVal = Number(val);
        onChange({
            [field]: numVal,
            dimensions: {
                ...parcel.dimensions,
                length: field === 'length' ? numVal : pLen,
                width: field === 'width' ? numVal : pWid,
                height: field === 'height' ? numVal : pHgt,
            }
        });
    };

    const volumetricPerUnit = (pLen * pWid * pHgt) / VOLUME_FACTOR;
    const volumetricTotal = volumetricPerUnit * (Number(parcel.quantity) || 1);
    const weightTotal = Number(parcel.weight || 0) * (Number(parcel.quantity) || 1);
    const billableWeight = Math.max(weightTotal, volumetricTotal);

    const hasError = !!(errors[`parcel${index}desc`] || errors[`parcel${index}weight`] || errors[`parcel${index}length`] || errors[`parcel${index}width`] || errors[`parcel${index}height`] || errors[`parcel${index}value`]);

    return (
        <Box
            sx={{
                mb: 2,
                borderRadius: 4,
                overflow: 'hidden',
                bgcolor: expanded ? 'surface-container-high' : 'surface-container-lowest',
                border: '1px solid',
                borderColor: hasError ? 'error.main' : (expanded ? 'primary.main' : 'divider'),
                boxShadow: expanded ? 'var(--shadow-glow-primary)' : 'var(--shadow-ambient)',
                transition: 'var(--transition-base)'
            }}
        >
            <Box
                p={2.5}
                display="flex"
                alignItems="center"
                justifyContent="space-between"
                onClick={onToggle}
                sx={{ 
                    cursor: 'pointer',
                    bgcolor: expanded ? alpha(theme.palette.primary.main, 0.05) : 'transparent',
                }}
            >
                <Box display="flex" alignItems="center" gap={2}>
                    <Box sx={{ 
                        p: 1, borderRadius: 2, 
                        display: 'flex', 
                        bgcolor: hasError ? alpha(theme.palette.error.main, 0.1) : alpha(theme.palette.primary.main, 0.1),
                        color: hasError ? 'error.main' : 'primary.main'
                    }}>
                        <InventoryIcon sx={{ fontSize: 20 }} />
                    </Box>
                    <Box>
                        <Typography variant="body1" fontWeight="800">Unit {index + 1}</Typography>
                        {!expanded && (
                            <Typography variant="caption" color="text.secondary" fontWeight="700">
                                {parcel.quantity || 1} Pcs • {parcel.weight || 0}kg • {pLen}x{pWid}x{pHgt}cm
                            </Typography>
                        )}
                    </Box>
                    {hasError && <Tooltip title="Missing information"><ErrorOutlineIcon color="error" sx={{ fontSize: 18 }} /></Tooltip>}
                </Box>
                <Box display="flex" alignItems="center" gap={1}>
                    <IconButton 
                        size="small" 
                        onClick={(e) => { e.stopPropagation(); onRemove(); }} 
                        sx={{ color: 'text.disabled', '&:hover': { color: 'error.main', bgcolor: alpha(theme.palette.error.main, 0.05) } }}
                    >
                        <DeleteIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" sx={{ color: 'text.primary' }}>
                        {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    </IconButton>
                </Box>
            </Box>

            <Collapse in={expanded}>
                <Box p={4} sx={{ borderTop: '1px solid', borderColor: 'divider' }}>
                    <Grid container spacing={3}>
                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                label="Logistics Description"
                                value={parcel.description}
                                onChange={(e) => onChange('description', e.target.value)}
                                placeholder="e.g. Spare Parts, High Val Asset"
                                error={!!errors[`parcel${index}desc`]}
                                helperText={errors[`parcel${index}desc`]}
                            />
                        </Grid>
                        <Grid item xs={6} md={3}>
                            <TextField
                                fullWidth type="number" label="Unit Weight (kg)"
                                value={parcel.weight}
                                onChange={(e) => onChange('weight', Number(e.target.value))}
                                InputProps={{ inputProps: { min: 0 } }}
                                error={!!errors[`parcel${index}weight`]}
                                helperText={errors[`parcel${index}weight`]}
                            />
                        </Grid>
                        <Grid item xs={6} md={2}>
                            <TextField fullWidth type="number" label="Length" value={pLen || ''} onChange={(e) => updateDim('length', e.target.value)} error={!!errors[`parcel${index}length`]} />
                        </Grid>
                        <Grid item xs={6} md={2}>
                            <TextField fullWidth type="number" label="Width" value={pWid || ''} onChange={(e) => updateDim('width', e.target.value)} error={!!errors[`parcel${index}width`]} />
                        </Grid>
                        <Grid item xs={6} md={2}>
                            <TextField fullWidth type="number" label="Height" value={pHgt || ''} onChange={(e) => updateDim('height', e.target.value)} error={!!errors[`parcel${index}height`]} />
                        </Grid>
                        <Grid item xs={6} md={3}>
                            <TextField
                                fullWidth type="number" label="Unit Qty"
                                value={parcel.quantity || 1}
                                onChange={(e) => onChange('quantity', Number(e.target.value))}
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <Box 
                                sx={{ 
                                    p: 2, borderRadius: 3, 
                                    bgcolor: 'surface-container-high', 
                                    display: 'flex', alignItems: 'center', gap: 2,
                                    border: '1px solid transparent',
                                    borderColor: 'divider'
                                }}
                            >
                                <CalculateIcon sx={{ color: 'primary.main' }} />
                                <Box flex={1}>
                                    <Typography variant="caption" color="text.secondary" fontWeight="800" display="block">BILLABLE METRICS</Typography>
                                    <Typography variant="body2" fontWeight="700">
                                        Vol: <b>{volumetricTotal.toFixed(2)}kg</b> | Act: <b>{weightTotal.toFixed(2)}kg</b> | 
                                        <Box component="span" sx={{ color: 'primary.main', ml: 1 }}>
                                            Billable: <b>{billableWeight.toFixed(2)}kg</b>
                                        </Box>
                                    </Typography>
                                </Box>
                            </Box>
                        </Grid>
                    </Grid>
                </Box>
            </Collapse>
        </Box>
    );
};

export default ParcelCard;
