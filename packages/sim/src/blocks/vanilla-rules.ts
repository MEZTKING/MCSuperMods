/**
 * Block transformers and vanilla block rules on blocks in Try it (B614, ADR 0120 D8, limit 2L11):
 * Minecraft's own blocks are props in the preview (ADR 0085 L10), and these two kinds are what
 * changes a prop when a tool is used on it.
 *
 * - **Vanilla block rules** (`msm/<ns>/vanilla_block_rules/<path>.json`, ADR 0105 D4): an axe
 *   strips, a shovel flattens, a hoe tills (with a drop once), honeycomb waxes and an axe takes
 *   the wax off again. As the runtime's use callback does, they come before the tool's own block
 *   transformer; a later file (by path) wins for the same block and list. Flattening and tilling
 *   need air above. Every shared block state property is copied. Ageing and burning are said.
 * - **Block transformers** (`data/<ns>/block_transformer/<path>.json`): the list of transforms an
 *   item's `minecraft:block_transformer` component names, tried in order; the first whose block
 *   state provider gives a state wins. Vanilla's axes, shovels and hoes name `minecraft:axe`,
 *   `minecraft:shovel` and `minecraft:hoe`; a project file of that id replaces vanilla's whole
 *   (data pack order), otherwise vanilla's own pairs stand (`TargetFacts.blocks.vanillaPairs`:
 *   strip, flatten and till, and the axe's wax-off and scrape as the reverse of wax and age).
 *
 * Providers read: a block state `{id, properties}`, `minecraft:simple`, `minecraft:rule_based`
 * (rules with `matching_blocks`, `matching_block_tag`, `true`, `not`, `all_of` and `any_of` at
 * the block itself; project block tags only) and `minecraft:copy_properties`. Anything else is
 * said, never guessed. The clicked face is not known here (the preview's use passes none), so a
 * face rule is said. Nothing is dropped as an item but a till rule's `drops`, which the preview
 * puts in your hands.
 *
 * Pure and deterministic: no random numbers are drawn (a provider that would draw is said).
 */

import type { Json, JsonObject } from '@msm/plugin-api';
import { createTagResolver } from '../tags/resolve.js';
import type { BlockPos, BlockState, SimEffect, SimFiles, SimLog, SimOrigin } from '../types.js';
import type { SimWorld } from '../world/sim-world.js';
import { type BlockCatalogue, type CatalogueBlock, readJsonFile } from './catalogue.js';
import { updateNeighbours } from './neighbours.js';

/** Honeycomb: it waxes (vanilla's own wax pairs and a project's wax rules). */
export const HONEYCOMB = 'minecraft:honeycomb';
/** The block transformer vanilla's axes name. */
export const AXE_TRANSFORMER = 'minecraft:axe';
/** The block transformer vanilla's shovels name. */
export const SHOVEL_TRANSFORMER = 'minecraft:shovel';
/** The block transformer vanilla's hoes name. */
export const HOE_TRANSFORMER = 'minecraft:hoe';

/** The vanilla tools Try it offers for the rules, one of each kind. */
export const RULE_TOOL_ITEMS: Readonly<Record<'axe' | 'shovel' | 'hoe' | 'honeycomb', string>> =
  Object.freeze({
    axe: 'minecraft:iron_axe',
    shovel: 'minecraft:iron_shovel',
    hoe: 'minecraft:iron_hoe',
    honeycomb: HONEYCOMB,
  });

/**
 * The sounds the runtime plays for a rule (its `BlockExtras` callback: vanilla's axe strip, shovel
 * flatten, hoe till, wax-on and wax-off sounds); a transformer plays its own `sound`.
 */
export const VANILLA_RULE_SOUNDS: Readonly<Record<ChangeKind, string>> = Object.freeze({
  strip: 'minecraft:item.axe.strip',
  flatten: 'minecraft:item.shovel.flatten',
  till: 'minecraft:item.hoe.till',
  wax: 'minecraft:item.honeycomb.wax_on',
  unwax: 'minecraft:item.axe.wax_off',
  scrape: 'minecraft:item.axe.scrape',
});

/** The particles a change shows (the transformer's own `particle` names, `wax_on` and the like). */
const RULE_PARTICLES: Readonly<Partial<Record<ChangeKind, string>>> = Object.freeze({
  wax: 'wax_on',
  unwax: 'wax_off',
  scrape: 'scrape',
});

/** The lists of a vanilla block rules file. */
export const VANILLA_RULE_LISTS = ['strip', 'flatten', 'till', 'wax', 'age', 'burn'] as const;
export type VanillaRuleList = (typeof VANILLA_RULE_LISTS)[number];

/** What a tool did to a block. */
export type ChangeKind = 'strip' | 'flatten' | 'till' | 'wax' | 'unwax' | 'scrape';

/** One pair of a rules file: the block, what it becomes, and a till rule's drop. */
export interface VanillaRulePair {
  readonly block: string;
  /** What it becomes (an `age` rule's `next`). */
  readonly into: string;
  /** A till rule's item dropped once. */
  readonly drops?: string;
  /** A burn rule's odds. */
  readonly burnOdds?: number;
  readonly igniteOdds?: number;
  /** The element the rule comes from (`<ns>:<path>`). */
  readonly source: string;
}

/** Every rule of the project's rules files, the later file winning for a block. */
export interface VanillaRuleSet {
  readonly strip: ReadonlyMap<string, VanillaRulePair>;
  readonly flatten: ReadonlyMap<string, VanillaRulePair>;
  readonly till: ReadonlyMap<string, VanillaRulePair>;
  readonly wax: ReadonlyMap<string, VanillaRulePair>;
  readonly age: ReadonlyMap<string, VanillaRulePair>;
  readonly burn: ReadonlyMap<string, VanillaRulePair>;
  /** A waxed block (the `into` of a wax rule) to its wax rule: an axe turns it back. */
  readonly unwax: ReadonlyMap<string, VanillaRulePair>;
  /** The rules elements read, in path order. */
  readonly sources: readonly string[];
}

const isRecord = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A resource location with `minecraft:` when it has no namespace. */
export function fullId(id: string): string {
  const bare = id.startsWith('#') ? id.slice(1) : id;
  const full = bare.includes(':') ? bare : `minecraft:${bare}`;
  return id.startsWith('#') ? `#${full}` : full;
}

const stringOf = (value: Json | undefined): string | undefined =>
  typeof value === 'string' && value !== '' ? fullId(value) : undefined;

/**
 * The pairs of one rules file's data, by list, in file order (a later pair for the same block in
 * the same list wins, as the runtime's later rule does).
 */
export function rulesFromData(
  data: Json | undefined,
  source: string,
): Readonly<Record<VanillaRuleList, readonly VanillaRulePair[]>> {
  const out: Record<VanillaRuleList, VanillaRulePair[]> = {
    strip: [],
    flatten: [],
    till: [],
    wax: [],
    age: [],
    burn: [],
  };
  if (!isRecord(data)) return out;
  for (const list of VANILLA_RULE_LISTS) {
    const rows = data[list];
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (!isRecord(row)) continue;
      const block = stringOf(row.block);
      if (block === undefined) continue;
      if (list === 'burn') {
        out.burn.push({
          block,
          into: block,
          source,
          burnOdds: typeof row.burn_odds === 'number' ? row.burn_odds : 0,
          igniteOdds: typeof row.ignite_odds === 'number' ? row.ignite_odds : 0,
        });
        continue;
      }
      const into = stringOf(list === 'age' ? row.next : row.into);
      if (into === undefined) continue;
      const drops = list === 'till' ? stringOf(row.drops) : undefined;
      out[list].push({ block, into, source, ...(drops === undefined ? {} : { drops }) });
    }
  }
  return out;
}

const RULES_PATH = /^msm\/([a-z0-9_.-]+)\/vanilla_block_rules\/(.+)\.json$/;

/** The project's vanilla block rules from the lowered files, files in path order. */
export function readVanillaBlockRules(files: SimFiles): VanillaRuleSet {
  const maps = {
    strip: new Map<string, VanillaRulePair>(),
    flatten: new Map<string, VanillaRulePair>(),
    till: new Map<string, VanillaRulePair>(),
    wax: new Map<string, VanillaRulePair>(),
    age: new Map<string, VanillaRulePair>(),
    burn: new Map<string, VanillaRulePair>(),
  };
  const unwax = new Map<string, VanillaRulePair>();
  const sources: string[] = [];
  const paths = [...files.keys()].filter((path) => RULES_PATH.test(path)).sort();
  for (const path of paths) {
    const match = RULES_PATH.exec(path);
    if (match === null) continue;
    const source = `${match[1]}:${match[2]}`;
    sources.push(source);
    const lists = rulesFromData(readJsonFile(files, path), source);
    for (const list of VANILLA_RULE_LISTS) {
      for (const pair of lists[list]) {
        if (list === 'wax') {
          const old = maps.wax.get(pair.block);
          if (old !== undefined) unwax.delete(old.into);
          unwax.set(pair.into, pair);
        }
        maps[list].set(pair.block, pair);
      }
    }
  }
  return { ...maps, unwax, sources };
}

// --- block transformers ------------------------------------------------------------------------

/** One transform of a block transformer's list. */
export interface TransformStep {
  /** The block state provider, as written. */
  readonly provider: Json | undefined;
  readonly sound?: string;
  /** `none`, `scrape`, `wax_on` or `wax_off`. */
  readonly particle?: string;
  readonly disallowedFaces: readonly string[];
  readonly loot?: string;
  readonly dropStrategy?: string;
  /** `single_block` or `copper_chest`. */
  readonly transformType?: string;
  readonly updateFromNeighbors: boolean;
  readonly consumeOnUse: boolean;
  readonly itemDamagePerUse: number;
}

/** The transforms of a block transformer's data (a list; a single object counts as one). */
export function transformSteps(data: Json | undefined): TransformStep[] {
  const list = Array.isArray(data) ? data : isRecord(data) ? [data] : [];
  const out: TransformStep[] = [];
  for (const raw of list) {
    if (!isRecord(raw)) continue;
    const sound =
      typeof raw.sound === 'string'
        ? fullId(raw.sound)
        : isRecord(raw.sound) && typeof raw.sound.sound_id === 'string'
          ? fullId(raw.sound.sound_id)
          : undefined;
    const faces = Array.isArray(raw.disallowed_faces)
      ? raw.disallowed_faces.filter((face): face is string => typeof face === 'string')
      : [];
    out.push({
      provider: raw.block_state_provider,
      ...(sound === undefined ? {} : { sound }),
      ...(typeof raw.particle === 'string' ? { particle: raw.particle } : {}),
      disallowedFaces: faces,
      ...(typeof raw.loot === 'string' ? { loot: fullId(raw.loot) } : {}),
      ...(typeof raw.drop_strategy === 'string' ? { dropStrategy: raw.drop_strategy } : {}),
      ...(typeof raw.transform_type === 'string' ? { transformType: raw.transform_type } : {}),
      updateFromNeighbors: raw.update_from_neighbors !== false,
      consumeOnUse: raw.consume_on_use !== false,
      itemDamagePerUse: typeof raw.item_damage_per_use === 'number' ? raw.item_damage_per_use : 1,
    });
  }
  return out;
}

/** A project block transformer: its transforms and the element it is. */
export interface ProjectTransformer {
  readonly id: string;
  readonly steps: readonly TransformStep[];
}

/** The project's block transformers by id, from the lowered files (`folder` is the target's). */
export function readBlockTransformers(
  files: SimFiles,
  folder = 'block_transformer',
): ReadonlyMap<string, ProjectTransformer> {
  const pattern = new RegExp(`^data/([a-z0-9_.-]+)/${folder}/(.+)\\.json$`);
  const out = new Map<string, ProjectTransformer>();
  for (const path of [...files.keys()].sort()) {
    const match = pattern.exec(path);
    if (match === null) continue;
    const id = `${match[1]}:${match[2]}`;
    out.set(id, { id, steps: transformSteps(readJsonFile(files, path)) });
  }
  return out;
}

/** A block state as a transformer gives it. */
export interface GivenState {
  readonly id: string;
  readonly properties: Readonly<Record<string, string>>;
  /** True when the clicked block's shared properties are copied onto it. */
  readonly copy?: boolean;
}

/** What a provider gives for a block. */
export type ProviderAnswer =
  | { readonly kind: 'state'; readonly state: GivenState }
  /** No result: the next transform is tried. */
  | { readonly kind: 'none' }
  /** The preview cannot work it out; `what` says why, in plain words. */
  | { readonly kind: 'unknown'; readonly what: string };

/** Block tags for a rule: the members of `#tag`, or `undefined` when the preview cannot read it. */
export type BlockTagReader = (tag: string) => readonly string[] | undefined;

const propertiesOf = (value: Json | undefined): Record<string, string> => {
  const out: Record<string, string> = {};
  if (!isRecord(value)) return out;
  for (const [key, one] of Object.entries(value)) {
    if (typeof one === 'string') out[key] = one;
    else if (typeof one === 'number' || typeof one === 'boolean') out[key] = String(one);
  }
  return out;
};

/** A block state written `{id, properties}` (or the older `{Name, Properties}`), or `undefined`. */
export function givenStateOf(value: Json | undefined): GivenState | undefined {
  if (!isRecord(value)) return undefined;
  const id = stringOf(value.id) ?? stringOf(value.Name);
  if (id === undefined) return undefined;
  return { id, properties: propertiesOf(value.properties ?? value.Properties) };
}

const providerType = (provider: JsonObject): string | undefined =>
  typeof provider.type === 'string' ? fullId(provider.type) : undefined;

/** The block ids (or `#tags`) a `matching_blocks` or `matching_block_tag` names. */
function namedBlocks(predicate: JsonObject): string[] {
  const type = typeof predicate.type === 'string' ? fullId(predicate.type) : '';
  if (type === 'minecraft:matching_block_tag') {
    const tag = stringOf(predicate.tag);
    return tag === undefined ? [] : [tag.startsWith('#') ? tag : `#${tag}`];
  }
  const blocks = predicate.blocks;
  const list = Array.isArray(blocks) ? blocks : [blocks];
  return list.flatMap((one) => (typeof one === 'string' && one !== '' ? [fullId(one)] : []));
}

const hasOffset = (predicate: JsonObject): boolean =>
  Array.isArray(predicate.offset) && predicate.offset.some((n) => n !== 0);

type Truth = boolean | { readonly unknown: string };

/** A block predicate at the block itself (the rules of `rule_based`). */
function testPredicate(predicate: Json | undefined, block: string, tags: BlockTagReader): Truth {
  if (!isRecord(predicate)) return { unknown: 'a rule without a block test' };
  const type = typeof predicate.type === 'string' ? fullId(predicate.type) : '';
  switch (type) {
    case 'minecraft:true':
      return true;
    case 'minecraft:not': {
      const inner = testPredicate(predicate.predicate, block, tags);
      return typeof inner === 'boolean' ? !inner : inner;
    }
    case 'minecraft:all_of':
    case 'minecraft:any_of': {
      const parts = Array.isArray(predicate.predicates) ? predicate.predicates : [];
      const all = type === 'minecraft:all_of';
      let unknown: Truth | undefined;
      for (const part of parts) {
        const answer = testPredicate(part, block, tags);
        if (typeof answer !== 'boolean') unknown ??= answer;
        else if (answer !== all) return answer;
      }
      return unknown ?? all;
    }
    case 'minecraft:matching_blocks':
    case 'minecraft:matching_block_tag': {
      if (hasOffset(predicate)) {
        return { unknown: 'a test of a block beside the one used (an offset)' };
      }
      let unknown: Truth | undefined;
      for (const name of namedBlocks(predicate)) {
        if (!name.startsWith('#')) {
          if (name === block) return true;
          continue;
        }
        const members = tags(name.slice(1));
        if (members === undefined) unknown ??= { unknown: `the block tag ${name}` };
        else if (members.includes(block)) return true;
      }
      return unknown ?? false;
    }
    default:
      return { unknown: `the block test ${type === '' ? '(no type)' : type}` };
  }
}

/** What a block state provider gives for `block` (the clicked block's id). */
export function provideState(
  provider: Json | undefined,
  block: string,
  tags: BlockTagReader,
): ProviderAnswer {
  if (typeof provider === 'string') {
    return { kind: 'unknown', what: `the named block state provider ${fullId(provider)}` };
  }
  if (!isRecord(provider)) return { kind: 'unknown', what: 'a transform without a provider' };
  const type = providerType(provider);
  if (type === undefined) {
    const state = givenStateOf(provider);
    return state === undefined
      ? { kind: 'unknown', what: 'a block state without an id' }
      : { kind: 'state', state };
  }
  switch (type) {
    case 'minecraft:simple': {
      const state = givenStateOf(provider.state);
      return state === undefined
        ? { kind: 'unknown', what: 'a simple provider without a state' }
        : { kind: 'state', state };
    }
    case 'minecraft:copy_properties': {
      const inner = provideState(provider.source, block, tags);
      return inner.kind === 'state'
        ? { kind: 'state', state: { ...inner.state, copy: true } }
        : inner;
    }
    case 'minecraft:rule_based': {
      const rules = Array.isArray(provider.rules) ? provider.rules : [];
      for (const rule of rules) {
        if (!isRecord(rule)) continue;
        const truth = testPredicate(rule.if_true, block, tags);
        if (typeof truth !== 'boolean') return { kind: 'unknown', what: truth.unknown };
        if (truth) return provideState(rule.then, block, tags);
      }
      return provider.fallback === undefined
        ? { kind: 'none' }
        : provideState(provider.fallback, block, tags);
    }
    default:
      return { kind: 'unknown', what: `the block state provider ${type}` };
  }
}

/** One row of a transformer as the views show it: the blocks before, the state after. */
export interface TransformRow {
  /** The transform's place in the list (from 0). */
  readonly step: number;
  /** Block ids and `#tags` the rule matches, or `['*']` for any block. */
  readonly before: readonly string[];
  /** The state given, or `undefined` when the preview cannot read it (`unknown` says why). */
  readonly after?: GivenState;
  readonly unknown?: string;
  /** Words on a rule that is more than a list of blocks (`not`, `all_of`). */
  readonly condition?: string;
}

/** The rows of a provider, rules first, the fallback last. */
function providerRows(provider: Json | undefined, step: number, copy = false): TransformRow[] {
  const any = ['*'];
  if (!isRecord(provider)) {
    const answer = provideState(provider, '', () => undefined);
    return [{ step, before: any, unknown: answer.kind === 'unknown' ? answer.what : 'nothing' }];
  }
  const type = providerType(provider);
  if (type === 'minecraft:copy_properties') return providerRows(provider.source, step, true);
  if (type === 'minecraft:rule_based') {
    const out: TransformRow[] = [];
    const rules = Array.isArray(provider.rules) ? provider.rules : [];
    for (const rule of rules) {
      if (!isRecord(rule)) continue;
      const test = isRecord(rule.if_true) ? rule.if_true : {};
      const testType = typeof test.type === 'string' ? fullId(test.type) : '';
      const plain =
        (testType === 'minecraft:matching_blocks' || testType === 'minecraft:matching_block_tag') &&
        !hasOffset(test);
      const before = plain ? namedBlocks(test) : testType === 'minecraft:true' ? any : [];
      for (const row of providerRows(rule.then, step, copy)) {
        out.push({
          ...row,
          before,
          ...(plain || testType === 'minecraft:true'
            ? {}
            : { condition: `when ${testType === '' ? 'its test' : testType} holds` }),
        });
      }
    }
    if (provider.fallback !== undefined) {
      for (const row of providerRows(provider.fallback, step, copy)) {
        out.push({ ...row, before: any, condition: 'any other block' });
      }
    }
    return out;
  }
  const answer = provideState(provider, '', () => undefined);
  if (answer.kind === 'state') {
    return [{ step, before: any, after: copy ? { ...answer.state, copy: true } : answer.state }];
  }
  return [{ step, before: any, unknown: answer.kind === 'unknown' ? answer.what : 'nothing' }];
}

/** Every row of a block transformer's data, transform by transform. */
export function transformerRows(data: Json | undefined): TransformRow[] {
  return transformSteps(data).flatMap((step, index) => providerRows(step.provider, index));
}

// --- tools -------------------------------------------------------------------------------------

/** The tool kind of a vanilla transformer id, or `undefined` for any other. */
export function toolOfTransformer(id: string): 'axe' | 'shovel' | 'hoe' | undefined {
  if (id === AXE_TRANSFORMER) return 'axe';
  if (id === SHOVEL_TRANSFORMER) return 'shovel';
  if (id === HOE_TRANSFORMER) return 'hoe';
  return undefined;
}

const TOOL_TYPES: Readonly<Record<string, string>> = {
  axe: AXE_TRANSFORMER,
  shovel: SHOVEL_TRANSFORMER,
  hoe: HOE_TRANSFORMER,
};

/**
 * The block transformer an item definition's components name: a `minecraft:block_transformer`
 * in `msm:components`, else an axe, shovel or hoe by `msm:tool`'s type (the runtime's tools take
 * vanilla's transformer of their kind).
 */
export function transformerOfDefinition(definition: Json | undefined): string | undefined {
  if (!isRecord(definition) || !isRecord(definition.components)) return undefined;
  const components = definition.components;
  const passthrough = components['msm:components'];
  if (isRecord(passthrough)) {
    const named = stringOf(passthrough['minecraft:block_transformer']);
    if (named !== undefined) return named;
  }
  const tool = components['msm:tool'];
  if (isRecord(tool) && typeof tool.type === 'string') return TOOL_TYPES[tool.type];
  return undefined;
}

/** The block transformer a vanilla item names (its axes, shovels and hoes), or `undefined`. */
export function transformerOfVanillaItem(id: string): string | undefined {
  if (!id.startsWith('minecraft:')) return undefined;
  if (id.endsWith('_axe')) return AXE_TRANSFORMER;
  if (id.endsWith('_shovel')) return SHOVEL_TRANSFORMER;
  if (id.endsWith('_hoe')) return HOE_TRANSFORMER;
  return undefined;
}

const ITEM_PATH = /^msm\/([a-z0-9_.-]+)\/item\/(.+)\.json$/;

/** The project's items that name a block transformer, by item id. */
export function readTransformerItems(files: SimFiles): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  for (const path of [...files.keys()].sort()) {
    const match = ITEM_PATH.exec(path);
    if (match === null) continue;
    const named = transformerOfDefinition(readJsonFile(files, path));
    if (named !== undefined) out.set(`${match[1]}:${match[2]}`, named);
  }
  return out;
}

// --- in Try it ---------------------------------------------------------------------------------

/** What the rules work with (a part of `Types3Host`). */
export interface VanillaRulesHost {
  readonly world: SimWorld;
  readonly catalogue: () => BlockCatalogue;
  readonly log: SimLog;
  /** Says a line once per key for the area's life. */
  readonly sayOnce: (key: string, what: string, origin?: SimOrigin) => void;
  /** Shows an effect (a sound's caption, particles). */
  readonly effect: (effect: SimEffect) => void;
  /** Puts items in the player's hands. */
  readonly give: (id: string, count: number) => void;
}

/** The blocks and tools a project's rules and transformers use, for Try it's hotbar. */
export interface RuleThings {
  /** Blocks the rules and transformers name, to place and try (vanilla ones are props). */
  readonly blocks: readonly string[];
  /** Tools: vanilla's (`RULE_TOOL_ITEMS`) and the project's items naming a transformer. */
  readonly tools: readonly string[];
}

/** The blocks and tools to offer in Try it for the project's rules and transformers. */
export function ruleThings(files: SimFiles, transformerFolder = 'block_transformer'): RuleThings {
  const rules = readVanillaBlockRules(files);
  const transformers = readBlockTransformers(files, transformerFolder);
  const items = readTransformerItems(files);
  const blocks = new Set<string>();
  const tools = new Set<string>();
  for (const [list, tool] of [
    ['strip', 'axe'],
    ['flatten', 'shovel'],
    ['till', 'hoe'],
    ['wax', 'honeycomb'],
  ] as const) {
    if (rules[list].size === 0) continue;
    tools.add(RULE_TOOL_ITEMS[tool]);
    if (list === 'wax') tools.add(RULE_TOOL_ITEMS.axe);
    for (const block of rules[list].keys()) blocks.add(block);
  }
  for (const transformer of transformers.values()) {
    const tool = toolOfTransformer(transformer.id);
    if (tool !== undefined) tools.add(RULE_TOOL_ITEMS[tool]);
    for (const [item, named] of items) if (named === transformer.id) tools.add(item);
    for (const row of transformerRows(transformer.steps.map(stepJson))) {
      for (const block of row.before)
        if (block !== '*' && !block.startsWith('#')) blocks.add(block);
    }
  }
  return { blocks: [...blocks].sort(), tools: [...tools] };
}

/** A step back as JSON, for {@link transformerRows}. */
function stepJson(step: TransformStep): Json {
  return { block_state_provider: step.provider ?? null };
}

const above = (pos: BlockPos): BlockPos => ({ x: pos.x, y: pos.y + 1, z: pos.z });
const centre = (pos: BlockPos) => ({ x: pos.x + 0.5, y: pos.y + 0.5, z: pos.z + 0.5 });

/** Reverses a map of pairs (`into` to `block`). */
const reversed = (pairs: Readonly<Record<string, string>> | undefined): Map<string, string> =>
  new Map(Object.entries(pairs ?? {}).map(([from, to]) => [to, from]));

/**
 * The project's rules and transformers acting on blocks in Try it; see the module comment.
 * `Types3Area` holds one and asks it first on every use of a block with something in hand.
 */
export class VanillaBlockRules {
  private readonly host: VanillaRulesHost;
  private rules: VanillaRuleSet = readVanillaBlockRules(new Map());
  private transformers: ReadonlyMap<string, ProjectTransformer> = new Map();
  private items: ReadonlyMap<string, string> = new Map();
  private files: SimFiles = new Map();

  constructor(host: VanillaRulesHost) {
    this.host = host;
  }

  /** New lowered files (a live edit): the rules again, and the lines on what only the game does. */
  setFiles(files: SimFiles): void {
    this.files = files;
    const folder = this.host.catalogue().target.folders.data.block_transformer;
    this.rules = readVanillaBlockRules(files);
    this.transformers = readBlockTransformers(files, folder);
    this.items = readTransformerItems(files);
    for (const pair of this.rules.age.values()) {
      this.host.sayOnce(
        `rules-age:${pair.block}`,
        `${this.name(pair.block)} ageing into ${this.name(pair.into)} over time, as copper does (the preview does not age Minecraft's blocks; where the runtime cannot age one on your Minecraft version it skips the rule with a warning)`,
        { elementId: pair.source },
      );
    }
    for (const pair of this.rules.burn.values()) {
      this.host.sayOnce(
        `rules-burn:${pair.block}`,
        `${this.name(pair.block)} catching fire (${pair.burnOdds} of 300) and burning away (${pair.igniteOdds} of 300); the preview has no fire`,
        { elementId: pair.source },
      );
    }
  }

  /**
   * A right click on a block holding `item`: true when a rule or transformer changed it (the
   * caller stops). Nothing happens with an empty hand.
   */
  use(pos: BlockPos, state: BlockState, block: CatalogueBlock, item?: string): boolean {
    if (item === undefined) return false;
    const id = block.id;
    if (item === HONEYCOMB) {
      const rule = this.rules.wax.get(id);
      if (rule !== undefined) return this.changeByRule('wax', pos, state, rule.into, rule);
      const vanilla = this.pairs()?.wax[id];
      return vanilla !== undefined && this.changeByRule('wax', pos, state, vanilla);
    }
    const transformer = this.items.get(item) ?? transformerOfVanillaItem(item);
    if (transformer === undefined) return false;
    const tool = toolOfTransformer(transformer);
    if (tool === 'shovel') {
      const rule = this.rules.flatten.get(id);
      if (rule !== undefined) return this.changeByRule('flatten', pos, state, rule.into, rule);
    } else if (tool === 'hoe') {
      const rule = this.rules.till.get(id);
      if (rule !== undefined) return this.changeByRule('till', pos, state, rule.into, rule);
    } else if (tool === 'axe') {
      const strip = this.rules.strip.get(id);
      if (strip !== undefined) return this.changeByRule('strip', pos, state, strip.into, strip);
      const waxed = this.rules.unwax.get(id);
      if (waxed !== undefined) return this.changeByRule('unwax', pos, state, waxed.block, waxed);
    }
    return this.transform(transformer, pos, state, item);
  }

  /** The item's own block transformer: the project's file of that id, else vanilla's pairs. */
  private transform(id: string, pos: BlockPos, state: BlockState, item: string): boolean {
    const own = this.transformers.get(id);
    if (own === undefined) return this.vanillaTransform(id, pos, state, item);
    const tags = this.tagReader();
    for (const [index, step] of own.steps.entries()) {
      const answer = provideState(step.provider, state.name, tags);
      if (answer.kind === 'none') continue;
      if (answer.kind === 'unknown') {
        this.host.sayOnce(
          `transformer-unknown:${id}:${index}`,
          `what the block transformer ${id} does to ${this.name(state.name)} (transform ${index + 1} uses ${answer.what}, which the preview cannot work out)`,
          { elementId: id, pointer: `/${index}/block_state_provider` },
        );
        return false;
      }
      if (step.disallowedFaces.length > 0) {
        this.host.sayOnce(
          `transformer-faces:${id}:${index}`,
          `transform ${index + 1} of ${id} doing nothing on the faces ${step.disallowedFaces.join(', ')}; the preview does not know which face you clicked, so it changes the block on any face`,
          { elementId: id, pointer: `/${index}/disallowed_faces` },
        );
      }
      this.apply(pos, state, answer.state, { elementId: id, pointer: `/${index}` }, step);
      this.host.log.info(
        `The block transformer ${id} turned ${this.name(state.name)} into ${this.name(answer.state.id)}.`,
        { elementId: id },
      );
      this.sayStepExtras(id, index, step, item);
      return true;
    }
    return false;
  }

  /** Vanilla's own transformer for an axe, shovel or hoe, from the target's pairs. */
  private vanillaTransform(id: string, pos: BlockPos, state: BlockState, item: string): boolean {
    const tool = toolOfTransformer(id);
    if (tool === undefined) {
      this.host.sayOnce(
        `transformer-missing:${item}:${id}`,
        `${this.name(item)} uses the block transformer ${id}, which the project does not have (Minecraft's own ones are the axe's, the shovel's and the hoe's)`,
      );
      return false;
    }
    const pairs = this.pairs();
    if (pairs === undefined) return false;
    const block = state.name;
    if (tool === 'shovel') {
      const into = pairs.flatten[block];
      return into !== undefined && this.changeByRule('flatten', pos, state, into);
    }
    if (tool === 'hoe') {
      const into = pairs.till[block];
      return into !== undefined && this.changeByRule('till', pos, state, into);
    }
    const strip = pairs.strip[block];
    if (strip !== undefined) return this.changeByRule('strip', pos, state, strip);
    const scraped = reversed(pairs.age).get(block);
    if (scraped !== undefined) return this.changeByRule('scrape', pos, state, scraped);
    const unwaxed = reversed(pairs.wax).get(block);
    return unwaxed !== undefined && this.changeByRule('unwax', pos, state, unwaxed);
  }

  /** A strip, flatten, till or wax pair: shared properties copied, the tool's sound. */
  private changeByRule(
    kind: ChangeKind,
    pos: BlockPos,
    state: BlockState,
    into: string,
    rule?: VanillaRulePair,
  ): boolean {
    const origin: SimOrigin = rule === undefined ? {} : { elementId: rule.source };
    if (kind === 'flatten' || kind === 'till') {
      if (this.host.world.get(above(pos)) !== null) {
        this.host.log.info(
          `${this.name(state.name)} is ${kind === 'till' ? 'tilled' : 'flattened'} only with air above it.`,
          origin,
        );
        return true;
      }
      this.host.sayOnce(
        `rules-bottom:${kind}`,
        `${kind === 'till' ? 'tilling' : 'flattening'} doing nothing when you click a block's bottom face; the preview does not know which face you clicked`,
        origin,
      );
    }
    this.apply(pos, state, { id: into, properties: {}, copy: true }, origin);
    this.host.effect({
      kind: 'sound',
      id: VANILLA_RULE_SOUNDS[kind],
      position: centre(pos),
      ...(Object.keys(origin).length === 0 ? {} : { origin }),
    });
    const particle = RULE_PARTICLES[kind];
    if (particle !== undefined) this.particle(particle, pos, origin);
    const by = rule === undefined ? "Minecraft's own pair" : `the rule in ${rule.source}`;
    this.host.log.info(
      `${WORDS[kind]} ${this.name(state.name)} into ${this.name(into)} (${by}).`,
      origin,
    );
    if (rule?.drops !== undefined) {
      this.host.give(rule.drops, 1);
      this.host.log.info(
        `Tilling drops ${this.name(rule.drops)} once; the preview puts it in your hands.`,
        origin,
      );
    }
    this.host.sayOnce(
      kind === 'wax' ? 'rules-honeycomb' : 'rules-tool-damage',
      kind === 'wax'
        ? 'one honeycomb used up for each wax; the preview never runs out'
        : 'the tool losing 1 durability for each use; the preview’s tools never wear',
    );
    return true;
  }

  /** Sets the new state: the given properties, and with `copy` every shared one of the old. */
  private apply(
    pos: BlockPos,
    before: BlockState,
    given: GivenState,
    origin: SimOrigin,
    step?: TransformStep,
  ): void {
    const catalogue = this.host.catalogue();
    const base = catalogue.defaultState(given.id) ?? { name: given.id, properties: {} };
    const copied: Record<string, string> = {};
    if (given.copy === true) {
      for (const [key, value] of Object.entries(before.properties)) {
        if (key in base.properties) copied[key] = value;
      }
    }
    const next = catalogue.withProperties(base, { ...copied, ...given.properties });
    this.host.world.set(pos, next);
    if (step === undefined || step.updateFromNeighbors) {
      updateNeighbours(this.host.world, catalogue, pos);
    }
    if (step === undefined) return;
    if (step.sound !== undefined) {
      this.host.effect({ kind: 'sound', id: step.sound, position: centre(pos), origin });
    }
    if (step.particle !== undefined && step.particle !== 'none') {
      this.particle(step.particle, pos, origin);
    }
  }

  /** The lines on what a transform does that the preview leaves out. */
  private sayStepExtras(id: string, index: number, step: TransformStep, item: string): void {
    const origin: SimOrigin = { elementId: id, pointer: `/${index}` };
    if (step.loot !== undefined) {
      this.host.sayOnce(
        `transformer-loot:${id}:${index}`,
        `transform ${index + 1} of ${id} dropping the loot of ${step.loot}${step.dropStrategy === 'clicked_face' ? ' from the clicked face' : ''}; the preview gives no drops (Roll it on the table shows what it can drop)`,
        origin,
      );
    }
    if (step.transformType === 'copper_chest') {
      this.host.sayOnce(
        `transformer-chest:${id}:${index}`,
        `transform ${index + 1} of ${id} changing the other half of a double copper chest too; the preview changes the one block`,
        origin,
      );
    }
    const vanillaTool = transformerOfVanillaItem(item) !== undefined;
    this.host.sayOnce(
      `transformer-cost:${id}`,
      `using ${this.name(item)} on a block costing ${step.itemDamagePerUse} durability (or one of a stack${step.consumeOnUse ? '' : ', unless the transform says not to'}); the preview’s ${vanillaTool ? 'tools never wear' : 'items never run out'}`,
      origin,
    );
  }

  private particle(name: string, pos: BlockPos, origin: SimOrigin): void {
    const id = fullId(name);
    for (const [dx, dz] of [
      [0.2, 0.2],
      [0.8, 0.5],
      [0.4, 0.8],
    ] as const) {
      this.host.effect({
        kind: 'particle',
        id,
        position: { x: pos.x + dx, y: pos.y + 1.05, z: pos.z + dz },
        ...(Object.keys(origin).length === 0 ? {} : { origin }),
      });
    }
  }

  /** Vanilla's own pairs of the target, when it states them. */
  private pairs() {
    return this.host.catalogue().target.blocks?.vanillaPairs;
  }

  /** Reads the project's block tags (Minecraft's own are not in the preview). */
  private tagReader(): BlockTagReader {
    const tagsFolder = this.host.catalogue().target.folders.data.tags;
    const files = this.files;
    const lookup = (folder: string, id: string): Json | undefined => {
      const colon = id.indexOf(':');
      const ns = colon < 0 ? 'minecraft' : id.slice(0, colon);
      const path = colon < 0 ? id : id.slice(colon + 1);
      return readJsonFile(files, `data/${ns}/${folder}/${path}.json`);
    };
    const resolve = createTagResolver(() => undefined, { project: lookup, tagsFolder });
    return (tag) => {
      const resolved = resolve('block', tag);
      return resolved.dropped ? undefined : resolved.members.map((member) => member.id);
    };
  }

  private name(id: string): string {
    // `get`, not `blockFor`: naming a block or an item must not make a prop of it.
    const block = this.host.catalogue().get(id);
    if (block !== undefined) return block.displayName;
    const path = id.slice(id.indexOf(':') + 1);
    return path
      .split(/[_/]/)
      .filter((word) => word !== '')
      .map((word) => (word[0] ?? '').toUpperCase() + word.slice(1))
      .join(' ');
  }
}

/** The words a change's log line starts with. */
const WORDS: Readonly<Record<ChangeKind, string>> = {
  strip: 'Your axe stripped',
  flatten: 'Your shovel flattened',
  till: 'Your hoe tilled',
  wax: 'Honeycomb waxed',
  unwax: 'Your axe took the wax off',
  scrape: 'Your axe scraped',
};
