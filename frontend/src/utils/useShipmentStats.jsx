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

export const useShipmentStats = (organizationIdOrParams = null, options = {}) => {
    const params = typeof organizationIdOrParams === 'object' && organizationIdOrParams !== null
        ? organizationIdOrParams
        : { organizationId: organizationIdOrParams, ...options };

    const searchParams = new URLSearchParams();
    if (params.organizationId && params.organizationId !== 'all') {
        searchParams.set('organizationId', params.organizationId);
    }
    if (params.period && params.period !== 'all') {
        searchParams.set('period', params.period);
    }
    if (params.startDate) searchParams.set('startDate', params.startDate);
    if (params.endDate) searchParams.set('endDate', params.endDate);
    if (params.carrier && params.carrier !== 'all' && params.carrier !== 'ALL') {
        searchParams.set('carrier', params.carrier);
    }
    if (params.carrierCode && params.carrierCode !== 'all' && params.carrierCode !== 'ALL') {
        searchParams.set('carrierCode', params.carrierCode);
    }

    const queryString = searchParams.toString();
    const url = queryString ? `/api/shipments/stats?${queryString}` : '/api/shipments/stats';

    const { data, error, isLoading } = useSWR(url, fetcher, {
        refreshInterval: 60000, // Refresh every minute
        revalidateOnFocus: false,
    });

    return {
        stats: data || { total: 0, pending: 0, pickedUp: 0, inTransit: 0, outForDelivery: 0, delivered: 0, exceptions: 0 },
        loading: isLoading,
        error
    };
};
