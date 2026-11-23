// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  extensionList,
  ImportFilesDialog,
  TEST_WORLDS_IMPORT_NOTE,
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

  it("defaults to the project's own namespace, not minecraft", async () => {
    const onImport = vi.fn(async () => null);
    render(
      <ImportFilesDialog
        namespaces={['minecraft', 'sky']}
        importers={importers}
        onImport={onImport}
        onCancel={vi.fn()}
      />,
    );
    expect((screen.getByLabelText('Namespace') as HTMLSelectElement).value).toBe('sky');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Choose files…' }));
    await waitFor(() => expect(onImport).toHaveBeenCalledWith('sky'));
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

  it('brings builds from my test worlds into the chosen namespace (ADR 0116 D3)', async () => {
    const saves = [
      { world: 'msm-test-demo', id: 'demo:hut', size: 3, lastModified: 'x' },
      { world: 'msm-game-demo', id: 'demo:houses/tower', size: 5, lastModified: 'x' },
    ];
    const importSaves = vi.fn(async () => null);
    const onImport = vi.fn(async () => null);
    render(
      <ImportFilesDialog
        title="Import structure"
        namespaces={['demo', 'other']}
        importers={importers}
        onImport={onImport}
        onCancel={vi.fn()}
        testWorlds={{ list: async () => saves, importSaves }}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: 'From my test worlds' }));
    expect(await screen.findByText('Bring builds from my test worlds')).toBeTruthy();
    expect(screen.getByTestId('import-test-worlds-note').textContent).toBe(TEST_WORLDS_IMPORT_NOTE);
    await user.click(screen.getByRole('button', { name: 'Bring builds' }));
    expect(screen.getByRole('alert').textContent).toBe('Choose at least one build.');
    await user.click(screen.getByTestId('import-test-world-save-msm-game-demo/demo:houses/tower'));
    await user.selectOptions(screen.getByLabelText('Namespace'), 'other');
    await user.click(screen.getByRole('button', { name: 'Bring builds' }));
    await waitFor(() => expect(importSaves).toHaveBeenCalledWith('other', [saves[1]]));
    expect(onImport).not.toHaveBeenCalled();
  });

  it('says how to save a build when the test worlds have none', async () => {
    render(
      <ImportFilesDialog
        namespaces={['demo']}
        importers={importers}
        onImport={vi.fn(async () => null)}
        onCancel={vi.fn()}
        testWorlds={{ list: async () => [], importSaves: vi.fn(async () => null) }}
      />,
    );
    await userEvent.setup().click(screen.getByRole('tab', { name: 'From my test worlds' }));
    expect((await screen.findByTestId('import-test-worlds-empty')).textContent).toContain(
      'structure block',
    );
    expect(screen.getByRole('button', { name: 'Bring builds' }).hasAttribute('disabled')).toBe(
      true,
    );
  });
});
