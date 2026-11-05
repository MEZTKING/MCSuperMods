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
