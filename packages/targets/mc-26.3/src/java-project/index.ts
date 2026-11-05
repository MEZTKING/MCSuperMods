/**
 * The 26.3 Java generator of the `java-project` exporter (ADR 0033 D3, ADR 0034): writes the
 * Java sources of an ejected Fabric project that does what `msm_runtime` v1 does with the
 * same definitions, with no dependency on the runtime. The runtime's registrar, driver classes
 * and GeckoLib bridge (`engine-mod/src/main/java/dev/mcsupermods/runtime/`) are the reference
 * implementation; both compile against the 26.3 jar. Every Mojang, Fabric and GeckoLib name
 * here belongs to this target; the next target copies the folder and adjusts names.
 *
 * Output: `src/main/java/<package>/` with `<ModClass>.java`, `ModBlocks.java`,
 * `ModItems.java`, `ModEntities.java`, `Actions.java`, `block/`, `item/`, `entity/` (with
 * `FollowTypesGoal.java` when a follow goal exists), and `client/` with
 * `<ModClass>Client.java` and `client/entity/` models when the project has entities. Paths
 * are sorted; text uses LF and four-space indentation.
 *
 * @packageDocumentation
 */

import type { GeneratedFile, JavaProjectGenerator, JavaProjectInput } from '@msm/plugin-api';
import { generateBlocks } from './blocks';
import { generateClient } from './client';
import type { GenerationContext } from './context';
import { generateEntities } from './entities';
import { generateItems } from './items';
import { generateMod } from './mod';
import { NameTable } from './names';
import { actionsJava } from './templates/actions-java';
import { followTypesGoalJava } from './templates/follow-types-goal-java';

export { className, constantName, eventMethodName, JAVA_KEYWORDS } from './names';

/** The entrypoint classes of a generated project, for `fabric.mod.json`. */
export interface JavaEntrypoints {
  main: string;
  client: string | undefined;
}

/**
 * Generates the Java sources, returning the files and the entrypoints. Throws an `Error`
 * naming the definition when one cannot be generated (an unknown component, action or goal,
 * an undeclared event).
 */
export function generateJavaProject(input: JavaProjectInput): {
  files: GeneratedFile[];
  entrypoints: JavaEntrypoints;
} {
  const context: GenerationContext = {
    input,
    javaRoot: `src/main/java/${input.javaPackage.replaceAll('.', '/')}`,
    files: [],
    usesActions: false,
    usesFollowGoal: false,
  };
  const classNames = new NameTable();
  classNames.reserve('entity.FollowTypesGoal', 'client.entity.GeoModelBase');
  const registrations: string[] = [];
  const blocks = generateBlocks(context, classNames);
  if (blocks !== undefined) registrations.push(blocks);
  const items = generateItems(context, classNames);
  if (items !== undefined) registrations.push(items);
  const entities = generateEntities(context, classNames);
  if (entities !== undefined) registrations.push(entities.className);
  const main = generateMod(context, registrations);
  const client = entities === undefined ? undefined : generateClient(context, entities.entities);
  if (context.usesActions) {
    context.files.push({
      path: `${context.javaRoot}/Actions.java`,
      contents: actionsJava(input.javaPackage, input.modId),
    });
  }
  if (context.usesFollowGoal) {
    context.files.push({
      path: `${context.javaRoot}/entity/FollowTypesGoal.java`,
      contents: followTypesGoalJava(`${input.javaPackage}.entity`),
    });
  }
  const files = [...context.files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { files, entrypoints: { main, client } };
}

/**
 * The 26.3 `JavaProjectGenerator`. The entrypoints follow ADR 0033 D2:
 * `<package>.<ModClass>` always and `<package>.client.<ModClass>Client` when the project has
 * entities (the exporter adds the client entrypoint when that file is generated).
 */
export const javaProjectGenerator: JavaProjectGenerator = {
  generate(input) {
    return generateJavaProject(input).files;
  },
};
