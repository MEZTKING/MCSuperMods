// @vitest-environment happy-dom
import type { ExporterOption } from '@msm/plugin-api';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PluginExportDialog } from '../../src/renderer/src/components/PluginExportDialog';

afterEach(cleanup);

const options: ExporterOption[] = [
  { id: 'sorted', label: 'Sort by function id', type: 'boolean', default: true },
  { id: 'verbose', label: 'Verbose', type: 'boolean', default: false },
];

describe('PluginExportDialog', () => {
  it('shows the exporter options and exports with the chosen values', async () => {
    const onExport = vi.fn();
    render(
      <PluginExportDialog
        displayName="Greeting list"
        options={options}
        onExport={onExport}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('Export Greeting list')).toBeTruthy();
    const user = userEvent.setup();
    await user.click(screen.getByLabelText('Sort by function id'));
    await user.click(screen.getByRole('button', { name: 'Export…' }));
    expect(onExport).toHaveBeenCalledWith({ sorted: false, verbose: false });
  });
});
