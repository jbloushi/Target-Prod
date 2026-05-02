import React from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import {
    Box, Typography, TextField, Grid, FormControl, InputLabel, Select, MenuItem,
    IconButton, Tooltip, Collapse, Autocomplete, alpha, useTheme, Stack
} from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import BusinessIcon from '@mui/icons-material/Business';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import PhoneIcon from '@mui/icons-material/Phone';
import EmailIcon from '@mui/icons-material/Email';
import MapIcon from '@mui/icons-material/Map';
import AddressInput from './AddressInput';

import { countries } from '../utils/countries';

const sortedCountries = [...countries].sort((a, b) => a.name.localeCompare(b.name));

const phoneCodes = sortedCountries
    .filter(c => c.dialCode)
    .map(c => ({
        isoCode: c.code,
        code: c.dialCode,
        country: c.name,
        flag: c.flag
    }));

phoneCodes.push({ isoCode: 'OTHER', code: 'OTHER', country: 'Other', flag: '🌍' });

const findPhoneCodeOption = (value) => (
    phoneCodes.find(c => c.code === value) || phoneCodes.find(c => c.isoCode === 'KW') || phoneCodes[0]
);

const AddressPanel = ({
    type = 'sender',
    value = {},
    onChange,
    errors = {},
    disabled = false,
    onCopy = null,
    isStaff = false,
    titleOverride = null,
    requiredFields = []
}) => {
    const theme = useTheme();
    const [showDetails, setShowDetails] = React.useState(true);
    const { user } = useAuth();
    const [savedAddresses, setSavedAddresses] = React.useState([]);

    const isSender = type === 'sender';
    const title = titleOverride || (isSender ? 'SHIPPER' : 'CONSIGNEE');
    const subtitle = isSender ? 'Origin Dispatch Point' : 'Final Destination Point';
    const icon = isSender ? <LocalShippingIcon sx={{ fontSize: 20 }} /> : <PersonIcon sx={{ fontSize: 20 }} />;
    const accentColor = isSender ? 'primary.main' : 'secondary.main';

    React.useEffect(() => {
        const fetchAddresses = async () => {
            try {
                if (isStaff) {
                    const res = await api.get('/users');
                    const allAddrs = res.data.data.flatMap(u =>
                        (u.addresses || []).map(a => ({
                            ...a,
                            _ownerName: u.name,
                            _orgName: u.organization?.name || 'Personal'
                        }))
                    );
                    setSavedAddresses(allAddrs);
                } else if (user && user.addresses) {
                    setSavedAddresses(user.addresses.map(a => ({ ...a, _ownerName: 'Me', _orgName: 'My Address Book' })));
                }
            } catch (err) {
                console.error('Failed to load address book', err);
            }
        };
        fetchAddresses();
    }, [isStaff, user]);

    const handleAddressSelect = (event, selected) => {
        if (!selected) return;
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
            vatNumber: selected.vatNumber || '',
            eoriNumber: selected.eoriNumber || '',
            taxId: selected.taxId || '',
            traderType: selected.traderType || 'business',
            reference: selected.reference || '',
            buildingName: selected.buildingName || '',
            unitNumber: selected.unitNumber || '',
            area: selected.area || '',
            landmark: selected.landmark || ''
        });
    };

    const updateField = (field, fieldValue) => {
        onChange({ ...value, [field]: fieldValue });
    };

    const isFieldRequired = (field) => requiredFields.includes(field);

    return (
        <Box
            sx={{
                bgcolor: 'surface-container-low',
                borderRadius: 6,
                p: 4,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                border: '1px solid transparent',
                transition: 'var(--transition-base)',
                '&:hover': { border: '1px solid', borderColor: alpha(theme.palette[isSender ? 'primary' : 'secondary'].main, 0.1) }
            }}
        >
            <Box display="flex" alignItems="center" justifyContent="space-between" mb={4}>
                <Stack direction="row" alignItems="center" spacing={2.5}>
                    <Box sx={{ 
                        p: 1.25, borderRadius: 3, 
                        bgcolor: alpha(theme.palette[isSender ? 'primary' : 'secondary'].main, 0.1), 
                        color: accentColor,
                        display: 'flex'
                    }}>
                        {icon}
                    </Box>
                    <Box>
                        <Typography variant="h5" fontWeight="800" sx={{ letterSpacing: '-0.02em', lineHeight: 1 }}>{title}</Typography>
                        <Typography variant="caption" color="text.secondary" fontWeight="800" sx={{ opacity: 0.6 }}>{subtitle}</Typography>
                    </Box>
                </Stack>
                <Box>
                    {onCopy && (
                        <Tooltip title="Clone to Destination">
                            <IconButton onClick={onCopy} size="small" sx={{ mr: 1, color: 'text.disabled', '&:hover': { color: 'primary.main', bgcolor: alpha(theme.palette.primary.main, 0.05) } }}>
                                <ContentCopyIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    )}
                    <IconButton onClick={() => setShowDetails(!showDetails)} size="small" sx={{ bgcolor: 'surface-container-high' }}>
                        {showDetails ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    </IconButton>
                </Box>
            </Box>

            {/* Address Book Loader */}
            {savedAddresses.length > 0 && (
                <Box mb={4}>
                    <Autocomplete
                        options={savedAddresses}
                        getOptionLabel={(option) => `${isStaff ? `[${option._orgName}] ` : ''}${option.label || 'Address'}`}
                        onChange={handleAddressSelect}
                        renderInput={(params) => (
                            <TextField 
                                {...params} 
                                label="Load from Corporate Directory" 
                                size="small" 
                                variant="outlined"
                                InputProps={{ ...params.InputProps, startAdornment: <Box component="span" sx={{ fontSize: '1.2rem', mr: 1 }}>📂</Box> }}
                            />
                        )}
                        renderOption={(props, option) => {
                             const { key, ...rest } = props;
                             return (
                                 <li key={key} {...rest} style={{ padding: '12px 16px' }}>
                                     <Box display="flex" alignItems="center" gap={2}>
                                         <Typography variant="h6">📍</Typography>
                                         <Box>
                                             <Typography variant="body2" fontWeight="800">{option.label}</Typography>
                                             <Typography variant="caption" color="text.secondary" sx={{ opacity: 0.7 }}>
                                                 {option.city}, {option.countryCode} — {option._orgName}
                                             </Typography>
                                         </Box>
                                     </Box>
                                 </li>
                             );
                        }}
                    />
                </Box>
            )}

            <Collapse in={showDetails}>
                <Stack spacing={3.5}>
                    {/* Identification Section */}
                    <Box sx={{ p: 3, borderRadius: 4, bgcolor: 'surface-container-high', minHeight: 164 }}>
                        <Typography variant="overline" color="text.secondary" fontWeight="800" display="block" mb={2}>Entity Details</Typography>
                        <Grid container spacing={2.5}>
                            <Grid item xs={12}>
                                <TextField
                                    fullWidth label="Company / Entity Name"
                                    value={value.company || ''}
                                    onChange={(e) => updateField('company', e.target.value)}
                                    disabled={disabled}
                                    InputProps={{ startAdornment: <BusinessIcon sx={{ mr: 1.5, fontSize: 20, color: accentColor, opacity: 0.5 }} /> }}
                                />
                            </Grid>
                            <Grid item xs={6}>
                                <FormControl fullWidth size="small">
                                    <InputLabel>Classification</InputLabel>
                                    <Select
                                        value={value.traderType || 'business'}
                                        label="Classification"
                                        onChange={(e) => updateField('traderType', e.target.value)}
                                        disabled={disabled}
                                    >
                                        <MenuItem value="business">Commercial Business</MenuItem>
                                        <MenuItem value="private">Private Individual</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={6}>
                                <TextField
                                    fullWidth size="small"
                                    label="Tax / VAT ID"
                                    value={value.taxId || ''}
                                    onChange={(e) => updateField('taxId', e.target.value)}
                                    disabled={disabled}
                                    placeholder="Enter if applicable"
                                />
                            </Grid>
                        </Grid>
                    </Box>

                    {/* Contact Section */}
                    <Box sx={{ p: 3, borderRadius: 4, bgcolor: 'surface-container-high', minHeight: 268 }}>
                        <Typography variant="overline" color="text.secondary" fontWeight="800" display="block" mb={2}>Personnel Connectivity</Typography>
                        <Grid container spacing={2.5}>
                            <Grid item xs={12}>
                                <TextField
                                    fullWidth label="Contact Personnel"
                                    value={value.contactPerson || ''}
                                    onChange={(e) => updateField('contactPerson', e.target.value)}
                                    required={isFieldRequired('contactPerson')}
                                    disabled={disabled}
                                    error={!!(isSender ? errors.senderContact : errors.receiverContact)}
                                    InputProps={{ startAdornment: <PersonIcon sx={{ mr: 1.5, fontSize: 20, color: 'text.secondary', opacity: 0.5 }} /> }}
                                />
                            </Grid>
                            <Grid item xs={12} md={5}>
                                <Autocomplete
                                    size="small"
                                    options={phoneCodes}
                                    value={findPhoneCodeOption(value.phoneCountryCode || '+965')}
                                    onChange={(_, selected) => updateField('phoneCountryCode', selected?.code || '+965')}
                                    disabled={disabled}
                                    autoHighlight
                                    isOptionEqualToValue={(option, selected) => option.code === selected.code}
                                    getOptionLabel={(option) => `${option.code} ${option.country}`}
                                    filterOptions={(options, state) => {
                                        const term = state.inputValue.trim().toLowerCase().replace(/^\+/, '');
                                        if (!term) return options;
                                        return options.filter(option => (
                                            option.country.toLowerCase().includes(term)
                                            || String(option.isoCode || '').toLowerCase().includes(term)
                                            || option.code.replace(/\D/g, '').includes(term)
                                            || option.code.toLowerCase().includes(term)
                                        ));
                                    }}
                                    renderInput={(params) => (
                                        <TextField {...params} label="Dial Code" size="small" />
                                    )}
                                    renderOption={(props, option) => {
                                        const { key, ...rest } = props;
                                        return (
                                            <li key={key} {...rest}>
                                                <Box component="img" src={`https://flagcdn.com/w20/${(option.isoCode || 'KW').toLowerCase()}.png`} sx={{ mr: 1, width: 20 }} />
                                                <Typography variant="body2">{option.code} - {option.country} ({option.isoCode})</Typography>
                                            </li>
                                        );
                                    }}
                                />
                                <FormControl fullWidth size="small" sx={{ display: 'none' }}>
                                    <InputLabel>Dial Code</InputLabel>
                                    <Select
                                        value={value.phoneCountryCode || '+965'}
                                        label="Dial Code"
                                        onChange={(e) => updateField('phoneCountryCode', e.target.value)}
                                        disabled={disabled}
                                        renderValue={(selected) => (
                                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                                <Box component="img" src={`https://flagcdn.com/w20/${(countries.find(c => c.dialCode === selected)?.code || 'KW').toLowerCase()}.png`} sx={{ mr: 1, width: 18 }} />
                                                {selected}
                                            </Box>
                                        )}
                                    >
                                        {phoneCodes.map(c => (
                                            <MenuItem key={c.code} value={c.code}>
                                                <Box component="img" src={`https://flagcdn.com/w20/${(countries.find(country => country.name === c.country)?.code || 'KW').toLowerCase()}.png`} sx={{ mr: 1, width: 20 }} />
                                                <Typography variant="body2">{c.code} — {c.country}</Typography>
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12} md={7}>
                                <TextField
                                    fullWidth label="Primary Number"
                                    value={value.phone || ''}
                                    onChange={(e) => updateField('phone', e.target.value.replace(/\D/g, ''))}
                                    required={isFieldRequired('phone')}
                                    disabled={disabled}
                                    error={!!(isSender ? errors.senderPhone : errors.receiverPhone)}
                                    InputProps={{ startAdornment: <PhoneIcon sx={{ mr: 1.5, fontSize: 18, color: 'text.secondary', opacity: 0.5 }} /> }}
                                />
                            </Grid>
                            <Grid item xs={12}>
                                <TextField
                                    fullWidth label="Communication Email"
                                    type="email"
                                    value={value.email || ''}
                                    onChange={(e) => updateField('email', e.target.value)}
                                    required={isFieldRequired('email')}
                                    disabled={disabled}
                                    error={!!(isSender ? errors.senderEmail : errors.receiverEmail)}
                                    InputProps={{ startAdornment: <EmailIcon sx={{ mr: 1.5, fontSize: 18, color: 'text.secondary', opacity: 0.5 }} /> }}
                                />
                            </Grid>
                        </Grid>
                    </Box>

                    {/* Logistics Reference */}
                    <Box sx={{ p: 3, borderRadius: 4, bgcolor: alpha(theme.palette.primary.main, 0.03), border: '1px dashed', borderColor: alpha(theme.palette.primary.main, 0.2), minHeight: 96 }}>
                         <Typography variant="overline" color="primary.main" fontWeight="800" display="block" mb={2}>Manifest References</Typography>
                         <Grid container spacing={2}>
                            <Grid item xs={12} md={6}>
                                <TextField
                                    fullWidth label="Reference ID" size="small"
                                    value={value.reference || ''}
                                    onChange={(e) => updateField('reference', e.target.value)}
                                    placeholder="e.g. PO-7728"
                                />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField
                                    fullWidth label="EORI Number" size="small"
                                    value={value.eoriNumber || ''}
                                    onChange={(e) => updateField('eoriNumber', e.target.value)}
                                    placeholder="EU Customs Ref"
                                />
                            </Grid>
                         </Grid>
                    </Box>

                    {/* Geographic Section */}
                    <Box sx={{ p: 3, borderRadius: 4, bgcolor: 'surface-container-high', minHeight: 390 }}>
                        <Typography variant="overline" color="text.secondary" fontWeight="800" display="block" mb={2}>Geographic Location</Typography>
                        <Grid container spacing={3}>
                            <Grid item xs={12}>
                                <AddressInput
                                    value={value}
                                    onChange={onChange}
                                    label="🔍 Search Global Address Repository..."
                                    disabled={disabled}
                                />
                            </Grid>
                            <Grid item xs={12}>
                                <TextField
                                    fullWidth label="Unit Address Line 1"
                                    value={value.streetLines?.[0] || ''}
                                    onChange={(e) => updateField('streetLines', [e.target.value, value.streetLines?.[1] || ''])}
                                    required={isFieldRequired('streetLines')}
                                    disabled={disabled}
                                    error={!!(isSender ? errors.senderStreet : errors.receiverStreet)}
                                    InputProps={{ startAdornment: <MapIcon sx={{ mr: 1.5, fontSize: 18, color: 'text.secondary', opacity: 0.5 }} /> }}
                                />
                            </Grid>
                            <Grid item xs={6}>
                                <TextField fullWidth size="small" label="Unit / Floor" value={value.unitNumber || ''} onChange={(e) => updateField('unitNumber', e.target.value)} disabled={disabled} />
                            </Grid>
                            <Grid item xs={6}>
                                <TextField fullWidth size="small" label="Building Name" value={value.buildingName || ''} onChange={(e) => updateField('buildingName', e.target.value)} disabled={disabled} />
                            </Grid>
                            <Grid item xs={6}>
                                <TextField fullWidth size="small" label="Area / Block" value={value.area || ''} onChange={(e) => updateField('area', e.target.value)} disabled={disabled} />
                            </Grid>
                            <Grid item xs={6}>
                                <TextField fullWidth size="small" label="City" value={value.city || ''} onChange={(e) => updateField('city', e.target.value)} required={isFieldRequired('city')} disabled={disabled} error={!!(isSender ? errors.senderCity : errors.receiverCity)} />
                            </Grid>
                            <Grid item xs={6}>
                                <TextField
                                    fullWidth
                                    size="small"
                                    label="Postal Index"
                                    value={value.postalCode || ''}
                                    onChange={(e) => updateField('postalCode', e.target.value)}
                                    required={isFieldRequired('postalCode')}
                                    disabled={disabled}
                                    error={!!(isSender ? errors.senderPostal : errors.receiverPostal)}
                                    helperText={isSender ? errors.senderPostal : errors.receiverPostal}
                                />
                            </Grid>
                            <Grid item xs={6}>
                                <FormControl fullWidth size="small">
                                    <InputLabel>Country</InputLabel>
                                    <Select
                                        value={value.countryCode || 'KW'}
                                        label="Country"
                                        onChange={(e) => updateField('countryCode', e.target.value)}
                                        disabled={disabled}
                                        renderValue={(s) => (
                                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                                <Box component="img" src={`https://flagcdn.com/w20/${s.toLowerCase()}.png`} sx={{ mr: 1, width: 18 }} />
                                                {countries.find(c => c.code === s)?.name || s}
                                            </Box>
                                        )}
                                    >
                                        {sortedCountries.map(c => (
                                            <MenuItem key={c.code} value={c.code}>
                                                <Box component="img" src={`https://flagcdn.com/w20/${c.code.toLowerCase()}.png`} sx={{ mr: 1, width: 18, borderRadius: '2px' }} />
                                                <Typography variant="body2">{c.name}</Typography>
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Grid>
                        </Grid>
                    </Box>
                </Stack>
            </Collapse>
        </Box>
    );
};

export default AddressPanel;
