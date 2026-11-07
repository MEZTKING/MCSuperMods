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
  VanillaToolStats,
} from '@msm/plugin-api';
import type { CreatorEntryStatus } from '../../changeset/creator-sets';
import type { ArmourPiece } from '../../preview/geo/armour';
import { defaultRawValue, type RawValue, type RawValues } from '../wizard/wizard-model';
import {
  actionEffectRows,
  consumeEffectRows,
  type EffectRow,
  enchantmentCards,
  idWords,
  paintingCards,
  tidyNumber,
} from './creator-cards';

/** The Creator's groups, in display order, with their headings. */
export const CREATOR_GROUPS: readonly { group: CreatorGroup; title: string }[] = [
  { group: 'gear', title: 'Gear' },
  { group: 'blocks', title: 'Blocks' },
  { group: 'food', title: 'Food' },
  { group: 'mobs', title: 'Mobs' },
  { group: 'scripts', title: 'Scripts' },
  { group: 'worlds', title: 'Worlds' },
];

/** The preview tabs, in order, with their labels (`creator-tab-<id>`). */
export const CREATOR_TABS = [
  { id: 'items', label: 'Items' },
  { id: 'blocks', label: 'Blocks' },
  { id: 'recipes', label: 'Recipes' },
  { id: 'armour', label: 'Armour' },
  { id: 'stats', label: 'Stats' },
  { id: 'card', label: 'Card' },
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

/** The body armour equipment layers the Armour tab shows as flat textures (ADR 0044 D5). */
export type BodyArmourLayer = 'horse_body' | 'wolf_body';

/** One body armour layer of the Armour tab. */
export interface BodyLayerInfo {
  layer: BodyArmourLayer;
  /** "Horse armour" or "Wolf armour". */
  label: string;
  /** The layer's texture id. */
  texture: string;
}

/** What the Armour tab draws: the worn pieces and the two layer textures' ids. */
export interface ArmourPreviewInfo {
  /** The humanoid pieces (may be empty when the bundle has only horse or wolf armour). */
  pieces: ArmourPiece[];
  /** Horse and wolf armour layers of the pieces with slot `horse` or `wolf`. */
  bodyLayers: BodyLayerInfo[];
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

const BODY_SLOTS: Readonly<Record<string, { layer: BodyArmourLayer; label: string }>> = {
  horse: { layer: 'horse_body', label: 'Horse armour' },
  wolf: { layer: 'wolf_body', label: 'Wolf armour' },
};

/** The armour of a bundle: pieces with `msm:armor` and the equipment asset they name. */
export function bundleArmour(bundle: ContentBundle): ArmourPreviewInfo | null {
  const pieces = new Set<ArmourPiece>();
  const bodies = new Set<string>();
  let asset: string | undefined;
  for (const item of bundleItems(bundle)) {
    const armor =
      isObject(item.data) && isObject(item.data.components)
        ? item.data.components['msm:armor']
        : undefined;
    if (!isObject(armor)) continue;
    const piece = typeof armor.slot === 'string' ? SLOT_PIECES[armor.slot] : undefined;
    if (piece !== undefined) pieces.add(piece);
    if (typeof armor.slot === 'string' && BODY_SLOTS[armor.slot] !== undefined) {
      bodies.add(armor.slot);
    }
    const material = armor.material;
    if (asset === undefined && isObject(material) && typeof material.equipment_asset === 'string') {
      asset = material.equipment_asset;
    }
  }
  if (pieces.size === 0 && bodies.size === 0) return null;
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
    bodyLayers: (['horse', 'wolf'] as const).flatMap((slot) => {
      const body = BODY_SLOTS[slot] as { layer: BodyArmourLayer; label: string };
      const texture = bodies.has(slot) ? layer(body.layer) : null;
      return texture === null ? [] : [{ ...body, texture }];
    }),
    equipmentId: equipment?.id ?? asset ?? '',
    layer1: layer('humanoid'),
    layer2: layer('humanoid_leggings'),
  };
}

/** The asset path of an equipment layer texture id (`<ns>:<name>` in `entity/equipment/<layer>/`). */
export function equipmentTexturePath(
  textureId: string,
  layer: 'humanoid' | 'humanoid_leggings' | BodyArmourLayer,
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
  /** The effects it gives (consumables, charms, totems), shown as a table. */
  effects?: EffectRow[];
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

/** Vanilla tool numbers by tier and type (`ItemFacts.vanillaTools`, ADR 0050). */
export type VanillaTools = Readonly<Record<string, Readonly<Record<string, VanillaToolStats>>>>;

/** The facts key of a tier name: `wood` and `gold` are `wooden` and `golden`. */
const TIER_KEYS: Readonly<Record<string, string>> = { wood: 'wooden', gold: 'golden' };

/** "Attack damage 6, 1.6 attacks per second, durability 250, …" for a vanilla tool. */
function vanillaToolLine(stats: VanillaToolStats, tier: string, type: string): string {
  const parts = [
    `attack damage ${stats.attackDamage}`,
    `${stats.attackSpeed} attacks per second`,
    `durability ${stats.durability}`,
    ...(stats.miningSpeed === undefined ? [] : [`mining speed ${stats.miningSpeed}`]),
    `enchantability ${stats.enchantability}`,
  ];
  const text = parts.join(', ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}, as a vanilla ${tier} ${type}.`;
}

function toolLines(tool: JsonObject, vanillaTools?: VanillaTools): string[] {
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
  if (typeof tier === 'string') {
    const words = TIER_WORDS[tier] ?? tier;
    const stats = vanillaTools?.[TIER_KEYS[tier] ?? tier]?.[type];
    if (stats !== undefined && damage === undefined && speed === undefined) {
      lines.push(vanillaToolLine(stats, words, type));
    } else if (stats !== undefined) {
      lines.push(
        `A vanilla ${words} ${type} has attack damage ${stats.attackDamage} and ${stats.attackSpeed} attacks per second.`,
      );
    } else if (damage === undefined && speed === undefined) {
      lines.push(`Attack damage and speed of a vanilla ${words} ${type}.`);
    }
  }
  if (type === 'spear') lines.push('Attacks with a charged thrust and a quick jab.');
  if (type === 'mace') lines.push('Hits harder the further its holder falls before the hit.');
  return lines;
}

function armourLines(armor: JsonObject): string[] {
  const rawSlot = typeof armor.slot === 'string' ? armor.slot : 'piece';
  const body = BODY_SLOTS[rawSlot];
  const slot = body === undefined ? rawSlot : body.label.toLowerCase();
  const material = armor.material;
  if (typeof material === 'string')
    return [`A ${slot} of the vanilla ${material} armour material.`];
  if (!isObject(material)) return [`A ${slot}.`];
  const lines: string[] = [];
  // Custom horse and wolf armour use `body`, else the chestplate defence (ADR 0044 D5, ADR 0050 D4).
  const defenseOf = (key: string): number | undefined =>
    isObject(material.defense) ? num(material.defense[key]) : undefined;
  const defense =
    body === undefined ? defenseOf(rawSlot) : (defenseOf('body') ?? defenseOf('chestplate'));
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
  if (durability !== undefined && body === undefined)
    lines.push(`Durability ${durability} times the ${slot}'s multiplier.`);
  return lines;
}

/** The ranged weapon lines (`msm:ranged_weapon`): factors against vanilla. */
function rangedLines(ranged: JsonObject): string[] {
  const type = ranged.type === 'crossbow' ? 'crossbow' : 'bow';
  const lines = [`A ${type} that shoots vanilla arrows.`];
  const draw = num(ranged.draw_speed);
  if (draw !== undefined) {
    lines.push(
      `${type === 'bow' ? 'Draws' : 'Charges'} ${tidyNumber(draw)} times as fast as a vanilla ${type}.`,
    );
  }
  const velocity = num(ranged.velocity);
  if (velocity !== undefined) lines.push(`Arrows fly ${tidyNumber(velocity)} times as fast.`);
  const multiplier = num(ranged.damage_multiplier);
  if (multiplier !== undefined)
    lines.push(`Arrows deal ${tidyNumber(multiplier)} times the damage.`);
  const inaccuracy = num(ranged.inaccuracy);
  if (inaccuracy !== undefined) lines.push(`Inaccuracy ${tidyNumber(inaccuracy)} times vanilla's.`);
  return lines;
}

/** The shield lines (`msm:shield`). */
function shieldLines(shield: JsonObject): string[] {
  const lines = ['A shield.'];
  const delay = num(shield.block_delay_seconds);
  if (delay !== undefined) {
    lines.push(`Starts blocking ${tidyNumber(delay)} seconds after it is raised.`);
  }
  const reduction = num(shield.damage_reduction);
  if (reduction !== undefined) {
    lines.push(`Blocks ${Math.round(reduction * 100)} per cent of the damage from the front.`);
  }
  const scale = num(shield.disable_cooldown_scale);
  if (scale !== undefined) {
    lines.push(`An axe disables it for ${tidyNumber(scale)} times vanilla's cooldown.`);
  }
  if (typeof shield.bypassed_by === 'string') {
    lines.push(`Does not block damage of the types in ${shield.bypassed_by}.`);
  }
  return lines;
}

/** The consumable lines (`msm:consumable`): time, leftover and cooldown. */
function consumableLines(consumable: JsonObject): string[] {
  const lines: string[] = [];
  const seconds = num(consumable.seconds);
  const verb =
    consumable.animation === 'drink' ? 'drink' : consumable.animation === 'eat' ? 'eat' : 'use';
  if (seconds !== undefined) {
    lines.push(`Takes ${tidyNumber(seconds)} second${seconds === 1 ? '' : 's'} to ${verb}.`);
  }
  if (typeof consumable.converts_to === 'string') {
    lines.push(`Leaves ${idWords(consumable.converts_to).toLowerCase()} behind.`);
  } else {
    lines.push('Is used up.');
  }
  const cooldown = num(consumable.cooldown_seconds);
  if (cooldown !== undefined && cooldown > 0) {
    lines.push(`Then waits ${tidyNumber(cooldown)} seconds before it can be used again.`);
  }
  return lines;
}

/** The death protection lines (`msm:death_protection`). */
function deathProtectionLines(protection: JsonObject): string[] {
  return [
    'Held in either hand, it saves its holder from death once and is used up.',
    protection.clear_effects === true
      ? "Clears the holder's effects first."
      : "Keeps the holder's effects.",
  ];
}

/** The effects of an item's use event, when its actions apply effects (a charm). */
function useEventEffects(data: JsonObject, components: JsonObject): EffectRow[] {
  const onUse = components['msm:on_use'];
  if (!isObject(onUse) || typeof onUse.event !== 'string') return [];
  const events = isObject(data.events) ? data.events : {};
  const event = events[onUse.event];
  return isObject(event) ? actionEffectRows(event.actions) : [];
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
export function bundleStats(bundle: ContentBundle, vanillaTools?: VanillaTools): StatsCard[] {
  const cards: StatsCard[] = [];
  for (const item of bundleItems(bundle)) {
    if (!isObject(item.data)) continue;
    const components = isObject(item.data.components) ? item.data.components : {};
    const lines: string[] = [];
    let effects: EffectRow[] = [];
    if (isObject(components['msm:tool']))
      lines.push(...toolLines(components['msm:tool'], vanillaTools));
    if (isObject(components['msm:ranged_weapon'])) {
      lines.push(...rangedLines(components['msm:ranged_weapon']));
    }
    if (isObject(components['msm:shield'])) lines.push(...shieldLines(components['msm:shield']));
    if (isObject(components['msm:armor'])) lines.push(...armourLines(components['msm:armor']));
    if (isObject(components['msm:food'])) lines.push(...foodLines(components['msm:food']));
    const consumable = components['msm:consumable'];
    if (isObject(consumable)) {
      lines.push(...consumableLines(consumable));
      effects = consumeEffectRows(consumable.effects);
    }
    const protection = components['msm:death_protection'];
    if (isObject(protection)) {
      lines.push(...deathProtectionLines(protection));
      effects = [...effects, ...consumeEffectRows(protection.effects)];
    }
    const durability = components['msm:durability'];
    const max = isObject(durability) ? num(durability.max) : undefined;
    if (max !== undefined) lines.push(`Breaks after ${max} uses.`);
    const onUse = components['msm:on_use'];
    if (isObject(onUse)) {
      const used = useEventEffects(item.data, components);
      if (used.length > 0) {
        effects = [...effects, ...used];
        lines.push('Using it gives the effects below; it is not used up.');
      } else {
        lines.push('Does something when used (its event).');
      }
      const ticks = num(onUse.cooldown_ticks);
      if (ticks !== undefined && ticks > 0) {
        lines.push(`Then waits ${tidyNumber(ticks / 20)} seconds before it can be used again.`);
      }
    }
    const stack = num(item.data.max_stack_size);
    if (stack !== undefined) lines.push(stack === 1 ? 'Does not stack.' : `Stacks to ${stack}.`);
    if (lines.length > 0 || effects.length > 0) {
      cards.push(effects.length > 0 ? { id: item.id, lines, effects } : { id: item.id, lines });
    }
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

/** Whether a bundle has anything for the Card tab (enchantments or paintings). */
export function bundleHasCards(bundle: ContentBundle): boolean {
  return enchantmentCards(bundle).length > 0 || paintingCards(bundle).length > 0;
}

/**
 * The tab a newly picked flow opens on: Items, else Blocks, else Card, else Stats, else
 * Elements, so a Painting or an Enchantment opens on its card.
 */
export function firstTab(bundle: ContentBundle): CreatorTab {
  if (bundleItems(bundle).length > 0) return 'items';
  if (bundleBlocks(bundle).length > 0) return 'blocks';
  if (bundleHasCards(bundle)) return 'card';
  if (bundleStats(bundle).length > 0) return 'stats';
  return 'elements';
}
