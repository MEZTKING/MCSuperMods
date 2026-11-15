/**
 * Types of the rule book compiler (ADR 0082 D3, D9). `ElementPatch` is the plugin API 1.15.0
 * type (ADR 0082 D9).
 */
import type { ElementPatch, Problem, ResourceLocation } from '@msm/plugin-api';

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

/** What `compileRuleBooks` returns for all of a project's books together. */
export interface CompiledRuleBooks {
  /**
   * Changes to the subjects' definitions. Books sharing a subject and trigger share one
   * generated event (each book's part in book order), so no path is patched twice.
   */
  readonly patches: ElementPatch[];
  /** The generated script of each book that needs one, by book id, in book order. */
  readonly scripts: ReadonlyMap<ResourceLocation, string[]>;
  /** Problems of every book, in book order. */
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
  /**
   * A step or condition made for other triggers ("Stop the placing" outside "When a player
   * places a block", "caused by" outside "When something explodes"; B458).
   */
  notForTrigger: 'rules.not-for-trigger',
  /** A reading in words ("the way it faces") where a number is needed (B458). */
  notANumber: 'rules.not-a-number',
});

/** One of {@link RULES_COMPILE_CODES}. */
export type RulesCompileCode = (typeof RULES_COMPILE_CODES)[keyof typeof RULES_COMPILE_CODES];
