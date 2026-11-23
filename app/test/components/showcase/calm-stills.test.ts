/**
 * Calm stills for vehicles and mobs (B713): a drawn still never shows a model's skin sheet (a
 * flat unfolded body that reads as noise on a card) and shows at most three pictures; a card left
 * with none shows its own drawn look.
 */

import type { ContentBundle, Target } from '@msm/plugin-api';
import { libraryExamples, libraryStarters } from '@msm/plugin-library';
import { afterEach, describe, expect, it } from 'vitest';
import { cardStill } from '../../../src/renderer/src/components/home/gallery/card-picture';
import { exampleForStarter } from '../../../src/renderer/src/components/home/gallery/flow-examples';
import { galleryGroups } from '../../../src/renderer/src/components/home/gallery/gallery-model';
import { SHOWCASE_NAMESPACE } from '../../../src/renderer/src/showcase/clip';
import {
  clearDrawnStills,
  STILL_PICTURES,
  type StillCodec,
  skinSheetPaths,
  stillPictures,
} from '../../../src/renderer/src/showcase/drawn-still';
import { FLOW_CARDS } from '../../../src/renderer/src/showcase/flow-clips';
import { TARGETS } from './showcase-fixture';

afterEach(clearDrawnStills);

const TARGET = TARGETS[0] as Target;
const examples = new Map(libraryExamples.map((example) => [example.id, example]));

async function bundleOf(exampleId: string): Promise<ContentBundle> {
  const example = examples.get(exampleId);
  if (example === undefined) throw new Error(`no example ${exampleId}`);
  return example.build({
    namespace: SHOWCASE_NAMESPACE,
    projectName: SHOWCASE_NAMESPACE,
    target: TARGET,
    values: {},
  });
}

/** Whether a bundle's picture is a skin sheet, by folder or by being a model's texture. */
function isSkin(bundle: ContentBundle, path: string): boolean {
  return path.includes('/entity/') || skinSheetPaths(bundle).has(path);
}

const asset = (path: string) => ({ namespace: 'showcase', path, bytes: new Uint8Array([1]) });

describe('a drawn still leaves out skin sheets', () => {
  it('leaves out a texture a vehicle or mob names, but not its item or spawn egg', () => {
    const bundle: ContentBundle = {
      elements: [
        {
          id: 'showcase:kart',
          kind: 'msm:vehicle',
          data: { model: { texture: 'showcase:vehicle/kart_body' }, item: { texture: 'x:no' } },
        },
        {
          id: 'showcase:fox',
          kind: 'msm:entity',
          data: {
            components: { 'msm:variants': { variants: [{ texture: 'showcase:mob/fox_red' }] } },
            spawn_egg: { texture: 'showcase:item/fox_spawn_egg' },
          },
        },
        { id: 'showcase:ore', kind: 'msm:block', data: { texture: 'showcase:block/ore' } },
      ],
      assets: [
        asset('textures/vehicle/kart_body.png'),
        asset('textures/mob/fox_red.png'),
        asset('textures/entity/fox.png'),
        asset('textures/trims/entity/humanoid/studs.png'),
        asset('textures/item/fox_spawn_egg.png'),
        asset('textures/block/ore.png'),
      ],
    };
    expect(stillPictures(bundle).map((one) => one.path)).toEqual([
      'textures/block/ore.png',
      'textures/item/fox_spawn_egg.png',
    ]);
  });

  it('the Ember kart, the tank, the plane and the boat: no skin sheet, at most three', async () => {
    for (const id of [
      'example_flow_ember_kart',
      'example_flow_desert_tank',
      'example_flow_sky_hopper',
      'example_flow_paddle_steamer',
    ]) {
      const bundle = await bundleOf(id);
      // The example has a skin sheet to leave out.
      expect(
        bundle.assets.some((one) => isSkin(bundle, one.path)),
        id,
      ).toBe(true);
      const shown = stillPictures(bundle);
      expect(shown.length, id).toBeGreaterThan(0);
      expect(shown.length, id).toBeLessThanOrEqual(STILL_PICTURES);
      for (const one of shown) expect(isSkin(bundle, one.path), `${id} ${one.path}`).toBe(false);
    }
  }, 60_000);

  it('every card of the Vehicles and Mobs rows: no skin sheet, else the card’s own look', async () => {
    const seen = new Set<string>();
    const starters = libraryStarters.filter((starter) => {
      if (seen.has(starter.id)) return false;
      seen.add(starter.id);
      return true;
    });
    const groups = galleryGroups({
      starters,
      examples: libraryExamples,
      target: TARGET,
      exampleFor: exampleForStarter,
    }).filter((group) => group.id === 'vehicles' || group.id === 'mobs');
    expect(groups.map((group) => group.id).sort()).toEqual(['mobs', 'vehicles']);
    const decoded: number[] = [];
    const codec: StillCodec = {
      decode: async () => {
        decoded.push(1);
        return { width: 16, height: 16, data: new Uint8ClampedArray(16 * 16 * 4).fill(200) };
      },
      encode: () => new Uint8Array([0x89, 0x50]),
    };
    let checked = 0;
    for (const card of groups.flatMap((group) => group.cards)) {
      const flowCard = FLOW_CARDS[card.starterId];
      const exampleId = flowCard?.exampleId ?? card.exampleId;
      if (exampleId === undefined || exampleId === null) continue;
      const bundle = await bundleOf(exampleId);
      const shown = stillPictures(bundle);
      expect(shown.length, card.id).toBeLessThanOrEqual(STILL_PICTURES);
      for (const one of shown)
        expect(isSkin(bundle, one.path), `${card.id} ${one.path}`).toBe(false);
      decoded.length = 0;
      const still = await cardStill({
        flowCard,
        example: examples.get(exampleId),
        fallback: undefined,
        target: TARGET,
        size: { width: 64, height: 40 },
        codec,
        draw: async () => new Uint8Array([1]),
      });
      expect(still?.source, card.id).toBe(shown.length === 0 ? 'look' : 'example');
      checked += 1;
    }
    // Both rows were looked at, cards with nothing left among them (a cat's coat is all skin).
    expect(checked).toBeGreaterThanOrEqual(12);
  }, 120_000);
});
