import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import {
    Typography, Button, Box, Grid, Divider,
    CircularProgress, Stack, FormControl,
    Select, MenuItem, GlobalStyles,
    Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, LinearProgress
} from '@mui/material';

import CheckCircleIcon       from '@mui/icons-material/CheckCircle';
import ArrowForwardIcon      from '@mui/icons-material/ArrowForward';
import ArrowBackIcon         from '@mui/icons-material/ArrowBack';
import BusinessCenterIcon    from '@mui/icons-material/BusinessCenter';
import LightbulbIcon         from '@mui/icons-material/Lightbulb';
import ErrorOutlineIcon      from '@mui/icons-material/ErrorOutline';
import WarningAmberIcon      from '@mui/icons-material/WarningAmber';

import { useAuth } from '../context/AuthContext';
import ShipmentSetup    from '../components/shipment/ShipmentSetup';
import ShipmentContent  from '../components/shipment/ShipmentContent';
import ShipmentBilling  from '../components/shipment/ShipmentBilling';
import { formatPartyAddress } from '../utils/addressFormatter';
import { shipmentService, userService } from '../services/api';

// ─── Design system tokens ─────────────────────────────────────────────────────
const DS = {
    surface:         '#f3f7fb',
    surfaceLowest:   '#ffffff',
    surfaceLow:      '#ecf1f6',
    surfaceContainer:'#e3e9ee',
    surfaceHigh:     '#dde3e8',
    primary:         '#0050d4',
    onSurface:       '#2a2f32',
    onSurfaceVar:    '#575c60',
    outline:         '#73777b',
    outlineVariant:  '#a9aeb1',
    secondary:       '#00628c',
    tertiaryContainer: '#3adffa',
    onTertiaryContainer: '#004b56',
};

const CARD_SX = {
    bgcolor: DS.surfaceLowest,
    borderRadius: '12px',
    border: `1px solid rgba(169,174,177,0.18)`,
    boxShadow: '0 1px 6px rgba(42,47,50,0.06)',
};

const LABEL_SX = {
    fontSize: 10, fontWeight: 800, color: DS.outline,
    letterSpacing: '0.1em', textTransform: 'uppercase',
    display: 'block', mb: 0.75,
    fontFamily: "'Manrope', sans-serif",
};

const VOLUME_FACTOR = 5000;
const ISSUE_LOG_STORAGE_KEY = 'shipment_wizard_issue_log_v1';
const ISSUE_LOG_LIMIT = 200;

const STEPS = [
    { key: 'Setup',   label: 'Addresses', sublabel: 'Origin & destination' },
    { key: 'Content', label: 'Contents',  sublabel: 'Items & parcels' },
    { key: 'Billing', label: 'Billing',   sublabel: 'Invoice & services' },
    { key: 'Review',  label: 'Review',    sublabel: 'Confirm & dispatch' },
];

const STEP_TIPS = {
    Setup:   'Complete Shipper and Consignee details first to unlock real-time carrier availability and dynamic route pricing.',
    Content: 'Accurate weight and dimensions are critical — discrepancies may result in surcharges from the carrier.',
    Billing: 'Optional services such as insurance and morning delivery can be added here. All pricing is live from the carrier.',
    Review:  'Double-check all details before authorizing. Once dispatched, the manifest is submitted to the carrier network.',
};

const DEFAULT_CARRIER_CAPABILITIES = {
    DGR: {
        dangerousGoods: { supported: true, templates: [] },
        requiredFields: {
            sender:   ['company','contactPerson','phone','email','streetLines','city','countryCode','postalCode','reference'],
            receiver: ['contactPerson','phone','streetLines','city','countryCode','postalCode','reference'],
        },
        optionalServices: [{ code: 'II', category: 'insurance', requires: ['insuredValue'] }],
        packagingOptions: [
            { value: 'user', label: 'My Own Packaging' },
            { value: 'CP',   label: 'Custom Packaging' },
            { value: 'EE',   label: 'DGR Express Envelope' },
            { value: 'OD',   label: 'Other DGR Packaging' },
        ],
    },
    DHL: {
        dangerousGoods: { supported: true, templates: [] },
        requiredFields: {
            sender:   ['contactPerson','phone','streetLines','city','countryCode','postalCode'],
            receiver: ['contactPerson','phone','streetLines','city','countryCode','postalCode'],
        },
        optionalServices: [{ code: 'II', category: 'insurance', requires: ['insuredValue'] }],
        packagingOptions: [
            { value: 'user', label: 'My Own Packaging' },
            { value: 'CP',   label: 'Custom Packaging' },
        ],
    },
    FEDEX: {
        dangerousGoods: { supported: false, templates: [] },
        requiredFields: {
            sender:   ['contactPerson','phone','streetLines','city','countryCode','postalCode'],
            receiver: ['contactPerson','phone','streetLines','city','countryCode','postalCode'],
        },
        optionalServices: [{ code: 'II', category: 'insurance', requires: ['insuredValue'] }],
        packagingOptions: [{ value: 'user', label: 'My Own Packaging' }],
    },
    UPS: {
        dangerousGoods: { supported: false, templates: [] },
        requiredFields: {
            sender:   ['contactPerson','phone','streetLines','city','countryCode','postalCode'],
            receiver: ['contactPerson','phone','streetLines','city','countryCode','postalCode'],
        },
        optionalServices: [{ code: 'II', category: 'insurance', requires: ['insuredValue'] }],
        packagingOptions: [{ value: 'user', label: 'My Own Packaging' }],
    },
    ARAMEX: {
        dangerousGoods: { supported: false, templates: [] },
        requiredFields: {
            sender:   ['contactPerson','phone','streetLines','city','countryCode','postalCode'],
            receiver: ['contactPerson','phone','streetLines','city','countryCode','postalCode'],
        },
        optionalServices: [{ code: 'II', category: 'insurance', requires: ['insuredValue'] }],
        packagingOptions: [
            { value: 'user',     label: 'My Own Packaging' },
            { value: 'box',      label: 'Aramex Generic Box' },
            { value: 'envelope', label: 'Aramex Express Envelope' },
        ],
    },
};

const PARTY_FIELD_CONFIG = {
    contactPerson: { errorSuffix: 'Contact', label: 'contact person', action: 'Enter a contact person name for carrier handover and delivery calls.' },
    phone: { errorSuffix: 'Phone', label: 'phone number', action: 'Enter a valid phone number so the carrier can coordinate pickup/delivery.' },
    email: { errorSuffix: 'Email', label: 'email address', action: 'Enter an email address for shipment notifications and documentation.' },
    streetLines: { errorSuffix: 'Street', label: 'street address', action: 'Enter address line 1 to route the shipment correctly.' },
    city: { errorSuffix: 'City', label: 'city', action: 'Enter the city required by the selected carrier.' },
    postalCode: { errorSuffix: 'Postal', label: 'postal code', action: 'Enter the postal code required for this route.' },
    reference: { errorSuffix: 'Reference', label: 'reference', action: 'Enter the shipper/consignee reference required by this carrier.' },
    countryCode: { errorSuffix: 'Country', label: 'country', action: 'Select the country so rates and compliance rules can be applied.' },
};

const buildIssue = ({
    id,
    severity = 'error',
    step = 'Setup',
    section = 'Shipment details',
    fieldPath,
    errorKey,
    title,
    message,
    action,
    source = 'client',
    carrierCode,
}) => ({
    id,
    severity,
    step,
    section,
    fieldPath,
    errorKey,
    anchorId: fieldPath ? `field-${fieldPath.replace(/\./g, '-')}` : null,
    title,
    message,
    action,
    source,
    carrierCode,
});

const issueMapToErrors = (issues = []) => (
    issues.reduce((acc, issue) => {
        if (issue.errorKey && !acc[issue.errorKey]) acc[issue.errorKey] = issue.message;
        return acc;
    }, {})
);

const buildIssueLogEntry = ({ event, issues = [], stepKey, carrierCode }) => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    event,
    step: stepKey,
    carrierCode,
    issueCount: issues.length,
    blockingCount: issues.filter((issue) => issue.severity === 'error').length,
    warningCount: issues.filter((issue) => issue.severity === 'warning').length,
    issueIds: issues.map((issue) => issue.id),
});

// ─── Horizontal step tabs ─────────────────────────────────────────────────────
const StepTabs = ({ activeStep, isEditMode, editTrackingNumber }) => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            <Typography variant="h4" sx={{
                fontWeight: 900, letterSpacing: '-0.03em', color: DS.onSurface,
                fontFamily: "'Manrope', sans-serif",
            }}>
                {isEditMode ? `Edit Shipment #${editTrackingNumber}` : 'New Shipment'}
            </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{
                px: 1.5, py: 0.5,
                bgcolor: DS.primary,
                borderRadius: '4px',
                flexShrink: 0,
            }}>
                <Typography sx={{ color: '#fff', fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', fontFamily: "'Manrope', sans-serif" }}>
                    STEP 0{activeStep + 1}
                </Typography>
            </Box>
            <Stack direction="row" spacing={3} sx={{ ml: 0.5 }}>
                {STEPS.map((step, idx) => (
                    <Typography key={step.key} sx={{
                        fontSize: 14, fontWeight: idx === activeStep ? 800 : 600,
                        color: idx === activeStep ? DS.primary : DS.outline,
                        borderBottom: `2px solid ${idx === activeStep ? DS.primary : 'transparent'}`,
                        pb: 0.5,
                        letterSpacing: '-0.01em',
                        fontFamily: "'Manrope', sans-serif",
                        transition: 'color 0.15s',
                    }}>
                        {step.label}
                    </Typography>
                ))}
            </Stack>
        </Box>
    </Box>
);

// ─── Booking identification card (staff only) ─────────────────────────────────
const BookingCard = ({ clients, selectedClient, onClientChange, availableCarriers, selectedCarrier, onCarrierChange }) => (
    <Box sx={{ ...CARD_SX, p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
            <BusinessCenterIcon sx={{ color: DS.primary, fontSize: 20 }} />
            <Typography sx={{ ...LABEL_SX, mb: 0, fontSize: 11 }}>Booking Identification</Typography>
        </Box>
        <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
                <Typography sx={LABEL_SX}>Client Account</Typography>
                <FormControl fullWidth size="small">
                    <Select
                        value={selectedClient || ''}
                        onChange={(e) => onClientChange(e.target.value)}
                        displayEmpty
                        sx={{
                            bgcolor: DS.surfaceLow, borderRadius: '8px', fontSize: 13,
                            fontFamily: "'Manrope', sans-serif",
                            '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
                            '&:hover .MuiOutlinedInput-notchedOutline': { border: 'none' },
                            '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: DS.primary, borderWidth: 2 },
                        }}
                        MenuProps={{ PaperProps: { sx: { maxHeight: 280, borderRadius: '10px' } } }}
                    >
                        <MenuItem value="" sx={{ fontStyle: 'italic', color: DS.outline, fontSize: 13 }}>
                            Self (no override)
                        </MenuItem>
                        {clients.map(c => (
                            <MenuItem key={c.id} value={c.id} sx={{ fontSize: 13, fontFamily: "'Manrope', sans-serif" }}>
                                {c.name || c.email}{c.organization ? ` · ${c.organization.name}` : ''}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
            </Grid>
            <Grid item xs={12} md={6}>
                <Typography sx={LABEL_SX}>{selectedClient ? 'Assigned Network' : 'Preferred Carrier'}</Typography>
                <FormControl fullWidth size="small">
                    <Select
                        value={selectedCarrier || 'DGR'}
                        onChange={(e) => onCarrierChange(e.target.value)}
                        disabled={Boolean(selectedClient)}
                        sx={{
                            bgcolor: DS.surfaceLow, borderRadius: '8px', fontSize: 13,
                            fontFamily: "'Manrope', sans-serif",
                            '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
                            '&:hover .MuiOutlinedInput-notchedOutline': { border: 'none' },
                            '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: DS.primary, borderWidth: 2 },
                        }}
                    >
                        {availableCarriers.map(c => (
                            <MenuItem key={c.code} value={c.code} disabled={!c.active} sx={{ fontSize: 13, fontFamily: "'Manrope', sans-serif" }}>
                                {c.code === 'MANUAL' ? 'Manual Shipment' : c.name}{c.serviceName ? ` / ${c.serviceName}` : ''}{!c.active ? ' (Suspended)' : ''}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
            </Grid>
        </Grid>
    </Box>
);

// ─── Right summary panel ──────────────────────────────────────────────────────
const SummaryPanel = ({
    sender, receiver, totals, billableWeight, declaredCurrency, billingCurrency,
    shipmentType, selectedCarrier,
    selectedService, availableServices, onSelectService,
    availableOptionalServices, selectedOptionalServiceCodes,
    optionalServicesTotal, estimatedShipmentTotal,
    activeStep, loading, fetchingRates, isStaff,
    issues = [],
    issueLog = [],
    onDownloadIssueLog,
    onIssueClick,
    onBack, onNext, onSubmit,
}) => {
    const isReview   = activeStep === STEPS.length - 1;
    const hasPricing = Number(selectedService?.totalPrice || 0) > 0;
    const showMarkup = isStaff && selectedService?.basePrice != null;
    const tipText    = STEP_TIPS[STEPS[activeStep]?.key] || '';
    const errorsCount = issues.filter(issue => issue.severity === 'error').length;
    const warningsCount = issues.filter(issue => issue.severity === 'warning').length;
    const issuesByStep = issues.reduce((acc, issue) => {
        acc[issue.step] = acc[issue.step] || [];
        acc[issue.step].push(issue);
        return acc;
    }, {});
    const readinessTip = errorsCount > 0
        ? `Fix ${errorsCount} blocking issue${errorsCount > 1 ? 's' : ''} before dispatch.`
        : warningsCount > 0
            ? `Review ${warningsCount} warning${warningsCount > 1 ? 's' : ''} before final submission.`
            : tipText;
    const selectedOptionalServices = (availableOptionalServices || []).filter(
        service => (selectedOptionalServiceCodes || []).includes(service.serviceCode)
    );


    return (
        <Box sx={{ position: 'sticky', top: 88 }}>
            {/* Main summary card */}
            <Box sx={{ ...CARD_SX, p: 3, mb: 2 }}>
                {/* Header */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                    <Typography sx={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: DS.onSurface, fontFamily: "'Manrope', sans-serif" }}>
                        Live Summary
                    </Typography>
                    <Box sx={{ px: 1.5, py: 0.35, bgcolor: DS.tertiaryContainer, borderRadius: '99px' }}>
                        <Typography sx={{ fontSize: 9, fontWeight: 800, color: DS.onTertiaryContainer, letterSpacing: '0.08em', fontFamily: "'Manrope', sans-serif" }}>
                            DRAFT
                        </Typography>
                    </Box>
                </Box>

                {/* Origin → Destination connector */}
                <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', pt: 0.5 }}>
                        <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: DS.primary, boxShadow: `0 0 0 4px rgba(0,80,212,0.12)`, flexShrink: 0 }} />
                        <Box sx={{ width: 0, height: 36, borderLeft: '2px dashed', borderColor: DS.outlineVariant, my: 0.75 }} />
                        <Box sx={{ width: 12, height: 12, borderRadius: '50%', border: `2px solid ${DS.outlineVariant}`, flexShrink: 0 }} />
                    </Box>
                    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: 76 }}>
                        <Box>
                            <Typography sx={{ ...LABEL_SX, mb: 0.25 }}>Origin</Typography>
                            <Typography sx={{ fontSize: 13, fontWeight: 700, color: DS.onSurface, lineHeight: 1.3, fontFamily: "'Manrope', sans-serif" }}>
                                {sender?.countryCode || '—'}
                            </Typography>
                            <Typography sx={{ fontSize: 11, color: DS.outline, fontFamily: "'Manrope', sans-serif" }}>
                                {sender?.company || sender?.contactPerson || '—'}
                            </Typography>
                        </Box>
                        <Box>
                            <Typography sx={{ ...LABEL_SX, mb: 0.25 }}>Destination</Typography>
                            <Typography sx={{ fontSize: 13, fontWeight: 700, color: DS.onSurface, lineHeight: 1.3, fontFamily: "'Manrope', sans-serif" }}>
                                {receiver?.countryCode || '—'}
                            </Typography>
                            <Typography sx={{ fontSize: 11, color: DS.outline, fontFamily: "'Manrope', sans-serif" }}>
                                {receiver?.company || receiver?.contactPerson || 'Pending consignee'}
                            </Typography>
                        </Box>
                    </Box>
                </Box>

                <Divider sx={{ my: 2.5, borderColor: DS.surfaceContainer }} />

                {/* Shipment specs */}
                <Stack spacing={1.5} sx={{ mb: 2.5 }}>
                    {[
                        { label: 'Chargeable Weight', value: `${billableWeight.toFixed(2)} kg` },
                        { label: 'Pieces',             value: totals.pieces },
                        { label: 'Shipment Type',      value: shipmentType === 'documents' ? 'Document Express' : 'Standard Package' },
                        { label: 'Network',            value: `${selectedCarrier} Network` },
                    ].map(({ label, value }) => (
                        <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography sx={{ fontSize: 12, color: DS.outline, fontWeight: 500, fontFamily: "'Manrope', sans-serif" }}>{label}</Typography>
                            <Typography sx={{ fontSize: 12, fontWeight: 700, color: DS.onSurface, fontFamily: "'Manrope', sans-serif" }}>{value}</Typography>
                        </Box>
                    ))}
                </Stack>

                {/* Service selector (billing + review) */}
                {availableServices.length > 0 && (
                    <>
                        <Divider sx={{ mb: 2, borderColor: DS.surfaceContainer }} />
                        <Typography sx={{ ...LABEL_SX, mb: 1.5 }}>Select Service</Typography>
                        <Stack spacing={1} sx={{ mb: 2 }}>
                            {availableServices.map(s => {
                                const active = s.serviceCode === selectedService?.serviceCode;
                                return (
                                    <Box
                                        key={s.serviceCode}
                                        onClick={() => onSelectService(s)}
                                        sx={{
                                            p: 1.5, borderRadius: '10px', cursor: 'pointer',
                                            border: `1.5px solid ${active ? DS.primary : 'rgba(169,174,177,0.25)'}`,
                                            bgcolor: active ? `rgba(0,80,212,0.05)` : 'transparent',
                                            transition: 'all 0.12s',
                                            '&:hover': { borderColor: DS.primary, bgcolor: 'rgba(0,80,212,0.03)' },
                                        }}
                                    >
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <Typography sx={{ fontSize: 12, fontWeight: active ? 800 : 600, color: active ? DS.primary : DS.onSurface, fontFamily: "'Manrope', sans-serif" }}>
                                                {s.serviceName}
                                            </Typography>
                                            <Typography sx={{ fontSize: 12, fontWeight: 800, color: active ? DS.primary : DS.onSurface, fontFamily: "'Manrope', sans-serif" }}>
                                                {Number(s.totalPrice).toFixed(3)}
                                            </Typography>
                                        </Box>
                                        {s.deliveryDate && (
                                            <Typography sx={{ fontSize: 10, color: DS.outline, mt: 0.25, fontFamily: "'Manrope', sans-serif" }}>
                                                Est. {new Date(s.deliveryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                                            </Typography>
                                        )}
                                    </Box>
                                );
                            })}
                        </Stack>
                    </>
                )}

                {/* Price breakdown */}
                {hasPricing && (
                    <>
                        <Divider sx={{ mb: 2, borderColor: DS.surfaceContainer }} />
                        <Stack spacing={1.25} sx={{ mb: 2.5 }}>
                            {showMarkup && (
                                <>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <Typography sx={{ fontSize: 12, color: DS.outline, fontFamily: "'Manrope', sans-serif" }}>Carrier Base Rate</Typography>
                                        <Typography sx={{ fontSize: 12, fontWeight: 700, fontFamily: "'Manrope', sans-serif" }}>{Number(selectedService.basePrice).toFixed(3)} {billingCurrency}</Typography>
                                    </Box>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <Typography sx={{ fontSize: 12, color: DS.outline, fontFamily: "'Manrope', sans-serif" }}>Markup</Typography>
                                        <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#d97706', fontFamily: "'Manrope', sans-serif" }}>+{Number(selectedService.markupAmount || 0).toFixed(3)} {billingCurrency}</Typography>
                                    </Box>
                                    {selectedService.pricingPolicySource && (
                                        <Typography sx={{ fontSize: 10, color: DS.outlineVariant, fontFamily: "'Manrope', sans-serif" }}>
                                            Policy: {selectedService.pricingPolicySource}
                                        </Typography>
                                    )}
                                    <Divider sx={{ borderColor: DS.surfaceContainer }} />
                                </>
                            )}
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography sx={{ fontSize: 12, color: DS.outline, fontFamily: "'Manrope', sans-serif" }}>Freight Rate</Typography>
                                <Typography sx={{ fontSize: 12, fontWeight: 700, fontFamily: "'Manrope', sans-serif" }}>{Number(selectedService.totalPrice || 0).toFixed(3)} {billingCurrency}</Typography>
                            </Box>
                            {optionalServicesTotal > 0 && (
                                <>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <Typography sx={{ fontSize: 12, color: DS.outline, fontFamily: "'Manrope', sans-serif" }}>Optional Services</Typography>
                                        <Typography sx={{ fontSize: 12, fontWeight: 700, fontFamily: "'Manrope', sans-serif" }}>+{optionalServicesTotal.toFixed(3)} {billingCurrency}</Typography>
                                    </Box>
                                    {selectedOptionalServices.map((service) => (
                                        <Box key={`summary-opt-${service.serviceCode}`} sx={{ pl: 1.25, borderLeft: `2px solid ${DS.surfaceContainer}` }}>
                                            <Typography sx={{ fontSize: 10, color: DS.outline, fontFamily: "'Manrope', sans-serif" }}>
                                                {showMarkup
                                                    ? `${service.serviceName}: ${Number(service.carrierAmount || service.totalPrice || 0).toFixed(3)} + ${Number(service.markupAmount || 0).toFixed(3)} = ${Number(service.totalPrice || 0).toFixed(3)} ${billingCurrency}`
                                                    : `${service.serviceName}: ${Number(service.totalPrice || 0).toFixed(3)} ${billingCurrency}`
                                                }
                                            </Typography>
                                        </Box>
                                    ))}
                                </>
                            )}
                        </Stack>

                        <Stack spacing={0.5} sx={{ mb: 2 }}>
                            <Typography sx={{ fontSize: 11, color: DS.outline, fontFamily: "'Manrope', sans-serif" }}>
                                Declared Currency: <strong>{declaredCurrency}</strong>
                            </Typography>
                            <Typography sx={{ fontSize: 11, color: DS.outline, fontFamily: "'Manrope', sans-serif" }}>
                                Billing Currency: <strong>{billingCurrency}</strong>
                            </Typography>
                        </Stack>

                        {/* Total */}
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', mb: 3 }}>
                            <Typography sx={{ ...LABEL_SX, mb: 0, letterSpacing: '0.12em' }}>Estimated Total</Typography>
                            <Typography sx={{ fontSize: 24, fontWeight: 900, color: DS.onSurface, letterSpacing: '-0.04em', lineHeight: 1, fontFamily: "'Manrope', sans-serif" }}>
                                {estimatedShipmentTotal.toFixed(3)}
                                <Box component="span" sx={{ fontSize: 12, fontWeight: 700, color: DS.outline, ml: 0.5 }}>{billingCurrency}</Box>
                            </Typography>
                        </Box>
                    </>
                )}

                {fetchingRates && <LinearProgress sx={{ mb: 2, borderRadius: 2, height: 3 }} />}

                {/* CTA button */}
                <Button
                    fullWidth
                    onClick={isReview ? onSubmit : onNext}
                    disabled={loading || fetchingRates}
                    sx={{
                        background: 'linear-gradient(to right, #3b82f6, #1d4ed8)',
                        color: '#fff',
                        py: 1.75,
                        borderRadius: '12px',
                        fontWeight: 800,
                        fontSize: 14,
                        letterSpacing: '-0.01em',
                        textTransform: 'none',
                        fontFamily: "'Manrope', sans-serif",
                        boxShadow: '0 8px 20px rgba(37,99,235,0.25)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 1,
                        '&:hover': { background: 'linear-gradient(to right, #2563eb, #1e40af)' },
                        '&:active': { transform: 'scale(0.98)' },
                        '&.Mui-disabled': { background: DS.outlineVariant, color: '#fff' },
                    }}
                >
                    {loading || fetchingRates
                        ? <CircularProgress size={18} sx={{ color: '#fff' }} />
                        : <>
                            {isReview ? 'Authorize & Dispatch' : `Continue to ${STEPS[activeStep + 1]?.label}`}
                            <ArrowForwardIcon sx={{ fontSize: 18 }} />
                          </>
                    }
                </Button>

                {/* Back link */}
                {activeStep > 0 && (
                    <Button
                        fullWidth
                        onClick={onBack}
                        disabled={loading}
                        startIcon={<ArrowBackIcon sx={{ fontSize: 16 }} />}
                        sx={{
                            mt: 1.5, color: DS.outline, fontWeight: 700, fontSize: 13,
                            textTransform: 'none', fontFamily: "'Manrope', sans-serif",
                            '&:hover': { bgcolor: DS.surfaceLow },
                        }}
                    >
                        Previous Step
                    </Button>
                )}
            </Box>

            {(issues.length > 0) && (
                <Box sx={{ ...CARD_SX, p: 2.5, mb: 2 }}>
                    <Typography sx={{ ...LABEL_SX, mb: 1.5 }}>Shipment Issues</Typography>
                    <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                        <Box sx={{ px: 1.25, py: 0.5, borderRadius: '99px', bgcolor: 'rgba(211,47,47,0.1)', color: '#b3261e', fontSize: 11, fontWeight: 800 }}>
                            {errorsCount} blocking
                        </Box>
                        <Box sx={{ px: 1.25, py: 0.5, borderRadius: '99px', bgcolor: 'rgba(237,108,2,0.1)', color: '#b45309', fontSize: 11, fontWeight: 800 }}>
                            {warningsCount} warnings
                        </Box>
                    </Stack>

                    <Stack spacing={1.25}>
                        {Object.entries(issuesByStep).map(([step, grouped]) => (
                            <Box key={step}>
                                <Typography sx={{ fontSize: 11, fontWeight: 800, color: DS.outline, mb: 0.75 }}>
                                    {step}
                                </Typography>
                                <Stack spacing={0.75}>
                                    {grouped.map((issue) => (
                                        <Box
                                            key={issue.id}
                                            onClick={() => onIssueClick?.(issue)}
                                            sx={{
                                                p: 1.25,
                                                borderRadius: 2,
                                                cursor: issue.fieldPath ? 'pointer' : 'default',
                                                bgcolor: issue.severity === 'error' ? 'rgba(211,47,47,0.06)' : 'rgba(237,108,2,0.08)',
                                                border: '1px solid',
                                                borderColor: issue.severity === 'error' ? 'rgba(211,47,47,0.2)' : 'rgba(237,108,2,0.24)',
                                            }}
                                        >
                                            <Stack direction="row" spacing={1} alignItems="flex-start">
                                                {issue.severity === 'error'
                                                    ? <ErrorOutlineIcon sx={{ fontSize: 16, color: '#b3261e', mt: 0.25 }} />
                                                    : <WarningAmberIcon sx={{ fontSize: 16, color: '#b45309', mt: 0.25 }} />}
                                                <Box>
                                                    <Typography sx={{ fontSize: 12, fontWeight: 700, color: DS.onSurface }}>
                                                        {issue.title}
                                                    </Typography>
                                                    <Typography sx={{ fontSize: 11, color: DS.outline, lineHeight: 1.5 }}>
                                                        {issue.action || issue.message}
                                                    </Typography>
                                                </Box>
                                            </Stack>
                                        </Box>
                                    ))}
                                </Stack>
                            </Box>
                        ))}
                    </Stack>
                </Box>
            )}

            <Box sx={{ ...CARD_SX, p: 2.5, mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                    <Typography sx={{ ...LABEL_SX, mb: 0 }}>Issue Log</Typography>
                    <Button
                        size="small"
                        onClick={onDownloadIssueLog}
                        sx={{ textTransform: 'none', fontSize: 11, minWidth: 0, px: 1 }}
                    >
                        Export JSON
                    </Button>
                </Box>
                {issueLog.length === 0 ? (
                    <Typography sx={{ fontSize: 12, color: DS.outline }}>
                        No issue events recorded yet for this session.
                    </Typography>
                ) : (
                    <Stack spacing={0.75}>
                        {issueLog.slice(0, 5).map((entry) => (
                            <Box key={entry.id} sx={{ p: 1, borderRadius: 2, bgcolor: DS.surfaceLow }}>
                                <Typography sx={{ fontSize: 11, fontWeight: 700, color: DS.onSurface }}>
                                    {entry.event} · {entry.blockingCount} blocking / {entry.warningCount} warnings
                                </Typography>
                                <Typography sx={{ fontSize: 10, color: DS.outline }}>
                                    {new Date(entry.timestamp).toLocaleString('en-GB')} · {entry.step || 'N/A'} · {entry.carrierCode || 'N/A'}
                                </Typography>
                            </Box>
                        ))}
                    </Stack>
                )}
            </Box>

            {/* Tip card */}
            <Box sx={{
                bgcolor: DS.primary, borderRadius: '12px', p: 3,
                position: 'relative', overflow: 'hidden',
            }}>
                <Box sx={{ position: 'absolute', right: -16, bottom: -16, opacity: 0.08 }}>
                    <LightbulbIcon sx={{ fontSize: 100 }} />
                </Box>
                <Typography sx={{ color: '#fff', fontWeight: 800, fontSize: 13, mb: 1.25, display: 'flex', alignItems: 'center', gap: 0.75, fontFamily: "'Manrope', sans-serif" }}>
                    <LightbulbIcon sx={{ fontSize: 16 }} /> Quick Tip
                </Typography>
                <Typography sx={{ color: 'rgba(255,255,255,0.82)', fontSize: 12, lineHeight: 1.65, fontFamily: "'Manrope', sans-serif" }}>
                    {readinessTip}
                </Typography>
            </Box>
        </Box>
    );
};

// ─── Review content ───────────────────────────────────────────────────────────
const ReviewContent = ({ sender, receiver, parcels, items, declaredCurrency, billingCurrency }) => {
    const s = formatPartyAddress(sender);
    const r = formatPartyAddress(receiver);
    return (
        <Stack spacing={3}>
            <Grid container spacing={3}>
                {[
                    { title: 'SHIPPING ORIGIN', data: s, color: DS.primary },
                    { title: 'DESTINATION',     data: r, color: DS.secondary },
                ].map(({ title, data, color }) => (
                    <Grid item xs={12} md={6} key={title}>
                        <Box sx={{ ...CARD_SX, p: 3, height: '100%' }}>
                            <Typography sx={{ ...LABEL_SX, color, mb: 1 }}>{title}</Typography>
                            <Typography sx={{ fontSize: 16, fontWeight: 800, color: DS.onSurface, mb: 0.25, fontFamily: "'Manrope', sans-serif" }}>
                                {data.company || 'Private Party'}
                            </Typography>
                            <Typography sx={{ fontSize: 13, color: DS.outline, mb: 2, fontFamily: "'Manrope', sans-serif" }}>{data.contact}</Typography>
                            <Stack spacing={0.75}>
                                <Typography sx={{ fontSize: 13, fontWeight: 600, fontFamily: "'Manrope', sans-serif" }}>{data.building} {data.street}</Typography>
                                <Typography sx={{ fontSize: 13, color: DS.outline, fontFamily: "'Manrope', sans-serif" }}>
                                    {data.city}{data.state ? `, ${data.state}` : ''} {data.postalCode}
                                </Typography>
                                <Typography sx={{ fontSize: 13, fontWeight: 700, fontFamily: "'Manrope', sans-serif" }}>{data.phone}</Typography>
                            </Stack>
                        </Box>
                    </Grid>
                ))}
            </Grid>

            <Box sx={{ ...CARD_SX, p: 2.5 }}>
                <Typography sx={{ ...LABEL_SX, mb: 1 }}>Currency Declaration</Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <Typography sx={{ fontSize: 13, fontWeight: 700, fontFamily: "'Manrope', sans-serif" }}>
                        Declared Currency: {declaredCurrency}
                    </Typography>
                    <Typography sx={{ fontSize: 13, fontWeight: 700, color: DS.primary, fontFamily: "'Manrope', sans-serif" }}>
                        Billing Currency: {billingCurrency}
                    </Typography>
                </Stack>
            </Box>

            <Box sx={{ ...CARD_SX, overflow: 'hidden' }}>
                <TableContainer>
                    <Table size="small">
                        <TableHead sx={{ bgcolor: DS.surfaceLow }}>
                            <TableRow>
                                {['DESCRIPTION','DIMENSIONS','WEIGHT','QTY'].map(h => (
                                    <TableCell key={h} sx={{ ...LABEL_SX, py: 1.5, display: 'table-cell' }}>{h}</TableCell>
                                ))}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {parcels.map((p, i) => (
                                <TableRow key={i} sx={{ '&:last-child td': { border: 0 } }}>
                                    <TableCell sx={{ fontWeight: 700, fontSize: 13, fontFamily: "'Manrope', sans-serif" }}>{p.description || `Package ${i + 1}`}</TableCell>
                                    <TableCell sx={{ fontSize: 12, color: DS.outline, fontFamily: "'Manrope', sans-serif" }}>{p.length}×{p.width}×{p.height} cm</TableCell>
                                    <TableCell sx={{ fontSize: 13, fontFamily: "'Manrope', sans-serif" }}>{p.weight} kg</TableCell>
                                    <TableCell sx={{ fontSize: 13, fontFamily: "'Manrope', sans-serif" }}>{p.quantity || 1}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Box>

            {items?.length > 0 && (
                <Box sx={{ ...CARD_SX, overflow: 'hidden' }}>
                    <TableContainer>
                        <Table size="small">
                            <TableHead sx={{ bgcolor: DS.surfaceLow }}>
                                <TableRow>
                                    {['ITEM','HS CODE','ORIGIN','QTY','VALUE'].map(h => (
                                        <TableCell key={h} sx={{ ...LABEL_SX, py: 1.5, display: 'table-cell' }}>{h}</TableCell>
                                    ))}
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {items.map((item, i) => (
                                    <TableRow key={i} sx={{ '&:last-child td': { border: 0 } }}>
                                        <TableCell sx={{ fontWeight: 700, fontSize: 13, fontFamily: "'Manrope', sans-serif" }}>{item.description}</TableCell>
                                        <TableCell sx={{ fontSize: 12, color: DS.outline, fontFamily: "'Manrope', sans-serif" }}>{item.hsCode || '—'}</TableCell>
                                        <TableCell sx={{ fontSize: 13, fontFamily: "'Manrope', sans-serif" }}>{item.countryOfOrigin || '—'}</TableCell>
                                        <TableCell sx={{ fontSize: 13, fontFamily: "'Manrope', sans-serif" }}>{item.quantity}</TableCell>
                                        <TableCell sx={{ fontSize: 13, fontWeight: 700, color: DS.primary, fontFamily: "'Manrope', sans-serif" }}>
                                            {declaredCurrency} {Number(item.declaredValue || 0).toFixed(3)}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Box>
            )}
        </Stack>
    );
};

// ─── Success screen ───────────────────────────────────────────────────────────
const SuccessScreen = ({ createdShipment, selectedCarrier, onView, onNew }) => (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', textAlign: 'center', p: 4 }}>
        <Box sx={{ width: 72, height: 72, borderRadius: '50%', bgcolor: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 3, boxShadow: '0 12px 32px rgba(22,163,74,0.25)' }}>
            <CheckCircleIcon sx={{ fontSize: 40, color: '#fff' }} />
        </Box>
        <Typography sx={{ fontSize: 32, fontWeight: 900, letterSpacing: '-0.03em', color: DS.onSurface, mb: 1, fontFamily: "'Manrope', sans-serif" }}>
            Shipment Dispatched
        </Typography>
        <Typography sx={{ fontSize: 13, color: DS.outline, mb: 0.5, fontWeight: 600, fontFamily: "'Manrope', sans-serif" }}>Tracking Number</Typography>
        <Typography sx={{ fontSize: 22, fontWeight: 900, color: DS.primary, mb: 1, letterSpacing: '-0.02em', fontFamily: "'Manrope', sans-serif" }}>
            {createdShipment?.trackingNumber || 'PENDING'}
        </Typography>
        <Typography sx={{ fontSize: 14, color: DS.outline, mb: 5, maxWidth: 460, lineHeight: 1.7, fontFamily: "'Manrope', sans-serif" }}>
            {selectedCarrier === 'MANUAL'
                ? 'Manual Shipment created. Status can be managed from the shipment dashboard.'
                : `Registered with the ${selectedCarrier} network. Labels and documents are ready in the shipment dashboard.`}
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <Button
                variant="contained" size="large" onClick={onView}
                sx={{ py: 1.5, px: 5, borderRadius: '12px', fontWeight: 800, textTransform: 'none', bgcolor: DS.primary, fontFamily: "'Manrope', sans-serif", '&:hover': { bgcolor: '#003eaa' } }}
            >
                View Shipment
            </Button>
            <Button
                variant="outlined" size="large" onClick={onNew}
                sx={{ py: 1.5, px: 5, borderRadius: '12px', fontWeight: 800, textTransform: 'none', borderColor: DS.outlineVariant, color: DS.onSurface, fontFamily: "'Manrope', sans-serif" }}
            >
                New Shipment
            </Button>
        </Stack>
    </Box>
);

// ─── Default address ──────────────────────────────────────────────────────────
const initialAddress = {
    company: '', contactPerson: '', phone: '', phoneCountryCode: '+965', email: '',
    streetLines: '', city: '', state: '', area: '', postalCode: '', countryCode: 'KW',
    buildingName: '', unitNumber: '', landmark: '',
    vatNumber: '', eoriNumber: '', taxId: '', reference: '',
    validated: false,
};

// ─── Main Wizard ──────────────────────────────────────────────────────────────
const ShipmentWizardV2 = () => {
    const navigate = useNavigate();
    const { trackingNumber: editTrackingNumber } = useParams();
    const isEditMode = Boolean(editTrackingNumber);
    const { enqueueSnackbar } = useSnackbar();
    const { user, isStaff, refreshUser } = useAuth();

    const [activeStep,    setActiveStep]    = useState(0);
    const [loading,       setLoading]       = useState(false);
    const [fetchingRates, setFetchingRates] = useState(false);

    // Form state
    const [sender,   setSender]   = useState({ ...initialAddress });
    const [receiver, setReceiver] = useState({ ...initialAddress });
    const [parcels,  setParcels]  = useState([{ description: 'Package 01', weight: 1, length: 10, width: 10, height: 10, quantity: 1 }]);
    const [items,    setItems]    = useState([{ description: 'General Cargo', quantity: 1, declaredValue: 10, currency: 'KWD', weight: 1, hsCode: '1234.56', countryOfOrigin: 'KW' }]);

    const [pickupRequired,  setPickupRequired]  = useState(false);
    const [dangerousGoods,  setDangerousGoods]  = useState({ contains: false });
    const [packagingType,   setPackagingType]   = useState('user');
    const [exportReason,    setExportReason]    = useState('permanent');
    const [invoiceRemarks,  setInvoiceRemarks]  = useState('');
    const [incoterm,        setIncoterm]        = useState('DAP');
    const [gstPaid,         setGstPaid]         = useState(false);
    const [payerOfVat,      setPayerOfVat]      = useState('receiver');
    const [shipperAccount,  setShipperAccount]  = useState('');
    const [labelFormat,     setLabelFormat]     = useState('pdf');
    const [signatureName,   setSignatureName]   = useState('');
    const [signatureTitle,  setSignatureTitle]  = useState('');
    const [palletCount,     setPalletCount]     = useState('');
    const [packageMarks,    setPackageMarks]    = useState('');
    const [shipmentType,    setShipmentType]    = useState('package');
    const [plannedDate,     setPlannedDate]     = useState(new Date().toISOString().split('T')[0]);
    const [currency,        setCurrency]        = useState('KWD');
    const [billingCurrency, setBillingCurrency] = useState('KWD');
    const [insuredValue,    setInsuredValue]    = useState('');
    const [errors,          setErrors]          = useState({});
    const [wizardIssues,    setWizardIssues]    = useState([]);
    const [apiIssues,       setApiIssues]       = useState([]);
    const [issueLog,        setIssueLog]        = useState([]);

    const [selectedService,               setSelectedService]               = useState({ serviceName: '', serviceCode: '', totalPrice: '0', currency: 'KWD' });
    const [availableServices,             setAvailableServices]             = useState([]);
    const [availableOptionalServices,     setAvailableOptionalServices]     = useState([]);
    const [selectedOptionalServiceCodes,  setSelectedOptionalServiceCodes]  = useState([]);

    const [availableCarriers, setAvailableCarriers] = useState([{ code: 'DGR', name: 'DGR', active: true }]);
    const [selectedCarrier,   setSelectedCarrier]   = useState('DGR');
    const [clients,           setClients]           = useState([]);
    const [selectedClient,    setSelectedClient]    = useState('');
    const [createdShipment,   setCreatedShipment]   = useState(null);

    const selectedCarrierCapabilities = useMemo(() => {
        const fallback = DEFAULT_CARRIER_CAPABILITIES[selectedCarrier] || DEFAULT_CARRIER_CAPABILITIES.DGR;
        const carrierMeta = availableCarriers.find((carrier) => carrier.code === selectedCarrier) || {};
        return {
            carrierCode: selectedCarrier,
            requiredFields: carrierMeta.requiredFields || fallback.requiredFields || { sender: [], receiver: [] },
            optionalServices: carrierMeta.optionalServices || fallback.optionalServices || [],
            dangerousGoods: carrierMeta.dangerousGoods || fallback.dangerousGoods || { supported: false, templates: [] },
            packagingOptions: carrierMeta.packagingOptions || fallback.packagingOptions || [{ value: 'user', label: 'My Own Packaging' }],
        };
    }, [selectedCarrier, availableCarriers]);

    const totals = useMemo(() => {
        let pieces = 0, actualWeight = 0, volumetricWeight = 0, declaredValue = 0;
        parcels.forEach(p => {
            const qty = Number(p.quantity || 1);
            pieces           += qty;
            actualWeight     += (Number(p.weight) || 0) * qty;
            volumetricWeight += ((Number(p.length) * Number(p.width) * Number(p.height)) / VOLUME_FACTOR) * qty;
        });
        items.forEach(i => { declaredValue += (Number(i.declaredValue) || 0) * (Number(i.quantity) || 1); });
        return { pieces, actualWeight, volumetricWeight, declaredValue };
    }, [parcels, items]);

    const billableWeight        = Math.max(totals.actualWeight, totals.volumetricWeight);
    const optionalServicesTotal = selectedOptionalServiceCodes.reduce((acc, code) => {
        const s = availableOptionalServices.find(os => os.serviceCode === code);
        return acc + (Number(s?.totalPrice) || 0);
    }, 0);
    const estimatedShipmentTotal = Number(selectedService.totalPrice || 0) + optionalServicesTotal;
    const insuranceServiceCode = useMemo(() => {
        const selectedServiceInsurance = (availableOptionalServices || []).find((service) => {
            const serviceName = String(service.serviceName || '').toLowerCase();
            const serviceCode = String(service.serviceCode || '').toUpperCase();
            return serviceCode === 'II' || serviceName.includes('insur');
        });
        const carrierInsurance = (selectedCarrierCapabilities.optionalServices || []).find((service) =>
            Array.isArray(service.requires) && service.requires.includes('insuredValue')
        );
        return selectedServiceInsurance?.serviceCode || carrierInsurance?.code || 'II';
    }, [availableOptionalServices, selectedCarrierCapabilities]);
    const combinedIssues = useMemo(
        () => [...wizardIssues, ...apiIssues],
        [wizardIssues, apiIssues]
    );

    const appendIssueLog = ({ event, issues = combinedIssues, stepKey = STEPS[activeStep]?.key }) => {
        setIssueLog((prev) => {
            const next = [
                buildIssueLogEntry({
                    event,
                    issues,
                    stepKey,
                    carrierCode: selectedCarrier,
                }),
                ...prev,
            ].slice(0, ISSUE_LOG_LIMIT);
            return next;
        });
    };

    const handleDownloadIssueLog = () => {
        const payload = {
            exportedAt: new Date().toISOString(),
            carrierCode: selectedCarrier,
            entries: issueLog,
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `shipment-wizard-issue-log-${Date.now()}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    };

    useEffect(() => {
        try {
            const raw = localStorage.getItem(ISSUE_LOG_STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) setIssueLog(parsed.slice(0, ISSUE_LOG_LIMIT));
        } catch {
            // ignore local storage parsing errors
        }
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem(ISSUE_LOG_STORAGE_KEY, JSON.stringify(issueLog.slice(0, ISSUE_LOG_LIMIT)));
        } catch {
            // ignore local storage write errors
        }
    }, [issueLog]);

    useEffect(() => {
        const load = async () => {
            try {
                const res = await shipmentService.getAvailableCarriers();
                if (res.success && res.data?.length) setAvailableCarriers(res.data);
            } catch { /* ignore */ }
            if (user?.addresses?.length) {
                const def = user.addresses.find(a => a.isDefault) || user.addresses[0];
                setSender(prev => ({ ...prev, ...def }));
            }
        };
        load();
    }, [user]);

    useEffect(() => {
        if (isStaff) {
            userService.getUsers('org').then(res => setClients(res.data || [])).catch(() => {});
        }
    }, [isStaff]);

    useEffect(() => {
        if (!isStaff) return;

        shipmentService.getAvailableCarriers(selectedClient || undefined)
            .then(res => {
                if (res.success && res.data?.length) {
                    setAvailableCarriers(res.data);
                    setSelectedCarrier(res.data[0].code);
                }
            })
            .catch(() => {});
    }, [isStaff, selectedClient]);

    const handleCarrierChange = (code) => {
        setSelectedCarrier(code);
        setSelectedService({ serviceName: '', serviceCode: '', totalPrice: '0', currency });
        setAvailableServices([]);
        setAvailableOptionalServices([]);
        setSelectedOptionalServiceCodes([]);
        setApiIssues([]);
        appendIssueLog({ event: 'carrier_changed', issues: [] });
        if (code === 'MANUAL') {
            enqueueSnackbar('Switched to Manual Shipment', { variant: 'info' });
        } else {
            enqueueSnackbar(`Switched to ${code} network`, { variant: 'info' });
        }
    };

    const handleSelectService = (s) => {
        setSelectedService({
            serviceName:         s.serviceName,
            serviceCode:         s.serviceCode,
            totalPrice:          s.totalPrice.toString(),
            currency:            s.currency,
            basePrice:           s.basePrice,
            markupAmount:        s.markupAmount,
            pricingPolicySource: s.pricingPolicySource,
            deliveryDate:        s.deliveryDate,
        });
        setAvailableOptionalServices(s.optionalServices || []);
        setBillingCurrency(s.billingCurrency || s.currency || 'KWD');
        setApiIssues([]);
    };

    const buildValidationIssues = (step) => {
        const issues = [];
        if (step === 0) {
            const parties = [
                { key: 'sender', value: sender, section: 'Shipper address', label: 'Shipper' },
                { key: 'receiver', value: receiver, section: 'Consignee address', label: 'Receiver' },
            ];
            parties.forEach(({ key, value, section, label }) => {
                const required = selectedCarrierCapabilities.requiredFields?.[key] || [];
                required.forEach((field) => {
                    const config = PARTY_FIELD_CONFIG[field];
                    if (!config) return;
                    const fieldValue = field === 'streetLines'
                        ? (value.streetLines?.[0] || '')
                        : (value[field] || '');
                    if (String(fieldValue).trim()) return;
                    const errorKey = `${key}${config.errorSuffix}`;
                    issues.push(buildIssue({
                        id: `${key}.${field}.required`,
                        step: 'Setup',
                        section,
                        fieldPath: `${key}.${field}`,
                        errorKey,
                        title: `${label} ${config.label} is required`,
                        message: `The selected carrier requires the ${label.toLowerCase()} ${config.label}.`,
                        action: config.action,
                        source: 'client',
                        carrierCode: selectedCarrier,
                    }));
                });
            });
        }
        if (step === 1) {
            parcels.forEach((parcel, index) => {
                if (!Number(parcel.weight || 0)) {
                    issues.push(buildIssue({
                        id: `parcels.${index}.weight.required`,
                        step: 'Content',
                        section: `Parcel ${index + 1}`,
                        fieldPath: `parcels.${index}.weight`,
                        errorKey: `parcel${index}weight`,
                        title: `Parcel ${index + 1} weight is required`,
                        message: 'Enter the parcel weight so rates and service eligibility can be calculated.',
                        action: 'Add unit weight in kilograms for this parcel.',
                        source: 'client',
                        carrierCode: selectedCarrier,
                    }));
                }
            });
        }
        if (step === 2) {
            const selectedOptionalServices = selectedCarrierCapabilities.optionalServices || [];
            const insuranceService = selectedOptionalServices.find(service => String(service.code || '').toUpperCase() === String(insuranceServiceCode || '').toUpperCase());
            const insuranceSelected = selectedOptionalServiceCodes.includes(insuranceServiceCode);
            const effectiveInsuredValue = Number(insuredValue || totals.declaredValue || 0);
            if (insuranceService && insuranceSelected && effectiveInsuredValue <= 0) {
                issues.push(buildIssue({
                    id: 'billing.insuredValue.required',
                    step: 'Billing',
                    section: 'Optional services',
                    fieldPath: 'billing.insuredValue',
                    errorKey: 'insuredValue',
                    title: 'Insurance value is required',
                    message: `Enter the shipment value to insure. It must be greater than 0 ${currency}.`,
                    action: 'Provide a valid insured value to keep insurance enabled.',
                    source: 'client',
                    carrierCode: selectedCarrier,
                }));
            }
        }
        return issues;
    };

    const fetchRates = async () => {
        setFetchingRates(true);
        try {
            const shouldSendCarrierSelection = isStaff && !selectedClient;
            const payload = {
                sender, receiver, parcels, items,
                shipmentType,
                plannedDate,
                currency,
                optionalServiceCodes: selectedOptionalServiceCodes,
                insuredValue: selectedOptionalServiceCodes.includes(insuranceServiceCode)
                    ? Number(insuredValue || totals.declaredValue || 0)
                    : undefined,
                ...(shouldSendCarrierSelection ? {
                    carrierCode: selectedCarrier,
                    serviceCode: selectedService.serviceCode || undefined,
                    ...(selectedCarrier === 'MANUAL' ? { manualShipment: true } : {})
                } : {}),
                ...(isStaff && selectedClient ? { userId: selectedClient } : {}),
            };
            const res = await shipmentService.getQuotes(payload);
            if (res.success && Array.isArray(res.data) && res.data.length > 0) {
                setAvailableServices(res.data);
                const existing = res.data.find(s => s.serviceCode === selectedService.serviceCode);
                if (res.data[0]?.carrier) setSelectedCarrier(res.data[0].carrier);
                handleSelectService(existing || res.data[0]);
                setApiIssues([]);
                appendIssueLog({ event: 'rating_success', issues: [] });
                enqueueSnackbar('Rates calculated', { variant: 'success' });
            } else {
                const ratingIssues = [
                    buildIssue({
                        id: 'rating.noRates',
                        step: 'Billing',
                        section: 'Carrier rates',
                        title: 'No rates are available',
                        message: 'Rates could not be calculated for this route.',
                        action: 'Review shipment addresses, parcel data, and selected service requirements then retry.',
                        source: 'carrier',
                        carrierCode: selectedCarrier,
                    })
                ];
                setApiIssues(ratingIssues);
                appendIssueLog({ event: 'rating_no_rates', issues: ratingIssues, stepKey: 'Billing' });
                enqueueSnackbar('No rates available for this route.', { variant: 'warning' });
            }
        } catch (err) {
            const ratingIssues = [
                buildIssue({
                    id: 'rating.error',
                    step: 'Billing',
                    section: 'Carrier rates',
                    title: 'Rate lookup failed',
                    message: err.message || 'Carrier rating failed.',
                    action: 'Fix highlighted shipment issues and try calculating rates again.',
                    source: 'carrier',
                    carrierCode: selectedCarrier,
                })
            ];
            setApiIssues(ratingIssues);
            appendIssueLog({ event: 'rating_error', issues: ratingIssues, stepKey: 'Billing' });
            enqueueSnackbar(`Rating error: ${err.message}`, { variant: 'error' });
        } finally {
            setFetchingRates(false);
        }
    };

    useEffect(() => {
        if (activeStep !== 2) return;
        if (!selectedOptionalServiceCodes.includes(insuranceServiceCode)) return;
        const effectiveInsuredValue = Number(insuredValue || totals.declaredValue || 0);
        if (effectiveInsuredValue <= 0) return;

        const timer = setTimeout(() => {
            fetchRates();
        }, 350);

        return () => clearTimeout(timer);
    }, [activeStep, insuredValue, totals.declaredValue, currency, insuranceServiceCode, selectedOptionalServiceCodes.join('|')]);

    useEffect(() => {
        const liveIssues = buildValidationIssues(activeStep);
        setWizardIssues(liveIssues);
        setErrors(issueMapToErrors(liveIssues));
    }, [
        activeStep,
        sender,
        receiver,
        parcels,
        insuredValue,
        totals.declaredValue,
        selectedCarrier,
        insuranceServiceCode,
        selectedOptionalServiceCodes.join('|'),
        selectedCarrierCapabilities
    ]);

    const validateStep = (step) => {
        const stepIssues = buildValidationIssues(step);
        setWizardIssues(stepIssues);
        setErrors(issueMapToErrors(stepIssues));
        appendIssueLog({ event: 'validation_run', issues: stepIssues, stepKey: STEPS[step]?.key });
        return stepIssues.filter(issue => issue.severity === 'error').length === 0;
    };

    const handleNext = async () => {
        if (!validateStep(activeStep)) return;
        if (STEPS[activeStep].key === 'Content') await fetchRates();
        setActiveStep(p => p + 1);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleBack = () => {
        setActiveStep(p => p - 1);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleIssueClick = (issue) => {
        const issueStepIndex = STEPS.findIndex(step => step.key === issue.step);
        if (issueStepIndex >= 0 && issueStepIndex !== activeStep) {
            setActiveStep(issueStepIndex);
        }
        window.requestAnimationFrame(() => {
            if (!issue?.fieldPath) return;
            const el = document.querySelector(`[data-field-path="${issue.fieldPath}"]`) || document.getElementById(issue.anchorId);
            if (!el) return;
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            if (typeof el.focus === 'function') el.focus();
        });
    };

    const handleSubmit = async () => {
        if (!validateStep(activeStep)) return;
        setLoading(true);
        try {
            const shouldSendCarrierSelection = isStaff && !selectedClient;
            const payload = {
                parcels, items, sender, receiver,
                totalPrice:  estimatedShipmentTotal,
                currency,
                billingCurrency,
                insuredValue: selectedOptionalServiceCodes.includes(insuranceServiceCode)
                    ? Number(insuredValue || totals.declaredValue || 0)
                    : undefined,
                shipmentType,
                incoterm,
                pickupRequired,
                dangerousGoods, packagingType, exportReason,
                remarks: invoiceRemarks, shipperAccount, payerOfVat, gstPaid,
                palletCount: Number(palletCount) || 0,
                packageMarks,
                labelSettings: {
                    format:         labelFormat,
                    signatureName:  signatureName  || sender.contactPerson || 'Shipper',
                    signatureTitle: signatureTitle || 'Authorized Sender',
                },
                optionalServiceCodes: selectedOptionalServiceCodes,
                ...(shouldSendCarrierSelection ? {
                    carrierCode: selectedCarrier,
                    serviceCode: selectedService.serviceCode,
                    ...(selectedCarrier === 'MANUAL' ? { manualShipment: true } : {})
                } : {}),
                ...(isStaff && selectedClient ? { userId: selectedClient } : {}),
            };
            const res = isEditMode
                ? await shipmentService.updateShipmentDetails(editTrackingNumber, payload)
                : await shipmentService.createShipment(payload);
            if (res.success) {
                setCreatedShipment(res.data);
                setApiIssues([]);
                appendIssueLog({ event: 'submit_success', issues: [] });
                if (refreshUser) await refreshUser();
                setActiveStep(STEPS.length);
            }
        } catch (err) {
            const submitIssues = [
                buildIssue({
                    id: 'submit.error',
                    step: 'Review',
                    section: 'Shipment submission',
                    title: 'Shipment could not be submitted',
                    message: err.message || 'The shipment request failed.',
                    action: 'Review highlighted fields and retry submission.',
                    source: 'api',
                    carrierCode: selectedCarrier,
                })
            ];
            setApiIssues(submitIssues);
            appendIssueLog({ event: 'submit_error', issues: submitIssues, stepKey: 'Review' });
            enqueueSnackbar(err.message, { variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    // ─── Step content ────────────────────────────────────────────────────
    const renderStepContent = () => {
        switch (STEPS[activeStep]?.key) {
            case 'Setup':
                return (
                    <>
                        {isStaff && (
                            <BookingCard
                                clients={clients}
                                selectedClient={selectedClient}
                                onClientChange={setSelectedClient}
                                availableCarriers={availableCarriers}
                                selectedCarrier={selectedCarrier}
                                onCarrierChange={handleCarrierChange}
                            />
                        )}
                        <ShipmentSetup
                            sender={sender} setSender={setSender}
                            receiver={receiver} setReceiver={setReceiver}
                            shipmentType={shipmentType} setShipmentType={setShipmentType}
                            plannedDate={plannedDate} setPlannedDate={setPlannedDate}
                            pickupRequired={pickupRequired} setPickupRequired={setPickupRequired}
                            errors={errors}
                            isStaff={false}
                            clients={[]} selectedClient="" onClientChange={() => {}}
                            availableCarriers={availableCarriers}
                            selectedCarrier={selectedCarrier}
                            onCarrierChange={handleCarrierChange}
                            requiredFields={selectedCarrierCapabilities.requiredFields}
                        />
                    </>
                );
            case 'Content':
                return (
                    <ShipmentContent
                        parcels={parcels} setParcels={setParcels}
                        items={items} setItems={setItems}
                        dangerousGoods={dangerousGoods} setDangerousGoods={setDangerousGoods}
                        packagingType={packagingType} setPackagingType={setPackagingType}
                        shipmentType={shipmentType} errors={errors}
                        showDangerousGoods={selectedCarrierCapabilities.dangerousGoods?.supported}
                        packagingOptions={selectedCarrierCapabilities.packagingOptions}
                        currency={currency} setCurrency={setCurrency}
                    />
                );
            case 'Billing':
                return (
                    <ShipmentBilling
                        exportReason={exportReason} setExportReason={setExportReason}
                        invoiceRemarks={invoiceRemarks} setInvoiceRemarks={setInvoiceRemarks}
                        incoterm={incoterm} setIncoterm={setIncoterm}
                        gstPaid={gstPaid} setGstPaid={setGstPaid}
                        payerOfVat={payerOfVat} setPayerOfVat={setPayerOfVat}
                        shipperAccount={shipperAccount} setShipperAccount={setShipperAccount}
                        labelFormat={labelFormat} setLabelFormat={setLabelFormat}
                        signatureName={signatureName} setSignatureName={setSignatureName}
                        signatureTitle={signatureTitle} setSignatureTitle={setSignatureTitle}
                        palletCount={palletCount} setPalletCount={setPalletCount}
                        packageMarks={packageMarks} setPackageMarks={setPackageMarks}
                        availableOptionalServices={availableOptionalServices}
                        selectedOptionalServiceCodes={selectedOptionalServiceCodes}
                        onToggleOptionalService={(code) =>
                            setSelectedOptionalServiceCodes(prev =>
                                prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
                            )
                        }
                        declaredCurrency={currency}
                        billingCurrency={billingCurrency}
                        insuredValue={insuredValue || (selectedOptionalServiceCodes.includes(insuranceServiceCode) ? Number(totals.declaredValue || 0).toFixed(3) : '')}
                        setInsuredValue={setInsuredValue}
                        errors={errors}
                        estimatedShipmentCost={Number(selectedService.totalPrice || 0)}
                        optionalServicesTotal={optionalServicesTotal}
                        estimatedShipmentTotal={estimatedShipmentTotal}
                        deliveryDate={selectedService.deliveryDate || ''}
                        showMarkupDetails={isStaff}
                    />
                );
            case 'Review':
                return (
                    <ReviewContent
                        sender={sender} receiver={receiver}
                        parcels={parcels} items={items}
                        declaredCurrency={currency}
                        billingCurrency={billingCurrency}
                    />
                );
            default:
                return null;
        }
    };

    // ─── Success: full-width ─────────────────────────────────────────────
    if (activeStep >= STEPS.length) {
        return (
            <SuccessScreen
                createdShipment={createdShipment}
                selectedCarrier={selectedCarrier}
                onView={() => navigate(`/shipment/${createdShipment?.trackingNumber}`)}
                onNew={() => { setActiveStep(0); setCreatedShipment(null); }}
            />
        );
    }

    // ─── Main render ─────────────────────────────────────────────────────
    return (
        <Box sx={{ bgcolor: DS.surface, minHeight: '100vh', pt: 1, pb: 8 }}>
            <GlobalStyles styles={{
                '.mw-wizard .MuiTypography-root': { fontFamily: "'Manrope', sans-serif" },
            }} />

            <Box className="mw-wizard" sx={{ maxWidth: 1280, mx: 'auto', px: { xs: 2, md: 4 } }}>
                <Grid container spacing={4}>
                    {/* ── Left: form ── */}
                    <Grid item xs={12} lg={8}>
                        <Box sx={{ pt: 3 }}>
                            <StepTabs
                                activeStep={activeStep}
                                isEditMode={isEditMode}
                                editTrackingNumber={editTrackingNumber}
                            />
                            {renderStepContent()}

                            {/* Footer nav (desktop: back only; mobile: back + next) */}
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 5, pt: 3, borderTop: `1px solid ${DS.surfaceContainer}` }}>
                                <Button
                                    onClick={handleBack}
                                    disabled={activeStep === 0 || loading}
                                    sx={{ color: DS.outline, fontWeight: 700, textTransform: 'none', fontSize: 14, fontFamily: "'Manrope', sans-serif", px: 2 }}
                                >
                                    Discard Draft
                                </Button>
                                {/* Mobile-only next button */}
                                <Box sx={{ display: { xs: 'block', lg: 'none' } }}>
                                    <Button
                                        variant="contained"
                                        onClick={activeStep === STEPS.length - 1 ? handleSubmit : handleNext}
                                        disabled={loading || fetchingRates}
                                        endIcon={(loading || fetchingRates) ? <CircularProgress size={16} color="inherit" /> : <ArrowForwardIcon />}
                                        sx={{
                                            bgcolor: DS.primary, borderRadius: '10px', fontWeight: 800,
                                            textTransform: 'none', fontFamily: "'Manrope', sans-serif",
                                            '&:hover': { bgcolor: '#003eaa' },
                                        }}
                                    >
                                        {activeStep === STEPS.length - 1 ? 'Authorize' : 'Continue'}
                                    </Button>
                                </Box>
                            </Box>
                        </Box>
                    </Grid>

                    {/* ── Right: summary ── */}
                    <Grid item xs={12} lg={4}>
                        <Box sx={{ height: '100%' }}>
                            <SummaryPanel
                                sender={sender}
                                receiver={receiver}
                                totals={totals}
                                billableWeight={billableWeight}
                                declaredCurrency={currency}
                                billingCurrency={billingCurrency}
                                shipmentType={shipmentType}
                                selectedCarrier={selectedCarrier}
                                selectedService={selectedService}
                                availableServices={availableServices}
                                availableOptionalServices={availableOptionalServices}
                                selectedOptionalServiceCodes={selectedOptionalServiceCodes}
                                onSelectService={handleSelectService}
                                optionalServicesTotal={optionalServicesTotal}
                                estimatedShipmentTotal={estimatedShipmentTotal}
                                activeStep={activeStep}
                                loading={loading}
                                fetchingRates={fetchingRates}
                                isStaff={isStaff}
                                issues={combinedIssues}
                                issueLog={issueLog}
                                onDownloadIssueLog={handleDownloadIssueLog}
                                onIssueClick={handleIssueClick}
                                onBack={handleBack}
                                onNext={handleNext}
                                onSubmit={handleSubmit}
                            />
                        </Box>
                    </Grid>
                </Grid>
            </Box>
        </Box>
    );
};

export default ShipmentWizardV2;
