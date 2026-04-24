import React, { useMemo, useState } from 'react';
import {
    Box, Typography, Grid, FormControl,
    InputLabel, Select, MenuItem, TextField, FormControlLabel,
    Switch, Alert, Checkbox, Divider, alpha, useTheme, Stack,
    Accordion, AccordionSummary, AccordionDetails
} from '@mui/material';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import LocalOfferIcon from '@mui/icons-material/LocalOffer';
import SettingsSuggestIcon from '@mui/icons-material/SettingsSuggest';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

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
    declaredCurrency = 'KWD',
    billingCurrency = 'KWD',
    insuredValue = '',
    setInsuredValue,
    errors = {}
}) => {
    const theme = useTheme();
    const [expandedPanels, setExpandedPanels] = useState({
        docs: true,
        finance: false,
        optional: true,
        operations: false
    });

    const togglePanel = (key) => (_event, isExpanded) => {
        setExpandedPanels((prev) => ({ ...prev, [key]: isExpanded }));
    };
    const warnings = [];
    if (invoiceRemarks.length > LIMITS.invoiceRemarks) warnings.push(`Invoice Remarks exceeds ${LIMITS.invoiceRemarks} characters.`);
    if (packageMarks.length > LIMITS.packageMarks) warnings.push(`Package Marks exceeds ${LIMITS.packageMarks} characters.`);
    if (signatureName.length > LIMITS.signatureName) warnings.push(`Signature Name exceeds ${LIMITS.signatureName} characters.`);
    if (signatureTitle.length > LIMITS.signatureTitle) warnings.push(`Signature Title exceeds ${LIMITS.signatureTitle} characters.`);
    if (shipperAccount.length > LIMITS.shipperAccount) warnings.push(`Shipper Account exceeds ${LIMITS.shipperAccount} characters.`);

    const recommendedServices = availableOptionalServices.filter((service) => {
        const name = String(service.serviceName || '').toLowerCase();
        const code = String(service.serviceCode || '').toUpperCase();
        return code === 'II' || name.includes('insur') || name.includes('sign');
    });
    const paidServices = availableOptionalServices.filter((service) => {
        const code = String(service.serviceCode || '').toUpperCase();
        return Number(service.totalPrice || 0) > 0 && !recommendedServices.some((r) => r.serviceCode === code);
    });
    const includedServices = availableOptionalServices.filter((service) => {
        const code = String(service.serviceCode || '').toUpperCase();
        return Number(service.totalPrice || 0) === 0 && !recommendedServices.some((r) => r.serviceCode === code);
    });

    const insuranceSelected = selectedOptionalServiceCodes.includes('II');
    const insuranceAmount = Number(insuredValue || 0);
    const selectedOptionalServices = availableOptionalServices.filter(service =>
        selectedOptionalServiceCodes.includes(service.serviceCode)
    );

    const renderServiceRow = (service) => {
        const checked = selectedOptionalServiceCodes.includes(service.serviceCode);
        const isInsurance = String(service.serviceCode || '').toUpperCase() === 'II';
        return (
            <Box key={service.serviceCode}>
                <Box
                    onClick={() => onToggleOptionalService?.(service.serviceCode)}
                    sx={{
                        p: 2,
                        borderRadius: 4,
                        bgcolor: checked ? alpha(theme.palette.primary.main, 0.05) : 'surface-container-high',
                        border: '1px solid',
                        borderColor: checked ? 'primary.main' : 'transparent',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        transition: 'var(--transition-base)',
                        '&:hover': { bgcolor: 'surface-container' }
                    }}
                >
                    <Checkbox checked={checked} sx={{ mr: 1, color: 'text.disabled' }} />
                    <Box flex={1}>
                        <Typography variant="body2" fontWeight="800">{service.serviceName}</Typography>
                        <Typography variant="caption" color="text.secondary">
                            Asset Protection & Operations
                            {Number(service.markupAmount || 0) > 0
                                ? ` · Base ${Number(service.carrierAmount || 0).toFixed(3)} + Markup ${Number(service.markupAmount || 0).toFixed(3)}`
                                : ''}
                        </Typography>
                    </Box>
                    <Typography variant="body2" fontWeight="800" color="primary.main">
                        {Number(service.totalPrice || 0) === 0 ? 'Included' : `+${Number(service.totalPrice).toFixed(3)}`}
                    </Typography>
                </Box>

                {checked && isInsurance && (
                    <Box sx={{ px: 2, pt: 1.5 }}>
                        <TextField
                            fullWidth
                            size="small"
                            type="number"
                            label={`Insurance Value (${declaredCurrency})`}
                            value={insuredValue}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setInsuredValue?.(e.target.value)}
                            inputProps={{ min: 0.001, step: 0.001 }}
                            error={insuranceAmount <= 0 || Boolean(errors.insuredValue)}
                            helperText={errors.insuredValue || 'Required when insurance (II) is selected. Must be greater than 0.'}
                        />
                    </Box>
                )}
            </Box>
        );
    };

    const serviceGroups = useMemo(() => ([
        {
            key: 'recommended',
            title: 'Recommended',
            emptyLabel: 'No recommended services for this lane.',
            items: recommendedServices,
            defaultExpanded: true
        },
        {
            key: 'paid',
            title: 'Paid add-ons',
            emptyLabel: 'No paid add-ons returned by DHL rating.',
            items: paidServices,
            defaultExpanded: false
        },
        {
            key: 'included',
            title: 'Included (0.000)',
            emptyLabel: 'No included services returned by DHL rating.',
            items: includedServices,
            defaultExpanded: false
        }
    ]), [recommendedServices, paidServices, includedServices]);

    return (
        <Box className="fade-in">
            {/* 1. Commercial Invoice Data */}
            <Accordion
                expanded={expandedPanels.docs}
                onChange={togglePanel('docs')}
                disableGutters
                elevation={0}
                sx={{ mb: 3, borderRadius: 6, overflow: 'hidden', bgcolor: 'surface-container-low' }}
            >
                <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 4, py: 1 }}>
                    <Stack direction="row" alignItems="center" spacing={2}>
                        <Box sx={{ p: 1.5, borderRadius: 3, bgcolor: alpha(theme.palette.primary.main, 0.1), color: 'primary.main', display: 'flex' }}>
                            <ReceiptLongIcon />
                        </Box>
                        <Typography variant="h5" fontWeight="800" sx={{ letterSpacing: '-0.02em' }}>
                            Commercial Documentation
                        </Typography>
                    </Stack>
                </AccordionSummary>
                <AccordionDetails sx={{ px: 4, pb: 4, pt: 0 }}>
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
                                placeholder="Professional remarks for customs"
                                error={invoiceRemarks.length > LIMITS.invoiceRemarks}
                                helperText={`${invoiceRemarks.length}/${LIMITS.invoiceRemarks}`}
                            />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TextField
                                fullWidth size="small"
                                label="Authorized Signature Name"
                                value={signatureName}
                                onChange={(e) => setSignatureName(e.target.value.slice(0, LIMITS.signatureName + 20))}
                                error={signatureName.length > LIMITS.signatureName}
                                helperText={`${signatureName.length}/${LIMITS.signatureName}`}
                            />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TextField
                                fullWidth size="small"
                                label="Authorized Title"
                                value={signatureTitle}
                                onChange={(e) => setSignatureTitle(e.target.value.slice(0, LIMITS.signatureTitle + 20))}
                                placeholder="e.g. Export Logistics Manager"
                                error={signatureTitle.length > LIMITS.signatureTitle}
                                helperText={`${signatureTitle.length}/${LIMITS.signatureTitle}`}
                            />
                        </Grid>
                    </Grid>
                </AccordionDetails>
            </Accordion>

            {/* 2. Duties, Taxes & Billing */}
            <Accordion
                expanded={expandedPanels.finance}
                onChange={togglePanel('finance')}
                disableGutters
                elevation={0}
                sx={{ mb: 3, borderRadius: 6, overflow: 'hidden', bgcolor: 'surface-container-low' }}
            >
                <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 4, py: 1 }}>
                    <Stack direction="row" alignItems="center" spacing={2}>
                    <Box sx={{ p: 1.5, borderRadius: 3, bgcolor: alpha(theme.palette.secondary.main, 0.1), color: 'secondary.main', display: 'flex' }}>
                        <CreditCardIcon />
                    </Box>
                    <Typography variant="h5" fontWeight="800" sx={{ letterSpacing: '-0.02em' }}>
                        Financial Configuration
                    </Typography>
                    </Stack>
                </AccordionSummary>
                <AccordionDetails sx={{ px: 4, pb: 4, pt: 0 }}>
                    <Grid container spacing={3}>
                    <Grid item xs={12} md={6}>
                        <FormControl fullWidth size="small">
                            <InputLabel>Standard Incoterm</InputLabel>
                            <Select
                                value={incoterm || 'DAP'}
                                label="Standard Incoterm"
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
                            <InputLabel>VAT/GST Responsibility</InputLabel>
                            <Select
                                value={payerOfVat || 'receiver'}
                                label="VAT/GST Responsibility"
                                onChange={(e) => setPayerOfVat(e.target.value)}
                            >
                                <MenuItem value="receiver">Consignee Responsibility</MenuItem>
                                <MenuItem value="shipper">Shipper Responsibility</MenuItem>
                            </Select>
                        </FormControl>
                    </Grid>

                    <Grid item xs={12} md={6}>
                        <TextField
                            fullWidth size="small"
                            label="Custom Carrier Account (Optional)"
                            value={shipperAccount}
                            onChange={(e) => setShipperAccount(e.target.value.slice(0, LIMITS.shipperAccount + 8))}
                            helperText="Leave blank to use Target logistics default"
                            error={shipperAccount.length > LIMITS.shipperAccount}
                        />
                    </Grid>
                    <Grid item xs={12} md={6} display="flex" alignItems="center" sx={{ pl: 1 }}>
                        <FormControlLabel
                            control={<Switch checked={gstPaid} onChange={(e) => setGstPaid(e.target.checked)} />}
                            label="VAT / GST Pre-paid?"
                        />
                    </Grid>
                </Grid>
                </AccordionDetails>
            </Accordion>

            {/* 3. Optional Services */}
            <Accordion
                expanded={expandedPanels.optional}
                onChange={togglePanel('optional')}
                disableGutters
                elevation={0}
                sx={{ mb: 3, borderRadius: 6, overflow: 'hidden', bgcolor: 'surface-container-low' }}
            >
                <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 4, py: 1 }}>
                    <Stack direction="row" alignItems="center" spacing={2} sx={{ width: '100%' }}>
                    <Box sx={{ p: 1.5, borderRadius: 3, bgcolor: alpha(theme.palette.primary.main, 0.1), color: 'primary.main', display: 'flex' }}>
                        <LocalOfferIcon />
                    </Box>
                    <Grid container justifyContent="space-between" alignItems="center">
                        <Grid item>
                            <Typography variant="h5" fontWeight="800" sx={{ letterSpacing: '-0.02em' }}>
                                Value Added Logistics
                            </Typography>
                        </Grid>
                        <Grid item>
                            <Typography variant="h5" fontWeight="800" color="primary.main">
                                {Number(estimatedShipmentTotal).toFixed(3)} <Box component="span" sx={{ fontSize: '0.9rem', opacity: 0.7 }}>{billingCurrency}</Box>
                            </Typography>
                        </Grid>
                    </Grid>
                    </Stack>
                </AccordionSummary>
                <AccordionDetails sx={{ px: 4, pb: 4, pt: 0 }}>

                <Alert severity="info" sx={{ mb: 2 }}>
                    Declared Currency: <strong>{declaredCurrency}</strong> · Billing Currency: <strong>{billingCurrency}</strong>
                </Alert>

                <Grid container spacing={4}>
                    <Grid item xs={12} lg={7}>
                        {availableOptionalServices.length > 0 ? (
                            <Stack spacing={1.5}>
                                {serviceGroups.map((group) => (
                                    <Accordion
                                        key={group.key}
                                        defaultExpanded={group.defaultExpanded}
                                        disableGutters
                                        elevation={0}
                                        sx={{
                                            borderRadius: 4,
                                            bgcolor: 'surface-container',
                                            border: '1px solid',
                                            borderColor: 'divider'
                                        }}
                                    >
                                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                            <Typography variant="overline" color="text.secondary" fontWeight="800">
                                                {group.title} ({group.items.length})
                                            </Typography>
                                        </AccordionSummary>
                                        <AccordionDetails>
                                            <Stack spacing={1.5}>
                                                {group.items.length > 0
                                                    ? group.items.map(renderServiceRow)
                                                    : <Typography variant="caption" color="text.secondary">{group.emptyLabel}</Typography>}
                                            </Stack>
                                        </AccordionDetails>
                                    </Accordion>
                                ))}
                            </Stack>
                        ) : (
                            <Box sx={{ p: 4, borderRadius: 4, bgcolor: 'surface-container-high', textAlign: 'center' }}>
                                <Typography variant="body2" color="text.secondary" fontWeight="700">
                                    No additional value services available for this route.
                                </Typography>
                            </Box>
                        )}
                    </Grid>

                    <Grid item xs={12} lg={5}>
                        <Box sx={{ p: 3, borderRadius: 4, bgcolor: 'surface-container-high', height: '100%' }}>
                            <Typography variant="overline" color="text.secondary" fontWeight="800" display="block" mb={2}>
                                ESTIMATED BREAKDOWN
                            </Typography>
                            <Stack spacing={2}>
                                <Box display="flex" justifyContent="space-between">
                                    <Typography variant="body2">Base Freight Rate</Typography>
                                    <Typography variant="body2" fontWeight="800">{Number(estimatedShipmentCost).toFixed(3)}</Typography>
                                </Box>
                                <Box display="flex" justifyContent="space-between">
                                    <Typography variant="body2">Total Optional Adds</Typography>
                                    <Typography variant="body2" fontWeight="800">{Number(optionalServicesTotal).toFixed(3)}</Typography>
                                </Box>
                                {selectedOptionalServices.map((service) => (
                                    <Box key={`calc-${service.serviceCode}`} sx={{ pl: 1, borderLeft: '2px solid', borderColor: 'divider' }}>
                                        <Box display="flex" justifyContent="space-between">
                                            <Typography variant="caption" color="text.secondary">{service.serviceName}</Typography>
                                            <Typography variant="caption" fontWeight="700">{Number(service.totalPrice || 0).toFixed(3)} {billingCurrency}</Typography>
                                        </Box>
                                        <Typography variant="caption" color="text.secondary">
                                            Base {Number(service.carrierAmount || service.totalPrice || 0).toFixed(3)} + Markup {Number(service.markupAmount || 0).toFixed(3)}
                                        </Typography>
                                        {String(service.serviceCode || '').toUpperCase() === 'II' && (
                                            <Typography variant="caption" display="block" color="text.secondary">
                                                Insurance Value: {Number(insuranceAmount || 0).toFixed(3)} {declaredCurrency}
                                            </Typography>
                                        )}
                                    </Box>
                                ))}
                                <Divider sx={{ opacity: 0.5 }} />
                                <Box display="flex" justifyContent="space-between" alignItems="center">
                                    <Typography variant="body1" fontWeight="800">Total Calculation</Typography>
                                    <Typography variant="h6" fontWeight="800" color="primary.main">
                                        {Number(estimatedShipmentTotal).toFixed(3)} {billingCurrency}
                                    </Typography>
                                </Box>

                                {deliveryDate && (
                                    <Box sx={{ mt: 2, p: 2, borderRadius: 3, bgcolor: alpha(theme.palette.success.main, 0.08), display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                        <CheckCircleIcon color="success" fontSize="small" />
                                        <Box>
                                            <Typography variant="caption" color="success.main" fontWeight="800" display="block">EXPECTED ARRIVAL</Typography>
                                            <Typography variant="body2" fontWeight="800">
                                                {new Date(deliveryDate).toLocaleDateString('en-GB', { dateStyle: 'medium' })}
                                            </Typography>
                                        </Box>
                                    </Box>
                                )}
                            </Stack>
                        </Box>
                    </Grid>
                </Grid>
                </AccordionDetails>
            </Accordion>

            {/* 4. Operations */}
            <Accordion
                expanded={expandedPanels.operations}
                onChange={togglePanel('operations')}
                disableGutters
                elevation={0}
                sx={{ borderRadius: 6, overflow: 'hidden', bgcolor: 'surface-container-low' }}
            >
                <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 4, py: 1 }}>
                    <Stack direction="row" alignItems="center" spacing={2}>
                    <Box sx={{ p: 1.5, borderRadius: 3, bgcolor: alpha(theme.palette.primary.main, 0.1), color: 'primary.main', display: 'flex' }}>
                        <SettingsSuggestIcon />
                    </Box>
                    <Typography variant="h5" fontWeight="800" sx={{ letterSpacing: '-0.02em' }}>
                        Operational Directives
                    </Typography>
                    </Stack>
                </AccordionSummary>
                <AccordionDetails sx={{ px: 4, pb: 4, pt: 0 }}>
                    <Grid container spacing={3}>
                    <Grid item xs={12} md={4}>
                        <FormControl fullWidth size="small">
                            <InputLabel>Print Manifest Format</InputLabel>
                            <Select
                                value={labelFormat || 'pdf'}
                                label="Print Manifest Format"
                                onChange={(e) => setLabelFormat(e.target.value)}
                            >
                                <MenuItem value="pdf">Professional PDF</MenuItem>
                                <MenuItem value="zpl">Thermal ZPL (Zebra)</MenuItem>
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <TextField
                            fullWidth size="small" type="number" label="Unit Pallet Count"
                            value={palletCount} onChange={(e) => setPalletCount(e.target.value)}
                        />
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <TextField
                            fullWidth size="small" label="Special Package Marks"
                            value={packageMarks} onChange={(e) => setPackageMarks(e.target.value.slice(0, LIMITS.packageMarks + 40))}
                            placeholder="e.g. HANDLE WITH CARE"
                            error={packageMarks.length > LIMITS.packageMarks}
                            helperText={`${packageMarks.length}/${LIMITS.packageMarks}`}
                        />
                    </Grid>
                </Grid>
                </AccordionDetails>
            </Accordion>

            {warnings.length > 0 && (
                <Alert severity="warning" variant="outlined" sx={{ mt: 4, borderRadius: 4 }}>
                    <Typography variant="subtitle2" fontWeight="800" sx={{ mb: 1 }}>Carrier Validation Warnings</Typography>
                    {warnings.map((warning) => (
                        <Typography key={warning} variant="caption" display="block">• {warning}</Typography>
                    ))}
                </Alert>
            )}
        </Box>
    );
};

export default ShipmentBilling;
