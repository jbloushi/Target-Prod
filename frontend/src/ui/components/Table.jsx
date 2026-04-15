import styled from 'styled-components';

export const TableWrapper = styled.div`
  width: 100%;
  overflow-x: auto;
  border-radius: 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
`;

export const Table = styled.table`
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
`;

export const Thead = styled.thead`
  background: var(--bg-tertiary);
`;

export const Tbody = styled.tbody``;

export const Th = styled.th`
  text-align: left;
  padding: 14px 16px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid var(--border-color);

  &:first-child { border-radius: 10px 0 0 0; }
  &:last-child { border-radius: 0 10px 0 0; }
`;

export const Tr = styled.tr`
  transition: all 0.2s ease;
  cursor: ${props => props.onClick ? 'pointer' : 'default'};

  &:hover {
    background: var(--bg-tertiary);
  }
`;

export const Td = styled.td`
  padding: 20px 16px;
  border-bottom: 1px solid var(--border-color);
  font-size: 14px;
  color: var(--text-primary);
  
  /* Remove border from last row if needed, but standard is fine */
`;
