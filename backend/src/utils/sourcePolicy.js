const DEFAULT_ALLOWED_SOURCE_COUNTRIES = ['KW'];

const normalizeCountryCodes = (countries = []) => {
    const normalized = Array.isArray(countries)
        ? countries.map((code) => String(code || '').trim().toUpperCase()).filter(Boolean)
        : [];

    return Array.from(new Set(normalized));
};

const resolveOrgAllowedCarriers = (organization, fallbackCarrierCodes = []) => {
    const raw = organization?.allowedCarriers;

    if (Array.isArray(raw)) {
        return raw.map((c) => String(c).toUpperCase());
    }

    if (raw && typeof raw === 'object' && Array.isArray(raw.carriers)) {
        return raw.carriers.map((c) => String(c).toUpperCase());
    }

    return fallbackCarrierCodes.map((c) => String(c).toUpperCase());
};

const resolveSourcePolicy = (organization) => {
    const raw = organization?.allowedCarriers;
    const configuredPolicy = raw && typeof raw === 'object' ? raw.sourcePolicy : null;

    const mode = configuredPolicy?.mode === 'all' ? 'all' : 'restricted';
    const configuredCountries = normalizeCountryCodes(configuredPolicy?.countries);
    const countries = configuredCountries.length > 0
        ? configuredCountries
        : DEFAULT_ALLOWED_SOURCE_COUNTRIES;

    return { mode, countries };
};

const enforceSourceCountryPolicy = (sourceAddress = {}, organization) => {
    const safeSourceAddress = sourceAddress && typeof sourceAddress === 'object' ? sourceAddress : {};
    const policy = resolveSourcePolicy(organization);
    const requested = String(safeSourceAddress?.countryCode || '').toUpperCase();

    if (policy.mode === 'all') {
        return {
            ...safeSourceAddress,
            countryCode: requested || safeSourceAddress?.countryCode || ''
        };
    }

    const allowedCountry = policy.countries[0] || DEFAULT_ALLOWED_SOURCE_COUNTRIES[0];
    if (requested && !policy.countries.includes(requested)) {
        const error = new Error(`Source country ${requested} is not allowed. Allowed source countries: ${policy.countries.join(', ')}`);
        error.statusCode = 400;
        throw error;
    }

    return {
        ...safeSourceAddress,
        countryCode: allowedCountry
    };
};

module.exports = {
    DEFAULT_ALLOWED_SOURCE_COUNTRIES,
    resolveOrgAllowedCarriers,
    resolveSourcePolicy,
    enforceSourceCountryPolicy
};
