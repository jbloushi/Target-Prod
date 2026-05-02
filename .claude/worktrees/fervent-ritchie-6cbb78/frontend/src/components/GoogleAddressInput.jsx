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
import { getGoogleMapsApiKey } from '../utils/env';

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

    addressComponents.forEach((component) => {
        const types = component.types || [];
        const longName = component.long_name || component.longText || '';
        const shortName = component.short_name || component.shortText || '';

        if (types.includes('locality')) city = longName;
        if (types.includes('country')) countryCode = shortName;
        if (types.includes('postal_code')) postalCode = longName;
        if (types.includes('administrative_area_level_1')) state = longName;
        if (types.includes('route')) streetName = longName;
        if (types.includes('street_number')) streetNumber = longName;
        if (types.includes('sublocality') || types.includes('sublocality_level_1') || types.includes('neighborhood')) {
            area = longName;
        }
    });

    return {
        city,
        countryCode,
        postalCode,
        state,
        streetLines: [`${streetNumber} ${streetName}`.trim()],
        area
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

        setInputValue(selectedOption.description);

        try {
            let addressData;

            if (selectedOption.prediction && typeof selectedOption.prediction.toPlace === 'function') {
                const place = selectedOption.prediction.toPlace();
                await place.fetchFields({
                    fields: ['formattedAddress', 'location', 'addressComponents']
                });

                const lat = place.location?.lat?.();
                const lng = place.location?.lng?.();
                const mapped = mapPlaceComponentsToAddress(place.addressComponents || []);

                addressData = {
                    formattedAddress: place.formattedAddress || selectedOption.description,
                    ...mapped,
                    longitude: lng,
                    latitude: lat,
                    validationStatus: 'CONFIRMED'
                };
            } else {
                const results = await getGeocode({ address: selectedOption.description });
                if (!results || results.length === 0) throw new Error('No geocode results found');

                const { lat, lng } = await getLatLng(results[0]);
                const mapped = mapPlaceComponentsToAddress(results[0]?.address_components || []);

                addressData = {
                    formattedAddress: selectedOption.description,
                    ...mapped,
                    longitude: lng,
                    latitude: lat,
                    validationStatus: 'CONFIRMED'
                };
            }

            onChange({
                ...value,
                ...addressData
            });
        } catch (selectionError) {
            console.error('Error selecting address:', selectionError);
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
