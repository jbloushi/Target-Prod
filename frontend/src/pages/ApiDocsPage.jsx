import React, { useState } from 'react';
import {
    Box, Typography, Chip, Divider, Table, TableBody,
    TableCell, TableHead, TableRow, Collapse, IconButton,
    Alert, Button, InputBase, Tooltip
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DownloadIcon from '@mui/icons-material/Download';
import KeyIcon from '@mui/icons-material/Key';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useSnackbar } from 'notistack';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

// ─── Design tokens ─────────────────────────────────────────────────────────────
const DS = {
    surface:       '#f3f7fb',
    surfaceLowest: '#ffffff',
    surfaceLow:    '#ecf1f6',
    primary:       '#0050d4',
    onSurface:     '#2a2f32',
    onSurfaceVar:  '#575c60',
    outline:       '#73777b',
    outlineVar:    '#a9aeb1',
};

const CARD_SX = {
    bgcolor: DS.surfaceLowest,
    borderRadius: '12px',
    border: `1px solid rgba(169,174,177,0.18)`,
    boxShadow: '0 1px 6px rgba(42,47,50,0.06)',
    overflow: 'hidden',
};

const METHOD_COLORS = {
    GET:    { bg: '#dcfce7', color: '#15803d' },
    POST:   { bg: '#dbeafe', color: '#1d4ed8' },
    PUT:    { bg: '#fef9c3', color: '#a16207' },
    DELETE: { bg: '#fee2e2', color: '#b91c1c' },
};

// ─── Sub-components ─────────────────────────────────────────────────────────────

const MethodBadge = ({ method }) => {
    const style = METHOD_COLORS[method] || METHOD_COLORS.GET;
    return (
        <Box component="span" sx={{
            display: 'inline-block', px: 1.25, py: 0.25,
            borderRadius: '6px', bgcolor: style.bg, color: style.color,
            fontSize: 11, fontWeight: 800, letterSpacing: '0.05em',
            fontFamily: 'monospace', mr: 1.5, flexShrink: 0,
        }}>
            {method}
        </Box>
    );
};

const CodeBlock = ({ children }) => (
    <Box component="pre" sx={{
        bgcolor: '#0a0e1a', color: '#e2e8f0',
        p: 2, borderRadius: '8px', fontSize: 12,
        fontFamily: 'monospace', overflowX: 'auto',
        lineHeight: 1.7, m: 0,
    }}>
        {children}
    </Box>
);

const FieldTable = ({ fields }) => (
    <Table size="small" sx={{ mb: 2 }}>
        <TableHead>
            <TableRow>
                <TableCell sx={{ fontWeight: 700, fontSize: 11, color: DS.outline, width: '28%' }}>Field</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: 11, color: DS.outline, width: '16%' }}>Type</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: 11, color: DS.outline, width: '16%' }}>Required</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: 11, color: DS.outline }}>Description</TableCell>
            </TableRow>
        </TableHead>
        <TableBody>
            {fields.map(f => (
                <TableRow key={f.field} hover>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: 12, color: DS.primary }}>{f.field}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: 11, color: DS.onSurfaceVar }}>{f.type}</TableCell>
                    <TableCell>{f.required ? <Chip label="required" size="small" color="error" sx={{ fontSize: 10, height: 18 }} /> : <Chip label="optional" size="small" sx={{ fontSize: 10, height: 18, bgcolor: DS.surfaceLow }} />}</TableCell>
                    <TableCell sx={{ fontSize: 12, color: DS.onSurfaceVar }}>{f.description}</TableCell>
                </TableRow>
            ))}
        </TableBody>
    </Table>
);

const EndpointCard = ({ method, path, title, description, fields, response, errors, note }) => {
    const [open, setOpen] = useState(false);
    return (
        <Box sx={{ ...CARD_SX, mb: 2 }}>
            <Box
                onClick={() => setOpen(o => !o)}
                sx={{ display: 'flex', alignItems: 'center', p: 2, cursor: 'pointer', '&:hover': { bgcolor: DS.surface } }}
            >
                <MethodBadge method={method} />
                <Typography sx={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: DS.onSurface, flex: 1 }}>
                    {path}
                </Typography>
                <Typography sx={{ fontSize: 12, color: DS.onSurfaceVar, mr: 2, display: { xs: 'none', sm: 'block' } }}>
                    {title}
                </Typography>
                <IconButton size="small">{open ? <ExpandLessIcon /> : <ExpandMoreIcon />}</IconButton>
            </Box>
            <Collapse in={open}>
                <Divider />
                <Box sx={{ p: 2.5 }}>
                    {note && <Alert severity="info" sx={{ mb: 2, fontSize: 12 }}>{note}</Alert>}
                    {description && <Typography sx={{ fontSize: 13, color: DS.onSurfaceVar, mb: 2 }}>{description}</Typography>}
                    {fields && fields.length > 0 && (
                        <>
                            <Typography sx={{ fontSize: 11, fontWeight: 800, color: DS.outline, letterSpacing: '0.1em', textTransform: 'uppercase', mb: 1 }}>
                                Request Fields
                            </Typography>
                            <FieldTable fields={fields} />
                        </>
                    )}
                    {response && (
                        <>
                            <Typography sx={{ fontSize: 11, fontWeight: 800, color: DS.outline, letterSpacing: '0.1em', textTransform: 'uppercase', mb: 1 }}>
                                Response Example
                            </Typography>
                            <CodeBlock>{response}</CodeBlock>
                        </>
                    )}
                    {errors && errors.length > 0 && (
                        <Box sx={{ mt: 2 }}>
                            <Typography sx={{ fontSize: 11, fontWeight: 800, color: DS.outline, letterSpacing: '0.1em', textTransform: 'uppercase', mb: 1 }}>
                                Error Responses
                            </Typography>
                            {errors.map(e => (
                                <Box key={e.code} sx={{ display: 'flex', gap: 1.5, mb: 0.5 }}>
                                    <Chip label={e.code} size="small" color="error" sx={{ fontSize: 10, height: 18, fontFamily: 'monospace' }} />
                                    <Typography sx={{ fontSize: 12, color: DS.onSurfaceVar }}>{e.msg}</Typography>
                                </Box>
                            ))}
                        </Box>
                    )}
                </Box>
            </Collapse>
        </Box>
    );
};

const SectionHeader = ({ id, title, subtitle }) => (
    <Box id={id} sx={{ mb: 2, mt: 4, scrollMarginTop: 100 }}>
        <Typography sx={{ fontSize: 18, fontWeight: 800, color: DS.onSurface, fontFamily: "'Manrope', sans-serif" }}>
            {title}
        </Typography>
        {subtitle && <Typography sx={{ fontSize: 13, color: DS.onSurfaceVar, mt: 0.5 }}>{subtitle}</Typography>}
        <Divider sx={{ mt: 1.5 }} />
    </Box>
);

// ─── API Key Panel ──────────────────────────────────────────────────────────────

const ApiKeyPanel = () => {
    const { user } = useAuth();
    const { enqueueSnackbar } = useSnackbar();
    const [apiKey, setApiKey] = useState(user?.apiKey || '');
    const [loading, setLoading] = useState(false);
    const [show, setShow] = useState(false);

    const generate = async () => {
        setLoading(true);
        try {
            const res = await api.post('/auth/api-key');
            setApiKey(res.data.apiKey);
            enqueueSnackbar('New API key generated!', { variant: 'success' });
        } catch {
            enqueueSnackbar('Failed to generate key', { variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const copy = () => {
        if (!apiKey) return;
        navigator.clipboard.writeText(apiKey);
        enqueueSnackbar('API key copied!', { variant: 'success' });
    };

    const masked = apiKey
        ? (show ? apiKey : apiKey.substring(0, 8) + '••••••••••••••••••••••••')
        : 'No key generated yet — click Generate';

    return (
        <Box sx={{ ...CARD_SX, p: 3, mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                <KeyIcon sx={{ color: DS.primary, fontSize: 20 }} />
                <Typography sx={{ fontSize: 14, fontWeight: 800, color: DS.onSurface, fontFamily: "'Manrope', sans-serif" }}>
                    Your API Key
                </Typography>
            </Box>
            <Alert severity="warning" sx={{ mb: 2, fontSize: 12 }}>
                Never expose this key in frontend JavaScript. Store it in server-side environment variables only.
            </Alert>
            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
                <Box sx={{
                    flex: 1, minWidth: 200, bgcolor: DS.surfaceLow,
                    borderRadius: '8px', px: 2, py: 1.25, border: `1px solid ${DS.outlineVar}`,
                    display: 'flex', alignItems: 'center', gap: 1,
                }}>
                    <InputBase
                        value={masked}
                        readOnly
                        sx={{ flex: 1, fontFamily: 'monospace', fontSize: 12, color: DS.onSurface }}
                    />
                    <Tooltip title={show ? 'Hide' : 'Show'}>
                        <IconButton size="small" onClick={() => setShow(s => !s)} disabled={!apiKey}>
                            <Typography sx={{ fontSize: 10 }}>{show ? '🙈' : '👁'}</Typography>
                        </IconButton>
                    </Tooltip>
                </Box>
                <Button
                    variant="outlined" size="small" startIcon={<ContentCopyIcon />}
                    onClick={copy} disabled={!apiKey}
                    sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 700, fontSize: 12 }}
                >
                    Copy
                </Button>
                <Button
                    variant="contained" size="small" startIcon={<RefreshIcon />}
                    onClick={generate} disabled={loading}
                    sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 700, fontSize: 12, bgcolor: DS.primary }}
                >
                    {apiKey ? 'Regenerate' : 'Generate Key'}
                </Button>
            </Box>
            <Typography sx={{ fontSize: 11, color: DS.outline, mt: 1.5 }}>
                Format: <code style={{ fontFamily: 'monospace', background: DS.surfaceLow, padding: '1px 5px', borderRadius: 4 }}>userId.randomBytes</code>
                &nbsp;— Used as <code style={{ fontFamily: 'monospace', background: DS.surfaceLow, padding: '1px 5px', borderRadius: 4 }}>x-api-key</code> header in every request.
            </Typography>
        </Box>
    );
};

// ─── Endpoint data ──────────────────────────────────────────────────────────────

const ADDRESS_FIELDS = [
    { field: 'company', type: 'string', required: true, description: 'Company or entity name' },
    { field: 'contactPerson', type: 'string', required: true, description: 'Full name of contact' },
    { field: 'phone', type: 'string', required: true, description: 'Phone number with country code digits' },
    { field: 'phoneCountryCode', type: 'string', required: true, description: 'e.g. "+965"' },
    { field: 'email', type: 'string', required: true, description: 'Contact email address' },
    { field: 'countryCode', type: 'string', required: true, description: 'ISO 2-letter country code, e.g. "KW"' },
    { field: 'city', type: 'string', required: true, description: 'City name' },
    { field: 'postalCode', type: 'string', required: true, description: 'Postal / ZIP code' },
    { field: 'streetLines', type: 'string[]', required: true, description: 'Array of address lines' },
    { field: 'state', type: 'string', required: false, description: 'State or province' },
    { field: 'taxId', type: 'string', required: false, description: 'Tax identification number' },
    { field: 'eoriNumber', type: 'string', required: false, description: 'EORI number for customs' },
    { field: 'vatNumber', type: 'string', required: false, description: 'VAT registration number' },
];

const SECTIONS = [
    { id: 'auth', label: 'Authentication' },
    { id: 'shipments', label: 'Shipments' },
    { id: 'quotes', label: 'Quotes' },
    { id: 'addresses', label: 'Address Book' },
    { id: 'pickups', label: 'Pickups' },
    { id: 'tracking', label: 'Tracking' },
    { id: 'public', label: 'Public' },
    { id: 'statuses', label: 'Status Reference' },
];

// ─── Main Page ──────────────────────────────────────────────────────────────────

const ApiDocsPage = () => {
    const scrollTo = (id) => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    return (
        <Box sx={{ bgcolor: DS.surface, minHeight: '100vh' }}>
            <Box sx={{ maxWidth: 1100, mx: 'auto', px: { xs: 2, md: 4 }, py: 3 }}>

                {/* Page Header */}
                <Box sx={{ mb: 4 }}>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
                        <Box>
                            <Typography sx={{ fontSize: 26, fontWeight: 900, color: DS.onSurface, fontFamily: "'Manrope', sans-serif", letterSpacing: '-0.03em' }}>
                                Developer API
                            </Typography>
                            <Typography sx={{ fontSize: 14, color: DS.onSurfaceVar, mt: 0.5 }}>
                                Integrate shipment creation, tracking, and pickup management into your systems.
                            </Typography>
                        </Box>
                        <Button
                            variant="outlined"
                            size="small"
                            startIcon={<DownloadIcon />}
                            href="/postman_collection.json"
                            download="target-logistics-api.postman_collection.json"
                            sx={{ borderRadius: '10px', textTransform: 'none', fontWeight: 700, fontSize: 12 }}
                        >
                            Download Postman Collection
                        </Button>
                    </Box>
                </Box>

                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '200px 1fr' }, gap: 4, alignItems: 'start' }}>

                    {/* Left Nav */}
                    <Box sx={{ position: 'sticky', top: 88, display: { xs: 'none', lg: 'block' } }}>
                        <Box sx={{ ...CARD_SX, p: 2 }}>
                            <Typography sx={{ fontSize: 10, fontWeight: 800, color: DS.outline, letterSpacing: '0.12em', textTransform: 'uppercase', mb: 1.5 }}>
                                Contents
                            </Typography>
                            {SECTIONS.map(s => (
                                <Box
                                    key={s.id}
                                    onClick={() => scrollTo(s.id)}
                                    sx={{
                                        py: 0.75, px: 1, borderRadius: '6px', cursor: 'pointer', fontSize: 13,
                                        fontWeight: 600, color: DS.onSurfaceVar, fontFamily: "'Manrope', sans-serif",
                                        '&:hover': { bgcolor: DS.surfaceLow, color: DS.primary },
                                    }}
                                >
                                    {s.label}
                                </Box>
                            ))}
                        </Box>
                    </Box>

                    {/* Right Content */}
                    <Box>

                        {/* API Key Panel */}
                        <ApiKeyPanel />

                        {/* Auth */}
                        <SectionHeader id="auth" title="Authentication" subtitle="All endpoints except Public Tracking require your API key." />
                        <Box sx={{ ...CARD_SX, p: 2.5, mb: 3 }}>
                            <Typography sx={{ fontSize: 13, color: DS.onSurfaceVar, mb: 1.5 }}>
                                Include your API key in every request as an HTTP header:
                            </Typography>
                            <CodeBlock>{`x-api-key: YOUR_API_KEY`}</CodeBlock>
                            <Divider sx={{ my: 2 }} />
                            <Typography sx={{ fontSize: 12, color: DS.onSurfaceVar }}>
                                <strong>Base URL (production):</strong> <code style={{ fontFamily: 'monospace', background: DS.surfaceLow, padding: '2px 6px', borderRadius: 4 }}>https://api.target-logistics.com/api</code><br />
                                <strong>Rate limit:</strong> 30 requests/minute per key. Exceeding returns HTTP 429.
                            </Typography>
                        </Box>

                        {/* Shipments */}
                        <SectionHeader id="shipments" title="Shipments" />
                        <EndpointCard
                            method="POST" path="/v1/shipments" title="Create Shipment"
                            description="Creates a new shipment in draft status. Not yet booked with a carrier."
                            fields={[
                                { field: 'sender', type: 'object', required: true, description: 'Origin address — see Address fields below' },
                                { field: 'receiver', type: 'object', required: true, description: 'Destination address' },
                                { field: 'parcels', type: 'object[]', required: true, description: 'weight(kg), length, width, height (cm)' },
                                { field: 'items', type: 'object[]', required: true, description: 'description, quantity, unitValue, currency, countryOfOrigin' },
                                { field: 'carrierCode', type: 'string', required: false, description: '"DGR" (default) or "DHL"' },
                                { field: 'serviceCode', type: 'string', required: false, description: 'Service type, e.g. "P" for Express Worldwide' },
                                { field: 'shipmentDate', type: 'string', required: false, description: 'ISO 8601 date e.g. "2026-04-10"' },
                                { field: 'currency', type: 'string', required: false, description: 'Default: "KWD"' },
                            ]}
                            response={`{\n  "success": true,\n  "data": {\n    "trackingNumber": "DGR-AB12CD34",\n    "status": "draft",\n    "price": 4.500,\n    "currency": "KWD",\n    "carrier": "DGR"\n  }\n}`}
                            errors={[{ code: 400, msg: 'Validation failed — missing required fields' }, { code: 500, msg: 'Internal server error' }]}
                        />
                        <EndpointCard
                            method="PUT" path="/v1/shipments/:trackingNumber" title="Update Shipment"
                            description="Update shipment details. Only allowed when status is draft, pending, or created."
                            fields={[
                                { field: 'sender', type: 'object', required: false, description: 'Updated origin address' },
                                { field: 'receiver', type: 'object', required: false, description: 'Updated destination' },
                                { field: 'parcels', type: 'object[]', required: false, description: 'Updated parcels' },
                                { field: 'items', type: 'object[]', required: false, description: 'Updated contents' },
                                { field: 'serviceCode', type: 'string', required: false, description: 'Service type code' },
                                { field: 'reference', type: 'string', required: false, description: 'Your internal order reference' },
                                { field: 'remarks', type: 'string', required: false, description: 'Special handling notes' },
                            ]}
                            response={`{\n  "success": true,\n  "data": {\n    "trackingNumber": "DGR-AB12CD34",\n    "status": "draft",\n    "price": 5.250,\n    "updatedAt": "2026-04-10T08:30:00.000Z"\n  }\n}`}
                            errors={[{ code: 400, msg: 'Cannot update in current status' }, { code: 404, msg: 'Shipment not found' }]}
                        />

                        {/* Quotes */}
                        <SectionHeader id="quotes" title="Quotes" subtitle="Get live rates before creating a shipment." />
                        <EndpointCard
                            method="POST" path="/v1/quotes" title="Get Rate Quote"
                            description="Fetch live shipping rates for a given route and parcel size. Rates include your organization's markup. Does not create a shipment."
                            fields={[
                                { field: 'sender', type: 'object', required: true, description: 'Origin address (countryCode + city minimum)' },
                                { field: 'receiver', type: 'object', required: true, description: 'Destination address' },
                                { field: 'parcels', type: 'object[]', required: true, description: 'weight, length, width, height' },
                                { field: 'items', type: 'object[]', required: true, description: 'Commodity details' },
                                { field: 'carrierCode', type: 'string', required: false, description: '"DGR" or "DHL"' },
                            ]}
                            response={`{\n  "success": true,\n  "data": [\n    {\n      "serviceName": "EXPRESS WORLDWIDE",\n      "serviceCode": "P",\n      "carrier": "DGR",\n      "totalPrice": 4.500,\n      "currency": "KWD",\n      "estimatedDelivery": "2026-04-11T00:00:00.000Z"\n    }\n  ]\n}`}
                            errors={[{ code: 500, msg: 'Carrier rate fetch failed' }]}
                        />

                        {/* Address Book */}
                        <SectionHeader id="addresses" title="Address Book" subtitle="Save and reuse sender/receiver addresses." />
                        <EndpointCard
                            method="GET" path="/v1/addresses" title="List Addresses"
                            description="Returns all addresses saved in your account."
                            response={`{\n  "success": true,\n  "data": [\n    {\n      "id": "addr_01",\n      "label": "Main Warehouse",\n      "company": "My Co.",\n      "city": "Kuwait City",\n      "countryCode": "KW"\n    }\n  ]\n}`}
                        />
                        <EndpointCard
                            method="POST" path="/v1/addresses" title="Add Address"
                            fields={ADDRESS_FIELDS.filter(f => ['label','company','contactPerson','phone','email','streetLines','city','postalCode','countryCode','state','taxId','vatNumber','eoriNumber'].includes(f.field))}
                            response={`{\n  "success": true,\n  "data": { "id": "addr_02", "label": "Branch Office", "..." : "..." }\n}`}
                            errors={[{ code: 400, msg: 'Failed to add address' }]}
                        />
                        <EndpointCard
                            method="PUT" path="/v1/addresses/:id" title="Update Address"
                            description="Partial update — only provide fields you want to change."
                            fields={[{ field: 'any address field', type: 'any', required: false, description: 'Provide only the fields to update' }]}
                            response={`{\n  "success": true,\n  "data": { "id": "addr_02", "city": "Salmiya", "..." : "..." }\n}`}
                            errors={[{ code: 404, msg: 'Address not found' }]}
                        />

                        {/* Pickups */}
                        <SectionHeader id="pickups" title="Pickups" subtitle="Request a driver to collect from your location." />
                        <EndpointCard
                            method="POST" path="/client/pickups" title="Request Pickup"
                            note="Include an Idempotency-Key header to safely retry requests without creating duplicates."
                            fields={[
                                { field: 'sender', type: 'object', required: true, description: 'Pickup origin address' },
                                { field: 'receiver', type: 'object', required: true, description: 'Delivery destination address' },
                                { field: 'parcels', type: 'object[]', required: true, description: 'Parcel dimensions and weight' },
                                { field: 'requestedPickupDate', type: 'string', required: true, description: 'ISO 8601 date, e.g. "2026-04-12"' },
                                { field: 'serviceCode', type: 'string', required: false, description: 'Preferred service type' },
                                { field: 'pickupInstructions', type: 'string', required: false, description: 'e.g. "Call on arrival"' },
                            ]}
                            response={`{\n  "success": true,\n  "data": {\n    "id": "pickup_88abc",\n    "status": "REQUESTED",\n    "trackingNumber": null,\n    "createdAt": "2026-04-10T10:00:00.000Z"\n  }\n}`}
                            errors={[{ code: 400, msg: 'Missing required fields' }, { code: 409, msg: 'Idempotency-Key collision — retry with new key' }]}
                        />
                        <EndpointCard
                            method="GET" path="/client/pickups/:id" title="Get Pickup Status"
                            description="Poll this endpoint after creating a pickup request. Once approved, the shipment tracking number will appear."
                            response={`{\n  "success": true,\n  "data": {\n    "id": "pickup_88abc",\n    "status": "APPROVED",\n    "rejectionReason": null,\n    "shipment": {\n      "trackingNumber": "DGR-AB12CD34",\n      "status": "pending",\n      "labelUrl": "https://..."\n    },\n    "createdAt": "2026-04-10T10:00:00.000Z"\n  }\n}`}
                            errors={[{ code: 404, msg: 'Pickup request not found' }]}
                        />

                        {/* Tracking */}
                        <SectionHeader id="tracking" title="Tracking" />
                        <EndpointCard
                            method="GET" path="/v1/tracking/:trackingNumber" title="Track Shipment"
                            response={`{\n  "success": true,\n  "data": {\n    "trackingNumber": "DGR-AB12CD34",\n    "status": "in_transit",\n    "carrier": "DGR",\n    "estimatedDelivery": "2026-04-11T00:00:00.000Z",\n    "history": [\n      { "status": "picked_up", "location": "Kuwait City", "timestamp": "2026-04-10T09:00:00.000Z" }\n    ]\n  }\n}`}
                            errors={[{ code: 404, msg: 'Shipment not found' }]}
                        />
                        <EndpointCard
                            method="GET" path="/client/shipments/:trackingNumber" title="Get Shipment Status"
                            response={`{\n  "success": true,\n  "data": {\n    "trackingNumber": "DGR-AB12CD34",\n    "status": "in_transit",\n    "currentLocation": { "address": "Ardiya Gateway, Kuwait" },\n    "estimatedDelivery": "2026-04-11T00:00:00.000Z",\n    "dhlTrackingNumber": null\n  }\n}`}
                            errors={[{ code: 404, msg: 'Shipment not found' }]}
                        />
                        <EndpointCard
                            method="GET" path="/client/shipments/:trackingNumber/tracking" title="Unified Tracking"
                            description="Merged events from both internal system and carrier (DGR/DHL), sorted chronologically. Each event has a source field."
                            response={`{\n  "success": true,\n  "data": {\n    "trackingNumber": "DGR-AB12CD34",\n    "status": "in_transit",\n    "events": [\n      { "status": "picked_up", "source": "INTERNAL", "location": "Kuwait City", "timestamp": "..." },\n      { "status": "in_transit", "source": "DGR", "location": "Kuwait Airport", "timestamp": "..." }\n    ]\n  }\n}`}
                            errors={[{ code: 404, msg: 'Shipment not found' }]}
                        />

                        {/* Public */}
                        <SectionHeader id="public" title="Public Tracking" subtitle="No API key required — safe to use in customer-facing apps." />
                        <EndpointCard
                            method="GET" path="/public/shipments/:trackingNumber" title="Public Shipment Tracking"
                            description="No authentication required. Share this endpoint URL directly with your end customers for order tracking."
                            response={`{\n  "success": true,\n  "data": {\n    "trackingNumber": "DGR-AB12CD34",\n    "status": "in_transit",\n    "currentLocation": { "address": "Ardiya Gateway, Kuwait", "updatedAt": "2026-04-10T14:00:00.000Z" }\n  }\n}`}
                        />

                        {/* Status Reference */}
                        <SectionHeader id="statuses" title="Status Reference" />
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, mb: 4 }}>
                            <Box sx={{ ...CARD_SX, p: 2.5 }}>
                                <Typography sx={{ fontSize: 12, fontWeight: 800, color: DS.outline, letterSpacing: '0.1em', textTransform: 'uppercase', mb: 1.5 }}>
                                    Shipment Statuses
                                </Typography>
                                {[
                                    ['draft', 'Created, not yet booked'],
                                    ['pending', 'Awaiting pickup'],
                                    ['picked_up', 'Collected from sender'],
                                    ['in_transit', 'Moving through network'],
                                    ['out_for_delivery', 'With local courier'],
                                    ['delivered', 'Successfully delivered'],
                                    ['exception', 'Issue requiring attention'],
                                    ['cancelled', 'Shipment cancelled'],
                                ].map(([status, desc]) => (
                                    <Box key={status} sx={{ display: 'flex', gap: 1.5, mb: 1, alignItems: 'flex-start' }}>
                                        <Box component="code" sx={{ fontSize: 11, bgcolor: DS.surfaceLow, px: 0.75, py: 0.25, borderRadius: '4px', color: DS.primary, flexShrink: 0 }}>{status}</Box>
                                        <Typography sx={{ fontSize: 12, color: DS.onSurfaceVar }}>{desc}</Typography>
                                    </Box>
                                ))}
                            </Box>
                            <Box sx={{ ...CARD_SX, p: 2.5 }}>
                                <Typography sx={{ fontSize: 12, fontWeight: 800, color: DS.outline, letterSpacing: '0.1em', textTransform: 'uppercase', mb: 1.5 }}>
                                    Pickup Statuses
                                </Typography>
                                {[
                                    ['REQUESTED', 'Submitted, awaiting review'],
                                    ['APPROVED', 'Approved, driver assigned'],
                                    ['REJECTED', 'Rejected — see rejectionReason'],
                                    ['COLLECTED', 'Picked up by driver'],
                                ].map(([status, desc]) => (
                                    <Box key={status} sx={{ display: 'flex', gap: 1.5, mb: 1, alignItems: 'flex-start' }}>
                                        <Box component="code" sx={{ fontSize: 11, bgcolor: DS.surfaceLow, px: 0.75, py: 0.25, borderRadius: '4px', color: DS.primary, flexShrink: 0 }}>{status}</Box>
                                        <Typography sx={{ fontSize: 12, color: DS.onSurfaceVar }}>{desc}</Typography>
                                    </Box>
                                ))}
                            </Box>
                        </Box>

                    </Box>
                </Box>
            </Box>
        </Box>
    );
};

export default ApiDocsPage;
