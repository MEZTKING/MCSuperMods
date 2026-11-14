/**
 * The 26.3 Java generator (ADR 0033 D3): identifier derivation, one golden per kind built from
 * the runtime's GameTest kitchen-sink definitions (copied from
 * `engine-mod/src/gametest/resources/msm/msm_test/` into `test/fixtures/java-project/input/`;
 * `block-shape_*` are the `MsmShapeGameTest` blocks; `biome_addition-*`, `loot_addition-*`,
 * `block-fuel_block` and `item-fuel_gem` are the `MsmAdditionGameTest` definitions; the trigger
 * items, blocks and `entity-ticker` are the `MsmTriggerGameTest` definitions;
 * `potion-*` are the `MsmPotionGameTest` definitions; `block-type_*` are the
 * `MsmBlockTypeGameTest` and `MsmRedstoneTypeGameTest` building and redstone type blocks and
 * the `MsmPlantGameTest` crops, saplings and leaves;
 * `block-stepping_stone` and `entity-frost_golem` are the `apply_effect` corpus cases of
 * `packages/schemas/mcdoc/msm/conformance/definition/valid/`),
 * determinism, and the errors the exporter reports as `export.java-generation-failed`.
 * `UPDATE_GOLDENS=1` rewrites `test/fixtures/java-project/expected/`.
 */
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DefinitionInput, GeneratedFile, JavaProjectInput, JsonObject } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import { target } from '../src/index';
import {
  className,
  constantName,
  eventMethodName,
  generateJavaProject,
  JAVA_KEYWORDS,
} from '../src/java-project/index';
import { eventMethodNames, NameTable } from '../src/java-project/names';
import { VANILLA_MOB_EFFECTS } from '../src/java-project/potions';

const update = process.env.UPDATE_GOLDENS === '1';
const here = dirname(fileURLToPath(import.meta.url));
const inputRoot = join(here, 'fixtures', 'java-project', 'input');
const expectedRoot = join(here, 'fixtures', 'java-project', 'expected');

async function definition(
  kind: string,
  path: string,
  namespace = 'msm_test',
): Promise<DefinitionInput> {
  const json = JSON.parse(
    await readFile(join(inputRoot, `${kind}-${path}.json`), 'utf8'),
  ) as JsonObject;
  return {
    id: `${namespace}:${path}`,
    path: `msm/${namespace}/${kind}/${path}.json`,
    definition: json,
  };
}

function input(parts: Partial<JavaProjectInput>): JavaProjectInput {
  return {
    modId: 'msm_test',
    javaPackage: 'msm_test',
    modClassName: 'MsmTestMod',
    blocks: [],
    items: [],
    entities: [],
    geckolib: false,
    ...parts,
  };
}

async function listFiles(root: string, prefix = ''): Promise<string[]> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await readdir(join(root, prefix), { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) out.push(...(await listFiles(root, path)));
    else out.push(path);
  }
  return out.sort();
}

/** Compares generated files with `expected/<name>/`, or rewrites it with `UPDATE_GOLDENS=1`. */
async function golden(name: string, files: GeneratedFile[]): Promise<void> {
  const root = join(expectedRoot, name);
  if (update) {
    await rm(root, { recursive: true, force: true });
    for (const file of files) {
      const out = join(root, ...file.path.split('/'));
      await mkdir(dirname(out), { recursive: true });
      await writeFile(out, file.contents);
    }
  }
  expect(await listFiles(root)).toEqual(files.map((file) => file.path));
  for (const file of files) {
    expect(file.contents, file.path).toBe(
      await readFile(join(root, ...file.path.split('/')), 'utf8'),
    );
  }
}

/** The building and redstone type blocks of the runtime's GameTests (`block-type_*`). */
const BUILDING_TYPE_FIXTURES = [
  'type_stairs',
  'type_stairs_vanilla',
  'type_stairs_base',
  'type_button',
  'type_directional',
  'type_door',
  'type_fence',
  'type_fence_gate',
  'type_horizontal',
  'type_iron_door',
  'type_log',
  'type_log_plant',
  'type_pane',
  'type_pillar',
  'type_planks',
  'type_plate',
  'type_slab',
  'type_stone_button',
  'type_stone_plate',
  'type_stripped_log',
  'type_trapdoor',
  'type_wall',
  'type_weighted_plate',
];

/** The crops, saplings and leaves of the runtime's `MsmPlantGameTest` (`block-type_*`). */
const PLANT_FIXTURES = [
  'type_crop',
  'type_crop_seven',
  'type_sapling',
  'type_sapling_missing',
  'type_leaves',
  'type_leaves_coloured',
  'type_leaves_plain',
  'type_leaves_untinted',
  'type_log',
];

describe('Java identifiers', () => {
  it('derives constants, classes and event methods from ids', () => {
    expect(constantName('ruby_ore')).toBe('RUBY_ORE');
    expect(constantName('ores/deep-ruby')).toBe('ORES_DEEP_RUBY');
    expect(constantName('9lives')).toBe('ID_9LIVES');
    expect(className('ruby_ore', 'Block')).toBe('RubyOreBlock');
    expect(className('chime_block', 'Block')).toBe('ChimeBlock');
    expect(className('ores/deep-ruby', 'Item')).toBe('OresDeepRubyItem');
    expect(className('9lives', 'Entity')).toBe('Id9livesEntity');
    expect(eventMethodName('example:wake')).toBe('event_wake');
    expect(eventMethodName('example:a/b-c')).toBe('event_a_b_c');
    expect(eventMethodName('example:wake', true)).toBe('event_example_wake');
  });

  it('keeps event methods and names unique', () => {
    expect([...eventMethodNames(['a:wake', 'b:wake', 'a:sleep'])]).toEqual([
      ['a:sleep', 'event_sleep'],
      ['a:wake', 'event_a_wake'],
      ['b:wake', 'event_b_wake'],
    ]);
    const table = new NameTable();
    expect(table.take('RUBY', (name) => [name, `${name}_KEY`])).toBe('RUBY');
    expect(table.take('RUBY_KEY')).toBe('RUBY_KEY_2');
    expect(table.take('RUBY', (name) => [name, `${name}_KEY`])).toBe('RUBY_2');
  });
});

describe('Java generator (mc-26.3)', () => {
  it('is the target fact', () => {
    expect(target.javaProject).toBeDefined();
  });

  it('generates the kitchen-sink block and a block without behaviour', async () => {
    const { files, entrypoints } = generateJavaProject(
      input({
        blocks: [await definition('block', 'defaults'), await definition('block', 'kitchen_sink')],
      }),
    );
    expect(entrypoints).toEqual({ main: 'msm_test.MsmTestMod', client: undefined });
    await golden('block', files);
  });

  it('generates the kitchen-sink items (tool, durability, on_use; food)', async () => {
    const { files } = generateJavaProject(
      input({ items: [await definition('item', 'gadget'), await definition('item', 'snack')] }),
    );
    await golden('item', files);
  });

  it('generates armour and custom tool materials (ADR 0042 D6)', async () => {
    const paths = [
      'ruby_helmet',
      'iron_chestplate',
      'sturdy_boots',
      'ruby_pickaxe',
      'flint_pickaxe',
      'heavy_sword',
    ];
    const items = await Promise.all(paths.map((path) => definition('item', path)));
    const { files } = generateJavaProject(input({ items }));
    await golden('gear', files);
    const modItems = files.find((file) => file.path.endsWith('/ModItems.java'))?.contents ?? '';
    // enchantment_value 0 (sturdy_boots): built with 1, then the component is removed.
    expect(modItems).toContain('.component(DataComponents.ENCHANTABLE, null)');
    expect(modItems.match(/\.component\(DataComponents\.ENCHANTABLE, null\)/g)).toHaveLength(1);
    // Without repair_items: the runtime's empty project-specific tag.
    expect(modItems).toContain(
      'Identifier.fromNamespaceAndPath("msm_test", "msm_repairs/flint_pickaxe")',
    );
  });

  it('ejects the launch action as Actions.launch (ADR 0052)', () => {
    const dash: DefinitionInput = {
      id: 'msm_test:dash_charm',
      path: 'msm/msm_test/item/dash_charm.json',
      definition: {
        format: 1,
        components: { 'msm:on_use': { event: 'msm_test:dash' } },
        events: {
          'msm_test:dash': { actions: [{ type: 'launch', strength: 1.5, up: 0.3 }] },
        },
      },
    };
    const files = generateJavaProject(input({ items: [dash] })).files;
    const all = files.map((file) => file.contents).join('\n');
    expect(all).toContain('Actions.launch(player, 1.5f, "look", 0.3f, false);');
    const actions = files.find((file) => file.path.endsWith('/Actions.java'))?.contents ?? '';
    expect(actions).toContain('public static void launch(Entity target, double strength');
    expect(actions).toContain('target.syncVelocity = true;');
  });

  it('writes Actions for events with only trigger_event and play_animation', async () => {
    // Every event method starts with the Actions.tooDeep depth guard, so Actions.java must
    // exist (and be imported from the subpackages) even when no other action is used.
    const chain = (first: string, second: string): JsonObject => ({
      [first]: {
        actions: [
          { type: 'trigger_event', event: second },
          { type: 'play_animation', animation: 'animation.wave' },
        ],
      },
      [second]: { actions: [{ type: 'play_animation', animation: 'animation.wave' }] },
    });
    const block: DefinitionInput = {
      id: 'msm_test:echo_block',
      path: 'msm/msm_test/block/echo_block.json',
      definition: {
        format: 1,
        components: { 'msm:on_interact': { event: 'msm_test:ping' } },
        events: chain('msm_test:ping', 'msm_test:pong'),
      },
    };
    const item: DefinitionInput = {
      id: 'msm_test:echo_wand',
      path: 'msm/msm_test/item/echo_wand.json',
      definition: {
        format: 1,
        components: { 'msm:on_use': { event: 'msm_test:ping' } },
        events: chain('msm_test:ping', 'msm_test:pong'),
      },
    };
    const throwable: DefinitionInput = {
      id: 'msm_test:echo_ball',
      path: 'msm/msm_test/item/echo_ball.json',
      definition: {
        format: 1,
        components: { 'msm:throwable': { on_hit_block: { event: 'msm_test:ping' } } },
        events: chain('msm_test:ping', 'msm_test:pong'),
      },
    };
    const effect: DefinitionInput = {
      id: 'msm_test:echo',
      path: 'msm/msm_test/effect/echo.json',
      definition: {
        format: 1,
        category: 'neutral',
        color: 255,
        components: { 'msm:on_tick': { event: 'msm_test:ping', interval_ticks: 20 } },
        events: chain('msm_test:ping', 'msm_test:pong'),
      },
    };
    const entity: DefinitionInput = {
      id: 'msm_test:echo_golem',
      path: 'msm/msm_test/entity/echo_golem.json',
      definition: {
        format: 1,
        category: 'creature',
        size: { width: 0.9, height: 1.6 },
        components: {
          'msm:animated_model': {
            model: 'msm_test:entity/echo_golem',
            texture: 'msm_test:entity/echo_golem',
          },
          'msm:attack': { damage: 2, on_attack: 'msm_test:ping' },
        },
        events: chain('msm_test:ping', 'msm_test:pong'),
      },
    };
    const { files } = generateJavaProject(
      input({
        blocks: [block],
        items: [item, throwable],
        effects: [effect],
        entities: [entity],
        geckolib: true,
      }),
    );
    await golden('events-only', files);
    const actions = files.find((file) => file.path === 'src/main/java/msm_test/Actions.java');
    expect(actions?.contents).toContain('public static boolean tooDeep(');
    const callers = files.filter((file) => file.contents.includes('Actions.tooDeep('));
    expect(callers.map((file) => file.path)).toEqual([
      'src/main/java/msm_test/block/EchoBlock.java',
      'src/main/java/msm_test/effect/EchoEffect.java',
      'src/main/java/msm_test/entity/EchoGolemEntity.java',
      'src/main/java/msm_test/item/EchoBallItem.java',
      'src/main/java/msm_test/item/EchoWandItem.java',
    ]);
    for (const file of callers) expect(file.contents).toContain('import msm_test.Actions;');
  });

  it("uses a custom armour material's body defence for horse armour (ADR 0050 D4)", async () => {
    const horse = await definition('item', 'ruby_horse_armor');
    const plain = generateJavaProject(input({ items: [horse] })).files;
    const modItems = (files: { path: string; contents: string }[]): string =>
      files.find((file) => file.path.endsWith('/ModItems.java'))?.contents ?? '';
    expect(modItems(plain)).toContain('// defense (BODY as the chestplate: horse and wolf armour)');
    const withBody = structuredClone(horse);
    const armor = (withBody.definition.components as JsonObject)['msm:armor'] as JsonObject;
    ((armor.material as JsonObject).defense as JsonObject).body = 9;
    const generated = modItems(generateJavaProject(input({ items: [withBody] })).files);
    expect(generated).toContain('ArmorType.BODY, 9), // defense (BODY: horse and wolf armour)');
  });

  it('generates weapons, consumables, totems, body armour and the passthrough (ADR 0044)', async () => {
    const paths = [
      'ruby_bow',
      'ruby_crossbow',
      'ruby_shield',
      'ruby_spear',
      'quick_spear',
      'ruby_mace',
      'ruby_tonic',
      'ruby_pie',
      'ruby_charm',
      'ruby_totem',
      'ruby_horse_armor',
      'scute_wolf_armor',
      'winged_charm',
      'ruby_disc',
    ];
    const items = await Promise.all(paths.map((path) => definition('item', path)));
    const { files } = generateJavaProject(input({ items }));
    await golden('weapons', files);
    const generated = files.map((file) => file.path);
    // A bow or crossbow with factors gets a subclass; the shield, mace and spear do not.
    expect(generated).toContain('src/main/java/msm_test/item/RubyBowItem.java');
    expect(generated).toContain('src/main/java/msm_test/item/RubyCrossbowItem.java');
    expect(generated).toContain('src/main/java/msm_test/item/RubyCharmItem.java');
    expect(generated).toContain('src/main/java/msm_test/VanillaComponents.java');
    expect(generated).not.toContain('src/main/java/msm_test/item/RubyMaceItem.java');
    const modItems = files.find((file) => file.path.endsWith('/ModItems.java'))?.contents ?? '';
    expect(modItems).toContain('new MaceItem(new Item.Properties()');
    expect(modItems).toContain('.horseArmor(RUBY_HORSE_ARMOR_ARMOR)');
    expect(modItems).toContain('.wolfArmor(ArmorMaterials.ARMADILLO_SCUTE)');
    // Durations in ticks as the runtime rounds them (30 s is 600 ticks).
    expect(modItems).toContain('"minecraft", "speed"), 600, 1, 1.0f)');
    const actions = files.find((file) => file.path.endsWith('/Actions.java'))?.contents ?? '';
    expect(actions).toContain('public static void applyEffect(');
    const charm = files.find((file) => file.path.endsWith('/RubyCharmItem.java'))?.contents ?? '';
    // Item events: other is the player.
    expect(charm).toContain('Actions.applyEffect(OWNER, player, "minecraft:glowing", 40, 0);');
  });

  it('generates apply_effect on blocks and on entities with an other target', async () => {
    const { files } = generateJavaProject(
      input({
        blocks: [await definition('block', 'stepping_stone')],
        entities: [await definition('entity', 'frost_golem')],
        geckolib: true,
      }),
    );
    await golden('effects', files);
    const golem =
      files.find((file) => file.path.endsWith('/FrostGolemEntity.java'))?.contents ?? '';
    expect(golem).toContain('LivingEntity other, int depth)');
    expect(golem).toContain('target instanceof LivingEntity living ? living : null, 1);');
    expect(golem).toContain('Actions.applyEffect(OWNER, other, "minecraft:slowness", 80, 0);');
    const stone =
      files.find((file) => file.path.endsWith('/SteppingStoneBlock.java'))?.contents ?? '';
    // A step block's self is the player, else the living stepper (ADR 0058 D1).
    expect(stone).toContain(
      'Actions.applyEffect(OWNER, player != null ? player : entity instanceof LivingEntity living ? living : null, "minecraft:slowness", 50, 2);',
    );
    // Without apply_effect, Actions has no applyEffect (the older goldens stay as they were).
    const plain = generateJavaProject(input({ items: [await definition('item', 'gadget')] }));
    const plainActions =
      plain.files.find((file) => file.path.endsWith('/Actions.java'))?.contents ?? '';
    expect(plainActions).not.toContain('applyEffect');
  });

  it('registers project sound events first and mob sounds (ADR 0057 D5, D6)', async () => {
    // The keys of engine-mod/src/gametest/resources/assets/msm_test/sounds.json, as the
    // exporter passes them (sorted, namespaced, without minecraft).
    const soundEvents = [
      'msm_test:chime',
      'msm_test:golem.ambient',
      'msm_test:golem.death',
      'msm_test:golem.hurt',
      'msm_test:golem.step',
    ];
    const { files } = generateJavaProject(
      input({
        blocks: [await definition('block', 'chime_block')],
        entities: [await definition('entity', 'off_key'), await definition('entity', 'singer')],
        soundEvents,
        geckolib: true,
      }),
    );
    await golden('sounds', files);
    const text = (suffix: string): string =>
      files.find((file) => file.path.endsWith(suffix))?.contents ?? '';
    // ModSounds registers before everything else.
    const mod = text('/MsmTestMod.java');
    expect(mod.indexOf('ModSounds.register();')).toBeGreaterThan(0);
    expect(mod.indexOf('ModSounds.register();')).toBeLessThan(mod.indexOf('ModBlocks.register();'));
    const sounds = text('/ModSounds.java');
    for (const id of soundEvents) expect(sounds).toContain(`"${id}"`);
    expect(sounds).toContain('SoundEvent.createVariableRangeEvent(id)');
    const singer = text('/SingerEntity.java');
    expect(singer).toContain('protected SoundEvent getAmbientSound() {');
    expect(singer).toContain('return 120;');
    expect(singer).toContain('protected SoundEvent getHurtSound(DamageSource source) {');
    expect(singer).toContain('protected SoundEvent getDeathSound() {');
    expect(singer).toContain('playSound(sound, 0.15f, 1.0f);');
    // Only the configured sounds are overridden.
    const offKey = text('/OffKeyEntity.java');
    expect(offKey).toContain('return sound != null ? sound : super.getHurtSound(source);');
    expect(offKey).not.toContain('getDeathSound');
    expect(offKey).not.toContain('playStepSound');
    expect(offKey).not.toContain('getAmbientSoundInterval');
    // An unknown id keeps the vanilla sound and is warned about after start-up.
    const entities = text('/ModEntities.java');
    expect(entities).toContain(
      'warnUnknownSound("msm/msm_test/entity/off_key.json", "msm_test:no_such_sound");',
    );
    expect(entities).toContain('ServerLifecycleEvents.SERVER_STARTED.register(server -> {');
    // A project sound in a block event plays as a block.
    expect(text('/ChimeBlock.java')).toContain(
      'Actions.playSound(OWNER, level, origin, entity, "msm_test:chime", 1.0f, 1.0f);',
    );
  });

  it('writes no ModSounds for a silent project or only minecraft keys', async () => {
    const block = await definition('block', 'chime_block');
    for (const soundEvents of [undefined, [], ['minecraft:block.note_block.bell']]) {
      const { files } = generateJavaProject(
        input(soundEvents === undefined ? { blocks: [block] } : { blocks: [block], soundEvents }),
      );
      expect(files.some((file) => file.path.endsWith('/ModSounds.java'))).toBe(false);
      const mod = files.find((file) => file.path.endsWith('/MsmTestMod.java'))?.contents ?? '';
      expect(mod).not.toContain('ModSounds');
    }
    // Each key once; an id without a namespace is refused.
    const twice = generateJavaProject(
      input({ soundEvents: ['msm_test:chime', 'msm_test:chime', 'minecraft:x'] }),
    );
    const sounds = twice.files.find((file) => file.path.endsWith('/ModSounds.java'))?.contents;
    expect(sounds?.match(/"msm_test:chime"/g)).toHaveLength(1);
    expect(sounds).not.toContain('minecraft:x');
    expect(() => generateJavaProject(input({ soundEvents: ['chime'] }))).toThrow(
      /not a namespaced sound event id/,
    );
  });

  it('gives step events the stepper and a per-dimension cooldown (ADR 0058 D1)', async () => {
    const { files } = generateJavaProject(
      input({
        blocks: [await definition('block', 'step_other'), await definition('block', 'step_self')],
      }),
    );
    await golden('step-blocks', files);
    const text = (suffix: string): string =>
      files.find((file) => file.path.endsWith(suffix))?.contents ?? '';
    const self = text('/StepSelfBlock.java');
    expect(self).toContain(
      'private record StepKey(ResourceKey<Level> dimension, long pos, UUID entity) {}',
    );
    expect(self).toContain(
      'StepKey key = new StepKey(server.dimension(), pos.asLong(), entity.getUUID());',
    );
    expect(self).toContain(
      'event_stepped(server, pos.immutable(), Vec3.atCenterOf(pos), player, player == null ? entity : null, 1);',
    );
    // self: the player, else the stepper (living for effects and damage).
    expect(self).toContain(
      'Actions.applyEffect(OWNER, player != null ? player : entity instanceof LivingEntity living ? living : null, "minecraft:speed", 200, 0);',
    );
    expect(self).toContain(
      'Actions.launch(player != null ? player : entity, 1.0f, "up", 0.0f, false);',
    );
    // run_function runs as the stepper when there is no player.
    expect(self).toContain(
      'Actions.runFunction(OWNER, level, origin, player != null ? player : entity, "msm_test:tag_stepper");',
    );
    const actions = text('/Actions.java');
    expect(actions).toContain(
      'public static void runFunction(String owner, ServerLevel level, Vec3 origin, Entity as, String id) {',
    );
    // other: the player, else the living stepper.
    const other = text('/StepOtherBlock.java');
    expect(other).not.toContain('LivingEntity other');
    expect(other).toContain(
      'Actions.heal(player != null ? player : entity instanceof LivingEntity living ? living : null, 3.0f);',
    );
    expect(other).toContain(
      'Actions.launch(player != null ? player : entity instanceof LivingEntity living ? living : null, 1.0f, "up", 0.0f, false);',
    );
    // Block events play sounds as blocks, even with a stepping mob.
    const chiming = generateJavaProject(
      input({
        blocks: [
          {
            id: 'msm_test:chime_pad',
            path: 'msm/msm_test/block/chime_pad.json',
            definition: {
              components: { 'msm:on_step': { event: 'msm_test:chime' } },
              events: {
                'msm_test:chime': { actions: [{ sound: 'msm_test:chime', type: 'play_sound' }] },
              },
              format: 1,
            },
          },
        ],
      }),
    );
    expect(
      chiming.files.find((file) => file.path.endsWith('/ChimePadBlock.java'))?.contents,
    ).toContain('Actions.playSound(OWNER, level, origin, null, "msm_test:chime", 1.0f, 1.0f);');
    // run_function in a block without msm:on_step keeps the player parameter.
    const plain = generateJavaProject(
      input({
        blocks: [
          {
            id: 'msm_test:button',
            path: 'msm/msm_test/block/button.json',
            definition: {
              components: { 'msm:on_interact': { event: 'msm_test:press' } },
              events: {
                'msm_test:press': {
                  actions: [{ function: 'msm_test:mark', type: 'run_function' }],
                },
              },
              format: 1,
            },
          },
        ],
      }),
    );
    expect(plain.files.find((file) => file.path.endsWith('/Actions.java'))?.contents).toContain(
      'Vec3 origin, Player player, String id) {',
    );
  });

  it('generates block shapes mirroring MsmBlock (ADR 0059 D6)', async () => {
    const { files } = generateJavaProject(
      input({
        blocks: await Promise.all(
          ['shape_carpet', 'shape_cross', 'shape_glass', 'shape_slab', 'shape_two_boxes'].map(
            (path) => definition('block', path),
          ),
        ),
      }),
    );
    await golden('shapes', files);
    const text = (suffix: string): string =>
      files.find((file) => file.path.endsWith(suffix))?.contents ?? '';
    // Each axis is ordered before Block.box: [12, 16, 12, 4, 8, 4] is written as 4..12, 8..16.
    const two = text('/ShapeTwoBoxesBlock.java');
    expect(two).toContain('Block.box(4.0f, 8.0f, 4.0f, 12.0f, 16.0f, 12.0f)).optimize();');
    // see_through false: the outline only, no glass overrides.
    expect(two).toContain('protected VoxelShape getShape(');
    expect(two).not.toContain('propagatesSkylightDown');
    const blocks = text('/ModBlocks.java');
    const entry = (field: string): string =>
      blocks.slice(
        blocks.indexOf(`${field} = `),
        blocks.indexOf(';', blocks.indexOf(`${field} = `)),
      );
    expect(entry('SHAPE_TWO_BOXES')).not.toContain('noOcclusion');
    // The cross: walk-through and see-through (boxes that are not the full cube).
    expect(entry('SHAPE_CROSS')).toContain('.noCollision()');
    expect(entry('SHAPE_CROSS')).toContain('.isValidSpawn((state, level, pos, type) -> false)');
    // The glass cube: see-through only because it says so; collision stays.
    expect(entry('SHAPE_GLASS')).not.toContain('noCollision');
    expect(entry('SHAPE_GLASS')).toContain('.noOcclusion()');
    const glass = text('/ShapeGlassBlock.java');
    for (const line of [
      'return Shapes.empty();',
      'protected boolean propagatesSkylightDown(BlockState state) {',
      'return 1.0f;',
      'return adjacent.is(this) || super.skipRendering(state, adjacent, direction);',
    ]) {
      expect(glass).toContain(line);
    }
    // A shape alongside step events keeps both.
    const slab = text('/ShapeSlabBlock.java');
    expect(slab).toContain('Block.box(0.0f, 0.0f, 0.0f, 16.0f, 8.0f, 16.0f)).optimize();');
    expect(slab).toContain('public void stepOn(');
  });

  it('generates the building and redstone types mirroring the runtime (ADR 0067 D10)', async () => {
    // The MsmBlockTypeGameTest and MsmRedstoneTypeGameTest definitions; stairs listed before
    // their base still register after it.
    const { files } = generateJavaProject(
      input({
        blocks: await Promise.all(BUILDING_TYPE_FIXTURES.map((path) => definition('block', path))),
      }),
    );
    await golden('block-types', files);
    const text = (suffix: string): string =>
      files.find((file) => file.path.endsWith(suffix))?.contents ?? '';
    const blocks = text('/ModBlocks.java');
    const entry = (field: string): string =>
      blocks.slice(
        blocks.indexOf(`${field} = `),
        blocks.indexOf(';', blocks.indexOf(`${field} = `)),
      );
    // Stairs after their base, the base's state passed in; other bases looked up at registration.
    expect(blocks.indexOf('TYPE_STAIRS = ')).toBeGreaterThan(blocks.indexOf('TYPE_STAIRS_BASE = '));
    expect(entry('TYPE_STAIRS')).toContain(
      'new TypeStairsBlock(TYPE_STAIRS_BASE.defaultBlockState(), ',
    );
    expect(entry('TYPE_STAIRS_VANILLA')).toContain(
      'stairsBase(Identifier.fromNamespaceAndPath("minecraft", "stone"))',
    );
    expect(entry('TYPE_STAIRS')).toContain(
      '.isViewBlocking(ModBlocks::nearPlaneIntersectsOutline)',
    );
    // Public vanilla constructors without behaviour are used directly.
    expect(entry('TYPE_SLAB')).toContain('new SlabBlock(BlockBehaviour.Properties.of()');
    expect(entry('TYPE_WALL')).toContain('.forceSolidOn()');
    expect(entry('TYPE_LOG')).toContain('new RotatedPillarBlock(');
    expect(entry('TYPE_PANE')).toContain('new TypePaneBlock(');
    expect(entry('TYPE_PLATE')).toContain(
      '.forceSolidOn().noCollision().pushReaction(PushReaction.POPPED)',
    );
    // msm:flammable: lava, then Fabric's registry with vanilla's argument order; msm:strippable.
    expect(entry('TYPE_LOG')).toContain('.ignitedByLava()');
    expect(blocks).toContain('FlammableBlockRegistry.getDefaultInstance().add(TYPE_LOG, 5, 5);');
    expect(blocks).toContain(
      'FlammableBlockRegistry.getDefaultInstance().add(TYPE_PLANKS, 5, 20);',
    );
    expect(blocks).toContain(
      'BlockStripping.add(TYPE_LOG, Identifier.fromNamespaceAndPath("msm_test", "type_stripped_log"));',
    );
    expect(blocks).toContain('BlockStripping.register();');
    expect(text('/BlockStripping.java')).toContain(
      'UseBlockCallback.EVENT.register(BlockStripping::strip);',
    );
    // Doors place both halves.
    expect(entry('TYPE_DOOR_ITEM')).toContain('new DoubleHighBlockItem(TYPE_DOOR, ');
    expect(entry('TYPE_SLAB_ITEM')).toContain('new BlockItem(TYPE_SLAB, ');
    // Set types (wood is OAK on 26.3), press ticks, weighted plates and wood types.
    expect(text('/TypeButtonBlock.java')).toContain('super(BlockSetType.OAK, 30, properties);');
    expect(text('/TypeStoneButtonBlock.java')).toContain(
      'super(BlockSetType.STONE, 5, properties);',
    );
    expect(text('/TypeWeightedPlateBlock.java')).toContain(
      'public class TypeWeightedPlateBlock extends WeightedPressurePlateBlock {',
    );
    expect(text('/TypeWeightedPlateBlock.java')).toContain(
      'super(4, BlockSetType.IRON, properties);',
    );
    expect(text('/TypeIronDoorBlock.java')).toContain('super(BlockSetType.IRON, properties);');
    const gate = text('/TypeFenceGateBlock.java');
    expect(gate).toContain('super(WoodType.OAK, properties);');
    // Interaction after vanilla's own use, keeping vanilla's answer when it acted.
    expect(gate).toContain(
      'InteractionResult vanilla = super.useWithoutItem(state, level, pos, player, hit);',
    );
    expect(gate).toContain(
      'return vanilla.consumesAction() ? vanilla : InteractionResult.SUCCESS;',
    );
    // Rotating shapes turn with the state, as MsmBlock.
    const pillar = text('/TypePillarBlock.java');
    expect(pillar).toContain('public class TypePillarBlock extends RotatedPillarBlock {');
    expect(pillar).toContain(
      'SHAPE_X = Shapes.or(\n            Block.box(0.0f, 4.0f, 4.0f, 16.0f, 12.0f, 12.0f))',
    );
    expect(pillar).toContain(
      'SHAPE_Z = Shapes.or(\n            Block.box(4.0f, 4.0f, 0.0f, 12.0f, 12.0f, 16.0f))',
    );
    const horizontal = text('/TypeHorizontalBlock.java');
    expect(horizontal).toContain('FACING = BlockStateProperties.HORIZONTAL_FACING;');
    expect(horizontal).toContain(
      'SHAPE_EAST = Shapes.or(\n            Block.box(8.0f, 0.0f, 0.0f, 16.0f, 16.0f, 16.0f))',
    );
    expect(horizontal).toContain('builder.add(FACING, POWERED);');
    expect(horizontal).toContain('.setValue(FACING, Direction.NORTH).setValue(POWERED, false)');
    expect(horizontal).toContain('context.getHorizontalDirection().getOpposite()');
    const directional = text('/TypeDirectionalBlock.java');
    expect(directional).toContain('FACING = BlockStateProperties.FACING;');
    expect(directional).toContain(
      'SHAPE_DOWN = Shapes.or(\n            Block.box(0.0f, 0.0f, 0.0f, 16.0f, 4.0f, 16.0f))',
    );
    expect(directional).toContain('context.getNearestLookingDirection().getOpposite()');
    expect(directional).not.toContain('default ->');
  });

  it('generates crops, saplings and leaves mirroring the runtime (ADR 0068 D8)', async () => {
    // The MsmPlantGameTest definitions, the log the test tree uses, and leaves of the other two
    // tint sources; a crop, a sapling and leaves with a random tick event.
    const ticking = { 'msm:on_random_tick': { event: 'msm_test:tick', chance: 0.5 } };
    const events = {
      'msm_test:tick': { actions: [{ type: 'run_function', function: 'msm_test:tick' }] },
    };
    const own = (path: string, fields: JsonObject): DefinitionInput => ({
      id: `msm_test:${path}`,
      path: `msm/msm_test/block/${path}.json`,
      definition: { format: 1, sound_type: 'grass', ...fields },
    });
    const { files, entrypoints } = generateJavaProject(
      input({
        blocks: [
          ...(await Promise.all(PLANT_FIXTURES.map((path) => definition('block', path)))),
          own('grass_leaves', { type: 'leaves', tint: 'grass' }),
          own('dry_leaves', { type: 'leaves', tint: 'dry_foliage' }),
          own('ticking_crop', { type: 'crop', components: ticking, events }),
          own('ticking_sapling', {
            type: 'sapling',
            tree: 'msm_test:test_tree',
            flower_tree: 'minecraft:fancy_oak_bees',
            soil: '#minecraft:dirt',
            components: ticking,
            events,
          }),
          own('ticking_leaves', {
            type: 'leaves',
            tint: 'foliage',
            falling_particle: 'minecraft:cherry_leaves',
            components: { ...ticking, 'msm:flammable': { burn_odds: 30, ignite_odds: 60 } },
            events,
          }),
        ],
      }),
    );
    await golden('plant-types', files);
    expect(entrypoints.client).toBe('msm_test.client.MsmTestModClient');
    const text = (suffix: string): string =>
      files.find((file) => file.path.endsWith(suffix))?.contents ?? '';
    const blocks = text('/ModBlocks.java');
    const entry = (field: string): string =>
      blocks.slice(
        blocks.indexOf(`${field} = `),
        blocks.indexOf(';', blocks.indexOf(`${field} = `)),
      );
    // Crops: own age range, stage outlines (vanilla's ramp for a list of the wrong length),
    // soil, swapped bone meal bounds, the seeds under item.id.
    const crop = text('/TypeCropBlock.java');
    expect(crop).toContain('public class TypeCropBlock extends CropBlock {');
    expect(crop).toContain('AGE = IntegerProperty.create("age", 0, 3);');
    expect(crop).toContain('Block.box(0.0f, 0.0f, 0.0f, 16.0f, 12.0f, 16.0f)};');
    expect(crop).toContain('Mth.nextInt(level.getRandom(), 1, 1)');
    expect(crop).toContain('return this;');
    expect(crop).not.toContain('isRandomlyTicking');
    expect(entry('TYPE_CROP')).toContain(
      '.noCollision().randomTicks().pushReaction(PushReaction.POPPED)',
    );
    expect(entry('TYPE_CROP_ITEM_KEY')).toContain('"type_crop_seeds"');
    const seven = text('/TypeCropSevenBlock.java');
    expect(seven).toContain('Block.box(0.0f, 0.0f, 0.0f, 16.0f, 2.0f, 16.0f),');
    expect(seven).toContain('Block.box(0.0f, 0.0f, 0.0f, 16.0f, 16.0f, 16.0f)};');
    expect(seven).toContain('Identifier.fromNamespaceAndPath("minecraft", "dirt")');
    expect(seven).toContain('Mth.nextInt(level.getRandom(), 2, 3)');
    expect(blocks).not.toContain('TYPE_CROP_SEVEN_ITEM');
    expect(text('/TickingCropBlock.java')).toContain('protected boolean isRandomlyTicking(');
    // Saplings: a grower named after the sapling, the 2x2 tree, the check after start-up.
    const sapling = text('/TypeSaplingBlock.java');
    expect(sapling).toContain(
      'private static final TreeGrower GROWER = new TreeGrower("msm_test:type_sapling",',
    );
    expect(sapling).toContain(
      'WeightedList.of(ResourceKey.create(Registries.FEATURE, Identifier.fromNamespaceAndPath("msm_test", "test_mega_tree"))),',
    );
    expect(sapling).toContain('super(GROWER, properties);');
    expect(sapling).toContain('"minecraft", "supports_vegetation"');
    expect(text('/TypeSaplingMissingBlock.java')).toContain('        WeightedList.of(),');
    expect(blocks).toContain(
      'ServerLifecycleEvents.SERVER_STARTED.register(ModBlocks::checkTrees);',
    );
    expect(blocks).toContain(
      'checkTree(features, "msm_test:type_sapling", Identifier.fromNamespaceAndPath("msm_test", "test_mega_tree"));',
    );
    expect(blocks).toContain(
      'checkTree(features, "msm_test:ticking_sapling", Identifier.fromNamespaceAndPath("minecraft", "fancy_oak_bees"));',
    );
    expect(text('/TickingSaplingBlock.java')).toContain(
      'if (level.getBlockState(pos).is(this)) { // the sapling may have grown into a tree',
    );
    // Leaves: the vanilla class per kind, used directly without events.
    expect(entry('TYPE_LEAVES')).toContain('new TintedParticleLeavesBlock(0.01f, ');
    expect(entry('TYPE_LEAVES_PLAIN')).toContain(
      'new LeavesBlock(AmbientLeavesBlockSoundPlayer.noAmbientSound(), ',
    );
    expect(entry('TYPE_LEAVES_UNTINTED')).toContain(
      'new UntintedParticleLeavesBlock(0.1f, ModBlocks.fallingParticle(Identifier.fromNamespaceAndPath("minecraft", "cherry_leaves")), AmbientLeavesBlockSoundPlayer.noAmbientSound(), ',
    );
    expect(entry('TYPE_LEAVES')).toContain(
      '.isSuffocating((state, level, pos) -> false).ignitedByLava()',
    );
    const tickingLeaves = text('/TickingLeavesBlock.java');
    expect(tickingLeaves).toContain(
      'public class TickingLeavesBlock extends TintedParticleLeavesBlock {',
    );
    expect(tickingLeaves).toContain('super(0.01f, properties);');
    expect(tickingLeaves).toContain('protected boolean isRandomlyTicking(');
    expect(tickingLeaves).toContain('// decaying leaves are gone after super');
    expect(entry('TICKING_LEAVES').match(/ignitedByLava/g)?.length).toBe(1);
    expect(entry('TICKING_LEAVES').match(/randomTicks/g)?.length).toBe(1);
    // Client tints: the four kinds, a constant with full alpha.
    const client = text('/client/MsmTestModClient.java');
    expect(client).toContain(
      'BlockColorRegistry.register(List.of(BlockTintSources.foliage()), ModBlocks.TYPE_LEAVES);',
    );
    expect(client).toContain(
      'BlockColorRegistry.register(List.of(BlockTintSources.constant(0xFF5F9EA0)), ModBlocks.TYPE_LEAVES_COLOURED);',
    );
    expect(client).toContain('BlockTintSources.grass()), ModBlocks.GRASS_LEAVES);');
    expect(client).toContain('BlockTintSources.dryFoliage()), ModBlocks.DRY_LEAVES);');
    expect(client).not.toContain('TYPE_LEAVES_PLAIN');
    expect(client).not.toContain('EntityRenderers');
  });

  it('writes no client entrypoint for untinted leaves alone', () => {
    const { files, entrypoints } = generateJavaProject(
      input({
        blocks: [
          {
            id: 'msm_test:plain_leaves',
            path: 'msm/msm_test/block/plain_leaves.json',
            definition: { format: 1, type: 'leaves' },
          },
        ],
      }),
    );
    expect(entrypoints.client).toBeUndefined();
    expect(files.some((file) => file.path.includes('/client/'))).toBe(false);
  });

  it('registers a block item under its own item.id (ADR 0068 D2)', () => {
    const { files } = generateJavaProject(
      input({
        blocks: [
          {
            id: 'msm_test:ruby_bush',
            path: 'msm/msm_test/block/ruby_bush.json',
            definition: { format: 1, item: { id: 'msm_test:ruby_pip', max_stack_size: 16 } },
          },
        ],
      }),
    );
    const blocks = files.find((file) => file.path.endsWith('/ModBlocks.java'))?.contents ?? '';
    expect(blocks).toContain(
      'RUBY_BUSH_ITEM_KEY = ResourceKey.create(Registries.ITEM, Identifier.fromNamespaceAndPath("msm_test", "ruby_pip"));',
    );
    expect(blocks).toContain('.useItemDescriptionPrefix()');
    expect(blocks).not.toContain('.useBlockDescriptionPrefix()');
  });

  it('gives a shape without boxes the full cube, solid unless see_through', () => {
    const shaped = (shape: JsonObject) =>
      generateJavaProject(
        input({
          blocks: [
            {
              id: 'msm_test:cube',
              path: 'msm/msm_test/block/cube.json',
              definition: { components: { 'msm:shape': shape }, format: 1 },
            },
          ],
        }),
      ).files.map((file) => file.contents);
    const solid = shaped({ collision: false }).join('\n');
    expect(solid).toContain('Block.box(0.0f, 0.0f, 0.0f, 16.0f, 16.0f, 16.0f)).optimize();');
    expect(solid).toContain('.noCollision()');
    expect(solid).not.toContain('noOcclusion');
    const fullBox = shaped({ boxes: [[0, 0, 0, 16, 16, 16]] }).join('\n');
    expect(fullBox).not.toContain('noOcclusion');
  });

  it('rejects bad mob sounds', async () => {
    const singer = await definition('entity', 'singer');
    const withSounds = (sounds: unknown) =>
      generateJavaProject(
        input({
          entities: [{ ...singer, definition: { ...singer.definition, sounds } as JsonObject }],
          geckolib: true,
        }),
      );
    expect(() => withSounds({ ambient_interval_ticks: 19 })).toThrow(/at least 20/);
    expect(() => withSounds({ loud: 'minecraft:entity.pig.ambient' })).toThrow(/loud/);
    expect(() => withSounds({ hurt: 'Not An Id' })).toThrow(/not a sound event id/);
  });

  it('generates biome and loot additions and block item components (ADR 0060 D4, D9)', async () => {
    const biomeAdditions = await Promise.all(
      ['badlands_tag', 'desert_fox', 'missing_feature', 'plains_ore'].map((path) =>
        definition('biome_addition', path),
      ),
    );
    const lootAdditions = await Promise.all(
      ['broken', 'zombie_gem'].map((path) => definition('loot_addition', path)),
    );
    const { files, entrypoints } = generateJavaProject(
      input({
        blocks: [await definition('block', 'fuel_block')],
        items: [await definition('item', 'fuel_gem')],
        biomeAdditions,
        lootAdditions,
      }),
    );
    expect(entrypoints.client).toBeUndefined();
    await golden('additions', files);
    const text = (suffix: string): string =>
      files.find((file) => file.path.endsWith(suffix))?.contents ?? '';
    // Registered last, as the runtime does.
    expect(text('/MsmTestMod.java')).toContain(
      '        ModItems.register();\n        ModWorldgen.register();\n        ModLoot.register();',
    );
    const worldgen = text('/ModWorldgen.java');
    expect(worldgen).toContain(
      'Predicate<BiomeSelectionContext> selector = biomes("#minecraft:is_badlands");',
    );
    expect(worldgen).toContain(
      'feature(Identifier.fromNamespaceAndPath("msm_test", "biome_addition/plains_ore/feature/0"), selector, GenerationStep.Decoration.UNDERGROUND_ORES,',
    );
    expect(worldgen).toContain(
      'Identifier.fromNamespaceAndPath("minecraft", "fox"), 7, 1, 3); // weight, min_group, max_group',
    );
    // The guarded lookup: a missing placed feature never reaches Fabric's addFeature.
    expect(worldgen).toContain(
      'if (selection.getRegistryAccess().lookupOrThrow(Registries.PLACED_FEATURE).get(key).isPresent()) {',
    );
    expect(worldgen).toContain(
      'warnUnknownFeature(server, "msm/msm_test/biome_addition/missing_feature.json", "msm_test:missing_feature");',
    );
    expect(worldgen).toContain(
      'warnUnknownEntity("msm/msm_test/biome_addition/missing_feature.json", "msm_test:missing_mob");',
    );
    const loot = text('/ModLoot.java');
    expect(loot).toContain('if (!source.isBuiltin()) {');
    expect(loot).toContain('LootPool.CODEC.parse(ops, pool.json());');
    expect(loot).toContain(
      'add("msm/msm_test/loot_addition/broken.json", BROKEN_POOLS, "minecraft:entities/husk", "minecraft:entities/drowned");',
    );
    // Block item components: the passthrough first, the block item's fields after it.
    const blocks = text('/ModBlocks.java');
    expect(blocks).toContain(
      'new BlockItem(FUEL_BLOCK, VanillaComponents.apply(new Item.Properties()',
    );
    expect(blocks).toContain('\\"minecraft:cooking_fuel\\":{\\"burn_time\\":1600');
    expect(blocks).toContain('        .stacksTo(16)');
    expect(files.some((file) => file.path.endsWith('/VanillaComponents.java'))).toBe(true);
    // Fuel and compost need no code: the item carries the components.
    expect(text('/ModItems.java')).toContain('minecraft:compostable/always_add_one');
  });

  it('writes nothing new for a project without additions or triggers', async () => {
    const { files } = generateJavaProject(
      input({
        blocks: [await definition('block', 'kitchen_sink')],
        items: [await definition('item', 'gadget')],
        biomeAdditions: [],
        lootAdditions: [],
      }),
    );
    for (const name of ['ModWorldgen', 'ModLoot', 'TickLimiter', 'CooldownMap']) {
      expect(files.some((file) => file.path.endsWith(`/${name}.java`))).toBe(false);
    }
  });

  it('generates the triggers mirroring MsmItem, MsmBlock and MsmEntity (ADR 0061 D6)', async () => {
    const items = await Promise.all(
      ['held_either', 'held_main', 'held_off', 'trigger_sword', 'trigger_wand', 'worn_cap'].map(
        (path) => definition('item', path),
      ),
    );
    const blocks = await Promise.all(
      ['inside_block', 'tick_block', 'tick_never', 'trigger_block'].map((path) =>
        definition('block', path),
      ),
    );
    const { files } = generateJavaProject(
      input({ items, blocks, entities: [await definition('entity', 'ticker')], geckolib: true }),
    );
    await golden('triggers', files);
    const text = (suffix: string): string =>
      files.find((file) => file.path.endsWith(suffix))?.contents ?? '';
    const sword = text('/TriggerSwordItem.java');
    expect(sword).toContain(
      'public void hurtEnemy(ItemStack stack, LivingEntity target, LivingEntity attacker) {',
    );
    expect(sword).toContain(
      'event_hit(server, attacker.blockPosition().below(), attacker.position(), attacker instanceof Player p ? p : null, attacker instanceof Player ? null : attacker, 1);',
    );
    const wand = text('/TriggerWandItem.java');
    expect(wand).toContain('public InteractionResult useOn(UseOnContext context) {');
    expect(wand).toContain('player.getCooldowns().addCooldown(stack, 10);');
    expect(wand).toContain(
      'return vanilla == InteractionResult.PASS ? InteractionResult.SUCCESS : vanilla;',
    );
    expect(text('/HeldEitherItem.java')).toContain(
      'if ((slot == EquipmentSlot.MAINHAND || slot == EquipmentSlot.OFFHAND) && TickLimiter.due(level, owner, 5) && TickLimiter.tryFire(level)) {',
    );
    expect(text('/HeldOffItem.java')).toContain('if (slot == EquipmentSlot.OFFHAND && ');
    expect(text('/WornCapItem.java')).toContain('if (slot == EquipmentSlot.HEAD && ');
    const inside = text('/InsideBlock.java');
    expect(inside).toContain('private final CooldownMap insideCooldowns = new CooldownMap();');
    expect(inside).toContain(
      '&& insideCooldowns.tryFire(server.dimension(), pos, entity.getUUID(), server.getGameTime(), 5)',
    );
    // The cooldown is checked before the shared limiter.
    expect(inside.indexOf('insideCooldowns.tryFire')).toBeLessThan(
      inside.indexOf('TickLimiter.tryFire'),
    );
    expect(text('/TickNeverBlock.java')).not.toContain('TickLimiter');
    const modBlocks = text('/ModBlocks.java');
    expect(modBlocks.match(/\.randomTicks\(\)/g)).toHaveLength(2);
    const trigger = text('/TriggerBlock.java');
    expect(trigger).toContain('public BlockState playerWillDestroy(');
    expect(trigger).toContain(
      'event_placed(server, pos.immutable(), Vec3.atCenterOf(pos), player, player == null ? placer : null, 1);',
    );
    const ticker = text('/TickerEntity.java');
    expect(ticker).toContain('protected void customServerAiStep(ServerLevel level) {');
    expect(ticker).toContain(
      'if (TickLimiter.due(level, this, 5) && TickLimiter.tryFire(level)) {',
    );
    expect(ticker).toContain('public SpawnGroupData finalizeSpawn(');
    const limiter = text('/TickLimiter.java');
    expect(limiter).toContain('public static final int CAP = 2000;');
    expect(limiter).toContain(
      'return Math.floorMod(level.getGameTime() + entity.getId(), (long) interval) == 0;',
    );
  });

  it('gives item triggers a mob actor and other (ADR 0061 D1)', () => {
    const item: DefinitionInput = {
      id: 'msm_test:leech',
      path: 'msm/msm_test/item/leech.json',
      definition: {
        format: 1,
        components: {
          'msm:on_hit': { event: 'msm_test:bite' },
          'msm:on_use': { event: 'msm_test:bite' },
          'msm:tool': { tier: 'iron', type: 'mace' },
          'msm:while_held': { event: 'msm_test:bite', hand: 'main' },
        },
        events: {
          'msm_test:bite': {
            actions: [
              { type: 'damage', amount: 1, target: 'other' },
              { type: 'heal', amount: 1 },
              { type: 'run_function', function: 'msm_test:mark' },
            ],
          },
        },
      },
    };
    const files = generateJavaProject(input({ items: [item] })).files;
    const leech = files.find((file) => file.path.endsWith('/LeechItem.java'))?.contents ?? '';
    expect(leech).toContain('public class LeechItem extends MaceItem {');
    expect(leech).toContain('LivingEntity other, int depth)');
    expect(leech).toContain('Actions.damage(level, other, 1.0f);');
    expect(leech).toContain(
      'Actions.heal(player != null ? player : entity instanceof LivingEntity living ? living : null, 1.0f);',
    );
    expect(leech).toContain(
      'Actions.runFunction(OWNER, level, origin, player != null ? player : entity, "msm_test:mark");',
    );
    // other: the entity hit, the holder, the player of on_use.
    expect(leech).toContain('attacker instanceof Player ? null : attacker, target, 1);');
    expect(leech).toContain('owner instanceof LivingEntity living ? living : null, 1);');
    expect(leech).toContain('player.position(), player, null, player, 1);');
    const actions = files.find((file) => file.path.endsWith('/Actions.java'))?.contents ?? '';
    expect(actions).toContain('Vec3 origin, Entity as, String id) {');
    expect(actions).toContain('the mob\n     * attacking with or holding an item');
  });

  it('rejects trigger settings the runtime refuses', () => {
    const item = (components: JsonObject): DefinitionInput => ({
      id: 'msm_test:thing',
      path: 'msm/msm_test/item/thing.json',
      definition: { format: 1, components, events: { 'msm_test:e': { actions: [] } } },
    });
    expect(() =>
      generateJavaProject(input({ items: [item({ 'msm:while_worn': { event: 'msm_test:e' } })] })),
    ).toThrow(/msm:while_worn without msm:armor cannot be ejected/);
    expect(() =>
      generateJavaProject(
        input({ items: [item({ 'msm:while_held': { event: 'msm_test:e', interval_ticks: 4 } })] }),
      ),
    ).toThrow(/interval_ticks must be at least 5/);
    expect(() =>
      generateJavaProject(
        input({ items: [item({ 'msm:while_held': { event: 'msm_test:e', hand: 'both' } })] }),
      ),
    ).toThrow(/hand 'both'/);
    const addition = (definition: JsonObject): DefinitionInput => ({
      id: 'msm_test:add',
      path: 'msm/msm_test/biome_addition/add.json',
      definition: { format: 1, ...definition },
    });
    const spawn = {
      entity: 'minecraft:fox',
      category: 'creature',
      weight: 1,
      min_group: 1,
      max_group: 1,
    };
    expect(() =>
      generateJavaProject(input({ biomeAdditions: [addition({ biomes: [], spawns: [spawn] })] })),
    ).toThrow(/biomes must list at least one/);
    expect(() =>
      generateJavaProject(input({ biomeAdditions: [addition({ biomes: ['minecraft:plains'] })] })),
    ).toThrow(/at least one of features and spawns/);
    expect(() =>
      generateJavaProject(
        input({
          biomeAdditions: [
            addition({
              biomes: ['minecraft:plains'],
              spawns: [{ ...spawn, min_group: 3, max_group: 2 }],
            }),
          ],
        }),
      ),
    ).toThrow(/min_group 3 is above max_group 2/);
    expect(() =>
      generateJavaProject(
        input({
          biomeAdditions: [
            addition({
              biomes: ['minecraft:plains'],
              features: [{ feature: 'a:b', step: 'ores' }],
            }),
          ],
        }),
      ),
    ).toThrow(/step 'ores'/);
    expect(() =>
      generateJavaProject(
        input({
          lootAdditions: [
            {
              id: 'msm_test:x',
              path: 'msm/msm_test/loot_addition/x.json',
              definition: { format: 1, tables: ['minecraft:entities/zombie'], pools: [] },
            },
          ],
        }),
      ),
    ).toThrow(/pools must list at least one pool/);
  });

  it('generates the kitchen-sink entity with GeckoLib and the client entrypoint', async () => {
    const { files, entrypoints } = generateJavaProject(
      input({ entities: [await definition('entity', 'kitchen_sink')], geckolib: true }),
    );
    expect(entrypoints.client).toBe('msm_test.client.MsmTestModClient');
    await golden('entity', files);
  });

  it('generates status effects mirroring MsmMobEffect, registered first (ADR 0055 D10)', async () => {
    const effects = await Promise.all(
      ['frostbite', 'pulse', 'quickening'].map((path) => definition('effect', path)),
    );
    const { files, entrypoints } = generateJavaProject(
      input({ effects, items: [await definition('item', 'frost_tonic')] }),
    );
    // Effects only (no entities, no throwables): no client entrypoint.
    expect(entrypoints.client).toBeUndefined();
    await golden('status-effects', files);
    const text = (suffix: string): string =>
      files.find((file) => file.path.endsWith(suffix))?.contents ?? '';
    expect(text('/MsmTestMod.java')).toContain(
      '        ModEffects.register();\n        ModItems.register();',
    );
    const frostbite = text('/effect/FrostbiteEffect.java');
    expect(frostbite).toContain(
      'super(OWNER, MobEffectCategory.HARMFUL, 0xADD8E6, "minecraft:snowflake");',
    );
    expect(frostbite).toContain('soundOnAdded("minecraft:entity.player.hurt_freeze");');
    expect(frostbite).toContain(
      'modifier(1, "minecraft:movement_speed", -0.1f, AttributeModifier.Operation.ADD_MULTIPLIED_TOTAL);',
    );
    // self and other are both the holder.
    expect(frostbite).toContain(
      'event_bite(level, holder.blockPosition(), holder.position(), holder instanceof Player p ? p : null, holder, holder, 1);',
    );
    expect(frostbite).toContain(
      'Actions.damage(level, player != null ? player : entity instanceof LivingEntity living ? living : null, 4.0f);',
    );
    expect(frostbite).toContain('Actions.heal(other, 2.0f);');
    expect(frostbite).toContain('protected boolean hasOnEnd() {');
    expect(text('/effect/PulseEffect.java')).toContain('        return 10;');
    expect(text('/effect/QuickeningEffect.java')).toContain(
      'return Math.max(1, 10 / (Math.max(0, amplifier) + 1));',
    );
    const base = text('/effect/MobEffectBase.java');
    expect(base).toContain('public void onEffectAdded(LivingEntity entity, int amplifier) {');
    expect(base).toContain('ServerMobEffectEvents.AFTER_REMOVE.register(');
    expect(base).toContain('ServerTickEvents.END_SERVER_TICK.register(server -> flush());');
    expect(text('/ModEffects.java')).toContain(
      'public static final Holder<MobEffect> FROSTBITE = Registry.registerForHolder(BuiltInRegistries.MOB_EFFECT,',
    );
    const actions = text('/Actions.java');
    expect(actions).toContain(
      'public static void damage(ServerLevel level, LivingEntity target, float amount) {',
    );
    expect(actions).toContain('public static void heal(LivingEntity target, float amount) {');
    expect(actions).not.toContain('applyEffect');
    // A drink naming a project effect: looked up after ModEffects registered it.
    expect(text('/ModItems.java')).toContain(
      'Identifier.fromNamespaceAndPath("msm_test", "frostbite")',
    );
    // No throwable classes without throwables.
    expect(files.some((file) => file.path.endsWith('/ThrownItemEntity.java'))).toBe(false);
  });

  it('generates potions mirroring MsmRegistrar.registerPotion, after effects (ADR 0063 D8)', async () => {
    // The MsmPotionGameTest definitions without partly_broken (an unknown effect, below).
    const potions = await Promise.all(
      ['frost_draught', 'long_frost_draught', 'strong_frost_draught', 'swift_step'].map((path) =>
        definition('potion', path),
      ),
    );
    const { files, entrypoints } = generateJavaProject(
      input({
        effects: [await definition('effect', 'frostbite')],
        potions,
        items: [await definition('item', 'frost_tonic')],
      }),
    );
    expect(entrypoints.client).toBeUndefined();
    await golden('potions', files);
    const text = (suffix: string): string =>
      files.find((file) => file.path.endsWith(suffix))?.contents ?? '';
    expect(text('/MsmTestMod.java')).toContain(
      '        ModEffects.register();\n        ModPotions.register();\n        ModItems.register();',
    );
    const modPotions = text('/ModPotions.java');
    // name defaults to <ns>.<path>; the variants state the base potion's name.
    expect(modPotions).toContain(
      'public static final Holder<Potion> FROST_DRAUGHT = register("msm_test:frost_draught", "msm_test.frost_draught",\n' +
        '            new MobEffectInstance(effect("msm_test:frostbite"), 3600, 0));',
    );
    expect(modPotions).toContain(
      'LONG_FROST_DRAUGHT = register("msm_test:long_frost_draught", "msm_test.frost_draught",',
    );
    expect(modPotions).toContain('new MobEffectInstance(effect("msm_test:frostbite"), 1800, 1));');
    // Flags only when one differs from vanilla's defaults.
    expect(modPotions).toContain(
      'SWIFT_STEP = register("msm_test:swift_step", "msm_test.swift",\n' +
        '            new MobEffectInstance(effect("minecraft:speed"), 600, 2, true, false, false),\n' +
        '            new MobEffectInstance(effect("minecraft:jump_boost"), 200, 0));',
    );
    expect(modPotions).toContain(
      'Registry.registerForHolder(BuiltInRegistries.POTION, ResourceKey.create(Registries.POTION, Identifier.parse(id)),',
    );
    expect(modPotions).toContain('new Potion(name, effects));');
  });

  it('writes no ModPotions without potions and fails on an unknown effect', async () => {
    const effect = await definition('effect', 'frostbite');
    for (const potions of [undefined, []]) {
      const { files } = generateJavaProject(
        input(potions === undefined ? { effects: [effect] } : { effects: [effect], potions }),
      );
      expect(files.some((file) => file.path.endsWith('/ModPotions.java'))).toBe(false);
      expect(files.find((file) => file.path.endsWith('/MsmTestMod.java'))?.contents).not.toContain(
        'ModPotions',
      );
    }
    // msm_runtime skips partly_broken with an error; the eject refuses it.
    const broken = await definition('potion', 'partly_broken');
    expect(() => generateJavaProject(input({ potions: [broken] }))).toThrow(
      "msm/msm_test/potion/partly_broken.json (msm_test:partly_broken): effects[1]: unknown mob effect 'msm_test:no_such_effect'",
    );
    // A project effect is known only when the project has it.
    const draught = await definition('potion', 'frost_draught');
    expect(() => generateJavaProject(input({ potions: [draught] }))).toThrow(
      /unknown mob effect 'msm_test:frostbite'/,
    );
    const withDefinition = (json: JsonObject) =>
      generateJavaProject(input({ potions: [{ ...draught, definition: json }] }));
    const one = { id: 'speed', duration_ticks: 20 };
    expect(
      withDefinition({ format: 1, effects: [one] }).files.find((file) =>
        file.path.endsWith('/ModPotions.java'),
      )?.contents,
    ).toContain('new MobEffectInstance(effect("minecraft:speed"), 20, 0));');
    expect(() => withDefinition({ format: 1, effects: [] })).toThrow(/1 to 8 effects, not 0/);
    expect(() => withDefinition({ format: 1, effects: Array(9).fill(one) })).toThrow(
      /1 to 8 effects, not 9/,
    );
    expect(() => withDefinition({ format: 1 })).toThrow(/effects is missing/);
    expect(() => withDefinition({ format: 1, effects: [one], brewing: {} })).toThrow(
      /unknown top-level key 'brewing'/,
    );
    expect(() => withDefinition({ format: 1, effects: [{ ...one, duration_ticks: 0 }] })).toThrow(
      /duration_ticks must be at least 1/,
    );
    expect(() => withDefinition({ format: 1, effects: [{ ...one, amplifier: 256 }] })).toThrow(
      /amplifier must be 0 to 255/,
    );
    expect(() => withDefinition({ format: 1, effects: [{ ...one, colour: 1 }] })).toThrow(
      /unknown effect field 'colour'/,
    );
  });

  it('knows the vendored mob_effect registry', async () => {
    const registries = JSON.parse(
      await readFile(join(here, '..', 'vendor', 'mcmeta', 'registries.json'), 'utf8'),
    ) as Record<string, string[]>;
    expect([...VANILLA_MOB_EFFECTS]).toEqual(registries.mob_effect);
  });

  it('generates throwables mirroring MsmThrowableItem and MsmThrownItem (ADR 0056 D7)', async () => {
    const paths = [
      'ruby_ball',
      'ruby_knife',
      'ruby_boomerang',
      'ruby_javelin',
      'ruby_orb',
      'feather_ball',
    ];
    const items = await Promise.all(paths.map((path) => definition('item', path)));
    const { files, entrypoints } = generateJavaProject(
      input({ items, effects: [await definition('effect', 'frostbite')] }),
    );
    // Throwables without entities: a client entrypoint without GeckoLib.
    expect(entrypoints.client).toBe('msm_test.client.MsmTestModClient');
    await golden('throwables', files);
    const text = (suffix: string): string =>
      files.find((file) => file.path.endsWith(suffix))?.contents ?? '';
    const client = text('/client/MsmTestModClient.java');
    expect(client).toContain(
      'EntityRenderers.register(ThrownItemEntity.TYPE, ThrownItemRenderer<ThrownItemEntity>::new);',
    );
    expect(client).not.toContain('geckolib');
    expect(files.some((file) => file.path.endsWith('/GeoModelBase.java'))).toBe(false);
    expect(text('/MsmTestMod.java')).toContain(
      '        ModEffects.register();\n        ThrownItemEntity.register();\n        ModItems.register();',
    );
    expect(text('/entity/ThrownItemEntity.java')).toContain(
      'Identifier.fromNamespaceAndPath("msm_test", "thrown_item")',
    );
    // Each after_throw.
    expect(text('/item/RubyBallItem.java')).toContain('AfterThrow.CONSUME, // after_throw');
    expect(text('/item/RubyOrbItem.java')).toContain('AfterThrow.KEEP, // after_throw');
    expect(text('/item/RubyKnifeItem.java')).toContain('AfterThrow.DROP, // after_throw');
    expect(text('/item/RubyBoomerangItem.java')).toContain('AfterThrow.RETURN, // after_throw');
    // Hit events: self is the thrower, other the entity hit.
    const ball = text('/item/RubyBallItem.java');
    expect(ball).toContain(
      'event_hit(level, base, at, thrower instanceof Player p ? p : null, thrower, hit, 1);',
    );
    expect(ball).toContain(
      'event_land(level, pos, at, thrower instanceof Player p ? p : null, thrower, null, 1);',
    );
    expect(ball).toContain('Actions.applyEffect(OWNER, other, "msm_test:frostbite", 200, 0);');
    expect(ball).toContain(
      'Actions.heal(player != null ? player : entity instanceof LivingEntity living ? living : null, 1.0f);',
    );
    // msm:on_use fires before the throw, then its cooldown.
    expect(text('/item/RubyOrbItem.java')).toContain(
      'protected void onUse(Level level, Player player, InteractionHand hand, ItemStack stack) {',
    );
    expect(text('/item/RubyJavelinItem.java')).toContain('10, // charge_ticks');
    const modItems = text('/ModItems.java');
    // Dispensable unless dispensable is false (the boomerang).
    expect(modItems).toContain('DispenserBlock.registerProjectileBehavior(RUBY_BALL);');
    expect(modItems).not.toContain('DispenserBlock.registerProjectileBehavior(RUBY_BOOMERANG);');
    expect(modItems).toContain('new RubyKnifeItem(new Item.Properties()');
    expect(modItems).toContain('.sword(ToolMaterial.IRON, 3.0f, -2.4f)');
    expect(modItems).toContain('.stacksTo(16)');
  });

  it('gives the client both renderers with entities and throwables', async () => {
    const { files } = generateJavaProject(
      input({
        items: [await definition('item', 'ruby_ball')],
        entities: [await definition('entity', 'kitchen_sink')],
        effects: [await definition('effect', 'frostbite')],
        geckolib: true,
      }),
    );
    const client =
      files.find((file) => file.path.endsWith('/client/MsmTestModClient.java'))?.contents ?? '';
    expect(client).toContain('ThrownItemRenderer<ThrownItemEntity>::new');
    expect(client).toContain('import com.geckolib.renderer.GeoEntityRenderer;');
    expect(client).toContain(
      "/** Client entrypoint: vanilla's thrown item renderer and a GeckoLib renderer per entity type. */",
    );
    const mod = files.find((file) => file.path.endsWith('/MsmTestMod.java'))?.contents ?? '';
    expect(mod).toContain(
      '        ModEffects.register();\n        ThrownItemEntity.register();\n        ModItems.register();\n        ModEntities.register();',
    );
  });

  it('keeps effect and throwable names unique and clear of Java keywords', async () => {
    const frostbite = await definition('effect', 'frostbite');
    const effect = (id: string, event: string): DefinitionInput => ({
      id,
      path: `msm/${id.replace(':', '/effect/')}.json`,
      definition: {
        format: 1,
        category: 'neutral',
        color: 0,
        components: { 'msm:on_start': { event } },
        events: { [event]: { actions: [{ type: 'heal', amount: 1 }] } },
      },
    });
    const ball = await definition('item', 'ruby_ball');
    const throwableItem = {
      ...ball,
      id: 'msm_test:throwable',
      path: 'msm/msm_test/item/throwable.json',
    };
    const thrownEntity = {
      ...(await definition('entity', 'kitchen_sink')),
      id: 'msm_test:thrown_item',
      path: 'msm/msm_test/entity/thrown_item.json',
    };
    const { files } = generateJavaProject(
      input({
        effects: [
          frostbite,
          { ...frostbite, id: 'other:frostbite', path: 'msm/other/effect/frostbite.json' },
          effect('msm_test:static', 'msm_test:class'),
          effect('msm_test:mob_effect_base', 'msm_test:new'),
        ],
        items: [ball, throwableItem],
        entities: [thrownEntity],
        geckolib: true,
      }),
    );
    const paths = files.map((file) => file.path);
    expect(paths).toContain('src/main/java/msm_test/effect/FrostbiteEffect.java');
    expect(paths).toContain('src/main/java/msm_test/effect/FrostbiteEffect2.java');
    expect(paths).toContain('src/main/java/msm_test/effect/StaticEffect.java');
    expect(paths).toContain('src/main/java/msm_test/effect/MobEffectBaseEffect.java');
    expect(paths).toContain('src/main/java/msm_test/item/ThrowableItem.java');
    expect(paths).toContain('src/main/java/msm_test/item/ThrowableItem2.java');
    expect(paths).toContain('src/main/java/msm_test/entity/ThrownItemEntity.java');
    expect(paths).toContain('src/main/java/msm_test/entity/ThrownItemEntity2.java');
    const text = (suffix: string): string =>
      files.find((file) => file.path.endsWith(suffix))?.contents ?? '';
    const modEffects = text('/ModEffects.java');
    expect(modEffects).toContain('public static final Holder<MobEffect> FROSTBITE_2 =');
    expect(modEffects).toContain('public static final Holder<MobEffect> STATIC =');
    expect(text('/effect/StaticEffect.java')).toContain('private void event_class(');
    expect(text('/effect/MobEffectBaseEffect.java')).toContain('private void event_new(');
    // The project entity keeps msm_test:thrown_item; the thrown item type moves aside.
    expect(text('/entity/ThrownItemEntity.java')).toContain(
      'Identifier.fromNamespaceAndPath("msm_test", "thrown_item_2")',
    );
    for (const file of files) {
      for (const match of file.contents.matchAll(
        /\b(?:class|void|int|boolean) ([A-Za-z_0-9]+)\(/g,
      )) {
        expect(JAVA_KEYWORDS.has(match[1] as string), `${file.path}: ${match[1]}`).toBe(false);
      }
    }
  });

  it('generates a blank project as the mod class alone', () => {
    const files = target.javaProject?.generate(input({})) ?? [];
    expect(files.map((file) => file.path)).toEqual(['src/main/java/msm_test/MsmTestMod.java']);
    expect(files[0]?.contents.startsWith('// Generated by MCSuperMods')).toBe(true);
  });

  it('is deterministic and sorted, with a header, LF and four-space indents', async () => {
    const all = input({
      blocks: [await definition('block', 'kitchen_sink')],
      items: [await definition('item', 'gadget')],
      entities: [await definition('entity', 'kitchen_sink')],
      geckolib: true,
    });
    const first = target.javaProject?.generate(all) ?? [];
    const second = target.javaProject?.generate(structuredClone(all)) ?? [];
    expect(second).toEqual(first);
    const paths = first.map((file) => file.path);
    expect(paths).toEqual([...paths].sort());
    for (const file of first) {
      expect(file.contents.startsWith('// Generated by MCSuperMods'), file.path).toBe(true);
      expect(file.contents.includes('\r'), file.path).toBe(false);
      expect(file.contents.includes('\t'), file.path).toBe(false);
      expect(file.contents.endsWith('}\n'), file.path).toBe(true);
      const imports = file.contents.split('\n').filter((line) => line.startsWith('import '));
      expect(imports, file.path).toEqual([...imports].sort());
    }
  });

  it('names one class per id and avoids clashes across namespaces', async () => {
    const block = await definition('block', 'kitchen_sink');
    const other = { ...block, id: 'other:kitchen_sink', path: 'msm/other/block/kitchen_sink.json' };
    const { files } = generateJavaProject(input({ blocks: [block, other] }));
    const paths = files.map((file) => file.path);
    expect(paths).toContain('src/main/java/msm_test/block/KitchenSinkBlock.java');
    expect(paths).toContain('src/main/java/msm_test/block/KitchenSinkBlock2.java');
    const modBlocks = files.find((file) => file.path.endsWith('/ModBlocks.java'))?.contents ?? '';
    expect(modBlocks).toContain('KITCHEN_SINK_2_KEY');
  });

  describe('errors name the definition', () => {
    const block = (definition: JsonObject): DefinitionInput => ({
      id: 'msm_test:bad',
      path: 'msm/msm_test/block/bad.json',
      definition,
    });
    const generate = (parts: Partial<JavaProjectInput>) => () => generateJavaProject(input(parts));

    it('rejects unknown components, actions and keys', () => {
      expect(generate({ blocks: [block({ format: 1, components: { 'msm:glow': {} } })] })).toThrow(
        /msm\/msm_test\/block\/bad\.json \(msm_test:bad\): .*unknown component 'msm:glow'/,
      );
      expect(
        generate({
          blocks: [
            block({
              format: 1,
              components: { 'msm:on_interact': { event: 'msm_test:x' } },
              events: {
                'msm_test:x': { actions: [{ type: 'run_script', handler: 'msm_test:h' }] },
              },
            }),
          ],
        }),
      ).toThrow(/action type 'run_script' cannot be ejected/);
      expect(generate({ blocks: [block({ format: 1, colour: 'red' })] })).toThrow(
        /unknown top-level key 'colour'/,
      );
      expect(generate({ blocks: [block({ format: 2 })] })).toThrow(/format 2/);
    });

    it('rejects types and type fields the runtime refuses (ADR 0067 D3, D4)', async () => {
      const typed = (fields: JsonObject) => generate({ blocks: [block({ format: 1, ...fields })] });
      expect(typed({ type: 'crop', max_age: 16 })).toThrow(/max_age must be 1 to 15/);
      expect(typed({ type: 'crop', stage_heights: [0, 4] })).toThrow(
        /stage_heights must be a list of integers from 1 to 16/,
      );
      expect(typed({ type: 'crop', soil: 'minecraft:dirt' })).toThrow(
        /soil 'minecraft:dirt' is not a tag reference/,
      );
      expect(typed({ type: 'crop', bonemeal_growth: { min: 1 } })).toThrow(/max is missing/);
      expect(typed({ type: 'crop', bonemeal_growth: { min: 1, max: 16 } })).toThrow(
        /max must be 0 to 15/,
      );
      expect(typed({ type: 'crop', tree: 'msm_test:t' })).toThrow(/unknown top-level key 'tree'/);
      expect(typed({ type: 'sapling' })).toThrow(/tree is missing/);
      expect(typed({ type: 'sapling', tree: 'Not An Id' })).toThrow(
        /tree 'Not An Id' is not an id/,
      );
      expect(typed({ type: 'leaves', tint: 'water' })).toThrow(/tint 'water' is not one of/);
      expect(typed({ type: 'leaves', tint: 16777216 })).toThrow(/tint must be 0 to 16777215/);
      expect(typed({ type: 'leaves', particle_chance: 2 })).toThrow(
        /particle_chance must be 0 to 1/,
      );
      expect(
        typed({
          type: 'leaves',
          components: { 'msm:shape': { boxes: [[0, 0, 0, 16, 8, 16]] } },
        }),
      ).toThrow(/msm:shape is not allowed on type 'leaves'/);
      expect(typed({ type: 'roof' })).toThrow(/type 'roof' is not one of/);
      expect(typed({ type: 'slab', set_type: 'wood' })).toThrow(/unknown top-level key 'set_type'/);
      expect(typed({ type: 'door' })).toThrow(/set_type is missing/);
      expect(typed({ type: 'door', set_type: 'oak' })).toThrow(/set_type 'oak' is not one of/);
      expect(typed({ type: 'fence_gate', wood_type: 'ash' })).toThrow(
        /wood_type 'ash' is not one of/,
      );
      expect(typed({ type: 'button', set_type: 'stone', press_ticks: 0 })).toThrow(
        /press_ticks must be 1 to 200/,
      );
      expect(typed({ type: 'pressure_plate', set_type: 'gold', weighted_max: 0 })).toThrow(
        /weighted_max must be at least 1/,
      );
      expect(
        typed({ type: 'slab', components: { 'msm:shape': { boxes: [[0, 0, 0, 16, 8, 16]] } } }),
      ).toThrow(/msm:shape is not allowed on type 'slab'/);
      expect(generate({ blocks: [await definition('block', 'type_stairs_redstone')] })).toThrow(
        /msm:redstone is not allowed on type 'stairs'/,
      );
      expect(
        typed({ components: { 'msm:flammable': { burn_odds: 5, ignite_odds: 301 } } }),
      ).toThrow(/ignite_odds must be 0 to 300/);
      expect(typed({ components: { 'msm:strippable': {} } })).toThrow(/into is missing/);
      // A base in the project's namespace must be a project block; stairs may not form a cycle.
      expect(typed({ type: 'stairs', base_block: 'msm_test:no_such_block' })).toThrow(
        /base_block msm_test:no_such_block is not a block of the project/,
      );
      const stairs = (path: string, base: string): DefinitionInput => ({
        id: `msm_test:${path}`,
        path: `msm/msm_test/block/${path}.json`,
        definition: { format: 1, type: 'stairs', base_block: base },
      });
      expect(generate({ blocks: [stairs('a', 'msm_test:b'), stairs('b', 'msm_test:a')] })).toThrow(
        /part of a cycle of stairs/,
      );
    });

    it('rejects malformed shapes and the editor-only preset', () => {
      const shaped = (shape: JsonObject) =>
        generate({ blocks: [block({ format: 1, components: { 'msm:shape': shape } })] });
      expect(shaped({ preset: 'slab_bottom', boxes: [[0, 0, 0, 16, 8, 16]] })).toThrow(
        /components\.msm:shape: unknown msm:shape field 'preset'/,
      );
      expect(shaped({ boxes: [] })).toThrow(/1 to 16 boxes/);
      expect(shaped({ boxes: Array.from({ length: 17 }, () => [0, 0, 0, 1, 1, 1]) })).toThrow(
        /1 to 16 boxes/,
      );
      expect(shaped({ boxes: [[0, 0, 0, 16, 8]] })).toThrow(/boxes\[0\] must be 6 numbers/);
      expect(shaped({ boxes: [[0, 0, 0, 16, 16.5, 16]] })).toThrow(/from 0 to 16/);
      expect(shaped({ collision: 'no' })).toThrow(/collision must be true or false/);
    });

    it('rejects armour with a tool and malformed tag references', () => {
      const item = (definition: JsonObject): DefinitionInput => ({
        id: 'msm_test:bad',
        path: 'msm/msm_test/item/bad.json',
        definition,
      });
      expect(
        generate({
          items: [
            item({
              format: 1,
              components: {
                'msm:armor': { slot: 'helmet', material: 'iron' },
                'msm:tool': { type: 'sword', tier: 'iron' },
              },
            }),
          ],
        }),
      ).toThrow(/msm:armor and msm:tool on one item cannot be ejected/);
      expect(
        generate({
          items: [
            item({
              format: 1,
              components: {
                'msm:tool': {
                  type: 'pickaxe',
                  tier: {
                    durability: 1,
                    speed: 1,
                    attack_damage_bonus: 0,
                    enchantment_value: 1,
                    incorrect_blocks_for_drops: 'minecraft:incorrect_for_stone_tool',
                  },
                },
              },
            }),
          ],
        }),
      ).toThrow(
        /incorrect_blocks_for_drops 'minecraft:incorrect_for_stone_tool' is not a tag reference/,
      );
      expect(
        generate({
          items: [
            item({ format: 1, components: { 'msm:armor': { slot: 'body', material: 'iron' } } }),
          ],
        }),
      ).toThrow(/slot 'body' is not one of helmet, chestplate, leggings, boots, horse, wolf/);
    });

    it('rejects exclusive gear components together and a spear attack_speed of -4', () => {
      const item = (definition: JsonObject): DefinitionInput => ({
        id: 'msm_test:bad',
        path: 'msm/msm_test/item/bad.json',
        definition,
      });
      expect(
        generate({
          items: [
            item({
              format: 1,
              components: {
                'msm:shield': {},
                'msm:ranged_weapon': { type: 'bow' },
              },
            }),
          ],
        }),
      ).toThrow(/msm:ranged_weapon and msm:shield on one item cannot be ejected/);
      expect(
        generate({
          items: [
            item({
              format: 1,
              components: { 'msm:tool': { type: 'spear', tier: 'iron', attack_speed: -4 } },
            }),
          ],
        }),
      ).toThrow(/attack_speed of a spear must be above -4/);
      expect(
        generate({
          items: [
            item({
              format: 1,
              components: { 'msm:shield': { bypassed_by: 'minecraft:bypasses_shield' } },
            }),
          ],
        }),
      ).toThrow(/bypassed_by 'minecraft:bypasses_shield' is not a tag reference/);
    });

    it('rejects a throwable with a clashing component, and bad effect and throwable fields', () => {
      const item = (definition: JsonObject): DefinitionInput => ({
        id: 'msm_test:bad',
        path: 'msm/msm_test/item/bad.json',
        definition,
      });
      const effect = (definition: JsonObject): DefinitionInput => ({
        id: 'msm_test:bad',
        path: 'msm/msm_test/effect/bad.json',
        definition,
      });
      expect(
        generate({
          items: [
            item({
              format: 1,
              components: {
                'msm:throwable': {},
                'msm:food': { nutrition: 1, saturation: 1 },
              },
            }),
          ],
        }),
      ).toThrow(/msm:throwable and msm:food on one item cannot be ejected/);
      expect(
        generate({
          items: [
            item({
              format: 1,
              components: { 'msm:throwable': {}, 'msm:tool': { type: 'mace', tier: 'iron' } },
            }),
          ],
        }),
      ).toThrow(/msm:throwable and msm:tool \(mace\) on one item cannot be ejected/);
      expect(
        generate({
          items: [item({ format: 1, components: { 'msm:throwable': { after_throw: 'fly' } } })],
        }),
      ).toThrow(/after_throw 'fly' is not one of consume, keep, drop, return/);
      expect(
        generate({
          items: [
            item({
              format: 1,
              components: { 'msm:throwable': { on_hit_entity: { event: 'msm_test:x' } } },
            }),
          ],
        }),
      ).toThrow(/names event msm_test:x, which is not declared/);
      expect(generate({ effects: [effect({ format: 1, category: 'evil', color: 0 })] })).toThrow(
        /msm\/msm_test\/effect\/bad\.json \(msm_test:bad\): category 'evil' is not one of/,
      );
      expect(
        generate({ effects: [effect({ format: 1, category: 'neutral', color: 16777216 })] }),
      ).toThrow(/color must be 0 to 16777215/);
      expect(
        generate({
          effects: [
            effect({
              format: 1,
              category: 'neutral',
              color: 0,
              components: { 'msm:on_tick': { event: 'msm_test:x', interval_ticks: 0 } },
              events: { 'msm_test:x': { actions: [{ type: 'heal', amount: 1 }] } },
            }),
          ],
        }),
      ).toThrow(/interval_ticks must be at least 1/);
      expect(
        generate({
          effects: [
            effect({
              format: 1,
              category: 'neutral',
              color: 0,
              events: { 'msm_test:x': { actions: [{ type: 'damage', amount: -1 }] } },
            }),
          ],
        }),
      ).toThrow(/amount must be at least 0/);
    });

    it('rejects undeclared events', () => {
      expect(
        generate({
          blocks: [
            block({ format: 1, components: { 'msm:on_interact': { event: 'msm_test:missing' } } }),
          ],
        }),
      ).toThrow(/names event msm_test:missing, which is not declared/);
      expect(
        generate({
          blocks: [
            block({
              format: 1,
              events: {
                'msm_test:a': { actions: [{ type: 'trigger_event', event: 'msm_test:b' }] },
              },
            }),
          ],
        }),
      ).toThrow(/trigger_event names event msm_test:b/);
    });

    it('rejects entities without GeckoLib and unknown goals', async () => {
      const entity = await definition('entity', 'kitchen_sink');
      expect(generate({ entities: [entity] })).toThrow(/GeckoLib/);
      const goals = structuredClone(entity);
      (goals.definition.components as JsonObject)['msm:ai_goals'] = { goals: [{ type: 'dance' }] };
      expect(generate({ entities: [goals], geckolib: true })).toThrow(
        /goal type 'dance' cannot be ejected/,
      );
    });
  });
});
