import React from 'react';
import styled from 'styled-components';
import { Select, Input, AddressPanel } from '../../ui';
import Toggle from '../../ui/components/Toggle';

const PageContainer = styled.div`
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 16px;
`;

const TopControls = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
  margin-bottom: 32px;

  @media (min-width: 768px) {
    grid-template-columns: 1fr 1fr auto;
  }
`;

const AddressGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 20px;
  margin-bottom: 32px;

  @media (min-width: 768px) {
    grid-template-columns: 1fr 1fr;
  }
`;

const StaffControls = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
  margin-bottom: 24px;
  padding: 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-base);

  @media (min-width: 768px) {
    grid-template-columns: 1fr 1fr;
  }
`;

const HelperText = styled.p`
  margin: 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
`;

const ContextBanner = styled.div`
  margin-bottom: 16px;
  padding: 10px 12px;
  border-radius: var(--border-radius-base);
  border: 1px solid var(--border-color);
  background: rgba(59, 130, 246, 0.08);
  color: var(--text-primary);
  font-size: 13px;
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
    requiredFields = { sender: [], receiver: [] }
}) => {
    // Inject saved addresses into sender/receiver state for the panel to use
    // Note: Ideally we pass 'savedAddresses' as a separate prop to AddressPanel
    // but AddressPanel expects values object. We can pass it via values.savedAddresses
    // or better, add a new prop to AddressPanel.
    // I updated AddressPanel to use `values.savedAddresses` logic in the previous step,
    // so I will pass it nicely.

    return (
        <PageContainer>
            {/* Disabled WizardHeader to avoid duplication with parent ShipmentWizardV2 */}
            {/* <WizardHeader 
                title="Create New Shipment"
                currentStep={1}
                totalSteps={5}
                timeEstimate="5-8 min"
            /> */}

            <ContextBanner>
                {isStaff
                    ? 'Staff mode: you can create for yourself or select a client to apply their profile and pricing policy.'
                    : 'Client mode: shipment will be created under your account and organization.'}
            </ContextBanner>

            {/* Staff Only Controls */}
            {isStaff && (
                <StaffControls>
                    <div>
                        <Select
                            label="Create Shipment For (Client)"
                            value={selectedClient || ''}
                            onChange={(e) => onClientChange(e.target.value)}
                        >
                            <option value="">Myself (Current User)</option>
                            {clients && clients.map((client) => (
                                <option key={client._id} value={client._id}>
                                    {client.name} {client.organization ? `(${client.organization.name})` : ''} - {client.email}
                                </option>
                            ))}
                        </Select>
                        <HelperText>
                            Selecting a client autofills sender details and applies that client&apos;s pricing policy.
                        </HelperText>
                    </div>

                    <Select
                        label="Carrier Adapter"
                        value={selectedCarrier || 'DGR'}
                        onChange={(e) => onCarrierChange(e.target.value)}
                    >
                        {availableCarriers.map((carrier) => (
                            <option key={carrier.code} value={carrier.code} disabled={!carrier.active}>
                                {carrier.name} {!carrier.active && '(Inactive)'}
                            </option>
                        ))}
                    </Select>
                </StaffControls>
            )}

            {/* Top Controls */}
            <TopControls>
                <Select
                    label="Shipment Type"
                    value={shipmentType || 'package'}
                    onChange={(e) => setShipmentType(e.target.value)}
                >
                    <option value="package">Package (Dutiable)</option>
                    <option value="documents">Documents (Non-Dutiable)</option>
                </Select>

                <Input
                    label="Planned Ship Date"
                    type="date"
                    value={plannedDate}
                    onChange={(e) => setPlannedDate(e.target.value)}
                />

                <div style={{ marginTop: 'auto' }}>
                    <Toggle
                        label="Pickup Required?"
                        subLabel={pickupRequired ? 'Driver will collect' : 'I will drop off'}
                        checked={pickupRequired}
                        onChange={setPickupRequired}
                    />
                </div>
            </TopControls>

            <AddressGrid>
                <AddressPanel
                    title="SHIPPER (From)"
                    type="sender"
                    variant="shipper"
                    value={sender}
                    onChange={setSender}
                    errors={errors}
                    onCopy={() => setReceiver({ ...sender })}
                    isStaff={isStaff}
                    requiredFields={requiredFields.sender}
                />
                <AddressPanel
                    title="RECEIVER (To)"
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
