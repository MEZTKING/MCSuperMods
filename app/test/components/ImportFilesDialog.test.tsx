// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  extensionList,
  ImportFilesDialog,
} from '../../src/renderer/src/components/ImportFilesDialog';

afterEach(cleanup);

const importers = [
  { id: 'structure-nbt', displayName: 'Structure template (.nbt)', extensions: ['nbt'] },
  { id: 'sponge-schematic', displayName: 'Sponge schematic', extensions: ['schem'] },
];

describe('ImportFilesDialog', () => {
  it('lists the importers and imports into the chosen namespace', async () => {
    const onImport = vi.fn(async () => null);
    render(
      <ImportFilesDialog
        title="Import structure"
        namespaces={['demo', 'other']}
        importers={importers}
        onImport={onImport}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('dialog', { name: 'Import structure' })).toBeTruthy();
    const list = screen.getByTestId('import-files-importers');
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Structure template (.nbt) (.nbt)', 'Sponge schematic (.schem)']);
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Namespace'), 'other');
    await user.click(screen.getByRole('button', { name: 'Choose files…' }));
    await waitFor(() => expect(onImport).toHaveBeenCalledWith('other'));
  });

  it('shows what the host reports and keeps the dialog open', async () => {
    const onImport = vi.fn(async () => 'Nothing was imported:\nhut.nbt is broken.');
    render(
      <ImportFilesDialog
        namespaces={['demo']}
        importers={importers}
        onImport={onImport}
        onCancel={vi.fn()}
      />,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'Choose files…' }));
    expect((await screen.findByRole('alert')).textContent).toContain('hut.nbt is broken.');
    expect(extensionList(['nbt', 'schem'])).toBe('.nbt, .schem');
  });

  it('refuses to import without importers', async () => {
    const onImport = vi.fn(async () => null);
    render(
      <ImportFilesDialog
        namespaces={['demo']}
        importers={[]}
        onImport={onImport}
        onCancel={vi.fn()}
      />,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'Choose files…' }));
    expect((await screen.findByRole('alert')).textContent).toContain('No plugin can import files.');
    expect(onImport).not.toHaveBeenCalled();
  });
});
