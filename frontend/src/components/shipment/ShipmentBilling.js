import React from 'react';
import {
    Box, Typography, Grid, Paper, FormControl,
    InputLabel, Select, MenuItem, TextField, FormControlLabel,
    Switch, Alert, Checkbox, List, ListItem, ListItemText, ListItemIcon, Divider
} from '@mui/material';

const LIMITS = {
    invoiceRemarks: 120,
    signatureName: 35,
    signatureTitle: 35,
    packageMarks: 70,
    shipperAccount: 12
};

const ShipmentBilling = ({
    exportReason = '', setExportReason,
    invoiceRemarks = '', setInvoiceRemarks,
    incoterm = '', setIncoterm,
    gstPaid = false, setGstPaid,
    payerOfVat = 'receiver', setPayerOfVat,
    shipperAccount = '', setShipperAccount,
    labelFormat = 'pdf', setLabelFormat,
    signatureName = '', setSignatureName,
    signatureTitle = '', setSignatureTitle,
    palletCount = '', setPalletCount,
    packageMarks = '', setPackageMarks,
    availableOptionalServices = [],
    selectedOptionalServiceCodes = [],
    onToggleOptionalService,
    estimatedShipmentCost = 0,
    optionalServicesTotal = 0,
    estimatedShipmentTotal = 0,
    deliveryDate = null,
    errors = {}
}) => {
    const warnings = [];
    if (invoiceRemarks.length > LIMITS.invoiceRemarks) warnings.push(`Invoice Remarks exceeds ${LIMITS.invoiceRemarks} characters.`);
    if (packageMarks.length > LIMITS.packageMarks) warnings.push(`Package Marks exceeds ${LIMITS.packageMarks} characters.`);
    if (signatureName.length > LIMITS.signatureName) warnings.push(`Signature Name exceeds ${LIMITS.signatureName} characters.`);
    if (signatureTitle.length > LIMITS.signatureTitle) warnings.push(`Signature Title exceeds ${LIMITS.signatureTitle} characters.`);
    if (shipperAccount.length > LIMITS.shipperAccount) warnings.push(`Shipper Account exceeds ${LIMITS.shipperAccount} characters.`);

    return (
        <Box>
            {/* 1. Commercial Invoice Data */}
            <Paper sx={{ p: 3, mb: 3 }} variant="outlined">
                <Typography variant="h6" fontWeight="bold" gutterBottom>1. Commercial Invoice Details</Typography>
                <Grid container spacing={3}>
                    <Grid item xs={12} md={6}>
                        <FormControl fullWidth size="small">
                            <InputLabel>Reason for Export</InputLabel>
                            <Select
                                value={exportReason || 'permanent'}
                                label="Reason for Export"
                                onChange={(e) => setExportReason(e.target.value)}
                            >
                                <MenuItem value="permanent">Permanent (Sale)</MenuItem>
                                <MenuItem value="temporary">Temporary (Repair/Return)</MenuItem>
                                <MenuItem value="gift">Gift</MenuItem>
                                <MenuItem value="sample">Commercial Sample</MenuItem>
                                <MenuItem value="return">Return Goods</MenuItem>
                                <MenuItem value="repair">Repair</MenuItem>
                                <MenuItem value="personal">Personal Effects</MenuItem>
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <TextField
                            fullWidth size="small"
                            label="Invoice Remarks"
                            value={invoiceRemarks}
                            onChange={(e) => setInvoiceRemarks(e.target.value.slice(0, LIMITS.invoiceRemarks + 20))}
                            placeholder="Visible on Commercial Invoice"
                            error={invoiceRemarks.length > LIMITS.invoiceRemarks}
                            helperText={`${invoiceRemarks.length}/${LIMITS.invoiceRemarks}`}
                        />
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <TextField
                            fullWidth size="small"
                            label="Signature Name"
                            value={signatureName}
                            onChange={(e) => setSignatureName(e.target.value.slice(0, LIMITS.signatureName + 20))}
                            placeholder="Name for Invoice Signature"
                            error={signatureName.length > LIMITS.signatureName}
                            helperText={`${signatureName.length}/${LIMITS.signatureName}`}
                        />
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <TextField
                            fullWidth size="small"
                            label="Signature Title"
                            value={signatureTitle}
                            onChange={(e) => setSignatureTitle(e.target.value.slice(0, LIMITS.signatureTitle + 20))}
                            placeholder="e.g. Logistics Manager"
                            error={signatureTitle.length > LIMITS.signatureTitle}
                            helperText={`${signatureTitle.length}/${LIMITS.signatureTitle}`}
                        />
                    </Grid>
                </Grid>
            </Paper>

            {/* 2. Duties, Taxes & Billing */}
            <Paper sx={{ p: 3, mb: 3 }} variant="outlined">
                <Typography variant="h6" fontWeight="bold" gutterBottom>2. Duties, Taxes & Billing</Typography>
                <Grid container spacing={3}>
                    <Grid item xs={12} md={6}>
                        <FormControl fullWidth size="small">
                            <InputLabel>Incoterm (Who pays duties?)</InputLabel>
                            <Select
                                value={incoterm || 'DAP'}
                                label="Incoterm (Who pays duties?)"
                                onChange={(e) => setIncoterm(e.target.value)}
                            >
                                <MenuItem value="DAP">DAP (Consignee pays duties)</MenuItem>
                                <MenuItem value="DDP">DDP (Shipper pays duties)</MenuItem>
                                <MenuItem value="EXW">EXW (Ex Works)</MenuItem>
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <FormControl fullWidth size="small">
                            <InputLabel>Payer of VAT/GST</InputLabel>
                            <Select
                                value={payerOfVat || 'receiver'}
                                label="Payer of VAT/GST"
                                onChange={(e) => setPayerOfVat(e.target.value)}
                            >
                                <MenuItem value="receiver">Consignee</MenuItem>
                                <MenuItem value="shipper">Shipper</MenuItem>
                            </Select>
                        </FormControl>
                    </Grid>

                    <Grid item xs={12} md={6}>
                        <TextField
                            fullWidth size="small"
                            label="Shipper Account Number (Optional)"
                            value={shipperAccount}
                            onChange={(e) => setShipperAccount(e.target.value.slice(0, LIMITS.shipperAccount + 8))}
                            placeholder="Overwrite default account if needed"
                            helperText={`Leave blank to use system default (${shipperAccount.length}/${LIMITS.shipperAccount})`}
                            error={shipperAccount.length > LIMITS.shipperAccount}
                        />
                    </Grid>
                    <Grid item xs={12} md={6} display="flex" alignItems="center">
                        <FormControlLabel
                            control={<Switch checked={gstPaid} onChange={(e) => setGstPaid(e.target.checked)} />}
                            label="GST/VAT already paid?"
                        />
                    </Grid>
                </Grid>
            </Paper>

            {/* 3. Optional Services (before review) */}
            <Paper sx={{ p: 3, mb: 3 }} variant="outlined">
                <Typography variant="h6" fontWeight="bold" gutterBottom>3. Optional Services & Cost Estimate</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Select optional services now so your estimated total is finalized before review.
                </Typography>

                {availableOptionalServices.length > 0 ? (
                    <List dense disablePadding>
                        {availableOptionalServices.filter(s => Number(s.totalPrice || 0) > 0).map((service) => {
                            const checked = selectedOptionalServiceCodes.includes(service.serviceCode);
                            return (
                                <ListItem
                                    key={service.serviceCode}
                                    sx={{ border: '1px solid', borderColor: checked ? 'primary.main' : 'divider', borderRadius: 1, mb: 1 }}
                                    onClick={() => onToggleOptionalService?.(service.serviceCode)}
                                >
                                    <ListItemIcon sx={{ minWidth: 34 }}>
                                        <Checkbox checked={checked} />
                                    </ListItemIcon>
                                    <ListItemText
                                        primary={service.serviceName}
                                        secondary={`Code: ${service.serviceCode} · ${Number(service.totalPrice || 0) === 0 ? 'Included' : `${Number(service.totalPrice).toFixed(3)} KD`}`}
                                    />
                                </ListItem>
                            );
                        })}
                    </List>
                ) : (
                    <Alert severity="info">
                        No optional services were returned at quote stage for this route/service. Final optional services are fetched again at approval/booking from carrier.
                    </Alert>
                )}
                {availableOptionalServices.some(s => Number(s.totalPrice || 0) === 0) && (
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                        * Services included in the base rate are automatically applied and not listed here.
                    </Typography>
                )}

                <Divider sx={{ my: 2 }} />
                <Grid container spacing={1}>
                    <Grid item xs={12} md={4}><Typography variant="body2">Estimated Shipment Cost:</Typography></Grid>
                    <Grid item xs={12} md={8}><Typography variant="body2" fontWeight="bold">{Number(estimatedShipmentCost).toFixed(3)} KD</Typography></Grid>
                    <Grid item xs={12} md={4}><Typography variant="body2">Optional Services:</Typography></Grid>
                    <Grid item xs={12} md={8}><Typography variant="body2" fontWeight="bold">{Number(optionalServicesTotal).toFixed(3)} KD</Typography></Grid>
                    <Grid item xs={12} md={4}><Typography variant="body2">Estimated Shipment Total:</Typography></Grid>
                    <Grid item xs={12} md={8}><Typography variant="body2" color="primary" fontWeight="bold">{Number(estimatedShipmentTotal).toFixed(3)} KD</Typography></Grid>
                    {deliveryDate && (
                        <>
                            <Grid item xs={12}><Divider sx={{ my: 1 }} /></Grid>
                            <Grid item xs={12} md={4}>
                                <Typography variant="body2" color="text.secondary">🗓 Est. Delivery:</Typography>
                            </Grid>
                            <Grid item xs={12} md={8}>
                                <Typography variant="body2" fontWeight="bold" color="success.main">
                                    {new Date(deliveryDate).toLocaleDateString('en-GB', {
                                        weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
                                    })}
                                </Typography>
                            </Grid>
                        </>
                    )}
                </Grid>
            </Paper>

            {/* 4. Output Configuration */}
            <Paper sx={{ p: 3, mb: 3 }} variant="outlined">
                <Typography variant="h6" fontWeight="bold" gutterBottom>4. Output & Operations</Typography>
                <Grid container spacing={3}>
                    <Grid item xs={12} md={4}>
                        <FormControl fullWidth size="small">
                            <InputLabel>Label Format</InputLabel>
                            <Select
                                value={labelFormat || 'pdf'}
                                label="Label Format"
                                onChange={(e) => setLabelFormat(e.target.value)}
                            >
                                <MenuItem value="pdf">PDF (Common)</MenuItem>
                                <MenuItem value="zpl">ZPL (Thermal Printers)</MenuItem>
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <TextField
                            fullWidth size="small" type="number" label="Pallet Count"
                            value={palletCount} onChange={(e) => setPalletCount(e.target.value)}
                        />
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <TextField
                            fullWidth size="small" label="Package Marks"
                            value={packageMarks} onChange={(e) => setPackageMarks(e.target.value.slice(0, LIMITS.packageMarks + 40))}
                            placeholder="e.g. Fragile / Up"
                            error={packageMarks.length > LIMITS.packageMarks}
                            helperText={`${packageMarks.length}/${LIMITS.packageMarks}`}
                        />
                    </Grid>
                </Grid>
            </Paper>

            {warnings.length > 0 && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                    <Typography variant="subtitle2" fontWeight="bold">Carrier formatting warnings</Typography>
                    {warnings.map((warning) => (
                        <Typography key={warning} variant="body2">• {warning}</Typography>
                    ))}
                </Alert>
            )}

            <Alert severity="info">
                Please verify all billing details. Incorrect Incoterms or invalid field lengths can result in carrier rejection.
            </Alert>
        </Box>
    );
};

export default ShipmentBilling;
