import React from 'react';
import styled, { css } from 'styled-components';

const ButtonBase = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: var(--border-radius-base);
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  transition: var(--transition-base);
  border: none;
  outline: none;
  text-decoration: none;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  ${props => props.$variant === 'primary' && css`
    background: var(--accent-primary);
    color: var(--bg-primary);
    box-shadow: 0 2px 6px rgba(0, 217, 184, 0.2);

    &:hover:not(:disabled) {
      background: #00c4a7;
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(0, 217, 184, 0.3);
    }
  `}

  ${props => props.$variant === 'secondary' && css`
    background: transparent;
    border: 1px solid var(--border-color);
    color: var(--text-secondary);

    &:hover:not(:disabled) {
      border-color: var(--text-primary);
      color: var(--text-primary);
    }
  `}

  ${props => props.$variant === 'ghost' && css`
    background: transparent;
    color: var(--text-secondary);
    padding: 8px 12px;

    &:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.05);
      color: var(--text-primary);
    }
  `}

  ${props => props.$variant === 'icon' && css`
    width: 36px;
    height: 36px;
    padding: 0;
    border-radius: 6px;
    background: transparent;
    border: 1px solid var(--border-color);
    color: var(--text-secondary);

    &:hover:not(:disabled) {
      border-color: var(--accent-primary);
      color: var(--accent-primary);
      background: rgba(0, 217, 184, 0.05);
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
