/**
 * The pure model of the Creator (ADR 0043 D3): flows from the library's starters, grouped and
 * checked against the project's target; editing values from stored `meta.creator` values; and
 * what each preview tab shows of a bundle (items, blocks, recipes, armour, stats in words).
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/core';
import type {
  ContentBundle,
  CreatorGroup,
  ProjectStarter,
  StarterParameter,
  TargetFacts,
} from '@msm/plugin-api';
import type { CreatorEntryStatus } from '../../changeset/creator-sets';
import type { ArmourPiece } from '../../preview/geo/armour';
import { defaultRawValue, type RawValue, type RawValues } from '../wizard/wizard-model';

/** The Creator's groups, in display order, with their headings. */
export const CREATOR_GROUPS: readonly { group: CreatorGroup; title: string }[] = [
  { group: 'gear', title: 'Gear' },
  { group: 'blocks', title: 'Blocks' },
  { group: 'food', title: 'Food' },
  { group: 'mobs', title: 'Mobs' },
  { group: 'scripts', title: 'Scripts' },
];

/** The preview tabs, in order, with their labels (`creator-tab-<id>`). */
export const CREATOR_TABS = [
  { id: 'items', label: 'Items' },
  { id: 'blocks', label: 'Blocks' },
  { id: 'recipes', label: 'Recipes' },
  { id: 'armour', label: 'Armour' },
  { id: 'stats', label: 'Stats' },
  { id: 'elements', label: 'Elements' },
] as const;

/** A preview tab id. */
export type CreatorTab = (typeof CREATOR_TABS)[number]['id'];

/** How long the preview waits after the last change before it rebuilds (ADR 0043 D3). */
export const CREATOR_DEBOUNCE_MS = 150;

/** One flow of the picker. */
export interface CreatorFlow {
  starter: ProjectStarter;
  group: CreatorGroup;
  blurb: string;
  /** Why the flow cannot be used on the project's target, or `null`. */
  unavailable: string | null;
}

/** The library's flows (starters with `creator`), checked against `target`. */
export function creatorFlows(
  starters: readonly ProjectStarter[],
  target: TargetFacts,
): CreatorFlow[] {
  return starters.flatMap((starter) => {
    const info = starter.creator;
    if (info === undefined) return [];
    const supported = starter.supports === undefined || starter.supports(target);
    return [
      {
        starter,
        group: info.group,
        blurb: info.blurb,
        unavailable: supported
          ? null
          : `Not available for Minecraft ${target.mcVersion} (this project's target).`,
      },
    ];
  });
}

/** The editing value of a stored value; the default when it does not fit the parameter. */
export function rawFromStored(parameter: StarterParameter, stored: unknown): RawValue {
  switch (parameter.type) {
    case 'boolean':
      return typeof stored === 'boolean' ? stored : defaultRawValue(parameter);
    case 'number':
      return typeof stored === 'number' && Number.isFinite(stored)
        ? String(stored)
        : defaultRawValue(parameter);
    case 'set':
      return Array.isArray(stored) && stored.every((entry) => typeof entry === 'string')
        ? [...stored]
        : defaultRawValue(parameter);
    default:
      return typeof stored === 'string' ? stored : defaultRawValue(parameter);
  }
}

/** The editing values of every parameter from stored values (defaults fill the gaps). */
export function rawValuesFromStored(
  parameters: readonly StarterParameter[] | undefined,
  stored: Readonly<Record<string, unknown>>,
): RawValues {
  return Object.fromEntries(
    (parameters ?? []).map((parameter) => [
      parameter.id,
      rawFromStored(parameter, stored[parameter.id]),
    ]),
  );
}

/** Parameters in groups of declaration order (parameters without a group under "Options"). */
export function parameterGroups(
  parameters: readonly StarterParameter[] | undefined,
): { title: string; parameters: StarterParameter[] }[] {
  const groups: { title: string; parameters: StarterParameter[] }[] = [];
  for (const parameter of parameters ?? []) {
    const title = parameter.group ?? 'Options';
    let group = groups.find((entry) => entry.title === title);
    if (group === undefined) {
      group = { title, parameters: [] };
      groups.push(group);
    }
    group.parameters.push(parameter);
  }
  return groups;
}

type JsonObject = { [key: string]: Json };

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const ITEM_KIND = 'msm:item';
const BLOCK_KIND = 'msm:block';
const RECIPE_KIND = 'minecraft:recipe';
const EQUIPMENT_KIND = 'minecraft:equipment';

/** The bundle elements of one kind. */
export function bundleElementsOfKind(bundle: ContentBundle, kind: string) {
  return bundle.elements.filter((entry) => entry.kind === kind);
}

/** The items of a bundle (`msm:item`). */
export const bundleItems = (bundle: ContentBundle) => bundleElementsOfKind(bundle, ITEM_KIND);
/** The blocks of a bundle (`msm:block`). */
export const bundleBlocks = (bundle: ContentBundle) => bundleElementsOfKind(bundle, BLOCK_KIND);
/** The recipes of a bundle (`minecraft:recipe`). */
export const bundleRecipes = (bundle: ContentBundle) => bundleElementsOfKind(bundle, RECIPE_KIND);

/** What the Armour tab draws: the worn pieces and the two layer textures' ids. */
export interface ArmourPreviewInfo {
  pieces: ArmourPiece[];
  /** The equipment asset's id, for example `ruby:ruby_armor`. */
  equipmentId: string;
  /** Texture id of the `humanoid` layer (helmet, chestplate, boots), or `null`. */
  layer1: string | null;
  /** Texture id of the `humanoid_leggings` layer, or `null`. */
  layer2: string | null;
}

const SLOT_PIECES: Readonly<Record<string, ArmourPiece>> = {
  helmet: 'helmet',
  chestplate: 'chestplate',
  leggings: 'leggings',
  boots: 'boots',
};

/** The armour of a bundle: pieces with `msm:armor` and the equipment asset they name. */
export function bundleArmour(bundle: ContentBundle): ArmourPreviewInfo | null {
  const pieces = new Set<ArmourPiece>();
  let asset: string | undefined;
  for (const item of bundleItems(bundle)) {
    const armor =
      isObject(item.data) && isObject(item.data.components)
        ? item.data.components['msm:armor']
        : undefined;
    if (!isObject(armor)) continue;
    const piece = typeof armor.slot === 'string' ? SLOT_PIECES[armor.slot] : undefined;
    if (piece !== undefined) pieces.add(piece);
    const material = armor.material;
    if (asset === undefined && isObject(material) && typeof material.equipment_asset === 'string') {
      asset = material.equipment_asset;
    }
  }
  if (pieces.size === 0) return null;
  const equipment = bundleElementsOfKind(bundle, EQUIPMENT_KIND).find(
    (entry) => asset === undefined || entry.id === asset,
  );
  const layer = (name: string): string | null => {
    const layers =
      isObject(equipment?.data) && isObject(equipment.data.layers) ? equipment.data.layers : {};
    const list = layers[name];
    const first = Array.isArray(list) ? list[0] : undefined;
    return isObject(first) && typeof first.texture === 'string' ? first.texture : null;
  };
  return {
    pieces: (['helmet', 'chestplate', 'leggings', 'boots'] as const).filter((piece) =>
      pieces.has(piece),
    ),
    equipmentId: equipment?.id ?? asset ?? '',
    layer1: layer('humanoid'),
    layer2: layer('humanoid_leggings'),
  };
}

/** The asset path of an equipment layer texture id (`<ns>:<name>` in `entity/equipment/<layer>/`). */
export function equipmentTexturePath(
  textureId: string,
  layer: 'humanoid' | 'humanoid_leggings',
  texturesFolder: string,
): { namespace: string; path: string } {
  const colon = textureId.indexOf(':');
  const namespace = colon < 0 ? 'minecraft' : textureId.slice(0, colon);
  const name = colon < 0 ? textureId : textureId.slice(colon + 1);
  return { namespace, path: `${texturesFolder}/entity/equipment/${layer}/${name}.png` };
}

/** One element's numbers in words (the Stats tab). */
export interface StatsCard {
  id: string;
  lines: string[];
}

const num = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`;

const TIER_WORDS: Readonly<Record<string, string>> = {
  wooden: 'wooden',
  wood: 'wooden',
  stone: 'stone',
  copper: 'copper',
  iron: 'iron',
  golden: 'golden',
  gold: 'golden',
  diamond: 'diamond',
  netherite: 'netherite',
};

function minesLike(tag: unknown): string | undefined {
  if (typeof tag !== 'string') return undefined;
  const match = /incorrect_for_([a-z]+)_tool$/.exec(tag);
  const word = match?.[1] === undefined ? undefined : TIER_WORDS[match[1]];
  return word === undefined
    ? `cannot mine ${tag} for drops`
    : `mines for drops what a ${word} tool mines`;
}

function toolLines(tool: JsonObject): string[] {
  const type = typeof tool.type === 'string' ? tool.type : 'tool';
  const lines: string[] = [];
  const tier = tool.tier;
  if (typeof tier === 'string') {
    lines.push(`A ${type} of the vanilla ${TIER_WORDS[tier] ?? tier} tier.`);
  } else if (isObject(tier)) {
    lines.push(`A ${type} of the set's own tool material.`);
    const parts: string[] = [];
    const durability = num(tier.durability);
    if (durability !== undefined) parts.push(`durability ${durability}`);
    const speed = num(tier.speed);
    if (speed !== undefined) parts.push(`mining speed ${speed}`);
    const bonus = num(tier.attack_damage_bonus);
    if (bonus !== undefined) parts.push(`attack damage bonus ${bonus}`);
    const enchant = num(tier.enchantment_value);
    if (enchant !== undefined) parts.push(`enchantability ${enchant}`);
    if (parts.length > 0) lines.push(`${parts.join(', ').replace(/^./, (c) => c.toUpperCase())}.`);
    const mines = minesLike(tier.incorrect_blocks_for_drops);
    if (mines !== undefined) lines.push(`It ${mines}.`);
  }
  const damage = num(tool.attack_damage);
  if (damage !== undefined) lines.push(`Attack damage set to ${damage}.`);
  const speed = num(tool.attack_speed);
  if (speed !== undefined) lines.push(`Attack speed set to ${speed}.`);
  return lines;
}

function armourLines(armor: JsonObject): string[] {
  const slot = typeof armor.slot === 'string' ? armor.slot : 'piece';
  const material = armor.material;
  if (typeof material === 'string')
    return [`A ${slot} of the vanilla ${material} armour material.`];
  if (!isObject(material)) return [`A ${slot}.`];
  const lines: string[] = [];
  const defense = isObject(material.defense) ? num(material.defense[slot]) : undefined;
  lines.push(
    defense === undefined
      ? `A ${slot} of the set's own armour material.`
      : `A ${slot} with ${plural(defense, 'armour point')}.`,
  );
  const parts: string[] = [];
  const toughness = num(material.toughness);
  if (toughness !== undefined) parts.push(`toughness ${toughness}`);
  const knockback = num(material.knockback_resistance);
  if (knockback !== undefined) parts.push(`knockback resistance ${knockback}`);
  const enchant = num(material.enchantment_value);
  if (enchant !== undefined) parts.push(`enchantability ${enchant}`);
  if (parts.length > 0) lines.push(`${parts.join(', ').replace(/^./, (c) => c.toUpperCase())}.`);
  const durability = num(material.durability);
  if (durability !== undefined)
    lines.push(`Durability ${durability} times the ${slot}'s multiplier.`);
  return lines;
}

function foodLines(food: JsonObject): string[] {
  const lines: string[] = [];
  const nutrition = num(food.nutrition);
  const saturation = num(food.saturation);
  if (nutrition !== undefined) {
    lines.push(
      `Restores ${plural(nutrition, 'hunger point')}${saturation === undefined ? '' : ` with a saturation of ${saturation}`}.`,
    );
  }
  if (food.can_always_eat === true) lines.push('Can be eaten even when not hungry.');
  return lines;
}

function blockLines(data: JsonObject): string[] {
  const components = isObject(data.components) ? data.components : {};
  const lines: string[] = [];
  const breakable = components['msm:breakable'];
  if (isObject(breakable)) {
    const hardness = num(breakable.hardness);
    const resistance = num(breakable.resistance);
    const parts = [
      hardness === undefined ? undefined : `Hardness ${hardness}`,
      resistance === undefined ? undefined : `blast resistance ${resistance}`,
    ].filter((part) => part !== undefined);
    if (parts.length > 0) lines.push(`${parts.join(', ')}.`);
    const tool = typeof breakable.tool === 'string' ? breakable.tool : undefined;
    const tier = typeof breakable.min_tier === 'string' ? breakable.min_tier : undefined;
    if (tool !== undefined) {
      lines.push(
        `Mined with ${tool === 'axe' ? 'an' : 'a'} ${tool}${tier === undefined ? '' : ` (${TIER_WORDS[tier] ?? tier} or better to drop anything)`}.`,
      );
    }
  }
  const light = components['msm:light_emitter'];
  if (isObject(light) && num(light.level) !== undefined) {
    lines.push(`Gives off light of level ${num(light.level)}.`);
  }
  if (data.loot === 'self') lines.push('Drops itself.');
  return lines;
}

/** The Stats tab: tools, armour, food and blocks of a bundle in words. */
export function bundleStats(bundle: ContentBundle): StatsCard[] {
  const cards: StatsCard[] = [];
  for (const item of bundleItems(bundle)) {
    if (!isObject(item.data)) continue;
    const components = isObject(item.data.components) ? item.data.components : {};
    const lines: string[] = [];
    if (isObject(components['msm:tool'])) lines.push(...toolLines(components['msm:tool']));
    if (isObject(components['msm:armor'])) lines.push(...armourLines(components['msm:armor']));
    if (isObject(components['msm:food'])) lines.push(...foodLines(components['msm:food']));
    const durability = components['msm:durability'];
    const max = isObject(durability) ? num(durability.max) : undefined;
    if (max !== undefined) lines.push(`Breaks after ${max} uses.`);
    if (isObject(components['msm:on_use'])) lines.push('Does something when used (a script).');
    const stack = num(item.data.max_stack_size);
    if (stack !== undefined) lines.push(stack === 1 ? 'Does not stack.' : `Stacks to ${stack}.`);
    if (lines.length > 0) cards.push({ id: item.id, lines });
  }
  for (const block of bundleBlocks(bundle)) {
    if (!isObject(block.data)) continue;
    const lines = blockLines(block.data);
    if (lines.length > 0) cards.push({ id: block.id, lines });
  }
  return cards;
}

/** The order of the Elements tab's sections. */
export const ENTRY_SECTIONS: readonly { title: string; statuses: CreatorEntryStatus[] }[] = [
  { title: 'Will be created', statuses: ['create'] },
  { title: 'Will be replaced', statuses: ['replace'] },
  { title: 'Will be added to', statuses: ['merge'] },
  { title: 'Will be removed', statuses: ['remove'] },
  { title: 'Kept your edits', statuses: ['keep', 'keep-removed'] },
  { title: 'Already in the project (skipped)', statuses: ['conflict'] },
  { title: 'Unchanged', statuses: ['unchanged'] },
  { title: 'No longer used (left in the project)', statuses: ['unused'] },
];
