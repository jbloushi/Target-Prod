import React from 'react';
import styled, { keyframes } from 'styled-components';

const pulse = keyframes`
  0% { transform: scale(0.8); opacity: 0.5; }
  50% { transform: scale(1.2); opacity: 1; }
  100% { transform: scale(0.8); opacity: 0.5; }
`;

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

const LoaderWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  ${props => props.$fullPage && `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(10, 14, 26, 0.7);
    backdrop-filter: blur(8px);
    z-index: 10000;
  `}
`;

const RingContainer = styled.div`
  position: relative;
  width: ${props => props.$size || '48px'};
  height: ${props => props.$size || '48px'};
`;

const BaseRing = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border: 3px solid rgba(0, 217, 184, 0.1);
  border-radius: 50%;
`;

const ActiveRing = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border: 3px solid transparent;
  border-top-color: #00d9b8;
  border-radius: 50%;
  animation: ${spin} 1s cubic-bezier(0.5, 0, 0.5, 1) infinite;
`;

const PulseCircle = styled.div`
  position: absolute;
  top: 25%;
  left: 25%;
  width: 50%;
  height: 50%;
  background: #00d9b8;
  border-radius: 50%;
  box-shadow: 0 0 15px rgba(0, 217, 184, 0.5);
  animation: ${pulse} 2s ease-in-out infinite;
`;

const LoadingText = styled.span`
  color: #00d9b8;
  font-family: 'Outfit', sans-serif;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 1px;
  text-transform: uppercase;
  opacity: 0.8;
`;

const Loader = ({ size, centered, fullPage, text }) => {
  return (
    <LoaderWrapper $fullPage={fullPage} style={centered ? { height: '100%', width: '100%', minHeight: '200px' } : {}}>
      <RingContainer $size={size}>
        <BaseRing />
        <ActiveRing />
        <PulseCircle />
      </RingContainer>
      {text && <LoadingText>{text}</LoadingText>}
    </LoaderWrapper>
  );
};

export default Loader;
