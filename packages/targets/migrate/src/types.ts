/**
 * The shapes the migration engine runs on (ADR 0136 D3): steps, the plan a target builds from its
 * change set, and the curated half of a change set as a person writes it. General: nothing here
 * names a Minecraft version, registry member or data format of one.
 *
 * @packageDocumentation
 */

import type {
  Json,
  TargetChange,
  TargetChangeCandidate,
  TargetChangeHandling,
} from '@msm/plugin-api';

/**
 * Where a field step looks: elements of `kind`, at the RFC 6901 pointer `at` inside their data
 * (`''` is the data itself). A segment `*` matches every key of an object or item of a list, so a
 * `*` after `/dimensions` reaches each dimension of a world preset. A place whose value is not an
 * object (an id where inline data could also be written) is skipped.
 */
export interface Place {
  kind: string;
  at: string;
}

/**
 * A registry member the newer version no longer has (a `member-removed` or `member-renamed`
 * change). Wherever element data names it as a whole string, the engine renames it when
 * {@link IdStep.apply} is true and otherwise reports it with the hint.
 */
export interface IdStep {
  op: 'rename-id';
  /** The change this step answers: `ids:<registry>/<id>`. */
  changeId: string;
  /** The registry the id was removed from; a `tag/` registry is matched only by `#` references. */
  registry: string;
  /** The removed id, without namespace. */
  from: string;
  /** The confirmed replacement in the same registry, without namespace. */
  to?: string;
  /**
   * Whether the engine rewrites the id: only for a rename a person confirmed whose replacement
   * was proved the same shape against the newer target's schemas (ADR 0037 D3). Otherwise the
   * id is reported and never rewritten.
   */
  apply: boolean;
  /**
   * The id is still a member of another registry in the newer version, so it is matched only as
   * the value of a `type` field (where it names this registry's member).
   */
  typeOnly?: boolean;
  /** What the user has to change, in British English, appended to the report. */
  hint?: string;
}

/** Removes `field` from the object at each place. No exact inverse: the dropped value is kept. */
export interface DropStep {
  op: 'drop';
  changeId: string;
  places: readonly Place[];
  /** The key removed from the object at the place. */
  field: string;
  /** Drops only when the value equals this one (the inverse of a {@link SetStep}). */
  ifValue?: Json;
  /** Why, as the end of the sentence "Removed /x, …" ("which … no longer have"). */
  because?: string;
}

/** Moves a value inside the object at each place, from one pointer to another. Its inverse is exact. */
export interface MoveStep {
  op: 'move';
  changeId: string;
  places: readonly Place[];
  /** RFC 6901 pointer below the place the value is at before. */
  from: string;
  /** RFC 6901 pointer below the place the value goes to; its parent must exist. */
  to: string;
}

/** Gives `field` the one right value where the newer version newly requires it and it is absent. */
export interface SetStep {
  op: 'set';
  changeId: string;
  places: readonly Place[];
  field: string;
  value: Json;
}

/**
 * Renames a block state property of `block`, or its values, wherever data writes a block state:
 * an object with `Name` and `Properties`, or a whole string `block[property=value,…]`.
 */
export interface BlockStateStep {
  op: 'block-state';
  changeId: string;
  /** The block id; without a namespace it is a `minecraft:` block. */
  block: string;
  property: string;
  /** The property's new name. */
  renameTo?: string;
  /** Old value to new value. */
  values?: Readonly<Record<string, string>>;
}

/** A step that rewrites fields of the objects at its places. */
export type FieldStep = DropStep | MoveStep | SetStep;

/** Every step type of ADR 0136 D3. No command-word step: no change has needed one (B810 V4, V6). */
export type MigrationStep = IdStep | FieldStep | BlockStateStep;

/** What one target's migration runs: the steps, in order, and the change set they answer. */
export interface MigrationPlan {
  /** The target id the plan migrates from. */
  from: string;
  /** The target id the plan migrates to; a project already on it needs nothing. */
  to: string;
  /** The newer end's Minecraft version, for messages. */
  version: string;
  steps: readonly MigrationStep[];
  /**
   * The merged change set's entries, read for each step's sentence, hint and in-game check by
   * {@link IdStep.changeId}.
   */
  changes?: readonly TargetChange[];
  /**
   * Kinds whose data is plain text for people (language files): neither the id walk nor the
   * text search looks inside them. Defaults to {@link DEFAULT_PLAIN_TEXT_KINDS}.
   */
  plainTextKinds?: readonly string[];
}

/** The plain-text kinds the walk skips by default (a translation equal to an id is not an id). */
export const DEFAULT_PLAIN_TEXT_KINDS: readonly string[] = Object.freeze(['minecraft:lang']);

/**
 * A curated field or block state step, as written in a target's `curated.ts`: the change id
 * comes from the entry that holds it.
 */
export type CuratedStep =
  | Omit<DropStep, 'changeId'>
  | Omit<MoveStep, 'changeId'>
  | Omit<SetStep, 'changeId'>
  | Omit<BlockStateStep, 'changeId'>;

/** A rename a person confirmed for a removed member (ADR 0136 D2, D11). */
export interface CuratedRename {
  /** The new id in the same registry, without namespace. */
  to: string;
  /**
   * How the new member's shape compares with the old one, as the curator found it and the
   * target's test proves against both versions' schemas: only `same` is ever applied. `none` is
   * for members without a data shape (tags, textures, sounds), which are never rewritten.
   */
  shape: TargetChangeCandidate['shape'];
  /**
   * The schema dispatcher that maps a member of the registry to its shape, for the test's proof
   * (such as the feature config dispatcher for feature types). Absent when `shape` is `none`.
   */
  dispatcher?: string;
}

/**
 * One entry of a target's curated change set: it answers a generated change (same `id`) or, with
 * {@link CuratedChange.change}, records a change no data file shows.
 */
export interface CuratedChange {
  /** The generated change's id, or a new one (`<area>:<subject>`) with `change` set. */
  id: string;
  /** Overrides the generated handling (`auto` where a step here does it). */
  handling?: TargetChangeHandling;
  /** The plain sentence for the user, in British English. */
  sentence?: string;
  /** How the user makes the change by hand. */
  hint?: string;
  /** What to check in the game when the change touches a mod. */
  inGameCheck?: string;
  /** A confirmed rename of a removed member. */
  rename?: CuratedRename;
  /** The steps that do this change, in order. */
  steps?: readonly CuratedStep[];
  /** For a change in no data file: the change itself (its source is `curated`). */
  change?: Omit<TargetChange, 'id' | 'source' | 'handling'> & { handling?: TargetChangeHandling };
}

/** A target's curated change set. */
export interface CuratedChangeSet {
  /** The target id the set runs from (the target's `previous`). */
  from: string;
  /** The target id that holds the set. */
  to: string;
  changes: readonly CuratedChange[];
}
