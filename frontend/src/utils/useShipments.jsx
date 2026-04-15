import useSWR from 'swr';
import { shipmentService } from '../services/api';

// Fetcher key is the array of arguments: [url, params]
const fetcher = async ([url, params]) => {
    const response = await shipmentService.getAllShipments(params);
    return response; // { data: [...], pagination: {...} }
};

export const useShipments = ({ page = 1, limit = 10, statusIn = null, q = '' }) => {
    // Determine key: if q exists, statusIn might be ignored or combined
    const params = { page, limit, summary: true };
    if (statusIn) params.statusIn = Array.isArray(statusIn) ? statusIn.join(',') : statusIn;
    if (q) params.q = q;

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
