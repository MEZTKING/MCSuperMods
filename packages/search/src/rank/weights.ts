/**
 * Every number the ranker uses (ADR 0124 D6), in one place so that tuning (B666) edits one file.
 * The starting values are the B650 spike's after its one tuning pass (`spike-src/engine.ts`,
 * version 1: 87.8 % first and 95.1 % in the top three over the 82 draft queries), with the
 * signals the spike did not have (order, closeness, history, the mod's own kinds) kept small.
 * B666 tuned seven of them against the fixed query set (`app/test/search/golden-queries.json`,
 * 240 queries; `docs/reference/search-golden-report.md` has the numbers before and after): each
 * changed value says why beside it.
 */

import type { SearchIntent } from '../text';
import type { SearchSource } from '../types';

/** The fields of an entry, in falling weight (D6). Their order is the order of the arrays below. */
export const FIELDS = ['title', 'words', 'answers', 'sentence', 'ids', 'body'] as const;
export type Field = (typeof FIELDS)[number];
export const FIELD_COUNT = FIELDS.length;

/**
 * BM25F field weights. D6 lists the fields in falling weight; the id field keeps the spike's
 * tuned 1.2 (above the sentence), which the id queries needed. `answers` holds a flow's question and choice labels. The vocabulary's
 * ideas are not a field of the entry: they are reached at query time, so a vocabulary change
 * never rebuilds a layer, and an idea counts as much as the field it lands in times
 * {@link EXPANSION.same} (or {@link EXPANSION.near}).
 */
export const FIELD_WEIGHT: Readonly<Record<Field, number>> = {
  title: 3,
  words: 2,
  answers: 1.2,
  sentence: 1,
  ids: 1.2,
  body: 0.3,
};

/** BM25F length normalisation per field (0: none, 1: full). */
export const FIELD_B: Readonly<Record<Field, number>> = {
  title: 0.6,
  // B666 (was 0.5): a flow's long keyword list no longer loses to a door's two words.
  words: 0.3,
  answers: 0.3,
  sentence: 0.75,
  ids: 0.5,
  body: 0.75,
};

/** BM25 term-frequency saturation. */
export const K1 = 1.2;

/** How much a query word is worth when it reaches an entry by another route than itself. */
export const EXPANSION = {
  /** The word itself, or a plural or -ing or -ed form of it. */
  exact: 1,
  /** Another word of the same vocabulary group (idea, same, slang). */
  same: 0.85,
  /** A `near` word of a vocabulary group: weaker. */
  near: 0.5,
  /** Per corrected letter: a typo correction is worth `typo ** edits`. */
  typo: 0.75,
  /** A misspelling the vocabulary lists (beyond the typo limits): one edit's worth. */
  misspelling: 0.75,
  /** The word being typed, read as the start of a longer word. */
  prefix: 0.6,
  /** Two words read as one (`sky block`) when both are words too. */
  joined: 0.6,
  /** An unknown word read as two (`ironsword`). */
  split: 0.9,
  /** An intent word that is also an ordinary word (`make`, `new`): weak and optional. */
  weak: 0.4,
} as const;

/** The value of a query term that matches an entry's whole id (`base:thing_one`). */
export const EXACT_ID_SCORE = 10;

/** A word absorbed into a flow's answers and not otherwise matched adds this much (D7). */
export const ABSORBED_BONUS = 1.5;

/** Multipliers of the text score. */
export const BONUS = {
  /** The title is the query's words, no more and no fewer (or the name before a colon is). */
  exactTitle: 1.6,
  /** Every query word is in the title. */
  titleHasEvery: 1.25,
  /** Every query word matched somewhere. */
  everyWord: 1.15,
  /** The query's words stand in the title in the query's order. */
  inOrder: 1.1,
  /** The query's words stand next to each other in the title. */
  close: 1.05,
  /** Under the make lean, a flow whose answers took the thing's noun (it makes this thing). */
  makesThing: 1.3,
  /** A behaviour read from the words fits this flow. */
  behaviour: 1.35,
  /**
   * The words are the whole title word for word, stop and intent words included ("Very easy
   * mode", "What's new"; ADR 0124's open item after B666). On top of the exact title bonus (given
   * here when the dropped words left no title to compare), so it beats a shorter title that is
   * exact only once the stop words are gone ("Easy mode" scored 1 % above "Very easy mode").
   */
  wholeTitle: 1.25,
} as const;

/** Coverage: the text score times `floor + (1 - floor) * coverage²`. */
export const COVERAGE_FLOOR = 0.35;

/** Context multipliers (D6). */
export const CONTEXT = {
  /** Not available on the open target: shown last and greyed, never hidden. */
  unavailable: 0.3,
  /** A technical entry in Very easy (it sits under More). */
  technical: 0.5,
  /** A kind or template the open mod already uses. */
  inMod: 1.1,
  /** Per time chosen before on this computer, up to {@link HISTORY_MAX_TIMES}. */
  historyPerTime: 0.03,
} as const;
export const HISTORY_MAX_TIMES = 5;

/** Source weight by intent (D4, D6). An intent word changes what ranks first, never what is found. */
export const SOURCE_WEIGHT: Readonly<Record<SearchIntent, Readonly<Record<SearchSource, number>>>> =
  {
    none: {
      flow: 1,
      tile: 1,
      starter: 0.85,
      example: 0.8,
      template: 0.7,
      kind: 0.55,
      project: 1.1,
      vanilla: 0.75,
      rule: 0.7,
      setting: 0.75,
      command: 0.75,
      // B666 (was 0.6): a section titled like a command or setting ("Import a structure",
      // "World backups") no longer comes before it when the words carry no intent.
      guide: 0.5,
      problem: 0.45,
    },
    make: {
      flow: 1.15,
      tile: 1.1,
      starter: 0.9,
      example: 0.8,
      template: 0.75,
      // B666 (was 0.6): "a new block" opens the Block tile or flow, not the empty element form.
      kind: 0.45,
      project: 0.7,
      // B666 (was 0.55): under the make lean a flow that makes the thing beats the game's own
      // thing of that exact name (B650's "netherite pick").
      vanilla: 0.45,
      rule: 0.7,
      setting: 0.3,
      // B666 (was 0.5): "new project" and "add namespace" read as make; still below `none`.
      command: 0.7,
      guide: 0.5,
      problem: 0.3,
    },
    learn: {
      // B666 (was 0.75): "how to make particles" finds the guide before the flow.
      flow: 0.65,
      tile: 0.7,
      starter: 0.6,
      example: 0.65,
      template: 0.55,
      kind: 0.5,
      project: 0.5,
      vanilla: 0.5,
      rule: 0.6,
      setting: 0.6,
      command: 0.6,
      guide: 1.25,
      problem: 0.7,
    },
    open: {
      flow: 0.7,
      tile: 0.6,
      starter: 0.6,
      example: 0.6,
      template: 0.55,
      kind: 0.8,
      project: 1.3,
      vanilla: 0.7,
      rule: 0.6,
      setting: 1.1,
      command: 1,
      guide: 0.6,
      problem: 0.6,
    },
    fix: {
      flow: 0.5,
      tile: 0.4,
      starter: 0.4,
      example: 0.4,
      template: 0.4,
      kind: 0.4,
      project: 0.7,
      vanilla: 0.4,
      rule: 0.5,
      setting: 0.6,
      command: 0.6,
      guide: 1,
      problem: 1.3,
    },
    command: {
      flow: 0.6,
      tile: 0.6,
      starter: 0.5,
      example: 0.5,
      template: 0.5,
      kind: 0.5,
      project: 0.6,
      vanilla: 0.5,
      rule: 0.6,
      setting: 1.1,
      command: 1.3,
      guide: 0.7,
      problem: 0.5,
    },
    id: {
      flow: 0.5,
      tile: 0.3,
      starter: 0.5,
      example: 0.5,
      template: 0.5,
      // B666 (was 0.9): a kind's id (`msm:block`) beats the open mod's elements of that kind.
      kind: 1.2,
      project: 1.2,
      vanilla: 1.2,
      rule: 0.6,
      setting: 0.4,
      command: 0.4,
      guide: 0.4,
      problem: 0.4,
    },
  };

/**
 * Ties of score break by this order of sources, then title, then id (D6). It is also the order
 * in which a folded group picks the result it shows (a tile and a card fold into their flow).
 */
export const SOURCE_ORDER: readonly SearchSource[] = [
  'flow',
  'starter',
  'example',
  'template',
  'kind',
  'rule',
  'project',
  'vanilla',
  'setting',
  'command',
  'guide',
  'problem',
  'tile',
];

/** The confidence floor: below it the list is headed Closest things and has no Best match. */
export const CONFIDENCE_FLOOR = 3;

/** Best matches shown at most (D6), and rows per section unless the request says. */
export const BEST_MATCHES = 3;
export const SECTION_ROWS = 3;
export const MAX_SECTION_ROWS = 50;

/** Scores are rounded to this many decimals, so float sums never decide a tie. */
export const SCORE_DECIMALS = 6;
