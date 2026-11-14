/**
 * The 26.3 Java generator of the `java-project` exporter (ADR 0033 D3, ADR 0034): writes the
 * Java sources of an ejected Fabric project that does what `msm_runtime` v1 does with the
 * same definitions, with no dependency on the runtime. The runtime's registrar, driver classes
 * and GeckoLib bridge (`engine-mod/src/main/java/dev/mcsupermods/runtime/`) are the reference
 * implementation; both compile against the 26.3 jar. Every Mojang, Fabric and GeckoLib name
 * here belongs to this target; the next target copies the folder and adjusts names.
 *
 * Output: `src/main/java/<package>/` with `<ModClass>.java`, `ModSounds.java` (when the
 * resource pack defines sound events, ADR 0057 D5), `ModEffects.java`, `ModPotions.java` (when
 * the project has potions, ADR 0063 D8),
 * `ModBlocks.java`, `ModItems.java`, `ModEntities.java`, `Actions.java`, `VanillaComponents.java`
 * (when an item uses `msm:components`), `effect/` (with `MobEffectBase.java`, ADR 0055 D10),
 * `block/`, `item/` (with `ThrowableItem.java` when an item has `msm:throwable`), `entity/`
 * (with `FollowTypesGoal.java` when a follow goal exists and `ThrownItemEntity.java` with
 * throwables, ADR 0056 D7), and `client/` with `<ModClass>Client.java` when the project has
 * entities or throwables, plus `client/entity/` GeckoLib models with entities. Additions to
 * vanilla content (ADR 0060 D9) add `ModWorldgen.java` (biome additions through Fabric's
 * `BiomeModifications`) and `ModLoot.java` (loot additions in a `LootTableEvents.MODIFY`
 * listener); the triggers of ADR 0061 add `TickLimiter.java` (tick triggers) and
 * `CooldownMap.java` (`msm:on_entity_inside`). Paths are sorted; text uses LF and four-space
 * indentation.
 *
 * @packageDocumentation
 */

import type { GeneratedFile, JavaProjectGenerator, JavaProjectInput } from '@msm/plugin-api';
import { generateBlocks } from './blocks';
import { generateClient } from './client';
import type { GenerationContext } from './context';
import { generateEffects } from './effects';
import { generateEntities } from './entities';
import { generateItems } from './items';
import { generateLoot } from './loot';
import { generateMod } from './mod';
import { NameTable, splitId } from './names';
import { generatePotions } from './potions';
import { generateSounds } from './sounds';
import { actionsJava } from './templates/actions-java';
import { cooldownMapJava } from './templates/cooldown-map-java';
import { followTypesGoalJava } from './templates/follow-types-goal-java';
import { throwableItemJava } from './templates/throwable-item-java';
import { thrownItemEntityJava } from './templates/thrown-item-entity-java';
import { tickLimiterJava } from './templates/tick-limiter-java';
import { vanillaComponentsJava } from './templates/vanilla-components-java';
import { generateWorldgen } from './worldgen';

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
    usesApplyEffect: false,
    usesLaunch: false,
    usesDamage: false,
    usesHeal: false,
    usesRunFunctionAsEntity: false,
    usesRunFunctionAsTriggerActor: false,
    usesRunFunctionAsOwnMob: false,
    usesTickLimiter: false,
    usesCooldownMap: false,
    usesVanillaComponents: false,
    usesFollowGoal: false,
  };
  const throwables = input.items.some((item) => {
    const components = item.definition.components;
    return (
      typeof components === 'object' &&
      components !== null &&
      !Array.isArray(components) &&
      Object.hasOwn(components, 'msm:throwable')
    );
  });
  const classNames = new NameTable();
  classNames.reserve(
    'entity.FollowTypesGoal',
    'client.entity.GeoModelBase',
    'effect.MobEffectBase',
  );
  if (throwables) classNames.reserve('item.ThrowableItem', 'entity.ThrownItemEntity');
  const registrations: string[] = [];
  // Sound events first (ADR 0057 D5): effects, items, events and entities name them.
  const sounds = generateSounds(context);
  if (sounds !== undefined) registrations.push(sounds);
  const effects = generateEffects(context, classNames);
  if (effects !== undefined) registrations.push(effects);
  // Potions after the effects they name and before blocks and items (ADR 0063 D4, D8).
  const potions = generatePotions(context);
  if (potions !== undefined) registrations.push(potions);
  if (throwables) {
    registrations.push('entity.ThrownItemEntity');
    context.files.push(
      {
        path: `${context.javaRoot}/item/ThrowableItem.java`,
        contents: throwableItemJava(input.javaPackage, input.modId),
      },
      {
        path: `${context.javaRoot}/entity/ThrownItemEntity.java`,
        contents: thrownItemEntityJava(input.javaPackage, input.modId, thrownItemPath(input)),
      },
    );
  }
  const blocks = generateBlocks(context, classNames);
  if (blocks !== undefined) registrations.push(blocks);
  const items = generateItems(context, classNames);
  if (items !== undefined) registrations.push(items);
  const entities = generateEntities(context, classNames);
  if (entities !== undefined) registrations.push(entities.className);
  // Additions to vanilla content last, as the runtime registers them (ADR 0060 D9).
  const worldgen = generateWorldgen(context);
  if (worldgen !== undefined) registrations.push(worldgen);
  const loot = generateLoot(context);
  if (loot !== undefined) registrations.push(loot);
  const main = generateMod(context, registrations);
  const client =
    entities === undefined && !throwables
      ? undefined
      : generateClient(context, entities?.entities ?? [], throwables);
  if (context.usesActions) {
    context.files.push({
      path: `${context.javaRoot}/Actions.java`,
      contents: actionsJava(
        input.javaPackage,
        input.modId,
        context.usesApplyEffect,
        context.usesLaunch,
        context.usesDamage,
        context.usesHeal,
        context.usesRunFunctionAsEntity,
        context.usesRunFunctionAsTriggerActor,
        context.usesRunFunctionAsOwnMob,
      ),
    });
  }
  if (context.usesVanillaComponents) {
    context.files.push({
      path: `${context.javaRoot}/VanillaComponents.java`,
      contents: vanillaComponentsJava(input.javaPackage, input.modId),
    });
  }
  if (context.usesTickLimiter) {
    context.files.push({
      path: `${context.javaRoot}/TickLimiter.java`,
      contents: tickLimiterJava(input.javaPackage, input.modId),
    });
  }
  if (context.usesCooldownMap) {
    context.files.push({
      path: `${context.javaRoot}/CooldownMap.java`,
      contents: cooldownMapJava(input.javaPackage),
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
 * The path of the thrown item entity type id in the mod's namespace: `thrown_item`, or
 * `thrown_item_<n>` when a project entity already has `<mod id>:thrown_item`.
 */
function thrownItemPath(input: JavaProjectInput): string {
  const taken = new Set(
    input.entities
      .map((entity) => splitId(entity.id))
      .filter((id) => id.namespace === input.modId)
      .map((id) => id.path),
  );
  let path = 'thrown_item';
  for (let n = 2; taken.has(path); n++) path = `thrown_item_${n}`;
  return path;
}

/**
 * The 26.3 `JavaProjectGenerator`. The entrypoints follow ADR 0033 D2:
 * `<package>.<ModClass>` always and `<package>.client.<ModClass>Client` when the project has
 * entities or throwables (the exporter adds the client entrypoint when that file is generated).
 */
export const javaProjectGenerator: JavaProjectGenerator = {
  generate(input) {
    return generateJavaProject(input).files;
  },
};
