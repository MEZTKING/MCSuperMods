/**
 * Batch 2 of vanilla parity 3 and of vanilla parity 2 in the Java eject (ADR 0112 D3; B537), built
 * from hand-made lowered files on every target with a Java generator:
 *
 * - fluids (with mixing, a cauldron in levels, a bottle and events), a villager profession and its
 *   job site, a villager type, game rules, a statistic, rules for vanilla blocks, a command with
 *   the new argument types and an `open_dialog` event, and a hand-ordered creative tab are
 *   generated with no error and no `export.not-in-eject`;
 * - a boat item and its chest boat are generated as the runtime's (`boat/ModBoats`, the client's
 *   `BoatRenderers`; B537b): its recipe and tag entry stay as they are;
 * - a hovering mob with the swoop and roost goals and a fish (swim) with a bucket and a dash are
 *   generated with them (`HoverMoveControl`, `SwoopGoal`, `MobHabits`, the bucket item; B537b);
 *   only a mob with a trader, storage or shoulder riding still gets one `export.not-in-eject`.
 *
 * With `MSM_VANILLA_PARITY_3_BATCH_2_JAVA_OUT` set, the tree is written there with the engine-mod
 * Gradle wrapper for `./gradlew build` (JDK 25; B541 wires it into CI).
 */
import { utf8 } from '@msm/core';
import type { Json } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import {
  createJavaProjectExporter,
  createMemorySink,
  ExportProblemCodes,
  runExport,
} from '../src/index';
import { fakeAsset, indexesFor, meta, project, raw, testRegistry } from './helpers';
import { engineModWrapper, writeTree } from './sample-java';

const msm = (path: string, json: Json) =>
  raw(`demo:${path.replaceAll('/', '_')}`, { path: `msm/demo/${path}.json`, layer: 'msm', json });
const data = (path: string, json: Json) =>
  raw(`demo:data_${path.replaceAll('/', '_')}`, { path, layer: 'datapack', json });

const animated = {
  'msm:animated_model': { model: 'demo:geo/glider', texture: 'demo:textures/entity/glider.png' },
};

const FILES = [
  msm('fluid/tea', {
    format: 1,
    behaves_like: 'water',
    tint: 9067051,
    flow: { tick_delay: 10 },
    on_entity_inside: 'demo:warm',
    mixing: [
      { with: 'lava', source: 'minecraft:stone', flowing: 'minecraft:cobblestone' },
      { with: 'demo:honey', source: 'minecraft:obsidian' },
    ],
    cauldron: { levels: true },
    bottle: {
      food: { nutrition: 1, saturation: 0.2 },
      effects: [{ effect: 'minecraft:speed', seconds: 3 }],
      on_drink: 'demo:warm',
    },
    events: {
      'demo:warm': {
        actions: [{ type: 'apply_effect', effect: 'minecraft:speed', seconds: 3, target: 'self' }],
      },
    },
  }),
  msm('fluid/honey', { format: 1, behaves_like: 'lava', cauldron: { levels: true } }),
  msm('block/forge', { format: 1 }),
  msm('villager_profession/smith', { format: 1, job_site: 'demo:forge' }),
  msm('villager_type/marsh', { format: 1, biomes: ['minecraft:swamp', '#minecraft:is_jungle'] }),
  msm('game_rule/mobs/max_pets', {
    format: 1,
    kind: 'integer',
    category: 'mobs',
    default: 3,
    min: 0,
    max: 10,
  }),
  msm('game_rule/quiet', { format: 1, kind: 'boolean', default: true }),
  msm('stat/caves/time_in_caves', { format: 1, formatter: 'time' }),
  msm('vanilla_block_rules/farm', {
    format: 1,
    strip: [{ block: 'minecraft:stone', into: 'minecraft:smooth_stone' }],
    till: [{ block: 'minecraft:mud', into: 'minecraft:farmland', drops: 'minecraft:clay_ball' }],
    wax: [{ block: 'minecraft:tuff', into: 'minecraft:polished_tuff' }],
    age: [{ block: 'minecraft:copper_block', next: 'minecraft:exposed_copper' }],
    burn: [{ block: 'minecraft:hay_block', burn_odds: 60, ignite_odds: 20 }],
  }),
  msm('command/where', {
    format: 1,
    name: 'where',
    event: 'demo:hello',
    arguments: [
      { name: 'place', type: 'structure_or_tag' },
      { name: 'facing', type: 'rotation' },
      { name: 'what', type: 'item_predicate' },
      { name: 'note', type: 'message', optional: true },
    ],
    events: { 'demo:hello': { actions: [{ type: 'open_dialog', dialog: 'demo:welcome' }] } },
  }),
  msm('command/tally', {
    format: 1,
    name: 'tally',
    function: 'demo:tally',
    arguments: [
      { name: 'ticks', type: 'time' },
      { name: 'colour', type: 'hex_colour' },
      { name: 'loot', type: 'loot_table' },
      { name: 'data', type: 'nbt' },
    ],
  }),
  msm('creative_tab/kit', {
    format: 1,
    icon: 'minecraft:bucket',
    order: 'by_hand',
    items: ['demo:tea_bucket', 'minecraft:water_bucket'],
  }),
  msm('item/woods/ash_boat', {
    format: 1,
    max_stack_size: 1,
    components: { 'msm:boat': { chest: true } },
  }),
  data('data/demo/recipe/woods/ash_boat.json', {
    type: 'minecraft:crafting_shaped',
    pattern: ['# #', '###'],
    key: { '#': 'minecraft:oak_planks' },
    result: { id: 'demo:woods/ash_boat' },
  }),
  data('data/minecraft/tags/item/chest_boats.json', { values: ['demo:woods/ash_chest_boat'] }),
  msm('entity/glider', {
    format: 1,
    category: 'creature',
    size: { width: 0.6, height: 0.6 },
    components: {
      ...animated,
      'msm:movement': { mode: 'hover', hover_height: 4 },
      'msm:attack': { damage: 2 },
      'msm:ai_goals': {
        goals: [
          { type: 'swoop', priority: 2, targets: ['minecraft:chicken'] },
          { type: 'roost', priority: 3 },
          { type: 'look_around', priority: 5 },
        ],
      },
    },
  }),
  msm('entity/carp', {
    format: 1,
    category: 'water_creature',
    size: { width: 0.5, height: 0.4 },
    components: {
      ...animated,
      'msm:movement': { mode: 'swim' },
      'msm:bucketable': {},
    },
  }),
  msm('entity/runner', {
    format: 1,
    category: 'creature',
    size: { width: 1.2, height: 1.6 },
    components: {
      ...animated,
      'msm:rideable': { saddle: false, dash: { power: 1 } },
    },
  }),
  msm('entity/peddler', {
    format: 1,
    category: 'creature',
    size: { width: 0.6, height: 1.9 },
    components: {
      ...animated,
      'msm:trader': { trade_sets: [{ trade_set: 'demo:peddler/level_1' }] },
    },
  }),
];

describe.each(
  builtInTargets
    .filter((bundle) => bundle.target.javaProject !== undefined)
    .map((bundle) => [bundle.target.id, bundle] as const),
)('batch 2 in the Java project (%s)', (_id, bundle) => {
  it('generates fluids, professions, villager types, rules, stats, commands and tabs', async () => {
    const out = process.env.MSM_VANILLA_PARITY_3_BATCH_2_JAVA_OUT;
    const wrapper = out === undefined ? undefined : await engineModWrapper();
    const { schemaIndex, registries } = await indexesFor(bundle);
    const sink = createMemorySink();
    const report = await runExport({
      project: project(FILES),
      registry: testRegistry(),
      target: bundle.target,
      schemaIndex,
      registries,
      exporter: createJavaProjectExporter({ loadGradleWrapper: async () => wrapper }),
      sink,
      readAsset: fakeAsset,
      meta,
    });
    expect(report.problems.filter((p) => p.severity === 'error')).toEqual([]);
    expect(report.ok).toBe(true);
    expect(
      report.problems.filter((p) => p.code === ExportProblemCodes.javaGenerationFailed),
    ).toEqual([]);
    const leftOut = report.problems.filter((p) => p.code === ExportProblemCodes.notInEject);
    expect(leftOut.map((p) => p.file)).toEqual(['msm/demo/entity/peddler.json']);
    expect(leftOut[0]?.message).toContain('trader (msm:trader)');
    const files = sink.files();
    if (out !== undefined) {
      const { mkdir } = await import('node:fs/promises');
      await mkdir(out, { recursive: true });
      await writeTree(files, out);
    }
    const root =
      [...files.keys()]
        .find((path) => path.endsWith('/ModFluids.java'))
        ?.replace('/ModFluids.java', '') ?? '';
    const text = (path: string): string => {
      const found = files.get(`${root}/${path}`);
      if (found === undefined) throw new Error(`${path} was not generated`);
      return utf8.decode(found);
    };
    expect(text('ModFluids.java')).toContain('TeaFluidEvents::inside, TeaFluidEvents::drink');
    expect(text('fluid/FluidCauldrons.java')).toContain('BOTTLE_STACK = 16');
    expect(text('ModProfessions.java')).toContain('"entity.demo.villager.smith"');
    expect(text('ModVillagerTypes.java')).toContain('"#minecraft:is_jungle"');
    expect(text('ModGameRules.java')).toContain('.range(0, 10)');
    expect(text('ModStats.java')).toContain('StatFormatter.TIME');
    expect(text('ModVanillaBlockRules.java')).toContain(
      'OxidizableBlocksRegistry.registerNextStage',
    );
    expect(text('ModCommands.java')).toContain('Actions.openDialog(OWNER,');
    expect(text('ModCreativeTabs.java')).toContain('handOrder(members, KIT_HAND)');
    const glider = text('entity/GliderEntity.java');
    expect(glider).toContain('moveControl = new HoverMoveControl(this, 4.0f);');
    expect(glider).toContain('new SwoopGoal(this, 1.0f, 12.0f, true)');
    expect(glider).toContain('new RoostGoal(this, habits(), ROOST_2, true)');
    expect(text('entity/MobHabits.java')).toContain('public final class MobHabits');
    const carp = text('entity/CarpEntity.java');
    expect(carp).toContain('Bucketable.bucketMobPickup(player, hand, this)');
    expect(text('ModEntities.java')).toContain('new MobBucketItem(CARP, Fluids.WATER');
    expect(text('entity/RunnerEntity.java')).toContain('dashCooldown = 55;');
    expect(text('ModItems.java')).toContain('ModBoats.itemFor(');
    expect(text('boat/ModBoats.java')).toContain('new BoatDispenseItemBehavior(boat.boat())');
    expect(text('client/boat/BoatRenderers.java')).toContain(
      'ModelLayerRegistry.registerModelLayer',
    );
    // The boat's recipe and tag entry stay as they are: the Java project has the boat.
    expect(files.has('src/main/resources/data/demo/recipe/woods/ash_boat.json')).toBe(true);
    const tag = JSON.parse(
      utf8.decode(
        files.get('src/main/resources/data/minecraft/tags/item/chest_boats.json') as Uint8Array,
      ),
    ) as { values: Json[] };
    expect(tag.values).toEqual(['demo:woods/ash_chest_boat']);
  });
});
