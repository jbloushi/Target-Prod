import React from 'react';
import styled from 'styled-components';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
`;

const Label = styled.label`
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const InputWrapper = styled.div`
  position: relative;
  display: flex;
  align-items: center;
`;

const StyledInput = styled.input`
  width: 100%;
  padding: 12px 16px;
  padding-left: ${props => props.$hasIcon ? '42px' : '16px'};
  background: var(--bg-secondary);
  border: 1px solid ${props => props.$error ? 'var(--accent-error)' : 'var(--border-color)'};
  border-radius: var(--border-radius-base);
  color: var(--text-primary);
  font-size: 14px;
  font-family: 'DM Sans', sans-serif;
  transition: var(--transition-base);

  &:focus {
    outline: none;
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 3px rgba(0, 217, 184, 0.1);
  }

  &::placeholder {
    color: var(--text-secondary);
    opacity: 0.5;
  }
`;

const IconWrapper = styled.div`
  position: absolute;
  left: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  pointer-events: none;
`;

const ErrorText = styled.span`
  font-size: 11px;
  color: var(--accent-error);
  margin-top: 4px;
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
