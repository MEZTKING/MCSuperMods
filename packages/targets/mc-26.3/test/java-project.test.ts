/**
 * The 26.3 Java generator (ADR 0033 D3): identifier derivation, one golden per kind built from
 * the runtime's GameTest kitchen-sink definitions (copied from
 * `engine-mod/src/gametest/resources/msm/msm_test/` into `test/fixtures/java-project/input/`;
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
    expect(stone).toContain('Actions.applyEffect(OWNER, player, "minecraft:slowness", 50, 2);');
    // Without apply_effect, Actions has no applyEffect (the older goldens stay as they were).
    const plain = generateJavaProject(input({ items: [await definition('item', 'gadget')] }));
    const plainActions =
      plain.files.find((file) => file.path.endsWith('/Actions.java'))?.contents ?? '';
    expect(plainActions).not.toContain('applyEffect');
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
