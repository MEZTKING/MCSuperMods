/**
 * Container and machine examples (ADR 0076 D4): a loot crate placed by a structure template, an
 * ore crusher fed and emptied by a hopper chain, and a crate that keeps its contents when
 * broken. Each is built from the Storage crate or Machine Creator flow with answers of its own,
 * without the pack and mod elements (an example is copied into a project that has them
 * already), plus the hand-written pieces around it. Their ids differ from the other block
 * examples', so the `examples/blocks-items` mirror holds them all in one project.
 *
 * The vanilla data pack export leaves out what names the mod's blocks (the crates' and the
 * crusher's recipes and loot tables) and the machine recipes, whose `type` is the machine's id
 * (ADR 0066, ADR 0075 D10); the loot crate's own chest loot table, and the structure templates
 * stay. Containers and machines need the Fabric mod jar export.
 */
import type { BundleContext, ContentBundle, ExampleProject, Json } from '@msm/plugin-api';
import { COLOURS, element, KINDS, rl } from '../content/bundle';
import { hexFromRgb } from '../content/parameters';
import { BoxBuilder } from '../content/structures';
import { machineBundle } from '../starters/machine';
import { storageCrateBundle } from '../starters/storage-crate';
import { defineExample } from './define';

/** The gallery category of the container examples (the block examples' own). */
const BLOCKS = 'Blocks';

/**
 * The bundle of a Creator flow for `values`, without its `pack.mcmeta` and `msm:mod` elements,
 * followed by `extra`'s elements and assets.
 */
function fromFlow(
  build: (context: BundleContext) => ContentBundle,
  values: Readonly<Record<string, Json>>,
  extra: (context: BundleContext) => ContentBundle = () => ({ elements: [], assets: [] }),
): (context: BundleContext) => ContentBundle {
  return (context) => {
    const bundle = build({ ...context, values: { ...values } });
    const more = extra(context);
    return {
      elements: [
        ...bundle.elements.filter((entry) => entry.kind !== KINDS.pack && entry.kind !== KINDS.mod),
        ...more.elements,
      ],
      assets: [...bundle.assets, ...more.assets],
    };
  };
}

/** A structure template's data with `blockEntities` (position and SNBT) added. */
function withBlockEntities(
  builder: BoxBuilder,
  blockEntities: readonly { pos: [number, number, number]; nbt: string }[],
): Json {
  const data = builder.build() as Record<string, Json>;
  return {
    ...data,
    block_entities: blockEntities.map(({ pos, nbt }) => ({ pos: [...pos], nbt })),
  };
}

/** The loot crate's room: a stone brick floor, mossy walls and the crate in the middle. */
function lootCrateRoom(namespace: string): ContentBundle {
  const crate = rl(namespace, 'loot_crate');
  const table = rl(namespace, 'chests/loot_crate');
  const room = rl(namespace, 'loot_crate_room');
  const builder = new BoxBuilder([5, 3, 5])
    .fill([0, 0, 0], [4, 0, 4], 'minecraft:stone_bricks')
    .fill([0, 1, 0], [4, 2, 4], 'minecraft:mossy_cobblestone')
    .fill([1, 1, 1], [3, 2, 3], 'minecraft:air')
    .set([2, 1, 2], crate);
  return {
    elements: [
      element(
        table,
        KINDS.lootTable,
        {
          type: 'minecraft:chest',
          pools: [
            {
              rolls: { type: 'minecraft:uniform', min: 3, max: 5 },
              entries: [
                {
                  type: 'minecraft:item',
                  name: 'minecraft:bread',
                  weight: 4,
                  modifier: {
                    type: 'minecraft:set_count',
                    count: { type: 'minecraft:uniform', min: 1, max: 4 },
                  },
                },
                {
                  type: 'minecraft:item',
                  name: 'minecraft:iron_ingot',
                  weight: 3,
                  modifier: {
                    type: 'minecraft:set_count',
                    count: { type: 'minecraft:uniform', min: 1, max: 3 },
                  },
                },
                { type: 'minecraft:item', name: 'minecraft:emerald', weight: 2 },
                { type: 'minecraft:item', name: 'minecraft:diamond', weight: 1 },
              ],
            },
          ],
        },
        `The loot of the crate in the loot crate room: three to five rolls of bread, iron, an emerald or a rare diamond. It names only vanilla items, so the vanilla data pack keeps it. The structure gives the crate this table in its block entity (LootTable), and the crate fills from it when a player first opens it, as a dungeon chest does. Try /loot give @s loot ${table}.`,
      ),
      element(
        room,
        KINDS.structureTemplate,
        withBlockEntities(builder, [{ pos: [2, 1, 2], nbt: `{LootTable:"${table}"}` }]),
        `A small room with the loot crate in the middle, in its default state (facing north). block_entities gives the crate at [2, 1, 2] the loot table ${table}: placing the structure (/place template ${room} ~ ~ ~, or a jigsaw or structure that uses it) fills it on the first open. The export writes it as loot_crate_room.nbt; the crate is a mod block, so a vanilla game places air in its place.`,
      ),
    ],
    assets: [],
  };
}

/**
 * The ore crusher's hopper chain: a chest of raw iron above a hopper into the crusher's top
 * (the input), a chest of coal beside a hopper into its side (the fuel), and a hopper under it
 * that empties the output into a chest below.
 */
function oreCrusherLine(namespace: string): ContentBundle {
  const crusher = rl(namespace, 'ore_crusher');
  const line = rl(namespace, 'ore_crusher_line');
  const builder = new BoxBuilder([2, 5, 1])
    .set([0, 0, 0], 'minecraft:chest[facing=south]')
    .set([0, 1, 0], 'minecraft:hopper[facing=down]')
    .set([0, 2, 0], crusher)
    .set([1, 2, 0], 'minecraft:hopper[facing=west]')
    .set([0, 3, 0], 'minecraft:hopper[facing=down]')
    .set([1, 3, 0], 'minecraft:chest[facing=south]')
    .set([0, 4, 0], 'minecraft:chest[facing=south]');
  return {
    elements: [
      element(
        line,
        KINDS.structureTemplate,
        withBlockEntities(builder, [
          { pos: [1, 3, 0], nbt: '{Items:[{Slot:0b,id:"minecraft:coal",count:16}]}' },
          { pos: [0, 4, 0], nbt: '{Items:[{Slot:0b,id:"minecraft:raw_iron",count:16}]}' },
        ]),
        `The ore crusher with a hopper chain: the top chest holds raw iron, which the hopper under it puts into the crusher's top (its input); the chest beside it holds coal, which the hopper below it puts into the crusher's side (its fuel); the hopper under the crusher takes the iron ingots from its bottom (its output) into the chest at the foot. Place it with /place template ${line} ~ ~ ~ and watch the bottom chest fill.`,
      ),
    ],
    assets: [],
  };
}

/** The container and machine examples, in gallery order. */
export const containerExamples: readonly ExampleProject[] = [
  defineExample({
    id: 'example_msm_loot_crate',
    title: 'Loot crate in a structure',
    description:
      'A stone crate with a chest screen, placed in a small room by a structure template that gives it a loot table, so it fills on the first open as a dungeon chest does.',
    kind: KINDS.block,
    category: BLOCKS,
    tags: ['container', 'loot table', 'structure', 'block entity', 'mod'],
    build: fromFlow(
      storageCrateBundle,
      {
        crate_name: 'Loot Crate',
        look: 'stone',
        colour: hexFromRgb(COLOURS.slate),
        ingredient: 'none',
      },
      ({ namespace }) => lootCrateRoom(namespace),
    ),
  }),
  defineExample({
    id: 'example_msm_ore_crusher',
    title: 'Ore crusher',
    description:
      'A machine from the Machine flow that crushes raw iron, gold and copper into two ingots each, burning fuel, with a hopper chain that feeds it and empties it into a chest.',
    kind: KINDS.block,
    category: BLOCKS,
    tags: ['machine', 'recipes', 'hoppers', 'structure', 'mod'],
    build: fromFlow(
      machineBundle,
      {
        machine_name: 'Ore Crusher',
        recipe_1: 'iron_ingot',
        recipe_2: 'gold_ingot',
        recipe_3: 'copper_ingot',
      },
      ({ namespace }) => oreCrusherLine(namespace),
    ),
  }),
  defineExample({
    id: 'example_msm_shulker_crate',
    title: 'Shulker crate',
    description:
      'A crate that keeps its 27 slots of items when broken and carries them in its item, as a shulker box does, from the Storage crate flow.',
    kind: KINDS.block,
    category: BLOCKS,
    tags: ['container', 'keep contents', 'shulker box', 'mod'],
    build: fromFlow(storageCrateBundle, {
      crate_name: 'Shulker Crate',
      keep_contents: true,
      colour: hexFromRgb(COLOURS.violet),
    }),
  }),
];
