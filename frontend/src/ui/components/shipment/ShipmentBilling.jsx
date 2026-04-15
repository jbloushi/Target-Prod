import React from 'react';
import { Card } from '../../index';
import styled from 'styled-components';

const PlaceholderContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 32px;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  border: 2px dashed var(--border-color);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.02);
`;

const Title = styled.h3`
  color: var(--text-primary);
  font-family: 'Outfit', sans-serif;
  margin-bottom: 8px;
`;

const Subtext = styled.p`
  color: var(--text-secondary);
  text-align: center;
  max-width: 400px;
`;

const ShipmentBilling = () => {
    return (
        <Card title="Billing & Customs (Step 3)">
            <PlaceholderContainer>
                <div style={{ fontSize: '48px', opacity: 0.5 }}>💳</div>
                <Title>Billing UI Pending</Title>
                <Subtext>
                    Incoterms, Export Reason, and Payer options will be implemented here using the new `Select` and `Toggle` components.
                </Subtext>
            </PlaceholderContainer>
        </Card>
    );
};

export default ShipmentBilling;
