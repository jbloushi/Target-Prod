import useSWR from 'swr';
import { shipmentService } from '../services/api';

// Fetcher key is the array of arguments: [url, params]
const fetcher = async ([url, params]) => {
    const response = await shipmentService.getAllShipments(params);
    return response; // { data: [...], pagination: {...} }
};

export const useShipments = ({ page = 1, limit = 10, statusIn = null, q = '', organizationId = null, period = null, startDate = null, endDate = null, carrier = null, carrierCode = null, destinationCountry = null }) => {
    // Determine key: if q exists, statusIn might be ignored or combined
    const params = { page, limit, summary: true };
    if (statusIn) params.statusIn = Array.isArray(statusIn) ? statusIn.join(',') : statusIn;
    if (q) params.q = q;
    if (organizationId && organizationId !== 'all') params.organizationId = organizationId;
    if (period && period !== 'all') params.period = period;
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    if (carrier) params.carrier = carrier;
    if (carrierCode) params.carrierCode = carrierCode;
    if (destinationCountry) params.destinationCountry = destinationCountry;

    // SWR Key: unique identifier for the request
    const key = ['/api/shipments', params];

    const { data, error, isLoading, mutate } = useSWR(key, fetcher, {
        keepPreviousData: true, // Show previous page data while loading new page
        revalidateOnFocus: true,
    });

    return {
        shipments: data?.data || [],
        pagination: data?.pagination || { total: 0, page, limit, pages: 1 },
        loading: isLoading,
        error,
        mutate
    };
};
