import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { useShipment } from '../context/ShipmentContext';
import {
  PageHeader,
  Card,
  Button,
  StatusPill,
  Loader,
  Alert
} from '../ui';
import ShipmentDetails from '../components/ShipmentDetails';

// --- Styled Components ---

const HeroSection = styled.div`
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: 16px;
    padding: 32px;
    margin-bottom: 32px;
    position: relative;
    overflow: hidden;

    &::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        width: 4px;
        height: 100%;
        background: var(--accent-primary);
        box-shadow: 0 0 20px 2px var(--accent-primary);
    }
`;

const HeroGrid = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 24px;
`;

const TrackingTitle = styled.h1`
    font-family: 'Outfit', sans-serif;
    font-size: 48px;
    font-weight: 800;
    color: var(--text-primary);
    margin: 0;
    line-height: 1.1;
`;

const MetaInfo = styled.div`
    display: flex;
    gap: 24px;
    margin-top: 12px;
    color: var(--text-secondary);
    font-size: 14px;
`;

const ActionStack = styled.div`
    display: flex;
    gap: 12px;
`;

const TrackingPage = () => {
  const { trackingNumber } = useParams();
  const navigate = useNavigate();
  const fetchedRef = useRef(false);

  const {
    shipment,
    loading,
    error,
    getShipment,
    updateShipmentLocation,
    getRouteDistance,
  } = useShipment();

  const [updatingLocation, setUpdatingLocation] = useState(false);
  const [locationError, setLocationError] = useState(null);

  // Get current location
  const getCurrentLocation = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by your browser'));
      } else {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            resolve({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            });
          },
          (error) => {
            let errorMessage = 'Unable to retrieve your location';
            switch (error.code) {
              case error.PERMISSION_DENIED:
                errorMessage = 'Location access was denied';
                break;
              case error.POSITION_UNAVAILABLE:
                errorMessage = 'Location information is unavailable';
                break;
              case error.TIMEOUT:
                errorMessage = 'The request to get location timed out';
                break;
              default:
                errorMessage = 'An unknown error occurred';
            }
            reject(new Error(errorMessage));
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
      }
    });
  }, []);

  // Update location with current position
  const handleUpdateLocation = async () => {
    try {
      setUpdatingLocation(true);
      setLocationError(null);

      // Get current location
      const position = await getCurrentLocation();

      // Use a geocoding service to get address from coordinates
      // For now, we'll just use the coordinates as the address
      const address = `Lat: ${position.latitude.toFixed(6)}, Lng: ${position.longitude.toFixed(6)}`;

      // Update shipment location
      await updateShipmentLocation(trackingNumber, {
        coordinates: [position.longitude, position.latitude],
        address,
        status: 'in_transit',
        description: 'Location updated by user',
      });

      // Refresh shipment data
      await getShipment(trackingNumber);

      // Refresh route distance data
      await getRouteDistance(trackingNumber);

    } catch (error) {
      console.error('Error updating location:', error);
      setLocationError(error.message);
    } finally {
      setUpdatingLocation(false);
    }
  };

  // Fetch shipment data on component mount
  useEffect(() => {
    if (!trackingNumber) return;
    fetchedRef.current = false;

    const fetchShipmentData = async () => {
      if (fetchedRef.current) return;
      fetchedRef.current = true;
      try {
        await getShipment(trackingNumber);
      } catch (error) {
        console.error('Error fetching shipment:', error);
      }
    };

    fetchShipmentData();
  }, [trackingNumber, getShipment]);

  if (loading && !shipment) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <Loader size="48px" />
      </div>
    );
  }

  if (error || (!shipment && !loading)) {
    return (
      <div style={{ maxWidth: '800px', margin: '40px auto' }}>
        <Alert type="error" title="Error">
          {error || 'Shipment not found.'}
        </Alert>
        <div style={{ marginTop: '24px' }}>
          <Button variant="primary" onClick={() => navigate('/')}>
            Back to Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Shipment Details"
        description={`Tracking Number: ${shipment.trackingNumber}`}
        action={
          <Button
            variant="primary"
            onClick={() => window.open(`${process.env.REACT_APP_API_URL}/shipments/${shipment.trackingNumber}/label`, '_blank')}
          >
            Print Label
          </Button>
        }
        secondaryAction={
          <Button variant="secondary" onClick={() => navigate('/shipments')}>
            Back to List
          </Button>
        }
      />

      <HeroSection>
        <HeroGrid>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '8px' }}>
              <TrackingTitle>{shipment.trackingNumber}</TrackingTitle>
              <StatusPill status={shipment.status} />
            </div>

            <MetaInfo>
              <span>Created: {new Date(shipment.createdAt).toLocaleDateString()}</span>
              <span>Owner: <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>{shipment.user?.name || 'Unknown'}</span></span>
            </MetaInfo>
          </div>

          <ActionStack>
            {/* Placeholder for Edit/Delete if needed in future, currently readonly view mostly */}
          </ActionStack>
        </HeroGrid>
      </HeroSection>

      <ShipmentDetails
        shipment={shipment}
        onUpdateLocation={handleUpdateLocation}
        updatingLocation={updatingLocation}
        locationError={locationError}
      />
    </div>
  );
};

export default TrackingPage;
