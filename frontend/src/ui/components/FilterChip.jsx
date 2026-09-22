import React from 'react';
import styled, { css } from 'styled-components';

const ChipBase = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 16px;
  border-radius: var(--md-shape-corner-small, 8px);
  font-family: var(--font-family-sans, 'Manrope', sans-serif);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  outline: none;
  border: 1px solid var(--outline-variant, rgba(169, 174, 177, 0.25));
  background: var(--md-sys-color-surface-container-lowest, #ffffff);
  color: var(--md-sys-color-on-surface, #2a2f32);
  user-select: none;

  &:hover:not(:disabled) {
    background: var(--md-sys-color-surface-container-low, #f1f5f9);
    border-color: var(--md-sys-color-primary, #0050d4);
  }

  &:active:not(:disabled) {
    transform: scale(0.97);
  }

  ${props => props.$selected && css`
    background: var(--md-sys-color-primary-container, #dbeafe) !important;
    color: var(--md-sys-color-on-primary-container, #1e3a8a) !important;
    border-color: var(--md-sys-color-primary, #0050d4) !important;
    font-weight: 700;
  `}

  ${props => props.$elevated && css`
    box-shadow: var(--shadow-ambient, 0 4px 12px rgba(42, 47, 50, 0.05));
    border-color: transparent;
  `}

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`;

const IconWrapper = styled.span`
  display: inline-flex;
  align-items: center;
  font-size: 18px;
  margin-left: -4px;
  rtl:margin-left: 0;
  rtl:margin-right: -4px;
`;

export const FilterChip = ({ label, selected = false, onClick, icon, count, disabled = false, ...props }) => {
  return (
    <ChipBase
      type="button"
      $selected={selected}
      onClick={onClick}
      disabled={disabled}
      {...props}
    >
      {icon && <IconWrapper className="material-symbols-outlined">{icon}</IconWrapper>}
      <span>{label}</span>
      {count !== undefined && count !== null && (
        <span
          style={{
            fontSize: '11px',
            padding: '1px 6px',
            borderRadius: '9999px',
            background: selected ? 'var(--md-sys-color-primary, #0050d4)' : 'rgba(0,0,0,0.06)',
            color: selected ? '#ffffff' : 'inherit',
            fontWeight: 700
          }}
        >
          {count}
        </span>
      )}
    </ChipBase>
  );
};

export default FilterChip;
