/**
 * The Goals Creator flow (ADR 0117 D2, D3; B557): a tab of the game's own in the advancements
 * screen, its goals picked from a list (get an item, craft an item, defeat a mob, visit a
 * dimension or biome, reach a height), with a picture on the tab: a flag or a timer drawn by
 * MSM's art generator (ADR 0092) or a vanilla item, over one of vanilla's tab backgrounds.
 *
 * Every goal is a plain advancement, so the tab works in a vanilla data pack. The root is granted
 * on the player's first tick (the criterion of `target.worlds.firstJoinCriterion`, vanilla's
 * `minecraft:tick` where the target has no world facts), so the tab shows at once; each goal hangs
 * from the one before it, so the tab reads as a path. A drawn picture is shown through vanilla
 * components: the root's icon is paper whose `minecraft:item_model` names an item model of the
 * project's own, so no item is added and no mod jar is needed.
 *
 * The Skyblock and Adventure map flows reuse {@link goalsTabBundle} for their goals.
 */
import type {
  BundleContext,
  ContentBundle,
  ContentBundleAsset,
  ContentBundleElement,
  Json,
  JsonObject,
  ResourceLocation,
  StarterParameter,
  TargetFacts,
} from '@msm/plugin-api';
import type { Rgb } from '../assets/png';
import { COLOURS, element, itemModel, KINDS, packElement, rl } from '../content/bundle';
import {
  NAME_MAX_LENGTH,
  NAME_PATTERN,
  nameForms,
  readValues,
  rgbFromHex,
  setValue,
  stringValue,
} from '../content/parameters';
import { drawnTexture } from './pattern-art';

/** One goal of the list: its words, icon and what grants it. */
export interface GoalChoice {
  readonly value: string;
  /** The words of the choice. */
  readonly label: string;
  /** The goal's title in the advancements screen. */
  readonly title: string;
  /** Its description. */
  readonly description: string;
  /** Its icon, a vanilla item. */
  readonly icon: string;
  /** `challenge` for the hard ones; else `task`. */
  readonly frame: 'task' | 'goal' | 'challenge';
  /** The criterion: its trigger and conditions. */
  readonly criterion: JsonObject;
  /** A function run as the player when the goal is reached (`rewards.function`). */
  readonly reward?: ResourceLocation;
  /** What the reward does, for the notes. */
  readonly rewardWords?: string;
}

const hasItem = (item: string): JsonObject => ({
  trigger: 'minecraft:inventory_changed',
  conditions: { items: [{ items: item }] },
});
const crafted = (recipe: string): JsonObject => ({
  trigger: 'minecraft:recipe_crafted',
  conditions: { recipes: recipe },
});
const defeated = (mob: string): JsonObject => ({
  trigger: 'minecraft:player_killed_entity',
  conditions: {
    entity: {
      type: 'minecraft:entity_properties',
      entity: 'this',
      predicate: { entity_type: mob },
    },
  },
});
const travelledTo = (dimension: string): JsonObject => ({
  trigger: 'minecraft:changed_dimension',
  conditions: { to: dimension },
});
const standsIn = (location: JsonObject): JsonObject => ({
  trigger: 'minecraft:location',
  conditions: {
    player: {
      type: 'minecraft:entity_properties',
      entity: 'this',
      predicate: { location },
    },
  },
});

/** The goals the flows offer, in list order. */
export const GOAL_CHOICES: readonly GoalChoice[] = Object.freeze([
  {
    value: 'get_wood',
    label: 'Get some wood',
    title: 'Getting Wood',
    description: 'Get an oak log',
    icon: 'minecraft:oak_log',
    frame: 'task',
    criterion: hasItem('minecraft:oak_log'),
  },
  {
    value: 'get_cobblestone',
    label: 'Get cobblestone',
    title: 'Rock Solid',
    description: 'Get a piece of cobblestone',
    icon: 'minecraft:cobblestone',
    frame: 'task',
    criterion: hasItem('minecraft:cobblestone'),
  },
  {
    value: 'craft_table',
    label: 'Craft a crafting table',
    title: 'Workbench',
    description: 'Craft a crafting table',
    icon: 'minecraft:crafting_table',
    frame: 'task',
    criterion: crafted('minecraft:crafting_table'),
  },
  {
    value: 'craft_furnace',
    label: 'Craft a furnace',
    title: 'Hot Stuff',
    description: 'Craft a furnace',
    icon: 'minecraft:furnace',
    frame: 'task',
    criterion: crafted('minecraft:furnace'),
  },
  {
    value: 'get_iron',
    label: 'Get an iron ingot',
    title: 'Iron Age',
    description: 'Get an iron ingot',
    icon: 'minecraft:iron_ingot',
    frame: 'task',
    criterion: hasItem('minecraft:iron_ingot'),
  },
  {
    value: 'get_diamond',
    label: 'Get a diamond',
    title: 'Shiny!',
    description: 'Get a diamond',
    icon: 'minecraft:diamond',
    frame: 'goal',
    criterion: hasItem('minecraft:diamond'),
  },
  {
    value: 'defeat_zombie',
    label: 'Defeat a zombie',
    title: 'Zombie Hunter',
    description: 'Defeat a zombie',
    icon: 'minecraft:rotten_flesh',
    frame: 'task',
    criterion: defeated('minecraft:zombie'),
  },
  {
    value: 'defeat_creeper',
    label: 'Defeat a creeper',
    title: 'Quiet Now',
    description: 'Defeat a creeper',
    icon: 'minecraft:gunpowder',
    frame: 'task',
    criterion: defeated('minecraft:creeper'),
  },
  {
    value: 'visit_nether',
    label: 'Visit the Nether',
    title: 'Into the Fire',
    description: 'Travel to the Nether',
    icon: 'minecraft:netherrack',
    frame: 'task',
    criterion: travelledTo('minecraft:the_nether'),
  },
  {
    value: 'visit_desert',
    label: 'Visit a desert',
    title: 'Sand Everywhere',
    description: 'Stand in a desert',
    icon: 'minecraft:sand',
    frame: 'task',
    criterion: standsIn({ biomes: 'minecraft:desert' }),
  },
  {
    value: 'visit_ocean',
    label: 'Visit an ocean',
    title: 'Sea Breeze',
    description: 'Stand in an ocean',
    icon: 'minecraft:kelp',
    frame: 'task',
    criterion: standsIn({ biomes: 'minecraft:ocean' }),
  },
  {
    value: 'reach_sky',
    label: 'Climb up high',
    title: 'Sky High',
    description: 'Stand at height 200 or above',
    icon: 'minecraft:feather',
    frame: 'task',
    criterion: standsIn({ position: { y: { min: 200 } } }),
  },
  {
    value: 'reach_deep',
    label: 'Dig down deep',
    title: 'Deep Down',
    description: 'Stand at height -50 or below',
    icon: 'minecraft:deepslate',
    frame: 'task',
    criterion: standsIn({ position: { y: { max: -50 } } }),
  },
  {
    value: 'visit_end',
    label: 'Visit the End',
    title: 'The End?',
    description: 'Travel to the End',
    icon: 'minecraft:end_stone',
    frame: 'goal',
    criterion: travelledTo('minecraft:the_end'),
  },
  {
    value: 'defeat_dragon',
    label: 'Defeat the ender dragon',
    title: 'Dragon Slayer',
    description: 'Defeat the ender dragon',
    icon: 'minecraft:dragon_head',
    frame: 'challenge',
    criterion: defeated('minecraft:ender_dragon'),
  },
]);

/** The pictures the tab can show: drawn ones (a recipe of the art generator) or vanilla items. */
export const GOAL_ICONS: readonly { value: string; label: string; recipe?: 'flag' | 'timer' }[] =
  Object.freeze([
    { value: 'flag', label: 'A flag', recipe: 'flag' },
    { value: 'timer', label: 'A timer', recipe: 'timer' },
    { value: 'minecraft:grass_block', label: 'A grass block' },
    { value: 'minecraft:diamond', label: 'A diamond' },
    { value: 'minecraft:compass', label: 'A compass' },
    { value: 'minecraft:golden_apple', label: 'A golden apple' },
  ]);

/** Vanilla's tab backgrounds. */
export const GOAL_BACKGROUNDS: readonly { value: string; label: string }[] = Object.freeze([
  { value: 'stone', label: 'Stone' },
  { value: 'adventure', label: 'Dirt and grass' },
  { value: 'husbandry', label: 'Hay' },
  { value: 'nether', label: 'Netherrack' },
  { value: 'end', label: 'End stone' },
]);

/** The goals of a new Goals flow. */
const DEFAULT_GOALS = ['get_wood', 'craft_table', 'get_iron', 'visit_nether', 'defeat_dragon'];

/** The Goals flow's questions, groups "Tab" and "Goals". */
export const GOALS_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  {
    id: 'tab_name',
    label: 'What is the tab called?',
    description: 'Its name in the advancements screen. Ids derive from it.',
    group: 'Tab',
    type: 'string',
    default: 'My Goals',
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  },
  {
    id: 'goals',
    label: 'The goals',
    description:
      'Each one is a goal in the tab, in the order of this list: each leads to the next.',
    group: 'Goals',
    type: 'set',
    default: DEFAULT_GOALS,
    min: 1,
    choices: GOAL_CHOICES.map(({ value, label }) => ({ value, label })),
  },
  {
    id: 'icon',
    label: 'The picture on the tab',
    group: 'Tab',
    type: 'choice',
    default: 'flag',
    choices: GOAL_ICONS.map(({ value, label }) => ({ value, label })),
  },
  {
    id: 'icon_colour',
    label: 'Colour of the flag or timer',
    group: 'Tab',
    type: 'colour',
    default: '#c41c34',
  },
  {
    id: 'background',
    label: 'Behind the goals',
    group: 'Tab',
    type: 'choice',
    default: 'stone',
    choices: GOAL_BACKGROUNDS.map(({ value, label }) => ({ value, label })),
  },
]);

/** What {@link goalsTabBundle} makes the tab of. */
export interface GoalsTab {
  /** The path the tab's ids start with: `<ns>:<base>/root`, `<ns>:<base>/<goal>`. */
  base: string;
  /** The tab's title (the root's). */
  title: string;
  /** The root's description. */
  description: string;
  /** Goal values of {@link GOAL_CHOICES}, in order. */
  goals: readonly string[];
  /** A value of {@link GOAL_ICONS}. */
  icon: string;
  /** The colour of a drawn picture. */
  colour: Rgb;
  /** A value of {@link GOAL_BACKGROUNDS}. */
  background: string;
  /** Extra goals of the flow's own, after the picked ones. */
  extra?: readonly GoalChoice[];
}

/** The root advancement id of a tab. */
export const goalsRootId = (namespace: string, base: string): ResourceLocation =>
  rl(namespace, `${base}/root`);

/** The criterion trigger that grants a root at once: the target's first-join criterion. */
function firstTickTrigger(target: TargetFacts): string {
  return target.worlds?.firstJoinCriterion ?? 'minecraft:tick';
}

/** The elements and pictures of a goals tab. */
export function goalsTabBundle(
  namespace: string,
  target: TargetFacts,
  tab: GoalsTab,
): ContentBundle {
  // In the list's order, whatever order the answer gives them in (a set has none).
  const picked = GOAL_CHOICES.filter((goal) => tab.goals.includes(goal.value));
  const goals = [...picked, ...(tab.extra ?? [])];
  const iconChoice = GOAL_ICONS.find((entry) => entry.value === tab.icon) ?? GOAL_ICONS[0];
  const recipe = iconChoice?.recipe;
  const root = goalsRootId(namespace, tab.base);
  const pictureId = rl(namespace, `${tab.base}/${recipe ?? 'icon'}`);
  const icon: Json =
    recipe === undefined
      ? { id: iconChoice?.value ?? 'minecraft:grass_block' }
      : { id: 'minecraft:paper', components: { 'minecraft:item_model': pictureId } };
  const background =
    GOAL_BACKGROUNDS.find((entry) => entry.value === tab.background) ?? GOAL_BACKGROUNDS[0];
  const elements: ContentBundleElement[] = [
    element(
      root,
      KINDS.advancement,
      {
        display: {
          icon,
          title: tab.title,
          description: tab.description,
          background: `minecraft:gui/advancements/backgrounds/${background?.value ?? 'stone'}`,
          frame: 'task',
          show_toast: false,
          announce_to_chat: false,
        },
        criteria: { started: { trigger: firstTickTrigger(target) } },
      },
      `The root of the tab "${tab.title}": an advancement without a parent opens a tab of its own in the advancements screen (L). It is granted on the player's first tick, so the tab shows at once.${recipe === undefined ? '' : ` Its icon is paper showing MSM's drawn ${recipe} through the minecraft:item_model component, which names ${pictureId}; no item is added, so it works in a vanilla data pack.`} The goals below hang from it, each from the one before.`,
    ),
  ];
  let parent = root;
  for (const goal of goals) {
    const id = rl(namespace, `${tab.base}/${goal.value}`);
    elements.push(
      element(
        id,
        KINDS.advancement,
        {
          parent,
          display: {
            icon: { id: goal.icon },
            title: goal.title,
            description: goal.description,
            frame: goal.frame,
          },
          criteria: { done: structuredClone(goal.criterion) as Json },
          ...(goal.reward === undefined ? {} : { rewards: { function: goal.reward } }),
        },
        `A goal: ${goal.description.toLowerCase()}. It shows in the tab once the goal before it is done (parent), and the game grants it when its criterion (${String(goal.criterion.trigger)}) is met.${goal.reward === undefined ? '' : ` Then it runs ${goal.reward} as the player (rewards): ${goal.rewardWords ?? 'its reward'}.`}`,
      ),
    );
    parent = id;
  }
  const assets: ContentBundleAsset[] = [];
  if (recipe !== undefined) {
    const path = `${tab.base}/${recipe}`;
    elements.push(
      element(
        pictureId,
        KINDS.itemDefinition,
        { model: { type: 'minecraft:model', model: rl(namespace, `item/${path}`) } },
        `What the tab's icon looks like: the root's icon names ${pictureId} in its minecraft:item_model component, and this definition shows the flat model below.`,
      ),
      itemModel(
        namespace,
        path,
        'minecraft:item/generated',
        `The tab icon's flat model, drawn from textures/item/${path}.png (MSM's drawn ${recipe}).`,
      ),
    );
    assets.push(drawnTexture(namespace, `item/${path}`, recipe, tab.colour));
  }
  return { elements, assets };
}

export function goalsBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName, target } = context;
  const values = readValues(GOALS_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'tab_name'));
  const tab = goalsTabBundle(namespace, target, {
    base: name.id,
    title: name.display,
    description: 'Goals to reach',
    goals: setValue(values, 'goals'),
    icon: stringValue(values, 'icon'),
    colour: rgbFromHex(stringValue(values, 'icon_colour'), COLOURS.ruby),
    background: stringValue(values, 'background'),
  });
  return {
    elements: [packElement(namespace, `${projectName}: ${name.lower}`), ...tab.elements],
    assets: tab.assets,
  };
}
