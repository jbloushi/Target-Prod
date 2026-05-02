import React from 'react';
import styled, { css } from 'styled-components';

const CardBase = styled.div`
  background: var(--surface-container-lowest, #ffffff);
  border: none;
  border-radius: var(--border-radius-card, 1rem);
  padding: 24px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: var(--shadow-ambient, 0 12px 32px -4px rgba(42, 47, 50, 0.06));
  height: 100%;

  ${props => props.$variant === 'shipper' && css`
    box-shadow: 0 0 0 2px var(--primary, #0050d4), var(--shadow-ambient);
  `}

  ${props => props.$variant === 'receiver' && css`
    box-shadow: 0 0 0 2px var(--secondary, #00628c), var(--shadow-ambient);
  `}
`;

const Title = styled.h3`
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 700;
  font-family: 'Manrope', sans-serif;
  margin-bottom: 20px;
  padding-bottom: 16px;
  color: var(--on-surface, #2a2f32);
  
  ${props => props.$variant === 'shipper' && css`
    color: var(--primary, #0050d4);
  `}

  ${props => props.$variant === 'receiver' && css`
    color: var(--secondary, #00628c);
  `}
`;

const Actions = styled.div`
  margin-left: auto;
  display: flex;
  gap: 8px;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  padding-bottom: 16px;
`;

const Card = ({ children, title, variant = 'default', actions, ...props }) => {
    return (
        <CardBase $variant={variant} {...props}>
            {title ? (
                <Header>
                    <Title $variant={variant}>{title}</Title>
                    {actions && <Actions>{actions}</Actions>}
                </Header>
            ) : null}
            {children}
        </CardBase>
    );
};

export default Card;
