/**
 * The generated change set's shape (ADR 0136 D2), as the B810 spike's README settled it.
 *
 * `@msm/plugin-api` (1.29.0, brief B812) owns `TargetChangeSet` and `TargetChange`; this file
 * holds a structurally equal local copy until brief B813 joins them, and
 * `test/types.test.ts` checks at compile time that the two are assignable both ways.
 *
 * @packageDocumentation
 */

/** A JSON value. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** The part of the game or the files a change belongs to. */
export type TargetChangeArea =
  | 'ids'
  | 'formats'
  | 'commands'
  | 'block-states'
  | 'packs'
  | 'players'
  | 'java'
  | 'vanilla-files';

/** What happened: the plugin API's 21 values. */
export type TargetChangeWhat =
  | 'registry-moved'
  | 'member-removed'
  | 'member-renamed'
  | 'type-added'
  | 'type-removed'
  | 'type-changed'
  | 'field-removed'
  | 'field-addedRequired'
  | 'field-addedOptional'
  | 'field-madeOptional'
  | 'field-madeRequired'
  | 'field-retyped'
  | 'root-removed'
  | 'path-removed'
  | 'argument-changed'
  | 'property-added'
  | 'property-removed'
  | 'values-changed'
  | 'default-changed'
  | 'value-changed'
  | 'file-changed';

/** Whether a migration does it, the user must, or nothing is needed. */
export type TargetChangeHandling = 'auto' | 'manual' | 'none';

/** Where a change was read from. */
export type TargetChangeSource =
  | 'registries'
  | 'mcdoc'
  | 'commands'
  | 'blocks'
  | 'version'
  | 'mcmeta-trees'
  | 'curated';

/** How alike the old and new member's data format are (rename candidates). */
export type CandidateShape = 'same' | 'superset' | 'subset' | 'similar' | 'differs' | 'none';

/**
 * A likely rename or field move found by `diff-targets`. Never applied by a migration until a
 * person confirms it in the target's curated change file and the shape test passes.
 */
export interface TargetChangeCandidate {
  kind: 'rename' | 'split' | 'merge' | 'field-move';
  /** The new member id (a rename) or the new field's pointer (a field move). */
  to: string;
  /** Name likeness, 0 to 1, two decimals. */
  name: number;
  shape: CandidateShape;
  /**
   * Set when two or three partners scored the same: `to` is the first of them by code point,
   * and the change's own `to` lists them all.
   */
  ambiguous?: true;
}

/** One change between two targets. */
export interface TargetChange {
  /** Stable: `${area}:${subject}` plus `#${field}` for a field or a block state property. */
  id: string;
  area: TargetChangeArea;
  what: TargetChangeWhat;
  /** The registry, or the dispatcher the subject is a member of. */
  registry?: string;
  /**
   * What changed: a registry or registry member (`fluid/flowing_water`), a dispatcher member
   * (`minecraft:resource/worldgen/noise_settings`), a named mcdoc type, a command path, a
   * block, or a `version.json` value.
   */
  subject: string;
  /**
   * For a data format: an RFC 6901 pointer below the subject, where `*` stands for any list
   * item or map key. For a block state: the property name.
   */
  field?: string;
  from?: Json;
  to?: Json;
  /** Registries of the newer target that still hold a removed id. */
  stillIn?: string[];
  handling: TargetChangeHandling;
  source: TargetChangeSource;
  /** From `diff-targets`: never applied until a person confirms it in the curated file. */
  candidate?: TargetChangeCandidate;
  /** Curated only. */
  sentence?: string;
  /** Curated only. */
  hint?: string;
  /** Curated only. */
  inGameCheck?: string;
}

/** One end's pins. */
export interface TargetChangeRefs {
  /** The vanilla-mcdoc commit. */
  mcdoc: string;
  /** The mcmeta version prefix (`<prefix>-summary`, `<prefix>-registries`). */
  mcmeta: string;
}

/**
 * One thing the newer version adds, in the additions list kept beside a change set (not part
 * of the plugin API: the set itself holds only the counts).
 */
export interface TargetAddition {
  /** `${area}:${subject}`. */
  id: string;
  area: 'ids' | 'commands';
  what: 'registry-added' | 'member-added' | 'path-added';
  /** The registry, for a member. */
  registry?: string;
  /** A registry, a registry member (`block/ice_crystal`) or a command path. */
  subject: string;
  source: 'registries' | 'commands';
}

/** The change set of a target against the one before it. */
export interface TargetChangeSet {
  /** The target this one follows (`mc-<version>`). */
  from: string;
  /** This target. */
  to: string;
  refs: { from: TargetChangeRefs; to: TargetChangeRefs };
  /** Sorted by id. */
  changes: TargetChange[];
  /**
   * Additions as counts: `ids:<registry>` for new members, `ids:(registries)` for new
   * registries, `commands:(paths)` for new command paths; the list itself in a file beside it.
   */
  additions: Record<string, number>;
}
