/**
 * The "Popular ideas" examples: things people like to make with mods, chosen from research into
 * the most downloaded mods and data packs and the order beginner tutorials teach (an ore with a
 * tool and armour tier, a tameable dragon mount, cosy furniture, a cooking stove, an item
 * magnet, a dungeon with a mini-boss, a dimension with a portal, a boomerang, a glider, rocket
 * boots, a fruit tree, spell scrolls, a coordinates bar) and three interim vehicles made as
 * rideable mobs with a script (a go-kart, a mini tank and a biplane) until a vehicle kind
 * exists. Names are original; each description ends with the theme it is inspired by, never a
 * mod's name.
 *
 * Most are built from the Creator flows with answers of their own, without the pack and mod
 * elements (an example is copied into a project that has them already), plus the hand-written
 * pieces around them; behaviour is written as rule books (`msm:rules`, ADR 0082) where the
 * Rules catalogue has the steps, and as scripts where it has not. Every example adds mod
 * content, so they work in the Fabric mod jar export only; the vanilla packs keep what names
 * vanilla things alone (ADR 0066). Each example is mirrored as its own project under
 * `examples/popular/<name>/`.
 */
import type {
  BundleContext,
  ContentBundle,
  ContentBundleElement,
  ExampleProject,
  Json,
  JsonObject,
} from '@msm/plugin-api';
import type { Rgb } from '../assets/png';
import { COLOURS, concatBundles, element, itemModel, KINDS, rl, texture } from '../content/bundle';
import { dropLoot, PROJECTILES, rangedAttack } from '../content/mob-flows';
import { hexFromRgb } from '../content/parameters';
import { BoxBuilder, saltFor, singlePiece } from '../content/structures';
import { hasFabric } from '../content/supports';
import { bossBundle } from '../starters/boss';
import { customBiomeContent, customBiomeIds } from '../starters/custom-biome';
import { customOreBundle } from '../starters/custom-ore';
import { gearSetBundle } from '../starters/gear-set';
import { machineBundle } from '../starters/machine';
import { mountBundle } from '../starters/mount';
import { portalBundle } from '../starters/portal';
import { storageCrateBundle } from '../starters/storage-crate';
import { throwableBundle } from '../starters/throwable';
import { treeBundle } from '../starters/tree';
import { woodSetBundle } from '../starters/wood-set';
import { defineExample } from './define';
import { presetMob } from './entities';
import { RULES_KIND } from './rules';

/** The gallery category of these examples. */
export const POPULAR_CATEGORY = 'Popular ideas';

/** The note every interim vehicle carries. */
const INTERIM_VEHICLE =
  'An interim vehicle: a rideable mob with a script, until MSM has a vehicle kind.';

/** The library palette's colours these examples use (placeholders come only from it). */
const GLOW = COLOURS.frost;
const EMBER = COLOURS.ruby;
const PLUM = COLOURS.violet;
const MOSS = COLOURS.jade;
const CANVAS = COLOURS.wood;
/** Willow wood: a pale green-grey (B539). */
const WILLOW: Rgb = [150, 160, 112];

/** Rule book data with its counters. */
const book = (rules: Json[], counters: Json[] = []): Json => ({ counters, format: 1, rules });

/** A Creator flow's bundle for `values`, without its `pack.mcmeta` and `msm:mod` elements. */
function flow(
  build: (context: BundleContext) => ContentBundle,
  context: BundleContext,
  values: Readonly<Record<string, Json>>,
): ContentBundle {
  const bundle = build({ ...context, values: { ...values } });
  return {
    elements: bundle.elements.filter(
      (entry) => entry.kind !== KINDS.pack && entry.kind !== KINDS.mod,
    ),
    assets: bundle.assets,
  };
}

/** Only the elements of `bundle` whose kind is one of `kinds` (and no assets). */
function onlyKinds(bundle: ContentBundle, kinds: readonly string[]): ContentBundle {
  return { elements: bundle.elements.filter((entry) => kinds.includes(entry.kind)), assets: [] };
}

/** `bundle` without the elements of `kinds`. */
function withoutKinds(bundle: ContentBundle, kinds: readonly string[]): ContentBundle {
  return {
    elements: bundle.elements.filter((entry) => !kinds.includes(entry.kind)),
    assets: bundle.assets,
  };
}

/**
 * `bundle` with the data of element `id` changed by `change` (on a copy) and, when given, its
 * notes replaced.
 */
function patch(
  bundle: ContentBundle,
  id: string,
  change: (data: JsonObject) => JsonObject,
  notes?: string,
): ContentBundle {
  let found = false;
  const elements = bundle.elements.map((entry): ContentBundleElement => {
    if (entry.id !== id) return entry;
    found = true;
    const next: ContentBundleElement = {
      ...entry,
      data: change(structuredClone(entry.data) as JsonObject),
    };
    if (notes !== undefined) next.notes = notes;
    return next;
  });
  if (!found) throw new Error(`No element ${id} to change.`);
  return { elements, assets: bundle.assets };
}

/** The components object of element data, created when missing. */
function componentsOf(data: JsonObject): JsonObject {
  const existing = data.components;
  const components =
    existing !== undefined && existing !== null && typeof existing === 'object'
      ? (existing as JsonObject)
      : {};
  data.components = components;
  return components;
}

/** A plain item `<ns>:<path>` with its flat or handheld model and a placeholder texture. */
function simpleItem(
  namespace: string,
  path: string,
  data: JsonObject,
  notes: string,
  picture: { pattern: Parameters<typeof texture>[2]; colour: Rgb },
  handheld = false,
): ContentBundle {
  const parent = handheld ? 'minecraft:item/handheld' : 'minecraft:item/generated';
  return {
    elements: [
      element(
        rl(namespace, path),
        KINDS.item,
        { format: 1, model: rl(namespace, `item/${path}`), ...data },
        notes,
      ),
      itemModel(
        namespace,
        path,
        parent,
        `A ${handheld ? 'handheld' : 'flat'} item model drawn from textures/item/${path}.png.`,
      ),
    ],
    assets: [texture(namespace, `item/${path}`, picture.pattern, picture.colour)],
  };
}

/** A food item that leaves a bowl, as vanilla stews do. */
function stew(
  namespace: string,
  path: string,
  name: string,
  colour: Rgb,
  nutrition: number,
  saturation: number,
  extra: string,
  effect?: JsonObject,
): ContentBundle {
  return simpleItem(
    namespace,
    path,
    {
      display_name: name,
      max_stack_size: 1,
      creative_tab: 'minecraft:food_and_drinks',
      components: {
        'msm:food': { nutrition, saturation },
        'msm:consumable': {
          seconds: 1.6,
          animation: 'eat',
          converts_to: 'minecraft:bowl',
          ...(effect === undefined ? {} : { effects: [effect] }),
        },
      },
    },
    `${name}: msm:food restores ${nutrition} hunger with saturation ${saturation}, and msm:consumable leaves a bowl behind, as a vanilla stew does (converts_to)${extra}. It stacks to one.`,
    { pattern: 'egg', colour },
  );
}

/** One rule of a book. */
function rule(key: string, name: string, when: JsonObject, steps: Json[], onlyIf?: Json[]): Json {
  return {
    do: steps,
    key,
    name,
    ...(onlyIf === undefined ? {} : { only_if: { conditions: onlyIf, match: 'all' } }),
    when,
  };
}

/** A block model of pixel boxes, every face drawn from one texture. */
function boxModel(namespace: string, path: string, boxes: number[][], notes: string) {
  const textureId = rl(namespace, `block/${path}`);
  const faces = Object.fromEntries(
    ['down', 'up', 'north', 'south', 'west', 'east'].map((face) => [face, { texture: '#all' }]),
  );
  return element(
    rl(namespace, `block/${path}`),
    KINDS.model,
    {
      parent: 'minecraft:block/block',
      textures: { all: textureId, particle: textureId },
      elements: boxes.map((box) => ({
        from: box.slice(0, 3),
        to: box.slice(3, 6),
        faces: structuredClone(faces),
      })),
    },
    notes,
  );
}

// Glowshard -----------------------------------------------------------------------------------

function glowshard(context: BundleContext): ContentBundle {
  const { namespace } = context;
  const colour = hexFromRgb(GLOW);
  const ore = rl(namespace, 'glowshard_ore');
  const shard = rl(namespace, 'glowshard');
  const pickaxe = rl(namespace, 'glowshard_pickaxe');
  const pieces = ['helmet', 'chestplate', 'leggings', 'boots'].map((piece) =>
    rl(namespace, `glowshard_${piece}`),
  );
  const root = rl(namespace, 'glowshard/root');
  let gear = flow(gearSetBundle, context, {
    material_name: 'Glowshard',
    colour,
    trim_material: true,
  });
  gear = patch(gear, ore, (data) => {
    componentsOf(data)['msm:light_emitter'] = { level: 7 };
    return data;
  });
  // The Custom ore flow's world generation for the same ore id: the ore feature, the placed
  // feature and the world addition that puts it in every overworld biome.
  const generation = onlyKinds(
    flow(customOreBundle, context, {
      ore_name: 'Glowshard',
      colour,
      vein_size: 5,
      veins_per_chunk: 5,
      min_y: -48,
      max_y: 24,
    }),
    [KINDS.feature, KINDS.placedFeature, KINDS.biomeAddition],
  );
  const has = (item: string): JsonObject => ({
    trigger: 'minecraft:inventory_changed',
    conditions: { items: [{ items: item }] },
  });
  const advancements: ContentBundle = {
    elements: [
      element(
        root,
        KINDS.advancement,
        {
          criteria: { has_glowshard: has(shard) },
          display: {
            icon: { id: shard },
            title: 'Glowshard',
            description: 'Mine a glowing shard deep underground',
            background: 'minecraft:gui/advancements/backgrounds/stone',
            frame: 'task',
            show_toast: false,
            announce_to_chat: false,
          },
        },
        `The root of a Glowshard tab in the advancements screen: it has a background and no parent, and is granted when a glowshard first enters the inventory. The other advancements name it as their parent.`,
      ),
      element(
        rl(namespace, 'glowshard/bright_idea'),
        KINDS.advancement,
        {
          parent: root,
          criteria: { has_pickaxe: has(pickaxe) },
          display: {
            icon: { id: pickaxe },
            title: 'Bright Idea',
            description: 'Make a Glowshard Pickaxe',
            frame: 'task',
          },
        },
        'Granted the first time a Glowshard Pickaxe is in the inventory.',
      ),
      element(
        rl(namespace, 'glowshard/lit_from_within'),
        KINDS.advancement,
        {
          parent: rl(namespace, 'glowshard/bright_idea'),
          criteria: Object.fromEntries(
            pieces.map((piece) => [`has_${piece.slice(piece.indexOf(':') + 11)}`, has(piece)]),
          ),
          display: {
            icon: { id: pieces[1] as string },
            title: 'Lit from Within',
            description: 'Have every piece of Glowshard armour',
            frame: 'challenge',
          },
        },
        'A challenge: it has one criterion per armour piece, and without requirements all of them must be met, so it is granted once all four pieces have been in the inventory.',
      ),
    ],
    assets: [],
  };
  return concatBundles(gear, generation, advancements);
}

// Ember drake ---------------------------------------------------------------------------------

function emberDrake(context: BundleContext): ContentBundle {
  const { namespace } = context;
  const drake = rl(namespace, 'ember_drake');
  const fireball = PROJECTILES.find((entry) => entry.value === 'minecraft:fire_charge');
  if (fireball === undefined) throw new Error('No fire charge projectile.');
  const mount = flow(mountBundle, context, {
    mount_name: 'Ember Drake',
    preset: 'quadruped',
    colour: hexFromRgb(EMBER),
    needs_saddle: true,
    speed: 0.3,
    jump: 0,
    owner_only: true,
    flying: true,
    health: 40,
    spawn_biomes: 'nowhere',
  });
  return patch(
    mount,
    drake,
    (data) => {
      const components = componentsOf(data);
      components['msm:movement'] = {
        ...(components['msm:movement'] as JsonObject),
        fire_immune: true,
        follow_range: 24,
      };
      components['msm:tameable'] = {
        items: ['minecraft:beef', 'minecraft:porkchop', 'minecraft:mutton', 'minecraft:chicken'],
        chance: 0.33,
        sit: false,
        follows_owner: true,
        defends_owner: true,
      };
      components['msm:ranged_attack'] = rangedAttack(fireball, {
        damage: 0,
        interval: 50,
        range: 16,
      });
      components['msm:ai_goals'] = {
        goals: [
          {
            type: 'ranged_attack',
            speed: 1,
            targets: ['minecraft:zombie', 'minecraft:skeleton', 'minecraft:creeper'],
            retaliate: true,
          },
          { type: 'wander', speed: 0.7 },
          { type: 'look_at_player', distance: 8 },
          { type: 'look_around' },
        ],
      };
      data.sounds = {
        ambient: 'minecraft:entity.blaze.ambient',
        hurt: 'minecraft:entity.blaze.hurt',
        death: 'minecraft:entity.blaze.death',
      };
      return data;
    },
    `A tameable flying mount from the Mount flow (quadruped preset, flying, only its owner steers). msm:tameable tames it one time in three with raw beef, porkchop, mutton or chicken; once tamed it follows its owner and defends them (follows_owner, defends_owner). Its owner rides it with an empty hand and steers it once it wears a vanilla saddle: it flies along the rider's view and rises while jump is held. msm:ranged_attack shoots vanilla fire charges every two and a half seconds, and the ranged_attack goal aims them at zombies, skeletons and creepers within 16 blocks and at anything that hurts it (retaliate). It is fire immune, uses the blaze's sounds and never spawns on its own: hatch it from its spawn egg.`,
  );
}

// Cottage furniture ---------------------------------------------------------------------------

const SITTING_NOTE =
  'Sitting on furniture is out of scope: MSM has no seat yet, so the stool is for looks.';

function cottageFurniture(context: BundleContext): ContentBundle {
  const { namespace } = context;
  const legs = (top: number, inset: number, size: number): number[][] =>
    [
      [inset, inset],
      [16 - inset - size, inset],
      [inset, 16 - inset - size],
      [16 - inset - size, 16 - inset - size],
    ].map(([x, z]) => [
      x as number,
      0,
      z as number,
      (x as number) + size,
      top,
      (z as number) + size,
    ]);
  const pieces: {
    path: string;
    name: string;
    boxes: number[][];
    pattern: Parameters<typeof texture>[2];
    colour: Rgb;
    light?: number;
    recipe: { pattern: string[]; key: Record<string, string>; count: number };
    words: string;
  }[] = [
    {
      path: 'cottage_table',
      name: 'Cottage Table',
      boxes: [[0, 13, 0, 16, 16, 16], ...legs(13, 1, 2)],
      pattern: 'planks',
      colour: COLOURS.wood,
      recipe: {
        pattern: ['PPP', 'S S', 'S S'],
        key: { P: '#minecraft:planks', S: 'minecraft:stick' },
        count: 1,
      },
      words: 'a table top three pixels thick on four legs',
    },
    {
      path: 'cottage_stool',
      name: 'Cottage Stool',
      boxes: [[3, 7, 3, 13, 9, 13], ...legs(7, 4, 2)],
      pattern: 'planks',
      colour: COLOURS.wood,
      recipe: {
        pattern: ['PPP', 'S S'],
        key: { P: '#minecraft:planks', S: 'minecraft:stick' },
        count: 2,
      },
      words: `a round seat on four short legs. ${SITTING_NOTE}`,
    },
    {
      path: 'cottage_lamp',
      name: 'Cottage Lamp',
      boxes: [
        [5, 0, 5, 11, 2, 11],
        [7, 2, 7, 9, 8, 9],
        [4, 8, 4, 12, 14, 12],
      ],
      pattern: 'plain',
      colour: COLOURS.amber,
      light: 15,
      recipe: {
        pattern: ['G', 'S', 'P'],
        key: { G: 'minecraft:glowstone_dust', S: 'minecraft:stick', P: '#minecraft:wooden_slabs' },
        count: 1,
      },
      words: 'a foot, a post and a shade that gives light of level 15, as glowstone does',
    },
  ];
  const elements: ContentBundleElement[] = [];
  const assets = [];
  for (const piece of pieces) {
    const id = rl(namespace, piece.path);
    const model = rl(namespace, `block/${piece.path}`);
    elements.push(
      element(
        id,
        KINDS.block,
        {
          format: 1,
          model,
          display_name: piece.name,
          sound_type: 'wood',
          loot: 'self',
          item: { creative_tab: 'minecraft:functional_blocks' },
          components: {
            'msm:breakable': { hardness: 1.5, resistance: 3, tool: 'axe' },
            'msm:shape': { preset: 'custom', boxes: piece.boxes },
            'msm:flammable': { burn_odds: 5, ignite_odds: 20 },
            ...(piece.light === undefined ? {} : { 'msm:light_emitter': { level: piece.light } }),
          },
        },
        `The ${piece.name.toLowerCase()}: ${piece.words}. msm:shape with custom boxes (in pixels, 0 to 16) gives it the same outline and collision as its model, so it is see-through where it is empty, and it drops itself. msm:flammable lets fire burn it as it burns planks.`,
      ),
      boxModel(
        namespace,
        piece.path,
        piece.boxes,
        `The ${piece.name.toLowerCase()}'s block model: one element per box of its shape, every face drawn from textures/block/${piece.path}.png.`,
      ),
      element(
        rl(namespace, `${piece.path}_from_planks`),
        KINDS.recipe,
        {
          type: 'minecraft:crafting_shaped',
          category: 'building',
          pattern: piece.recipe.pattern,
          key: piece.recipe.key,
          result: { id, count: piece.recipe.count },
        },
        `A shaped recipe for the ${piece.name.toLowerCase()}; #minecraft:planks and #minecraft:wooden_slabs take any wood.`,
      ),
    );
    assets.push(texture(namespace, `block/${piece.path}`, piece.pattern, piece.colour));
  }
  const crate = flow(storageCrateBundle, context, {
    crate_name: 'Cottage Crate',
    look: 'wood',
    colour: hexFromRgb(COLOURS.wood),
  });
  return concatBundles({ elements, assets }, crate);
}

// Camp stove ----------------------------------------------------------------------------------

function campStove(context: BundleContext): ContentBundle {
  const { namespace } = context;
  const stove = rl(namespace, 'camp_stove');
  const stews = [
    {
      path: 'forest_stew',
      name: 'Forest Stew',
      ingredient: 'minecraft:brown_mushroom',
      bundle: stew(namespace, 'forest_stew', 'Forest Stew', COLOURS.wood, 8, 0.7, ''),
    },
    {
      path: 'root_stew',
      name: 'Root Stew',
      ingredient: 'minecraft:carrot',
      bundle: stew(
        namespace,
        'root_stew',
        'Root Stew',
        COLOURS.amber,
        8,
        0.8,
        ', and gives Regeneration for five seconds',
        { effect: 'minecraft:regeneration', seconds: 5 },
      ),
    },
    {
      path: 'pumpkin_soup',
      name: 'Pumpkin Soup',
      ingredient: 'minecraft:pumpkin',
      bundle: stew(namespace, 'pumpkin_soup', 'Pumpkin Soup', COLOURS.ruby, 10, 0.6, ''),
    },
  ];
  const machine = patch(
    flow(machineBundle, context, {
      machine_name: 'Camp Stove',
      colour: hexFromRgb(COLOURS.slate),
      power: 'fuel',
      recipe_1: 'none',
      recipe_2: 'none',
      recipe_3: 'none',
      ingredient: 'minecraft:cobblestone',
    }),
    stove,
    (data) => {
      data.recipes = stews.map((entry) => ({
        ingredient: entry.ingredient,
        result: rl(namespace, entry.path),
        experience: 0.2,
      }));
      return data;
    },
    `A cooking machine from the Machine flow (msm:machine) in a vanilla furnace screen: an ingredient, fuel and the meal. It burns fuel as a furnace does and takes its own recipes only, which are the element's recipes: a brown mushroom cooks into Forest Stew, a carrot into Root Stew and a pumpkin into Pumpkin Soup, ten seconds each, with a little experience when you take the meal. Each recipe becomes a data pack file data/${namespace}/recipe/camp_stove/<name>.json whose type is ${stove}; the vanilla data pack leaves them out. A machine recipe has one ingredient, so a pot that mixes several ingredients (or needs a bowl) is not possible yet. It turns its front to the player who places it and glows while it cooks.`,
  );
  return concatBundles(machine, ...stews.map((entry) => entry.bundle));
}

// Pull charm ----------------------------------------------------------------------------------

function pullCharm(context: BundleContext): ContentBundle {
  const { namespace } = context;
  const charm = rl(namespace, 'pull_charm');
  const item = simpleItem(
    namespace,
    'pull_charm',
    {
      display_name: 'Pull Charm',
      max_stack_size: 1,
      rarity: 'uncommon',
      creative_tab: 'minecraft:tools_and_utilities',
    },
    'The charm itself: an ordinary item with no events of its own. The rule book adds the held event (msm:while_held) on export.',
    { pattern: 'gem', colour: COLOURS.sapphire },
  );
  return concatBundles(
    {
      elements: [
        element(
          rl(namespace, 'pull_charm_rules'),
          RULES_KIND,
          book([
            rule(
              'pull_drops',
              'Pull drops and experience to the holder',
              {
                options: { hand: 'off', interval_seconds: 0.5 },
                subject: charm,
                trigger: 'item_held',
              },
              [
                {
                  command: ['tp @e[type=minecraft:item,distance=..8] @s'],
                  step: 'run_command',
                },
                {
                  command: ['tp @e[type=minecraft:experience_orb,distance=..8] @s'],
                  step: 'run_command',
                },
              ],
              [{ condition: 'player_sneaking', not: true }],
            ),
          ]),
          `A rule book for ${charm}. Every half second while a player holds the charm in the off hand, and is not sneaking, two Run a command steps run as that player: tp moves every dropped item and experience orb within 8 blocks to them, so they are picked up at once. Sneak to stop it. On export the book becomes a held event on the charm and a generated script, so it needs the Fabric mod jar export.`,
        ),
        element(
          rl(namespace, 'pull_charm_from_iron'),
          KINDS.recipe,
          {
            type: 'minecraft:crafting_shaped',
            category: 'equipment',
            pattern: ['R I', 'I I', ' I '],
            key: { R: 'minecraft:redstone', I: 'minecraft:iron_ingot' },
            result: { id: charm },
          },
          'A horseshoe of iron ingots with redstone at one end makes the charm.',
        ),
      ],
      assets: [],
    },
    item,
  );
}

// Sunken crypt --------------------------------------------------------------------------------

function sunkenCrypt(context: BundleContext): ContentBundle {
  const { namespace } = context;
  const key = rl(namespace, 'crypt_key');
  const door = rl(namespace, 'crypt_vault_door');
  const crate = rl(namespace, 'crypt_crate');
  const warden = rl(namespace, 'crypt_warden');
  const hallLoot = rl(namespace, 'chests/sunken_crypt');
  const vaultLoot = rl(namespace, 'chests/sunken_crypt_vault');
  const hall = rl(namespace, 'sunken_crypt/hall');
  const pool = rl(namespace, 'sunken_crypt/start');
  const structure = rl(namespace, 'sunken_crypt');
  const set = rl(namespace, 'sunken_crypts');
  const biomes = rl(namespace, 'has_sunken_crypt');

  const boss = patch(
    flow(bossBundle, context, {
      boss_name: 'Crypt Warden',
      preset: 'biped',
      colour: hexFromRgb(MOSS),
      size: 'large',
      health: 120,
      attacks: 'melee',
      damage: 8,
      bar_colour: 'green',
      bar_style: 'notched_6',
      darkens_sky: true,
    }),
    rl(namespace, 'entities/crypt_warden'),
    () => ({
      type: 'minecraft:entity',
      pools: [
        { rolls: 1, entries: [{ type: 'minecraft:item', name: key }] },
        {
          rolls: 1,
          entries: [
            {
              type: 'minecraft:item',
              name: 'minecraft:bone',
              modifier: [
                {
                  type: 'minecraft:set_count',
                  count: { type: 'minecraft:uniform', min: 2, max: 6 },
                },
              ],
            },
          ],
        },
      ],
      random_sequence: rl(namespace, 'entities/crypt_warden'),
    }),
    `What the Crypt Warden drops: always the Crypt Key, and two to six bones.`,
  );
  const crates = flow(storageCrateBundle, context, {
    crate_name: 'Crypt Crate',
    look: 'stone',
    colour: hexFromRgb(COLOURS.slate),
    ingredient: 'none',
  });

  const counted = (name: string, weight: number, min: number, max: number): JsonObject => ({
    type: 'minecraft:item',
    name,
    weight,
    modifier: { type: 'minecraft:set_count', count: { type: 'minecraft:uniform', min, max } },
  });

  // The crypt: a hall (x 0..8, y 0..5, z 0..6) with a ladder shaft up to the surface in one
  // corner, and a vault behind it (z 6..10) shut by two vault door blocks.
  const builder = new BoxBuilder([9, 15, 11])
    .fill([0, 0, 0], [8, 5, 6], 'minecraft:stone_bricks')
    .fill([1, 0, 6], [7, 4, 10], 'minecraft:stone_bricks')
    .fill([1, 1, 1], [7, 4, 5], 'minecraft:air')
    .fill([2, 1, 7], [6, 3, 9], 'minecraft:air')
    .fill([0, 6, 0], [2, 13, 2], 'minecraft:stone_bricks');
  for (const [x, z] of [
    [1, 2],
    [3, 4],
    [6, 1],
    [5, 5],
    [2, 8],
  ] as const) {
    builder.set([x, 0, z], 'minecraft:mossy_stone_bricks');
  }
  for (const [x, y, z] of [
    [0, 2, 3],
    [8, 3, 4],
    [3, 5, 6],
    [7, 1, 0],
  ] as const) {
    builder.set([x, y, z], 'minecraft:cracked_stone_bricks');
  }
  for (let y = 1; y <= 13; y++)
    builder.set([1, y, 1], 'minecraft:ladder[facing=south,waterlogged=false]');
  for (const [x, z] of [
    [0, 0],
    [2, 0],
    [0, 2],
    [2, 2],
  ] as const) {
    builder.set([x, 14, z], 'minecraft:mossy_stone_bricks');
  }
  builder
    .set([4, 1, 6], door)
    .set([4, 2, 6], door)
    .set([7, 1, 1], crate)
    .set([7, 1, 5], crate)
    .set([4, 1, 9], crate)
    .set([2, 1, 4], 'minecraft:soul_lantern[hanging=false,waterlogged=false]')
    .set([6, 1, 4], 'minecraft:soul_lantern[hanging=false,waterlogged=false]')
    .set([2, 1, 9], 'minecraft:candle[candles=3,lit=true,waterlogged=false]')
    .set([6, 1, 9], 'minecraft:candle[candles=3,lit=true,waterlogged=false]')
    .set([7, 4, 3], 'minecraft:cobweb')
    .set([2, 4, 5], 'minecraft:cobweb');
  const hallData = {
    ...(builder.build() as JsonObject),
    block_entities: [
      { pos: [7, 1, 1], nbt: `{LootTable:"${hallLoot}"}` },
      { pos: [7, 1, 5], nbt: `{LootTable:"${hallLoot}"}` },
      { pos: [4, 1, 9], nbt: `{LootTable:"${vaultLoot}"}` },
    ],
    entities: [
      { pos: [4.5, 1, 3.5], block_pos: [4, 1, 3], nbt: `{id:"${warden}",PersistenceRequired:1b}` },
    ],
  };

  const vault: ContentBundle = {
    elements: [
      element(
        rl(namespace, 'crypt_vault_rules'),
        RULES_KIND,
        book([
          rule(
            'open_vault',
            'Open the vault with the Crypt Key',
            { subject: door, trigger: 'block_used' },
            [
              {
                conditions: [{ condition: 'player_holding', item: key }],
                do: [
                  { count: 1, item: key, step: 'take_item' },
                  { block: 'minecraft:air', step: 'place_block', where: 'here' },
                  ...[1, -1].map((dy) => ({
                    conditions: [
                      {
                        block: door,
                        condition: 'block_is',
                        where: { offset: [0, dy, 0], place: 'offset' },
                      },
                    ],
                    do: [
                      {
                        block: 'minecraft:air',
                        step: 'place_block',
                        where: { offset: [0, dy, 0], place: 'offset' },
                      },
                    ],
                    match: 'all',
                    step: 'if',
                  })),
                  { sound: 'minecraft:block.iron_door.open', step: 'play_sound', where: 'here' },
                  { step: 'show_title', title: ['The vault opens'] },
                ],
                else: [
                  { sound: 'minecraft:block.iron_door.close', step: 'play_sound', where: 'here' },
                  { step: 'show_action_bar', text: ['Locked. The Crypt Warden keeps the key.'] },
                ],
                match: 'all',
                step: 'if',
              },
            ],
          ),
          rule('warden_falls', 'The Crypt Warden falls', { subject: warden, trigger: 'mob_died' }, [
            {
              step: 'show_title',
              subtitle: ['It dropped the key to the vault'],
              title: ['The Crypt Warden falls'],
              who: { radius: 32, who: 'players_nearby' },
            },
          ]),
        ]),
        `A rule book for the crypt. The first rule runs when a player uses ${door}: holding the Crypt Key, the player gives up the key and the door opens (Place a block sets air here, and above or below when that block is the other half of the door), with a sound and a title; without the key the door stays shut and says who has it. The second rule tells every player within 32 blocks when the Crypt Warden dies. On export the book becomes events on the door and the warden plus a generated script, so it needs the Fabric mod jar export.`,
      ),
      element(
        door,
        KINDS.block,
        {
          format: 1,
          model: rl(namespace, `block/crypt_vault_door`),
          display_name: 'Crypt Vault Door',
          sound_type: 'stone',
          item: { creative_tab: 'minecraft:building_blocks' },
          components: { 'msm:breakable': { hardness: -1, resistance: 3600000 } },
        },
        'The vault door: two of these block the vault. hardness -1 makes it unbreakable in survival and the high resistance survives explosions, so the only way in is the Crypt Key (the rule book adds the use event, msm:on_interact, on export). It has no loot of its own.',
      ),
      element(
        rl(namespace, 'block/crypt_vault_door'),
        KINDS.model,
        {
          parent: 'minecraft:block/cube_all',
          textures: { all: rl(namespace, 'block/crypt_vault_door') },
        },
        'A full cube drawn from textures/block/crypt_vault_door.png on every side.',
      ),
      element(
        key,
        KINDS.item,
        {
          format: 1,
          model: rl(namespace, 'item/crypt_key'),
          display_name: 'Crypt Key',
          max_stack_size: 1,
          rarity: 'rare',
          creative_tab: 'minecraft:tools_and_utilities',
        },
        'The key to the vault, dropped by the Crypt Warden. Use it on the vault door; the rule book takes it.',
      ),
      itemModel(
        namespace,
        'crypt_key',
        'minecraft:item/generated',
        'A flat item model drawn from textures/item/crypt_key.png.',
      ),
      element(
        hallLoot,
        KINDS.lootTable,
        {
          type: 'minecraft:chest',
          pools: [
            {
              rolls: { type: 'minecraft:uniform', min: 3, max: 6 },
              entries: [
                counted('minecraft:bone', 5, 1, 4),
                counted('minecraft:rotten_flesh', 4, 1, 3),
                counted('minecraft:gold_nugget', 3, 2, 8),
                counted('minecraft:iron_ingot', 2, 1, 2),
                { type: 'minecraft:item', name: 'minecraft:name_tag', weight: 1 },
              ],
            },
          ],
        },
        `The loot of the two crates in the hall: three to six rolls of bones, rotten flesh, gold nuggets, iron or a name tag. The hall template gives the crates this table (LootTable in their block entity), and they fill on the first open, as a dungeon chest does. Try /loot give @s loot ${hallLoot}.`,
      ),
      element(
        vaultLoot,
        KINDS.lootTable,
        {
          type: 'minecraft:chest',
          pools: [
            {
              rolls: { type: 'minecraft:uniform', min: 4, max: 6 },
              entries: [
                counted('minecraft:gold_ingot', 4, 2, 6),
                counted('minecraft:diamond', 3, 1, 3),
                counted('minecraft:emerald', 3, 2, 5),
                { type: 'minecraft:item', name: 'minecraft:golden_apple', weight: 2 },
                { type: 'minecraft:item', name: 'minecraft:totem_of_undying', weight: 1 },
              ],
            },
          ],
        },
        'The treasure of the crate in the vault: gold, diamonds, emeralds, a golden apple or a rare totem of undying.',
      ),
      element(
        hall,
        KINDS.structureTemplate,
        hallData as unknown as Json,
        `The crypt in one 9×15×11 template. The hall has mossy and cracked stone bricks, soul lanterns, cobwebs and two Crypt Crates; a ladder in one corner climbs 13 blocks to the surface; behind the far wall the vault holds a third crate between candles, shut by two Crypt Vault Door blocks. block_entities give the crates their loot tables, and entities places the Crypt Warden in the hall once, when the crypt generates (PersistenceRequired keeps it). Positions left out are structure void. Try /place template ${hall} ~ ~ ~.`,
      ),
      element(
        pool,
        KINDS.templatePool,
        { fallback: 'minecraft:empty', elements: [singlePiece(hall, 'rigid')] },
        'The start pool: always the crypt hall.',
      ),
      element(
        structure,
        KINDS.structure,
        {
          type: 'minecraft:jigsaw',
          biomes: `#${biomes}`,
          step: 'underground_structures',
          spawn_overrides: {},
          terrain_adaptation: 'none',
          start_pool: pool,
          size: 1,
          start_height: { absolute: -11 },
          project_start_to_heightmap: 'WORLD_SURFACE_WG',
          max_distance_from_center: 80,
          use_expansion_hack: false,
        },
        `The sunken crypt: a one-piece jigsaw structure in the biomes of #${biomes}. project_start_to_heightmap puts its start on the surface and start_height -11 sinks it 11 blocks, so only the top of the ladder shaft shows above ground. Try /locate structure ${structure} in a new world.`,
      ),
      element(
        set,
        KINDS.structureSet,
        {
          structures: [{ structure, weight: 1 }],
          placement: {
            type: 'minecraft:random_spread',
            spacing: 34,
            separation: 10,
            salt: saltFor(set),
          },
        },
        'Places sunken crypts about one in every 34 by 34 chunks, at least 10 chunks apart. Structure sets load when a world opens, so reopen the world after adding it.',
      ),
      element(
        biomes,
        KINDS.tagWorldgenBiome,
        {
          values: [
            'minecraft:swamp',
            'minecraft:dark_forest',
            'minecraft:old_growth_spruce_taiga',
            'minecraft:old_growth_pine_taiga',
          ],
        },
        'The gloomy biomes where sunken crypts generate.',
      ),
    ],
    assets: [
      texture(namespace, 'block/crypt_vault_door', 'portal_frame', COLOURS.slate),
      texture(namespace, 'item/crypt_key', 'ingot', COLOURS.amber),
    ],
  };
  return concatBundles(vault, boss, crates);
}

// Amber realm ---------------------------------------------------------------------------------

function amberRealm(context: BundleContext): ContentBundle {
  const { namespace } = context;
  const biomeIds = customBiomeIds(namespace);
  const dimension = rl(namespace, 'amber_realm');
  const orePlaced = rl(namespace, 'ore_amber_placed');
  const amber = rl(namespace, 'amber');
  const portal = flow(portalBundle, context, {
    portal_name: 'Amber Gate',
    destination: 'new',
    dimension_name: 'Amber Realm',
    terrain: 'overworld',
    biome: 'minecraft:plains',
    sky: 'day',
    colour: hexFromRgb(COLOURS.amber),
    particles: 'dust',
  });
  const realm = patch(
    portal,
    dimension,
    (data) => {
      const generator = data.generator as JsonObject;
      generator.biome_source = { type: 'minecraft:fixed', biome: biomeIds.biome };
      return data;
    },
    `The dimension Amber Realm: overworld terrain with the overworld sky, filled with one biome of the project, ${biomeIds.biome} (a fixed biome source). The game loads a new dimension when a world opens, so open or reload a world after adding it.`,
  );
  // The Amber Woods biome of the Custom biome starter, without its World Type: here it fills
  // the Amber Realm instead, and its ores step gains the amber ore.
  const biome = patch(
    withoutKinds(customBiomeContent(context), [
      KINDS.worldPreset,
      KINDS.tagWorldgenWorldPreset,
      KINDS.tagWorldgenBiome,
      KINDS.lang,
    ]),
    biomeIds.biome,
    (data) => {
      const features = data.features as Json[][];
      (features[6] as Json[]).push(orePlaced);
      return data;
    },
    `A mild forest with orange grass and leaves, birch-trunked amber trees, extra copper and amber ore, from the Custom biome starter. features holds one list of placed features per decoration step, in the game's step order; ${orePlaced} is added to the underground ores step, after the vanilla ores. It is the only biome of ${dimension}, so it appears nowhere else.`,
  );
  // The Amber ore from the Custom ore flow: its ore feature and placed feature are kept, but
  // not its world addition, which would add it to every overworld biome; the biome above lists
  // the placed feature instead.
  const ore = withoutKinds(
    flow(customOreBundle, context, {
      ore_name: 'Amber',
      colour: hexFromRgb(COLOURS.amber),
      tool_tier: 'stone',
      vein_size: 8,
      veins_per_chunk: 8,
      min_y: 0,
      max_y: 80,
    }),
    [KINDS.biomeAddition, KINDS.advancement, KINDS.tagItem],
  );
  const beetleLoot = rl(namespace, 'entities/amber_beetle');
  const beetle = presetMob({
    namespace,
    name: 'amber_beetle',
    preset: 'quadruped',
    colour: COLOURS.amber,
    entity: {
      display_name: 'Amber Beetle',
      base: 'animal',
      category: 'creature',
      loot_table: beetleLoot,
      spawn: { biomes: [biomeIds.biome], weight: 12, min_group: 2, max_group: 4, rule: 'animal' },
    },
    components: {
      'msm:health': { max: 10 },
      'msm:movement': { speed: 0.2 },
      'msm:ai_goals': {
        goals: [
          { type: 'panic', speed: 1.4 },
          { type: 'tempt', items: [amber], speed: 1 },
          { type: 'wander', speed: 0.8 },
          { type: 'look_at_player', distance: 6 },
          { type: 'look_around' },
        ],
      },
    },
    notes: {
      entity: `The creature of the Amber Realm: a calm animal (base animal) that spawns in groups of two to four on the grass of ${biomeIds.biome}, and only there, since that biome exists only in the realm. It follows players who hold amber (tempt), panics when hurt and drops amber.`,
      model: 'The quadruped preset model.',
      animations: 'The quadruped preset animations: idle and walk.',
    },
  });
  const beetleDrops = {
    elements: [
      element(
        beetleLoot,
        KINDS.lootTable,
        dropLoot(amber, 1, false, beetleLoot),
        'What the Amber Beetle drops: up to one amber.',
      ),
    ],
    assets: [],
  };
  return concatBundles(realm, biome, ore, beetle, beetleDrops);
}

// Returning boomerang -------------------------------------------------------------------------

function boomerang(context: BundleContext): ContentBundle {
  const { namespace } = context;
  const item = rl(namespace, 'returning_boomerang');
  const thrown = flow(throwableBundle, context, {
    throwable_name: 'Returning Boomerang',
    colour: hexFromRgb(COLOURS.wood),
    style: 'boomerang',
    damage: 5,
    speed: 1.6,
    gravity: 'floaty',
    ingredient: 'minecraft:feather',
  });
  return concatBundles(thrown, {
    elements: [
      element(
        rl(namespace, 'returning_boomerang_rules'),
        RULES_KIND,
        book([
          rule('hit_mob', 'Stun the mob it hits', { subject: item, trigger: 'thrown_hit_mob' }, [
            {
              effect: 'minecraft:slowness',
              level: 2,
              seconds: 2,
              step: 'give_effect',
              who: 'other',
            },
            { effect: 'minecraft:glowing', seconds: 3, step: 'give_effect', who: 'other' },
            { sound: 'minecraft:entity.player.attack.crit', step: 'play_sound', where: 'here' },
          ]),
          rule('hit_block', 'Clatter on a block', { subject: item, trigger: 'thrown_hit_block' }, [
            { sound: 'minecraft:block.wood.hit', step: 'play_sound', where: 'here' },
            {
              count: 6,
              particle: 'minecraft:crit',
              spread: 0.2,
              step: 'spawn_particles',
              where: 'here',
            },
          ]),
        ]),
        `A rule book for ${item}. The boomerang comes back by itself (after_throw return puts it back in the thrower's inventory when it lands); the rules add what it does on the way: a mob it hits is slowed and glows for a moment, and hitting a block clatters with a few sparks. These rules use only plain steps, so they become ordinary events on the item when exported (no script), in the Fabric mod jar export.`,
      ),
    ],
    assets: [],
  });
}

// Paper glider --------------------------------------------------------------------------------

function paperGlider(context: BundleContext): ContentBundle {
  const { namespace } = context;
  const glider = rl(namespace, 'paper_glider');
  return concatBundles(
    simpleItem(
      namespace,
      'paper_glider',
      {
        display_name: 'Paper Glider',
        max_stack_size: 1,
        creative_tab: 'minecraft:tools_and_utilities',
        components: {
          'msm:durability': { max: 96 },
          'msm:components': {
            'minecraft:glider': {},
            'minecraft:equippable': { slot: 'chest' },
          },
        },
      },
      'A glider made of vanilla components: msm:components passes minecraft:glider and minecraft:equippable (worn in the chest slot) to the item, the same pair that makes an elytra fly. Wear it, jump off something high and press jump in the air to glide. msm:durability gives it 96 uses: gliding wears it down one point a second, and it stops gliding when one point is left. It shows nothing on the body, since it has no equipment asset.',
      { pattern: 'chestplate', colour: CANVAS },
    ),
    {
      elements: [
        element(
          rl(namespace, 'paper_glider_from_paper'),
          KINDS.recipe,
          {
            type: 'minecraft:crafting_shaped',
            category: 'equipment',
            pattern: ['PPP', 'SPS', 'T T'],
            key: { P: 'minecraft:paper', S: 'minecraft:stick', T: 'minecraft:string' },
            result: { id: glider },
          },
          'Paper over a frame of sticks with two strings to hold makes a glider.',
        ),
      ],
      assets: [],
    },
  );
}

// Rocket boots --------------------------------------------------------------------------------

function rocketBoots(context: BundleContext): ContentBundle {
  const { namespace } = context;
  const boots = rl(namespace, 'rocket_boots');
  return concatBundles(
    simpleItem(
      namespace,
      'rocket_boots',
      {
        display_name: 'Rocket Boots',
        max_stack_size: 1,
        rarity: 'uncommon',
        creative_tab: 'minecraft:combat',
        components: { 'msm:armor': { slot: 'boots', material: 'iron' } },
      },
      'Boots of the vanilla iron armour material (msm:armor, slot boots), so they look and protect as iron boots do. The rule book adds the worn event (msm:while_worn) on export.',
      { pattern: 'boots', colour: COLOURS.ruby },
    ),
    {
      elements: [
        element(
          rl(namespace, 'rocket_boots_rules'),
          RULES_KIND,
          book([
            rule(
              'thrust',
              'Rocket up while sneaking',
              { options: { interval_seconds: 0.25 }, subject: boots, trigger: 'item_worn' },
              [
                { direction: 'up', step: 'launch', strength: 0.45 },
                { effect: 'minecraft:slow_falling', seconds: 2, step: 'give_effect' },
                {
                  count: 8,
                  particle: 'minecraft:flame',
                  speed: 0.02,
                  spread: 0.2,
                  step: 'spawn_particles',
                  where: 'player',
                },
                {
                  pitch: 1.4,
                  sound: 'minecraft:entity.firework_rocket.launch',
                  step: 'play_sound',
                  volume: 0.4,
                  where: 'player',
                },
              ],
              [{ condition: 'player_sneaking' }],
            ),
          ]),
          `A rule book for ${boots}. Every quarter second while a player wears the boots and sneaks, they are launched straight up with flames and a rocket sound, and Slow Falling for two seconds lets them land safely. The rule has a condition, so it compiles to a script; it needs the Fabric mod jar export.`,
        ),
        element(
          rl(namespace, 'rocket_boots_from_iron_boots'),
          KINDS.recipe,
          {
            type: 'minecraft:crafting_shapeless',
            category: 'equipment',
            ingredients: [
              'minecraft:iron_boots',
              'minecraft:firework_rocket',
              'minecraft:firework_rocket',
              'minecraft:blaze_powder',
            ],
            result: { id: boots },
          },
          'Iron boots, two firework rockets and blaze powder anywhere in the grid make the rocket boots.',
        ),
      ],
      assets: [],
    },
  );
}

// Orchard tree --------------------------------------------------------------------------------

function orchardTree(context: BundleContext): ContentBundle {
  const { namespace } = context;
  const leaves = rl(namespace, 'plum_leaves');
  const plum = rl(namespace, 'plum');
  const pie = rl(namespace, 'plum_pie');
  const tree = flow(treeBundle, context, {
    tree_name: 'Plum',
    colour: hexFromRgb(COLOURS.wood),
    leaf_colour: hexFromRgb(COLOURS.jade),
    trees_per_chunk: 1,
  });
  return concatBundles(
    tree,
    simpleItem(
      namespace,
      'plum',
      {
        display_name: 'Plum',
        creative_tab: 'minecraft:food_and_drinks',
        components: { 'msm:food': { nutrition: 4, saturation: 0.3 } },
      },
      'The fruit: msm:food restores 4 hunger, as an apple does. Plum leaves drop it now and then (the rule book).',
      { pattern: 'egg', colour: PLUM },
    ),
    simpleItem(
      namespace,
      'plum_pie',
      {
        display_name: 'Plum Pie',
        creative_tab: 'minecraft:food_and_drinks',
        components: { 'msm:food': { nutrition: 8, saturation: 0.3 } },
      },
      'A pie of plums, eaten whole as a pumpkin pie is (msm:food, 8 hunger). A placed pie eaten one slice per use, as cake is, needs a block type with bites that MSM does not have yet.',
      { pattern: 'egg', colour: COLOURS.amber },
    ),
    {
      elements: [
        element(
          rl(namespace, 'plum_tree_rules'),
          RULES_KIND,
          book([
            rule(
              'drop_fruit',
              'Ripe plums fall from the leaves',
              { options: { chance: 0.04 }, subject: leaves, trigger: 'block_random_tick' },
              [
                { count: 1, item: plum, step: 'drop_item', where: 'here' },
                {
                  pitch: 1.6,
                  sound: 'minecraft:block.cave_vines.pick_berries',
                  step: 'play_sound',
                  volume: 0.5,
                  where: 'here',
                },
              ],
            ),
          ]),
          `A rule book for ${leaves}. Leaves get random ticks, and on one in 25 of them a ripe plum drops from the leaves with a soft pop, so plums gather under the tree over time. Drop an item is a world step without an event action, so the rule compiles to a script; it needs the Fabric mod jar export.`,
        ),
        element(
          rl(namespace, 'plum_pie_from_plums'),
          KINDS.recipe,
          {
            type: 'minecraft:crafting_shapeless',
            category: 'misc',
            ingredients: [plum, plum, 'minecraft:sugar', 'minecraft:egg', 'minecraft:wheat'],
            result: { id: pie },
          },
          'Two plums, sugar, an egg and wheat anywhere in the grid bake a plum pie.',
        ),
      ],
      assets: [],
    },
  );
}

// Spell scrolls -------------------------------------------------------------------------------

function spellScrolls(context: BundleContext): ContentBundle {
  const { namespace } = context;
  const scrolls: { path: string; name: string; colour: Rgb; words: string; steps: Json[] }[] = [
    {
      path: 'scroll_of_mending',
      name: 'Scroll of Mending',
      colour: COLOURS.jade,
      words: 'heals four hearts and gives Regeneration for five seconds',
      steps: [
        { amount: 8, step: 'heal' },
        { effect: 'minecraft:regeneration', seconds: 5, step: 'give_effect' },
        {
          count: 8,
          particle: 'minecraft:heart',
          spread: 0.6,
          step: 'spawn_particles',
          where: 'player',
        },
      ],
    },
    {
      path: 'scroll_of_blinking',
      name: 'Scroll of Blinking',
      colour: COLOURS.violet,
      words: 'teleports the reader to where they look, up to 12 blocks away',
      steps: [
        {
          count: 20,
          particle: 'minecraft:portal',
          spread: 0.5,
          step: 'spawn_particles',
          where: 'player',
        },
        { step: 'teleport', to: { distance: 12, place: 'player_looking' } },
        { sound: 'minecraft:entity.enderman.teleport', step: 'play_sound', where: 'player' },
      ],
    },
    {
      path: 'scroll_of_storms',
      name: 'Scroll of Storms',
      colour: COLOURS.sapphire,
      words: 'calls a bolt of lightning down where the reader looks, up to 24 blocks away',
      steps: [
        {
          count: 1,
          mob: 'minecraft:lightning_bolt',
          step: 'spawn_mob',
          where: { distance: 24, place: 'player_looking' },
        },
      ],
    },
    {
      path: 'scroll_of_frost',
      name: 'Scroll of Frost',
      colour: COLOURS.frost,
      words: 'slows every mob within 6 blocks for six seconds',
      steps: [
        {
          command: ['effect give @e[distance=..6,type=!minecraft:player] minecraft:slowness 6 3'],
          step: 'run_command',
        },
        {
          count: 40,
          particle: 'minecraft:snowflake',
          spread: 3,
          step: 'spawn_particles',
          where: 'player',
        },
        { sound: 'minecraft:block.glass.break', step: 'play_sound', where: 'player' },
      ],
    },
  ];
  const bundles = scrolls.map((scroll) =>
    simpleItem(
      namespace,
      scroll.path,
      {
        display_name: scroll.name,
        max_stack_size: 16,
        rarity: 'uncommon',
        creative_tab: 'minecraft:tools_and_utilities',
      },
      `A one-use spell scroll: reading it (using it) ${scroll.words}, and uses it up. The rule book adds the use event (msm:on_use) on export.`,
      { pattern: 'smithing_template', colour: scroll.colour },
    ),
  );
  const rules = scrolls.map((scroll) => {
    const item = rl(namespace, scroll.path);
    return rule(
      scroll.path,
      `Read the ${scroll.name}`,
      { options: { cooldown_seconds: 1 }, subject: item, trigger: 'item_used' },
      [{ count: 1, item, step: 'take_item' }, ...scroll.steps],
    );
  });
  const recipes = scrolls.map((scroll, index) => {
    const ink = [
      'minecraft:glistering_melon_slice',
      'minecraft:ender_pearl',
      'minecraft:lapis_lazuli',
      'minecraft:snowball',
    ][index] as string;
    return element(
      rl(namespace, `${scroll.path}_from_paper`),
      KINDS.recipe,
      {
        type: 'minecraft:crafting_shapeless',
        category: 'misc',
        ingredients: ['minecraft:paper', 'minecraft:glow_ink_sac', ink],
        result: { id: rl(namespace, scroll.path), count: 2 },
      },
      `Paper, a glow ink sac and ${ink.slice('minecraft:'.length).replaceAll('_', ' ')} make two ${scroll.name.replace('Scroll', 'Scrolls')}.`,
    );
  });
  return concatBundles(...bundles, {
    elements: [
      element(
        rl(namespace, 'spell_scroll_rules'),
        RULES_KIND,
        book(rules),
        'A rule book with one rule per scroll: using a scroll takes one from the hand and casts its spell. Mending heals and gives Regeneration; Blinking teleports to where you look (Where the player looks stops at the first block or mob, up to 12 blocks); Storms spawns a lightning bolt where you look; Frost runs an effect command as the reader that slows every mob within 6 blocks. A one-second cooldown keeps a held button from reading a whole stack. The rules take items and use places, so they compile to a script; they need the Fabric mod jar export.',
      ),
      ...recipes,
    ],
    assets: [],
  });
}

// Coordinates bar -----------------------------------------------------------------------------

function coordinatesBar({ namespace }: BundleContext): ContentBundle {
  const position = (axis: string): Json => ({ axis, value: 'player_position' });
  return {
    elements: [
      element(
        rl(namespace, 'coordinates_bar_rules'),
        RULES_KIND,
        book([
          rule(
            'show_coordinates',
            'Show the coordinates while holding a compass',
            { options: { interval_seconds: 0.5 }, trigger: 'player_every' },
            [
              {
                step: 'show_action_bar',
                text: [
                  'X ',
                  position('x'),
                  '   Y ',
                  position('y'),
                  '   Z ',
                  position('z'),
                  '   Time ',
                  { value: 'time_of_day' },
                ],
              },
            ],
            [{ condition: 'player_holding', hand: 'either', item: 'minecraft:compass' }],
          ),
        ]),
        'A rule book with one player rule and no blocks or items of its own. Every half second, for each player holding a vanilla compass in either hand, the text above the hotbar shows their X, Y and Z position (two decimals) and the time of day in ticks (0 is sunrise, 6000 noon, 18000 midnight). Readings mix with words in a text slot. The facing direction cannot be shown: Rules have no reading of where a player looks. Rules compile to a script, so this needs the Fabric mod jar export.',
      ),
    ],
    assets: [],
  };
}

// Interim vehicles ----------------------------------------------------------------------------

const IMPORT = 'import { msm } from "msm:runtime";';

function goKart(context: BundleContext): ContentBundle {
  const { namespace } = context;
  const kart = rl(namespace, 'go_kart');
  const horn = rl(namespace, 'kart_horn');
  const mob = presetMob({
    namespace,
    name: 'go_kart',
    preset: 'cube_creature',
    colour: COLOURS.ruby,
    entity: {
      display_name: 'Go-Kart',
      base: 'animal',
      category: 'creature',
      sounds: {
        ambient: 'minecraft:entity.minecart.inside',
        hurt: 'minecraft:entity.iron_golem.hurt',
        death: 'minecraft:entity.generic.explode',
      },
    },
    components: {
      'msm:health': { max: 30 },
      'msm:movement': { speed: 0.32, step_height: 1, knockback_resistance: 0.6 },
      'msm:rideable': { saddle: false, controlled_by: 'anyone', speed: 1, jump: 0, passengers: 2 },
    },
    notes: {
      entity: `${INTERIM_VEHICLE} The kart is a mob with no AI goals, so it never moves by itself. msm:rideable with saddle false lets anyone get in with an empty hand and drive it with W, A, S and D, with a second seat behind the driver (passengers 2); sneaking gets out. step_height 1 lets it drive up full blocks. Its spawn egg is the kart item: use it on the ground to place a kart. Being a mob, it can still be hurt (fire, falls) and pushed.`,
      model: 'The cube creature preset model, standing in for a kart body.',
      animations: 'The cube creature preset animations: idle and walk.',
    },
  });
  const horns = simpleItem(
    namespace,
    'kart_horn',
    {
      display_name: 'Kart Horn',
      max_stack_size: 1,
      creative_tab: 'minecraft:tools_and_utilities',
    },
    'A horn to honk while driving: the script plays a note when it is used.',
    { pattern: 'disc', colour: COLOURS.amber },
  );
  const script = element(
    rl(namespace, 'go_kart_controls'),
    KINDS.script,
    {
      lines: [
        IMPORT,
        '',
        `const KART = "${kart}";`,
        `const KART_ITEM = "${kart}_spawn_egg";`,
        `const HORN = "${horn}";`,
        '',
        '// Sneak and use a kart to pick it up again as its item.',
        'msm.events.on("entity.interact", (e) => {',
        '  if (e.entity.type !== KART || !e.player.isSneaking) return;',
        '  e.cancel();',
        '  e.entity.remove();',
        '  if (!e.player.isCreative) e.player.give(KART_ITEM);',
        '  e.world.playSound("minecraft:entity.item.pickup", e.player.pos);',
        '});',
        '',
        '// The horn honks, at most once a second.',
        'msm.events.on("item.use", (e) => {',
        '  if (e.item.id !== HORN) return;',
        '  const ready = e.player.data.get("horn_ready");',
        '  if (typeof ready === "number" && e.world.time < ready) return;',
        '  e.player.data.set("horn_ready", e.world.time + 20);',
        '  e.world.playSound("minecraft:block.note_block.didgeridoo", e.player.pos, { volume: 2, pitch: 1.4 });',
        '});',
      ],
    },
    `The go-kart's controls. The entity.interact handler runs before the kart's own use: when the player is sneaking it cancels getting in, removes the kart (remove leaves no loot) and gives back the kart item, ${kart}_spawn_egg, unless the player is in creative. The item.use handler honks the horn, keeping the time of the next honk in player.data. Scripts run only in the Fabric mod jar export.`,
  );
  return concatBundles(mob, horns, { elements: [script], assets: [] });
}

function miniTank(context: BundleContext): ContentBundle {
  const { namespace } = context;
  const tank = rl(namespace, 'mini_tank');
  const lever = rl(namespace, 'firing_lever');
  const mob = presetMob({
    namespace,
    name: 'mini_tank',
    preset: 'cube_creature',
    colour: COLOURS.jade,
    scale: 1.4,
    entity: {
      display_name: 'Mini Tank',
      base: 'animal',
      category: 'creature',
      sounds: {
        ambient: 'minecraft:entity.iron_golem.step',
        hurt: 'minecraft:entity.iron_golem.damage',
        death: 'minecraft:entity.generic.explode',
      },
    },
    components: {
      'msm:health': { max: 80 },
      'msm:movement': { speed: 0.16, step_height: 1, knockback_resistance: 1, fire_immune: true },
      'msm:rideable': { saddle: false, controlled_by: 'anyone', speed: 1, jump: 0, passengers: 1 },
    },
    notes: {
      entity: `${INTERIM_VEHICLE} A slow, tough mob with no AI goals: 80 health, no knockback and fire immune. Anyone gets in with an empty hand and drives it with W, A, S and D (msm:rideable, saddle false); it faces where the driver looks, as there is no turret yet. The script fires its cannon from the Firing Lever and repairs it with iron.`,
      model: 'The cube creature preset model, one and a half times bigger, standing in for a tank.',
      animations: 'The cube creature preset animations: idle and walk.',
    },
  });
  const levers = simpleItem(
    namespace,
    'firing_lever',
    {
      display_name: 'Firing Lever',
      max_stack_size: 1,
      creative_tab: 'minecraft:combat',
    },
    'The trigger of the tank: the script fires the cannon when the driver uses it.',
    { pattern: 'spear', colour: COLOURS.slate },
    true,
  );
  const script = element(
    rl(namespace, 'mini_tank_cannon'),
    KINDS.script,
    {
      lines: [
        IMPORT,
        '',
        `const TANK = "${tank}";`,
        `const LEVER = "${lever}";`,
        'const RANGE = 48;',
        'const RELOAD_TICKS = 60;',
        '',
        '// The tank the player sits in: the script API cannot ask what a player rides, so the',
        '// nearest tank right under the player stands in for it.',
        'const tankOf = (player: Player): Entity | undefined =>',
        '  player.world',
        '    .entitiesNear(player.pos, 1.5)',
        '    .filter((entity) => entity.type === TANK && entity.pos.y < player.pos.y)[0];',
        '',
        '// Using the Firing Lever in a tank fires a shell where the driver looks.',
        'msm.events.on("item.use", (e) => {',
        '  if (e.item.id !== LEVER) return;',
        '  const player = e.player;',
        '  const tank = tankOf(player);',
        '  if (tank === undefined) {',
        '    player.showActionBar("Get in a Mini Tank to fire.");',
        '    return;',
        '  }',
        '  const ready = player.data.get("cannon_ready");',
        '  if (typeof ready === "number" && e.world.time < ready) {',
        '    player.showActionBar("Reloading...");',
        '    return;',
        '  }',
        '  player.data.set("cannon_ready", e.world.time + RELOAD_TICKS);',
        '  const look = player.look;',
        '  const eyes = player.pos.offset(0, 1.62, 0);',
        '  const hit = player.raycast(RANGE, { entities: true, ignore: tank });',
        '  const target = hit !== undefined ? hit.pos : eyes.offset(look.x * RANGE, look.y * RANGE, look.z * RANGE);',
        '  const distance = hit !== undefined ? hit.distance : RANGE;',
        '  for (let step = 2; step < distance; step += 2) {',
        '    const at = eyes.offset(look.x * step, look.y * step, look.z * step);',
        '    e.world.spawnParticle("minecraft:smoke", at, { count: 2, spread: 0.05 });',
        '  }',
        '  e.world.playSound("minecraft:entity.generic.explode", eyes, { volume: 0.8, pitch: 1.6 });',
        '  e.world.explode(target, 2.5, { breaksBlocks: false });',
        '  player.showActionBar("Fired! Reloading for three seconds.");',
        '});',
        '',
        '// Using an iron ingot on a damaged tank repairs it by five hearts.',
        'msm.events.on("entity.interact", (e) => {',
        '  if (e.entity.type !== TANK || e.player.heldItem !== "minecraft:iron_ingot") return;',
        '  if (e.entity.health >= e.entity.maxHealth) return;',
        '  e.cancel();',
        '  e.entity.heal(10);',
        '  if (!e.player.isCreative) e.player.inventory.remove("minecraft:iron_ingot", 1);',
        '  e.world.playSound("minecraft:block.anvil.use", e.entity.pos, { volume: 0.6 });',
        '  e.player.showActionBar("Tank armour: " + Math.round(e.entity.health) + " / " + e.entity.maxHealth);',
        '});',
      ],
    },
    `The tank's cannon and repairs. Using the Firing Lever while sitting in a tank casts a ray from the driver's eyes (raycast, passing through the tank), draws a smoke trail along it and makes an explosion of power 2.5 where it stops, up to 48 blocks away; the explosion hurts mobs but breaks no blocks. player.data keeps the reload time, three seconds. The script cannot ask what a player rides, so a tank just under the player counts as theirs. Using an iron ingot on a damaged tank heals it by ten health. Scripts run only in the Fabric mod jar export.`,
  );
  return concatBundles(mob, levers, { elements: [script], assets: [] });
}

function biplane(context: BundleContext): ContentBundle {
  const { namespace } = context;
  const plane = rl(namespace, 'patchwork_biplane');
  const mob = presetMob({
    namespace,
    name: 'patchwork_biplane',
    preset: 'flyer',
    colour: CANVAS,
    scale: 1.5,
    entity: {
      display_name: 'Patchwork Biplane',
      base: 'animal',
      category: 'creature',
      sounds: {
        ambient: 'minecraft:entity.bee.loop',
        hurt: 'minecraft:entity.armor_stand.hit',
        death: 'minecraft:entity.armor_stand.break',
      },
    },
    components: {
      'msm:health': { max: 40 },
      'msm:movement': { speed: 0.3, mode: 'fly', flying_speed: 0.8, hovers: true },
      'msm:rideable': { saddle: false, controlled_by: 'anyone', speed: 1, jump: 0, passengers: 1 },
    },
    notes: {
      entity: `${INTERIM_VEHICLE} A flying mob with no AI goals (mode fly, hovering, no fall damage). Anyone gets in with an empty hand; it flies where the pilot looks and climbs while jump is held. The script burns fuel while it flies and refuels it with coal.`,
      model: 'The round flyer preset model, one and a half times bigger, standing in for a plane.',
      animations: 'The flyer preset animations: idle, walk and fly.',
    },
  });
  const script = element(
    rl(namespace, 'patchwork_biplane_fuel'),
    KINDS.script,
    {
      lines: [
        IMPORT,
        '',
        `const PLANE = "${plane}";`,
        'const START_FUEL = 60;',
        'const MAX_FUEL = 300;',
        'const COAL_SECONDS = 60;',
        '',
        '// Seconds of fuel, kept on the plane; a new plane starts with a minute.',
        'const fuelOf = (entity: Entity): number => {',
        '  const fuel = entity.data.get("fuel");',
        '  return typeof fuel === "number" ? fuel : START_FUEL;',
        '};',
        '',
        '// With an empty tank the plane cannot move: both speeds go to 0, and back on refuelling.',
        'const setEngine = (entity: Entity, running: boolean): void => {',
        '  entity.runCommand("attribute @s minecraft:movement_speed base set " + (running ? 0.3 : 0));',
        '  entity.runCommand("attribute @s minecraft:flying_speed base set " + (running ? 0.8 : 0));',
        '};',
        '',
        '// Once a second for each pilot: burn a second of fuel if the plane moved, and show the gauge.',
        '// The script API cannot ask what a player rides, so a plane right under the player counts.',
        'msm.events.on(',
        '  "player.tick",',
        '  (e) => {',
        '    const player = e.player;',
        '    const entity = player.world',
        '      .entitiesNear(player.pos, 1.5)',
        '      .filter((candidate) => candidate.type === PLANE && candidate.pos.y < player.pos.y)[0];',
        '    if (entity === undefined) return;',
        '    let fuel = fuelOf(entity);',
        '    const last = entity.data.get("last_pos");',
        '    const pos = entity.pos;',
        '    entity.data.set("last_pos", [pos.x, pos.y, pos.z]);',
        '    const moved =',
        '      Array.isArray(last) &&',
        '      Math.abs(pos.x - Number(last[0])) + Math.abs(pos.y - Number(last[1])) + Math.abs(pos.z - Number(last[2])) > 0.5;',
        '    if (moved && fuel > 0) {',
        '      fuel -= 1;',
        '      entity.data.set("fuel", fuel);',
        '      if (fuel === 0) setEngine(entity, false);',
        '    }',
        '    let gauge = "";',
        '    for (let bar = 0; bar < 10; bar += 1) gauge += bar < Math.ceil((fuel / MAX_FUEL) * 10) ? "|" : ".";',
        '    player.showActionBar(fuel > 0 ? "Fuel [" + gauge + "] " + fuel + " s" : "Out of fuel: use coal on the plane");',
        '  },',
        '  { interval: 20 },',
        ');',
        '',
        '// Using coal or charcoal on the plane adds a minute of fuel, up to five minutes.',
        'msm.events.on("entity.interact", (e) => {',
        '  if (e.entity.type !== PLANE) return;',
        '  const held = e.player.heldItem;',
        '  if (held !== "minecraft:coal" && held !== "minecraft:charcoal") return;',
        '  e.cancel();',
        '  const fuel = fuelOf(e.entity);',
        '  if (fuel >= MAX_FUEL) {',
        '    e.player.showActionBar("The tank is full.");',
        '    return;',
        '  }',
        '  if (!e.player.isCreative) e.player.inventory.remove(held, 1);',
        '  e.entity.data.set("fuel", Math.min(MAX_FUEL, fuel + COAL_SECONDS));',
        '  if (fuel === 0) setEngine(e.entity, true);',
        '  e.world.playSound("minecraft:item.bucket.fill_lava", e.entity.pos, { volume: 0.6 });',
        '  e.player.showActionBar("Fuel: " + Math.min(MAX_FUEL, fuel + COAL_SECONDS) + " s");',
        '});',
      ],
    },
    `The biplane's fuel. Each plane keeps its fuel in seconds in its own saved data (entity.data), starting with a minute. Once a second for each player sitting on a plane, a second burns if the plane moved since the last check, and a text gauge shows above the hotbar; at zero the script sets the plane's speed attributes to 0, so it hangs in the air until refuelled. Using coal or charcoal on it adds a minute, up to five, and starts the engine again. The script cannot ask what a player rides, so a plane right under the player counts as theirs. Scripts run only in the Fabric mod jar export.`,
  );
  return concatBundles(mob, { elements: [script], assets: [] });
}

/** An example of this category. */
function popular(
  slug: string,
  title: string,
  description: string,
  inspiredBy: string,
  kind: string,
  tags: string[],
  build: (context: BundleContext) => ContentBundle,
): ExampleProject {
  return defineExample({
    id: `example_popular_${slug}`,
    title,
    description: `${description} Inspired by: ${inspiredBy}.`,
    kind,
    category: POPULAR_CATEGORY,
    tags: ['popular', ...tags, 'mod'],
    supports: hasFabric,
    build,
  });
}

/** The "Popular ideas" examples, in gallery order. */
export const popularExamples: readonly ExampleProject[] = [
  popular(
    'glowshard',
    'Glowshard: a whole first mod',
    'A glowing ore that generates in caves and drops shards, a block of glowshard, a sword, pickaxe, axe, shovel and hoe, a full suit of armour, an armour trim material and an advancement tab: the beginner route in one project.',
    'ore, tool and armour progression',
    KINDS.item,
    ['ore', 'tools', 'armour', 'trim', 'advancements', 'world generation'],
    glowshard,
  ),
  popular(
    'ember_drake',
    'Ember drake',
    'A drake hatched from its spawn egg, tamed with raw meat, saddled and flown by its owner, that shoots fireballs at monsters and at anything that hurts it.',
    'dragon mounts and pets',
    KINDS.entity,
    ['mount', 'tameable', 'flying', 'ranged attack'],
    emberDrake,
  ),
  popular(
    'cottage_furniture',
    'Cottage furniture',
    'A table, a stool and a lamp with shapes of their own, and a wooden crate that holds items, all crafted from planks. You cannot sit on the stool: MSM has no seats yet.',
    'furniture and decoration',
    KINDS.block,
    ['furniture', 'shape', 'light', 'container'],
    cottageFurniture,
  ),
  popular(
    'camp_stove',
    'Camp stove',
    'A stove that burns fuel and cooks a mushroom, a carrot or a pumpkin into hearty stews that leave a bowl.',
    'cooking and food',
    KINDS.block,
    ['machine', 'recipes', 'food'],
    campStove,
  ),
  popular(
    'pull_charm',
    'Pull charm',
    'A charm that, held in the off hand, pulls dropped items and experience within 8 blocks to you, made with rules and a Run a command step.',
    'item magnets',
    RULES_KIND,
    ['rules', 'item_held', 'run_command'],
    pullCharm,
  ),
  popular(
    'sunken_crypt',
    'Sunken crypt',
    'An underground crypt in gloomy forests and swamps, with loot crates, a Crypt Warden mini-boss with a boss bar who drops the Crypt Key, and a vault door that only the key opens.',
    'dungeons, loot and boss fights',
    KINDS.structure,
    ['structure', 'boss', 'loot table', 'rules', 'key'],
    sunkenCrypt,
  ),
  popular(
    'amber_realm',
    'Amber realm',
    'A warm dimension through an amber-framed portal, filled with its own biome, with an amber ore that generates only there and an Amber Beetle that lives only there.',
    'new dimensions',
    KINDS.dimension,
    ['dimension', 'portal', 'biome', 'ore', 'natural spawning'],
    amberRealm,
  ),
  popular(
    'boomerang',
    'Returning boomerang',
    'A boomerang that comes back to your inventory after each throw, slows and lights up the mob it hits and clatters on blocks.',
    'throwing weapons',
    KINDS.item,
    ['throwable', 'rules', 'thrown_hit_mob'],
    boomerang,
  ),
  popular(
    'paper_glider',
    'Paper glider',
    'A paper glider worn like an elytra, made from the vanilla glider and equippable components.',
    'gliders and flight',
    KINDS.item,
    ['msm:components', 'glider', 'equippable'],
    paperGlider,
  ),
  popular(
    'rocket_boots',
    'Rocket boots',
    'Iron boots that launch you upwards while you sneak, with flames and a soft landing, made with a rule.',
    'movement gear',
    KINDS.item,
    ['armour', 'rules', 'item_worn', 'launch'],
    rocketBoots,
  ),
  popular(
    'orchard_tree',
    'Orchard tree',
    'A plum tree that grows from a sapling and in forests, whose leaves drop ripe plums now and then, and a plum pie (eaten whole: placed pies eaten in slices need a block type MSM lacks).',
    'farming and food',
    KINDS.block,
    ['tree', 'leaves', 'rules', 'block_random_tick', 'food'],
    orchardTree,
  ),
  popular(
    'spell_scrolls',
    'Spell scrolls',
    'Four one-use scrolls made with rules: Mending heals, Blinking teleports you where you look, Storms calls lightning and Frost slows the mobs around you.',
    'magic and spells',
    RULES_KIND,
    ['rules', 'item_used', 'magic', 'teleport'],
    spellScrolls,
  ),
  popular(
    'coordinates_bar',
    'Coordinates bar',
    'Your position and the time of day above the hotbar while you hold a compass, made with one rule.',
    'heads-up displays',
    RULES_KIND,
    ['rules', 'player_every', 'show_action_bar'],
    coordinatesBar,
  ),
  popular(
    'go_kart',
    'Go-kart',
    `A two-seat kart you place from its item, drive with W, A, S and D, honk with a horn and pick up again by sneaking and using it. ${INTERIM_VEHICLE}`,
    'cars and karts',
    KINDS.entity,
    ['vehicle', 'rideable', 'script', 'entity.interact'],
    goKart,
  ),
  popular(
    'mini_tank',
    'Mini tank',
    `A slow armoured tank whose Firing Lever shoots an explosive shell where the driver looks, repaired with iron ingots. ${INTERIM_VEHICLE}`,
    'tanks',
    KINDS.entity,
    ['vehicle', 'rideable', 'script', 'raycast', 'explode'],
    miniTank,
  ),
  popular(
    'biplane',
    'Patchwork biplane',
    `A flying machine that burns fuel while it flies, shows a fuel gauge above the hotbar and refuels with coal. ${INTERIM_VEHICLE}`,
    'planes and flying machines',
    KINDS.entity,
    ['vehicle', 'rideable', 'flying', 'script', 'fuel'],
    biplane,
  ),
  popular(
    'willow_boats',
    'Willow boats',
    'A willow wood set with a boat and a chest boat of its own wood, paddled as vanilla boats and crafted from willow planks.',
    'boats of every wood',
    KINDS.item,
    ['boat', 'wood set', 'chest boat'],
    willowBoats,
  ),
];

// Willow boats (ADR 0110; B539) --------------------------------------------------------------

/**
 * Willow boats: the Wood set flow's log, planks, stairs and slab of a pale green willow and its
 * "Has boats" answer, a boat and a chest boat drawn in the wood's colour.
 */
function willowBoats(context: BundleContext): ContentBundle {
  return flow(woodSetBundle, context, {
    wood_name: 'Willow',
    colour: hexFromRgb(WILLOW),
    members: ['log', 'planks', 'stairs', 'slab'],
    signs: false,
    hanging_signs: false,
    boats: true,
    grows: false,
  });
}

/** The mirror folder of a popular example: its id without the `example_popular_` prefix. */
export function popularFolder(example: ExampleProject): string {
  return example.id.replace(/^example_popular_/, '');
}
