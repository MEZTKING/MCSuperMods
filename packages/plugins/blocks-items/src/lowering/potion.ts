/**
 * Lowering of `msm:potion` (ADR 0063 D2, D3): up to three runtime definitions (the potion and
 * its `long_` and `strong_` versions), the `minecraft:brewing` recipes in vanilla's shape and
 * the four potion name keys. Tipped arrows need no file: vanilla's `crafting_imbue` recipe
 * takes any lingering potion.
 *
 * Recipe files live under `data/<ns>/recipe/brewing/` and are named after the step:
 *
 * - `<bottle>_<path>`: the base potion in that bottle plus the ingredient (`brewing`);
 * - `<bottle>_long_<path>`, `<bottle>_strong_<path>`: the potion in that bottle plus the
 *   longer or stronger ingredient;
 * - `potion_<entry>_to_splash_potion` (gunpowder) and `<from>_<entry>_to_lingering_potion`
 *   (dragon's breath, from the splash version, or from the drinkable one when `splash` is
 *   false), once per registry entry.
 *
 * With every option on that is 3 + 3 + 3 + 3 + 3 = 15 files.
 */
import type { Element, JsonObject, OutputFile, Target } from '@msm/plugin-api';
import { MSM_SCHEMA_REFS } from '@msm/schemas';
import { DEFINITION_FORMAT } from './block';
import {
  assetPath,
  BlocksItemsLoweringError,
  dataPath,
  definitionPath,
  isRecord,
  splitResourceLocation,
} from './paths';
import { DISPLAY_NAME_LANGUAGE, LANG_SCHEMA, nonEmptyString } from './shared';

/** Element-only fields of `msm:potion`, stripped from every definition. */
export const POTION_EDITOR_FIELDS = [
  'display_name',
  'brewing',
  'long',
  'strong',
  'splash',
  'lingering',
] as const;

/** Schema reference of recipes. */
export const RECIPE_SCHEMA = 'resource:recipe';

/** The base potion a brewing ingredient is added to when `brewing.base` is absent. */
export const DEFAULT_BREWING_BASE = 'minecraft:awkward';
/** The ingredient of the longer version when `long.reagent` is absent. */
export const DEFAULT_LONG_REAGENT = 'minecraft:redstone';
/** The ingredient of the stronger version when `strong.reagent` is absent. */
export const DEFAULT_STRONG_REAGENT = 'minecraft:glowstone_dust';
/** The ingredient that turns a potion into its splash version. */
export const SPLASH_REAGENT = 'minecraft:gunpowder';
/** The ingredient that turns a potion into its lingering version. */
export const LINGERING_REAGENT = 'minecraft:dragon_breath';

/** The potion bottle items, by the part of their id after `minecraft:`. */
export type PotionBottle = 'potion' | 'splash_potion' | 'lingering_potion';

/** The id prefixes of the longer and stronger versions (ADR 0063 D3). */
export const POTION_VARIANT_PREFIXES = { long: 'long_', strong: 'strong_' } as const;

/** One `minecraft:brewing` step: `input` potion in `bottle` plus `reagent` gives `output`. */
export interface BrewingStep {
  /** The recipe file name below `brewing/`, without `.json`. */
  file: string;
  /** Which option makes the step: `brewing`, `long`, `strong`, `splash` or `lingering`. */
  source: 'brewing' | 'long' | 'strong' | 'splash' | 'lingering';
  inputBottle: PotionBottle;
  input: string;
  reagent: string;
  outputBottle: PotionBottle;
  output: string;
}

function potionData(element: Element): JsonObject {
  if (!isRecord(element.data)) {
    throw new BlocksItemsLoweringError(`Element ${element.id}: potion data must be an object.`);
  }
  return element.data;
}

const reagentOf = (value: unknown, fallback: string): string => nonEmptyString(value) ?? fallback;

const flag = (value: unknown): boolean => value !== false;

/**
 * The potion's name, which the game puts after `item.minecraft.<bottle>.effect.` for the item
 * name: the data's `name`, or `<ns>.<path>` with every `/` written as `.`. The longer and
 * stronger versions share it, so they get the same item names.
 */
export function potionName(element: Element): string {
  const { namespace, path } = splitResourceLocation(element.id);
  return nonEmptyString(potionData(element).name) ?? `${namespace}.${path.replaceAll('/', '.')}`;
}

/**
 * The ids of the registry entries a potion lowers to, in order: its own id, then
 * `<ns>:long_<path>` when `long` is set and `<ns>:strong_<path>` when `strong` is set.
 */
export function potionVariantIds(element: Element): string[] {
  const { namespace, path } = splitResourceLocation(element.id);
  const data = potionData(element);
  const ids = [element.id as string];
  if (isRecord(data.long)) ids.push(`${namespace}:${POTION_VARIANT_PREFIXES.long}${path}`);
  if (isRecord(data.strong)) ids.push(`${namespace}:${POTION_VARIANT_PREFIXES.strong}${path}`);
  return ids;
}

/** The effects with `duration_ticks` (and `amplifier`, when given) replaced. */
function adjustedEffects(effects: unknown, duration: unknown, amplifier?: unknown): unknown {
  if (!Array.isArray(effects)) return effects;
  return effects.map((effect) => {
    if (!isRecord(effect)) return effect;
    const copy: JsonObject = { ...effect };
    if (typeof duration === 'number') copy.duration_ticks = duration;
    if (typeof amplifier === 'number') copy.amplifier = amplifier;
    return copy;
  });
}

/**
 * The runtime definitions of a potion, keyed by registry id: the element data without the
 * editor fields, `format` set and `name` written out; the longer version with every effect's
 * `duration_ticks` from `long`, the stronger one with every effect's `amplifier` and
 * `duration_ticks` from `strong`.
 *
 * @throws {@link BlocksItemsLoweringError} If the id is unsafe or the data is not an object.
 */
export function potionDefinitions(element: Element): { id: string; definition: JsonObject }[] {
  const data = potionData(element);
  const base = structuredClone(data);
  for (const field of POTION_EDITOR_FIELDS) delete base[field];
  base.format = DEFINITION_FORMAT;
  base.name = potionName(element);
  const [ownId, ...variantIds] = potionVariantIds(element);
  const result = [{ id: ownId as string, definition: base }];
  const { namespace, path } = splitResourceLocation(element.id);
  for (const id of variantIds) {
    const long = id === `${namespace}:${POTION_VARIANT_PREFIXES.long}${path}`;
    const options = (long ? data.long : data.strong) as JsonObject;
    const definition = structuredClone(base);
    definition.effects = adjustedEffects(
      base.effects,
      options.duration_ticks,
      long ? undefined : options.amplifier,
    ) as JsonObject['effects'];
    result.push({ id, definition });
  }
  return result;
}

/**
 * The brewing steps of a potion (see the module comment for the file names). Bottles: the
 * drinkable potion always, the splash version unless `splash` is false, the lingering one unless
 * `lingering` is false.
 */
export function potionBrewingSteps(element: Element): BrewingStep[] {
  const data = potionData(element);
  const { namespace, path } = splitResourceLocation(element.id);
  const splash = flag(data.splash);
  const lingering = flag(data.lingering);
  const bottles: PotionBottle[] = ['potion'];
  if (splash) bottles.push('splash_potion');
  if (lingering) bottles.push('lingering_potion');
  const own = element.id as string;
  const steps: BrewingStep[] = [];
  const brewing = isRecord(data.brewing) ? data.brewing : undefined;
  const reagent = nonEmptyString(brewing?.reagent);
  if (reagent !== undefined) {
    const base = reagentOf(brewing?.base, DEFAULT_BREWING_BASE);
    for (const bottle of bottles) {
      steps.push({
        file: `${bottle}_${path}`,
        source: 'brewing',
        inputBottle: bottle,
        input: base,
        reagent,
        outputBottle: bottle,
        output: own,
      });
    }
  }
  const upgrades = [
    ['long', DEFAULT_LONG_REAGENT],
    ['strong', DEFAULT_STRONG_REAGENT],
  ] as const;
  for (const [variant, fallback] of upgrades) {
    const options = data[variant];
    if (!isRecord(options)) continue;
    const prefix = POTION_VARIANT_PREFIXES[variant];
    for (const bottle of bottles) {
      steps.push({
        file: `${bottle}_${prefix}${path}`,
        source: variant,
        inputBottle: bottle,
        input: own,
        reagent: reagentOf(options.reagent, fallback),
        outputBottle: bottle,
        output: `${namespace}:${prefix}${path}`,
      });
    }
  }
  for (const id of potionVariantIds(element)) {
    const entry = id.slice(namespace.length + 1);
    if (splash) {
      steps.push({
        file: `potion_${entry}_to_splash_potion`,
        source: 'splash',
        inputBottle: 'potion',
        input: id,
        reagent: SPLASH_REAGENT,
        outputBottle: 'splash_potion',
        output: id,
      });
    }
    if (lingering) {
      const from: PotionBottle = splash ? 'splash_potion' : 'potion';
      steps.push({
        file: `${from}_${entry}_to_lingering_potion`,
        source: 'lingering',
        inputBottle: from,
        input: id,
        reagent: LINGERING_REAGENT,
        outputBottle: 'lingering_potion',
        output: id,
      });
    }
  }
  return steps;
}

/** A `minecraft:brewing` recipe in vanilla's shape. */
export function brewingRecipe(step: BrewingStep): JsonObject {
  return {
    type: 'minecraft:brewing',
    input: { item: `minecraft:${step.inputBottle}`, potion_contents: { potions: step.input } },
    reagent: { item: step.reagent },
    output: {
      id: `minecraft:${step.outputBottle}`,
      components: { 'minecraft:potion_contents': { potion: step.output } },
    },
  };
}

/** The four name keys of a potion, from its display name. */
export function potionNameKeys(name: string, displayName: string): JsonObject {
  return {
    [`item.minecraft.potion.effect.${name}`]: `Potion of ${displayName}`,
    [`item.minecraft.splash_potion.effect.${name}`]: `Splash Potion of ${displayName}`,
    [`item.minecraft.lingering_potion.effect.${name}`]: `Lingering Potion of ${displayName}`,
    [`item.minecraft.tipped_arrow.effect.${name}`]: `Arrow of ${displayName}`,
  };
}

/**
 * Lowers an `msm:potion` element: the runtime definitions `msm/<ns>/potion/<path>.json`,
 * `long_<path>` and `strong_<path>` (layer `msm`, schema `msm:potion_definition`), the brewing
 * recipes under `data/<ns>/recipe/brewing/` (layer `datapack`, schema `resource:recipe`) and,
 * with `display_name`, the four name keys of `en_us` (`merge: 'object'`).
 *
 * @param element - The element.
 * @param target - The target supplying the vanilla folder names.
 * @returns The output files.
 * @throws {@link BlocksItemsLoweringError} If the id is unsafe or the data is not an object.
 */
export function lowerPotion(element: Element, target: Target): OutputFile[] {
  const { namespace } = splitResourceLocation(element.id);
  const data = potionData(element);
  const files: OutputFile[] = potionDefinitions(element).map(({ id, definition }) => ({
    path: definitionPath('potion', namespace, id.slice(namespace.length + 1)),
    contents: definition,
    layer: 'msm',
    schema: MSM_SCHEMA_REFS.potionDefinition,
  }));
  for (const step of potionBrewingSteps(element)) {
    files.push({
      path: dataPath(target, 'recipe', namespace, `brewing/${step.file}`),
      contents: brewingRecipe(step),
      layer: 'datapack',
      schema: RECIPE_SCHEMA,
    });
  }
  const displayName = nonEmptyString(data.display_name);
  if (displayName !== undefined) {
    files.push({
      path: assetPath(target, 'lang', namespace, DISPLAY_NAME_LANGUAGE),
      contents: potionNameKeys(potionName(element), displayName),
      layer: 'resourcepack',
      schema: LANG_SCHEMA,
      merge: 'object',
    });
  }
  return files;
}
