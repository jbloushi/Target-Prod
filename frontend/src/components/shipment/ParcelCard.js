import React from 'react';
import {
    Paper, Box, Typography, Tooltip, IconButton, Collapse, Grid, TextField, Alert
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import CalculateIcon from '@mui/icons-material/Calculate';

const VOLUME_FACTOR = 5000;

const ParcelCard = ({ parcel, index, onChange, onRemove, expanded, onToggle, errors = {} }) => {
    const pLen = Number(parcel.length || parcel.dimensions?.length || 0);
    const pWid = Number(parcel.width || parcel.dimensions?.width || 0);
    const pHgt = Number(parcel.height || parcel.dimensions?.height || 0);

    const updateDim = (field, val) => {
        const numVal = Number(val);
        // Use object-based bulk update to ensure all fields are updated atomically
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
        <Paper
            elevation={expanded ? 3 : 1}
            sx={{
                mb: 2,
                overflow: 'hidden',
                transition: 'all 0.3s',
                border: hasError ? 2 : 0,
                borderColor: 'error.main'
            }}
        >
            <Box
                p={2}
                display="flex"
                alignItems="center"
                justifyContent="space-between"
                bgcolor={expanded ? 'primary.main' : (hasError ? 'error.lighter' : 'background.paper')}
                color={expanded ? 'primary.contrastText' : (hasError ? 'error.main' : 'text.primary')}
                onClick={onToggle}
                sx={{ cursor: 'pointer' }}
            >
                <Box display="flex" alignItems="center" gap={2}>
                    <Typography fontWeight="bold">Parcel {index + 1}</Typography>
                    {hasError && <Tooltip title="Missing information"><ErrorOutlineIcon sx={{ fontSize: 18 }} /></Tooltip>}
                    {!expanded && (
                        <Typography variant="body2" sx={{ opacity: 0.8 }}>
                            {parcel.quantity || 1}x • {parcel.weight || '?'}kg • {pLen || '?'}x{pWid || '?'}x{pHgt || '?'}
                        </Typography>
                    )}
                </Box>
                <Box display="flex" alignItems="center">
                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); onRemove(); }} sx={{ color: expanded ? 'inherit' : 'action.active' }}>
                        <DeleteIcon />
                    </IconButton>
                    <IconButton size="small" sx={{ color: expanded ? 'inherit' : 'action.active' }}>
                        {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    </IconButton>
                </Box>
            </Box>

            <Collapse in={expanded}>
                <Box p={3}>
                    <Grid container spacing={3}>
                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                label="Description"
                                value={parcel.description}
                                onChange={(e) => onChange('description', e.target.value)}
                                placeholder="e.g. Electronics, Documents"
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
                        <Grid item xs={6} md={3}>
                            <TextField fullWidth type="number" label="Length (cm)" value={pLen || ''} onChange={(e) => updateDim('length', e.target.value)} error={!!errors[`parcel${index}length`]} helperText={errors[`parcel${index}length`]} />
                        </Grid>
                        <Grid item xs={6} md={3}>
                            <TextField fullWidth type="number" label="Width (cm)" value={pWid || ''} onChange={(e) => updateDim('width', e.target.value)} error={!!errors[`parcel${index}width`]} helperText={errors[`parcel${index}width`]} />
                        </Grid>
                        <Grid item xs={6} md={3}>
                            <TextField fullWidth type="number" label="Height (cm)" value={pHgt || ''} onChange={(e) => updateDim('height', e.target.value)} error={!!errors[`parcel${index}height`]} helperText={errors[`parcel${index}height`]} />
                        </Grid>
                        <Grid item xs={6} md={4}>
                            <TextField
                                fullWidth type="number" label="Quantity"
                                value={parcel.quantity || 1}
                                onChange={(e) => onChange('quantity', Number(e.target.value))}
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <Alert icon={<CalculateIcon fontSize="inherit" />} severity="info">
                                Volumetric: {volumetricTotal.toFixed(2)} kg | Actual: {weightTotal.toFixed(2)} kg | <strong>Billable: {billableWeight.toFixed(2)} kg</strong>
                            </Alert>
                        </Grid>
                    </Grid>
                </Box>
            </Collapse>
        </Paper>
    );
};

export default ParcelCard;
