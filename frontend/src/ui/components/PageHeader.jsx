import React from 'react';
import styled from 'styled-components';

const HeaderContainer = styled.div`
  margin-bottom: 40px;
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
  gap: 6px;
  align-items: ${props => props.$align === 'center' ? 'center' : 'flex-start'};
`;

const Title = styled.h1`
  font-family: 'Manrope', sans-serif;
  font-size: 32px;
  font-weight: 800;
  color: var(--on-surface, #2a2f32);
  margin: 0;
  letter-spacing: -0.025em;
  line-height: 1.2;
`;

const Description = styled.p`
  font-size: 15px;
  color: var(--on-surface-variant, #575c60);
  margin: 0;
  max-width: 640px;
  line-height: 1.6;
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
