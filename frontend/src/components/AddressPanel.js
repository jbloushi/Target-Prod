import React from 'react';
import { useAuth } from '../context/AuthContext';
// axios import removed
import api from '../services/api';
import {
    Box, Paper, Typography, TextField, Grid, FormControl, InputLabel, Select, MenuItem,
    Divider, IconButton, Tooltip, Collapse, Autocomplete
} from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import BusinessIcon from '@mui/icons-material/Business';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import AddressInput from './AddressInput';

/**
 * Phone country codes with flags - comprehensive list
 */
import { countries } from '../utils/countries';

// Sort countries by name for better UX
const sortedCountries = [...countries].sort((a, b) => a.name.localeCompare(b.name));

// Extract phone codes from countries (mocking this as I didn't add phone codes to country list to save space)
// For now, I'll keep the phoneCodes array or just use a simplified one.
// Actually, I should probably keep phoneCodes as is since my new countries list doesn't have phone codes.
// But the user asked for "Country dropdown should have all countries".
// I will keep phoneCodes as is for now as it wasn't explicitly asked to be changed, and it's a lot of data. 

// Derive phone codes from countries list
const phoneCodes = sortedCountries
    .filter(c => c.dialCode)
    .map(c => ({
        code: c.dialCode,
        country: c.name,
        flag: c.flag
    }));

// Add Other option
phoneCodes.push({ code: 'OTHER', country: 'Other', flag: '🌍' });



/**
 * AddressPanel Component
 */
const AddressPanel = ({
    type = 'sender',
    value = {},
    onChange,
    errors = {},
    disabled = false,
    onCopy = null,
    // New props for staff context
    isStaff = false,
    titleOverride = null,
    requiredFields = []
}) => {
    const [showDetails, setShowDetails] = React.useState(true);
    const { user } = useAuth();
    const [savedAddresses, setSavedAddresses] = React.useState([]);

    const isSender = type === 'sender';
    const title = titleOverride || (isSender ? 'SHIPPER (From)' : 'RECEIVER (To)');
    const icon = isSender ? <LocalShippingIcon /> : <PersonIcon />;
    const color = isSender ? 'primary.main' : 'secondary.main';

    // Fetch addresses on mount
    React.useEffect(() => {
        const fetchAddresses = async () => {
            try {
                if (isStaff) {
                    // Staff: Fetch all client addresses
                    const res = await api.get('/users'); // Use api instance
                    // Flatten addresses with Org info
                    const allAddrs = res.data.data.flatMap(u =>
                        (u.addresses || []).map(a => ({
                            ...a,
                            _ownerName: u.name,
                            _orgName: u.organization?.name || 'Personal'
                        }))
                    );
                    setSavedAddresses(allAddrs);
                } else {

                    // Client: Use own profile addresses
                    // In a real app, we might valididate against latest profile, but user object is handy
                    if (user && user.addresses) {
                        setSavedAddresses(user.addresses.map(a => ({ ...a, _ownerName: 'Me', _orgName: 'My Address Book' })));
                    }
                }
            } catch (err) {
                console.error('Failed to load address book', err);
            }
        };
        fetchAddresses();
    }, [isStaff, user]);

    const handleAddressSelect = (event, selected) => {
        if (!selected) return;
        // Map saved address to form fields
        onChange({
            ...value,
            company: selected.company || '',
            contactPerson: selected.contactPerson || '',
            streetLines: selected.streetLines || [],
            city: selected.city || '',
            state: selected.state || '',
            postalCode: selected.postalCode || '',
            countryCode: selected.countryCode || 'KW',
            phone: selected.phone || '',
            phoneCountryCode: selected.phoneCountryCode || '+965',
            email: selected.email || '',
            // Carry over refs if available
            vatNumber: selected.vatNumber || '',
            eoriNumber: selected.eoriNumber || '',
            taxId: selected.taxId || '',
            traderType: selected.traderType || 'business',
            reference: selected.reference || '',
            // FIX: Add missing fields
            buildingName: selected.buildingName || '',
            unitNumber: selected.unitNumber || '',
            area: selected.area || '',
            landmark: selected.landmark || ''
        });
    };

    const updateField = (field, fieldValue) => {
        onChange({
            ...value,
            [field]: fieldValue
        });
    };

    const isFieldRequired = (field) => requiredFields.includes(field);

    return (
        <Paper
            elevation={3}
            sx={{
                p: 3,
                borderRadius: 3,
                borderTop: 4,
                borderColor: color,
                height: '100%'
            }}
        >
            <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
                <Box display="flex" alignItems="center" gap={1}>
                    <Box sx={{ color }}>{icon}</Box>
                    <Typography variant="h6" fontWeight="bold">{title} (VERIFIED FIX V3)</Typography>
                </Box>
                <Box>
                    {onCopy && (
                        <Tooltip title="Copy to Receiver">
                            <IconButton onClick={onCopy} size="small">
                                <ContentCopyIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    )}
                    <IconButton onClick={() => setShowDetails(!showDetails)} size="small">
                        {showDetails ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    </IconButton>
                </Box>
            </Box>

            {/* Address Book Selector */}
            {savedAddresses.length > 0 && (
                <Box mb={2}>
                    <Autocomplete
                        options={savedAddresses}
                        getOptionLabel={(option) => {
                            const orgLabel = isStaff ? `[${option._orgName}] ` : '';
                            return `${orgLabel}${option.label || 'Address'} - ${option.city}, ${option.countryCode}`;
                        }}
                        isOptionEqualToValue={(option, value) => option._id === value._id || option.label === value.label}
                        renderOption={(props, option) => {
                            const { key, ...rest } = props;
                            return (
                                <li key={key} {...rest} style={{ padding: '10px 16px' }}>
                                    <Box display="flex" alignItems="center" sx={{ width: '100%' }}>
                                        <Box sx={{
                                            mr: 2,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            bgcolor: 'rgba(0, 217, 184, 0.1)',
                                            borderRadius: '50%',
                                            p: 1
                                        }}>
                                            <Typography variant="h6" sx={{ color: '#00d9b8', fontSize: 16 }}>📂</Typography>
                                        </Box>
                                        <Box sx={{ flexGrow: 1 }}>
                                            <Typography variant="body2" sx={{ fontWeight: 600, color: '#e0e0e0' }}>
                                                {option.label} {isStaff && <span style={{ color: '#00d9b8', fontSize: '10px' }}>({option._orgName})</span>}
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: '#aaa', display: 'block' }}>
                                                {option.formattedAddress || `${option.city}, ${option.countryCode}`}
                                            </Typography>
                                        </Box>
                                    </Box>
                                </li>
                            );
                        }}
                        onChange={handleAddressSelect}
                        renderInput={(params) => (
                            <TextField {...params} label="📂 Load from Address Book" size="small" fullWidth />
                        )}
                        PaperComponent={(paperProps) => (
                            <Paper {...paperProps} sx={{
                                bgcolor: '#1a1f2e !important',
                                color: '#ffffff !important',
                                borderRadius: 2,
                                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                                border: '1px solid #2a3347',
                                marginTop: '8px',
                                '& .MuiAutocomplete-option[aria-selected="true"]': {
                                    bgcolor: 'rgba(0, 217, 184, 0.2) !important',
                                },
                                '& .MuiAutocomplete-option:hover': {
                                    bgcolor: 'rgba(255, 255, 255, 0.05) !important',
                                }
                            }} />
                        )}
                    />
                    <Divider sx={{ my: 2 }} />
                </Box>
            )}

            <Collapse in={showDetails}>
                <Grid container spacing={2}>
                    <Grid item xs={12}>
                        <TextField
                            fullWidth
                            required={isFieldRequired('company')}
                            label="Company Name"
                            value={value.company || ''}
                            onChange={(e) => updateField('company', e.target.value)}
                            disabled={disabled}
                            InputProps={{
                                startAdornment: <BusinessIcon sx={{ mr: 1, color: 'action.active' }} />
                            }}
                        />
                    </Grid>

                    <Grid item xs={6}>
                        <FormControl fullWidth>
                            <InputLabel>Trader Type</InputLabel>
                            <Select
                                value={value.traderType || 'business'}
                                label="Trader Type"
                                onChange={(e) => updateField('traderType', e.target.value)}
                                disabled={disabled}
                            >
                                <MenuItem value="business">Business</MenuItem>
                                <MenuItem value="private">Private / Individual</MenuItem>
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid item xs={6}>
                        <TextField
                            fullWidth
                            label="Tax ID / EIN"
                            value={value.taxId || ''}
                            onChange={(e) => updateField('taxId', e.target.value)}
                            disabled={disabled}
                            placeholder="Optional"
                        />
                    </Grid>

                    <Grid item xs={12}>
                        <TextField
                            fullWidth
                            required={isFieldRequired('contactPerson')}
                            label="Contact Person"
                            value={value.contactPerson || ''}
                            onChange={(e) => updateField('contactPerson', e.target.value)}
                            disabled={disabled}
                            error={!!(isSender ? errors.senderContact : errors.receiverContact)}
                            helperText={isSender ? errors.senderContact : errors.receiverContact}
                            InputProps={{
                                startAdornment: <PersonIcon sx={{ mr: 1, color: 'action.active' }} />
                            }}
                        />
                    </Grid>

                    <Grid item xs={4}>
                        <FormControl fullWidth>
                            <InputLabel>Code</InputLabel>
                            <Select
                                value={value.phoneCountryCode || '+965'}
                                label="Code"
                                onChange={(e) => updateField('phoneCountryCode', e.target.value)}
                                disabled={disabled}
                                renderValue={(selected) => {
                                    const code = phoneCodes.find(c => c.code === selected);
                                    if (!code) return selected;
                                    const countryCode = countries.find(c => c.name === code.country)?.code || 'KW';
                                    return (
                                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                            <Box component="img" src={`https://flagcdn.com/w20/${countryCode.toLowerCase()}.png`} sx={{ mr: 1, width: 20 }} />
                                            {selected}
                                        </Box>
                                    );
                                }}
                            >
                                {phoneCodes.map(c => {
                                    const countryCode = countries.find(country => country.name === c.country)?.code || 'KW';
                                    return (
                                        <MenuItem key={c.code} value={c.code}>
                                            <Box component="img" src={`https://flagcdn.com/w20/${countryCode.toLowerCase()}.png`} sx={{ mr: 1, width: 20 }} />
                                            {c.code} ({c.country})
                                        </MenuItem>
                                    );
                                })}
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid item xs={8}>
                        <TextField
                            fullWidth
                            required={isFieldRequired('phone')}
                            label="Phone Number"
                            value={value.phone || ''}
                            onChange={(e) => updateField('phone', e.target.value.replace(/\D/g, ''))}
                            disabled={disabled}
                            error={!!(isSender ? errors.senderPhone : errors.receiverPhone)}
                            helperText={isSender ? errors.senderPhone : errors.receiverPhone}
                        />
                    </Grid>

                    <Grid item xs={12}>
                        <TextField
                            fullWidth
                            required={isFieldRequired('email')}
                            type="email"
                            label="Email"
                            value={value.email || ''}
                            onChange={(e) => updateField('email', e.target.value)}
                            disabled={disabled}
                            error={!!(isSender ? errors.senderEmail : errors.receiverEmail)}
                            helperText={isSender ? errors.senderEmail : errors.receiverEmail}
                        />
                    </Grid>

                    {/* DGR References and VAT */}
                    <Grid item xs={isSender ? 12 : 6}>
                        <TextField
                            fullWidth
                            required={isFieldRequired('reference')}
                            label={isSender ? "Shipper Reference" : "Receiver Reference"}
                            value={value.reference || ''}
                            onChange={(e) => updateField('reference', e.target.value)}
                            disabled={disabled}
                            placeholder="e.g. PO-12345"
                            error={!!(isSender ? errors.senderReference : errors.receiverReference)}
                            helperText={isSender ? errors.senderReference : errors.receiverReference}
                        />
                    </Grid>

                    <Grid item xs={6}>
                        <TextField
                            fullWidth
                            label={isSender ? "Sender VAT Number" : "Receiver VAT Number"}
                            value={value.vatNumber || ''}
                            onChange={(e) => updateField('vatNumber', e.target.value)}
                            disabled={disabled}
                            placeholder="Required for DGR"
                            error={!!errors.receiverVat} // Only error for Receiver currently or add senderVat error
                            helperText={errors.receiverVat}
                        />
                    </Grid>

                    <Grid item xs={6}>
                        <TextField
                            fullWidth
                            label="EORI Number"
                            value={value.eoriNumber || ''}
                            onChange={(e) => updateField('eoriNumber', e.target.value)}
                            disabled={disabled}
                            placeholder="For EU Shipments"
                        />
                    </Grid>

                    <Grid item xs={12}>
                        <Divider sx={{ my: 1 }} />
                    </Grid>

                    <Grid item xs={12}>
                        <AddressInput
                            value={value}
                            onChange={onChange}
                            label="🔍 Start typing address..."
                            required={isFieldRequired('streetLines') || isFieldRequired('city')}
                            error={!!(isSender ? errors.senderAddress : errors.receiverAddress)}
                            disabled={disabled}
                        />
                    </Grid>

                    <Grid item xs={12}>
                        <Divider sx={{ my: 1 }} />
                    </Grid>

                    <Grid item xs={12}>
                        <TextField
                            fullWidth
                            required={isFieldRequired('streetLines')}
                            label="Street Address"
                            value={value.streetLines?.[0] || ''}
                            onChange={(e) => updateField('streetLines', [e.target.value, value.streetLines?.[1] || ''])}
                            disabled={disabled}
                            error={!!(isSender ? errors.senderStreet : errors.receiverStreet)}
                            helperText={isSender ? errors.senderStreet : errors.receiverStreet}
                        />
                    </Grid>

                    <Grid item xs={6}>
                        <TextField
                            fullWidth
                            label="Unit / Floor"
                            value={value.unitNumber || ''}
                            onChange={(e) => updateField('unitNumber', e.target.value)}
                            placeholder="Apt 5, Floor 3"
                            disabled={disabled}
                        />
                    </Grid>
                    <Grid item xs={6}>
                        <TextField
                            fullWidth
                            label="Building Name"
                            value={value.buildingName || ''}
                            onChange={(e) => updateField('buildingName', e.target.value)}
                            disabled={disabled}
                        />
                    </Grid>

                    <Grid item xs={6}>
                        <TextField
                            fullWidth
                            label="Area / Block / District"
                            value={value.area || ''}
                            onChange={(e) => updateField('area', e.target.value)}
                            disabled={disabled}
                        />
                    </Grid>
                    <Grid item xs={6}>
                        <TextField
                            fullWidth
                            required={isFieldRequired('city')}
                            label="City"
                            value={value.city || ''}
                            onChange={(e) => updateField('city', e.target.value)}
                            disabled={disabled}
                            error={!!(isSender ? errors.senderCity : errors.receiverCity)}
                            helperText={isSender ? errors.senderCity : errors.receiverCity}
                        />
                    </Grid>
                    <Grid item xs={6}>
                        <TextField
                            fullWidth
                            label="State / Province"
                            value={value.state || ''}
                            onChange={(e) => updateField('state', e.target.value)}
                            disabled={disabled}
                        />
                    </Grid>

                    <Grid item xs={6}>
                        <TextField
                            fullWidth
                            required={isFieldRequired('postalCode')}
                            label="Postal Code"
                            value={value.postalCode || ''}
                            onChange={(e) => updateField('postalCode', e.target.value)}
                            disabled={disabled}
                            error={!!(isSender ? errors.senderPostal : errors.receiverPostal)}
                            helperText={isSender ? errors.senderPostal : errors.receiverPostal}
                        />
                    </Grid>
                    <Grid item xs={6}>
                        <FormControl fullWidth required={isFieldRequired('countryCode')} error={!!(isSender ? errors.senderCountry : errors.receiverCountry)}>
                            <InputLabel>Country</InputLabel>
                            <Select
                                value={value.countryCode || 'KW'}
                                label="Country"
                                onChange={(e) => updateField('countryCode', e.target.value)}
                                disabled={disabled}
                                renderValue={(selected) => {
                                    return (
                                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                            <Box component="img" src={`https://flagcdn.com/w20/${selected.toLowerCase()}.png`} sx={{ mr: 1, width: 20 }} />
                                            {countries.find(c => c.code === selected)?.name || selected}
                                        </Box>
                                    );
                                }}
                            >
                                {sortedCountries.map(c => (
                                    <MenuItem key={c.code} value={c.code}>
                                        <Box component="img" src={`https://flagcdn.com/w20/${c.code.toLowerCase()}.png`} sx={{ mr: 1, width: 20 }} />
                                        {c.name}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Grid>

                    <Grid item xs={12}>
                        <TextField
                            fullWidth
                            label="Landmark / Delivery Notes"
                            value={value.landmark || ''}
                            onChange={(e) => updateField('landmark', e.target.value)}
                            placeholder="Near mosque, behind mall..."
                            multiline
                            rows={2}
                            disabled={disabled}
                        />
                    </Grid>
                </Grid>
            </Collapse>
        </Paper >
    );
};

export default AddressPanel;
