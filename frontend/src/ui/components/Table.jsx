import React from 'react';

export const TableWrapper = ({ children, className = '', ...props }) => (
  <div className={`w-full overflow-x-auto rounded-2xl bg-base-100 border border-base-200 shadow-xs ${className}`} {...props}>
    {children}
  </div>
);

export const Table = ({ children, className = '', ...props }) => (
  <table className={`table table-sm w-full ${className}`} {...props}>
    {children}
  </table>
);

export const Thead = ({ children, className = '', ...props }) => (
  <thead className={`bg-base-200/60 text-xs text-base-content/70 ${className}`} {...props}>
    {children}
  </thead>
);

export const Tbody = ({ children, className = '', ...props }) => (
  <tbody className={`divide-y divide-base-200 text-xs ${className}`} {...props}>
    {children}
  </tbody>
);

export const Th = ({ children, className = '', style, ...props }) => (
  <th style={style} className={`text-start font-bold uppercase tracking-wider text-[11px] p-3 ${className}`} {...props}>
    {children}
  </th>
);

export const Tr = ({ children, className = '', onClick, ...props }) => (
  <tr
    onClick={onClick}
    className={`hover:bg-base-200/40 transition-colors ${onClick ? 'cursor-pointer' : ''} ${className}`}
    {...props}
  >
    {children}
  </tr>
);

export const Td = ({ children, className = '', style, colSpan, ...props }) => (
  <td style={style} colSpan={colSpan} className={`p-3 text-base-content ${className}`} {...props}>
    {children}
  </td>
);
