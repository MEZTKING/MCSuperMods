/**
 * "Surprise me" (ADR 0086): a small themed mod from a seed. The generator picks a theme, a
 * material (an ore or a gear set) and two to four extras from different slots of
 * {@link FLOW_RECIPES}, answers every question of each Creator flow from the flow's own
 * parameter list (numbers near the default within the allowed range and on its steps, any
 * choice, a share of a set, theme colours, theme names, no pictures so the flow draws its
 * tinted placeholder), builds the bundles and plans them one after another against the
 * project, exactly as the Creator would, so every set reopens in the Creator and nothing
 * clashes with what the project or an earlier thing already has. With rules it may add one
 * rule book ("sometimes an extra gem drops from the ore").
 *
 * Pure and seeded: the same seed, theme, project and target give the same mod. No DOM.
 *
 * @packageDocumentation
 */

import type { Element, Json, Project, ResourceLocation } from '@msm/core';
import type {
  ContentBundle,
  ContentBundleAsset,
  ProjectStarter,
  StarterParameter,
  TargetFacts,
} from '@msm/plugin-api';
import { type ChangeItem, type NewChangeItem, planChangeItems } from '../changeset/changeset';
import {
  creatorChanges,
  creatorValues,
  isMergeableKind,
  planCreate,
  SINGLETON_KINDS,
} from '../changeset/creator-sets';
import {
  FLOW_RECIPES,
  type FlowRecipe,
  SLOT_WEIGHTS,
  SURPRISE_THEMES,
  type SurpriseSlot,
  type SurpriseTheme,
} from './themes';

export { FLOW_RECIPES, SURPRISE_THEMES, type SurpriseTheme } from './themes';

/** The rule book kind (`@msm/plugin-rules`); the generator does not import the plugin. */
export const SURPRISE_RULES_KIND = 'msm:rules';

/** The largest seed; seeds are whole numbers from 1. */
export const MAX_SEED = 999_999;

/** A random number generator: each call gives a number in [0, 1). */
export type Random = () => number;

/** mulberry32: a small seeded generator, the same sequence for the same seed everywhere. */
export function seededRandom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** A new seed from `random` (default `Math.random`), from 1 to {@link MAX_SEED}. */
export function newSeed(random: Random = Math.random): number {
  return 1 + Math.floor(random() * MAX_SEED);
}

/** Whether `value` is a usable seed. */
export function isSeed(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= MAX_SEED;
}

const pick = <T>(random: Random, list: readonly T[]): T =>
  list[Math.floor(random() * list.length)] as T;

function pickWeighted<T>(random: Random, list: readonly T[], weight: (entry: T) => number): T {
  const total = list.reduce((sum, entry) => sum + weight(entry), 0);
  let left = random() * total;
  for (const entry of list) {
    left -= weight(entry);
    if (left < 0) return entry;
  }
  return list[list.length - 1] as T;
}

/** A theme by id, or `undefined`. */
export function themeById(id: string | null | undefined): SurpriseTheme | undefined {
  return SURPRISE_THEMES.find((theme) => theme.id === id);
}

/** The theme a seed picks when none is chosen. */
export function themeOfSeed(seed: number): SurpriseTheme {
  return pick(seededRandom(seed ^ 0x5bd1e995), SURPRISE_THEMES);
}

// Answers ----------------------------------------------------------------------------------

const roundTo = (value: number): number => Number(value.toFixed(6));

/** A number near the default, within the allowed range and on its steps. */
function randomNumber(parameter: StarterParameter & { type: 'number' }, random: Random): number {
  const fallback = parameter.default;
  const min = parameter.min ?? Math.min(0, fallback);
  const max = parameter.max ?? Math.max(fallback * 2, fallback + 10);
  const low = fallback - (fallback - min) / 2;
  const high = fallback + (max - fallback) / 2;
  let value = low + random() * (high - low);
  const step = parameter.step;
  if (step !== undefined && step > 0) {
    const base = parameter.min ?? 0;
    value = base + Math.round((value - base) / step) * step;
    while (value > max + 1e-9) value -= step;
    while (value < min - 1e-9) value += step;
  }
  return roundTo(Math.min(max, Math.max(min, value)));
}

/** A share of a set's choices: most of the default ones, a few others, at least `min`. */
function randomSet(parameter: StarterParameter & { type: 'set' }, random: Random): string[] {
  const chosen = parameter.choices
    .map((choice) => choice.value)
    .filter((value) => random() < (parameter.default.includes(value) ? 0.85 : 0.25));
  const wanted = Math.max(parameter.min ?? 0, parameter.default.length > 0 ? 1 : 0);
  for (const value of [...parameter.default, ...parameter.choices.map((choice) => choice.value)]) {
    if (chosen.length >= wanted) break;
    if (!chosen.includes(value)) chosen.push(value);
  }
  const order = parameter.choices.map((choice) => choice.value);
  return chosen.sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

/** The counterpart id of a `min`/`max` pair (`drop_min` and `drop_max`, `min_y` and `max_y`). */
function maxPartner(id: string): string | null {
  if (/(^|_)min(_|$)/.test(id)) return id.replace(/(^|_)min(_|$)/, '$1max$2');
  return null;
}

/**
 * Random answers for every question of `parameters`: numbers near their defaults, any choice
 * (but `avoid`), a share of each set, colours from `colours` (the first colour question gets
 * the first colour), no pictures or sounds, string answers kept at their defaults, then
 * `fixed` over the top. A number pair `x_min`/`x_max` (or `min_x`/`max_x`) is put in order.
 */
export function randomAnswers(
  parameters: readonly StarterParameter[] | undefined,
  random: Random,
  options: {
    colours?: readonly string[];
    fixed?: Readonly<Record<string, Json>>;
    avoid?: Readonly<Record<string, readonly string[]>>;
  } = {},
): Record<string, Json> {
  const values: Record<string, Json> = {};
  let colourIndex = 0;
  for (const parameter of parameters ?? []) {
    switch (parameter.type) {
      case 'number':
        values[parameter.id] = randomNumber(parameter, random);
        break;
      case 'boolean':
        values[parameter.id] = random() < 0.65 ? parameter.default : !parameter.default;
        break;
      case 'choice': {
        const avoid = options.avoid?.[parameter.id] ?? [];
        const allowed = parameter.choices.filter((choice) => !avoid.includes(choice.value));
        values[parameter.id] =
          allowed.length === 0 ? parameter.default : pick(random, allowed).value;
        break;
      }
      case 'set':
        values[parameter.id] = randomSet(parameter, random);
        break;
      case 'colour': {
        const colours = options.colours ?? [];
        values[parameter.id] =
          colours.length === 0
            ? parameter.default
            : colourIndex === 0
              ? (colours[0] as string)
              : pick(random, colours);
        colourIndex += 1;
        break;
      }
      case 'image':
      case 'audio':
        values[parameter.id] = null;
        break;
      default:
        values[parameter.id] = parameter.default;
    }
  }
  for (const parameter of parameters ?? []) {
    const partner = maxPartner(parameter.id);
    if (partner === null) continue;
    const low = values[parameter.id];
    const high = values[partner];
    if (typeof low === 'number' && typeof high === 'number' && low > high) {
      values[parameter.id] = high;
      values[partner] = low;
    }
  }
  for (const [id, value] of Object.entries(options.fixed ?? {})) {
    if ((parameters ?? []).some((parameter) => parameter.id === id)) values[id] = value;
  }
  return values;
}

/**
 * "Pick for me" in the Creator (ADR 0086 D6): random answers for one flow from `seed`. A flow
 * with a recipe gets a theme's names and colours; any other flow keeps its names.
 */
export function pickForMe(starter: ProjectStarter, seed: number): Record<string, Json> {
  const random = seededRandom(seed);
  const theme = pick(random, SURPRISE_THEMES);
  const recipe = FLOW_RECIPES.find((entry) => entry.flowId === starter.id);
  const values = randomAnswers(starter.parameters, random, {
    colours: theme.colours,
    ...(recipe?.fixed === undefined ? {} : { fixed: recipe.fixed }),
    ...(recipe?.avoid === undefined ? {} : { avoid: recipe.avoid }),
  });
  for (const [id, template] of Object.entries(recipe?.names ?? {})) {
    const names = template(theme.word, values);
    if (names.length > 0) values[id] = pick(random, names);
  }
  return values;
}

// The mod ----------------------------------------------------------------------------------

/** What the generator needs. */
export interface SurpriseInput {
  seed: number;
  /** The chosen theme; absent or unknown means the seed's own ({@link themeOfSeed}). */
  themeId?: string | null;
  /** The library's starters (the Creator flows are those with `creator`). */
  starters: readonly ProjectStarter[];
  target: TargetFacts;
  /** The namespace the things go in. */
  namespace: string;
  /** The project the things are added to (an empty one for a new mod). */
  project: Project;
  isKnownKind(kind: string): boolean;
  /** Whether a rule book may be added (the rules kind is registered). */
  rules: boolean;
  /** A new Creator set id per thing (default: `surprise-<seed>-<elements in project>-<n>`). */
  newSetId?(): string;
}

/** One thing of a surprise: one Creator flow with its answers. */
export interface SurpriseThing {
  flowId: string;
  /** The flow's title ("Gear set"). */
  title: string;
  /** What it is in words ("a gear set"). */
  what: string;
  /** Its name ("Ruby"). */
  name: string;
  /** The flow's answers, as `meta.creator.values` stores them. */
  values: Record<string, Json>;
  bundle: ContentBundle;
  /** The shown names of the blocks, items, mobs and effects it makes. */
  makes: string[];
  /** Up to three of its pictures (item and block textures first). */
  pictures: ContentBundleAsset[];
}

/** The rule a surprise may add. */
export interface SurpriseRule {
  /** The rule book's id. */
  id: ResourceLocation;
  /** The rule in words. */
  sentence: string;
}

/** A rolled surprise. */
export interface SurpriseMod {
  seed: number;
  theme: SurpriseTheme;
  /** The new mod's name ("Ruby Mod"). */
  modName: string;
  things: SurpriseThing[];
  rule: SurpriseRule | null;
  /** Every change, in order, ready for `applyChangeset` as one undo step. */
  items: ChangeItem[];
  /** The undo label. */
  label: string;
}

type JsonObject = { [key: string]: Json };

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function elementsOf(project: Project): Element[] {
  return project.namespaces.flatMap((namespace) => namespace.elements);
}

/**
 * Whether a bundle's ids or files clash with what `project` already has. Pack and mod settings,
 * language files and tags are shared; so is an id the same flow made for another of its sets
 * (the Custom ore flow's advancement tab root, the Custom mob flow's death function), which the
 * Creator keeps as it is.
 */
export function bundleClashes(bundle: ContentBundle, project: Project, flowId?: string): boolean {
  const ids = new Map(elementsOf(project).map((element) => [element.id as string, element]));
  for (const entry of bundle.elements) {
    if (SINGLETON_KINDS.includes(entry.kind)) continue;
    const existing = ids.get(entry.id);
    if (existing === undefined) continue;
    if (existing.kind === entry.kind && isMergeableKind(entry.kind)) continue;
    if (flowId !== undefined && existing.meta.creator?.flowId === flowId) continue;
    return true;
  }
  for (const asset of bundle.assets) {
    const recorded = project.namespaces
      .find((namespace) => namespace.name === asset.namespace)
      ?.assets.some((entry) => entry.path === asset.path);
    if (recorded === true) return true;
  }
  return false;
}

/** The kinds whose things a surprise lists by name, in order. */
const NAMED_KINDS = ['msm:block', 'msm:item', 'msm:entity', 'msm:effect', 'msm:potion'];

/** The language key prefixes of an id's name (`item.<ns>.<path>` and the like). */
const LANG_PREFIXES = ['item', 'block', 'entity', 'effect', 'item.minecraft.potion.effect'];

/** The shown name of a bundle element: its `display_name`, else its English name, else `null`. */
function nameIn(bundle: ContentBundle, id: string): string | null {
  const entry = bundle.elements.find((element) => element.id === id);
  if (entry !== undefined && isObject(entry.data) && typeof entry.data.display_name === 'string') {
    if (entry.data.display_name !== '') return entry.data.display_name;
  }
  const colon = id.indexOf(':');
  const key = `${id.slice(0, colon)}.${id.slice(colon + 1).replaceAll('/', '.')}`;
  for (const lang of bundle.elements) {
    if (lang.kind !== 'minecraft:lang' || !isObject(lang.data)) continue;
    for (const prefix of LANG_PREFIXES) {
      const name = lang.data[`${prefix}.${key}`];
      if (typeof name === 'string' && name !== '') return name;
    }
  }
  return null;
}

/** The shown names a bundle makes (blocks, items, mobs, effects, potions). */
function namesOf(bundle: ContentBundle): string[] {
  const names: string[] = [];
  for (const kind of NAMED_KINDS) {
    for (const entry of bundle.elements) {
      if (entry.kind !== kind) continue;
      const name = nameIn(bundle, entry.id);
      if (name !== null && !names.includes(name)) names.push(name);
    }
  }
  return names;
}

/**
 * Up to three PNG pictures: item textures, then block textures, then the first particle frame;
 * skins, bow pulls and later particle frames are left out.
 */
function picturesOf(bundle: ContentBundle): ContentBundleAsset[] {
  const rank = (path: string): number =>
    /_pulling_\d+\.png$/.test(path) || /\/particle\/.*_[1-9]\d*\.png$/.test(path)
      ? -1
      : path.includes('/item/')
        ? 0
        : path.includes('/block/')
          ? 1
          : path.includes('/particle/')
            ? 2
            : -1;
  return bundle.assets
    .filter((asset) => asset.path.endsWith('.png') && rank(asset.path) >= 0)
    .sort((a, b) => rank(a.path) - rank(b.path))
    .slice(0, 3);
}

/** The flows a surprise can use on this target, by recipe. */
function usableRecipes(input: SurpriseInput): FlowRecipe[] {
  return FLOW_RECIPES.filter((recipe) => {
    const starter = input.starters.find((entry) => entry.id === recipe.flowId);
    return (
      starter?.creator !== undefined &&
      (starter.supports === undefined || starter.supports(input.target)) &&
      starter.requiresKinds.every((kind) => input.isKnownKind(kind))
    );
  });
}

/** The slots and flows of a surprise: one material, then two to four extras. */
function chooseRecipes(random: Random, usable: readonly FlowRecipe[]): FlowRecipe[] {
  const inSlot = (slot: SurpriseSlot) => usable.filter((recipe) => recipe.slot === slot);
  const chosen: FlowRecipe[] = [];
  const materials = inSlot('material');
  if (materials.length > 0) chosen.push(pickWeighted(random, materials, (r) => r.weight ?? 1));
  const extras = 2 + Math.floor(random() * 3);
  let slots = (Object.keys(SLOT_WEIGHTS) as Exclude<SurpriseSlot, 'material'>[]).filter(
    (slot) => inSlot(slot).length > 0,
  );
  while (chosen.length < extras + 1 && slots.length > 0) {
    const slot = pickWeighted(random, slots, (entry) => SLOT_WEIGHTS[entry]);
    slots = slots.filter((entry) => entry !== slot);
    chosen.push(pickWeighted(random, inSlot(slot), (r) => r.weight ?? 1));
  }
  return chosen;
}

/** The names to try for a recipe: each candidate in turn, then numbered ones. */
function nameAttempts(
  recipe: FlowRecipe,
  word: string,
  values: Readonly<Record<string, Json>>,
  random: Random,
): Record<string, string>[] {
  const lists = Object.entries(recipe.names).map(
    ([id, template]) => [id, template(word, values)] as const,
  );
  const length = Math.max(1, ...lists.map(([, list]) => list.length));
  const start = Math.floor(random() * length);
  const attempts: Record<string, string>[] = [];
  for (let offset = 0; offset < length; offset += 1) {
    const index = (start + offset) % length;
    attempts.push(
      Object.fromEntries(lists.map(([id, list]) => [id, list[index % list.length] as string])),
    );
  }
  const first = attempts[0] ?? {};
  for (let number = 2; number <= 9; number += 1) {
    attempts.push(
      Object.fromEntries(Object.entries(first).map(([id, name]) => [id, `${name} ${number}`])),
    );
  }
  return attempts;
}

/**
 * One item per element: an update of an element an earlier item creates goes into that create,
 * and two updates of one element become one (the first `before`, the last `after`). The
 * session's changeset replays its commands, so an element made by the same command cannot be
 * changed again by it.
 */
export function foldItems(items: readonly ChangeItem[]): ChangeItem[] {
  const out: ChangeItem[] = [];
  const byElement = new Map<string, number>();
  for (const item of items) {
    const id = item.elementId;
    const index = id === undefined ? undefined : byElement.get(id);
    const earlier = index === undefined ? undefined : out[index];
    if (item.op === 'update' && earlier !== undefined && index !== undefined) {
      out[index] = { ...earlier, after: item.after as Json };
      continue;
    }
    if (id !== undefined && (item.op === 'create' || item.op === 'update')) {
      byElement.set(id, out.length);
    }
    out.push(item);
  }
  return out;
}

const toItems = (items: readonly NewChangeItem[], start: number): ChangeItem[] =>
  items.map((item, index) => ({
    ...item,
    itemId: `surprise-${start + index + 1}`,
    accepted: true,
    problems: [],
  }));

/** The ore block and its gem among the things, for the rule. */
function oreAndGem(
  things: readonly SurpriseThing[],
): { ore: string; oreName: string; gem: string; gemName: string } | null {
  const material = things.find(
    (thing) => thing.flowId === 'custom_ore' || thing.flowId === 'gear-set',
  );
  if (material === undefined) return null;
  const blocks = material.bundle.elements.filter((entry) => entry.kind === 'msm:block');
  const ore = blocks.find(
    (entry) => /(^|[:_/])ore$|_ore$/.test(entry.id) && !entry.id.includes('deepslate'),
  );
  if (ore === undefined) return null;
  const blockIds = new Set(blocks.map((entry) => entry.id));
  const items = material.bundle.elements.filter(
    (entry) => entry.kind === 'msm:item' && !blockIds.has(entry.id),
  );
  const slug = ore.id.replace(/_ore$/, '');
  const gem =
    items.find((entry) => entry.id === slug) ??
    items.find(
      (entry) =>
        entry.id.startsWith(`${slug}_`) &&
        !/(sword|pickaxe|axe|shovel|hoe|helmet|chestplate|leggings|boots|nugget)$/.test(entry.id),
    ) ??
    items[0];
  if (gem === undefined) return null;
  return {
    ore: ore.id,
    oreName: nameIn(material.bundle, ore.id) ?? ore.id,
    gem: gem.id,
    gemName: nameIn(material.bundle, gem.id) ?? gem.id,
  };
}

/** The rule book data: breaking the ore sometimes drops one more gem. */
function luckyRuleBook(ore: string, gem: string, percent: number): Json {
  return {
    counters: [],
    format: 1,
    rules: [
      {
        do: [
          {
            conditions: [{ condition: 'chance', percent }],
            do: [
              { count: 1, item: gem, step: 'drop_item' },
              {
                sound: 'minecraft:entity.experience_orb.pickup',
                step: 'play_sound',
                where: 'player',
              },
              { step: 'show_action_bar', text: ['Lucky find!'] },
            ],
            match: 'all',
            step: 'if',
          },
        ],
        key: 'lucky_find',
        name: 'Lucky find',
        when: { subject: ore, trigger: 'block_broken' },
      },
    ],
  };
}

/**
 * Rolls a surprise: the theme, the things and their change items, planned in order against
 * `input.project` (each thing sees the ones before it), so applying `items` as one changeset
 * adds them all. A flow whose names all clash, or whose bundle fails to build, is left out.
 */
export async function rollSurprise(input: SurpriseInput): Promise<SurpriseMod> {
  const random = seededRandom(input.seed);
  const theme = themeById(input.themeId) ?? themeOfSeed(input.seed);
  let setCount = 0;
  // The project's size keeps a second surprise of the same seed in its own sets.
  const size = elementsOf(input.project).length;
  const newSetId =
    input.newSetId ??
    (() => {
      setCount += 1;
      return `surprise-${input.seed}-${size}-${setCount.toString(36)}`;
    });
  const recipes = chooseRecipes(random, usableRecipes(input));
  let virtual = input.project;
  const things: SurpriseThing[] = [];
  const items: ChangeItem[] = [];
  for (const recipe of recipes) {
    const starter = input.starters.find((entry) => entry.id === recipe.flowId) as ProjectStarter;
    const answers = randomAnswers(starter.parameters, random, {
      colours: theme.colours,
      ...(recipe.fixed === undefined ? {} : { fixed: recipe.fixed }),
      ...(recipe.avoid === undefined ? {} : { avoid: recipe.avoid }),
    });
    let accepted: { values: Record<string, Json>; bundle: ContentBundle } | null = null;
    for (const names of nameAttempts(recipe, theme.word, answers, random)) {
      const values = { ...answers, ...names };
      let bundle: ContentBundle;
      try {
        bundle = await starter.build({
          namespace: input.namespace,
          projectName: input.project.name,
          target: input.target,
          values,
        });
      } catch {
        break;
      }
      if (!bundleClashes(bundle, virtual, starter.id)) {
        accepted = { values, bundle };
        break;
      }
    }
    if (accepted === null) continue;
    const stamp = { flowId: starter.id, setId: newSetId(), values: creatorValues(accepted.values) };
    const changes = creatorChanges(planCreate(accepted.bundle, virtual, stamp, input.isKnownKind));
    const next = toItems(changes.items, items.length);
    const planned = planChangeItems(virtual, structuredClone(next));
    if (planned.skipped.length > 0) continue;
    virtual = planned.state;
    items.push(...next);
    const firstName = Object.keys(recipe.names)[0];
    const name = firstName === undefined ? theme.word : String(accepted.values[firstName]);
    things.push({
      flowId: starter.id,
      title: starter.title,
      what: recipe.what,
      name,
      values: accepted.values,
      bundle: accepted.bundle,
      makes: namesOf(accepted.bundle),
      pictures: picturesOf(accepted.bundle),
    });
  }

  let rule: SurpriseRule | null = null;
  const lucky = input.rules && input.isKnownKind(SURPRISE_RULES_KIND) && random() < 0.6;
  const found = lucky ? oreAndGem(things) : null;
  if (found !== null) {
    const percent = pick(random, [10, 20, 25, 33, 50]);
    const taken = new Set(elementsOf(virtual).map((element) => element.id as string));
    let id = `${input.namespace}:${theme.id}_luck` as ResourceLocation;
    for (let number = 2; taken.has(id) && number <= 9; number += 1) {
      id = `${input.namespace}:${theme.id}_luck_${number}` as ResourceLocation;
    }
    if (!taken.has(id)) {
      const next = toItems(
        [
          {
            op: 'create',
            elementId: id,
            kind: SURPRISE_RULES_KIND,
            after: luckyRuleBook(found.ore, found.gem, percent),
          },
        ],
        items.length,
      );
      const planned = planChangeItems(virtual, structuredClone(next));
      if (planned.skipped.length === 0) {
        virtual = planned.state;
        items.push(...next);
        rule = {
          id,
          sentence: `When a player breaks ${found.oreName}, ${percent} times in 100 an extra ${found.gemName} drops.`,
        };
      }
    }
  }

  const modName = `${theme.word} Mod`;
  return {
    seed: input.seed,
    theme,
    modName,
    things,
    rule,
    items: foldItems(items),
    label: `Surprise me: ${modName}`,
  };
}
