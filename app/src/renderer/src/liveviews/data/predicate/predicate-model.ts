/**
 * The words and rows of a predicate's answer (B610; ADR 0120 D4): `@msm/sim`'s `PartResult`
 * tree laid out as rows (each part's answer, its place in the data and its chance of yes), the
 * parts only the game knows matched to their rows by path (`unsupportedWords`, B604), and how
 * close each condition type is: checked on the real server by B600 (2S1, both targets), else
 * about right (written from the fields), and a part whose answer is unknown is only in the game.
 * Unknown is shown as unknown, never as no.
 */

import type { Answer, PartResult, Unsupported } from '@msm/sim';
import type { Fidelity } from '../../frame/fidelity';

/** The words of each answer (the plan's Very easy wording). */
export const ANSWER_WORDS: Readonly<Record<Answer, string>> = {
  yes: 'Yes',
  no: 'No',
  unknown: 'Only the game knows',
};

/** Condition types B600 checked against the real server on both targets (2S1). */
export const CHECKED_CONDITIONS: ReadonlySet<string> = new Set([
  'random_chance',
  'random_chance_with_enchanted_bonus',
  'table_bonus',
  'survives_explosion',
  'killed_by_player',
  'match_tool',
  'inverted',
  'all_of',
  'any_of',
  'weather_check',
  'time_check',
  'entity_properties',
  'entity_scores',
  'int_value_check',
  'location_check',
  // A predicate named by id, and a list (all of its parts must pass).
  'reference',
]);

/** Plain names of the condition types (the data's id otherwise). */
export const CONDITION_WORDS: Readonly<Record<string, string>> = {
  all_of: 'All of these',
  any_of: 'Any of these',
  inverted: 'Not this',
  random_chance: 'By chance',
  random_chance_with_enchanted_bonus: 'By chance, more with an enchantment',
  table_bonus: 'By chance, by enchantment level',
  survives_explosion: 'Survives the explosion',
  killed_by_player: 'Killed by a player',
  match_tool: 'The tool',
  weather_check: 'The weather',
  time_check: 'The time of day',
  entity_properties: 'The entity',
  entity_scores: 'The entity’s scores',
  int_value_check: 'A number in a range',
  float_value_check: 'A number in a range',
  location_check: 'The place',
  match_block: 'The block',
  damage_source_properties: 'The damage',
  enchantment_active_check: 'An enchantment is active',
  environment_attribute_check: 'An environment attribute',
  reference: 'A predicate named by id',
  none: 'Nothing asked',
  missing: 'A part with no type',
};

const bare = (type: string): string =>
  type.startsWith('minecraft:') ? type.slice('minecraft:'.length) : type;

/** The plain name of a condition type. */
export function conditionWords(type: string): string {
  return CONDITION_WORDS[bare(type)] ?? `“${type}”`;
}

/** How close one part is. */
export function partFidelity(part: Pick<PartResult, 'type' | 'answer'>): Fidelity {
  if (part.answer === 'unknown') return 'only_in_game';
  return CHECKED_CONDITIONS.has(bare(part.type)) ? 'checked' : 'about_right';
}

/** One row of the parts list. */
export interface PartRow {
  readonly path: string;
  readonly type: string;
  readonly answer: Answer;
  readonly depth: number;
  readonly chance?: number;
  readonly fidelity: Fidelity;
  /** What could not be worked out at this part, in words. */
  readonly unknown: readonly Unsupported[];
}

/** The parts, depth first (the predicate itself first), each with the notes at its path. */
export function partRows(root: PartResult, unsupported: readonly Unsupported[]): PartRow[] {
  const byPath = new Map<string, Unsupported[]>();
  for (const note of unsupported) {
    const list = byPath.get(note.path) ?? [];
    list.push(note);
    byPath.set(note.path, list);
  }
  const rows: PartRow[] = [];
  const claimed = new Set<string>();
  const walk = (part: PartResult, depth: number): void => {
    const notes = byPath.get(part.path) ?? [];
    claimed.add(part.path);
    rows.push({
      path: part.path,
      type: part.type,
      answer: part.answer,
      depth,
      ...(part.chance === undefined ? {} : { chance: part.chance }),
      fidelity: partFidelity(part),
      unknown: notes,
    });
    for (const child of part.parts) walk(child, depth + 1);
  };
  walk(root, 0);
  // A note below a part (a number inside it) goes to the nearest part above it.
  for (const [path, notes] of byPath) {
    if (claimed.has(path)) continue;
    let best = -1;
    for (const [i, row] of rows.entries()) {
      if (path.startsWith(`${row.path}/`) || row.path === '') {
        if (best < 0 || row.path.length >= (rows[best]?.path.length ?? 0)) best = i;
      }
    }
    const row = rows[best];
    if (row !== undefined) rows[best] = { ...row, unknown: [...row.unknown, ...notes] };
  }
  return rows;
}

/** A chance as words: `37%`, `under 0.1%`. */
export function chanceWords(chance: number): string {
  if (chance > 0 && chance < 0.001) return 'under 0.1%';
  if (chance < 1 && chance > 0.999) return 'over 99.9%';
  return `${Math.round(chance * 1000) / 10}%`;
}

/** The place of a part in the data, for people: `the whole predicate`, `/terms/0`. */
export function pathWords(path: string): string {
  return path === '' ? 'the whole predicate' : path;
}

/**
 * Whether the data names one of vanilla's files (a `#minecraft:` tag, or a file reported as not
 * found): the frame's set-up banner shows only then (B603's rule).
 */
export function namesVanillaFile(data: unknown, unsupported: readonly Unsupported[] = []): boolean {
  if (unsupported.some((note) => note.reason === 'missing_file')) return true;
  const walk = (value: unknown, depth: number): boolean => {
    if (depth > 64) return false;
    if (typeof value === 'string')
      return value.startsWith('#minecraft:') || (value.startsWith('#') && !value.includes(':'));
    if (Array.isArray(value)) return value.some((entry) => walk(entry, depth + 1));
    if (typeof value === 'object' && value !== null) {
      return Object.values(value).some((entry) => walk(entry, depth + 1));
    }
    return false;
  };
  return walk(data, 0);
}
