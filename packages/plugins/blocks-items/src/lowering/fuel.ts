/**
 * Fuel and composting (ADR 0060 D4): the element-only `fuel` and `compost` fields of an
 * `msm:item` and of a block's `item`, lowered to the vanilla `minecraft:cooking_fuel` and
 * `minecraft:compostable` components inside `msm:components` (the editor-only pattern of
 * ADR 0059 D2). The compost chance's provider comes from `target.items.compostProviders`.
 */
import type { JsonObject, TargetFacts } from '@msm/plugin-api';
import { BlocksItemsLoweringError, isRecord } from './paths';

/** The element-only fields of an item or block item. */
export const FUEL_FIELD = 'fuel';
export const COMPOST_FIELD = 'compost';

/** The vanilla passthrough component container. */
export const PASSTHROUGH_COMPONENT = 'msm:components';
/** The vanilla component `fuel` lowers to. */
export const COOKING_FUEL_COMPONENT = 'minecraft:cooking_fuel';
/** The vanilla component `compost` lowers to. */
export const COMPOSTABLE_COMPONENT = 'minecraft:compostable';

/** Game ticks per second. */
const TICKS_PER_SECOND = 20;

/** `burn_seconds` in whole game ticks, at least 1. */
export const burnTicks = (seconds: number): number =>
  Math.max(1, Math.round(seconds * TICKS_PER_SECOND));

/**
 * The `context_int_provider` id of a compost chance on `target`, or `undefined` when the
 * target has no such provider.
 */
export function compostProvider(
  target: Pick<TargetFacts, 'items'>,
  chance: string,
): string | undefined {
  const providers = target.items?.compostProviders;
  return providers !== undefined && Object.hasOwn(providers, chance)
    ? providers[chance]
    : undefined;
}

/** Removes `id` and its unprefixed or `minecraft:`-prefixed spelling from `passthrough`. */
function deleteBothSpellings(passthrough: JsonObject, id: string): void {
  delete passthrough[id];
  delete passthrough[id.slice('minecraft:'.length)];
}

/**
 * Lowers `fuel` and `compost` of an item definition or a block item being built (mutated):
 * both fields are removed and, when present, written as `minecraft:cooking_fuel
 * { burn_time, speed_multiplier: 1 }` and `minecraft:compostable { layers }` into
 * `components["msm:components"]`. The friendly field wins over a passthrough entry for the
 * same component (the validators report the clash). Without either field the object is left
 * untouched, so existing definitions lower byte-identically.
 *
 * @param owner - The item definition, or the block definition's `item` object.
 * @param target - The target supplying the compost providers; without one, `compost` cannot be
 *   lowered.
 * @param elementId - For error messages.
 * @throws {@link BlocksItemsLoweringError} If `compost` names a chance the target has no
 *   provider for.
 */
export function lowerFuelAndCompostInPlace(
  owner: JsonObject,
  target: Pick<TargetFacts, 'id' | 'items'> | undefined,
  elementId: string,
): void {
  const fuel = owner[FUEL_FIELD];
  const compost = owner[COMPOST_FIELD];
  if (fuel === undefined && compost === undefined) return;
  delete owner[FUEL_FIELD];
  delete owner[COMPOST_FIELD];
  const seconds = isRecord(fuel) ? fuel.burn_seconds : undefined;
  const chance = typeof compost === 'string' ? compost : undefined;
  const provider =
    chance === undefined || target === undefined ? undefined : compostProvider(target, chance);
  if (chance !== undefined && provider === undefined) {
    throw new BlocksItemsLoweringError(
      `Element ${elementId}: ${target === undefined ? 'no target' : target.id} has no compost provider for "${chance}".`,
    );
  }
  if (typeof seconds !== 'number' && provider === undefined) return;
  const components = isRecord(owner.components) ? owner.components : {};
  owner.components = components;
  const passthrough = isRecord(components[PASSTHROUGH_COMPONENT])
    ? components[PASSTHROUGH_COMPONENT]
    : {};
  components[PASSTHROUGH_COMPONENT] = passthrough;
  if (typeof seconds === 'number') {
    deleteBothSpellings(passthrough, COOKING_FUEL_COMPONENT);
    // `speed_multiplier` is required by the vanilla component schema; 1 is vanilla's speed.
    passthrough[COOKING_FUEL_COMPONENT] = { burn_time: burnTicks(seconds), speed_multiplier: 1 };
  }
  if (provider !== undefined) {
    deleteBothSpellings(passthrough, COMPOSTABLE_COMPONENT);
    passthrough[COMPOSTABLE_COMPONENT] = { layers: provider };
  }
}
