import React, { useState } from 'react';
import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { PageHeader, Card, Button, Input } from '../ui';

const ContentGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 24px;
  max-width: 720px;
  margin: 0 auto;
  width: 100%;
`;

const FormGrid = styled.form`
  display: grid;
  gap: 16px;
`;

const HelperText = styled.p`
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
`;

const PublicTrackingLandingPage = () => {
  const [trackingNumber, setTrackingNumber] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = (event) => {
    event.preventDefault();
    const trimmed = trackingNumber.trim();

    if (!trimmed) {
      setError('Enter a tracking number to continue.');
      return;
    }

    setError('');
    navigate(`/track/${trimmed}`);
  };

  return (
    <div>
      <PageHeader
        title="Track a Shipment"
        description="Enter a tracking number to view the latest location and updates."
        align="center"
      />

      <ContentGrid>
        <Card>
          <FormGrid onSubmit={handleSubmit}>
            <Input
              label="Tracking Number"
              placeholder="e.g. TRK-2024-0001"
              value={trackingNumber}
              onChange={(event) => setTrackingNumber(event.target.value)}
              error={error}
            />

            <HelperText>
              Tracking updates are available for public shipments. Contact support if your shipment is private.
            </HelperText>

            <Button type="submit" variant="primary">
              Track Shipment
            </Button>
          </FormGrid>
        </Card>
      </ContentGrid>
    </div>
  );
};

export default PublicTrackingLandingPage;
