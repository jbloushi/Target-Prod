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
    Paper
} from '@mui/material';

import LocationOnIcon from '@mui/icons-material/LocationOn';
import SearchIcon from '@mui/icons-material/Search';

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
    label = 'Search Address (Google)',
    disabled,
    required,
    error,
    helperText
}) => {
    const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
    const [inputValue, setInputValue] = useState(value?.formattedAddress || '');
    const [debouncedInput, setDebouncedInput] = useState(value?.formattedAddress || '');
    const [options, setOptions] = useState([]);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);

    useEffect(() => {
        if (!apiKey) {
            console.error(
                'GOOGLE MAPS API KEY MISSING. Address autofill will not work. ' +
                'Set REACT_APP_GOOGLE_MAPS_API_KEY in your .env file.'
            );
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
            if (!isLoaded || !debouncedInput || debouncedInput.length < 2) {
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
    }, [debouncedInput, isLoaded]);

    const handleSelect = async (selectedOption) => {
        if (!selectedOption) return;

        setInputValue(selectedOption.description);

        try {
            let addressData;

            if (selectedOption.prediction?.toPlace) {
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
        if (loadError) return `Google Maps Error: ${loadError.message}`;
        return undefined;
    }, [helperText, loadError]);

    return (
        <Box>
            <MuiAutocomplete
                componentsProps={{
                    popper: {
                        style: { zIndex: 10000 }
                    }
                }}
                freeSolo
                disabled={disabled || !isLoaded || !apiKey}
                options={options}
                getOptionLabel={(option) => option?.description || ''}
                filterOptions={(x) => x}
                inputValue={inputValue}
                onInputChange={(event, newValue) => {
                    setInputValue(newValue || '');
                }}
                onChange={(event, selectedOption) => {
                    if (selectedOption) {
                        handleSelect(selectedOption);
                    }
                }}
                renderInput={(params) => (
                    <>
                        <TextField
                            {...params}
                            label={label}
                            disabled={disabled || !isLoaded || !apiKey}
                            required={required}
                            error={!!error || !apiKey || !!loadError}
                            helperText={helperMessage}
                            InputProps={{
                                ...params.InputProps,
                                startAdornment: <SearchIcon color="action" sx={{ mr: 1 }} />,
                                endAdornment: (
                                    <>
                                        {(loadingSuggestions || !isLoaded) && <CircularProgress size={20} />}
                                        {params.InputProps.endAdornment}
                                    </>
                                )
                            }}
                        />
                        {(!apiKey || loadError) && (
                            <Box mt={1}>
                                <Alert severity="error">
                                    {loadError ? `Google Maps Error: ${loadError.message}` : 'Google Maps API Key is missing. Autofill disabled.'}
                                </Alert>
                            </Box>
                        )}
                    </>
                )}
                renderOption={(props, option) => (
                    <li {...props} key={option.placeId} style={{ padding: '10px 16px' }}>
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
                                <LocationOnIcon sx={{ color: '#00d9b8', fontSize: 20 }} />
                            </Box>
                            <Box sx={{ flexGrow: 1 }}>
                                <Typography variant="body1" sx={{ fontWeight: 600, color: '#e0e0e0' }}>
                                    {option.mainText || option.description}
                                </Typography>
                                <Typography variant="caption" sx={{ color: '#aaa', display: 'block' }}>
                                    {option.secondaryText}
                                </Typography>
                            </Box>
                        </Box>
                    </li>
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
        </Box>
    );
};

export default GoogleAddressInput;
