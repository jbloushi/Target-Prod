import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ExportButton from './ExportButton';

describe('ExportButton', () => {
  let createObjectUrl;
  let revokeObjectUrl;
  let clickSpy;

  beforeEach(() => {
    createObjectUrl = vi.fn(() => 'blob:csv-export');
    revokeObjectUrl = vi.fn();
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.stubGlobal('URL', {
      createObjectURL: createObjectUrl,
      revokeObjectURL: revokeObjectUrl,
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-14T10:30:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('exports CSV with escaped values and a timestamped filename', async () => {
    render(
      <ExportButton
        filename="shipments"
        sheetName="Shipment report"
        data={[
          { trackingNumber: 'DGR-1', note: 'Fragile, handle "carefully"' },
        ]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /export csv/i }));

    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    const blob = createObjectUrl.mock.calls[0][0];
    await expect(blob.text()).resolves.toContain('"Fragile, handle ""carefully"""');
    expect(document.querySelector('a[download]')).toBeNull();
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:csv-export');
  });

  it('does not create a download for empty data', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<ExportButton data={[]} />);

    fireEvent.click(screen.getByRole('button', { name: /export csv/i }));

    expect(createObjectUrl).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('No data to export');
  });
});
