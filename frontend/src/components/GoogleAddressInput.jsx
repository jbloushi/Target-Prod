import React, { useEffect, useMemo, useState } from 'react';
import { getGeocode, getLatLng } from 'use-places-autocomplete';
import { useJsApiLoader } from '@react-google-maps/api';
import {
    TextField,
    Autocomplete as MuiAutocomplete,
    Box,
    Typography,
    CircularProgress,
    Alert,
    Paper,
    alpha,
    useTheme
} from '@mui/material';

import LocationOnIcon from '@mui/icons-material/LocationOn';
import SearchIcon from '@mui/icons-material/Search';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { getGoogleMapsApiKey } from '../utils/env';
import { countries } from '../utils/countries';

const libraries = ['places'];
const INPUT_DEBOUNCE_MS = 300;

const mapPlaceComponentsToAddress = (addressComponents = []) => {
    let city = '';
    let countryCode = '';
    let postalCode = '';
    let state = '';
    let streetName = '';
    let streetNumber = '';
    let area = '';
    let sublocality = '';
    let postalTown = '';
    let adminArea2 = '';

    addressComponents.forEach((component) => {
        const types = component.types || [];
        const longName = component.long_name || component.longText || '';
        const shortName = component.short_name || component.shortText || '';

        if (types.includes('locality')) city = longName;
        if (types.includes('postal_town')) postalTown = longName;
        if (types.includes('administrative_area_level_2')) adminArea2 = longName;
        if (types.includes('country')) countryCode = shortName.toUpperCase();
        if (types.includes('postal_code')) postalCode = longName;
        if (types.includes('administrative_area_level_1')) state = longName;
        if (types.includes('route')) streetName = longName;
        if (types.includes('street_number')) streetNumber = longName;
        if (types.includes('sublocality_level_1') || types.includes('sublocality')) {
            sublocality = longName;
        }
        if (types.includes('neighborhood')) {
            area = longName;
        }
    });

    const countryObj = countries.find(c => c.code === countryCode) || countries.find(c => c.name.toLowerCase() === (countryCode || '').toLowerCase());
    const countryName = countryObj?.name || (countryCode === 'KW' ? 'Kuwait' : (countryCode === 'AE' ? 'United Arab Emirates' : (countryCode === 'SA' ? 'Saudi Arabia' : '')));
    const phoneCountryCode = countryObj?.dialCode || (countryCode === 'KW' ? '+965' : (countryCode === 'AE' ? '+971' : '+966'));

    const rawCity = city || postalTown || adminArea2 || sublocality || state || (countryCode === 'KW' ? 'Kuwait City' : (countryCode === 'AE' ? 'Dubai' : ''));
    const resolvedCity = String(rawCity || '').trim().substring(0, 45);
    const resolvedArea = String(area || sublocality || adminArea2 || '').trim().substring(0, 45);
    const streetLine = [streetNumber, streetName].filter(Boolean).join(' ').trim() || sublocality || '';

    return {
        city: resolvedCity,
        country: countryName,
        countryCode: countryCode || (countryName === 'United Arab Emirates' ? 'AE' : (countryName === 'Kuwait' ? 'KW' : '')),
        postalCode: postalCode || '',
        state: state || '',
        streetLines: [streetLine || resolvedArea || resolvedCity || 'Main Street'],
        area: resolvedArea,
        phoneCountryCode
    };
};

const GoogleAddressInput = ({
    value = {},
    onChange,
    label = 'Search Global Address Registry',
    disabled,
    required,
    error,
    helperText
}) => {
    const theme = useTheme();
    const apiKey = getGoogleMapsApiKey();
    const [inputValue, setInputValue] = useState(value?.formattedAddress || '');
    const [debouncedInput, setDebouncedInput] = useState(value?.formattedAddress || '');
    const [options, setOptions] = useState([]);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);

    useEffect(() => {
        if (!apiKey) {
            console.warn('Google Maps API key missing. Set VITE_GOOGLE_MAPS_API_KEY to enable address search.');
        }
    }, [apiKey]);

    const { isLoaded, loadError } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: apiKey,
        libraries
    });

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedInput(inputValue.trim());
        }, INPUT_DEBOUNCE_MS);

        return () => clearTimeout(timer);
    }, [inputValue]);

    useEffect(() => {
        if (value?.formattedAddress && value.formattedAddress !== inputValue) {
            setInputValue(value.formattedAddress);
        }
    }, [inputValue, value?.formattedAddress]);

    useEffect(() => {
        let cancelled = false;

        const fetchSuggestions = async () => {
            if (!apiKey || !isLoaded || !debouncedInput || debouncedInput.length < 2) {
                setOptions([]);
                return;
            }

            try {
                setLoadingSuggestions(true);

                if (!window.google?.maps) {
                    setOptions([]);
                    return;
                }

                const placesLib = await window.google.maps.importLibrary('places');
                const AutocompleteSuggestion = placesLib?.AutocompleteSuggestion;

                if (AutocompleteSuggestion?.fetchAutocompleteSuggestions) {
                    const response = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
                        input: debouncedInput
                    });

                    const nextOptions = (response?.suggestions || [])
                        .map((entry, index) => {
                            const prediction = entry?.placePrediction;
                            const text = prediction?.text?.text || '';
                            const secondary = prediction?.structuredFormat?.secondaryText?.text || '';
                            const placeId = prediction?.placeId || `${text}-${index}`;

                            if (!text) return null;

                            return {
                                placeId,
                                description: text,
                                mainText: text,
                                secondaryText: secondary,
                                prediction
                            };
                        })
                        .filter(Boolean);

                    if (!cancelled) {
                        setOptions(nextOptions);
                    }
                    return;
                }

                const service = new window.google.maps.places.AutocompleteService();
                service.getPlacePredictions({ input: debouncedInput }, (predictions = []) => {
                    if (cancelled) return;

                    setOptions(
                        predictions.map((prediction) => ({
                            placeId: prediction.place_id,
                            description: prediction.description,
                            mainText: prediction.structured_formatting?.main_text || prediction.description,
                            secondaryText: prediction.structured_formatting?.secondary_text || ''
                        }))
                    );
                });
            } catch (suggestionError) {
                if (!cancelled) {
                    console.error('Address suggestions failed:', suggestionError);
                    setOptions([]);
                }
            } finally {
                if (!cancelled) {
                    setLoadingSuggestions(false);
                }
            }
        };

        fetchSuggestions();

        return () => {
            cancelled = true;
        };
    }, [apiKey, debouncedInput, isLoaded]);

    const handleSelect = async (selectedOption) => {
        if (!selectedOption) return;

        const description = typeof selectedOption === 'string' ? selectedOption : (selectedOption.description || selectedOption.mainText || '');
        setInputValue(description);

        try {
            let addressData = null;
            const placeId = typeof selectedOption === 'object' ? selectedOption.placeId : null;

            // Strategy 0: Google Places Details Service (Best for Places Autocomplete suggestions)
            if (window.google?.maps?.places?.PlacesService && placeId) {
                try {
                    const dummyDiv = document.createElement('div');
                    const service = new window.google.maps.places.PlacesService(dummyDiv);
                    const detailsResult = await new Promise((resolve) => {
                        service.getDetails({
                            placeId,
                            fields: ['address_components', 'formatted_address', 'geometry', 'name']
                        }, (result, status) => {
                            if (status === window.google.maps.places.PlacesServiceStatus.OK && result) {
                                resolve(result);
                            } else {
                                resolve(null);
                            }
                        });
                    });

                    if (detailsResult) {
                        const lat = typeof detailsResult.geometry?.location?.lat === 'function' ? detailsResult.geometry.location.lat() : detailsResult.geometry?.location?.lat;
                        const lng = typeof detailsResult.geometry?.location?.lng === 'function' ? detailsResult.geometry.location.lng() : detailsResult.geometry?.location?.lng;
                        const mapped = mapPlaceComponentsToAddress(detailsResult.address_components || []);
                        addressData = {
                            formattedAddress: detailsResult.formatted_address || description,
                            ...mapped,
                            latitude: Number(lat),
                            longitude: Number(lng),
                            validationStatus: 'CONFIRMED'
                        };
                    }
                } catch (placesDetailsErr) {
                    console.debug('PlacesService.getDetails failed:', placesDetailsErr.message);
                }
            }

            // Strategy 1: Google Maps Geocoder by placeId (Universal support)
            if (!addressData && window.google?.maps?.Geocoder && placeId) {
                try {
                    const geocoder = new window.google.maps.Geocoder();
                    const geoResult = await new Promise((resolve) => {
                        geocoder.geocode({ placeId }, (results, status) => {
                            if (status === 'OK' && results && results[0]) {
                                resolve(results[0]);
                            } else {
                                resolve(null);
                            }
                        });
                    });

                    if (geoResult) {
                        const lat = typeof geoResult.geometry?.location?.lat === 'function' ? geoResult.geometry.location.lat() : geoResult.geometry?.location?.lat;
                        const lng = typeof geoResult.geometry?.location?.lng === 'function' ? geoResult.geometry.location.lng() : geoResult.geometry?.location?.lng;
                        const mapped = mapPlaceComponentsToAddress(geoResult.address_components || []);
                        addressData = {
                            formattedAddress: geoResult.formatted_address || description,
                            ...mapped,
                            latitude: Number(lat),
                            longitude: Number(lng),
                            validationStatus: 'CONFIRMED'
                        };
                    }
                } catch (geoErr) {
                    console.debug('Geocoder by placeId failed:', geoErr.message);
                }
            }

            // Strategy 2: Google Maps Geocoder by address description
            if (!addressData && window.google?.maps?.Geocoder && description) {
                try {
                    const geocoder = new window.google.maps.Geocoder();
                    const geoResult = await new Promise((resolve) => {
                        geocoder.geocode({ address: description }, (results, status) => {
                            if (status === 'OK' && results && results[0]) {
                                resolve(results[0]);
                            } else {
                                resolve(null);
                            }
                        });
                    });

                    if (geoResult) {
                        const lat = typeof geoResult.geometry?.location?.lat === 'function' ? geoResult.geometry.location.lat() : geoResult.geometry?.location?.lat;
                        const lng = typeof geoResult.geometry?.location?.lng === 'function' ? geoResult.geometry.location.lng() : geoResult.geometry?.location?.lng;
                        const mapped = mapPlaceComponentsToAddress(geoResult.address_components || []);
                        addressData = {
                            formattedAddress: geoResult.formatted_address || description,
                            ...mapped,
                            latitude: Number(lat),
                            longitude: Number(lng),
                            validationStatus: 'CONFIRMED'
                        };
                    }
                } catch (geoErr) {
                    console.debug('Geocoder by address failed:', geoErr.message);
                }
            }

            // Strategy 3: use-places-autocomplete getGeocode
            if (!addressData && description) {
                try {
                    const results = await getGeocode({ address: description });
                    if (results && results[0]) {
                        const { lat, lng } = await getLatLng(results[0]);
                        const mapped = mapPlaceComponentsToAddress(results[0]?.address_components || []);
                        addressData = {
                            formattedAddress: results[0]?.formatted_address || description,
                            ...mapped,
                            longitude: Number(lng),
                            latitude: Number(lat),
                            validationStatus: 'CONFIRMED'
                        };
                    }
                } catch (placesErr) {
                    console.debug('getGeocode fallback failed:', placesErr.message);
                }
            }

            // Strategy 4: Fallback to smart text parsing if geocoding services failed
            if (!addressData) {
                // Split on commas or hyphens with spaces (e.g. "Burj Khalifa - Sheikh Mohammed bin Rashid Blvd - Dubai - United Arab Emirates")
                const parts = description.split(/\s*[-–—,]\s*/).map(p => p.trim()).filter(Boolean);
                let detectedCountry = null;
                let detectedCountryCode = '';
                let detectedCity = '';

                // Search from right to left for country match
                for (let i = parts.length - 1; i >= 0; i--) {
                    const candidate = parts[i];
                    const matched = countries.find(c =>
                        c.name.toLowerCase() === candidate.toLowerCase() ||
                        c.code.toLowerCase() === candidate.toLowerCase()
                    );
                    if (matched) {
                        detectedCountry = matched.name;
                        detectedCountryCode = matched.code;
                        // City is usually the component right before country
                        if (i > 0) {
                            detectedCity = parts[i - 1];
                        }
                        break;
                    }
                }

                // Known landmark/city heuristics
                const lowerDesc = description.toLowerCase();
                if (!detectedCountryCode) {
                    if (lowerDesc.includes('emirates') || lowerDesc.includes('dubai') || lowerDesc.includes('abu dhabi') || lowerDesc.includes('sharjah') || lowerDesc.includes('burj khalifa')) {
                        detectedCountry = 'United Arab Emirates';
                        detectedCountryCode = 'AE';
                        detectedCity = 'Dubai';
                    } else if (lowerDesc.includes('saudi') || lowerDesc.includes('riyadh') || lowerDesc.includes('jeddah') || lowerDesc.includes('dammam')) {
                        detectedCountry = 'Saudi Arabia';
                        detectedCountryCode = 'SA';
                        detectedCity = 'Riyadh';
                    } else if (lowerDesc.includes('kuwait') || lowerDesc.includes('salmiya') || lowerDesc.includes('shuwaikh')) {
                        detectedCountry = 'Kuwait';
                        detectedCountryCode = 'KW';
                        detectedCity = 'Kuwait City';
                    } else {
                        detectedCountry = parts[parts.length - 1] || 'Kuwait';
                        const cObj = countries.find(c => c.name.toLowerCase() === detectedCountry.toLowerCase() || c.code.toLowerCase() === detectedCountry.toLowerCase());
                        detectedCountry = cObj?.name || 'Kuwait';
                        detectedCountryCode = cObj?.code || 'KW';
                    }
                }

                if (!detectedCity) {
                    detectedCity = parts.length > 2 ? parts[parts.length - 2] : (parts[1] || parts[0] || 'Kuwait City');
                }

                // Ensure city name does not exceed carrier 45 characters
                detectedCity = String(detectedCity || '').trim().substring(0, 45);

                const cObj = countries.find(c => c.code === detectedCountryCode) || countries.find(c => c.name === detectedCountry);

                // Default coordinates for popular cities if geocoding failed
                let defaultLat = detectedCountryCode === 'AE' ? 25.1972 : (detectedCountryCode === 'SA' ? 24.7136 : 29.3759);
                let defaultLng = detectedCountryCode === 'AE' ? 55.2744 : (detectedCountryCode === 'SA' ? 46.6753 : 47.9774);
                if (lowerDesc.includes('burj khalifa')) {
                    defaultLat = 25.1972;
                    defaultLng = 55.2744;
                }

                addressData = {
                    formattedAddress: description,
                    streetLines: [parts[0] ? parts[0].substring(0, 45) : description.substring(0, 45)],
                    city: detectedCity,
                    country: detectedCountry,
                    countryCode: detectedCountryCode,
                    phoneCountryCode: cObj?.dialCode || (detectedCountryCode === 'AE' ? '+971' : '+965'),
                    postalCode: '',
                    state: '',
                    area: '',
                    latitude: defaultLat,
                    longitude: defaultLng,
                    validationStatus: 'MANUAL'
                };
            }

            if (onChange && addressData) {
                onChange({
                    ...value,
                    ...addressData
                });
            }
        } catch (selectionError) {
            console.error('Error selecting address:', selectionError);
            if (onChange) {
                onChange({
                    ...value,
                    formattedAddress: description,
                    validationStatus: 'MANUAL'
                });
            }
        }
    };

    const helperMessage = useMemo(() => {
        if (helperText) return helperText;
        if (!apiKey) return 'Google address search is not configured. Enter the address details manually below.';
        if (loadError) return 'Google address search could not load. Enter the address details manually below.';
        return undefined;
    }, [apiKey, helperText, loadError]);

    return (
        <Box sx={{ width: '100%' }}>
            <MuiAutocomplete
                id="google-address-search"
                componentsProps={{
                    popper: {
                        style: { zIndex: 10000 }
                    }
                }}
                freeSolo
                disabled={disabled}
                options={options}
                getOptionLabel={(option) => option?.description || ''}
                filterOptions={(x) => x}
                inputValue={inputValue}
                onInputChange={(event, newValue, reason) => {
                    setInputValue(newValue || '');
                    if (reason === 'input' && typeof onChange === 'function') {
                        onChange({
                            ...value,
                            formattedAddress: newValue || '',
                            validationStatus: apiKey && isLoaded ? value?.validationStatus : 'MANUAL'
                        });
                    }
                }}
                onChange={(event, selectedOption) => {
                    if (typeof selectedOption === 'string') {
                        onChange({
                            ...value,
                            formattedAddress: selectedOption,
                            validationStatus: 'MANUAL'
                        });
                    } else if (selectedOption) {
                        handleSelect(selectedOption);
                    }
                }}
                renderInput={(params) => (
                    <>
                        <TextField
                            {...params}
                            label={label}
                            disabled={disabled}
                            required={required}
                            error={!!error || !!loadError}
                            helperText={helperMessage}
                            InputProps={{
                                ...params.InputProps,
                                startAdornment: (
                                    <SearchIcon 
                                        sx={{ mr: 1, fontSize: 20, color: 'primary.main', opacity: 0.7 }} 
                                    />
                                ),
                                endAdornment: (
                                    <>
                                        {(loadingSuggestions || (apiKey && !isLoaded)) && <CircularProgress size={16} sx={{ mr: 1 }} />}
                                        {params.InputProps.endAdornment}
                                    </>
                                )
                            }}
                            sx={{
                                '& .MuiOutlinedInput-root': {
                                    borderRadius: 3,
                                    bgcolor: 'surface-container-high'
                                }
                            }}
                        />
                        {(!apiKey || loadError) && (
                            <Box mt={1}>
                                <Alert severity="info" variant="outlined" sx={{ borderRadius: 3 }}>
                                    {loadError ? 'Google address search is offline. Manual entry is available.' : 'Add VITE_GOOGLE_MAPS_API_KEY to enable Google address search.'}
                                </Alert>
                            </Box>
                        )}
                    </>
                )}
                renderOption={(props, option) => {
                    const { key, ...rest } = props;
                    return (
                        <li key={key} {...rest} style={{ padding: '12px 16px' }}>
                            <Box display="flex" alignItems="center" sx={{ width: '100%' }}>
                                <Box sx={{
                                    mr: 2,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    bgcolor: alpha(theme.palette.primary.main, 0.1),
                                    borderRadius: 2,
                                    p: 1
                                }}>
                                    <LocationOnIcon sx={{ color: 'primary.main', fontSize: 18 }} />
                                </Box>
                                <Box sx={{ flexGrow: 1 }}>
                                    <Typography variant="body2" sx={{ fontWeight: 800 }}>
                                        {option.mainText || option.description}
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', opacity: 0.7 }}>
                                        {option.secondaryText}
                                    </Typography>
                                </Box>
                            </Box>
                        </li>
                    );
                }}
                PaperComponent={(paperProps) => (
                    <Paper {...paperProps} sx={{
                        bgcolor: 'surface-container-lowest !important',
                        color: 'text.primary !important',
                        borderRadius: 3,
                        boxShadow: 'var(--shadow-ambient)',
                        border: '1px solid',
                        borderColor: 'divider',
                        marginTop: '8px',
                        overflow: 'hidden',
                        '& .MuiAutocomplete-option[aria-selected="true"]': {
                            bgcolor: alpha(theme.palette.primary.main, 0.1) + ' !important',
                        },
                        '& .MuiAutocomplete-option:hover': {
                            bgcolor: 'surface-container-high !important',
                        }
                    }} />
                )}
            />
        </Box>
    );
};

export default GoogleAddressInput;
