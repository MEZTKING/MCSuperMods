import { buildCatalogue, buildEntityCatalogue, type SimLog } from '@msm/sim';
import { describe, expect, it } from 'vitest';
import {
  eggTexture,
  hotbarSlots,
  modelTexture,
  projectThings,
  propIds,
  propThing,
  texturePath,
} from '../../../src/renderer/src/tryit/hotbar';
import { toSimFiles } from '../../../src/renderer/src/tryit/session-source';
import { demoOutputs, NS, TARGET } from './tryit-fixture';

const quiet: SimLog = { info: () => {}, onlyInMinecraft: () => {} };
const folders = TARGET.folders.resource;

describe('Try it hotbar', () => {
  const files = toSimFiles(demoOutputs());
  const blocks = buildCatalogue(files, TARGET, quiet);
  const mobs = buildEntityCatalogue(files, TARGET, quiet);

  it('lists the project blocks first, then the spawn eggs', () => {
    const things = projectThings(blocks, mobs, files, folders);
    expect(things.map((thing) => [thing.id, thing.kind])).toEqual([
      [`${NS}:berry`, 'block'],
      [`${NS}:door`, 'block'],
      [`${NS}:ruby_block`, 'block'],
      [`${NS}:golem_spawn_egg`, 'egg'],
    ]);
    expect(things.find((thing) => thing.id === `${NS}:ruby_block`)?.texture).toBe(
      `${NS}:block/ruby_block`,
    );
    // No egg item model and no egg texture: the slot shows the egg icon.
    expect(things.at(-1)?.texture).toBeUndefined();
    expect(things.at(-1)?.name).toBe('Golem Spawn Egg');
  });

  it('adds the blocks and tools of vanilla block rules and block transformers (B614)', () => {
    const withRules = new Map(files);
    withRules.set(
      `msm/${NS}/vanilla_block_rules/rules.json`,
      JSON.stringify({
        format: 1,
        strip: [{ block: 'minecraft:basalt', into: 'minecraft:polished_basalt' }],
        wax: [{ block: 'minecraft:end_stone', into: 'minecraft:end_stone_bricks' }],
      }),
    );
    withRules.set(
      `data/${NS}/block_transformer/brush.json`,
      JSON.stringify([
        {
          block_state_provider: {
            type: 'minecraft:rule_based',
            rules: [
              {
                if_true: { type: 'minecraft:matching_blocks', blocks: 'minecraft:gravel' },
                // biome-ignore lint/suspicious/noThenProperty: the game's own key
                then: { id: 'minecraft:sand' },
              },
            ],
          },
        },
      ]),
    );
    withRules.set(
      `msm/${NS}/item/brush.json`,
      JSON.stringify({
        format: 1,
        display_name: 'Brush',
        components: { 'msm:components': { 'minecraft:block_transformer': `${NS}:brush` } },
      }),
    );
    const catalogue = buildCatalogue(withRules, TARGET, quiet);
    const things = projectThings(catalogue, mobs, withRules, folders);
    const extra = things.slice(4).map((thing) => [thing.id, thing.kind, thing.name]);
    expect(extra).toEqual([
      ['minecraft:basalt', 'prop', 'Basalt'],
      ['minecraft:end_stone', 'prop', 'End Stone'],
      ['minecraft:gravel', 'prop', 'Gravel'],
      ['minecraft:iron_axe', 'item', 'Iron Axe'],
      ['minecraft:honeycomb', 'item', 'Honeycomb'],
      [`${NS}:brush`, 'item', 'Brush'],
    ]);
    expect(things.find((thing) => thing.id === 'minecraft:iron_axe')?.texture).toBe(
      'minecraft:item/iron_axe',
    );
  });

  it('finds an egg picture in the item model or the definition', () => {
    const withModel = new Map(files);
    withModel.set(
      `assets/${NS}/${folders.model}/item/golem_spawn_egg.json`,
      JSON.stringify({ textures: { layer0: `${NS}:item/egg` } }),
    );
    expect(eggTexture(withModel, folders, `${NS}:golem_spawn_egg`, `${NS}:golem`)).toBe(
      `${NS}:item/egg`,
    );
    const withDefinition = new Map(files);
    withDefinition.set(
      `msm/${NS}/entity/golem.json`,
      JSON.stringify({ size: { width: 1, height: 1 }, spawn_egg: { texture: `${NS}:item/g` } }),
    );
    expect(eggTexture(withDefinition, folders, `${NS}:golem_spawn_egg`, `${NS}:golem`)).toBe(
      `${NS}:item/g`,
    );
  });

  it('reads model textures through # references', () => {
    expect(modelTexture({ textures: { side: '#all', all: 'x:block/a' } })).toBe('x:block/a');
    expect(modelTexture({ textures: { weird: 'x:block/b' } })).toBe('x:block/b');
    expect(modelTexture({})).toBeUndefined();
  });

  it('fills nine slots, keeping the ones chosen in the picker while their thing exists', () => {
    const things = projectThings(blocks, mobs, files, folders);
    const slots = hotbarSlots(things, { 0: `${NS}:golem_spawn_egg`, 4: 'minecraft:stone' }, [
      propThing('minecraft:stone'),
    ]);
    expect(slots).toHaveLength(9);
    expect(slots[0]?.id).toBe(`${NS}:golem_spawn_egg`);
    expect(slots[1]?.id).toBe(`${NS}:berry`);
    expect(slots[4]?.id).toBe('minecraft:stone');
    expect(slots.filter((slot) => slot !== null)).toHaveLength(5);
    const gone = hotbarSlots(things, { 0: `${NS}:removed` });
    expect(gone[0]?.id).toBe(`${NS}:berry`);
  });

  it('offers vanilla props by name, without air', () => {
    expect(propIds(['minecraft:air', 'minecraft:stone', 'demo:thing'])).toEqual([
      'minecraft:stone',
    ]);
    expect(propThing('minecraft:oak_planks')).toEqual({
      id: 'minecraft:oak_planks',
      name: 'Oak Planks',
      kind: 'prop',
      texture: 'minecraft:block/oak_planks',
    });
    expect(texturePath(folders, 'demo:block/x')).toBe(
      `assets/demo/${folders.textures}/block/x.png`,
    );
  });
});
