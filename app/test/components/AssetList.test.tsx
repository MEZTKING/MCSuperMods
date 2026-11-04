// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
    const assets = screen.getByRole('region', { name: 'demo assets' });
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
    await user.click(
      screen.getByRole('button', { name: 'Reveal demo:textures/block/ruby_block.png in folder' }),
    );
    expect(actions.onReveal).toHaveBeenCalledWith('demo', 'textures/block/ruby_block.png');
    await user.click(screen.getByRole('button', { name: 'Remove demo:sounds/ding.ogg' }));
    expect(actions.onRemove).toHaveBeenCalledWith('demo', 'sounds/ding.ogg');
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
