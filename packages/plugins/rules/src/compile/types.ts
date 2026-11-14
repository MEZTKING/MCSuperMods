/**
 * Types of the rule book compiler (ADR 0082 D3, D9).
 *
 * `ElementPatch` mirrors the plugin API 1.15.0 type of the same name (ADR 0082 D9, brief B364).
 * It is declared here structurally until that API version is merged; B368 replaces it with the
 * import from `@msm/plugin-api`.
 */
import type { Json, Problem, ResourceLocation } from '@msm/plugin-api';

/**
 * One change to a copy of an element's data before lowering (ADR 0082 D9): `value` is written at
 * `path` (keys and array indexes from the root of `data`). `origin` is the rule the change comes
 * from, so problems on the patched field point at the rule.
 */
export interface ElementPatch {
  readonly elementId: ResourceLocation;
  readonly path: readonly (string | number)[];
  readonly value: Json;
  readonly origin: { readonly elementId: ResourceLocation; readonly pointer: string };
}

/** What `compileRuleBook` returns. */
export interface CompiledRuleBook {
  /** Changes to the subjects' definitions: generated events and trigger components. */
  readonly patches: ElementPatch[];
  /**
   * The generated TypeScript script as lines (the `msm/<ns>/script/rules/<book path>.ts` output
   * of B368), or null when every rule is plain or there are none.
   */
  readonly script: string[] | null;
  /** Problems found while compiling, with the book's id and a pointer into the book. */
  readonly problems: Problem[];
}

/**
 * Problem codes the compiler reports (`rules.<check>`). A rule with an error is left out of the
 * output; the other rules still compile.
 */
export const RULES_COMPILE_CODES = Object.freeze({
  /** A trigger id the catalogue does not know (a newer MSM, or a typo). */
  unknownTrigger: 'rules.unknown-trigger',
  /** A step id the catalogue does not know. */
  unknownStep: 'rules.unknown-step',
  /** A condition id the catalogue does not know. */
  unknownCondition: 'rules.unknown-condition',
  /** A value reading the catalogue does not know. */
  unknownValue: 'rules.unknown-value',
  /** A place or "who" the catalogue does not know. */
  unknownPlace: 'rules.unknown-place',
  /** A definition trigger without a subject, or one that names no project element of its kind. */
  unknownSubject: 'rules.unknown-subject',
  /** The subject cannot have this trigger (a portal block that is used, for example). */
  wrongTrigger: 'rules.wrong-trigger',
  /** The trigger needs a component the subject lacks (`msm:container`, `msm:throwable`). */
  needsComponent: 'rules.needs-component',
  /** A step, condition, value or place names someone the trigger does not have. */
  noSuchActor: 'rules.no-such-actor',
  /** "Here" (or every player nearby) on a trigger that happens nowhere (the world triggers). */
  noSuchPlace: 'rules.no-such-place',
  /** "Stop the normal action" on a trigger that cannot be stopped. */
  cannotStop: 'rules.cannot-stop',
  /** "Light a portal" in a rule that compiles to script: only the format action lights portals. */
  needsPlain: 'rules.needs-plain',
  /** Removing a block "with drops": the Script API has no way to break a block with its drops. */
  dropsNotSupported: 'rules.drops-not-supported',
  /** The generated event id is already an event of the subject. */
  eventIdClash: 'rules.event-id-clash',
  /** Logic steps nested deeper than three levels. */
  tooDeep: 'rules.too-deep',
  /** More than 50 steps in one rule, nested ones included. */
  tooManySteps: 'rules.too-many-steps',
  /** A rule key that is not 1 to 32 of `a-z`, `0-9` and `_`. */
  badKey: 'rules.bad-key',
  /** The book needs a script and the target has no script runtime (no Fabric). */
  noScripts: 'rules.no-scripts',
});

/** One of {@link RULES_COMPILE_CODES}. */
export type RulesCompileCode = (typeof RULES_COMPILE_CODES)[keyof typeof RULES_COMPILE_CODES];
