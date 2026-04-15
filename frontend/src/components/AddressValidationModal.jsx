import React from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography,
    Alert, Grid, Chip, Divider
} from '@mui/material';
import WarningIcon from '@mui/icons-material/Warning';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';

/**
 * AddressValidationModal
 * 
 * Modal to show Google Address Validation results and corrections.
 * User must confirm or override address before proceeding.
 * 
 * @param {Boolean} open - Modal visibility
 * @param {Function} onClose - Close callback
 * @param {Object} originalAddress - User-entered address
 * @param {Object} validatedAddress - Google's validated/corrected address
 * @param {String} verdict - CONFIRMED, UNCONFIRMED, REQUIRES_CORRECTION
 * @param {Array} corrections - List of corrected components
 * @param {Function} onAcceptOriginal - Keep original address
 * @param {Function} onAcceptCorrected - Use Google's correction
 */
const AddressValidationModal = ({
    open,
    onClose,
    originalAddress = {},
    validatedAddress = {},
    verdict = 'PENDING',
    corrections = [],
    onAcceptOriginal,
    onAcceptCorrected
}) => {
    const isConfirmed = verdict === 'CONFIRMED';
    const requiresCorrection = verdict === 'REQUIRES_CORRECTION';
    const isUnconfirmed = verdict === 'UNCONFIRMED';

    const renderAddressCard = (address, label, color) => (
        <Box
            p={2}
            borderRadius={2}
            border={2}
            borderColor={color}
            bgcolor={`${color}10`}
        >
            <Typography variant="subtitle2" color={color} fontWeight="bold" gutterBottom>
                {label}
            </Typography>
            <Typography variant="body2">
                {address.streetLines?.[0] || address.formattedAddress?.split(',')[0]}
            </Typography>
            {address.unitNumber && (
                <Typography variant="body2" color="text.secondary">
                    {address.buildingName} {address.unitNumber}
                </Typography>
            )}
            <Typography variant="body2">
                {address.city}, {address.state} {address.postalCode}
            </Typography>
            <Typography variant="body2">
                {address.country || address.countryCode}
            </Typography>
        </Box>
    );

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="md"
            fullWidth
            PaperProps={{ sx: { borderRadius: 3 } }}
        >
            <DialogTitle sx={{ pb: 1 }}>
                <Box display="flex" alignItems="center" gap={1}>
                    {isConfirmed ? (
                        <CheckCircleIcon color="success" />
                    ) : (
                        <WarningIcon color="warning" />
                    )}
                    <Typography variant="h6" fontWeight="bold">
                        Address Validation
                    </Typography>
                </Box>
            </DialogTitle>

            <DialogContent>
                {/* Status Alert */}
                {isConfirmed && (
                    <Alert severity="success" sx={{ mb: 3 }}>
                        <strong>Address Verified!</strong> This address has been confirmed by Google.
                    </Alert>
                )}

                {requiresCorrection && (
                    <Alert severity="warning" sx={{ mb: 3 }}>
                        <strong>Correction Suggested</strong>
                        <br />
                        Google suggests a different address. Please review and confirm.
                        {corrections.length > 0 && (
                            <Box mt={1}>
                                <Typography variant="caption">
                                    Corrected: {corrections.join(', ')}
                                </Typography>
                            </Box>
                        )}
                    </Alert>
                )}

                {isUnconfirmed && (
                    <Alert severity="info" sx={{ mb: 3 }}>
                        <strong>Could Not Verify</strong>
                        <br />
                        We couldn't verify this address. It may still be correct.
                        Double-check the details before proceeding.
                    </Alert>
                )}

                {/* Address Comparison */}
                {requiresCorrection ? (
                    <Grid container spacing={2} alignItems="stretch">
                        <Grid item xs={5}>
                            {renderAddressCard(originalAddress, 'Your Address', 'warning.main')}
                        </Grid>
                        <Grid item xs={2} display="flex" alignItems="center" justifyContent="center">
                            <CompareArrowsIcon sx={{ fontSize: 40, color: 'action.active' }} />
                        </Grid>
                        <Grid item xs={5}>
                            {renderAddressCard(validatedAddress, 'Suggested Address', 'success.main')}
                        </Grid>
                    </Grid>
                ) : (
                    <Box>
                        {renderAddressCard(
                            originalAddress,
                            'Your Address',
                            isConfirmed ? 'success.main' : 'grey.500'
                        )}
                    </Box>
                )}

                <Divider sx={{ my: 3 }} />

                {/* Validation Details */}
                <Box display="flex" gap={1} flexWrap="wrap">
                    <Chip
                        label={`Status: ${verdict}`}
                        color={isConfirmed ? 'success' : requiresCorrection ? 'warning' : 'default'}
                        size="small"
                    />
                    {originalAddress.latitude && (
                        <Chip
                            label={`📍 ${originalAddress.latitude.toFixed(4)}, ${originalAddress.longitude.toFixed(4)}`}
                            size="small"
                            variant="outlined"
                        />
                    )}
                    {originalAddress.placeId && (
                        <Chip
                            label="Place ID ✓"
                            size="small"
                            variant="outlined"
                            color="primary"
                        />
                    )}
                </Box>
            </DialogContent>

            <DialogActions sx={{ p: 3, pt: 0 }}>
                {isConfirmed ? (
                    <Button
                        variant="contained"
                        color="success"
                        onClick={() => onAcceptOriginal?.()}
                        fullWidth
                    >
                        Continue with Verified Address
                    </Button>
                ) : requiresCorrection ? (
                    <>
                        <Button
                            variant="outlined"
                            onClick={() => onAcceptOriginal?.()}
                        >
                            Keep Original
                        </Button>
                        <Button
                            variant="contained"
                            color="success"
                            onClick={() => onAcceptCorrected?.()}
                        >
                            Use Suggested Address
                        </Button>
                    </>
                ) : (
                    <>
                        <Button
                            variant="outlined"
                            onClick={onClose}
                        >
                            Edit Address
                        </Button>
                        <Button
                            variant="contained"
                            onClick={() => onAcceptOriginal?.()}
                        >
                            Continue Anyway
                        </Button>
                    </>
                )}
            </DialogActions>
        </Dialog>
    );
};

export default AddressValidationModal;
