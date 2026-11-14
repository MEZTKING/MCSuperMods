/**
 * State shared by the generator modules while one project is generated.
 *
 * @packageDocumentation
 */

import type { GeneratedFile, JavaProjectInput } from '@msm/plugin-api';

/** The generation of one ejected project. */
export interface GenerationContext {
  readonly input: JavaProjectInput;
  /** `src/main/java/<package path>`. */
  readonly javaRoot: string;
  /** Files generated so far. */
  readonly files: GeneratedFile[];
  /** Set when a generated class calls the `Actions` helpers. */
  usesActions: boolean;
  /** Set when an event uses `apply_effect` (`Actions.applyEffect` is then written). */
  usesApplyEffect: boolean;
  /** Set when an event uses `launch` (`Actions.launch` is then written, ADR 0052). */
  usesLaunch: boolean;
  /** Set when an event uses `damage` (`Actions.damage` is then written, ADR 0055 D4). */
  usesDamage: boolean;
  /** Set when an event uses `heal` (`Actions.heal` is then written, ADR 0055 D4). */
  usesHeal: boolean;
  /**
   * Set when a step block's event uses `run_function` (`Actions.runFunction` then takes the
   * entity to run as, ADR 0058 D1).
   */
  usesRunFunctionAsEntity: boolean;
  /**
   * Set when an ADR 0061 trigger's event uses `run_function` with a non-player actor (the
   * `Actions.runFunction` comment then names every actor).
   */
  usesRunFunctionAsTriggerActor: boolean;
  /** Set when a tick trigger is generated (`TickLimiter.java` is then written, ADR 0061 D4). */
  usesTickLimiter: boolean;
  /** Set when a block has `msm:on_entity_inside` (`CooldownMap.java` is then written). */
  usesCooldownMap: boolean;
  /** Set when an item uses `msm:components` (`VanillaComponents.java` is then written). */
  usesVanillaComponents: boolean;
  /** Set when an entity uses the `follow` goal. */
  usesFollowGoal: boolean;
}

/** The file path of a class in a sub-package (`''` for the mod package itself). */
export function classPath(
  context: GenerationContext,
  subPackage: string,
  simpleName: string,
): string {
  return subPackage === ''
    ? `${context.javaRoot}/${simpleName}.java`
    : `${context.javaRoot}/${subPackage.replaceAll('.', '/')}/${simpleName}.java`;
}

/** The fully qualified name of a sub-package. */
export function packageOf(context: GenerationContext, subPackage: string): string {
  return subPackage === ''
    ? context.input.javaPackage
    : `${context.input.javaPackage}.${subPackage}`;
}
