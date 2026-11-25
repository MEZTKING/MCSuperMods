/**
 * The removed-id tables of this target (ADR 0037 D3), as a view of its change set: registry
 * members that exist in the 26.3 vendored registries and not in this target's, the registry that
 * moved, the removed ids another registry still has, and the confirmed renames. Ids carry no
 * namespace, as in `registries.json`; consumers add `minecraft:`.
 *
 * The data is `changes/generated.json` (written only by `tools/diff-targets`, tied to both
 * vendored `registries.json` files by `test/changes.test.ts`) with `changes/curated.ts` laid
 * over it; nothing here is typed by hand but the moved registry's members, which the change set
 * records as one move and `test/removed-ids.test.ts` ties to the vendored data.
 */

import { idTablesFromChangeSet, type KnownRename } from '@msm/target-migrate';
import { changeSet } from './changes/index';

export type { KnownRename };

const tables = idTablesFromChangeSet(changeSet);

/**
 * The members of each registry that moved, unchanged, under another name (`rule_test` became
 * `rule_test_type`): the change set records the move, not the members.
 */
const MOVED_REGISTRY_MEMBERS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  rule_test: [
    'all_of',
    'always_true',
    'any_of',
    'block_match',
    'blockstate_match',
    'height_match',
    'not',
    'random_block_match',
    'random_blockstate_match',
    'tag_match',
  ],
});

/** Registry name to the ids removed from it since 26.3, both sorted; a moved registry lists all its members. */
export const REMOVED_IDS: Readonly<Record<string, readonly string[]>> = Object.freeze(
  Object.fromEntries(
    Object.entries({ ...tables.removed, ...MOVED_REGISTRY_MEMBERS }).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    ),
  ),
);

/**
 * Registries that are gone in this target while every member lives on, unchanged, in the named
 * registry. Their ids still mean the same thing, so the migration does not report them.
 */
export const MOVED_REGISTRIES: Readonly<Record<string, string>> = Object.freeze(tables.moved);

/**
 * Removed members whose id is still an entry of another registry in this target (registry →
 * id → the registries that keep it). `large_dripstone` is no longer a feature type, but the
 * vanilla configured and placed features of that name remain, so the migration reports it only
 * where it is a feature's `type`.
 */
export const STILL_REGISTERED_ELSEWHERE: Readonly<
  Record<string, Readonly<Record<string, readonly string[]>>>
> = Object.freeze(tables.stillRegistered);

/**
 * Confirmed renames from 26.3 to this target (`curated.ts`). `sameShape` is true only for a
 * rename proved the same shape; every rename here is reported with its hint, none rewritten.
 */
export const KNOWN_RENAMES: readonly KnownRename[] = Object.freeze(tables.renames);
