/**
 * Cross-plugin check of the library's starters and examples (ADR 0020, plan D6): every
 * bundle is built into a project the way the app's session does it (`newProject`), saved,
 * reloaded with the real built-in plugins (resource pack, data pack, structures, worldgen,
 * blocks and items, entities, models and animations, scripting, library), validated element by element
 * with the project's own registry ids, and exported as a resource pack and a data pack with
 * every function checked by the offline mcfunction service; projects with `msm:` elements are
 * also exported as a Fabric mod jar (separate runtime, so no runtime or GeckoLib jar is
 * needed; the Custom mob starter is also exported with stub runtime and GeckoLib jars
 * nested). Projects with scripts export with a stub `transpileScript` that returns the source
 * unchanged, and every library script is parsed and type-checked against the generated
 * `msm-runtime.d.ts` with the real `typescript` package. Zero problems (errors or warnings, so
 * no unknown ids) are allowed, for every built-in target.
 *
 * The `examples/` folder at the repository root mirrors the library as ordinary MSM
 * projects: `examples/all-kinds/` (every per-kind example in one project),
 * `examples/blocks-items/` (the blocks and items behaviour examples), `examples/entities/`
 * (the entity behaviour examples), `examples/scripts/` (the script behaviour examples) and
 * `examples/starters/<starter id>/` (each content starter). It is a golden: set
 * `UPDATE_GOLDENS=1` to rewrite it from the current library.
 */
import { readFileSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createElement,
  createEmptyProject,
  createMemoryFileSystem,
  ElementKindRegistry,
  isProjectRelativePath,
  loadProject,
  type MemoryFileSystem,
  type Project,
  type ProjectFileSystem,
  registerPlugin,
  requireSyncResult,
  saveProject,
  utf8,
} from '@msm/core';
import type {
  ContentBundle,
  ExampleProject,
  Exporter,
  Json,
  Plugin,
  Problem,
  ProjectStarter,
  TargetFacts,
} from '@msm/plugin-api';
import blocksItemsPlugin from '@msm/plugin-blocks-items';
import dataPackPlugin from '@msm/plugin-datapack';
import entitiesPlugin from '@msm/plugin-entities';
import libraryPlugin, {
  behaviourExamples,
  EXTRA_DROP_TABLES,
  encodePng,
  entityBehaviourExamples,
  kindExamples,
  libraryExamples,
  libraryStarters,
  scriptBehaviourExamples,
} from '@msm/plugin-library';
import modelsAnimPlugin from '@msm/plugin-models-anim';
import resourcePackPlugin from '@msm/plugin-resourcepack';
import scriptingPlugin, { MSM_RUNTIME_TYPINGS } from '@msm/plugin-scripting';
import structuresPlugin from '@msm/plugin-structures';
import worldgenPlugin from '@msm/plugin-worldgen';
import {
  createRegistryIndex,
  createSchemaIndex,
  parseVanillaMcdocSymbols,
  type RegistryIndex,
  type SchemaIndex,
  validateJson,
} from '@msm/schemas';
import {
  collectProjectObjectives,
  createMcfunctionService,
  type McfunctionService,
} from '@msm/schemas/mcfunction';
import {
  builtInTargets,
  defaultTargetId,
  readVendoredJson,
  type TargetBundle,
  targetById,
} from '@msm/targets';
import ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';
import { nestedGeckolibPath } from '../src/fabric-content-jar/index';
import {
  createFabricContentJarExporter,
  createMemorySink,
  dataPackExporter,
  nestedRuntimePath,
  resourcePackExporter,
  runExport,
} from '../src/index';

const update = process.env.UPDATE_GOLDENS === '1';

const here = dirname(fileURLToPath(import.meta.url));
const examplesRoot = join(here, '..', '..', '..', 'examples');

/** The app's built-in plugins, in its registration order. */
const PLUGINS: readonly Plugin[] = [
  resourcePackPlugin,
  dataPackPlugin,
  structuresPlugin,
  worldgenPlugin,
  blocksItemsPlugin,
  entitiesPlugin,
  modelsAnimPlugin,
  scriptingPlugin,
  libraryPlugin,
];
const PACK_KIND = 'minecraft:pack_mcmeta';
const NOW = '2026-11-04T00:00:00.000Z';
/** The target new projects get: the newest release target (ADR 0037 D4). */
const DEFAULT_TARGET = defaultTargetId;
const DEFAULT_BUNDLE = targetById(DEFAULT_TARGET) as TargetBundle;

/** Whether a starter or example is offered on `target` (`supports`, ADR 0036 D4). */
const supported = (entry: ProjectStarter | ExampleProject, target: TargetFacts): boolean =>
  entry.supports?.(target) ?? true;

/**
 * Builds a library starter or example for a target (the default target unless given), with
 * every parameter at its default as the host passes them (ADR 0036). Built-ins build
 * synchronously.
 */
function buildEntry(
  entry: ProjectStarter | ExampleProject,
  namespace: string,
  projectName: string,
  target: TargetFacts = DEFAULT_BUNDLE.target,
  overrides: Readonly<Record<string, Json>> = {},
): ContentBundle {
  const parameters = 'parameters' in entry ? (entry.parameters ?? []) : [];
  const values = {
    ...Object.fromEntries(parameters.map((parameter) => [parameter.id, parameter.default])),
    ...overrides,
  };
  return requireSyncResult(entry.build({ namespace, projectName, target, values }), entry.id);
}

/**
 * Alternative wizard answers (ADR 0040): every parameterised starter is also built with these,
 * and once more with {@link minimumValues}, and must validate and export with zero problems.
 */
/** A minimal Ogg Vorbis container (header page and a last page, 3 s) as a `data:` URL. */
function songDataUrl(): string {
  const page = (granule: number, packet: number[]): number[] => {
    const header = new Uint8Array(27);
    header.set([0x4f, 0x67, 0x67, 0x53, 0, 2]);
    new DataView(header.buffer).setUint32(6, granule, true);
    header[26] = 1;
    return [...header, packet.length, ...packet];
  };
  const id = new Uint8Array(30);
  id.set([0x01, 0x76, 0x6f, 0x72, 0x62, 0x69, 0x73]);
  id[11] = 2;
  new DataView(id.buffer).setUint32(12, 44_100, true);
  const bytes = new Uint8Array([...page(0, [...id]), ...page(3 * 44_100, [0, 0, 0, 0])]);
  return `data:audio/ogg;base64,${Buffer.from(bytes).toString('base64')}`;
}

/** A grey player skin of height 64 or 32 as a PNG `data:` URL. */
function skinDataUrl(height: number): string {
  const bytes = encodePng(new Uint8Array(64 * height * 4).fill(160), 64, height);
  return `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
}

const WIZARD_ALTERNATIVES: Readonly<Record<string, readonly Record<string, Json>[]>> = {
  custom_ore: [
    { ore_name: 'Amber', colour: '#de9420', drop_max: 9, tool_tier: 'diamond', make_block: false },
    // World step (ADR 0060 D6): generation off, and big veins high up with the heights swapped.
    { ore_name: 'Jade', colour: '#28a060', generate: false },
    { vein_size: 32, veins_per_chunk: 32, min_y: 320, max_y: 100 },
  ],
  'custom-sword': [
    {
      sword_name: 'Frost Blade',
      colour: '#2454c4',
      tool_tier: 'iron',
      durability: 250,
      ingredient: 'minecraft:diamond',
    },
  ],
  custom_mob: [
    { mob_name: 'Cave Troll', behaviour: 'hostile', spawn_biomes: '#minecraft:is_taiga' },
    { mob_name: 'Moss Sheep', behaviour: 'peaceful', spawn_biomes: '#minecraft:is_badlands' },
    // A player skin (64 by 64 with its second layer, slim arms) and a legacy 64 by 32 one.
    { mob_name: 'Skin Walker', skin: skinDataUrl(64), arms: 'slim' },
    { mob_name: 'Old Timer', skin: skinDataUrl(32) },
  ],
  'gear-set': [
    {
      material_name: 'Sapphire',
      colour: '#2454c4',
      material_source: 'item',
      tier: 'iron',
      armor_base: 'diamond',
      upgrade_from: 'netherite',
    },
    {
      material_name: 'Frost Steel',
      tier: 'custom',
      mines_like: 'wood',
      armor_base: 'leather',
      pieces: ['pickaxe', 'leggings'],
      upgrade_from: 'iron',
    },
    {
      material_name: 'Jade',
      colour: '#28a060',
      tier: 'iron',
      pieces: [
        'sword',
        'helmet',
        'spear',
        'mace',
        'bow',
        'crossbow',
        'shield',
        'horse_armor',
        'wolf_armor',
      ],
      upgrade_from: 'diamond',
      trim_material: true,
    },
    {
      material_name: 'Storm Glass',
      tier: 'custom',
      material_source: 'item',
      pieces: ['bow', 'shield', 'wolf_armor'],
      trim_material: true,
    },
  ],
  weapon: [
    {
      weapon_name: 'Frost Bow',
      weapon_type: 'bow',
      draw_speed: 2,
      ingredient: 'minecraft:diamond',
    },
    {
      weapon_name: 'Oak Guard',
      weapon_type: 'shield',
      damage_reduction: 0.6,
      ingredient: 'minecraft:iron_ingot',
    },
    {
      weapon_name: 'Thunder Mace',
      weapon_type: 'mace',
      tier: 'netherite',
      custom_damage: true,
      attack_damage: 9,
      attack_speed: -3.2,
    },
    { weapon_name: 'Amber Blade', weapon_type: 'sword', tier: 'gold' },
    { weapon_name: 'Star Crossbow', weapon_type: 'crossbow', ingredient: 'none' },
  ],
  consumable: [
    {
      consumable_name: 'Honey Cake',
      kind: 'food',
      nutrition: 8,
      can_always_eat: true,
      effect_1: 'minecraft:absorption',
      effect_1_chance: 0.5,
      cooldown_seconds: 2,
      ingredient: 'minecraft:apple',
    },
    {
      consumable_name: 'Lucky Charm',
      kind: 'charm',
      cooldown_seconds: 15,
      effect_1: 'minecraft:luck',
      effect_1_level: 3,
      effect_2: 'minecraft:night_vision',
    },
    {
      consumable_name: 'Plain Water',
      kind: 'drink',
      returns_bottle: false,
      effect_1: 'none',
      effect_2: 'none',
    },
  ],
  totem: [
    {
      totem_name: 'Phoenix Feather',
      effect_1: 'minecraft:fire_resistance',
      effect_2: 'none',
      effect_3: 'minecraft:speed',
      clear_effects: false,
      ingredient: 'minecraft:heart_of_the_sea',
    },
  ],
  enchantment: [
    {
      enchantment_name: 'Frost Bite',
      applies_to: 'bows',
      effect: 'mob_effect',
      hit_effect: 'minecraft:slowness',
    },
    {
      enchantment_name: 'Ember',
      applies_to: 'swords',
      effect: 'fire',
      exclusive_with: 'damage',
      rarity: 'rare',
    },
    {
      enchantment_name: 'Push',
      applies_to: 'crossbows',
      effect: 'knockback',
      exclusive_with: 'crossbow',
    },
    {
      enchantment_name: 'Sturdy',
      applies_to: 'everything',
      effect: 'durability',
      rarity: 'common',
    },
    {
      enchantment_name: 'Quick Hands',
      applies_to: 'tools',
      effect: 'mining_speed',
      exclusive_with: 'mining',
    },
    {
      enchantment_name: 'Bulwark',
      applies_to: 'armour',
      effect: 'damage',
      exclusive_with: 'armor',
    },
    {
      enchantment_name: 'Spring Step',
      applies_to: 'armour',
      effect: 'knockback',
      exclusive_with: 'boots',
    },
    { enchantment_name: 'Hidden Edge', exclusive_with: 'bow', in_enchanting_table: false },
  ],
  painting: [
    { painting_name: 'Mountain Lake', author: 'Alex', size: '4x3', colour: '#2454c4' },
    { painting_name: 'Grey Square', size: '1x1', image: pngDataUrl(32, 32) },
  ],
  dimension: [
    {
      dimension_name: 'Frost Caves',
      terrain: 'caves',
      biome: 'minecraft:snowy_plains',
      sky: 'caves',
    },
    {
      dimension_name: 'Sky Isles',
      terrain: 'floating_islands',
      biome: 'mix',
      sky: 'end',
      travel: 'command',
    },
    { dimension_name: 'Flatland', terrain: 'flat', biome: 'minecraft:plains' },
  ],
  'extra-drop': [
    { table: 'chests/desert_pyramid', item: 'diamond', count_min: 2, count_max: 5, chance: 100 },
    { table: 'blocks/short_grass', item: 'minecraft:wheat_seeds', chance: 50 },
    { table: 'entities/creeper', player_kill: false, item: 'minecraft:tnt', chance: 5 },
  ],
  'villager-trade': [
    { profession: 'farmer', level: '3', direction: 'buys', item: 'pumpkin', item_count: 6 },
    { profession: 'wandering_trader', item: 'minecraft:nautilus_shell', emeralds: 5 },
  ],
  'music-disc-item': [
    { song_name: 'Night Walk', artist: 'Steve', length_seconds: 240, comparator_output: 12 },
    { song_name: 'Old Tune', disc_type: 'vanilla', colour: '#28a060' },
    // A song file (ADR 0049): stored as sounds/my_song.ogg and played by the event.
    { song_name: 'My Song', song_file: songDataUrl() },
  ],
  'simple-block': [
    {
      block_name: 'Mossy Lantern',
      colour: '#28a060',
      pattern: 'ore',
      light_level: 15,
      hardness: 3,
      tool: 'axe',
      min_tier: 'stone',
      drops_itself: false,
      ingredient: 'minecraft:oak_planks',
    },
  ],
  food: [
    {
      food_name: 'Amber Pie',
      colour: '#de9420',
      nutrition: 8,
      saturation: 0.8,
      can_always_eat: true,
      ingredient: 'minecraft:sweet_berries',
    },
  ],
  // ADR 0055 D11: a drink, a flask, a heal effect with no item, the other behaviours.
  'status-effect': [
    {
      effect_name: 'Frost Bite',
      colour: '#2454c4',
      category: 'harmful',
      behaviour: 'hurt',
      amount: 2,
      stat_1: 'minecraft:movement_speed',
      stat_1_amount: -15,
      stat_2: 'minecraft:attack_damage',
      stat_2_amount: -1,
      source: 'flask',
      level: 2,
      ingredient: 'minecraft:fermented_spider_eye',
    },
    { effect_name: 'Mending Light', behaviour: 'heal', source: 'none', stat_1: 'none' },
    {
      effect_name: 'Star Glow',
      category: 'neutral',
      behaviour: 'particles',
      particle: 'minecraft:electric_spark',
      stat_1: 'minecraft:scale',
      stat_1_amount: 25,
      stat_2: 'minecraft:gravity',
      stat_2_amount: -30,
      source: 'drink',
      ingredient: 'minecraft:amethyst_shard',
    },
    { effect_name: 'Arcane Pulse', behaviour: 'function', faster_per_level: false },
  ],
  // ADR 0056 D8: every style, weight and hit.
  throwable: [
    {
      throwable_name: 'Snow Ball',
      style: 'ball',
      damage: 0,
      gravity: 'floaty',
      on_hit: 'effect',
      hit_effect: 'minecraft:slowness',
      ingredient: 'minecraft:packed_ice',
    },
    {
      throwable_name: 'Sky Boomerang',
      style: 'boomerang',
      stack_size: 1,
      hold_to_throw: true,
      on_hit: 'knock_up',
      ingredient: 'minecraft:feather',
    },
    { throwable_name: 'Ember Bomb', style: 'bomb', gravity: 'heavy', speed: 1 },
    {
      throwable_name: 'Web Knife',
      style: 'knife',
      on_hit: 'place_block',
      hit_block: 'minecraft:cobweb',
    },
    { throwable_name: 'Spark Star', style: 'ball', on_hit: 'burst', burst_damage: 0 },
  ],
  'scripted-item': [
    { item_name: 'Storm Rod', behaviour: 'lightning', lightning_distance: 16 },
    { item_name: 'Cloud Feather', behaviour: 'launch', launch_height: 12, cooldown_seconds: 5 },
  ],
};

/** A PNG `data:` URL of a grey picture, as the wizard passes an image parameter's value. */
function pngDataUrl(width: number, height: number): string {
  const bytes = encodePng(new Uint8Array(width * height * 4).fill(160), width, height);
  return `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
}

/** Every behaviour of the Scripted behaviour flow, so each generated script is type-checked. */
const SCRIPTED_BEHAVIOURS = ['heal', 'launch', 'lightning', 'effect'];

/**
 * Every number at its minimum, every boolean flipped, every choice at its last entry and every
 * set at its first `min` choices (at least one); strings and colours keep their defaults.
 */
function minimumValues(starter: ProjectStarter): Record<string, Json> {
  const values: Record<string, Json> = {};
  for (const parameter of starter.parameters ?? []) {
    if (parameter.type === 'number') values[parameter.id] = parameter.min ?? parameter.default;
    if (parameter.type === 'boolean') values[parameter.id] = !parameter.default;
    if (parameter.type === 'choice') {
      values[parameter.id] = parameter.choices.at(-1)?.value ?? parameter.default;
    }
    if (parameter.type === 'set') {
      values[parameter.id] = parameter.choices
        .slice(0, Math.max(parameter.min ?? 0, 1))
        .map((choice) => choice.value);
    }
  }
  return values;
}

/** The content starters mirrored under `examples/starters/`. */
const MIRRORED_STARTERS = [
  'custom_ore',
  'custom-sword',
  'recipe_pack',
  'music_disc',
  'function_starter',
  'custom_biome',
  'jigsaw_structure',
  'worldgen_pack',
  'custom_mob',
  'scripted_ore',
  'gear-set',
  'simple-block',
  'food',
  'scripted-item',
  'weapon',
  'consumable',
  'totem',
  'enchantment',
  'painting',
  'music-disc-item',
  'dimension',
  'status-effect',
  'throwable',
  'extra-drop',
];

function kindRegistry(): ElementKindRegistry {
  const registry = new ElementKindRegistry();
  for (const plugin of PLUGINS) registerPlugin(registry, plugin);
  return registry;
}

const registry = kindRegistry();

// Building projects as the app's session does -----------------------------------------------

interface BuiltProject {
  fs: MemoryFileSystem;
  project: Project;
}

/**
 * Builds a new project from bundles the way `ProjectSession.newProject` does: the default
 * target, the plugins that contribute kinds, a namespace, the bundles' elements (plus a
 * default `pack` element when none is given) and their assets, then saves it.
 */
async function buildProject(
  name: string,
  namespace: string,
  bundles: readonly ContentBundle[],
): Promise<BuiltProject> {
  const project = createEmptyProject(name, {
    targets: [DEFAULT_TARGET],
    plugins: PLUGINS.filter((plugin) => (plugin.contributes.elementKinds ?? []).length > 0).map(
      (plugin) => plugin.id,
    ),
  });
  project.namespaces.push({ name: namespace, elements: [], assets: [] });
  const entries = bundles.flatMap((bundle) => bundle.elements);
  if (!entries.some((entry) => entry.kind === PACK_KIND)) {
    const data = structuredClone(registry.get(PACK_KIND)?.defaultData ?? {}) as Json;
    entries.unshift({ id: `${namespace}:pack`, kind: PACK_KIND, data });
  }
  const fs = createMemoryFileSystem();
  const seen = new Set<string>();
  for (const entry of entries) {
    expect(registry.get(entry.kind), `${entry.id} kind ${entry.kind}`).toBeDefined();
    expect(seen.has(entry.id), `duplicate element ${entry.id}`).toBe(false);
    seen.add(entry.id);
    const element = createElement({
      id: entry.id,
      kind: entry.kind,
      data: structuredClone(entry.data),
      now: () => NOW,
      ...(entry.notes === undefined ? {} : { notes: entry.notes }),
      ...(entry.tags === undefined ? {} : { tags: entry.tags }),
    });
    const ns = entry.id.slice(0, entry.id.indexOf(':'));
    let target = project.namespaces.find((candidate) => candidate.name === ns);
    if (target === undefined) {
      target = { name: ns, elements: [], assets: [] };
      project.namespaces.push(target);
    }
    target.elements.push(element);
  }
  const assetPaths = new Set<string>();
  for (const bundle of bundles) {
    for (const asset of bundle.assets) {
      const key = `${asset.namespace}/${asset.path}`;
      expect(assetPaths.has(key), `duplicate asset ${key}`).toBe(false);
      assetPaths.add(key);
      const file = `assets/${key}`;
      await fs.mkdirp(file.slice(0, file.lastIndexOf('/')));
      await fs.writeFile(file, asset.bytes);
      let target = project.namespaces.find((candidate) => candidate.name === asset.namespace);
      if (target === undefined) {
        target = { name: asset.namespace, elements: [], assets: [] };
        project.namespaces.push(target);
      }
      target.assets.push({ path: asset.path, mediaType: 'image/png' });
    }
  }
  project.namespaces.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  await saveProject(fs, project, registry);
  return { fs, project };
}

/** Saves and reloads a built project, expecting zero load problems. */
async function reload(fs: ProjectFileSystem): Promise<Project> {
  const { project, problems } = await loadProject(fs, registry);
  expect(problems).toEqual([]);
  return project;
}

// Registry ids, as the app's schema context derives them --------------------------------------

const DATA_REGISTRY_KINDS = new Set([
  'advancement',
  'banner_pattern',
  'chat_type',
  'damage_type',
  'dialog',
  'dimension',
  'dimension_type',
  'enchantment',
  'function',
  'item_modifier',
  'jukebox_song',
  'loot_table',
  'painting_variant',
  'predicate',
  'recipe',
  'trim_material',
  'trim_pattern',
]);

/** The game always defines these function tags; mcmeta does not list them. */
const SEEDED = { 'tag/function': ['load', 'tick'] };

function between(path: string, prefix: string, suffix: string): string | undefined {
  if (!path.startsWith(prefix) || !path.endsWith(suffix)) return undefined;
  const middle = path.slice(prefix.length, path.length - suffix.length);
  return middle === '' ? undefined : middle;
}

/** Resource pack kinds whose element ids are not data registry ids (as in the app). */
const NON_DATA_KINDS = new Set([
  'minecraft:block_definition',
  'minecraft:item_definition',
  'minecraft:lang',
  'minecraft:model',
  'minecraft:pack_mcmeta',
  'minecraft:sounds',
]);

/**
 * A copy of the app's `projectRegistryIds` (the app cannot be imported here): a registered
 * kind's ids go to `ElementKind.registry`, else to the kind id without `minecraft:`; a kind
 * of another namespace counts only with a plain registry name (no `:`). An element in the
 * `block` registry also registers its block item under the same id (any `item` but `false`),
 * so its id goes to `item` too. An element in the `entity_type` registry with a spawn egg
 * (any `spawn_egg` but `false`) registers the item `<id>_spawn_egg`, and an egg with a
 * texture also gets the generated item model `<ns>:item/<path>_spawn_egg` (as lowering
 * writes it). `msm:script` has no registry, so script ids register nothing.
 */
function projectRegistryIds(project: Project): Record<string, string[]> {
  const ids: Record<string, string[]> = { model: [], sound: [], sound_event: [], texture: [] };
  const add = (name: string, id: string): void => {
    const list = ids[name] ?? [];
    list.push(id);
    ids[name] = list;
  };
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      const kind = registry.get(element.kind);
      const name = kind?.registry ?? element.kind.replace(/^minecraft:/, '');
      if (name.includes(':')) continue;
      if (
        name === 'block' &&
        typeof element.data === 'object' &&
        element.data !== null &&
        (element.data as { item?: unknown }).item !== false
      ) {
        add('item', element.id);
      }
      if (name === 'entity_type' && typeof element.data === 'object' && element.data !== null) {
        const egg = (element.data as { spawn_egg?: unknown }).spawn_egg;
        if (egg !== undefined && egg !== false) {
          add('item', `${element.id}_spawn_egg`);
          const texture = (egg as { texture?: unknown }).texture;
          if (typeof texture === 'string' && texture !== '') {
            const path = element.id.slice(element.id.indexOf(':') + 1);
            add('model', `${namespace.name}:item/${path}_spawn_egg`);
          }
        }
      }
      if (name === 'model') add('model', element.id);
      else if (name === 'sounds' && typeof element.data === 'object' && element.data !== null) {
        for (const key of Object.keys(element.data)) {
          if (key !== '') add('sound_event', `${namespace.name}:${key}`);
        }
      } else if (
        DATA_REGISTRY_KINDS.has(name) ||
        name.startsWith('tag/') ||
        (kind !== undefined && !NON_DATA_KINDS.has(element.kind))
      ) {
        add(name, element.id);
      }
    }
    for (const asset of namespace.assets) {
      const texture = between(asset.path, 'textures/', '.png');
      if (texture !== undefined) add('texture', `${namespace.name}:${texture}`);
      const sound = between(asset.path, 'sounds/', '.ogg');
      if (sound !== undefined) add('sound', `${namespace.name}:${sound}`);
    }
  }
  for (const [registry, list] of Object.entries(ids)) ids[registry] = [...new Set(list)].sort();
  return ids;
}

/**
 * The ids the app's mcfunction checker declares (`mcfunctionProjectIds`): the data pack
 * registries, the seeded function tags and, under `objective`, the scoreboard objectives any
 * project function creates.
 */
function mcfunctionIds(project: Project, ids: Record<string, string[]>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [registry, list] of Object.entries(ids)) {
    if (DATA_REGISTRY_KINDS.has(registry) || registry.startsWith('tag/')) out[registry] = list;
  }
  out['tag/function'] = [
    ...new Set([...(out['tag/function'] ?? []), 'minecraft:load', 'minecraft:tick']),
  ].sort();
  const sources: string[] = [];
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      const lines = (element.data as { lines?: unknown }).lines;
      if (element.kind === 'minecraft:function' && Array.isArray(lines)) {
        sources.push(lines.filter((line) => typeof line === 'string').join('\n'));
      }
    }
  }
  const objective = collectProjectObjectives(sources);
  if (objective.length > 0) out.objective = objective;
  return out;
}

// Per-target context --------------------------------------------------------------------------

const nodeReadFile = async (url: URL): Promise<Uint8Array> => readFile(url);

interface TargetContext {
  schemaIndex: SchemaIndex;
  vanilla: Record<string, string[]>;
  mcfunction: McfunctionService;
}

async function contextFor(bundle: TargetBundle): Promise<TargetContext> {
  const read = (key: Parameters<typeof readVendoredJson>[1]) =>
    readVendoredJson(bundle, key, nodeReadFile);
  const [symbols, registries, commands, blocks] = await Promise.all([
    read('vanillaMcdocSymbols'),
    read('mcmetaRegistries'),
    read('mcmetaCommands'),
    read('mcmetaBlocks'),
  ]);
  const vanilla = { ...(registries as Record<string, string[]>) };
  for (const [name, ids] of Object.entries(SEEDED)) {
    vanilla[name] = [...new Set([...(vanilla[name] ?? []), ...ids])];
  }
  return {
    schemaIndex: createSchemaIndex(parseVanillaMcdocSymbols(symbols), {
      mcVersion: bundle.target.mcVersion,
    }),
    vanilla,
    mcfunction: await createMcfunctionService(
      { commands, blocks, registries: registries as Record<string, string[]> },
      { mcVersion: bundle.target.mcVersion },
    ),
  };
}

/** Problems of every element, validated like the app's Problems panel does. */
function elementProblems(
  project: Project,
  schemaIndex: SchemaIndex,
  registries: RegistryIndex,
): string[] {
  const out: string[] = [];
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      const kind = registry.get(element.kind);
      if (kind === undefined) {
        out.push(`${element.id}: unknown kind ${element.kind}`);
        continue;
      }
      const hidden = kind.hiddenPaths ?? [];
      const node = schemaIndex.resolveSchemaRef(kind.schema);
      for (const problem of validateJson(element.data, node, { registries })) {
        if (hidden.some((path) => problem.path === path || problem.path.startsWith(`${path}/`))) {
          continue;
        }
        out.push(`${element.id} ${problem.path} ${problem.code}: ${problem.message}`);
      }
    }
  }
  return out;
}

/** Every built-in plugin's project validators, as the app's session runs them. */
const VALIDATORS = PLUGINS.flatMap((plugin) => plugin.contributes.validators ?? []);

/** The problems of every validator over the project's elements. */
function validatorProblems(
  project: Project,
  target: TargetBundle['target'],
  registries: RegistryIndex,
): Problem[] {
  const elements = project.namespaces.flatMap((namespace) => namespace.elements);
  return VALIDATORS.flatMap((validator) =>
    requireSyncResult(validator.validate({ elements, target, registry: registries }), validator.id),
  );
}

const meta = { msmVersion: '0.2.1', plugins: ['msm.resourcepack', 'msm.datapack'] };

async function exportProblems(
  bundle: TargetBundle,
  context: TargetContext,
  fs: ProjectFileSystem,
  project: Project,
  registries: RegistryIndex,
  ids: Record<string, string[]>,
  exporter: Exporter,
  options: Record<string, Json> = {},
): Promise<{
  problems: Problem[];
  ok: boolean;
  files: string[];
  contents: Map<string, Uint8Array>;
}> {
  const functionIds = mcfunctionIds(project, ids);
  const sink = createMemorySink();
  const report = await runExport({
    project,
    registry,
    target: bundle.target,
    schemaIndex: context.schemaIndex,
    registries,
    exporter,
    sink,
    readAsset: (namespace, path) => fs.readFile(`assets/${namespace}/${path}`),
    meta,
    options,
    async validateText(file) {
      if (file.language !== 'mcfunction') return [];
      const source = utf8.decode(file.contents as Uint8Array).replace(/\n$/, '');
      const found = await context.mcfunction.check(source, {
        uri: `file:///msm/${file.path}`,
        projectIds: functionIds,
      });
      return found.map(
        (problem): Problem => ({
          severity: problem.severity,
          code: problem.code,
          message: `line ${problem.line + 1}: ${problem.message}`,
          file: file.path,
        }),
      );
    },
  });
  return { problems: report.problems, ok: report.ok, files: report.files, contents: sink.files() };
}

/** Stand-ins for the runtime and GeckoLib jars, nested only by the Custom mob starter test. */
const STUB_RUNTIME_JAR = utf8.encode('PK stub msm_runtime jar');
const STUB_GECKOLIB_JAR = utf8.encode('PK stub GeckoLib jar');

/**
 * A stand-in for the host's TypeScript transpiler (ADR 0031 D5): it returns the source
 * unchanged, so the test needs no transpiler options. It is spread into the exporter options
 * so the test also compiles against an exporter without the hook.
 */
const stubTranspiler = {
  transpileScript: async (source: string, _name: string): Promise<{ js: string }> => ({
    js: source,
  }),
};

/**
 * The Fabric mod jar exporter. Most exports set `separateRuntime`, so nothing is nested; the
 * stub loaders serve the Custom mob starter test, which nests both jars.
 */
const contentJarExporter = createFabricContentJarExporter({
  loadRuntimeJar: async () => STUB_RUNTIME_JAR,
  loadGeckolibJar: async () => STUB_GECKOLIB_JAR,
  ...stubTranspiler,
});

/** Whether a project has elements of `msm:` kinds, which only the Fabric mod jar carries. */
const hasMsmElements = (project: Project): boolean =>
  project.namespaces.some((namespace) =>
    namespace.elements.some((element) => element.kind.startsWith('msm:')),
  );

/**
 * Builds, reloads, validates and exports one project; expects zero problems throughout.
 * `jarFiles` is empty for a project without `msm:` elements.
 */
async function checkProject(
  bundle: TargetBundle,
  context: TargetContext,
  built: BuiltProject,
): Promise<{ resourceFiles: string[]; dataFiles: string[]; jarFiles: string[] }> {
  const project = await reload(built.fs);
  const ids = projectRegistryIds(project);
  const registries = createRegistryIndex({ vanilla: context.vanilla, project: ids });
  expect(elementProblems(project, context.schemaIndex, registries)).toEqual([]);
  const validated = validatorProblems(project, bundle.target, registries);
  expect(validated.filter((problem) => problem.severity === 'error')).toEqual([]);
  const results: string[][] = [];
  for (const exporter of [resourcePackExporter, dataPackExporter]) {
    const report = await exportProblems(
      bundle,
      context,
      built.fs,
      project,
      registries,
      ids,
      exporter,
    );
    expect(report.problems.filter((problem) => problem.severity !== 'info')).toEqual([]);
    expect(report.ok).toBe(true);
    results.push(report.files);
  }
  let jarFiles: string[] = [];
  if (hasMsmElements(project)) {
    const report = await exportProblems(
      bundle,
      context,
      built.fs,
      project,
      registries,
      ids,
      contentJarExporter,
      { separateRuntime: true },
    );
    expect(report.problems.filter((problem) => problem.severity !== 'info')).toEqual([]);
    expect(report.ok).toBe(true);
    jarFiles = report.files;
  }
  return { resourceFiles: results[0] ?? [], dataFiles: results[1] ?? [], jarFiles };
}

// Mirror -------------------------------------------------------------------------------------

interface MirrorProject {
  folder: string;
  build(): Promise<BuiltProject>;
}

function starterById(id: string): ProjectStarter {
  const starter = libraryStarters.find((entry) => entry.id === id);
  if (starter === undefined) throw new Error(`No starter ${id}`);
  return starter;
}

const MIRROR: readonly MirrorProject[] = [
  {
    folder: 'all-kinds',
    build: () =>
      buildProject(
        'MSM Examples',
        'msm_examples',
        kindExamples.map((example) => buildEntry(example, 'msm_examples', 'MSM Examples')),
      ),
  },
  {
    folder: 'blocks-items',
    build: () =>
      buildProject(
        'MSM Blocks and Items Examples',
        'msm_examples',
        behaviourExamples.map((example) =>
          buildEntry(example, 'msm_examples', 'MSM Blocks and Items Examples'),
        ),
      ),
  },
  {
    folder: 'entities',
    build: () =>
      buildProject(
        'MSM Entity Examples',
        'msm_examples',
        entityBehaviourExamples.map((example) =>
          buildEntry(example, 'msm_examples', 'MSM Entity Examples'),
        ),
      ),
  },
  {
    folder: 'scripts',
    build: () =>
      buildProject(
        'MSM Script Examples',
        'msm_examples',
        scriptBehaviourExamples.map((example) =>
          buildEntry(example, 'msm_examples', 'MSM Script Examples'),
        ),
      ),
  },
  ...MIRRORED_STARTERS.map((id) => ({
    folder: `starters/${id}`,
    build: () => {
      const starter = starterById(id);
      return buildProject(starter.title, 'msm_starter', [
        buildEntry(starter, 'msm_starter', starter.title),
      ]);
    },
  })),
];

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
    else if (entry.isFile()) out.push(path);
  }
  return out.sort();
}

/** A read-only file system over a mirror folder. */
function diskFs(root: string): ProjectFileSystem {
  const resolve = (path: string): string => join(root, ...path.split('/'));
  const readOnly = async (): Promise<never> => {
    throw new Error('The examples mirror is read-only in tests.');
  };
  return {
    readFile: async (path) => new Uint8Array(await readFile(resolve(path))),
    async readDir(path) {
      const entries = await readdir(resolve(path), { withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile() || entry.isDirectory())
        .map((entry) => ({ name: entry.name, kind: entry.isDirectory() ? 'directory' : 'file' }));
    },
    async exists(path) {
      try {
        await stat(resolve(path));
        return true;
      } catch {
        return false;
      }
    },
    writeFile: readOnly,
    mkdirp: readOnly,
    remove: readOnly,
  };
}

// Scripts ------------------------------------------------------------------------------------

/** Every `msm:script` of the library's starters and examples, as `[label, source]`. */
function libraryScripts(): [string, string][] {
  const out: [string, string][] = [];
  const add = (label: string, bundle: ContentBundle): void => {
    for (const element of bundle.elements) {
      if (element.kind !== 'msm:script') continue;
      const lines = (element.data as { lines: string[] }).lines;
      out.push([`${label} ${element.id}`, `${lines.join('\n')}\n`]);
    }
  };
  for (const entry of [...libraryStarters, ...libraryExamples]) {
    if (entry.id === 'scripted-item') {
      for (const behaviour of SCRIPTED_BEHAVIOURS) {
        add(
          `${entry.id} (${behaviour})`,
          buildEntry(entry, 'demo', 'Demo', undefined, { behaviour }),
        );
      }
      continue;
    }
    add(entry.id, buildEntry(entry, 'demo', 'Demo'));
  }
  return out;
}

/** The syntax errors TypeScript reports for `source`. */
function syntaxErrors(source: string): string[] {
  const file = ts.createSourceFile('script.ts', source, ts.ScriptTarget.Latest, true);
  return (file as unknown as { parseDiagnostics: ts.Diagnostic[] }).parseDiagnostics.map((d) =>
    ts.flattenDiagnosticMessageText(d.messageText, '\n'),
  );
}

/**
 * Type-checks `script` against the generated typings with `lib.es5` only, as the scripting
 * plugin's own template test does.
 */
function typeCheck(script: string): string[] {
  const libDir = dirname(createRequire(import.meta.url).resolve('typescript/lib/lib.es5.d.ts'));
  const files = new Map<string, string>([
    ['/msm-runtime.d.ts', MSM_RUNTIME_TYPINGS],
    ['/script.ts', script],
  ]);
  const options: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    target: ts.ScriptTarget.ES2018,
    module: ts.ModuleKind.CommonJS,
    lib: ['lib.es5.d.ts'],
    types: [],
  };
  const host = ts.createCompilerHost(options);
  host.getDefaultLibLocation = () => libDir;
  host.getSourceFile = (fileName, languageVersion) => {
    const text =
      files.get(fileName) ?? readFileSync(join(libDir, fileName.split('/').pop() ?? ''), 'utf8');
    return ts.createSourceFile(fileName, text, languageVersion);
  };
  host.fileExists = (fileName) => files.has(fileName) || fileName.startsWith(libDir);
  host.readFile = (fileName) => files.get(fileName);
  const program = ts.createProgram(['/msm-runtime.d.ts', '/script.ts'], options, host);
  return ts
    .getPreEmitDiagnostics(program)
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
}

// Tests --------------------------------------------------------------------------------------

describe('library bundles', () => {
  it('registers with the other built-in plugins and uses only registered kinds', () => {
    const kinds = new Set(registry.all().map((kind) => kind.id));
    for (const entry of [...libraryStarters, ...libraryExamples]) {
      for (const kind of entry.requiresKinds)
        expect(kinds.has(kind), `${entry.id} ${kind}`).toBe(true);
    }
  });

  it('has one per-kind example for every registered kind', () => {
    const kinds = registry
      .all()
      .map((kind) => kind.id)
      .sort();
    expect(kindExamples.map((example: ExampleProject) => example.kind).sort()).toEqual(kinds);
  });

  it('has scripts in the Scripted ore and Scripted behaviour starters and the three script examples', () => {
    expect(libraryScripts().map(([label]) => label)).toEqual([
      'scripted_ore demo:ore_glow',
      'scripted_ore demo:ruby_block_guard',
      'scripted_ore demo:welcome',
      'scripted-item (heal) demo:ruby_wand_behaviour',
      'scripted-item (launch) demo:ruby_wand_behaviour',
      'scripted-item (lightning) demo:ruby_wand_behaviour',
      'scripted-item (effect) demo:ruby_wand_behaviour',
      'example_msm_script demo:lodestone_compass',
      'example_msm_script_schedule demo:amethyst_spiral',
      'example_msm_script_action demo:chime_handler',
      'example_msm_scripted_effect demo:antidote_handler',
      'example_msm_kill_counter demo:kill_counter',
    ]);
  });

  it.each(libraryScripts())('script %s parses and type-checks against the typings', (_, source) => {
    expect(syntaxErrors(source)).toEqual([]);
    expect(typeCheck(source)).toEqual([]);
  });

  it('builds assets the app accepts: lower-case names inside a folder, valid PNGs', () => {
    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    for (const entry of [...libraryStarters, ...libraryExamples]) {
      const bundle = buildEntry(entry, 'demo', 'Demo');
      for (const asset of bundle.assets) {
        const slash = asset.path.lastIndexOf('/');
        expect(slash, asset.path).toBeGreaterThan(0);
        expect(isProjectRelativePath(asset.path.slice(0, slash)), asset.path).toBe(true);
        expect(asset.path.slice(slash + 1), asset.path).toMatch(/^[a-z0-9_.-]+\.png$/);
        expect(asset.path.startsWith('textures/'), asset.path).toBe(true);
        expect([...asset.bytes.subarray(0, 8)], asset.path).toEqual(png);
      }
    }
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'library content (%s)',
  (_id, bundle) => {
    let context: TargetContext;

    beforeAll(async () => {
      context = await contextFor(bundle);
    }, 60_000);

    const starters = libraryStarters.filter((starter) => supported(starter, bundle.target));
    const examples = libraryExamples.filter((example) => supported(example, bundle.target));

    it('hides the entries that need GeckoLib on a target without it', () => {
      const withEntities = [...libraryStarters, ...libraryExamples].filter((entry) =>
        entry.requiresKinds.includes('msm:entity'),
      );
      expect(withEntities.map((entry) => entry.id)).toContain('custom_mob');
      for (const entry of withEntities) {
        expect(supported(entry, bundle.target), entry.id).toBe(
          bundle.target.geckolib !== undefined,
        );
      }
      expect(starters.some((starter) => starter.id === 'custom_mob')).toBe(
        bundle.target.geckolib !== undefined,
      );
    });

    it.each(starters.map((starter) => [starter.id, starter] as const))(
      'starter %s loads, validates and exports with zero problems',
      async (_starterId, starter) => {
        const built = await buildProject('Library Test', 'demo', [
          buildEntry(starter, 'demo', 'Library Test', bundle.target),
        ]);
        const files = await checkProject(bundle, context, built);
        if (starter.layers.includes('resourcepack') && starter.category !== 'blank') {
          expect(files.resourceFiles.some((path) => path.startsWith('assets/'))).toBe(true);
        }
        if (starter.layers.includes('datapack') && starter.category !== 'blank') {
          expect(files.dataFiles.some((path) => path.startsWith('data/'))).toBe(true);
        }
      },
    );

    it.each(examples.map((example) => [example.id, example] as const))(
      'example %s loads, validates and exports with zero problems',
      async (_exampleId, example) => {
        const bundleData = buildEntry(example, 'demo', 'Library Test', bundle.target);
        for (const entry of bundleData.elements) {
          expect(entry.tags, entry.id).toContain('example');
        }
        expect(bundleData.elements.some((entry) => (entry.notes ?? '').length > 0)).toBe(true);
        const built = await buildProject('Library Test', 'demo', [bundleData]);
        await checkProject(bundle, context, built);
      },
    );

    const wizardCases = starters.flatMap((starter) =>
      (starter.parameters ?? []).length === 0
        ? []
        : [
            ...(WIZARD_ALTERNATIVES[starter.id] ?? []).map(
              (values, index) =>
                [`${starter.id} alternative ${index + 1}`, starter, values] as const,
            ),
            [`${starter.id} minimums`, starter, minimumValues(starter)] as const,
          ],
    );

    it('has alternative answers for every wizard starter (ADR 0040)', () => {
      for (const starter of starters.filter((entry) => (entry.parameters ?? []).length > 0)) {
        expect(WIZARD_ALTERNATIVES[starter.id], starter.id).toBeDefined();
      }
    });

    it.each(wizardCases)(
      'wizard %s loads, validates and exports with zero problems',
      async (_label, starter, values) => {
        const built = await buildProject('Wizard Test', 'demo', [
          buildEntry(starter, 'demo', 'Wizard Test', bundle.target, values),
        ]);
        const files = await checkProject(bundle, context, built);
        const hasMod = built.project.namespaces.some((namespace) =>
          namespace.elements.some((element) => element.kind.startsWith('msm:')),
        );
        expect(files.jarFiles.length > 0, 'a jar exactly when there is mod content').toBe(hasMod);
      },
    );

    it('the 0.8.0 flows write only vanilla tags, effects and items the target has (ADR 0044 D6)', () => {
      const vanilla = (registry: string) => new Set(context.vanilla[registry] ?? []);
      const tagRegistries: Record<string, string> = {
        'minecraft:tag/item': 'tag/item',
        'minecraft:tag/enchantment': 'tag/enchantment',
      };
      const flows = [
        'status-effect',
        'throwable',
        'gear-set',
        'weapon',
        'consumable',
        'totem',
        'enchantment',
        'painting',
        'music-disc-item',
      ];
      for (const id of flows) {
        const flow = starterById(id);
        for (const values of [{}, ...(WIZARD_ALTERNATIVES[id] ?? []), minimumValues(flow)]) {
          const built = buildEntry(flow, 'demo', 'Flow', bundle.target, values);
          for (const entry of built.elements) {
            const registry = tagRegistries[entry.kind];
            if (registry !== undefined && entry.id.startsWith('minecraft:')) {
              expect(vanilla(registry).has(entry.id.slice(10)), `${id} ${entry.id}`).toBe(true);
            }
          }
          const text = JSON.stringify(built.elements);
          for (const match of text.matchAll(/"#minecraft:([a-z_/]+)"/g)) {
            const tag = match[1] as string;
            const known = ['tag/item', 'tag/enchantment', 'tag/block'].some((name) =>
              vanilla(name).has(tag),
            );
            expect(known, `${id} #minecraft:${tag}`).toBe(true);
          }
        }
      }
      const effects = vanilla('mob_effect');
      for (const parameter of starterById('consumable').parameters ?? []) {
        if (parameter.type !== 'choice' || !parameter.id.startsWith('effect_')) continue;
        for (const choice of parameter.choices) {
          if (choice.value !== 'none')
            expect(effects.has(choice.value.slice(10)), choice.value).toBe(true);
        }
      }
    });

    it('the Status effect and Throwable flows name only stats, effects, particles, blocks, items and sounds the target has (ADRs 0055, 0056)', () => {
      const vanilla = (registry: string) => new Set(context.vanilla[registry] ?? []);
      const choices = (starter: string, id: string): string[] => {
        const parameter = (starterById(starter).parameters ?? []).find((entry) => entry.id === id);
        return parameter?.type === 'choice'
          ? parameter.choices.map((choice) => choice.value).filter((value) => value.includes(':'))
          : [];
      };
      const has = (registry: string, ids: readonly string[]) => {
        expect(ids.length, registry).toBeGreaterThan(0);
        for (const id of ids) {
          expect(vanilla(registry).has(id.replace(/^minecraft:/, '')), `${registry} ${id}`).toBe(
            true,
          );
        }
      };
      has('attribute', [
        ...choices('status-effect', 'stat_1'),
        ...choices('status-effect', 'stat_2'),
      ]);
      has('particle_type', choices('status-effect', 'particle'));
      has('item', choices('status-effect', 'ingredient'));
      has('mob_effect', choices('throwable', 'hit_effect'));
      has('block', choices('throwable', 'hit_block'));
      has('item', choices('throwable', 'ingredient'));
      // Every vanilla id the built bundles name, over all answers: sounds, particles, items,
      // attributes, effects and blocks.
      const fields: Record<string, string> = {
        sound: 'sound_event',
        particle: 'particle_type',
        attribute: 'attribute',
        effect: 'mob_effect',
        state: 'block',
        converts_to: 'item',
      };
      for (const id of ['status-effect', 'throwable']) {
        const flow = starterById(id);
        for (const values of [{}, ...(WIZARD_ALTERNATIVES[id] ?? []), minimumValues(flow)]) {
          const walk = (value: unknown, key: string): void => {
            if (typeof value === 'string' && key in fields && value.startsWith('minecraft:')) {
              const registry = fields[key] as string;
              expect(vanilla(registry).has(value.slice(10)), `${id} ${key} ${value}`).toBe(true);
            } else if (Array.isArray(value)) {
              for (const item of value) walk(item, key);
            } else if (typeof value === 'object' && value !== null) {
              for (const [name, child] of Object.entries(value)) walk(child, name);
            }
          };
          for (const entry of buildEntry(flow, 'demo', 'Flow', bundle.target, values).elements) {
            walk(entry.data, '');
          }
        }
      }
    });

    it('the Status effect flow exports the effect, its icon and its drink or flask in the Fabric mod jar (ADR 0055)', async () => {
      const cases: [Record<string, Json>, string | undefined][] = [
        [{}, 'ruby_rush_tonic'],
        [{ source: 'flask' }, 'ruby_rush_flask'],
        [{ source: 'none', behaviour: 'heal' }, undefined],
      ];
      for (const [values, item] of cases) {
        const built = await buildProject('Effect', 'demo', [
          buildEntry(starterById('status-effect'), 'demo', 'Effect', bundle.target, values),
        ]);
        const { resourceFiles, jarFiles } = await checkProject(bundle, context, built);
        expect(resourceFiles).toContain('assets/demo/textures/mob_effect/ruby_rush.png');
        expect(jarFiles).toContain('msm/demo/effect/ruby_rush.json');
        expect(jarFiles).toContain('assets/demo/textures/mob_effect/ruby_rush.png');
        if (item === undefined) {
          expect(jarFiles.some((path) => path.startsWith('msm/demo/item/'))).toBe(false);
        } else {
          expect(jarFiles).toContain(`msm/demo/item/${item}.json`);
          expect(resourceFiles).toContain(`assets/demo/textures/item/${item}.png`);
        }
      }
    });

    it('the Throwable flow exports each style as an item with msm:throwable (ADR 0056)', async () => {
      for (const style of ['ball', 'knife', 'boomerang', 'bomb']) {
        const built = await buildProject('Throw', 'demo', [
          buildEntry(starterById('throwable'), 'demo', 'Throw', bundle.target, { style }),
        ]);
        const { jarFiles } = await checkProject(bundle, context, built);
        expect(jarFiles, style).toContain('msm/demo/item/ruby_knife.json');
        const knife = built.project.namespaces
          .flatMap((namespace) => namespace.elements)
          .find((element) => element.id === 'demo:ruby_knife');
        expect(JSON.stringify(knife?.data), style).toContain('msm:throwable');
      }
    });

    it('the Painting flow writes the picked PNG unchanged and a placeholder otherwise (ADR 0044 D7)', async () => {
      const image = pngDataUrl(32, 32);
      const built = await buildProject('Painting', 'demo', [
        buildEntry(starterById('painting'), 'demo', 'Painting', bundle.target, {
          painting_name: 'Grey Square',
          image,
        }),
      ]);
      const { resourceFiles, dataFiles, jarFiles } = await checkProject(bundle, context, built);
      const { resource, data } = bundle.target.folders;
      expect(resourceFiles).toContain(`assets/demo/${resource.textures}/painting/grey_square.png`);
      expect(dataFiles).toContain(`data/demo/${data.painting_variant}/grey_square.json`);
      expect(jarFiles).toEqual([]);
      const bytes = await built.fs.readFile('assets/demo/textures/painting/grey_square.png');
      expect(Buffer.from(bytes).toString('base64')).toBe(
        image.slice('data:image/png;base64,'.length),
      );
    });

    it('the Music disc and Weapon flows export real items in the Fabric mod jar (ADR 0044 D6)', async () => {
      const disc = buildEntry(starterById('music-disc-item'), 'demo', 'Gear', bundle.target);
      const bow = buildEntry(starterById('weapon'), 'demo', 'Gear', bundle.target, {
        weapon_type: 'bow',
      });
      // Both flows add the pack, the mod metadata and a language file: keep the disc's.
      const shared = new Set(['demo:pack', 'demo:mod', 'demo:en_us']);
      const built = await buildProject('Gear', 'demo', [
        disc,
        { elements: bow.elements.filter((entry) => !shared.has(entry.id)), assets: bow.assets },
      ]);
      const { dataFiles, jarFiles } = await checkProject(bundle, context, built);
      const { data } = bundle.target.folders;
      expect(dataFiles).toContain(`data/demo/${data.jukebox_song}/ruby_waltz.json`);
      expect(jarFiles).toEqual(
        expect.arrayContaining([
          'msm/demo/item/ruby_waltz_disc.json',
          'msm/demo/item/ruby_spear.json',
        ]),
      );
    });

    it('the Custom sword starter exports a sword in the Fabric mod jar (ADR 0040)', async () => {
      const built = await buildProject('Sword', 'demo', [
        buildEntry(starterById('custom-sword'), 'demo', 'Sword', bundle.target),
      ]);
      const { resourceFiles, dataFiles, jarFiles } = await checkProject(bundle, context, built);
      const { resource, data } = bundle.target.folders;
      expect(resourceFiles).toContain(`assets/demo/${resource.model}/item/ruby_sword.json`);
      expect(resourceFiles).toContain('assets/demo/textures/item/ruby_sword.png');
      expect(dataFiles).toContain(`data/demo/${data.recipe}/ruby_sword_from_emerald.json`);
      expect(jarFiles).toContain('msm/demo/item/ruby_sword.json');
      expect(jarFiles).toContain('fabric.mod.json');
    });

    it('the Gear set writes only vanilla item tags and block tags the target has (ADR 0043 D2)', () => {
      const itemTags = new Set(context.vanilla['tag/item'] ?? []);
      const blockTags = new Set(context.vanilla['tag/block'] ?? []);
      const gearSet = starterById('gear-set');
      const answers = [{}, ...(WIZARD_ALTERNATIVES['gear-set'] ?? []), minimumValues(gearSet)];
      for (const values of answers) {
        const gear = buildEntry(gearSet, 'demo', 'Gear', bundle.target, values);
        for (const entry of gear.elements) {
          if (entry.kind === 'minecraft:tag/item' && entry.id.startsWith('minecraft:')) {
            expect(itemTags.has(entry.id.slice('minecraft:'.length)), entry.id).toBe(true);
          }
          const tier = (entry.data as { components?: { 'msm:tool'?: { tier?: unknown } } })
            .components?.['msm:tool']?.tier;
          if (typeof tier === 'object' && tier !== null) {
            const tag = (tier as { incorrect_blocks_for_drops: string }).incorrect_blocks_for_drops;
            expect(blockTags.has(tag.slice('#minecraft:'.length)), tag).toBe(true);
          }
        }
      }
    });

    it('the Gear set exports tools, armour and the equipment asset in the Fabric mod jar (ADR 0043 D2)', async () => {
      const built = await buildProject('Gear', 'demo', [
        buildEntry(starterById('gear-set'), 'demo', 'Gear', bundle.target),
      ]);
      const { resourceFiles, dataFiles, jarFiles } = await checkProject(bundle, context, built);
      const { resource, data } = bundle.target.folders;
      expect(resourceFiles).toEqual(
        expect.arrayContaining([
          'assets/demo/equipment/ruby_armor.json',
          `assets/demo/${resource.textures}/entity/equipment/humanoid/ruby.png`,
          `assets/demo/${resource.textures}/entity/equipment/humanoid_leggings/ruby.png`,
          `assets/demo/${resource.model}/item/ruby_pickaxe.json`,
        ]),
      );
      expect(dataFiles).toEqual(
        expect.arrayContaining([
          `data/demo/${data.recipe}/ruby_helmet_from_ruby.json`,
          `data/minecraft/${data.tags}/item/swords.json`,
          `data/minecraft/${data.tags}/item/head_armor.json`,
          `data/demo/${data.tags}/item/ruby_repair_materials.json`,
        ]),
      );
      expect(jarFiles).toEqual(
        expect.arrayContaining([
          'msm/demo/item/ruby_sword.json',
          'msm/demo/item/ruby_helmet.json',
          'msm/demo/block/ruby_ore.json',
          'assets/demo/equipment/ruby_armor.json',
          'fabric.mod.json',
        ]),
      );
    });

    it('the Custom ore starter adds a real ruby ore, ruby and block of ruby (ADR 0025)', async () => {
      const built = await buildProject('Ore', 'demo', [
        buildEntry(starterById('custom_ore'), 'demo', 'Ore', bundle.target),
      ]);
      const { resourceFiles, dataFiles, jarFiles } = await checkProject(bundle, context, built);
      const resource = bundle.target.folders.resource;
      const data = bundle.target.folders.data;
      const assets = [
        `assets/demo/${resource.textures}/block/ruby_ore.png`,
        `assets/demo/${resource.textures}/block/ruby_block.png`,
        `assets/demo/${resource.textures}/item/ruby.png`,
        `assets/demo/${resource.block_definition}/ruby_ore.json`,
        `assets/demo/${resource.block_definition}/ruby_block.json`,
        `assets/demo/${resource.item_definition}/ruby_ore.json`,
        `assets/demo/${resource.item_definition}/ruby_block.json`,
        `assets/demo/${resource.item_definition}/ruby.json`,
        `assets/demo/${resource.lang}/en_us.json`,
      ];
      const datafiles = [
        `data/demo/${data.loot_table}/blocks/ruby_ore.json`,
        `data/demo/${data.loot_table}/blocks/ruby_block.json`,
        `data/demo/${data.recipe}/ruby_block_from_rubies.json`,
        `data/demo/${data.recipe}/ruby_from_block.json`,
        `data/demo/${data.recipe}/ruby_from_smelting.json`,
        `data/demo/${data.advancement}/root.json`,
        `data/demo/${data.advancement}/get_ruby.json`,
        `data/minecraft/${data.tags}/block/mineable/pickaxe.json`,
        `data/minecraft/${data.tags}/block/needs_iron_tool.json`,
      ];
      expect(resourceFiles).toEqual(expect.arrayContaining([...assets, 'pack.mcmeta']));
      expect(dataFiles).toEqual(expect.arrayContaining([...datafiles, 'pack.mcmeta']));
      // Nothing is overridden in the minecraft namespace of the resource pack any more.
      expect(resourceFiles.some((path) => path.startsWith('assets/minecraft/'))).toBe(false);
      // The vanilla packs leave the runtime definitions out; the mod jar carries everything.
      for (const files of [resourceFiles, dataFiles]) {
        expect(files.some((path) => path.startsWith('msm/'))).toBe(false);
        expect(files).not.toContain('fabric.mod.json');
      }
      expect(jarFiles).toEqual(
        expect.arrayContaining([
          ...assets,
          ...datafiles,
          'msm/demo/block/ruby_ore.json',
          'msm/demo/block/ruby_block.json',
          'msm/demo/item/ruby.json',
          'fabric.mod.json',
        ]),
      );
      expect(jarFiles).not.toContain('pack.mcmeta');
      // It generates (ADR 0060 D6): the feature files go into the data pack and the jar, the
      // biome addition into the jar only (D7).
      const worldgen = [
        `data/demo/${data.worldgen}/feature/ore_ruby.json`,
        `data/demo/${data.worldgen}/placed_feature/ore_ruby_placed.json`,
      ];
      expect(dataFiles).toEqual(expect.arrayContaining(worldgen));
      expect(jarFiles).toEqual(
        expect.arrayContaining([...worldgen, 'msm/demo/biome_addition/ruby_ore_generation.json']),
      );
    });

    it('the Custom ore starter with generate off exports nothing of world generation (ADR 0060 D6)', async () => {
      const built = await buildProject('Ore', 'demo', [
        buildEntry(starterById('custom_ore'), 'demo', 'Ore', bundle.target, { generate: false }),
      ]);
      const { dataFiles, jarFiles } = await checkProject(bundle, context, built);
      for (const files of [dataFiles, jarFiles]) {
        expect(files.filter((path) => /ore_ruby|biome_addition/.test(path))).toEqual([]);
      }
    });

    it('the Extra drop flow names only loot tables the target has and exports to the jar only (ADR 0060 D6)', async () => {
      const tables = new Set(context.vanilla.loot_table ?? []);
      for (const id of EXTRA_DROP_TABLES) expect(tables.has(id.slice(10)), id).toBe(true);
      const built = await buildProject('Drop', 'demo', [
        buildEntry(starterById('extra-drop'), 'demo', 'Drop', bundle.target),
      ]);
      const { resourceFiles, dataFiles, jarFiles } = await checkProject(bundle, context, built);
      for (const files of [resourceFiles, dataFiles]) {
        expect(files.some((path) => path.startsWith('msm/'))).toBe(false);
      }
      expect(jarFiles).toEqual(
        expect.arrayContaining([
          'msm/demo/loot_addition/zombie_drops_emerald.json',
          'fabric.mod.json',
        ]),
      );
    });

    it('the Scripted ore starter exports its scripts in the Fabric mod jar only (ADRs 0031, 0032)', async () => {
      const built = await buildProject('Scripted', 'demo', [
        buildEntry(starterById('scripted_ore'), 'demo', 'Scripted', bundle.target),
      ]);
      const { resourceFiles, dataFiles, jarFiles } = await checkProject(bundle, context, built);
      for (const files of [resourceFiles, dataFiles]) {
        expect(files.some((path) => path.startsWith('msm/'))).toBe(false);
      }
      const scripts = ['ore_glow', 'ruby_block_guard', 'welcome'];
      // With the exporter's transpileScript hook (B136) the jar holds `.js`; without it, `.ts`.
      const extension = jarFiles.includes('msm/demo/script/ore_glow.js') ? 'js' : 'ts';
      expect(jarFiles).toEqual(
        expect.arrayContaining([
          ...scripts.map((name) => `msm/demo/script/${name}.${extension}`),
          'msm/demo/block/ruby_ore.json',
          'msm/demo/block/ruby_block.json',
          'msm/demo/item/ruby.json',
          'fabric.mod.json',
        ]),
      );
      if (extension === 'js') {
        expect(jarFiles.filter((path) => path.endsWith('.ts'))).toEqual([]);
      }

      const project = await reload(built.fs);
      const ids = projectRegistryIds(project);
      const registries = createRegistryIndex({ vanilla: context.vanilla, project: ids });
      const report = await exportProblems(
        bundle,
        context,
        built.fs,
        project,
        registries,
        ids,
        contentJarExporter,
        { separateRuntime: true },
      );
      const json = (path: string): Record<string, unknown> =>
        JSON.parse(utf8.decode(report.contents.get(path) as Uint8Array));
      expect(json('msm/demo/block/ruby_block.json')).toMatchObject({
        components: { 'msm:on_step': { event: 'demo:ruby_block_step', cooldown_ticks: 20 } },
        events: {
          'demo:ruby_block_step': { actions: [{ type: 'run_script', handler: 'demo:guard' }] },
        },
      });
      const guard = utf8.decode(
        report.contents.get(`msm/demo/script/ruby_block_guard.${extension}`) as Uint8Array,
      );
      expect(guard).toContain('msm.actions.define("demo:guard"');
    });

    it.runIf(bundle.target.geckolib !== undefined)(
      'the Custom mob starter adds an animated Ruby Golem; the jar nests runtime and GeckoLib (ADRs 0028, 0029)',
      async () => {
        const built = await buildProject('Mob', 'demo', [
          buildEntry(starterById('custom_mob'), 'demo', 'Mob', bundle.target),
        ]);
        const { resourceFiles, dataFiles, jarFiles } = await checkProject(bundle, context, built);
        const resource = bundle.target.folders.resource;
        const data = bundle.target.folders.data;
        const assets = [
          `assets/demo/${resource.textures}/entity/ruby_golem.png`,
          `assets/demo/${resource.textures}/item/ruby_golem_spawn_egg.png`,
          'assets/demo/geckolib/models/entity/ruby_golem.geo.json',
          'assets/demo/geckolib/animations/entity/ruby_golem_animations.animation.json',
          `assets/demo/${resource.item_definition}/ruby_golem_spawn_egg.json`,
          `assets/demo/${resource.model}/item/ruby_golem_spawn_egg.json`,
          `assets/demo/${resource.lang}/en_us.json`,
        ];
        const datafiles = [
          `data/demo/${data.loot_table}/entities/ruby_golem.json`,
          `data/demo/${data.function}/golem/death.mcfunction`,
        ];
        expect(resourceFiles).toEqual(expect.arrayContaining([...assets, 'pack.mcmeta']));
        expect(dataFiles).toEqual(expect.arrayContaining([...datafiles, 'pack.mcmeta']));
        expect(jarFiles).toEqual(
          expect.arrayContaining([
            ...assets,
            ...datafiles,
            'msm/demo/entity/ruby_golem.json',
            'fabric.mod.json',
          ]),
        );
        expect(jarFiles.some((path) => path.startsWith('META-INF/jars/'))).toBe(false);

        // Nested: the stub runtime and GeckoLib jars go into META-INF/jars/.
        const geckolib = bundle.target.geckolib;
        if (geckolib === undefined) throw new Error(`${bundle.target.id} lacks GeckoLib facts`);
        const project = await reload(built.fs);
        const ids = projectRegistryIds(project);
        const registries = createRegistryIndex({ vanilla: context.vanilla, project: ids });
        const nested = await exportProblems(
          bundle,
          context,
          built.fs,
          project,
          registries,
          ids,
          contentJarExporter,
        );
        expect(nested.problems.filter((problem) => problem.severity !== 'info')).toEqual([]);
        expect(nested.ok).toBe(true);
        const geckolibPath = nestedGeckolibPath(geckolib);
        const runtimePath = nestedRuntimePath(meta.msmVersion);
        expect(nested.contents.get(geckolibPath)).toEqual(STUB_GECKOLIB_JAR);
        expect(nested.contents.get(runtimePath)).toEqual(STUB_RUNTIME_JAR);
        const json = (path: string): Record<string, unknown> =>
          JSON.parse(utf8.decode(nested.contents.get(path) as Uint8Array));
        const modJson = json('fabric.mod.json');
        expect(modJson).toMatchObject({
          id: 'demo',
          depends: { [geckolib.modId]: geckolib.dependency },
        });
        expect(modJson.jars).toEqual(
          expect.arrayContaining([{ file: runtimePath }, { file: geckolibPath }]),
        );
        expect(json('msm/demo/entity/ruby_golem.json')).toMatchObject({
          format: 1,
          category: 'creature',
          loot_table: 'demo:entities/ruby_golem',
          spawn_egg: {},
          components: {
            'msm:animated_model': {
              model: 'demo:entity/ruby_golem',
              animations: 'demo:entity/ruby_golem_animations',
              texture: 'demo:entity/ruby_golem',
            },
          },
        });
        expect(json(`assets/demo/${resource.lang}/en_us.json`)).toMatchObject({
          'entity.demo.ruby_golem': 'Ruby Golem',
          'item.demo.ruby_golem_spawn_egg': 'Ruby Golem Spawn Egg',
        });
      },
    );

    // The mirror projects are written for the default target (their `targets`), so they are
    // checked against it only.
    it
      .runIf(bundle.target.id === DEFAULT_TARGET)
      .each(MIRROR.map((entry) => [entry.folder, entry] as const))(
      'mirror project %s loads, validates and exports with zero problems',
      async (_folder, entry) => {
        await checkProject(bundle, context, await entry.build());
      },
    );
  },
);

describe('examples/ mirror', () => {
  it.each(MIRROR.map((entry) => [entry.folder, entry] as const))(
    '%s equals the generated project',
    async (folder, entry) => {
      const root = join(examplesRoot, ...folder.split('/'));
      const { fs } = await entry.build();
      const generated = fs.snapshot();
      if (update) {
        await rm(root, { recursive: true, force: true });
        for (const [path, bytes] of Object.entries(generated)) {
          const file = join(root, ...path.split('/'));
          await mkdir(dirname(file), { recursive: true });
          await writeFile(file, bytes);
        }
      }
      expect(await listFiles(root)).toEqual(Object.keys(generated).sort());
      for (const [path, bytes] of Object.entries(generated)) {
        const onDisk = new Uint8Array(await readFile(join(root, ...path.split('/'))));
        expect(Buffer.from(onDisk).equals(Buffer.from(bytes)), path).toBe(true);
      }
      // It opens in the app as it is, with zero load problems.
      await reload(diskFs(root));
    },
  );

  it('the Custom ore starter with generate off equals the mirror without its world generation (ADR 0060 D6)', async () => {
    const root = join(examplesRoot, 'starters', 'custom_ore');
    const starter = starterById('custom_ore');
    const { fs } = await buildProject(starter.title, 'msm_starter', [
      buildEntry(starter, 'msm_starter', starter.title, DEFAULT_BUNDLE.target, { generate: false }),
    ]);
    const generated = fs.snapshot();
    const worldgen = [
      'content/msm_starter/worldgen/feature/ore_ruby.json',
      'content/msm_starter/worldgen/placed_feature/ore_ruby_placed.json',
      'content/msm_starter/biome_addition/ruby_ore_generation.json',
    ];
    const onDisk = await listFiles(root);
    expect(onDisk).toEqual(expect.arrayContaining(worldgen));
    expect(Object.keys(generated).sort()).toEqual(
      onDisk.filter((path) => !worldgen.includes(path)),
    );
    for (const [path, bytes] of Object.entries(generated)) {
      const file = new Uint8Array(await readFile(join(root, ...path.split('/'))));
      expect(Buffer.from(file).equals(Buffer.from(bytes)), path).toBe(true);
    }
  });
});
