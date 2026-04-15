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

const StyledSelect = styled.select`
  width: 100%;
  padding: 14px 16px;
  background: var(--surface-container-high, #dde3e8);
  border: none;
  border-radius: 0.375rem;
  color: var(--on-surface, #2a2f32);
  font-size: 14px;
  font-family: 'Manrope', sans-serif;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23575c60' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
  background-repeat: no-repeat;
  background-position: right 16px center;
  background-size: 16px;

  &:focus {
    outline: none;
    background-color: var(--surface-container-lowest, #ffffff);
    box-shadow: 0 0 0 4px rgba(123, 156, 255, 0.2);
  }
`;

const Select = ({ label, children, ...props }) => {
    return (
        <Container>
            {label && <Label>{label}</Label>}
            <StyledSelect {...props}>
                {children}
            </StyledSelect>
        </Container>
    );
};

export default Select;
