// @vitest-environment happy-dom
/**
 * The Creator's names: `displayName` reads the bundle's language files first, then the
 * elements' own `display_name` the way lowering writes the keys (a block's key, an item's key,
 * and the item key of a block item with its own id, as seeds planting a crop), so the Wood set,
 * Crop and other flows show their names, not their ids, in the previews and Stats.
 */
import type { Project, ResourceLocation } from '@msm/core';
import type { ContentBundle, ContentBundleElement, TargetFacts } from '@msm/plugin-api';
import { libraryStarters } from '@msm/plugin-library';
import { defaultTargetId, targetFacts } from '@msm/targets';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreatorPreview } from '../../src/renderer/src/components/creator/CreatorPreview';
import { displayName } from '../../src/renderer/src/preview/bundle-source';

afterEach(cleanup);

const FOLDERS = { textures: 'textures', models: 'models', blockstates: 'blockstates' } as never;

const piece = (id: string, kind: string, data: unknown): ContentBundleElement => ({
  id: id as ResourceLocation,
  kind,
  data: data as never,
});

async function build(id: string, values: Record<string, unknown> = {}): Promise<ContentBundle> {
  const flow = libraryStarters.find((starter) => starter.id === id);
  if (flow === undefined) throw new Error(`No starter ${id}`);
  const defaults = Object.fromEntries(
    (flow.parameters ?? []).map((parameter) => [parameter.id, parameter.default]),
  );
  return flow.build({
    namespace: 'demo',
    projectName: 'Demo',
    target: targetFacts(defaultTargetId) as TargetFacts,
    values: { ...defaults, ...values } as never,
  });
}

function previewProps(bundle: ContentBundle) {
  return {
    bundle,
    revision: 1,
    plan: null,
    project: { name: 'Demo', namespaces: [] } as unknown as Project,
    folders: FOLDERS,
    readProjectAsset: async () => null,
    vanilla: null,
    overwrite: new Set<string>(),
    onOverwriteChange: vi.fn(),
    onTabChange: vi.fn(),
    webgl: false,
  };
}

describe('displayName', () => {
  const bundle: ContentBundle = {
    elements: [
      piece('demo:maple_planks', 'msm:block', { format: 1, display_name: 'Maple Planks' }),
      piece('demo:ruby', 'msm:item', { format: 1, display_name: 'Ruby' }),
      piece('demo:tomatoes', 'msm:block', {
        format: 1,
        type: 'crop',
        display_name: 'Tomatoes',
        item: { id: 'demo:tomato_seeds' },
      }),
      piece('demo:glass', 'msm:block', { format: 1, display_name: '' }),
      piece('demo:en_us', 'minecraft:lang', { 'item.demo.ruby': 'Shiny Ruby' }),
    ],
    assets: [],
  };

  it("reads a block's and an item's own display_name", () => {
    expect(displayName(bundle, 'demo:maple_planks', 'block')).toBe('Maple Planks');
    expect(displayName(bundle, 'demo:tomatoes', 'block')).toBe('Tomatoes');
  });

  it('names a block item with its own id after the block, as lowering does', () => {
    expect(displayName(bundle, 'demo:tomato_seeds', 'item')).toBe('Tomatoes');
    expect(displayName(bundle, 'demo:tomato_seeds', 'block')).toBeUndefined();
  });

  it('writes no item key for a block whose item shares its id', () => {
    expect(displayName(bundle, 'demo:maple_planks', 'item')).toBeUndefined();
  });

  it('puts the language files first and skips empty names', () => {
    expect(displayName(bundle, 'demo:ruby', 'item')).toBe('Shiny Ruby');
    expect(displayName(bundle, 'demo:glass', 'block')).toBeUndefined();
    expect(displayName(bundle, 'demo:missing', 'block')).toBeUndefined();
  });
});

describe('Creator names from display_name', () => {
  it('names the Wood set blocks in the Blocks tab and Stats', async () => {
    const bundle = await build('wood-set', { wood_name: 'Maple' });
    expect(displayName(bundle, 'demo:maple_planks', 'block')).toBe('Maple Planks');
    render(<CreatorPreview {...previewProps(bundle)} tab="blocks" />);
    const order = screen.getByTestId('creator-set-order').textContent ?? '';
    expect(order).toContain('Maple Planks');
    expect(order).toContain('Maple Stairs');
    expect(order).not.toContain('demo:maple_planks');
    expect(screen.getByTestId('creator-block-demo:maple_planks').textContent).toContain(
      'Maple Planks',
    );
    cleanup();
    render(<CreatorPreview {...previewProps(bundle)} tab="stats" />);
    expect(screen.getByTestId('creator-stats-demo:maple_planks').textContent).toContain(
      'Maple Planks',
    );
  });

  it("names a crop's seeds after the crop block", async () => {
    const bundle = await build('crop', { crop_name: 'Tomato' });
    const crop = bundle.elements.find(
      (entry) =>
        entry.kind === 'msm:block' &&
        typeof entry.data === 'object' &&
        entry.data !== null &&
        !Array.isArray(entry.data) &&
        typeof entry.data.item === 'object' &&
        entry.data.item !== null &&
        !Array.isArray(entry.data.item) &&
        typeof entry.data.item.id === 'string',
    );
    expect(crop).toBeDefined();
    const data = crop?.data as { display_name: string; item: { id: string } };
    expect(displayName(bundle, data.item.id, 'item')).toBe(data.display_name);
    expect(data.display_name).not.toContain(':');
  });
});
