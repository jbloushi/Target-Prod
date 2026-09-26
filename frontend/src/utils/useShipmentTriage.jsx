import useSWR from 'swr';
import { shipmentService } from '../services/api';

const fetcher = async (url) => {
    const filters = {};
    if (url.includes('?')) {
        const query = url.split('?')[1];
        new URLSearchParams(query).forEach((val, key) => {
            filters[key] = val;
        });
    }
    const response = await shipmentService.getTriageShipments(filters);
    return response.data || response;
};

export const useShipmentTriage = (organizationId = null) => {
    const url = organizationId && organizationId !== 'all'
        ? `/api/shipments/triage?organizationId=${organizationId}`
        : '/api/shipments/triage';

    const { data, error, isLoading, mutate } = useSWR(url, fetcher, {
        refreshInterval: 30000, // Refresh every 30 seconds
        revalidateOnFocus: true,
    });

    return {
        triageItems: Array.isArray(data) ? data : (data?.data || []),
        count: Array.isArray(data) ? data.length : (data?.count || 0),
        loading: isLoading,
        error,
        mutate
    };
};
