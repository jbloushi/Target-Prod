import React from 'react';
import styled from 'styled-components';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
`;

const Label = styled.label`
  font-size: 11px;
  font-weight: 700;
  color: var(--on-surface-variant, #575c60);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-family: 'Manrope', sans-serif;
`;

const InputWrapper = styled.div`
  position: relative;
  display: flex;
  align-items: center;
`;

const StyledInput = styled.input`
  width: 100%;
  padding: 14px 16px;
  padding-left: ${props => props.$hasIcon ? '44px' : '16px'};
  background: var(--surface-container-high, #dde3e8);
  border: none;
  border-radius: 0.375rem;
  color: var(--on-surface, #2a2f32);
  font-size: 14px;
  font-family: 'Manrope', sans-serif;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);

  &:focus {
    outline: none;
    background: var(--surface-container-lowest, #ffffff);
    box-shadow: 0 0 0 4px rgba(123, 156, 255, 0.2);
  }

  &::placeholder {
    color: var(--outline-variant, #a9aeb1);
    opacity: 1;
  }

  ${props => props.$error && `
    box-shadow: 0 0 0 3px rgba(179, 27, 37, 0.15);
  `}
`;

const IconWrapper = styled.div`
  position: absolute;
  left: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--on-surface-variant, #575c60);
  pointer-events: none;
`;

const ErrorText = styled.span`
  font-size: 11px;
  color: var(--error, #b31b25);
  font-weight: 600;
  margin-top: 2px;
`;

const Input = ({ label, icon, error, ...props }) => {
    return (
        <Container>
            {label && <Label>{label}</Label>}
            <InputWrapper>
                {icon && <IconWrapper>{icon}</IconWrapper>}
                <StyledInput $hasIcon={!!icon} $error={!!error} {...props} />
            </InputWrapper>
            {error && <ErrorText>{error}</ErrorText>}
        </Container>
    );
};

export default Input;
