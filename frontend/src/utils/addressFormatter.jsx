/**
 * Reusable Address Formatter
 * Standardizes how sender/receiver data is displayed across the wizard.
 */

const countries = {
    'KW': 'Kuwait',
    'AE': 'United Arab Emirates',
    'SA': 'Saudi Arabia',
    'QA': 'Qatar',
    'BH': 'Bahrain',
    'OM': 'Oman',
    'IN': 'India',
    'US': 'United States',
    'GB': 'United Kingdom',
    'DE': 'Germany',
    'FR': 'France',
    'IT': 'Italy',
    'CA': 'Canada',
    'CN': 'China',
    'JP': 'Japan',
    'AU': 'Australia',
    'RU': 'Russia',
    'TR': 'Turkey',
    'EG': 'Egypt',
    'PH': 'Philippines',
    'PK': 'Pakistan',
    'BD': 'Bangladesh',
    'NG': 'Nigeria',
    'ZA': 'South Africa',
    'BR': 'Brazil',
    'MX': 'Mexico',
    'ID': 'Indonesia',
    'ES': 'Spain',
    'NL': 'Netherlands',
    'SE': 'Sweden',
    'CH': 'Switzerland',
    'BE': 'Belgium',
    'PL': 'Poland',
    'TH': 'Thailand',
    'VN': 'Vietnam',
    'MY': 'Malaysia',
    'KR': 'South Korea',
};

export const formatPartyAddress = (party) => {
    if (!party) return {};

    const countryName = countries[party.countryCode] || party.countryCode || '';

    return {
        company: party.company || '',
        contact: party.contactPerson || '',
        phone: `${party.phoneCountryCode || ''} ${party.phone || ''}`.trim(),
        email: party.email || '',
        building: [
            party.buildingName,
            party.unitNumber ? `Unit/Floor ${party.unitNumber}` : ''
        ].filter(Boolean).join(', '),
        street: (party.streetLines || []).filter(Boolean).join(', ') || party.formattedAddress || '',
        area: party.area || '',
        location: [
            party.area, // District/Area/Block
            party.city,
            party.state,
            party.postalCode
        ].filter(Boolean).join(', '),
        city: party.city || '',
        state: party.state || '',
        postalCode: party.postalCode || '',
        country: countryName ? `${countryName} (${party.countryCode})` : party.countryCode,
        landmark: party.landmark || '',
        vatNumber: party.vatNumber || '',
        reference: party.reference || '',
        raw: party
    };
};
