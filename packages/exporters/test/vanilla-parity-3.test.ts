/**
 * Vanilla parity 3, batch 1 in the exporters (ADRs 0103 to 0105, ADR 0112 D3; B517), through the
 * real plugins and `runExport`:
 *
 * - vanilla packs (both targets): the plant types, a project pot with listed plants and a potted
 *   plant in it, the six new weathering types, storage 2, own sounds, own set types and the tool
 *   pairs are blocks like any other: files naming them (their loot tables, the pots' loot) are left
 *   out with `export.mod-only-reference`, tag entries naming them (`#minecraft:flower_pots`,
 *   `#minecraft:climbable`, `#minecraft:supports_bamboo`) become optional, nothing of the runtime
 *   layer is written, and `needsJarNotes` gives one `export.needs-jar` for the rules for vanilla
 *   blocks; where block sounds are data the sound set entries are kept;
 * - the Java eject (targets with a Java generator): the same project generates with no error; the
 *   only `export.not-in-eject` is the one for the rules for vanilla blocks (the generator's input
 *   has no field for them yet). With `MSM_VANILLA_PARITY_3_JAVA_OUT` set, the tree is written there
 *   with the engine-mod Gradle wrapper for `./gradlew build` (JDK 25; B520 wires it into CI).
 */
import { readFile } from 'node:fs/promises';
import {
  createElement,
  createEmptyProject,
  ElementKindRegistry,
  type Project,
  registerPlugin,
  utf8,
} from '@msm/core';
import type { Element, Json, ResourceLocation } from '@msm/plugin-api';
import blocksItemsPlugin, { blockGeneratedBlockIds } from '@msm/plugin-blocks-items';
import dataPackPlugin from '@msm/plugin-datapack';
import resourcePackPlugin from '@msm/plugin-resourcepack';
import { createRegistryIndex } from '@msm/schemas';
import { builtInTargets, readVendoredJson } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import {
  createJavaProjectExporter,
  createMemorySink,
  dataPackExporter,
  ExportProblemCodes,
  FATAL_DATA_FOLDERS,
  MOD_ONLY_REFERENCE,
  modOnlyIdsOf,
  needsJarNotes,
  runExport,
  vanillaSafeExporter,
} from '../src/index';
import { indexesFor } from './helpers';
import { engineModWrapper, writeTree } from './sample-java';

const NOW = '2026-11-22T00:00:00.000Z';
const meta = { msmVersion: '1.5.2', plugins: ['msm.datapack', 'msm.blocks-items'] };
const nodeReadFile = async (url: URL): Promise<Uint8Array> => readFile(url);

const registry = new ElementKindRegistry();
for (const plugin of [resourcePackPlugin, dataPackPlugin, blocksItemsPlugin]) {
  registerPlugin(registry, plugin);
}

const element = (id: string, kind: string, data: Json): Element =>
  createElement({ id: id as ResourceLocation, kind, data, now: () => NOW });

const block = (path: string, data: Record<string, Json>): Element =>
  element(`demo:${path}`, 'msm:block', { format: 1, ...data });

/** A weathering pair of `type` (unaffected with a waxed copy, then exposed), as copper. */
const weatheringPair = (type: string, fields: Record<string, Json> = {}): Element[] => [
  block(`tin_${type}`, {
    type,
    ...fields,
    components: {
      'msm:weathering': { stage: 'unaffected', next: `demo:exposed_tin_${type}` },
      'msm:waxable': { into: `demo:waxed_tin_${type}` },
    },
  }),
  block(`exposed_tin_${type}`, {
    type,
    ...fields,
    components: { 'msm:weathering': { stage: 'exposed' } },
  }),
  block(`waxed_tin_${type}`, { type, ...fields }),
];

const PLANTS: Element[] = [
  block('kelp_like', { type: 'growing_plant', needs_water: true, sound_type: 'grass' }),
  block('glow_vine', {
    type: 'growing_plant',
    direction: 'down',
    berries: { item: 'minecraft:glow_berries', light: 12 },
    components: { 'msm:on_interact': { event: 'demo:picked' } },
    events: {
      'demo:picked': {
        actions: [{ type: 'play_sound', sound: 'minecraft:block.cave_vines.pick_berries' }],
      },
    },
  }),
  block('reed', { type: 'column_plant', style: 'cane', max_height: 5, min_height: 2 }),
  block('spike', { type: 'column_plant', style: 'cactus', touch_damage: 2 }),
  block('cane_bamboo', { type: 'column_plant', style: 'bamboo' }),
  block('glow_moss', { type: 'multiface', light: 5, spreads: false }),
  block('big_leaf', { type: 'dripleaf', size: 'big', tilt_ticks: [4, 12, 12] }),
  block('small_leaf', { type: 'dripleaf', size: 'small', grows_into: 'demo:big_leaf' }),
  block('clay_pot', {
    type: 'flower_pot',
    loot: 'self',
    plants: ['minecraft:poppy', 'minecraft:dandelion'],
  }),
  block('clay_pot_fern', {
    type: 'potted_plant',
    plant: 'minecraft:fern',
    pot: 'demo:clay_pot',
    loot: 'self',
    item: false,
  }),
];

const WEATHERING: Element[] = [
  ...weatheringPair('rod'),
  ...weatheringPair('button', { set_type: 'copper' }),
  ...weatheringPair('pressure_plate', { set_type: 'copper', weighted_max: 15 }),
  ...weatheringPair('fence'),
  ...weatheringPair('fence_gate', { wood_type: 'oak' }),
  ...weatheringPair('wall'),
];

const STORAGE: Element[] = [
  block('sea_chest', {
    type: 'horizontal',
    components: {
      'msm:container': { double: true, on_open: 'demo:opened' },
      'msm:on_interact': { event: 'demo:opened' },
    },
    events: {
      'demo:opened': { actions: [{ type: 'play_sound', sound: 'minecraft:block.chest.open' }] },
    },
  }),
  block('tin_chest', {
    type: 'horizontal',
    components: {
      'msm:container': { double: true },
      'msm:weathering': { stage: 'unaffected', next: 'demo:exposed_tin_chest' },
    },
  }),
  block('exposed_tin_chest', {
    type: 'horizontal',
    components: {
      'msm:container': { double: true },
      'msm:weathering': { stage: 'exposed' },
    },
  }),
  block('void_chest', { components: { 'msm:container': { per_player: true } } }),
  block('wet_crate', {
    components: { 'msm:container': { rows: 2 }, 'msm:waterloggable': {} },
  }),
  block('tin_crate', {
    components: {
      'msm:container': {},
      'msm:weathering': { stage: 'unaffected', next: 'demo:exposed_tin_crate' },
      'msm:waxable': { into: 'demo:waxed_tin_crate' },
    },
  }),
  block('exposed_tin_crate', {
    components: { 'msm:container': {}, 'msm:weathering': { stage: 'exposed' } },
  }),
  block('waxed_tin_crate', { components: { 'msm:container': {} } }),
];

const SOUNDS_AND_PAIRS: Element[] = [
  block('chime_block', {
    sound_type: 'amethyst',
    block_sounds: {
      break: 'minecraft:block.amethyst_block.break',
      step: 'minecraft:block.amethyst_block.step',
      volume: 0.8,
    },
  }),
  block('creaky_door', {
    type: 'door',
    set_type: {
      base: 'iron',
      can_open_by_hand: true,
      sounds: { open: 'minecraft:block.iron_door.open', close: 'minecraft:block.chest.close' },
    },
  }),
  block('quiet_button', {
    type: 'button',
    set_type: 'stone',
    block_sounds: { place: 'minecraft:block.wool.place' },
  }),
  block('loam', {
    components: {
      'msm:flattenable': { into: 'demo:loam_path' },
      'msm:tillable': { into: 'demo:loam_farmland', drops: 'minecraft:stick' },
    },
  }),
  block('loam_path', {}),
  block('loam_farmland', {}),
  block('soft_log', {
    type: 'pillar',
    components: { 'msm:strippable': { into: 'demo:soft_wood' } },
  }),
  block('soft_wood', { type: 'pillar' }),
];

const RULES = element('demo:farm_rules', 'msm:vanilla_block_rules', {
  format: 1,
  strip: [{ block: 'minecraft:mossy_cobblestone', into: 'minecraft:cobblestone' }],
});

const BLOCKS = [...PLANTS, ...WEATHERING, ...STORAGE, ...SOUNDS_AND_PAIRS];

/** A block transformer turning a project block into another (B517 probe: an unknown block fails the pack). */
const TRANSFORMER = element('demo:loam_shovel', 'minecraft:block_transformer', [
  {
    block_state_provider: {
      type: 'minecraft:rule_based',
      rules: [
        {
          if_true: { type: 'minecraft:matching_blocks', blocks: 'demo:loam' },
          // biome-ignore lint/suspicious/noThenProperty: the block state provider's field
          then: { type: 'minecraft:simple', state: { id: 'demo:loam_path' } },
        },
      ],
    },
    sound: 'minecraft:item.shovel.flatten',
  },
]);

function project(elements: Element[]): Project {
  return {
    ...createEmptyProject('Vanilla parity 3'),
    namespaces: [{ name: 'demo', elements, assets: [] }],
  };
}

/** The block and item ids as the app's `dataRegistryIds` declares them: blocks, companions, items. */
function registryIds(): { block: string[]; item: string[] } {
  const blocks = BLOCKS.flatMap((entry) => [
    entry.id as string,
    ...blockGeneratedBlockIds(entry.id, entry.data),
  ]);
  const items = BLOCKS.filter(
    (entry) => !(typeof entry.data === 'object' && entry.data !== null && 'item' in entry.data),
  ).map((entry) => entry.id as string);
  return { block: blocks, item: items };
}

describe('vanilla parity 3, batch 1, in the vanilla data pack', () => {
  for (const bundle of builtInTargets) {
    it(`leaves out what names the new blocks and keeps the rest (${bundle.target.id})`, async () => {
      const { schemaIndex } = await indexesFor(bundle);
      const vanilla = (await readVendoredJson(bundle, 'mcmetaRegistries', nodeReadFile)) as Record<
        string,
        string[]
      >;
      const ids = registryIds();
      expect(ids.block).toContain('demo:clay_pot_poppy');
      expect(ids.block).toContain('demo:glow_vine_plant');
      const registries = createRegistryIndex({ vanilla, project: ids });
      const sink = createMemorySink();
      const report = await runExport({
        project: project([...BLOCKS, RULES, TRANSFORMER]),
        registry,
        target: bundle.target,
        schemaIndex,
        registries,
        exporter: vanillaSafeExporter(dataPackExporter, modOnlyIdsOf(ids)),
        sink,
        readAsset: async () => {
          throw new Error('no assets');
        },
        meta,
      });
      expect(report.problems.filter((p) => p.severity === 'error')).toEqual([]);
      expect(report.ok).toBe(true);
      const files = sink.files();
      const paths = [...files.keys()];
      const loot = bundle.target.folders.data.loot_table;
      // The pots' loot tables (the pot, its listed plants, the potted fern) name the pot's item.
      const left = report.problems
        .filter((problem) => problem.code === MOD_ONLY_REFERENCE)
        .map((problem) => problem.file);
      for (const path of ['clay_pot', 'clay_pot_poppy', 'clay_pot_dandelion', 'clay_pot_fern']) {
        expect(left).toContain(`data/demo/${loot}/blocks/${path}.json`);
        expect(files.has(`data/demo/${loot}/blocks/${path}.json`)).toBe(false);
      }
      expect(paths.some((path) => path.includes(`/${loot}/`))).toBe(false);
      // A block transformer naming a project block would fail the whole pack: left out.
      expect(left).toContain('data/demo/block_transformer/loam_shovel.json');
      expect(FATAL_DATA_FOLDERS).toEqual(
        expect.arrayContaining([
          'block_transformer',
          'sulfur_cube_archetype',
          'test_environment',
          'test_instance',
        ]),
      );
      // Tag entries naming the new blocks are optional.
      const tag = (path: string): Json => {
        const data = files.get(path);
        if (data === undefined) throw new Error(`${path} was not written`);
        return JSON.parse(utf8.decode(data)) as Json;
      };
      const pots = tag(
        `data/minecraft/${bundle.target.folders.data.tags}/block/flower_pots.json`,
      ) as { values: Json[] };
      expect(pots.values).toContainEqual({ id: 'demo:clay_pot_poppy', required: false });
      for (const value of pots.values) {
        if (typeof value === 'string') expect(value.startsWith('demo:'), value).toBe(false);
      }
      // Nothing of the runtime layer; the sound set entries where sounds are data.
      expect(paths.some((path) => path.startsWith('msm/'))).toBe(false);
      const soundSets = paths.filter((path) => path.includes('/block_sound_set/'));
      expect(soundSets.length > 0).toBe(bundle.target.blocks?.soundModel === 'block_sound_set');
    });
  }

  it('notes the rules for vanilla blocks', () => {
    const notes = needsJarNotes([...BLOCKS, RULES]);
    expect(notes.map((note) => [note.code, note.severity, note.elementId])).toEqual([
      [ExportProblemCodes.needsJar, 'info', 'demo:farm_rules'],
    ]);
    expect(notes[0]?.message).toContain('Fabric mod jar');
  });
});

describe('vanilla parity 3, batch 1, in the Java project', () => {
  for (const bundle of builtInTargets.filter((entry) => entry.target.javaProject !== undefined)) {
    it(`generates the plants, pots, weathering, storage, sounds and pairs (${bundle.target.id})`, async () => {
      const { schemaIndex, registries } = await indexesFor(bundle);
      const sink = createMemorySink();
      const out = process.env.MSM_VANILLA_PARITY_3_JAVA_OUT;
      const wrapper = out === undefined ? undefined : await engineModWrapper();
      const report = await runExport({
        project: project([...BLOCKS, RULES]),
        registry,
        target: bundle.target,
        schemaIndex,
        registries,
        exporter: createJavaProjectExporter({ loadGradleWrapper: async () => wrapper }),
        sink,
        readAsset: async () => {
          throw new Error('no assets');
        },
        meta,
      });
      expect(report.problems.filter((p) => p.severity === 'error')).toEqual([]);
      expect(report.ok).toBe(true);
      const leftOut = report.problems.filter((p) => p.code === ExportProblemCodes.notInEject);
      expect(leftOut.map((p) => [p.file, p.severity])).toEqual([
        ['msm/demo/vanilla_block_rules/farm_rules.json', 'warning'],
      ]);
      expect(leftOut[0]?.message).toContain('rules for vanilla blocks');
      const files = sink.files();
      const root =
        [...files.keys()]
          .find((path) => path.endsWith('/ModBlocks.java'))
          ?.replace('/ModBlocks.java', '') ?? '';
      if (out !== undefined) await writeTree(files, out);
      const text = (path: string): string => {
        const data = files.get(`${root}/${path}`);
        if (data === undefined) throw new Error(`${path} was not generated`);
        return utf8.decode(data);
      };
      const blocks = text('ModBlocks.java');
      expect(blocks).toContain('GLOW_VINE.attachBody(GLOW_VINE_PLANT);');
      expect(blocks).toContain('new ModGrowingPlantHeadBlock.Water(new PlantSpec.GrowingPlant(');
      expect(blocks).toContain('CANE_BAMBOO.attachShoot(CANE_BAMBOO_SHOOT);');
      expect(blocks).toContain('BIG_LEAF.attachStem(BIG_LEAF_STEM);');
      expect(blocks).toContain('new ModColumnPlantBlock.Cane(new PlantSpec.ColumnPlant(5, 2,');
      expect(blocks).toContain(
        'potted(CLAY_POT, Identifier.fromNamespaceAndPath("demo", "clay_pot_poppy")',
      );
      expect(blocks).toContain('CLAY_POT.addPotted(CLAY_POT_FERN.plant(), CLAY_POT_FERN);');
      expect(blocks).toContain(
        'BlockWaxing.weathers(Identifier.fromNamespaceAndPath("demo", "tin_rod"));',
      );
      expect(blocks).toContain('Lightning.init();');
      expect(blocks).toContain('PlayerStores.register();');
      expect(blocks).toContain('BlockStripping.flatten(LOAM,');
      expect(blocks).toContain('.sound(ModBlocks.ownSounds(');
      expect(text('block/CreakyDoorBlock.java')).toContain('ModBlocks.ownSetType(');
      expect(text('block/QuietButtonBlock.java')).toContain('ModBlocks.ownSetType(');
      expect(text('block/TinButtonBlock.java')).toContain('BlockWaxing.Pressed');
      expect(text('block/SeaChestBlock.java')).toContain('extends DoubleChestBlock');
      expect(text('block/VoidChestBlock.java')).toContain('PlayerStores.open(storage, player);');
      expect(text('block/WetCrateBlock.java')).toContain('SimpleWaterloggedBlock');
      expect(text('block/TinCrateBlock.java')).toContain(
        'BlockWaxing.age(this, state, level, pos, random);',
      );
      for (const shared of [
        'Lightning.java',
        'BlockWaxing.java',
        'BlockStripping.java',
        'block/PlayerStores.java',
        'block/DoubleChestBlock.java',
        'block/DoubleChestBlockEntity.java',
        'block/type/PlantSpec.java',
        'block/type/ModFlowerPotBlock.java',
      ]) {
        expect(files.has(`${root}/${shared}`), shared).toBe(true);
      }
      expect(text('ModBlockEntities.java')).toContain('SEA_CHEST');
    });
  }
});
