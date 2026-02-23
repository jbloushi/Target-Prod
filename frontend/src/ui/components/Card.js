import React from 'react';
import styled, { css } from 'styled-components';

const CardBase = styled.div`
  background: var(--bg-secondary);
  border: 2px solid var(--border-color);
  border-radius: var(--border-radius-card);
  padding: 24px;
  transition: var(--transition-base);
  height: 100%;

  ${props => props.$variant === 'shipper' && css`
    border-color: var(--accent-primary);
  `}

  ${props => props.$variant === 'receiver' && css`
    border-color: var(--accent-secondary);
  `}
`;

const Title = styled.h3`
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-color);
  
  ${props => props.$variant === 'shipper' && css`
    color: var(--accent-primary);
  `}

  ${props => props.$variant === 'receiver' && css`
    color: var(--accent-secondary);
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
  border-bottom: 1px solid var(--border-color);
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
