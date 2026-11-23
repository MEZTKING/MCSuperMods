/**
 * The vanilla parity batch 1 in the exporters (ADR 0094 D13, ADR 0095 D6, ADR 0096 D6, ADR 0101
 * D8; B457):
 *
 * - vanilla packs: a recipe making a project torch is left out of the vanilla data pack with
 *   `export.mod-only-reference` (its companion `<id>_wall` too), creative tabs are mod-only ids,
 *   a function running a project command is kept with `export.mod-only-function`, and
 *   `needsJarNotes` gives one info per command and tab;
 * - the Java eject (on targets with a Java generator): a project with the new block types, a weathering set with waxed copies,
 *   a waterlogged block, bags, a bundle, commands and a creative tab generates; the only
 *   `export.not-in-eject` is the one for the script listening to `block.place`. With
 *   `MSM_VANILLA_PARITY_JAVA_OUT` set, the tree is written there with the engine-mod Gradle wrapper
 *   for `./gradlew build` (JDK 25).
 *
 * Exported through the real plugins and `runExport`.
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
import blocksItemsPlugin from '@msm/plugin-blocks-items';
import dataPackPlugin from '@msm/plugin-datapack';
import resourcePackPlugin from '@msm/plugin-resourcepack';
import scriptingPlugin from '@msm/plugin-scripting';
import { createRegistryIndex } from '@msm/schemas';
import { builtInTargets, readVendoredJson } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import {
  commandLiteralsOf,
  createJavaProjectExporter,
  createMemorySink,
  dataPackExporter,
  ExportProblemCodes,
  MOD_ONLY_FUNCTION,
  MOD_ONLY_REFERENCE,
  modOnlyIdsOf,
  needsJarNotes,
  runExport,
  vanillaSafeExporter,
} from '../src/index';
import { indexesFor } from './helpers';
import { engineModWrapper, writeTree } from './sample-java';

const NOW = '2026-11-15T00:00:00.000Z';
const meta = {
  msmVersion: '1.5.1',
  plugins: ['msm.datapack', 'msm.blocks-items', 'msm.scripting'],
};
const nodeReadFile = async (url: URL): Promise<Uint8Array> => readFile(url);

const registry = new ElementKindRegistry();
for (const plugin of [resourcePackPlugin, dataPackPlugin, blocksItemsPlugin, scriptingPlugin]) {
  registerPlugin(registry, plugin);
}

const element = (id: string, kind: string, data: Json): Element =>
  createElement({ id: id as ResourceLocation, kind, data, now: () => NOW });

const block = (path: string, data: Record<string, Json>): Element =>
  element(`demo:${path}`, 'msm:block', { format: 1, ...data });

const item = (path: string, data: Record<string, Json>): Element =>
  element(`demo:${path}`, 'msm:item', { format: 1, ...data });

const TAB = 'demo:curios';

const BLOCKS: Element[] = [
  block('lamp', { type: 'torch', particle: 'minecraft:soul_fire_flame' }),
  block('board', {
    type: 'sign',
    wood_type: 'cherry',
    components: { 'msm:on_place': { event: 'demo:ping' } },
    events: {
      'demo:ping': { actions: [{ type: 'play_sound', sound: 'minecraft:block.note_block.bell' }] },
    },
  }),
  block('hanging_board', { type: 'hanging_sign', wood_type: 'bamboo' }),
  block('gourd', { type: 'horizontal' }),
  block('gourd_stem', {
    type: 'stem',
    fruit: 'demo:gourd',
    item: { id: 'demo:gourd_seeds' },
    components: { 'msm:on_random_tick': { event: 'demo:ping' } },
    events: {
      'demo:ping': { actions: [{ type: 'play_sound', sound: 'minecraft:block.note_block.bell' }] },
    },
  }),
  block('cot', { type: 'bed', rule: 'straw_bed', colour: 'yellow' }),
  block('pie', {
    type: 'cake',
    food: { nutrition: 3, saturation: 0.2 },
    on_eat: 'demo:yum',
    events: {
      'demo:yum': { actions: [{ type: 'play_sound', sound: 'minecraft:entity.player.burp' }] },
    },
  }),
  block('blue_berry_bush', {
    type: 'berry_bush',
    berry: 'demo:blue_berries',
    harvest: { ripe: [1, 1], full: [2, 4] },
    item: { id: 'demo:blue_berries' },
    components: { 'msm:on_interact': { event: 'demo:ping' } },
    events: {
      'demo:ping': { actions: [{ type: 'play_sound', sound: 'minecraft:block.note_block.bell' }] },
    },
  }),
  block('potted_fern_like', { type: 'potted_plant', plant: 'minecraft:short_grass' }),
  block('scaffold', {
    type: 'scaffolding',
    components: { 'msm:on_interact': { event: 'demo:ping' } },
    events: {
      'demo:ping': { actions: [{ type: 'play_sound', sound: 'minecraft:block.note_block.bell' }] },
    },
  }),
  block('rope_ladder', { type: 'ladder' }),
  block('lantern', {
    type: 'lantern',
    components: {
      'msm:on_break': { event: 'demo:ping' },
      'msm:weathering': { stage: 'unaffected' },
    },
    events: {
      'demo:ping': { actions: [{ type: 'play_sound', sound: 'minecraft:block.note_block.bell' }] },
    },
  }),
  block('chain', { type: 'chain', components: { 'msm:weathering': { stage: 'oxidized' } } }),
  block('rod', { type: 'rod' }),
  block('candle', { type: 'candle', item: { creative_tab: TAB } }),
  block('pickle', { type: 'sea_pickle' }),
  block('ivy', { type: 'vine', spreads: false }),
  block('rug', { type: 'carpet' }),
  block('sand_layers', { type: 'layers' }),
  block('pod', { type: 'cocoa', support: '#minecraft:logs' }),
  block('tall_bloom', { type: 'tall_plant', bonemeal: 'none' }),
  block('wet_lamp', {
    components: { 'msm:light_emitter': { level: 12 }, 'msm:waterloggable': {} },
  }),
  block('wet_post', { type: 'directional', components: { 'msm:waterloggable': {} } }),
  // A weathering set with waxed copies (blocks-items golden `weathering-tin-set`).
  ...(['unaffected', 'exposed', 'weathered', 'oxidized'] as const).flatMap((stage, i, all) => {
    const name = stage === 'unaffected' ? 'tin' : `${stage}_tin`;
    const next = all[i + 1];
    return [
      block(name, {
        components: {
          'msm:weathering': {
            stage,
            ...(next === undefined
              ? {}
              : { next: `demo:${next === 'unaffected' ? 'tin' : `${next}_tin`}` }),
          },
          'msm:waxable': { into: `demo:waxed_${name}` },
          ...(stage === 'unaffected'
            ? { 'msm:on_random_tick': { event: 'demo:creak', chance: 0.1 } }
            : {}),
        },
        ...(stage === 'unaffected'
          ? {
              events: {
                'demo:creak': {
                  actions: [{ type: 'play_sound', sound: 'minecraft:block.copper.step' }],
                },
              },
            }
          : {}),
      }),
      block(`waxed_${name}`, {}),
    ];
  }),
  block('tin_door', {
    type: 'door',
    set_type: 'copper',
    components: { 'msm:weathering': { stage: 'unaffected', next: 'demo:exposed_tin_door' } },
  }),
  block('exposed_tin_door', {
    type: 'door',
    set_type: 'copper',
    components: { 'msm:weathering': { stage: 'exposed' } },
  }),
  block('tin_slab', {
    type: 'slab',
    components: { 'msm:weathering': { stage: 'unaffected', next: 'minecraft:exposed_copper' } },
  }),
];

const ITEMS: Element[] = [
  item('satchel', {
    max_stack_size: 1,
    creative_tab: TAB,
    components: {
      'msm:item_inventory': {
        layout: 'chest',
        rows: 2,
        open: 'sneak_use',
        open_sound: 'minecraft:item.armor.equip_leather',
        on_open: 'demo:opened',
      },
    },
    events: { 'demo:opened': { actions: [{ type: 'run_function', function: 'demo:greet' }] } },
  }),
  item('knapsack', { max_stack_size: 1, components: { 'msm:item_inventory': {} } }),
  item('hopper_bag', {
    max_stack_size: 1,
    components: { 'msm:item_inventory': { layout: 'hopper' } },
  }),
  item('pouch', { max_stack_size: 1, creative_tab: TAB, components: { 'msm:bundle': {} } }),
];

const COMMANDS: Element[] = [
  element('demo:hello', 'msm:command', {
    format: 1,
    name: 'hello',
    aliases: ['hi'],
    event: 'greet',
    events: {
      greet: { actions: [{ type: 'play_sound', sound: 'minecraft:block.note_block.chime' }] },
    },
    feedback_text: 'Hello!',
  }),
  element('demo:gift', 'msm:command', {
    format: 1,
    name: 'gift',
    permission: 2,
    function: 'demo:give_gift',
    arguments: [
      { name: 'target', type: 'player' },
      { name: 'count', type: 'integer', min: 1, max: 64 },
      { name: 'what', type: 'item', optional: true },
      { name: 'where', type: 'position', optional: true },
    ],
  }),
];

const TABS: Element[] = [
  element(TAB, 'msm:creative_tab', {
    format: 1,
    icon: 'demo:pouch',
    order: 'by_name',
    display_name: 'Curios',
  }),
];

const FUNCTIONS: Element[] = [
  element('demo:greet', 'minecraft:function', { lines: ['say hello'] }),
  element('demo:give_gift', 'minecraft:function', { lines: ['$give $(target) diamond $(count)'] }),
  // Runs a project command: a vanilla server cannot parse it.
  element('demo:call_hello', 'minecraft:function', { lines: ['execute as @a run hello'] }),
];

/** A script listening to the block placement event (the runtime's Mixin, ADR 0096 D3). */
const PLACE_SCRIPT = element('demo:no_build', 'msm:script', {
  lines: [
    'msm.events.on("block.place", (e) => {',
    '  e.cancel();',
    '});',
    'msm.events.on("block.interact", () => {});',
  ],
});

/** A recipe whose result is the project torch. */
const TORCH_RECIPE = element('demo:lamp_recipe', 'minecraft:recipe', {
  type: 'minecraft:crafting_shapeless',
  ingredients: ['minecraft:stick', 'minecraft:coal'],
  result: { id: 'demo:lamp', count: 4 },
});

/** A recipe with only vanilla ids: kept. */
const PLAIN_RECIPE = element('demo:plain_recipe', 'minecraft:recipe', {
  type: 'minecraft:crafting_shapeless',
  ingredients: ['minecraft:iron_ingot'],
  result: { id: 'minecraft:iron_block', count: 1 },
});

function project(elements: Element[]): Project {
  return {
    ...createEmptyProject('Vanilla parity'),
    namespaces: [{ name: 'demo', elements, assets: [] }],
  };
}

describe('the vanilla parity types in the vanilla data pack', () => {
  for (const bundle of builtInTargets) {
    it(`leaves out a recipe making a project torch (${bundle.target.id})`, async () => {
      const { schemaIndex } = await indexesFor(bundle);
      const vanilla = (await readVendoredJson(bundle, 'mcmetaRegistries', nodeReadFile)) as Record<
        string,
        string[]
      >;
      // As the app's `dataRegistryIds` declares them: the torch, its companion and its item.
      const ids = {
        block: ['demo:lamp', 'demo:lamp_wall'],
        item: ['demo:lamp'],
        creative_mode_tab: [TAB],
      };
      const registries = createRegistryIndex({
        vanilla,
        project: {
          ...ids,
          recipe: ['demo:lamp_recipe', 'demo:plain_recipe'],
          function: ['demo:call_hello'],
        },
      });
      const elements = [
        BLOCKS[0] as Element,
        TORCH_RECIPE,
        PLAIN_RECIPE,
        FUNCTIONS[2] as Element,
        ...COMMANDS,
        ...TABS,
      ];
      const sink = createMemorySink();
      const modOnly = modOnlyIdsOf(ids, commandLiteralsOf(elements));
      expect(modOnly.get('creative_mode_tab')).toEqual(new Set([TAB]));
      const report = await runExport({
        project: project(elements),
        registry,
        target: bundle.target,
        schemaIndex,
        registries,
        exporter: vanillaSafeExporter(dataPackExporter, modOnly),
        sink,
        readAsset: async () => {
          throw new Error('no assets');
        },
        meta,
      });
      expect(report.problems.filter((p) => p.severity === 'error')).toEqual([]);
      expect(report.ok).toBe(true);
      const recipes = bundle.target.folders.data.recipe;
      const left = report.problems.filter((problem) => problem.code === MOD_ONLY_REFERENCE);
      expect(left.map((problem) => problem.file)).toContain(
        `data/demo/${recipes}/lamp_recipe.json`,
      );
      const files = sink.files();
      expect(files.has(`data/demo/${recipes}/lamp_recipe.json`)).toBe(false);
      expect(files.has(`data/demo/${recipes}/plain_recipe.json`)).toBe(true);
      // The torch's loot tables (its own and its wall form's) name the item.
      const loot = bundle.target.folders.data.loot_table;
      expect(files.has(`data/demo/${loot}/blocks/lamp.json`)).toBe(false);
      expect(files.has(`data/demo/${loot}/blocks/lamp_wall.json`)).toBe(false);
      // A function running /hello is kept, with a warning.
      const flagged = report.problems.filter((problem) => problem.code === MOD_ONLY_FUNCTION);
      expect(flagged.map((problem) => problem.message)).toEqual([
        expect.stringContaining('names /hello'),
      ]);
      expect([...files.keys()].some((path) => path.startsWith('msm/'))).toBe(false);
    });
  }

  it('notes each command and creative tab of a vanilla pack export', () => {
    const notes = needsJarNotes([...COMMANDS, ...TABS, BLOCKS[0] as Element]);
    expect(notes.map((note) => [note.code, note.severity, note.elementId])).toEqual([
      [ExportProblemCodes.needsJar, 'info', 'demo:hello'],
      [ExportProblemCodes.needsJar, 'info', 'demo:gift'],
      [ExportProblemCodes.needsJar, 'info', TAB],
    ]);
    expect(notes[0]?.message).toContain('/hello');
  });

  it('collects command literals with their aliases', () => {
    expect(commandLiteralsOf(COMMANDS)).toEqual(['gift', 'hello', 'hi']);
  });
});

describe('the vanilla parity types in the Java project', () => {
  for (const bundle of builtInTargets.filter(
    (entry) => entry.target.loadJavaProject !== undefined,
  )) {
    it(`generates every new type, weathering, bags, commands and tabs (${bundle.target.id})`, async () => {
      const { schemaIndex, registries } = await indexesFor(bundle);
      const sink = createMemorySink();
      const out = process.env.MSM_VANILLA_PARITY_JAVA_OUT;
      const wrapper = out === undefined ? undefined : await engineModWrapper();
      const report = await runExport({
        project: project([
          ...BLOCKS,
          ...ITEMS,
          ...COMMANDS,
          ...TABS,
          ...FUNCTIONS,
          PLACE_SCRIPT,
          TORCH_RECIPE,
        ]),
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
      expect(
        report.problems.filter((p) => p.code === ExportProblemCodes.javaGenerationFailed),
      ).toEqual([]);
      // export.not-in-eject only for the script listening to block.place.
      const leftOut = report.problems.filter((p) => p.code === ExportProblemCodes.notInEject);
      expect(leftOut.map((p) => [p.file, p.severity])).toEqual([
        ['msm/demo/script/no_build.ts', 'warning'],
      ]);
      expect(leftOut[0]?.message).toContain('block.place');
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
      expect(blocks).toContain('LAMP_WALL = Registry.register(BuiltInRegistries.BLOCK');
      expect(blocks).toContain('new StandingAndWallBlockItem(LAMP, LAMP_WALL, Direction.DOWN');
      expect(blocks).toContain('new HangingSignItem(HANGING_BOARD, HANGING_BOARD_WALL');
      expect(blocks).toContain('BlockEntityTypes.SIGN.addValidBlock(BOARD_WALL);');
      // B457a: a sign sounds like its wood_type (the runtime's rule), not its sound_type.
      expect(blocks).toContain('.sound(WoodType.CHERRY.soundType())');
      expect(blocks).toContain('.sound(WoodType.BAMBOO.hangingSignSoundType())');
      expect(blocks).toContain('new AttachedStemBlock(');
      expect(blocks).toContain('new ModScaffoldingBlock.PlacingItem(SCAFFOLD');
      expect(blocks).toContain(
        'BlockWaxing.wax(TIN, Identifier.fromNamespaceAndPath("demo", "waxed_tin"));',
      );
      expect(blocks).toContain(
        'BlockWaxing.scrape(Identifier.fromNamespaceAndPath("demo", "exposed_tin"), Identifier.fromNamespaceAndPath("demo", "tin"));',
      );
      // A vanilla next stage is never scraped back into the project's block.
      expect(blocks).not.toContain(
        '"exposed_copper"), Identifier.fromNamespaceAndPath("demo", "tin_slab")',
      );
      expect(blocks.indexOf('POTTED_FERN_LIKE =')).toBeGreaterThan(blocks.indexOf('TIN_SLAB ='));
      expect(text('BlockWaxing.java')).toContain(
        'UseBlockCallback.EVENT.register(BlockWaxing::use)',
      );
      expect(text('block/TinBlock.java')).toContain(
        'implements ChangeOverTimeBlock<WeatheringCopper.WeatherState>',
      );
      expect(text('block/TinBlock.java')).toContain('changeOverTime(state, level, pos, random);');
      expect(text('block/TinDoorBlock.java')).toContain(
        'state.getValue(HALF) == DoubleBlockHalf.UPPER',
      );
      expect(text('block/WetLampBlock.java')).toContain('implements SimpleWaterloggedBlock');
      expect(text('block/PieBlock.java')).toContain('extends ModCakeBlock');
      for (const driver of [
        'ModBedBlock',
        'ModBerryBushBlock',
        'ModCakeBlock',
        'ModCocoaBlock',
        'ModLayersBlock',
        'ModScaffoldingBlock',
        'ModSeaPickleBlock',
        'ModTallPlantBlock',
        'ModVineBlock',
      ]) {
        expect(files.has(`${root}/block/type/${driver}.java`)).toBe(true);
      }
      expect(text('item/SatchelItem.java')).toContain('extends BagItem');
      expect(text('item/SatchelItem.java')).toContain('BagItem.Layout.CHEST, 2, true');
      expect(files.has(`${root}/item/BagMenus.java`)).toBe(true);
      expect(text('ModItems.java')).toContain('new BundleItem(');
      const commands = text('ModCommands.java');
      expect(commands).toContain('dispatcher.register(command2("hello", buildContext));');
      expect(commands).toContain('dispatcher.register(command2("hi", buildContext));');
      expect(commands).toContain('Commands.hasPermission(Commands.LEVEL_GAMEMASTERS)');
      expect(commands).toContain('EntityArgument.player()');
      // A player argument reaches the macro as the name: vanilla give refuses a UUID (B464a).
      expect(commands).toContain(
        'args.putString("target", EntityArgument.getPlayer(context, "target").getName().getString());',
      );
      expect(commands).not.toContain('getPlayer(context, "target").getStringUUID()');
      expect(commands).toContain('IntegerArgumentType.integer(1, 64)');
      expect(commands).toContain('ItemArgument.item(buildContext)');
      const tabs = text('ModCreativeTabs.java');
      expect(tabs).toContain('FabricCreativeModeTab.builder()');
      expect(tabs).toContain('Component.translatable("itemGroup.demo.curios")');
      // A project tab lists its own members, so no tab event line names it.
      expect(text('ModItems.java')).not.toContain('"curios"');
      const mod = text('VanillaParityMod.java');
      expect(mod.indexOf('ModCreativeTabs.register();')).toBeLessThan(
        mod.indexOf('ModBlocks.register();'),
      );
      expect(mod).toContain('ModCommands.register();');
    });
  }
});
