import React from 'react';
import { Button } from '../ui'; // Assuming Button is exported from ui
import * as XLSX from 'xlsx';
import { format } from 'date-fns';

const ExportButton = ({ data, filename = 'export', sheetName = 'Sheet1', variant = 'secondary' }) => {

    const handleExport = () => {
        if (!data || data.length === 0) {
            console.warn('No data to export');
            return;
        }

        // 1. Create a workbook
        const wb = XLSX.utils.book_new();

        // 2. Convert data to worksheet
        // Flattens objects if needed, but for now assumes flat data or handles it externally
        const ws = XLSX.utils.json_to_sheet(data);

        // 3. Append worksheet to workbook
        XLSX.utils.book_append_sheet(wb, ws, sheetName);

        // 4. Write file
        const timestamp = format(new Date(), 'yyyy-MM-dd_HHmm');
        XLSX.writeFile(wb, `${filename}_${timestamp}.xlsx`);
    };

    return (
        <Button variant={variant} onClick={handleExport}>
            Export to Excel
        </Button>
    );
};

export default ExportButton;
