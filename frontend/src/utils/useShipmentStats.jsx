import useSWR from 'swr';
import { shipmentService } from '../services/api';

const fetcher = async () => {
    const response = await shipmentService.getShipmentStats();
    return response.data || response;
};

export const useShipmentStats = () => {
    const { data, error, isLoading } = useSWR('/api/shipments/stats', fetcher, {
        refreshInterval: 60000, // Refresh every minute
        revalidateOnFocus: false,
    });

    return {
        stats: data || { total: 0, pending: 0, pickedUp: 0, inTransit: 0, delivered: 0, exceptions: 0 },
        loading: isLoading,
        error
    };
};
