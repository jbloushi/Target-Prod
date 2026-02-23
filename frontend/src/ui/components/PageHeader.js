import React from 'react';
import styled from 'styled-components';

const HeaderContainer = styled.div`
  margin-bottom: 32px;
  display: flex;
  justify-content: ${props => props.$align === 'center' ? 'center' : 'space-between'};
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 16px;
  text-align: ${props => props.$align === 'center' ? 'center' : 'left'};
`;

const TitleGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: ${props => props.$align === 'center' ? 'center' : 'flex-start'};
`;

const Title = styled.h1`
  font-family: 'Outfit', sans-serif;
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
  letter-spacing: -0.02em;
`;

const Description = styled.p`
  font-size: 15px;
  color: var(--text-secondary);
  margin: 0;
  max-width: 600px;
  line-height: 1.5;
`;

const ActionGroup = styled.div`
  display: flex;
  gap: 12px;
  align-items: center;
`;

const PageHeader = ({ title, description, action, secondaryAction, align = 'left' }) => {
    return (
        <HeaderContainer $align={align}>
            <TitleGroup $align={align}>
                <Title>{title}</Title>
                {description && <Description>{description}</Description>}
            </TitleGroup>

            {(action || secondaryAction) && (
                <ActionGroup>
                    {secondaryAction}
                    {action}
                </ActionGroup>
            )}
        </HeaderContainer>
    );
};

export default PageHeader;
