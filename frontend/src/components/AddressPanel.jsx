import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import api from '../services/api';
import {
    Box, Typography, TextField, Grid, FormControl, InputLabel, Select, MenuItem,
    IconButton, Tooltip, Collapse, Autocomplete, alpha, Stack, Chip
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
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import AddressInput from './AddressInput';
import { TK } from '../tokens/kineticHorizon';
import { countries, getCountryDisplayName } from '../utils/countries';

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
    const [showDetails, setShowDetails] = React.useState(true);
    const { user } = useAuth();
    const { lang, t } = useLanguage();
    const [savedAddresses, setSavedAddresses] = React.useState([]);

    const isSender = type === 'sender';
    const title = titleOverride || (isSender ? (lang === 'ar' ? 'بيانات الراسل (المصدر)' : 'SHIPPER') : (lang === 'ar' ? 'بيانات المستلم (الوجهة)' : 'CONSIGNEE'));
    const subtitle = isSender ? (lang === 'ar' ? 'مكان استلام الشحنة والمصدر' : 'Origin Dispatch Point') : (lang === 'ar' ? 'وجهة التسليم النهائية' : 'Final Destination Point');
    const icon = isSender ? <LocalShippingIcon sx={{ fontSize: 18 }} /> : <PersonIcon sx={{ fontSize: 18 }} />;
    const accentColor = isSender ? TK.primary : '#0284c7';
    const accentBg = isSender ? TK.primaryBg : '#e0f2fe';

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
            landmark: selected.landmark || '',
            formattedAddress: selected.formattedAddress || `${selected.city || ''}, ${selected.countryCode || ''}`,
            latitude: selected.latitude,
            longitude: selected.longitude,
            validationStatus: selected.validationStatus || 'CONFIRMED'
        });
    };

    const updateField = (field, fieldValue) => {
        onChange({ ...value, [field]: fieldValue });
    };

    const isFieldRequired = (field) => requiredFields.includes(field);

    const [savingAddress, setSavingAddress] = React.useState(false);

    const isVerified = Boolean(value.validationStatus === 'CONFIRMED' || (value.latitude && value.longitude));
    const isNonPostalCountry = ['AE', 'QA', 'BH', 'OM', 'KW', 'HK', 'IE'].includes(value.countryCode);
    const selectedCountryObj = countries.find(c => c.code === (value.countryCode || 'KW'));

    const handleSaveCurrentAddress = async () => {
        if (!value.contactPerson || !value.city) {
            alert('Please enter at least a Contact Person and City before saving.');
            return;
        }
        setSavingAddress(true);
        try {
            const payload = {
                label: `${value.company || value.contactPerson} (${value.city})`,
                company: value.company || '',
                contactPerson: value.contactPerson || '',
                phone: value.phone || '',
                phoneCountryCode: value.phoneCountryCode || '+965',
                email: value.email || '',
                streetLines: value.streetLines || [],
                city: value.city || '',
                state: value.state || '',
                postalCode: value.postalCode || '',
                countryCode: value.countryCode || 'KW',
                area: value.area || '',
                buildingName: value.buildingName || '',
                unitNumber: value.unitNumber || '',
                landmark: value.landmark || '',
                latitude: value.latitude,
                longitude: value.longitude
            };
            const res = await api.post('/users/addresses', payload);
            if (res.data?.success) {
                setSavedAddresses(prev => [payload, ...prev]);
            }
        } catch (err) {
            console.error('Failed to save address', err);
        } finally {
            setSavingAddress(false);
        }
    };

    return (
        <Box
            sx={{
                bgcolor: '#ffffff',
                borderRadius: `${TK.radiusCard}px`,
                p: { xs: 2, sm: 2.5 },
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                border: `1.5px solid ${TK.border}`,
                boxShadow: TK.shadowSm,
                transition: 'all 0.2s ease',
                '&:hover': {
                    borderColor: `${accentColor}40`,
                    boxShadow: TK.shadowMd
                }
            }}
        >
            {/* Panel Header */}
            <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
                <Stack direction="row" alignItems="center" spacing={1.5}>
                    <Box sx={{
                        width: 38,
                        height: 38,
                        borderRadius: '10px',
                        bgcolor: accentBg,
                        color: accentColor,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                    }}>
                        {icon}
                    </Box>
                    <Box>
                        <Typography variant="subtitle2" fontWeight="800" sx={{ color: TK.text1, letterSpacing: '-0.01em', lineHeight: 1.2 }}>
                            {title}
                        </Typography>
                        <Typography variant="caption" sx={{ color: TK.text3, fontWeight: 700 }}>
                            {subtitle}
                        </Typography>
                    </Box>
                </Stack>
                <Box display="flex" alignItems="center" gap={0.75}>
                    {value.contactPerson && value.city && (
                        <Tooltip title="Save to Address Book">
                            <Chip
                                label={savingAddress ? 'Saving...' : '💾 Save to Book'}
                                size="small"
                                onClick={handleSaveCurrentAddress}
                                sx={{
                                    height: 26,
                                    fontSize: '0.72rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    bgcolor: '#f1f5f9',
                                    border: `1px solid ${TK.border}`,
                                    color: TK.text1,
                                    '&:hover': { bgcolor: TK.primaryBg, color: TK.primary }
                                }}
                            />
                        </Tooltip>
                    )}
                    {onCopy && (
                        <Tooltip title="Clone Address from Shipper">
                            <IconButton
                                onClick={onCopy}
                                size="small"
                                sx={{
                                    color: TK.text2,
                                    border: `1px solid ${TK.border}`,
                                    borderRadius: '8px',
                                    p: '5px',
                                    '&:hover': { color: TK.primary, bgcolor: TK.primaryBg }
                                }}
                            >
                                <ContentCopyIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                        </Tooltip>
                    )}
                    <IconButton
                        onClick={() => setShowDetails(!showDetails)}
                        size="small"
                        sx={{
                            color: TK.text2,
                            border: `1px solid ${TK.border}`,
                            borderRadius: '8px',
                            p: '5px',
                            bgcolor: '#f8fafc',
                            '&:hover': { bgcolor: '#e2e8f0' }
                        }}
                    >
                        {showDetails ? <ExpandLessIcon sx={{ fontSize: 18 }} /> : <ExpandMoreIcon sx={{ fontSize: 18 }} />}
                    </IconButton>
                </Box>
            </Box>

            {/* Address Book Loader (if addresses available) */}
            {savedAddresses.length > 0 && (
                <Box mb={2}>
                    <Autocomplete
                        options={savedAddresses}
                        getOptionLabel={(option) => `${isStaff ? `[${option._orgName}] ` : ''}${option.label || option.company || option.contactPerson || 'Saved Address'}`}
                        onChange={handleAddressSelect}
                        renderInput={(params) => (
                            <TextField
                                {...params}
                                label="Quick Load from Address Book"
                                size="small"
                                variant="outlined"
                                InputProps={{
                                    ...params.InputProps,
                                    startAdornment: <Box component="span" sx={{ fontSize: '1rem', mr: 0.75 }}>📂</Box>
                                }}
                            />
                        )}
                        renderOption={(props, option) => {
                            const { key, ...rest } = props;
                            return (
                                <li key={key} {...rest} style={{ padding: '8px 12px' }}>
                                    <Box display="flex" alignItems="center" gap={1.25}>
                                        <Typography variant="body2">📍</Typography>
                                        <Box>
                                            <Typography variant="body2" fontWeight="700">{option.label || option.company || option.contactPerson}</Typography>
                                            <Typography variant="caption" sx={{ color: TK.text3 }}>
                                                {option.city}, {option.countryCode} — {option.phone || option.streetLines?.[0] || ''}
                                            </Typography>
                                        </Box>
                                    </Box>
                                </li>
                            );
                        }}
                    />
                </Box>
            )}

            {/* HERO GOOGLE ADDRESS AUTOCOMPLETE SEARCH (TOP POSITION) */}
            <Box sx={{
                p: 2,
                borderRadius: `${TK.radiusMd}px`,
                bgcolor: '#f8fafc',
                border: `1.5px solid ${isVerified ? TK.successBorder : TK.border}`,
                boxShadow: isVerified ? `0 0 12px ${TK.successBg}` : 'none',
                mb: 2,
                transition: 'all 0.2s ease'
            }}>
                <Box display="flex" alignItems="center" justifyContent="space-between" mb={1.25}>
                    <Typography variant="caption" fontWeight="800" sx={{ color: TK.text2, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 15, color: TK.primary }}>travel_explore</span>
                        Google Maps Global Address Search
                    </Typography>
                    {isVerified && (
                        <Chip
                            icon={<CheckCircleOutlineIcon sx={{ fontSize: '13px !important', color: `${TK.success} !important` }} />}
                            label="Verified Pin"
                            size="small"
                            sx={{
                                height: 22,
                                fontSize: '0.68rem',
                                fontWeight: 800,
                                bgcolor: TK.successBg,
                                color: TK.success,
                                border: `1px solid ${TK.successBorder}`
                            }}
                        />
                    )}
                </Box>

                <AddressInput
                    value={value}
                    onChange={onChange}
                    label={isSender ? "Search Shipper Address, Landmark or City..." : "Search Consignee Address, Landmark or City..."}
                    disabled={disabled}
                    error={Boolean(isSender ? errors.senderStreet : errors.receiverStreet)}
                />

                {/* Verified Location Details summary badge */}
                {isVerified && value.city && (
                    <Box sx={{ mt: 1.25, display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                        <Chip
                            avatar={
                                <Box component="img" src={`https://flagcdn.com/w20/${(value.countryCode || 'KW').toLowerCase()}.png`} sx={{ width: 14, height: 10, borderRadius: '2px' }} />
                            }
                            label={`${value.city}${value.area ? `, ${value.area}` : ''} • ${selectedCountryObj?.name || value.countryCode}`}
                            size="small"
                            sx={{ bgcolor: TK.primaryBg, color: TK.primary, fontWeight: 700, fontSize: '0.72rem', height: 24, border: `1px solid ${TK.primary}30` }}
                        />
                        {value.latitude && value.longitude && (
                            <Chip
                                icon={<MyLocationIcon sx={{ fontSize: '12px !important', color: TK.text3 }} />}
                                label={`${Number(value.latitude).toFixed(4)}°, ${Number(value.longitude).toFixed(4)}°`}
                                size="small"
                                sx={{ height: 24, fontSize: '0.68rem', color: TK.text2, bgcolor: '#ffffff', border: `1px solid ${TK.border}` }}
                            />
                        )}
                    </Box>
                )}
            </Box>

            <Collapse in={showDetails}>
                <Stack spacing={2}>
                    {/* Contact & Entity Section */}
                    <Box sx={{ p: 2, borderRadius: `${TK.radiusMd}px`, bgcolor: '#ffffff', border: `1px solid ${TK.border}` }}>
                        <Typography variant="caption" sx={{ color: TK.text3, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', mb: 1.5 }}>
                            Contact & Entity Information
                        </Typography>
                        <Grid container spacing={1.5}>
                            <Grid item xs={12} md={7}>
                                <TextField
                                    fullWidth
                                    size="small"
                                    label="Contact Person"
                                    value={value.contactPerson || ''}
                                    onChange={(e) => updateField('contactPerson', e.target.value)}
                                    required={isFieldRequired('contactPerson') || true}
                                    disabled={disabled}
                                    error={!!(isSender ? errors.senderContact : errors.receiverContact)}
                                    helperText={isSender ? errors.senderContact : errors.receiverContact}
                                    InputProps={{ startAdornment: <PersonIcon sx={{ mr: 1, fontSize: 18, color: TK.text3 }} /> }}
                                />
                            </Grid>
                            <Grid item xs={12} md={5}>
                                <TextField
                                    fullWidth
                                    size="small"
                                    label="Company / Entity Name"
                                    value={value.company || ''}
                                    onChange={(e) => updateField('company', e.target.value)}
                                    disabled={disabled}
                                    placeholder="Optional"
                                    InputProps={{ startAdornment: <BusinessIcon sx={{ mr: 1, fontSize: 18, color: accentColor }} /> }}
                                />
                            </Grid>
                            <Grid item xs={12} sm={5} md={4}>
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
                            </Grid>
                            <Grid item xs={12} sm={7} md={8}>
                                <TextField
                                    fullWidth
                                    size="small"
                                    label="Phone Number"
                                    value={value.phone || ''}
                                    onChange={(e) => updateField('phone', e.target.value.replace(/\D/g, ''))}
                                    required={isFieldRequired('phone') || true}
                                    disabled={disabled}
                                    error={!!(isSender ? errors.senderPhone : errors.receiverPhone)}
                                    helperText={isSender ? errors.senderPhone : errors.receiverPhone}
                                    InputProps={{ startAdornment: <PhoneIcon sx={{ mr: 1, fontSize: 18, color: TK.text3 }} /> }}
                                />
                            </Grid>
                            <Grid item xs={12}>
                                <TextField
                                    fullWidth
                                    size="small"
                                    label="Email Address"
                                    type="email"
                                    value={value.email || ''}
                                    onChange={(e) => updateField('email', e.target.value)}
                                    required={isFieldRequired('email')}
                                    disabled={disabled}
                                    error={!!(isSender ? errors.senderEmail : errors.receiverEmail)}
                                    helperText={isSender ? errors.senderEmail : errors.receiverEmail}
                                    InputProps={{ startAdornment: <EmailIcon sx={{ mr: 1, fontSize: 18, color: TK.text3 }} /> }}
                                />
                            </Grid>
                        </Grid>
                    </Box>

                    {/* Structured Address Details (Pre-filled by Google, Editable) */}
                    <Box sx={{ p: 2, borderRadius: `${TK.radiusMd}px`, bgcolor: '#ffffff', border: `1px solid ${TK.border}` }}>
                        <Typography variant="caption" sx={{ color: TK.text3, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', mb: 1.5 }}>
                            Structured Address Components
                        </Typography>
                        <Grid container spacing={1.5}>
                            <Grid item xs={12}>
                                <TextField
                                    fullWidth
                                    size="small"
                                    label="Street Address / Line 1"
                                    value={value.streetLines?.[0] || ''}
                                    onChange={(e) => updateField('streetLines', [e.target.value, value.streetLines?.[1] || ''])}
                                    required={isFieldRequired('streetLines')}
                                    disabled={disabled}
                                    error={!!(isSender ? errors.senderStreet : errors.receiverStreet)}
                                    helperText={isSender ? errors.senderStreet : errors.receiverStreet}
                                    InputProps={{ startAdornment: <MapIcon sx={{ mr: 1, fontSize: 18, color: TK.text3 }} /> }}
                                />
                            </Grid>
                            <Grid item xs={6} sm={4} md={3}>
                                <TextField
                                    fullWidth
                                    size="small"
                                    label="Unit / Floor / Apt"
                                    value={value.unitNumber || ''}
                                    onChange={(e) => updateField('unitNumber', e.target.value)}
                                    disabled={disabled}
                                    placeholder="e.g. Floor 4"
                                />
                            </Grid>
                            <Grid item xs={6} sm={8} md={5}>
                                <TextField
                                    fullWidth
                                    size="small"
                                    label="Building / Complex"
                                    value={value.buildingName || ''}
                                    onChange={(e) => updateField('buildingName', e.target.value)}
                                    disabled={disabled}
                                    placeholder="e.g. Al-Hamra Tower"
                                />
                            </Grid>
                            <Grid item xs={12} sm={6} md={4}>
                                <TextField
                                    fullWidth
                                    size="small"
                                    label="Area / District / Block"
                                    value={value.area || ''}
                                    onChange={(e) => updateField('area', e.target.value)}
                                    disabled={disabled}
                                    placeholder="e.g. Sharq"
                                />
                            </Grid>
                            <Grid item xs={12} sm={6} md={4}>
                                <TextField
                                    fullWidth
                                    size="small"
                                    label="City / Locality"
                                    value={value.city || ''}
                                    onChange={(e) => updateField('city', e.target.value)}
                                    required={true}
                                    disabled={disabled}
                                    error={!!(isSender ? errors.senderCity : errors.receiverCity)}
                                    helperText={isSender ? errors.senderCity : errors.receiverCity}
                                />
                            </Grid>
                            <Grid item xs={12} sm={6} md={4}>
                                <FormControl fullWidth size="small">
                                    <InputLabel>{lang === 'ar' ? 'الدولة' : 'Country'}</InputLabel>
                                    <Select
                                        value={value.countryCode || 'KW'}
                                        label={lang === 'ar' ? 'الدولة' : 'Country'}
                                        onChange={(e) => {
                                            const newCountryCode = e.target.value;
                                            const selectedCountry = countries.find(c => c.code === newCountryCode);
                                            const newDialCode = selectedCountry?.dialCode || '+965';
                                            let newCity = value.city || '';
                                            let newState = value.state || '';
                                            if (newCountryCode !== 'KW' && newCity.toLowerCase().includes('kuwait')) {
                                                newCity = '';
                                                newState = '';
                                            }
                                            onChange({
                                                ...value,
                                                countryCode: newCountryCode,
                                                phoneCountryCode: newDialCode,
                                                city: newCity,
                                                state: newState,
                                            });
                                        }}
                                        disabled={disabled}
                                        renderValue={(s) => (
                                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                                <Box component="img" src={`https://flagcdn.com/w20/${s.toLowerCase()}.png`} sx={{ mr: 1, ml: lang === 'ar' ? 1 : 0, width: 18 }} />
                                                {getCountryDisplayName(s, lang)}
                                            </Box>
                                        )}
                                    >
                                        {sortedCountries.map(c => (
                                            <MenuItem key={c.code} value={c.code}>
                                                <Box component="img" src={`https://flagcdn.com/w20/${c.code.toLowerCase()}.png`} sx={{ mr: 1, ml: lang === 'ar' ? 1 : 0, width: 18, borderRadius: '2px' }} />
                                                <Typography variant="body2">{getCountryDisplayName(c.code, lang)}</Typography>
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12} sm={6} md={4}>
                                <TextField
                                    fullWidth
                                    size="small"
                                    label={isNonPostalCountry ? 'Postal Code (Optional)' : 'Postal Code'}
                                    value={value.postalCode || ''}
                                    onChange={(e) => updateField('postalCode', e.target.value)}
                                    required={isFieldRequired('postalCode') && !isNonPostalCountry}
                                    disabled={disabled}
                                    placeholder={isNonPostalCountry ? 'N/A' : 'e.g. 10001'}
                                    error={!!(isSender ? errors.senderPostal : errors.receiverPostal)}
                                    helperText={isSender ? errors.senderPostal : errors.receiverPostal}
                                />
                            </Grid>
                        </Grid>
                    </Box>

                    {/* Secondary Customs & Classification */}
                    <Box sx={{ p: 2, borderRadius: `${TK.radiusMd}px`, bgcolor: '#f8fafc', border: `1px dashed ${TK.borderDark}` }}>
                        <Grid container spacing={1.5}>
                            <Grid item xs={6} sm={3}>
                                <FormControl fullWidth size="small">
                                    <InputLabel>Type</InputLabel>
                                    <Select
                                        value={value.traderType || 'business'}
                                        label="Type"
                                        onChange={(e) => updateField('traderType', e.target.value)}
                                        disabled={disabled}
                                    >
                                        <MenuItem value="business">Business</MenuItem>
                                        <MenuItem value="private">Individual</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={6} sm={3}>
                                <TextField
                                    fullWidth size="small"
                                    label="Tax / VAT ID"
                                    value={value.taxId || ''}
                                    onChange={(e) => updateField('taxId', e.target.value)}
                                    disabled={disabled}
                                    placeholder="Optional"
                                />
                            </Grid>
                            <Grid item xs={6} sm={3}>
                                <TextField
                                    fullWidth size="small"
                                    label="Reference ID"
                                    value={value.reference || ''}
                                    onChange={(e) => updateField('reference', e.target.value)}
                                    placeholder="e.g. PO-102"
                                />
                            </Grid>
                            <Grid item xs={6} sm={3}>
                                <TextField
                                    fullWidth size="small"
                                    label="EORI / Customs"
                                    value={value.eoriNumber || ''}
                                    onChange={(e) => updateField('eoriNumber', e.target.value)}
                                    placeholder="Optional"
                                />
                            </Grid>
                        </Grid>
                    </Box>
                </Stack>
            </Collapse>
        </Box>
    );
};

export default AddressPanel;
