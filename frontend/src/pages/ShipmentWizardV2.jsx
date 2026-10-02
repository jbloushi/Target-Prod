import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import TargetLogisticsWizard from '../components/shipment/TargetLogisticsWizard';

/**
 * ShipmentWizardV2 — Target Logistics Global Shipment Creator
 * Renders the brand-aligned Target Logistics creation & editing wizard.
 */
const ShipmentWizardV2 = () => {
    const navigate = useNavigate();
    const { trackingNumber } = useParams();

    return (
        <TargetLogisticsWizard
            mode={trackingNumber ? 'edit' : 'create'}
            shipment={trackingNumber ? { trackingNumber } : null}
            isModal={false}
            onClose={() => navigate(-1)}
            onComplete={(shipment) => {
                if (shipment?.trackingNumber) {
                    navigate(`/shipment/${shipment.trackingNumber}`);
                } else {
                    navigate('/shipments');
                }
            }}
        />
    );
};

export default ShipmentWizardV2;
