/**
 * The frozen interfaces of the search engine (ADR 0124; docs/PLAN-search.md "The entry and the
 * engine's interface", with B650's corrections). Data only: actions and previews are descriptors,
 * never functions, because they cross the worker boundary.
 */

import type { Json } from '@msm/plugin-api';

/** Where an entry comes from. `tile` folds into its flow unless the tile has a chooser. */
export type SearchSource =
  | 'flow'
  | 'starter'
  | 'template'
  | 'example'
  | 'kind'
  | 'project'
  | 'vanilla'
  | 'rule'
  | 'setting'
  | 'command'
  | 'guide'
  | 'problem'
  | 'tile';

/** The app's view mode (the app's `UiMode`, repeated so this package imports nothing of the app). */
export type SearchMode = 'very-easy' | 'easy' | 'advanced';

/** What a result does when chosen. A descriptor the app's `run-action.ts` turns into work. */
export interface SearchAction {
  readonly type: string;
  readonly [field: string]: Json | undefined;
}

/** What a result shows beside the list. A descriptor the app's `ResultPreview.tsx` draws. */
export interface SearchPreview {
  readonly type: string;
  readonly [field: string]: Json | undefined;
}

/** One question of a flow, as the answer reader needs it. */
export interface SearchQuestion {
  readonly id: string;
  readonly label: string;
  readonly type: 'string' | 'number' | 'boolean' | 'colour' | 'choice' | 'set' | 'image' | 'audio';
  readonly choices?: readonly { readonly value: string; readonly label: string }[];
  readonly min?: number;
  readonly max?: number;
}

export interface SearchEntry {
  readonly id: string;
  readonly source: SearchSource;
  readonly title: string;
  readonly sentence?: string;
  readonly words?: readonly string[];
  readonly body?: string;
  readonly ids?: readonly string[];
  readonly available: boolean;
  readonly unavailableReason?: string;
  readonly technical?: boolean;
  readonly plugin?: string;
  readonly questions?: readonly SearchQuestion[];
  readonly action: SearchAction;
  readonly preview: SearchPreview;
}

export interface SearchRequest {
  readonly text: string;
  readonly mode: SearchMode;
  readonly scope?: 'make' | 'mine' | 'minecraft' | 'help' | 'commands';
  readonly limit?: number;
}

/** What the engine understood of the words: shown as chips. Filled by B659. */
export interface Understood {
  readonly corrected?: string;
  readonly chips: readonly {
    readonly text: string;
    readonly kind: string;
    readonly struck?: boolean;
  }[];
}

/** A hit as the engine returns it; across the worker it is slim (the client keeps entries by id). */
export interface SearchHit {
  readonly entry: SearchEntry;
  readonly score: number;
  readonly answers?: Readonly<Record<string, Json>>;
  readonly behaviour?: { readonly id: string; readonly sentence: string };
  readonly why: readonly string[];
}

/** A hit across the worker boundary: no entry, only its id. */
export interface SearchHitSlim {
  readonly id: string;
  readonly score: number;
  readonly answers?: Readonly<Record<string, Json>>;
  readonly behaviour?: { readonly id: string; readonly sentence: string };
  readonly why: readonly string[];
}

export interface SearchSection {
  readonly id: string;
  readonly hits: readonly SearchHit[];
  readonly more: number;
}

export interface SearchAnswer {
  readonly understood: Understood;
  readonly best: readonly SearchHit[];
  readonly sections: readonly SearchSection[];
  readonly confident: boolean;
}

/** The index: layers built, replaced and patched by deltas. Filled by B658. */
export interface SearchIndex {
  /** Replaces one layer (static, vanilla or project) with these entries. */
  setLayer(layer: string, entries: readonly SearchEntry[]): void;
  /** Patches one layer: entries added or replaced, and ids removed. */
  patchLayer(layer: string, upserts: readonly SearchEntry[], removes: readonly string[]): void;
  /** Answers a request. Never throws, on any string. */
  query(request: SearchRequest): SearchAnswer;
}

const NOT_YET = 'The search engine is not built yet (docs/PLAN-search.md, wave 2 and 3).';

/** Makes an index. A stub until B658. */
export function createSearchIndex(): SearchIndex {
  throw new Error(NOT_YET);
}
