// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ImportAssetsDialog,
  importFileFilters,
  importSubfolder,
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

  it('offers .vsh, .fsh and .glsl files for shaders (ADR 0106 D2)', () => {
    for (const subfolder of ['shaders', 'shaders/post', 'shaders/include']) {
      expect(importFileFilters(subfolder)).toEqual([
        { name: 'Shader source (.vsh, .fsh, .glsl)', extensions: ['vsh', 'fsh', 'glsl'] },
      ]);
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

describe('importing shader files (ADR 0106 D2)', () => {
  it('maps the shaders choice to shaders/ and an optional folder below it', () => {
    expect(importSubfolder('shaders', '')).toBe('shaders');
    expect(importSubfolder('shaders', ' /post/ ')).toBe('shaders/post');
    expect(() => importSubfolder('shaders', 'Bad Folder')).toThrow(/shaders/);
    expect(() => importSubfolder('shaders', 'post//x')).toThrow(/shaders/);
  });

  it('accepts raw shader files, which are not checked', () => {
    const source = new TextEncoder().encode('#version 330\nvoid main() {}\n');
    for (const name of ['wobble.vsh', 'wobble.fsh', 'noise.glsl']) {
      expect(assetImportError('shaders/post', name, source)).toBeUndefined();
    }
  });

  it('passes shaders/<folder> to the host and says the files are not checked', async () => {
    const onImport = vi.fn(async () => null);
    render(<ImportAssetsDialog namespaces={['demo']} onImport={onImport} onCancel={vi.fn()} />);
    expect(screen.getByTestId('import-assets-dialog').textContent).toContain(
      'Shaders (shaders, .vsh, .fsh and .glsl)',
    );
    expect(screen.getByTestId('import-assets-dialog').textContent).toContain('does not check them');
    fireEvent.click(screen.getByTestId('import-assets-folder-shaders'));
    fireEvent.change(screen.getByTestId('import-assets-shader-folder'), {
      target: { value: 'post' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Choose files…' }));
    await waitFor(() => expect(onImport).toHaveBeenCalledWith('demo', 'shaders/post'));
  });

  it('starts the folder field empty when the choice changes', async () => {
    const onImport = vi.fn(async () => null);
    render(<ImportAssetsDialog namespaces={['demo']} onImport={onImport} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByTestId('import-assets-folder-custom'));
    fireEvent.change(screen.getByTestId('import-assets-custom-folder'), {
      target: { value: 'entity' },
    });
    fireEvent.click(screen.getByTestId('import-assets-folder-shaders'));
    expect((screen.getByTestId('import-assets-shader-folder') as HTMLInputElement).value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Choose files…' }));
    await waitFor(() => expect(onImport).toHaveBeenCalledWith('demo', 'shaders'));
  });
});
