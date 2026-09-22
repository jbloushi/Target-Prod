import React, { useState } from 'react';
import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { TK } from '../tokens/kineticHorizon';

const PageContainer = styled.div`
  max-width: 960px;
  margin: 0 auto;
  padding: 40px 24px 60px;
  min-height: 80vh;
  display: flex;
  flex-direction: column;
  align-items: center;
`;

const HeroBadge = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 14px;
  border-radius: 99px;
  background: ${TK.primaryBg};
  color: ${TK.primary};
  font-size: 12.5px;
  font-weight: 700;
  border: 1px solid #c7d7fe;
  margin-bottom: 16px;
`;

const HeroTitle = styled.h1`
  font-size: 32px;
  font-weight: 800;
  color: ${TK.text1};
  letter-spacing: -0.03em;
  text-align: center;
  margin: 0 0 8px;
`;

const HeroSubtitle = styled.p`
  font-size: 15px;
  color: ${TK.text2};
  text-align: center;
  max-width: 580px;
  margin: 0 0 32px;
  line-height: 1.5;
`;

const SearchCard = styled.div`
  width: 100%;
  background: #ffffff;
  border-radius: 20px;
  border: 1px solid ${TK.border};
  padding: 24px;
  box-shadow: 0 4px 20px rgba(0, 80, 212, 0.05);
  margin-bottom: 24px;
`;

const SearchForm = styled.form`
  display: flex;
  gap: 12px;

  @media (max-width: 640px) {
    flex-direction: column;
  }
`;

const InputWrapper = styled.div`
  position: relative;
  flex: 1;
`;

const TrackingInput = styled.input`
  width: 100%;
  padding: 14px 16px 14px 44px;
  border-radius: 12px;
  border: 1.5px solid ${props => props.$hasError ? TK.error : TK.border};
  background: #ffffff;
  font-size: 15px;
  font-weight: 600;
  color: ${TK.text1};
  font-family: 'Outfit', -apple-system, sans-serif;
  letter-spacing: 0.02em;
  outline: none;
  box-sizing: border-box;
  transition: all 0.15s;

  &:focus {
    border-color: ${TK.primary};
    box-shadow: 0 0 0 3px rgba(0, 80, 212, 0.12);
  }

  &::placeholder {
    font-weight: 400;
    color: ${TK.text3};
  }
`;

const SubmitButton = styled.button`
  padding: 14px 28px;
  border-radius: 12px;
  border: none;
  background: ${TK.primary};
  color: #ffffff;
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  box-shadow: 0 2px 10px rgba(0, 80, 212, 0.25);
  transition: all 0.15s;
  flex-shrink: 0;

  &:hover {
    background: ${TK.primaryDark};
    transform: translateY(-1px);
  }
`;

const QuickLinksSection = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 40px;
`;

const QuickPill = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 14px;
  border-radius: 10px;
  border: 1px solid ${TK.border};
  background: #ffffff;
  color: ${TK.text1};
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    border-color: ${TK.primary};
    background: ${TK.primaryBg};
    color: ${TK.primary};
    transform: translateY(-1px);
  }
`;

const FeatureGrid = styled.div`
  width: 100%;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
`;

const FeatureCard = styled.div`
  background: #ffffff;
  border-radius: 16px;
  border: 1px solid ${TK.border};
  padding: 20px;
  display: flex;
  gap: 14px;
  align-items: flex-start;
`;

const FeatureIconBox = styled.div`
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: ${props => props.$bg || TK.primaryBg};
  color: ${props => props.$color || TK.primary};
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`;

const DEMO_QUICK_SEARCHES = [
  {
    tracking: 'DGR-KW-DEMO-001',
    label: 'DGR Perfume to London (Pending Review)',
    tag: 'DHL DGR'
  },
  {
    tracking: 'TRK-KW-TRANSIT-005',
    label: 'Air Express to Dubai (In Transit)',
    tag: '4 Checkpoints'
  },
  {
    tracking: 'TRK-KW-DELIVERED-007',
    label: 'Bader Trading Kuwait (Delivered + POD)',
    tag: 'Signed'
  },
  {
    tracking: 'TRK-KW-READY-002',
    label: 'Electronics to Riyadh (Ready for Pickup)',
    tag: 'Scheduled'
  }
];

const TrackingLandingPage = () => {
  const [trackingNumber, setTrackingNumber] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSearch = (tn) => {
    const trimmed = (tn || trackingNumber).trim();
    if (!trimmed) {
      setError('Please enter a valid tracking number.');
      return;
    }
    setError('');
    navigate(`/shipment/${trimmed}`);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    handleSearch();
  };

  return (
    <PageContainer>
      <HeroBadge>
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>radar</span>
        Live Consignment Intelligence
      </HeroBadge>

      <HeroTitle>Real-Time Shipment Tracking</HeroTitle>
      <HeroSubtitle>
        Monitor air cargo flights, customs milestones, regional GCC handoffs, and digital Proof of Delivery signatures.
      </HeroSubtitle>

      {/* Main Search Bar Card */}
      <SearchCard>
        <SearchForm onSubmit={handleSubmit}>
          <InputWrapper>
            <span
              className="material-symbols-outlined"
              style={{
                position: 'absolute',
                left: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: 22,
                color: TK.text3
              }}
            >
              barcode_scanner
            </span>
            <TrackingInput
              placeholder="Enter Consignment or Air Waybill # (e.g. DGR-KW-DEMO-001)"
              value={trackingNumber}
              onChange={e => {
                setTrackingNumber(e.target.value);
                if (error) setError('');
              }}
              $hasError={Boolean(error)}
              autoFocus
            />
            {trackingNumber && (
              <button
                type="button"
                onClick={() => setTrackingNumber('')}
                style={{
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: TK.text3,
                  display: 'flex'
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
              </button>
            )}
          </InputWrapper>

          <SubmitButton type="submit">
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>travel_explore</span>
            Track Consignment
          </SubmitButton>
        </SearchForm>

        {error && (
          <div style={{
            color: TK.error,
            fontSize: 12.5,
            fontWeight: 600,
            marginTop: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 5
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>error</span>
            {error}
          </div>
        )}
      </SearchCard>

      {/* Demo Quick Search Pills */}
      <QuickLinksSection>
        <div style={{ fontSize: 12, fontWeight: 700, color: TK.text3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Showcase Demonstrations & Recent Searches
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {DEMO_QUICK_SEARCHES.map(item => (
            <QuickPill
              key={item.tracking}
              type="button"
              onClick={() => handleSearch(item.tracking)}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: TK.primary }}>
                local_shipping
              </span>
              <span>{item.tracking}</span>
              <span style={{
                fontSize: 11,
                color: TK.text3,
                background: TK.surfaceAlt,
                padding: '2px 6px',
                borderRadius: 4
              }}>
                {item.tag}
              </span>
            </QuickPill>
          ))}
        </div>
      </QuickLinksSection>

      {/* Feature Highlights Grid */}
      <FeatureGrid>
        <FeatureCard>
          <FeatureIconBox $bg="#e0f2fe" $color="#0284c7">
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>flight_takeoff</span>
          </FeatureIconBox>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: TK.text1 }}>Carrier Multi-Network</div>
            <div style={{ fontSize: 12.5, color: TK.text2, marginTop: 3, lineHeight: 1.4 }}>
              Direct integration with DHL Express, Aramex, LogesTechs, and local Kuwait courier fleets.
            </div>
          </div>
        </FeatureCard>

        <FeatureCard>
          <FeatureIconBox $bg="#d1fae5" $color="#059669">
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>verified</span>
          </FeatureIconBox>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: TK.text1 }}>Digital Proof of Delivery</div>
            <div style={{ fontSize: 12.5, color: TK.text2, marginTop: 3, lineHeight: 1.4 }}>
              On-glass customer signature capture, recipient name logging, and GPS delivery coordinates.
            </div>
          </div>
        </FeatureCard>

        <FeatureCard>
          <FeatureIconBox $bg="#fef3c7" $color="#b45309">
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>warning</span>
          </FeatureIconBox>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: TK.text1 }}>DGR Regulatory Control</div>
            <div style={{ fontSize: 12.5, color: TK.text2, marginTop: 3, lineHeight: 1.4 }}>
              IATA Dangerous Goods inspection, UN codes, packing group compliance, and carrier approval gate.
            </div>
          </div>
        </FeatureCard>
      </FeatureGrid>
    </PageContainer>
  );
};

export default TrackingLandingPage;
