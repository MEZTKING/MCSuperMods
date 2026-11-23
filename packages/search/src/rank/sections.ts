/**
 * Best matches and sections (ADR 0124 D6): up to three Best matches across all sources, then
 * sections in the order of their best score (Things you can make, In your mod, From Minecraft,
 * How to, Settings and commands, Things to fix), three rows each and a count of the rest; Very
 * easy's technical entries sit in More, always last. An unavailable entry is never a Best match
 * and comes after the available ones of its section. Below the confidence floor there is no Best
 * match: the list reads as Closest things. Pure.
 */

import type {
  SearchEntry,
  SearchHit,
  SearchMode,
  SearchRequest,
  SearchSection,
  SearchSource,
} from '../types';
import { BEST_MATCHES, CONFIDENCE_FLOOR } from './weights';

/** Section ids, in the order they are shown when their best scores tie. */
export const SECTION_IDS = [
  'make',
  'mine',
  'minecraft',
  'help',
  'commands',
  'fix',
  'more',
] as const;
export type SectionId = (typeof SECTION_IDS)[number];

/** The headings the app shows (Very easy's wording is the app's). */
export const SECTION_TITLES: Readonly<Record<SectionId, string>> = {
  make: 'Things you can make',
  mine: 'In your mod',
  minecraft: 'From Minecraft',
  help: 'How to',
  commands: 'Settings and commands',
  fix: 'Things to fix',
  more: 'More',
};

const SECTION_OF_SOURCE: Readonly<Record<SearchSource, SectionId>> = {
  flow: 'make',
  starter: 'make',
  template: 'make',
  example: 'make',
  kind: 'make',
  tile: 'make',
  rule: 'make',
  project: 'mine',
  vanilla: 'minecraft',
  guide: 'help',
  setting: 'commands',
  command: 'commands',
  problem: 'fix',
};

/** The sections a scope chip or prefix keeps (D10). */
export const SCOPE_SECTIONS: Readonly<
  Record<NonNullable<SearchRequest['scope']>, readonly SectionId[]>
> = {
  make: ['make', 'more'],
  mine: ['mine', 'fix'],
  minecraft: ['minecraft'],
  help: ['help'],
  commands: ['commands'],
};

/** The section an entry is shown in. */
export function sectionOf(entry: SearchEntry, mode: SearchMode): SectionId {
  if (mode === 'very-easy' && entry.technical === true) return 'more';
  return SECTION_OF_SOURCE[entry.source] ?? 'make';
}

/** Whether an entry is in a scope (no scope keeps everything). */
export function inScope(
  entry: SearchEntry,
  mode: SearchMode,
  scope: SearchRequest['scope'],
): boolean {
  if (scope === undefined) return true;
  const sections = SCOPE_SECTIONS[scope];
  if (sections === undefined) return true;
  const section = sectionOf(entry, mode);
  // A technical entry keeps its scope in Very easy: More belongs to every scope.
  return (
    sections.includes(section) ||
    (section === 'more' && sections.includes(SECTION_OF_SOURCE[entry.source]))
  );
}

/** What the confidence floor reads. */
export interface ConfidenceInput {
  /** The best available score. */
  readonly top: number;
  /** Query words matched as typed or through the vocabulary (no typo correction). */
  readonly plain: number;
  /** Query words in all: those matched and those not understood. */
  readonly words: number;
  /** Words corrected by the typo index or a listed misspelling. */
  readonly corrected: number;
  /** A whole id matched. */
  readonly exactId: boolean;
}

/**
 * Confident when the best score clears the floor and at least half the words were read without
 * a correction (B650 version 1), or the one word typed was corrected, or a whole id matched.
 */
export function isConfident(input: ConfidenceInput): boolean {
  if (input.exactId && input.top > 0) return true;
  if (input.top < CONFIDENCE_FLOOR) return false;
  if (input.plain * 2 >= input.words) return true;
  return input.words === 1 && input.corrected === 1;
}

/** Hits in ranking order split into Best matches and sections. */
export function arrange(
  hits: readonly SearchHit[],
  options: { readonly mode: SearchMode; readonly confident: boolean; readonly rows: number },
): { best: SearchHit[]; sections: SearchSection[] } {
  const best: SearchHit[] = [];
  if (options.confident) {
    for (const hit of hits) {
      if (best.length >= BEST_MATCHES) break;
      if (hit.entry.available === false || sectionOf(hit.entry, options.mode) === 'more') continue;
      best.push(hit);
    }
  }
  const chosen = new Set(best);
  const grouped = new Map<SectionId, { available: SearchHit[]; unavailable: SearchHit[] }>();
  for (const hit of hits) {
    if (chosen.has(hit)) continue;
    const id = sectionOf(hit.entry, options.mode);
    let group = grouped.get(id);
    if (group === undefined) {
      group = { available: [], unavailable: [] };
      grouped.set(id, group);
    }
    (hit.entry.available === false ? group.unavailable : group.available).push(hit);
  }
  const sections: (SearchSection & { top: number; order: number })[] = [];
  for (const [id, group] of grouped) {
    const all = [...group.available, ...group.unavailable];
    const top = all.reduce((max, hit) => Math.max(max, hit.score), Number.NEGATIVE_INFINITY);
    sections.push({
      id,
      hits: all.slice(0, options.rows),
      more: Math.max(0, all.length - options.rows),
      top: id === 'more' ? Number.NEGATIVE_INFINITY : top,
      order: SECTION_IDS.indexOf(id),
    });
  }
  sections.sort((a, b) => b.top - a.top || a.order - b.order);
  return { best, sections: sections.map(({ id, hits: rows, more }) => ({ id, hits: rows, more })) };
}
