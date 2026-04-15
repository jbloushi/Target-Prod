import React from 'react';
import styled from 'styled-components';
import { PageHeader } from '../ui';
import ShipmentList from '../components/ShipmentList';

const Container = styled.div`
  max-width: 1600px;
  margin: 0 auto;
  padding: 32px;
  min-height: 100vh;
  animation: fadeIn 0.4s ease;

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
`;

const ShipmentsPage = () => {
    return (
        <Container>
            <PageHeader
                title="Shipments"
                description="Manage consignment lifecycle, track deliveries, and handle exceptions."
            />

            <ShipmentList />
        </Container>
    );
};

export default ShipmentsPage;
