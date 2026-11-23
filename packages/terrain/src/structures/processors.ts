/**
 * The structure processors (ADR 0122 D6; B638), written clean room from the spike B634's
 * before-and-after worlds on both targets (`docs/reference/spikes/b634/README.md`, "Processor list
 * for B638"): 11 processor types; the rows learned exactly are applied as exact, `block_age`, the two
 * linear position tests and `lava_submerged_block` as about right, and the block entity modifiers
 * `clear` and `passthrough` and the pool element's `corner_constraint` only named (limit 4L4: the
 * template shown unchanged for them). Random processors draw from MSM's own random, seeded by the
 * seed, the piece's origin and the processor's place in the list.
 *
 * How a run goes, as the worlds showed it:
 * 1. Every jigsaw placement first turns jigsaw blocks into their `final_state` (the spike's
 *    `jigsaw_replacement` list equalled no list at all); listed as its own row.
 * 2. A `legacy_single_pool_element` leaves the template's air out (the world's block stays).
 * 3. The list's processors in order, each over every block still placed; a block left out stays
 *    left out.
 *
 * The world is read through {@link ProcessorWorld}: `blockAt` for location tests,
 * `protected_blocks` and `lava_submerged_block`; `surfaceAt` for `gravity`, taken as the first free
 * y above the ground (the game's heightmap: on the spike's floor, first air at -60, a gravity
 * template's y 0 landed at -60).
 *
 * Version facts stay outside: the registry of rule tests has two names across the targets but the
 * same ids, so only the ids are read; whether `corner_constraint` is read comes in
 * {@link ProcessorTargetFacts}.
 */

import { BlockTags, isObject } from '../features/blocks';
import { FeatureRandom, mixAll, seedWords } from '../features/random';
import type {
  PieceTemplate,
  ProcessedTemplate,
  ProcessInput,
  ProcessorRuleResult,
  TemplateBlock,
} from './api';
import { rotationIndex } from './jigsaw';
import {
  type Cell,
  type Cells,
  countChanged,
  idOfState,
  normaliseState,
  RefusedList,
} from './processors/cells';
import { type CompiledProcessor, compileProcessor, type RunContext } from './processors/kinds';
import { typeId } from './processors/report';

export {
  BLOCK_ENTITY_MODIFIERS,
  BLOCK_ENTITY_MODIFIERS_ONLY_IN_THE_GAME,
  PROCESSOR_TYPES,
} from './processors/kinds';
export { POSITION_RULE_TESTS, RULE_TESTS } from './processors/tests';

const CORNER_NOTE =
  'This piece’s corner constraint is only in the game; the preview places the piece without checking its corners.';

/** Pool element fields the processors name but do not apply (limit 4L4). */
export const ELEMENT_FIELDS_ONLY_IN_THE_GAME: Readonly<Record<string, string>> = Object.freeze({
  corner_constraint: CORNER_NOTE,
});

/** What else a run may take beyond {@link ProcessInput}. */
export interface ProcessOptions {
  /**
   * Block tag files by id (`minecraft:stone_bricks` to the JSON of `tags/block/stone_bricks.json`),
   * the project's over the jar's, for `tag_match`, `rottable_blocks` and `protected_blocks`. Without
   * them a few tags are guessed by name and any other tag matches nothing (the row says so).
   */
  readonly blockTag?: (id: string) => unknown;
  /** The pool element the template came from: its type and its `corner_constraint`, if any. */
  readonly element?: { readonly type?: string; readonly cornerConstraint?: unknown };
  /** Whether jigsaw blocks turn into their final state first, as every jigsaw placement does. Default true. */
  readonly jigsawPlacement?: boolean;
}

/** A processed template, and why the game would refuse the list, if it would. */
export interface ProcessorListResult extends ProcessedTemplate {
  /** A sentence when the game refuses the list (a block state written as `{ Name }`); else null. */
  readonly refused: string | null;
}

const AIR = 'minecraft:air';
const JIGSAW_NOTE = 'Every jigsaw placement turns jigsaw blocks into their final state first.';
const LEGACY_NOTE =
  'A legacy element leaves its template’s air out, so the world’s block stays there.';

function posKey(pos: readonly [number, number, number]): string {
  return `${pos[0]},${pos[1]},${pos[2]}`;
}

/** The processors of a list as the data names it: `{ processors: [...] }` or a bare array. */
function listEntries(list: unknown): { entries: unknown[]; note?: string } {
  if (list === undefined || list === null) return { entries: [] };
  if (Array.isArray(list)) return { entries: list };
  if (isObject(list) && Array.isArray(list.processors)) return { entries: list.processors };
  if (typeof list === 'string') {
    if (typeId(list) === 'minecraft:empty') return { entries: [] };
    return {
      entries: [],
      note: `The processor list ${list} could not be found, so the template is shown unchanged.`,
    };
  }
  return {
    entries: [],
    note: 'The processor list cannot be read, so the template is shown unchanged.',
  };
}

function initialCells(template: PieceTemplate): Cells {
  return (template.blocks ?? []).map((b) => ({
    pos: b.pos,
    state: normaliseState(template.palette[b.state] ?? AIR),
    dy: 0,
    ...(b.nbt === undefined ? {} : { nbt: b.nbt }),
  }));
}

function finalStates(template: PieceTemplate): Map<string, string> {
  const map = new Map<string, string>();
  for (const j of template.jigsaws) {
    map.set(posKey(j.pos), normaliseState(j.finalState || AIR));
  }
  return map;
}

function jigsawFinalOf(finals: Map<string, string>): (cell: Cell) => string {
  return (cell) => {
    const known = finals.get(posKey(cell.pos));
    if (known) return known;
    const nbt = cell.nbt;
    if (isObject(nbt) && typeof nbt.final_state === 'string' && nbt.final_state.length > 0) {
      return normaliseState(nbt.final_state);
    }
    return AIR;
  };
}

function toBlocks(
  cells: Cells,
  template: PieceTemplate,
): { after: TemplateBlock[]; palette: string[] } {
  const palette = template.palette.slice();
  const index = new Map<string, number>();
  palette.forEach((state, i) => {
    const key = normaliseState(state);
    if (!index.has(key)) index.set(key, i);
  });
  const after: TemplateBlock[] = [];
  for (const cell of cells) {
    if (cell === null) continue;
    let i = index.get(cell.state);
    if (i === undefined) {
      i = palette.length;
      palette.push(cell.state);
      index.set(cell.state, i);
    }
    after.push({
      pos: [cell.pos[0], cell.pos[1] + cell.dy, cell.pos[2]],
      state: i,
      ...(cell.nbt === undefined ? {} : { nbt: cell.nbt }),
    });
  }
  return { after, palette };
}

/**
 * Applies a processor list to a template: the blocks after every processor (a block left out is
 * not in `after`: the world's block stays), and for each processor how many blocks it changed and
 * how faithfully. The same input and seed give the same result.
 */
export function processTemplate(
  input: ProcessInput,
  options: ProcessOptions = {},
): ProcessorListResult {
  const { template } = input;
  const tags = new BlockTags(options.blockTag ?? (() => undefined));
  const { entries, note: listNote } = listEntries(input.list);

  let compiled: CompiledProcessor[];
  try {
    compiled = entries.map((entry) => compileProcessor(entry, tags));
  } catch (error) {
    if (!(error instanceof RefusedList)) throw error;
    return {
      template,
      after: template.blocks ?? [],
      palette: template.palette,
      rules: [],
      refused: error.message,
    };
  }

  const rules: ProcessorRuleResult[] = [];
  const words = seedWords(input.seed);
  const [ox, oy, oz] = input.origin;
  const randomFor = (place: number): FeatureRandom =>
    new FeatureRandom(
      mixAll([words[0], words[1], ox, oy, oz]),
      mixAll([place, rotationIndex(input.rotation), words[1]]),
    );
  const finals = finalStates(template);
  const ctxFor = (place: number): RunContext => ({
    origin: input.origin,
    rotation: input.rotation,
    world: input.world,
    random: randomFor(place),
    jigsawFinal: jigsawFinalOf(finals),
  });

  let cells = initialCells(template);

  if (
    options.jigsawPlacement !== false &&
    cells.some((c) => c && idOfState(c.state) === 'minecraft:jigsaw')
  ) {
    const replacement = compileProcessor({ processor_type: 'minecraft:jigsaw_replacement' }, tags);
    const next = replacement.run(cells, ctxFor(-1));
    rules.push({
      type: 'minecraft:jigsaw_replacement',
      fidelity: 'exact',
      changed: countChanged(cells, next),
      note: JIGSAW_NOTE,
    });
    cells = next;
  }

  if (typeId(options.element?.type) === 'minecraft:legacy_single_pool_element') {
    const next = cells.map((c) => (c && idOfState(c.state) === AIR ? null : c));
    rules.push({
      type: 'minecraft:legacy_single_pool_element',
      fidelity: 'exact',
      changed: countChanged(cells, next),
      note: LEGACY_NOTE,
    });
    cells = next;
  }

  compiled.forEach((processor, place) => {
    const next = processor.run(cells, ctxFor(place));
    const unknownTags = [...tags.unknown];
    if (unknownTags.length > 0) {
      processor.report.mark(
        'about_right',
        `The block tag ${unknownTags.join(', ')} is not known here, so it matched nothing.`,
      );
      tags.unknown.clear();
    }
    const note = processor.report.note();
    rules.push({
      type: processor.type || '(unnamed)',
      fidelity: processor.report.fidelity,
      changed: countChanged(cells, next),
      ...(note === undefined ? {} : { note }),
    });
    cells = next;
  });

  if (listNote)
    rules.push({ type: '(list)', fidelity: 'only_in_game', changed: 0, note: listNote });

  const corner = options.element?.cornerConstraint;
  if (corner !== undefined && corner !== null) {
    rules.push(
      input.facts?.readsCornerConstraint === false
        ? {
            type: 'corner_constraint',
            fidelity: 'exact',
            changed: 0,
            note: 'This version of the game does not read a corner constraint, so it has no effect.',
          }
        : {
            type: 'corner_constraint',
            fidelity: 'only_in_game',
            changed: 0,
            note: CORNER_NOTE,
          },
    );
  }

  const { after, palette } = toBlocks(cells, template);
  return { template, after, palette, rules, refused: null };
}
