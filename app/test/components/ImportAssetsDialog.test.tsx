// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ImportAssetsDialog,
  importFileFilters,
} from '../../src/renderer/src/components/ImportAssetsDialog';
import { assetImportError } from '../../src/renderer/src/session/asset-files';
import { makePngHeader as makePng } from './preview/png';

afterEach(cleanup);

describe('importFileFilters', () => {
  it('offers PNG images together with their .png.mcmeta sidecars for textures', () => {
    for (const subfolder of ['textures/block', 'textures/item', 'textures/gui/icons']) {
      const filters = importFileFilters(subfolder);
      expect(filters[0]?.extensions).toEqual(['png', 'mcmeta']);
      expect(filters.flatMap((filter) => filter.extensions)).toContain('mcmeta');
    }
  });

  it('offers Ogg files only for sounds', () => {
    expect(importFileFilters('sounds')).toEqual([
      { name: 'Ogg Vorbis sound', extensions: ['ogg'] },
    ]);
  });
});

describe('importing an animated texture', () => {
  it('accepts the image and its sidecar into the same folder', () => {
    const sidecar = new TextEncoder().encode('{"animation":{"frametime":2}}');
    expect(assetImportError('textures/block', 'glow.png', makePng(16, 32))).toBeUndefined();
    expect(assetImportError('textures/block', 'glow.png.mcmeta', sidecar)).toBeUndefined();
    expect(assetImportError('textures/block', 'glow.mcmeta', sidecar)).toMatch(/PNG/);
  });

  it('passes the chosen texture folder to the host, which imports the pair', async () => {
    const onImport = vi.fn(async () => null);
    render(<ImportAssetsDialog namespaces={['demo']} onImport={onImport} onCancel={vi.fn()} />);
    expect(screen.getByTestId('import-assets-dialog').textContent).toContain('.png.mcmeta');
    fireEvent.click(screen.getByTestId('import-assets-folder-item'));
    fireEvent.click(screen.getByRole('button', { name: 'Choose files…' }));
    await waitFor(() => expect(onImport).toHaveBeenCalledWith('demo', 'textures/item'));
    expect(importFileFilters('textures/item')[0]?.extensions).toContain('mcmeta');
  });
});
