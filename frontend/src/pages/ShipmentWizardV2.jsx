import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import KineticShipmentWizard from '../components/shipment/KineticShipmentWizard';
import { Box } from '@mui/material';
import { TK } from '../tokens/kineticHorizon';

/**
 * ShipmentWizardV2 — Target Logistics Global Shipment Creator
 * Renders the reference Kinetic Horizon 6-step creation wizard.
 */
const ShipmentWizardV2 = () => {
    const navigate = useNavigate();
    const { trackingNumber } = useParams();

    return (
        <Box sx={{
            minHeight: '100vh',
            bgcolor: TK.surface,
            py: { xs: 2, md: 4 },
            px: { xs: 1.5, md: 3 }
        }}>
            <KineticShipmentWizard
                editing={trackingNumber ? { trackingNumber } : null}
                onClose={() => navigate(-1)}
                onComplete={(shipment) => {
                    if (shipment?.trackingNumber) {
                        navigate(`/shipment/${shipment.trackingNumber}`);
                    } else {
                        navigate('/shipments');
                    }
                }}
            />
        </Box>
    );
};

export default ShipmentWizardV2;
