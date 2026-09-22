import { WInput } from '../../ui';
import React from 'react';
import {
    Box, Typography, Tooltip, IconButton, Collapse, Grid, alpha, useTheme
} from '@mui/material';
import { TK } from '../../tokens/kineticHorizon';

const VOLUME_FACTOR = 5000;

const ParcelCard = ({ parcel, index, onChange, onRemove, expanded, onToggle, errors = {} }) => {
    const theme = useTheme();
    const pLen = Number(parcel.length || parcel.dimensions?.length || 0);
    const pWid = Number(parcel.width || parcel.dimensions?.width || 0);
    const pHgt = Number(parcel.height || parcel.dimensions?.height || 0);

    const updateDim = (field, val) => {
        const numVal = val === '' ? '' : Number(val);
        const resolvedVal = numVal === '' ? 0 : numVal;
        onChange({
            [field]: numVal,
            dimensions: {
                ...(parcel.dimensions || {}),
                length: field === 'length' ? resolvedVal : pLen,
                width: field === 'width' ? resolvedVal : pWid,
                height: field === 'height' ? resolvedVal : pHgt,
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
                borderRadius: '16px',
                overflow: 'hidden',
                bgcolor: '#ffffff',
                border: `1.5px solid ${hasError ? '#ef4444' : (expanded ? TK.primary : TK.border)}`,
                boxShadow: expanded ? '0 4px 16px rgba(0,80,212,0.08)' : '0 1px 3px rgba(0,0,0,0.03)',
                transition: 'all 0.2s ease'
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
                    bgcolor: expanded ? 'rgba(0,80,212,0.03)' : 'transparent',
                }}
            >
                <Box display="flex" alignItems="center" gap={2}>
                    <Box sx={{ 
                        p: 1, borderRadius: '10px', 
                        display: 'flex', 
                        bgcolor: hasError ? 'rgba(239,68,68,0.1)' : 'rgba(0,80,212,0.08)',
                        color: hasError ? '#ef4444' : TK.primary
                    }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 20 }} >inventory</span>
                    </Box>
                    <Box>
                        <Typography variant="body1" fontWeight="800">Unit {index + 1}</Typography>
                        {!expanded && (
                            <Typography variant="caption" color="text.secondary" fontWeight="700">
                                {parcel.quantity || 1} Pcs • {parcel.weight || 0}kg • {pLen}x{pWid}x{pHgt}cm
                            </Typography>
                        )}
                    </Box>
                    {hasError && <Tooltip title="Missing information"><span className="material-symbols-outlined" color="error" style={{ fontSize: 18 }} >error_outline</span></Tooltip>}
                </Box>
                <Box display="flex" alignItems="center" gap={1}>
                    <IconButton 
                        size="small" 
                        onClick={(e) => { e.stopPropagation(); onRemove(); }} 
                        sx={{ color: 'text.disabled', '&:hover': { color: 'error.main', bgcolor: alpha(theme.palette.error.main, 0.05) } }}
                    >
                        <span className="material-symbols-outlined" fontSize="small" >delete</span>
                    </IconButton>
                    <IconButton size="small" sx={{ color: 'text.primary' }}>
                        {expanded ? <span className="material-symbols-outlined" >expand_less</span> : <span className="material-symbols-outlined" >expand_more</span>}
                    </IconButton>
                </Box>
            </Box>

            <Collapse in={expanded}>
                <Box p={3.5} sx={{ borderTop: `1px solid ${TK.border}`, bgcolor: '#ffffff' }}>
                    <Grid container spacing={2.5}>
                        <Grid item xs={12}>
                            <WInput
                                fullWidth
                                label="Logistics Description"
                                value={parcel.description}
                                onChange={(e) => onChange('description', e.target.value)}
                                placeholder="e.g. Spare Parts, Electronics, Garments"
                                error={!!errors[`parcel${index}desc`]}
                                helperText={errors[`parcel${index}desc`]}
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <WInput
                                fullWidth
                                type="number"
                                label="Unit Weight"
                                unit="kg"
                                value={parcel.weight ?? ''}
                                onChange={(e) => onChange('weight', e.target.value === '' ? '' : Number(e.target.value))}
                                inputProps={{ min: 0, step: 'any' }}
                                error={!!errors[`parcel${index}weight`]}
                                helperText={errors[`parcel${index}weight`]}
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <WInput
                                fullWidth
                                type="number"
                                label="Unit Quantity"
                                unit="pcs"
                                value={parcel.quantity || 1}
                                onChange={(e) => onChange('quantity', e.target.value === '' ? 1 : Number(e.target.value))}
                                inputProps={{ min: 1 }}
                            />
                        </Grid>
                        <Grid item xs={4}>
                            <WInput
                                fullWidth
                                type="number"
                                label="Length"
                                unit="cm"
                                value={parcel.length ?? parcel.dimensions?.length ?? ''}
                                onChange={(e) => updateDim('length', e.target.value)}
                                inputProps={{ min: 0, step: 'any' }}
                                error={!!errors[`parcel${index}length`]}
                            />
                        </Grid>
                        <Grid item xs={4}>
                            <WInput
                                fullWidth
                                type="number"
                                label="Width"
                                unit="cm"
                                value={parcel.width ?? parcel.dimensions?.width ?? ''}
                                onChange={(e) => updateDim('width', e.target.value)}
                                inputProps={{ min: 0, step: 'any' }}
                                error={!!errors[`parcel${index}width`]}
                            />
                        </Grid>
                        <Grid item xs={4}>
                            <WInput
                                fullWidth
                                type="number"
                                label="Height"
                                unit="cm"
                                value={parcel.height ?? parcel.dimensions?.height ?? ''}
                                onChange={(e) => updateDim('height', e.target.value)}
                                inputProps={{ min: 0, step: 'any' }}
                                error={!!errors[`parcel${index}height`]}
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <Box 
                                sx={{ 
                                    p: 2.5,
                                    borderRadius: '16px', 
                                    bgcolor: '#f8fafc', 
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 2,
                                    border: `1px solid ${TK.border}`
                                }}
                            >
                                <span className="material-symbols-outlined" style={{ color: TK.primary, fontSize: 24 }} >calculate</span>
                                <Box flex={1}>
                                    <Typography variant="caption" sx={{ color: TK.text2, fontWeight: 800, letterSpacing: '0.05em' }} display="block">
                                        CALCULATED BILLABLE METRICS
                                    </Typography>
                                    <Typography variant="body2" sx={{ color: TK.text1, fontWeight: 700, mt: 0.5 }}>
                                        Volumetric: <b>{volumetricTotal.toFixed(2)} kg</b> &nbsp;•&nbsp; Actual: <b>{weightTotal.toFixed(2)} kg</b> &nbsp;•&nbsp; 
                                        <Box component="span" sx={{ color: TK.primary, ml: 1, fontWeight: 800 }}>
                                            Billable Total: {billableWeight.toFixed(2)} kg
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
