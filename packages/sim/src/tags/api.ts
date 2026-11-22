/**
 * Tags, resolved once (ADR 0120 D5; B601 stubs the interface B600 reported, B604 fills it): a tag
 * over data pack order, the project's files over vanilla's from the jar, with `replace`, optional
 * entries and tags inside tags; cycles and missing entries are reported, never dropped silently.
 */

import type { Json } from '@msm/plugin-api';
import { createTagResolver, type TagOptions } from './resolve.js';

/** Reads one data file: `folder` is a registry folder key (`tags/item`, `loot_table`), `id` a resource location. */
export type DataLookup = (folder: string, id: string) => Json | undefined;

/** Where a tag member comes from. */
export type TagOrigin = 'project' | 'vanilla';

/** One member of a resolved tag. */
export interface TagMember {
  /** The member's id (an item, a block, ...). */
  readonly id: string;
  readonly origin: TagOrigin;
  /** The tags it came through, outermost first (empty when the tag names it itself). */
  readonly chain: readonly string[];
}

/** A tag as the game would load it. */
export interface ResolvedTag {
  readonly registry: string;
  readonly id: string;
  readonly members: readonly TagMember[];
  /** Required entries that do not exist (the game then drops the whole tag). */
  readonly missing: readonly string[];
  /** Each cycle found, as the ids around it. */
  readonly cycles: readonly (readonly string[])[];
  /** Whether the game drops this tag (a missing required entry or a cycle). */
  readonly dropped: boolean;
  /** Whether a project file's `replace` threw away vanilla's entries. */
  readonly replaced: boolean;
}

/**
 * Resolves a tag (B604) as the game loads it (B600's 2S5). `lookup` is vanilla's files, or the
 * project over vanilla made by `layeredLookup` (both layers kept); `options.project` gives the
 * project's files beside a vanilla-only lookup. A tag no file defines answers `dropped` with
 * itself (`#id`) in `missing`. To resolve many tags, keep one `createTagResolver`.
 *
 * `options` was added by B604 (optional, so B601's calls stay valid).
 */
export function resolveTag(
  registry: string,
  id: string,
  lookup: DataLookup,
  options?: TagOptions,
): ResolvedTag {
  return createTagResolver(lookup, options)(registry, id);
}
