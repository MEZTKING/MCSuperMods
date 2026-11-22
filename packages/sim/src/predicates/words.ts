/**
 * Plain words for what could not be worked out (B604), for the views' notes ("only the game
 * knows", ADR 0120 D4). The type ids are the data's own; the words are MSM's.
 */

import type { Unsupported } from './api.js';
import { CONDITIONS_ONLY_IN_THE_GAME } from './conditions.js';
import { NUMBERS_ONLY_IN_THE_GAME } from './numbers.js';

const KIND_WORDS: Readonly<Record<Unsupported['kind'], string>> = {
  entry: 'loot entry',
  condition: 'condition',
  function: 'item function',
  number: 'number',
  level_value: 'level-based value',
  formula: 'bonus formula',
  reference: 'file named by id',
};

/** One sentence saying why a part was not worked out. */
export function unsupportedWords(note: Unsupported): string {
  if (note.type === 'not_yet') return 'Not worked out yet.';
  const known =
    note.kind === 'condition'
      ? CONDITIONS_ONLY_IN_THE_GAME[note.type]
      : note.kind === 'number'
        ? NUMBERS_ONLY_IN_THE_GAME[note.type]
        : undefined;
  if (known !== undefined) return known;
  const what = `The ${KIND_WORDS[note.kind]} "${note.type}"`;
  switch (note.reason) {
    case 'needs_world':
      return `${what} needs the world around it, or something this situation does not hold: only the game knows.`;
    case 'missing_file':
      return `${what} was not found in your project or in Minecraft's files.`;
    default:
      return `${what} is not worked out here: only the game knows.`;
  }
}
