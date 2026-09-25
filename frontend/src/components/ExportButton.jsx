import React from 'react';
import { format } from 'date-fns';

const ExportButton = ({
    data,
    filename = 'export',
    sheetName = 'Sheet1',
    variant = 'secondary',
    className = '',
    size = 'sm'
}) => {
    const flattenValue = (value) => {
        if (value === null || value === undefined) return '';
        if (value instanceof Date) return value.toISOString();
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value);
    };

    const escapeCsvValue = (value) => {
        const text = flattenValue(value);
        if (/[",\r\n]/.test(text)) {
            return `"${text.replace(/"/g, '""')}"`;
        }
        return text;
    };

    const handleExport = () => {
        if (!data || data.length === 0) {
            console.warn('No data to export');
            return;
        }

        const headers = Array.from(
            data.reduce((keys, row) => {
                Object.keys(row || {}).forEach((key) => keys.add(key));
                return keys;
            }, new Set())
        );

        const rows = data.map((row) => headers.map((header) => escapeCsvValue(row?.[header])).join(','));
        const csv = [headers.map(escapeCsvValue).join(','), ...rows].join('\r\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = `${filename}_${format(new Date(), 'yyyy-MM-dd_HHmm')}.csv`;
        link.setAttribute('aria-label', `Download ${sheetName} export`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        URL.revokeObjectURL(url);
    };

    const variantClass = variant === 'primary' 
        ? 'btn-primary' 
        : variant === 'outline' 
            ? 'btn-outline' 
            : 'btn-outline btn-neutral';

    const sizeClass = size === 'xs' ? 'btn-xs' : size === 'sm' ? 'btn-sm' : '';

    return (
        <button
            type="button"
            className={`btn ${sizeClass} ${variantClass} gap-1.5 font-bold shadow-xs ${className}`}
            onClick={handleExport}
        >
            <span className="material-symbols-outlined text-sm">download</span>
            Export CSV
        </button>
    );
};

export default ExportButton;
