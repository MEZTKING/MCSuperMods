// The engine with the answer reader and the fixture flows, and a reader that keeps what it read
// for each entry, so a test sees the answers of every candidate, not only those shown.
import type { Json } from '@msm/plugin-api';
import {
  type AnswerReader,
  createAnswerReader,
  createSearchIndex,
  type DetailedEntryReading,
  type ReadQuery,
  type SearchAnswer,
  type SearchAnswerReader,
  type SearchEngine,
  type SearchEntry,
  type SearchMode,
} from '../../src';
import { flowEntries, flowFacts, pluginData, VOCABULARY } from './flows';

export interface Reading {
  readonly answer: SearchAnswer;
  readonly query: ReadQuery;
  readonly skip: readonly number[];
  readonly extra: readonly string[];
  readonly byEntry: ReadonlyMap<string, DetailedEntryReading>;
}

export interface Harness {
  readonly engine: SearchEngine;
  readonly reader: AnswerReader;
  ask(text: string, mode?: SearchMode): Reading;
}

/** A validator like the wizard's: names of letters, digits and spaces, at most 32 characters. */
export function validate(_starter: string, question: string, value: Json): boolean {
  if (question.endsWith('_name') || question === 'name') {
    return typeof value === 'string' && /^[A-Za-z][A-Za-z0-9 ]{0,31}$/.test(value);
  }
  return true;
}

const VANILLA: SearchEntry[] = [
  ['base:pig', 'Pig'],
  ['base:diamond', 'Diamond'],
  ['base:bone', 'Bone'],
  ['base:netherite_sword', 'Netherite sword'],
].map(([id, title]) => ({
  id: `vanilla:${id}`,
  source: 'vanilla' as const,
  title: title as string,
  ids: [id as string],
  available: true,
  action: { type: 'open', id: id as string },
  preview: { type: 'none' },
}));

export function harness(): Harness {
  const reader = createAnswerReader({
    plugins: [{ plugin: 'fixture', data: pluginData() }],
    flows: flowFacts(),
    things: [{ id: 'mod:ruby', name: 'Ruby', sort: 'item' }],
    validate,
  });
  let last: Omit<Reading, 'answer'> | undefined;
  const capturing: SearchAnswerReader = {
    read(query) {
      const reading = reader.read(query);
      const byEntry = new Map<string, DetailedEntryReading>();
      last = {
        query,
        skip: reading?.skip ?? [],
        extra: reading?.extra ?? [],
        byEntry,
      };
      if (reading === undefined) return undefined;
      return {
        ...(reading.skip !== undefined ? { skip: reading.skip } : {}),
        ...(reading.extra !== undefined ? { extra: reading.extra } : {}),
        get chips() {
          return reading.chips ?? [];
        },
        answer(entry) {
          const out = reading.answer?.(entry) as DetailedEntryReading | undefined;
          if (out !== undefined) byEntry.set(entry.id, out);
          return out;
        },
      };
    },
  };
  const engine = createSearchIndex({ vocabulary: [VOCABULARY], answers: capturing });
  engine.setLayer('static', flowEntries());
  engine.setLayer('vanilla', VANILLA);
  engine.warm();
  return {
    engine,
    reader,
    ask(text, mode = 'very-easy') {
      last = undefined;
      const answer = engine.query({ text, mode, limit: 50 });
      const read = last ?? {
        query: undefined as unknown as ReadQuery,
        skip: [],
        extra: [],
        byEntry: new Map<string, DetailedEntryReading>(),
      };
      return { answer, ...read };
    },
  };
}
