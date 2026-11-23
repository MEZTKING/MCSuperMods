/**
 * What every source collector shares (ADR 0124 D3, D9; B660): the action and preview descriptors
 * an entry carries (plain data that crosses the worker; `actions.ts` and `ResultPreview.tsx` turn
 * them into work and pictures), the entry ids of each source, the static input (the plugin list,
 * the target's facts and the plugins' checked search data) and small text helpers.
 *
 * The collectors are pure: they read the plugin list, the session's project and problems and the
 * app's own lists and return `SearchEntry[]`. None imports `@msm/search` at run time (only its
 * types): the engine lives in the worker (`host.ts`).
 *
 * @packageDocumentation
 */

import type {
  ElementKind,
  Json,
  PluginContributions,
  PluginSearchData,
  ProjectStarter,
  StarterParameter,
  TargetFacts,
} from '@msm/plugin-api';
import type { SearchEntry, SearchQuestion } from '@msm/search';

// Descriptors ------------------------------------------------------------------------------

/**
 * What a result does (ADR 0124 D9). Every descriptor is plain JSON; the same descriptor on two
 * entries folds them into one result (a one-flow tile, its Showcase card and the flow).
 */
export type SearchActionDescriptor =
  /** A Creator flow, opened (Make this) or made at once (Add to my mod), with starting answers. */
  | { readonly type: 'flow'; readonly starter: string; readonly values?: Record<string, Json> }
  /** A library starter that is not a flow: added to the mod, or a new mod made from it. */
  | { readonly type: 'starter'; readonly starter: string; readonly values?: Record<string, Json> }
  /** Several flows (and starters) to choose from: a Home tile or Showcase card with a chooser. */
  | {
      readonly type: 'flows';
      readonly flows: readonly string[];
      readonly starters?: readonly string[];
      readonly tile?: string;
    }
  /** A new element from a template. */
  | { readonly type: 'template'; readonly template: string; readonly kind: string }
  /** A library example, opened as a new mod or copied in. */
  | { readonly type: 'example'; readonly example: string }
  /** A kind: its Studio, a new element of it. */
  | { readonly type: 'kind'; readonly kind: string }
  /** Home's other tiles. */
  | { readonly type: 'surprise' }
  | { readonly type: 'rules-book' }
  | { readonly type: 'paint' }
  | { readonly type: 'ai' }
  /** An element of the open mod (a Creator set opens its main element). */
  | { readonly type: 'element'; readonly element: string }
  /** A picture or sound file of the open mod. */
  | { readonly type: 'asset'; readonly namespace: string; readonly path: string }
  /** A rule of one of the mod's rule books. */
  | { readonly type: 'rule'; readonly book: string; readonly index: number }
  /** A vanilla thing: Make something with it. */
  | { readonly type: 'vanilla'; readonly id: string; readonly sort: VanillaSort }
  /** A "When", "Do", "Only if" or number of the Rules catalogue: Add this rule. */
  | { readonly type: 'rule-part'; readonly part: RulePart; readonly id: string }
  /** A setting: Settings opened at it. */
  | { readonly type: 'setting'; readonly setting: string }
  /** A palette command: Run. */
  | { readonly type: 'command'; readonly command: string }
  /** A guide section: Show me how. */
  | { readonly type: 'guide'; readonly page: string; readonly anchor: string }
  /** A Thing to fix: Show me, Fix it. */
  | {
      readonly type: 'problem';
      readonly code: string;
      readonly element?: string;
      readonly path?: string;
      readonly file?: string;
    };

/**
 * What a result shows before it is made (ADR 0124 D9; drawn by B665). The same shapes as the
 * actions, plus `showcase` (a card's still) and `text` (a sentence only).
 */
export type SearchPreviewDescriptor =
  | SearchActionDescriptor
  | { readonly type: 'showcase'; readonly card: string; readonly example: string }
  | { readonly type: 'text' };

/** The parts of the Rules catalogue a search finds. */
export type RulePart = 'trigger' | 'step' | 'condition' | 'value';

/** The sorts of the vanilla layer (ADR 0124 D3). */
export type VanillaSort =
  | 'thing'
  | 'mob'
  | 'biome'
  | 'effect'
  | 'enchantment'
  | 'potion'
  | 'particle'
  | 'sound';

// Entry ids ---------------------------------------------------------------------------------

/** The entry id of each source (stable; tests, the history and `SearchContext.inMod` use them). */
export const entryIds = {
  flow: (starter: string) => `flow:${starter}`,
  starter: (starter: string) => `starter:${starter}`,
  template: (template: string) => `template:${template}`,
  example: (example: string) => `example:${example}`,
  kind: (kind: string) => `kind:${kind}`,
  command: (command: string) => `command:${command}`,
  rulePart: (part: RulePart, id: string) => `rule:${part}:${id}`,
  setting: (setting: string) => `setting:${setting}`,
  guide: (page: string, anchor: string) => `guide:${page}#${anchor}`,
  tile: (tile: string) => `tile:${tile}`,
  pick: (pick: string) => `tile-pick:${pick}`,
  card: (card: string) => `card:${card}`,
  contribution: (plugin: string, id: string) => `entry:${plugin}:${id}`,
  vanilla: (sort: VanillaSort, path: string) => `vanilla:${sort}:${path}`,
  element: (element: string) => `project:element:${element}`,
  set: (setId: string) => `project:set:${setId}`,
  asset: (namespace: string, path: string) => `project:asset:${namespace}:${path}`,
  rule: (book: string, index: number) => `project:rule:${book}#${index}`,
  problem: (key: string) => `problem:${key}`,
} as const;

/** The flow action of a starter (its entry, a one-flow tile and a one-flow card share it). */
export function flowAction(starter: string): SearchActionDescriptor {
  return { type: 'flow', starter };
}

/** Descriptor to the entry's `SearchAction` / `SearchPreview` (plain JSON either way). */
export function asAction(descriptor: SearchActionDescriptor): SearchEntry['action'] {
  return descriptor as unknown as SearchEntry['action'];
}

/** Descriptor to the entry's preview. */
export function asPreview(descriptor: SearchPreviewDescriptor): SearchEntry['preview'] {
  return descriptor as unknown as SearchEntry['preview'];
}

/** The descriptor an entry carries (for the app's actions and tests). */
export function actionOf(entry: SearchEntry): SearchActionDescriptor {
  return entry.action as unknown as SearchActionDescriptor;
}

// The static input --------------------------------------------------------------------------

/** One plugin's checked search data (`plugin-data.ts`). */
export interface PluginSearchLines {
  readonly plugin: string;
  readonly data: PluginSearchData;
}

/** The words every source reads from the plugins' search data, merged in plugin order. */
export interface SearchWords {
  /** Keywords by kind, template or starter id (the first plugin's line for an id wins). */
  readonly keywords: Readonly<Record<string, readonly string[]>>;
}

/** Merges the plugins' keywords (plugin order; a later plugin's words for the same id are added). */
export function searchWordsOf(lines: readonly PluginSearchLines[]): SearchWords {
  const keywords: Record<string, string[]> = {};
  for (const line of lines) {
    for (const [id, words] of Object.entries(line.data.keywords ?? {})) {
      if (!Array.isArray(words)) continue;
      const list = keywords[id] ?? [];
      keywords[id] = list;
      for (const word of words) {
        if (typeof word === 'string' && !list.includes(word)) list.push(word);
      }
    }
  }
  return { keywords };
}

/** What the static collectors read: the plugin list's contributions and the target. */
export interface StaticSourceInput {
  /** The registered plugins, in registration order (built-in, then third-party). */
  readonly plugins: readonly {
    readonly id: string;
    readonly contributes: PluginContributions;
  }[];
  /** The facts of the open mod's target, else the default target's. */
  readonly target: TargetFacts;
  /** The plugins' keywords. */
  readonly words: SearchWords;
}

/** The registered kinds of the plugin list, first registration wins. */
export function registeredKinds(
  input: Pick<StaticSourceInput, 'plugins'>,
): Map<string, ElementKind> {
  const out = new Map<string, ElementKind>();
  for (const plugin of input.plugins) {
    for (const kind of plugin.contributes.elementKinds ?? []) {
      if (!out.has(kind.id)) out.set(kind.id, kind);
    }
  }
  return out;
}

/** The plugin that registered each kind. */
export function kindOwners(input: Pick<StaticSourceInput, 'plugins'>): Map<string, string> {
  const out = new Map<string, string>();
  for (const plugin of input.plugins) {
    for (const kind of plugin.contributes.elementKinds ?? []) {
      if (!out.has(kind.id)) out.set(kind.id, plugin.id);
    }
  }
  return out;
}

/** The line shown for a thing the target cannot make (plan "Very easy wording"). */
export const NOT_ON_TARGET = 'Not on this Minecraft version.';

/** Whether a `supports(target)` holds; a throwing check counts as unsupported. */
export function supportsTarget(
  thing: { supports?(target: TargetFacts): boolean },
  target: TargetFacts,
): boolean {
  try {
    return thing.supports?.(target) ?? true;
  } catch {
    return false;
  }
}

/** Availability fields of an entry. */
export function availability(
  available: boolean,
): Pick<SearchEntry, 'available' | 'unavailableReason'> {
  return available ? { available: true } : { available: false, unavailableReason: NOT_ON_TARGET };
}

/** A flow's question as the answer reader reads it. */
export function questionOf(parameter: StarterParameter): SearchQuestion {
  const base = { id: parameter.id, label: parameter.label, type: parameter.type };
  switch (parameter.type) {
    case 'choice':
    case 'set':
      return { ...base, choices: parameter.choices.map(({ value, label }) => ({ value, label })) };
    case 'number':
      return {
        ...base,
        ...(parameter.min !== undefined ? { min: parameter.min } : {}),
        ...(parameter.max !== undefined ? { max: parameter.max } : {}),
      };
    default:
      return base;
  }
}

/** The starters of the plugin list, first id wins, whose kinds are all registered (as the session's library). */
export function registeredStarters(
  input: Pick<StaticSourceInput, 'plugins'>,
): { plugin: string; starter: ProjectStarter }[] {
  const kinds = registeredKinds(input);
  const seen = new Set<string>();
  const out: { plugin: string; starter: ProjectStarter }[] = [];
  for (const plugin of input.plugins) {
    for (const starter of plugin.contributes.projectStarters ?? []) {
      if (seen.has(starter.id)) continue;
      seen.add(starter.id);
      if (!(starter.requiresKinds ?? []).every((kind) => kinds.has(kind))) continue;
      out.push({ plugin: plugin.id, starter });
    }
  }
  return out;
}

/** Plain words made from an id's path (`minecraft:oak_log` reads `oak log`). */
export function idWords(id: string): string {
  const path = id.includes(':') ? id.slice(id.indexOf(':') + 1) : id;
  return path.replace(/[_/.]+/g, ' ').trim();
}

/** Strings without empty ones or repeats, in order. */
export function uniqueWords(words: Iterable<string | undefined>): string[] {
  const out: string[] = [];
  for (const word of words) {
    if (typeof word !== 'string') continue;
    const text = word.trim();
    if (text !== '' && !out.includes(text)) out.push(text);
  }
  return out;
}

/** `words` when not empty (entries leave the field out otherwise). */
export function wordsField(words: Iterable<string | undefined>): Pick<SearchEntry, 'words'> {
  const list = uniqueWords(words);
  return list.length > 0 ? { words: list } : {};
}

/** A sentence field when the text is not empty. */
export function sentenceField(text: string | undefined): Pick<SearchEntry, 'sentence'> {
  const value = text?.trim() ?? '';
  return value === '' ? {} : { sentence: value };
}
