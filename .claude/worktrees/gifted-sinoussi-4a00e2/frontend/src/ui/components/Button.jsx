import React from 'react';
import styled, { css } from 'styled-components';

const ButtonBase = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 24px;
  border-radius: 0.75rem;
  font-weight: 700;
  font-size: 14px;
  font-family: 'Manrope', sans-serif;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  border: none;
  outline: none;
  text-decoration: none;
  letter-spacing: 0.01em;

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
    transform: none !important;
  }

  ${props => props.$variant === 'primary' && css`
    background: var(--gradient-primary, linear-gradient(135deg, #0EA5E9 0%, #2563EB 100%));
    color: #ffffff;
    box-shadow: 0 4px 16px rgba(0, 80, 212, 0.2);

    &:hover:not(:disabled) {
      background: var(--gradient-primary-hover, linear-gradient(135deg, #38bdf8 0%, #3b82f6 100%));
      transform: translateY(-1px);
      box-shadow: 0 6px 24px rgba(0, 80, 212, 0.3), 0 0 0 4px rgba(58, 223, 250, 0.1);
    }

    &:active:not(:disabled) {
      transform: translateY(0) scale(0.98);
    }
  `}

  ${props => props.$variant === 'secondary' && css`
    background: transparent;
    border: 1px solid var(--outline-variant, rgba(169, 174, 177, 0.3));
    color: var(--on-surface, #2a2f32);

    &:hover:not(:disabled) {
      border-color: var(--primary, #0050d4);
      color: var(--primary, #0050d4);
      background: rgba(0, 80, 212, 0.04);
    }
  `}

  ${props => props.$variant === 'ghost' && css`
    background: transparent;
    color: var(--on-surface-variant, #575c60);
    padding: 8px 12px;

    &:hover:not(:disabled) {
      background: rgba(0, 80, 212, 0.04);
      color: var(--on-surface, #2a2f32);
    }
  `}

  ${props => props.$variant === 'icon' && css`
    width: 40px;
    height: 40px;
    padding: 0;
    border-radius: 12px;
    background: var(--surface-container-low, #ecf1f6);
    border: none;
    color: var(--on-surface-variant, #575c60);

    &:hover:not(:disabled) {
      color: var(--primary, #0050d4);
      background: rgba(0, 80, 212, 0.08);
      box-shadow: 0 0 0 4px rgba(58, 223, 250, 0.1);
    }
  `}

  ${props => props.$fullWidth && css`
    width: 100%;
  `}
`;

const Button = ({ children, variant = 'primary', icon, fullWidth, ...props }) => {
  return (
    <ButtonBase $variant={variant} $fullWidth={fullWidth} {...props}>
      {icon && <span className="btn-icon" style={{ display: 'flex', alignItems: 'center' }}>{icon}</span>}
      {children}
    </ButtonBase>
  );
};

export default Button;
