import React from 'react';
import styled from 'styled-components';
import { Select, Input, AddressPanel } from '../../ui';
import Toggle from '../../ui/components/Toggle';

const PageContainer = styled.div`
  width: 100%;
  animation: fadeIn 0.5s ease-out;
`;

const TopControls = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 24px;
  margin-bottom: 40px;
  padding: 24px;
  background: var(--surface-container-low);
  border-radius: 24px;

  @media (min-width: 768px) {
    grid-template-columns: 1fr 1fr 1fr;
    align-items: flex-end;
  }
`;

const AddressGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 32px;
  margin-bottom: 40px;
  align-items: start;

  @media (min-width: 992px) {
    grid-template-columns: 1fr 1fr;
    gap: 32px;
    /* align-items: start ensures both cards start at the same vertical position */
  }
`;

const StaffControls = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 24px;
  margin-bottom: 32px;
  padding: 24px;
  background: var(--surface-container-high);
  border-radius: 24px;
  box-shadow: var(--shadow-ambient);

  @media (min-width: 768px) {
    grid-template-columns: 1fr 1fr;
  }
`;

const ShipmentSetup = ({
    sender, setSender,
    receiver, setReceiver,
    shipmentType, setShipmentType,
    plannedDate, setPlannedDate,
    pickupRequired, setPickupRequired,
    errors,
    isStaff, clients, selectedClient, onClientChange,
    availableCarriers, selectedCarrier, onCarrierChange,
    requiredFields = { sender: [], receiver: [] },
    senderCountryLock = null
}) => {
    return (
        <PageContainer>
            {/* Staff Only Controls (Carrier & Client selection) */}
            {isStaff && (
                <StaffControls className="slide-up">
                    <Select
                        label="Create Shipment For (Organization)"
                        value={selectedClient || ''}
                        onChange={(e) => onClientChange(e.target.value)}
                    >
                        <option value="">Select an Organization...</option>
                        {clients && clients.map((client) => (
                            <option key={client.id} value={client.id}>
                                {client.name} {client.organization ? `(${client.organization.name})` : ''} — {client.email}
                            </option>
                        ))}
                    </Select>

                    <Select
                        label="Select Delivery Network"
                        value={selectedCarrier || 'DGR'}
                        onChange={(e) => onCarrierChange(e.target.value)}
                    >
                        {availableCarriers.map((carrier) => (
                            <option key={carrier.code} value={carrier.code} disabled={!carrier.active}>
                                {carrier.code === 'MANUAL' ? 'Manual Shipment' : `${carrier.name} Network`} {!carrier.active && '(Service Suspended)'}
                            </option>
                        ))}
                    </Select>
                </StaffControls>
            )}

            {/* Core shipment settings */}
            <TopControls className="slide-up" style={{ animationDelay: '100ms' }}>
                <Select
                    label="Service Type"
                    value={shipmentType || 'package'}
                    onChange={(e) => setShipmentType(e.target.value)}
                >
                    <option value="package">Standard Package</option>
                    <option value="documents">Document Express</option>
                </Select>

                <Input
                    label="Scheduled Pickup Date"
                    type="date"
                    value={plannedDate}
                    onChange={(e) => setPlannedDate(e.target.value)}
                />

                <div style={{ paddingBottom: '8px' }}>
                    <Toggle
                        label="Pickup Required?"
                        subLabel={pickupRequired ? 'Courier will collect from origin' : 'Drop-off at local service point'}
                        checked={pickupRequired}
                        onChange={setPickupRequired}
                    />
                </div>
            </TopControls>

            {/* Shipper & Receiver Address Panels */}
            <AddressGrid className="slide-up" style={{ animationDelay: '200ms' }}>
                <AddressPanel
                    title="SHIPPER (ORIGIN)"
                    type="sender"
                    variant="shipper"
                    value={sender}
                    onChange={setSender}
                    errors={errors}
                    onCopy={() => setReceiver({ ...sender })}
                    isStaff={isStaff}
                    requiredFields={requiredFields.sender}
                    countryCodeLock={senderCountryLock}
                />
                <AddressPanel
                    title="CONSIGNEE (DESTINATION)"
                    type="receiver"
                    variant="receiver"
                    value={receiver}
                    onChange={setReceiver}
                    errors={errors}
                    isStaff={isStaff}
                    requiredFields={requiredFields.receiver}
                />
            </AddressGrid>
        </PageContainer>
    );
};

export default ShipmentSetup;
