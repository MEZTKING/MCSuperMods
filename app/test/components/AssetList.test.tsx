// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assetNames, assetWords } from '../../src/renderer/src/components/AssetList';
import { ElementSidebar } from '../../src/renderer/src/components/ElementSidebar';
import { importSubfolder } from '../../src/renderer/src/components/ImportAssetsDialog';
import { sampleProject } from './fixtures';

afterEach(cleanup);

function project() {
  const value = sampleProject();
  value.namespaces[0]?.assets.push({ path: 'sounds/ding.ogg', mediaType: 'audio/ogg' });
  return value;
}

describe('Assets section', () => {
  it('lists assets with thumbnails for textures only', async () => {
    const thumbnail = vi.fn(async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
    render(
      <ElementSidebar
        project={project()}
        selectedId={null}
        onSelect={vi.fn()}
        onRemove={vi.fn()}
        assetActions={{ thumbnail }}
      />,
    );
    const assets = screen.getByRole('region', { name: 'demo Pictures and sounds' });
    expect(within(assets).getByText('Ruby block')).toBeTruthy();
    expect(within(assets).getByText('Ding')).toBeTruthy();
    // The test setup starts every More options open: Show where the files are shows the paths.
    expect(within(assets).getByText('textures/block/ruby_block.png')).toBeTruthy();
    expect(within(assets).getByText('sounds/ding.ogg')).toBeTruthy();
    await waitFor(() => expect(thumbnail).toHaveBeenCalledOnce());
    expect(thumbnail).toHaveBeenCalledWith('assets/demo/textures/block/ruby_block.png', 32);
    await waitFor(() =>
      expect(
        screen.getByTestId('asset-row-demo:textures/block/ruby_block.png').querySelector('img'),
      ).not.toBeNull(),
    );
  });

  it('reports import, reveal and remove', async () => {
    const actions = { onImport: vi.fn(), onReveal: vi.fn(), onRemove: vi.fn() };
    render(
      <ElementSidebar
        project={project()}
        selectedId={null}
        onSelect={vi.fn()}
        onRemove={vi.fn()}
        assetActions={actions}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('assets-import-empty'));
    expect(actions.onImport).toHaveBeenCalledWith('empty');
    await user.click(screen.getByRole('button', { name: 'Show Ruby block in folder' }));
    expect(actions.onReveal).toHaveBeenCalledWith('demo', 'textures/block/ruby_block.png');
    await user.click(screen.getByRole('button', { name: 'Remove Ding' }));
    expect(actions.onRemove).toHaveBeenCalledWith('demo', 'sounds/ding.ogg');
  });

  it('names files in words, the folder in brackets where two share a name', () => {
    expect(assetWords('ruby_ore.png')).toBe('Ruby ore');
    expect(assetWords('textures/block/ruby_ore.png')).toBe('Ruby ore');
    expect(assetWords('sounds/big-bell.ogg')).toBe('Big bell');
    const names = assetNames([
      { path: 'textures/block/ruby.png', mediaType: 'image/png' },
      { path: 'textures/block/ruby.png.mcmeta', mediaType: 'application/json' },
      { path: 'textures/item/ruby.png', mediaType: 'image/png' },
      { path: 'sounds/ding.ogg', mediaType: 'audio/ogg' },
    ]);
    expect([...names.values()]).toEqual([
      'Ruby (block)',
      'Ruby (block) (settings)',
      'Ruby (item)',
      'Ding',
    ]);
  });

  it('hides the paths until Show where the files are opens', async () => {
    window.msmMoreOptionsOpen = false;
    try {
      render(
        <ElementSidebar
          project={project()}
          selectedId={null}
          onSelect={vi.fn()}
          onRemove={vi.fn()}
          assetActions={{ onPaint: vi.fn(), onReveal: vi.fn(), onRemove: vi.fn() }}
        />,
      );
      const assets = screen.getByRole('region', { name: 'demo Pictures and sounds' });
      expect(within(assets).queryByText('textures/block/ruby_block.png')).toBeNull();
      const row = screen.getByTestId('asset-row-demo:textures/block/ruby_block.png');
      expect(row.getAttribute('title')).toBe(
        'Ruby block: drag it onto an item, block or model to use it',
      );
      expect(screen.getByTestId('asset-row-demo:sounds/ding.ogg').getAttribute('title')).toBe(
        'Ding (a sound)',
      );
      expect(within(row).getByRole('button', { name: 'Paint Ruby block' }).title).toBe(
        'Paint this picture',
      );
      await userEvent.setup().click(screen.getByTestId('more-options-assets-demo'));
      expect(within(assets).getByText('textures/block/ruby_block.png')).toBeTruthy();
      expect(row.getAttribute('title')).toBe(
        'textures/block/ruby_block.png: drag it onto an item, block or model to use it',
      );
    } finally {
      window.msmMoreOptionsOpen = true;
    }
  });

  it('maps import folder choices to asset subfolders', () => {
    expect(importSubfolder('block', '')).toBe('textures/block');
    expect(importSubfolder('item', '')).toBe('textures/item');
    expect(importSubfolder('sounds', '')).toBe('sounds');
    expect(importSubfolder('custom', '/gui/icons/')).toBe('textures/gui/icons');
    expect(() => importSubfolder('custom', '')).toThrow(/folder/);
    expect(() => importSubfolder('custom', 'Bad Folder')).toThrow(/folder/);
  });
});
