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

const ShipmentReview = () => {
    return (
        <Card title="Review & Book (Step 4)">
            <PlaceholderContainer>
                <div style={{ fontSize: '48px', opacity: 0.5 }}>📝</div>
                <Title>Review UI Pending</Title>
                <Subtext>
                    Final validation summary and mock waybill preview will be displayed here.
                </Subtext>
            </PlaceholderContainer>
        </Card>
    );
};

export default ShipmentReview;
