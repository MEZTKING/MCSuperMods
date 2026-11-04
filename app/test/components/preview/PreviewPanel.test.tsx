// @vitest-environment happy-dom
import type { Element, Project } from '@msm/plugin-api';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ResourceFolders } from '../../../src/renderer/src/preview/model-chain';
import { PreviewPanel } from '../../../src/renderer/src/preview/PreviewPanel';

afterEach(cleanup);

const folders: ResourceFolders = {
  atlases: 'atlases',
  block_definition: 'blockstates',
  font: 'font',
  item_definition: 'items',
  lang: 'lang',
  model: 'models',
  sounds_file: 'sounds.json',
  textures: 'textures',
};

const glade: Element = {
  id: 'demo:glade',
  kind: 'minecraft:worldgen/biome',
  data: { effects: { grass_color: 0x00ff00 } },
} as unknown as Element;

const project = {
  formatVersion: 1,
  name: 'Worldgen',
  namespaces: [{ name: 'demo', assets: [], elements: [glade] }],
  targets: [],
  plugins: [],
  settings: {},
} as unknown as Project;

const params = (temperature: number) => ({
  temperature,
  humidity: 0,
  continentalness: 0,
  erosion: 0,
  depth: 0,
  weirdness: 0,
  offset: 0,
});

const dimension = {
  id: 'demo:glade_world',
  kind: 'minecraft:dimension',
  data: {
    type: 'minecraft:overworld',
    generator: {
      type: 'minecraft:noise',
      settings: 'minecraft:overworld',
      biome_source: {
        type: 'minecraft:multi_noise',
        biomes: [
          { biome: 'demo:glade', parameters: params(0.2) },
          { biome: 'minecraft:desert', parameters: params(0.8) },
        ],
      },
    },
  },
} as unknown as Element;

const template = {
  id: 'demo:house',
  kind: 'minecraft:structure_template',
  data: { size: [1, 1, 1], palette: ['minecraft:stone'], blocks: [[0, 0, 0, 0]] },
} as unknown as Element;

function renderPanel(element: Element, previewKind: string) {
  return render(
    <PreviewPanel
      project={project}
      element={element}
      previewKind={previewKind}
      folders={folders}
      readProjectAsset={async () => null}
      vanilla={null}
      onSetup={vi.fn()}
      webgl={false}
    />,
  );
}

describe('PreviewPanel', () => {
  it('shows the climate map for a dimension without WebGL', async () => {
    renderPanel(dimension, 'climate_map');
    expect(await screen.findByTestId('climate-map', {}, { timeout: 5000 })).toBeTruthy();
    expect(screen.queryByText(/WebGL is disabled/)).toBeNull();
    expect(screen.queryByText(/Vanilla assets not found/)).toBeNull();
    const biomes = screen.getByRole('list', { name: 'Biomes' });
    expect(biomes.textContent).toContain('demo:glade (project)');
    expect(biomes.textContent).toContain('minecraft:desert');
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(
      /Temperature from left to right, Humidity from bottom to top/,
    );
    expect(screen.getAllByRole('slider')).toHaveLength(4);
  });

  it('explains when a dimension has no multi-noise biome list', async () => {
    renderPanel(
      {
        ...dimension,
        data: { generator: { biome_source: { type: 'minecraft:fixed', biome: 'demo:glade' } } },
      } as unknown as Element,
      'climate_map',
    );
    expect((await screen.findByText(/No climate map/, {}, { timeout: 5000 })).textContent).toMatch(
      /minecraft:fixed/,
    );
  });

  it('shows the WebGL message for a structure template when WebGL is disabled', () => {
    renderPanel(template, 'structure');
    expect(screen.getByText('Preview unavailable: WebGL is disabled.')).toBeTruthy();
    expect(screen.queryByTestId('climate-map')).toBeNull();
  });
});
