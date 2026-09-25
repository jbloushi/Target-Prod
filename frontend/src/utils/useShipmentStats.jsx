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
    const response = await shipmentService.getShipmentStats(filters);
    return response.data || response;
};

export const useShipmentStats = (organizationId = null) => {
    const url = organizationId && organizationId !== 'all'
        ? `/api/shipments/stats?organizationId=${organizationId}`
        : '/api/shipments/stats';

    const { data, error, isLoading } = useSWR(url, fetcher, {
        refreshInterval: 60000, // Refresh every minute
        revalidateOnFocus: false,
    });

    return {
        stats: data || { total: 0, pending: 0, pickedUp: 0, inTransit: 0, delivered: 0, exceptions: 0 },
        loading: isLoading,
        error
    };
};
