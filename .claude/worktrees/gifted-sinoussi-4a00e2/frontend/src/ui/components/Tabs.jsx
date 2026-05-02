import React from 'react';
import styled from 'styled-components';

const TabContainer = styled.div`
  display: flex;
  gap: 2px;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 24px;
`;

const TabButton = styled.button`
  padding: 12px 24px;
  background: ${props => props.$active ? 'var(--bg-secondary)' : 'transparent'};
  color: ${props => props.$active ? 'var(--accent-primary)' : 'var(--text-secondary)'};
  border: none;
  border-bottom: 2px solid ${props => props.$active ? 'var(--accent-primary)' : 'transparent'};
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 8px;

  &:hover {
    color: var(--text-primary);
    background: var(--bg-secondary);
  }
`;

export const Tab = ({ active, onClick, children, icon }) => (
    <TabButton $active={active} onClick={onClick}>
        {icon}
        {children}
    </TabButton>
);

export const Tabs = ({ children }) => (
    <TabContainer>{children}</TabContainer>
);

export default Tabs;
