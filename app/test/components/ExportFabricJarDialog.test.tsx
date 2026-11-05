// @vitest-environment happy-dom
import type { ExporterOption } from '@msm/plugin-api';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  defaultOptionValues,
  ExporterOptionFields,
  ExportFabricJarDialog,
  FABRIC_JAR_GECKOLIB_NOTE,
} from '../../src/renderer/src/components/ExportFabricJarDialog';

afterEach(cleanup);

const options: ExporterOption[] = [
  {
    id: 'separateRuntime',
    label: 'Separate runtime and GeckoLib (for modpacks)',
    description: 'Leave msm_runtime and GeckoLib out of the jar.',
    type: 'boolean',
    default: false,
  },
  { id: 'compact', label: 'Compact output', type: 'boolean', default: true },
];

describe('ExporterOptionFields', () => {
  it('renders each boolean option as a labelled checkbox with its description', () => {
    render(
      <ExporterOptionFields options={options} values={{ compact: true }} onChange={vi.fn()} />,
    );
    const separate = screen.getByLabelText('Separate runtime and GeckoLib (for modpacks)') as HTMLInputElement;
    expect(separate.type).toBe('checkbox');
    expect(separate.checked).toBe(false);
    expect(screen.getByText('Leave msm_runtime and GeckoLib out of the jar.').id).toBe(
      separate.getAttribute('aria-describedby'),
    );
    const compact = screen.getByLabelText('Compact output') as HTMLInputElement;
    expect(compact.checked).toBe(true);
    expect(compact.hasAttribute('aria-describedby')).toBe(false);
  });

  it('reports changes by option id', async () => {
    const onChange = vi.fn();
    render(<ExporterOptionFields options={options} values={{}} onChange={onChange} />);
    await userEvent.setup().click(screen.getByTestId('exporter-option-separateRuntime'));
    expect(onChange).toHaveBeenCalledWith('separateRuntime', true);
  });
});

describe('ExportFabricJarDialog', () => {
  it('starts from the defaults', () => {
    expect(defaultOptionValues(options)).toEqual({ separateRuntime: false, compact: true });
  });

  it('exports with every option value, including changed ones', async () => {
    const onExport = vi.fn();
    render(<ExportFabricJarDialog options={options} onExport={onExport} onClose={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(screen.getByLabelText('Separate runtime and GeckoLib (for modpacks)'));
    await user.click(screen.getByTestId('fabric-jar-dialog-submit'));
    expect(onExport).toHaveBeenCalledWith({ separateRuntime: true, compact: true });
  });

  it('exports the defaults untouched and closes on Cancel', async () => {
    const onExport = vi.fn();
    const onClose = vi.fn();
    render(<ExportFabricJarDialog options={options} onExport={onExport} onClose={onClose} />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('fabric-jar-dialog-submit'));
    expect(onExport).toHaveBeenCalledWith({ separateRuntime: false, compact: true });
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('explains the one-off GeckoLib download only when the project has entities', () => {
    const { rerender } = render(
      <ExportFabricJarDialog options={options} onExport={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.queryByTestId('fabric-jar-geckolib-note')).toBeNull();
    rerender(
      <ExportFabricJarDialog options={options} hasEntities onExport={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByTestId('fabric-jar-geckolib-note').textContent).toBe(
      FABRIC_JAR_GECKOLIB_NOTE,
    );
  });
});
