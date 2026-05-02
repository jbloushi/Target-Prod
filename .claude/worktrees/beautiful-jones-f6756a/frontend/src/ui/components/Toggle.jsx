import React from 'react';
import styled from 'styled-components';

const ToggleContainer = styled.label`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-base);
  cursor: pointer;
  user-select: none;
`;

const Switch = styled.div`
  position: relative;
  width: 44px;
  height: 24px;
  background: ${props => props.$checked ? 'var(--accent-primary)' : 'var(--border-color)'};
  border-radius: 12px;
  transition: var(--transition-base);
`;

const Slider = styled.div`
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  background: white;
  border-radius: 50%;
  transition: var(--transition-base);
  transform: ${props => props.$checked ? 'translateX(20px)' : 'translateX(0)'};
`;

const LabelContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const LabelText = styled.strong`
  font-size: 13px;
  color: var(--text-primary);
`;

const SubLabel = styled.small`
  font-size: 11px;
  color: var(--text-secondary);
`;

const HiddenInput = styled.input`
  display: none;
`;

const Toggle = ({ label, subLabel, checked, onChange }) => {
    return (
        <ToggleContainer>
            <HiddenInput type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
            <Switch $checked={checked}>
                <Slider $checked={checked} />
            </Switch>
            {(label || subLabel) && (
                <LabelContent>
                    {label && <LabelText>{label}</LabelText>}
                    {subLabel && <SubLabel>{subLabel}</SubLabel>}
                </LabelContent>
            )}
        </ToggleContainer>
    );
};

export default Toggle;
