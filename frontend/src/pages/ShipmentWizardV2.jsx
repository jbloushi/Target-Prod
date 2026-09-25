import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import KineticShipmentWizard from '../components/shipment/KineticShipmentWizard';

/**
 * ShipmentWizardV2 — Target Logistics Global Shipment Creator
 * Renders the DaisyUI v4 multi-carrier creation and dispatch wizard.
 */
const ShipmentWizardV2 = () => {
    const navigate = useNavigate();
    const { trackingNumber } = useParams();

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-base-300 py-4 md:py-6 px-3 md:px-6">
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
        </div>
    );
};

export default ShipmentWizardV2;
