import React, { useEffect, useMemo, useState, useRef } from 'react';
import { getGeocode, getLatLng } from 'use-places-autocomplete';
import { useJsApiLoader } from '@react-google-maps/api';
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
    const apiKey = getGoogleMapsApiKey();
    const [inputValue, setInputValue] = useState(value?.formattedAddress || '');
    const [debouncedInput, setDebouncedInput] = useState(value?.formattedAddress || '');
    const [options, setOptions] = useState([]);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const containerRef = useRef(null);

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

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

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
                        setIsDropdownOpen(nextOptions.length > 0);
                    }
                    return;
                }

                const service = new window.google.maps.places.AutocompleteService();
                service.getPlacePredictions({ input: debouncedInput }, (predictions = []) => {
                    if (cancelled) return;

                    const nextOptions = (predictions || []).map((prediction) => ({
                        placeId: prediction.place_id,
                        description: prediction.description,
                        mainText: prediction.structured_formatting?.main_text || prediction.description,
                        secondaryText: prediction.structured_formatting?.secondary_text || ''
                    }));
                    setOptions(nextOptions);
                    setIsDropdownOpen(nextOptions.length > 0);
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

    const handleSelect = async (option) => {
        if (!option) return;
        setIsDropdownOpen(false);

        const description = option.description || option.mainText || '';
        setInputValue(description);

        try {
            let addressData = null;

            // Strategy 1: Modern Places API fetchFields
            if (option.prediction?.toPlace) {
                try {
                    const place = option.prediction.toPlace();
                    await place.fetchFields({
                        fields: ['addressComponents', 'formattedAddress', 'location']
                    });

                    const mapped = mapPlaceComponentsToAddress(place.addressComponents || []);
                    const lat = place.location?.lat();
                    const lng = place.location?.lng();

                    addressData = {
                        formattedAddress: place.formattedAddress || description,
                        ...mapped,
                        latitude: typeof lat === 'number' ? lat : undefined,
                        longitude: typeof lng === 'number' ? lng : undefined,
                        validationStatus: 'CONFIRMED'
                    };
                } catch (placeErr) {
                    console.debug('Modern place fetch failed, trying Geocoder fallback:', placeErr.message);
                }
            }

            // Strategy 2: Google Maps Geocoder by placeId or address
            if (!addressData && window.google?.maps?.Geocoder) {
                try {
                    const geocoder = new window.google.maps.Geocoder();
                    const geocodeReq = option.placeId
                        ? { placeId: option.placeId }
                        : { address: description };

                    const geoResult = await new Promise((resolve, reject) => {
                        geocoder.geocode(geocodeReq, (results, status) => {
                            if (status === 'OK' && results && results[0]) {
                                resolve(results[0]);
                            } else {
                                reject(new Error(`Geocoder status: ${status}`));
                            }
                        });
                    });

                    if (geoResult) {
                        const mapped = mapPlaceComponentsToAddress(geoResult.address_components || []);
                        const lat = geoResult.geometry?.location?.lat();
                        const lng = geoResult.geometry?.location?.lng();
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
                const parts = description.split(/\s*[-–—,]\s*/).map(p => p.trim()).filter(Boolean);
                let detectedCountry = null;
                let detectedCountryCode = '';
                let detectedCity = '';

                for (let i = parts.length - 1; i >= 0; i--) {
                    const candidate = parts[i];
                    const matched = countries.find(c =>
                        c.name.toLowerCase() === candidate.toLowerCase() ||
                        c.code.toLowerCase() === candidate.toLowerCase()
                    );
                    if (matched) {
                        detectedCountry = matched.name;
                        detectedCountryCode = matched.code;
                        if (i > 0) {
                            detectedCity = parts[i - 1];
                        }
                        break;
                    }
                }

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

                detectedCity = String(detectedCity || '').trim().substring(0, 45);
                const cObj = countries.find(c => c.code === detectedCountryCode) || countries.find(c => c.name === detectedCountry);

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

    const handleInputChange = (e) => {
        const nextVal = e.target.value;
        setInputValue(nextVal);
        setIsDropdownOpen(true);
        if (typeof onChange === 'function') {
            onChange({
                ...value,
                formattedAddress: nextVal,
                validationStatus: apiKey && isLoaded ? value?.validationStatus : 'MANUAL'
            });
        }
    };

    return (
        <div ref={containerRef} className="relative w-full space-y-1">
            {label && (
                <label className="block text-xs font-bold text-base-content/70">
                    {label} {required && <span className="text-error">*</span>}
                </label>
            )}

            <div className="relative">
                <span className="material-symbols-outlined absolute start-3 top-1/2 -translate-y-1/2 text-primary/70 text-lg pointer-events-none">
                    search
                </span>

                <input
                    type="text"
                    value={inputValue}
                    onChange={handleInputChange}
                    onFocus={() => {
                        if (options.length > 0) setIsDropdownOpen(true);
                    }}
                    placeholder="Type street, landmark, building, city, or PACI..."
                    disabled={disabled}
                    className={`input input-bordered w-full ps-10 pe-10 text-xs font-medium bg-base-100 ${
                        error ? 'input-error' : ''
                    }`}
                />

                {(loadingSuggestions || (apiKey && !isLoaded)) && (
                    <span className="loading loading-spinner loading-xs text-primary absolute end-3 top-1/2 -translate-y-1/2" />
                )}
            </div>

            {helperMessage && (
                <div className={`text-[11px] ${error ? 'text-error font-medium' : 'text-base-content/50'}`}>
                    {helperMessage}
                </div>
            )}

            {/* Floating Suggestions Dropdown */}
            {isDropdownOpen && options.length > 0 && (
                <ul className="absolute top-full start-0 end-0 mt-1 bg-base-100 border border-base-200 rounded-xl shadow-xl z-[999] max-h-60 overflow-y-auto divide-y divide-base-200/60 p-1">
                    {options.map((opt) => (
                        <li
                            key={opt.placeId}
                            onClick={() => handleSelect(opt)}
                            className="px-3 py-2.5 hover:bg-base-200/70 rounded-lg cursor-pointer flex items-center gap-2.5 transition-colors"
                        >
                            <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined text-sm">location_on</span>
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-xs font-bold text-base-content truncate">
                                    {opt.mainText || opt.description}
                                </div>
                                {opt.secondaryText && (
                                    <div className="text-[11px] text-base-content/50 truncate">
                                        {opt.secondaryText}
                                    </div>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default GoogleAddressInput;
