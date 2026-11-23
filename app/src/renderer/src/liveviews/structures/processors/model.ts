/**
 * What the processor list view (ADR 0122 D6; B641) works out on this thread, pure: the templates
 * a list can be tried on, the block tags it names, the words for each processor type and its
 * fidelity, and the before and after cut by the swipe line into one template for the 3D preview.
 * The processors themselves run in the structures worker (`host.ts`).
 */

import type { Json, Project } from '@msm/plugin-api';
import type { Fidelity } from '../../frame/fidelity';
import { wordsOfPath } from '../../frame/item-picture';
import type { PieceTemplate, TemplateBlock } from '../vanilla-pieces';

export const PROCESSOR_LIST_KIND = 'minecraft:worldgen/processor_list';
export const TEMPLATE_KIND = 'minecraft:structure_template';
export const POOL_KIND = 'minecraft:worldgen/template_pool';
export const BLOCK_TAG_KIND = 'minecraft:tag/block';
/** The vanilla folder of block tags, as the data reader names it. */
export const BLOCK_TAG_FOLDER = 'tags/block';

/** How faithful one processor's result is, as `@msm/terrain` reports it (B638). */
export type EngineFidelity = 'exact' | 'about_right' | 'only_in_game';

/** One processor of a list and what it did (mirrors `ProcessorRuleResult` in `@msm/terrain`). */
export interface RuleResult {
  readonly type: string;
  readonly fidelity: EngineFidelity;
  readonly changed: number;
  readonly note?: string;
}

/** A processed template (mirrors `ProcessorListResult` in `@msm/terrain`). */
export interface ProcessedResult {
  readonly template: PieceTemplate;
  readonly after: readonly TemplateBlock[];
  readonly palette: readonly string[];
  readonly rules: readonly RuleResult[];
  readonly refused: string | null;
}

/**
 * The processor types the structures parity fixture measured on the real game on both targets
 * (`fixtures/structures-parity/`, B639; `packages/terrain/test/structures-parity.test.ts`, B641):
 * an exact row of one of these is shown as checked. The others the engine applies exactly (B638)
 * are shown as about right until a fixture measures them.
 */
export const CHECKED_TYPES: ReadonlySet<string> = new Set([
  'minecraft:nop',
  'minecraft:block_ignore',
  'minecraft:block_rot',
  'minecraft:rule',
  'minecraft:capped',
  'minecraft:protected_blocks',
  'minecraft:jigsaw_replacement',
  'minecraft:blackstone_replace',
  'minecraft:legacy_single_pool_element',
]);

/** Plain words for each processor type and the rows the engine adds. */
export const PROCESSOR_WORDS: Readonly<Record<string, string>> = Object.freeze({
  'minecraft:nop': 'Does nothing',
  'minecraft:block_ignore': 'Leaves some blocks out',
  'minecraft:block_rot': 'Leaves blocks out at random',
  'minecraft:rule': 'Swaps blocks by rules',
  'minecraft:capped': 'Swaps only a few blocks',
  'minecraft:gravity': 'Follows the ground',
  'minecraft:protected_blocks': 'Keeps protected blocks',
  'minecraft:jigsaw_replacement': 'Turns jigsaw blocks into their final block',
  'minecraft:blackstone_replace': 'Turns stone into blackstone',
  'minecraft:block_age': 'Ages stone blocks',
  'minecraft:lava_submerged_block': 'Keeps the lava around it',
  'minecraft:legacy_single_pool_element': 'Leaves the building’s air out (an older kind of piece)',
  corner_constraint: 'Checks the piece’s corners',
  '(list)': 'The list',
  '(unnamed)': 'A processor with no type',
});

/** The words of a processor type; an unknown type is named as one. */
export function processorWords(type: string, advanced: boolean): string {
  const words = PROCESSOR_WORDS[type] ?? 'A processor this preview does not know';
  return advanced && type.startsWith('minecraft:') ? `${words} (${type})` : words;
}

/** Notes added to a rule whose test compares block states (the B641 parity test's finding). */
export const STATE_MATCH_NOTE =
  'A block state test compares only the properties the building writes; the game fills the others from the block’s defaults.';

/** Whether a processor's data uses a block state test (`blockstate_match` or its random kind). */
function usesStateMatch(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(usesStateMatch);
  if (typeof value !== 'object' || value === null) return false;
  for (const [key, inner] of Object.entries(value)) {
    if (key === 'predicate_type' && typeof inner === 'string' && inner.endsWith('blockstate_match'))
      return true;
    if (usesStateMatch(inner)) return true;
  }
  return false;
}

/** One row of the view: a processor in words with its level, count and note. */
export interface RuleRow {
  readonly type: string;
  readonly fidelity: Fidelity;
  readonly changed: number;
  readonly notes: readonly string[];
}

/** The processors a list's data names (`{ processors: [...] }` or a bare array). */
export function listEntries(list: unknown): unknown[] {
  if (Array.isArray(list)) return list;
  if (typeof list === 'object' && list !== null) {
    const processors = (list as { processors?: unknown }).processors;
    if (Array.isArray(processors)) return processors;
  }
  return [];
}

const TRAILING = new Set(['(list)', 'corner_constraint']);

/**
 * The view's rows from the engine's: an exact row is checked only for a type the parity fixture
 * measured (and about right where its rules compare block states), else about right.
 */
export function ruleRows(rules: readonly RuleResult[], list: unknown): RuleRow[] {
  const entries = listEntries(list);
  const trailing = rules.filter((rule) => TRAILING.has(rule.type)).length;
  // The rows the engine adds before the list's own (jigsaw blocks, a legacy piece's air).
  const leading = Math.max(0, rules.length - trailing - entries.length);
  return rules.map((rule, index) => {
    const notes = rule.note === undefined ? [] : [rule.note];
    let fidelity: Fidelity =
      rule.fidelity === 'exact'
        ? CHECKED_TYPES.has(rule.type)
          ? 'checked'
          : 'about_right'
        : rule.fidelity;
    const entry = index >= leading ? entries[index - leading] : undefined;
    if (fidelity === 'checked' && usesStateMatch(entry)) {
      fidelity = 'about_right';
      notes.push(STATE_MATCH_NOTE);
    }
    return { type: rule.type, fidelity, changed: rule.changed, notes };
  });
}

// ---------------------------------------------------------------------------------------------
// Templates and tags

type JsonObject = { readonly [key: string]: Json };

const asObject = (value: unknown): JsonObject | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;

/** An id with its namespace written out. */
export function namespaced(id: string): string {
  const trimmed = id.trim().replace(/^#/, '');
  return trimmed.includes(':') ? trimmed : `minecraft:${trimmed}`;
}

/** A building a list can be tried on. */
export interface TemplateChoice {
  readonly id: string;
  /** Whether a pool of the mod places it with this list. */
  readonly withThisList: boolean;
  /** The type of the pool element that pairs it with this list (`legacy_single_pool_element`). */
  readonly elementType?: string;
  readonly source: 'project' | 'vanilla';
}

function elementsOf(project: Project, kind: string) {
  return project.namespaces.flatMap((namespace) =>
    namespace.elements.filter((element) => element.kind === kind),
  );
}

/**
 * The buildings to try `listId` on: first those a pool of the mod places with this list (the
 * mod's own or Minecraft's), then the rest of the mod's buildings, each once, by name.
 */
export function templateChoices(project: Project, listId: string | null): TemplateChoice[] {
  const list = listId === null ? null : namespaced(listId);
  const own = new Set<string>(elementsOf(project, TEMPLATE_KIND).map((element) => element.id));
  const paired = new Map<string, TemplateChoice>();
  if (list !== null) {
    for (const pool of elementsOf(project, POOL_KIND)) {
      const elements = asObject(pool.data)?.elements;
      for (const entry of Array.isArray(elements) ? elements : []) {
        const element = asObject(asObject(entry)?.element);
        if (element === undefined) continue;
        const members = Array.isArray(element.elements) ? element.elements : [element];
        for (const raw of members) {
          const member = asObject(raw);
          const location = member?.location;
          const processors = member?.processors;
          if (typeof location !== 'string' || typeof processors !== 'string') continue;
          if (namespaced(processors) !== list) continue;
          const id = namespaced(location);
          if (paired.has(id)) continue;
          const type = member?.element_type ?? element.element_type;
          paired.set(id, {
            id,
            withThisList: true,
            ...(typeof type === 'string' ? { elementType: namespaced(type) } : {}),
            source: own.has(id) || !id.startsWith('minecraft:') ? 'project' : 'vanilla',
          });
        }
      }
    }
  }
  const rest = [...own]
    .filter((id) => !paired.has(id))
    .sort((a, b) => wordsOfPath(a).localeCompare(wordsOfPath(b)) || a.localeCompare(b))
    .map((id): TemplateChoice => ({ id, withThisList: false, source: 'project' }));
  return [...paired.values(), ...rest];
}

/** The processor lists of the mod, by name (for the Structure Studio's link). */
export function processorLists(project: Project): { readonly id: string }[] {
  return elementsOf(project, PROCESSOR_LIST_KIND)
    .map((element) => ({ id: element.id }))
    .sort((a, b) => wordsOfPath(a.id).localeCompare(wordsOfPath(b.id)) || a.id.localeCompare(b.id));
}

/**
 * The list a pool of the mod places `templateId` with, if any (the Structure Studio picks it
 * first); `null` when no pool does.
 */
export function listForTemplate(project: Project, templateId: string): string | null {
  const lists = new Set(processorLists(project).map((entry) => entry.id));
  for (const { id } of processorLists(project)) {
    const choice = templateChoices(project, id).find((c) => c.id === namespaced(templateId));
    if (choice?.withThisList === true && lists.has(id)) return id;
  }
  return null;
}

/** The block tags a list names: `tag_match`'s `tag`, and every `#tag` string. */
export function namedTags(list: unknown): string[] {
  const out = new Set<string>();
  const walk = (value: unknown, key: string | null): void => {
    if (typeof value === 'string') {
      if (value.startsWith('#')) out.add(namespaced(value));
      else if (key === 'tag') out.add(namespaced(value));
      return;
    }
    if (Array.isArray(value)) {
      for (const inner of value) walk(inner, key);
      return;
    }
    if (typeof value === 'object' && value !== null) {
      for (const [k, inner] of Object.entries(value)) walk(inner, k);
    }
  };
  walk(list, null);
  return [...out].sort();
}

/**
 * The tag files a run needs, the mod's over Minecraft's, with every tag they name in turn.
 * `vanilla` answers a vanilla tag's JSON, or `undefined`.
 */
export function gatherTags(
  project: Project,
  names: readonly string[],
  vanilla: (id: string) => Json | undefined,
): { readonly tags: Readonly<Record<string, Json>>; readonly namesVanilla: boolean } {
  const own = new Map(
    elementsOf(project, BLOCK_TAG_KIND).map((element) => [namespaced(element.id), element.data]),
  );
  const tags: Record<string, Json> = {};
  let namesVanilla = false;
  const queue = [...names];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    const json = own.get(id) ?? vanilla(id);
    if (!own.has(id)) namesVanilla = true;
    if (json === undefined) continue;
    tags[id] = json;
    const values = asObject(json)?.values;
    for (const value of Array.isArray(values) ? values : []) {
      const text = typeof value === 'string' ? value : asObject(value)?.id;
      if (typeof text === 'string' && text.startsWith('#')) queue.push(namespaced(text));
    }
  }
  return { tags, namesVanilla };
}

// ---------------------------------------------------------------------------------------------
// The swipe line

/** One template's data as the 3D preview reads it (`preview/structure.ts`). */
export interface FlatTemplate {
  readonly size: [number, number, number];
  readonly palette: string[];
  readonly blocks: [number, number, number, number][];
}

/**
 * The before and the after in one template, cut by the swipe line across the building's width:
 * columns left of `cut` (x below it) as the template is, the rest as the processors left it. A
 * block a processor left out is empty there (the world's block stays).
 */
export function swipeTemplate(
  template: PieceTemplate,
  result: Pick<ProcessedResult, 'after' | 'palette'> | null,
  cut: number,
): FlatTemplate {
  const cells = new Map<string, string>();
  for (const block of template.blocks ?? []) {
    if (block.pos[0] >= cut && result !== null) continue;
    const state = template.palette[block.state];
    if (state !== undefined) cells.set(block.pos.join(','), state);
  }
  let maxY = template.size[1];
  if (result !== null) {
    for (const block of result.after) {
      if (block.pos[0] < cut || block.pos[1] < 0) continue;
      const state = result.palette[block.state];
      if (state === undefined) continue;
      cells.set(block.pos.join(','), state);
      maxY = Math.max(maxY, block.pos[1] + 1);
    }
  }
  const palette: string[] = [];
  const index = new Map<string, number>();
  const blocks: [number, number, number, number][] = [];
  for (const [key, state] of cells) {
    let i = index.get(state);
    if (i === undefined) {
      i = palette.length;
      palette.push(state);
      index.set(state, i);
    }
    const [x, y, z] = key.split(',').map(Number) as [number, number, number];
    blocks.push([x, y, z, i]);
  }
  return { size: [template.size[0], maxY, template.size[2]], palette, blocks };
}

/** How many of the template's blocks the whole list changed (left out, swapped or moved). */
export function changedBlocks(
  template: PieceTemplate,
  result: Pick<ProcessedResult, 'after' | 'palette'>,
): number {
  const after = new Map<string, string>();
  for (const block of result.after) {
    after.set(block.pos.join(','), result.palette[block.state] ?? '');
  }
  let changed = 0;
  for (const block of template.blocks ?? []) {
    const key = block.pos.join(',');
    if (after.get(key) !== template.palette[block.state]) changed += 1;
    after.delete(key);
  }
  // Blocks a processor moved into a new place.
  return changed + after.size;
}
