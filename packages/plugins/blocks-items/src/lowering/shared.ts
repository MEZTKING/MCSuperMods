/**
 * Output files shared by block and item lowering: language keys and item model definitions.
 */
import type { JsonObject, OutputFile, Target } from '@msm/plugin-api';
import { assetPath } from './paths';

/** The language file display names are written to. */
export const DISPLAY_NAME_LANGUAGE = 'en_us';

/** Schema of vanilla language files. */
export const LANG_SCHEMA = '::java::assets::lang::Lang';
/** Schema of vanilla block state definitions. */
export const BLOCK_STATE_SCHEMA = '::java::assets::block_state_definition::BlockStateDefinition';
/** Schema of vanilla item model definitions. */
export const ITEM_DEFINITION_SCHEMA = '::java::assets::item_definition::ItemDefinition';
/** Schema reference of block tags. */
export const BLOCK_TAG_SCHEMA = 'tag:block';
/** Schema reference of item tags. */
export const ITEM_TAG_SCHEMA = 'tag:item';
/** Schema reference of loot tables. */
export const LOOT_TABLE_SCHEMA = 'resource:loot_table';
/** Schema of vanilla block and item models. */
export const MODEL_SCHEMA = '::java::assets::model::Model';

/**
 * One key of `assets/<namespace>/lang/en_us.json`, declared `merge: 'object'` so every
 * element's display name lands in the same file (ADR 0027).
 */
export function langFile(target: Target, namespace: string, key: string, name: string): OutputFile {
  const contents: JsonObject = { [key]: name };
  return {
    path: assetPath(target, 'lang', namespace, DISPLAY_NAME_LANGUAGE),
    contents,
    layer: 'resourcepack',
    schema: LANG_SCHEMA,
    merge: 'object',
  };
}

/**
 * A tag file `data/minecraft/tags/<registry>/<tag>.json` holding `id`, declared `merge: 'tag'`
 * so every element's entry lands in the same file.
 *
 * @param registry - `block` or `item`.
 * @param tag - The tag path under `minecraft:`, such as `mineable/pickaxe` or `slabs`.
 */
export function vanillaTagFile(
  target: Target,
  registry: 'block' | 'item',
  tag: string,
  id: string,
): OutputFile {
  return {
    path: `data/minecraft/${target.folders.data.tags}/${registry}/${tag}.json`,
    contents: { values: [id] },
    layer: 'datapack',
    schema: registry === 'block' ? BLOCK_TAG_SCHEMA : ITEM_TAG_SCHEMA,
    merge: 'tag',
  };
}

/** The item model definition `assets/<namespace>/items/<path>.json` showing `model`. */
export function itemDefinitionFile(
  target: Target,
  namespace: string,
  path: string,
  model: string,
): OutputFile {
  return {
    path: assetPath(target, 'item_definition', namespace, path),
    contents: { model: { type: 'minecraft:model', model } },
    layer: 'resourcepack',
    schema: ITEM_DEFINITION_SCHEMA,
  };
}

/** A bow or crossbow and how fast it draws, for {@link rangedItemDefinitionFile}. */
export interface RangedPull {
  type: 'bow' | 'crossbow';
  /** `msm:ranged_weapon` `draw_speed` (1 is vanilla). */
  drawSpeed: number;
}

/** Rounds to 4 decimals so the lowered JSON stays short and stable. */
const round4 = (value: number): number => Math.round(value * 10_000) / 10_000;

/**
 * The item model definition of a bow or crossbow that shows the pull like vanilla's, from
 * `target.items.rangedPull`, with the models `<model>_pulling_0`…`_2` (and for a crossbow
 * `<model>_arrow` and `<model>_firework`). The draw speed scales the bow's use-duration scale
 * and divides the crossbow's pull thresholds, so the animation keeps pace with the runtime.
 * Without the facts this is {@link itemDefinitionFile}.
 */
export function rangedItemDefinitionFile(
  target: Target,
  namespace: string,
  path: string,
  model: string,
  pull: RangedPull,
): OutputFile {
  const facts = target.items?.rangedPull;
  if (facts === undefined) return itemDefinitionFile(target, namespace, path, model);
  const plain = (id: string) => ({ type: 'minecraft:model', model: id });
  const speed = pull.drawSpeed > 0 ? pull.drawSpeed : 1;
  const pulling =
    pull.type === 'bow'
      ? {
          type: 'minecraft:range_dispatch',
          property: facts.bow.useDuration,
          scale: round4(facts.bow.scale * speed),
          entries: facts.bow.thresholds.map((threshold, index) => ({
            threshold,
            model: plain(`${model}_pulling_${index + 1}`),
          })),
          fallback: plain(`${model}_pulling_0`),
        }
      : {
          type: 'minecraft:range_dispatch',
          property: facts.crossbow.pull,
          entries: facts.crossbow.thresholds.map((threshold, index) => ({
            threshold: round4(threshold / speed),
            model: plain(`${model}_pulling_${index + 1}`),
          })),
          fallback: plain(`${model}_pulling_0`),
        };
  const drawn = {
    type: 'minecraft:condition',
    property: facts.usingItem,
    on_false: plain(model),
    on_true: pulling,
  };
  return {
    path: assetPath(target, 'item_definition', namespace, path),
    contents: {
      model:
        pull.type === 'bow'
          ? drawn
          : {
              type: 'minecraft:select',
              property: facts.crossbow.chargeType,
              cases: [
                { when: facts.crossbow.arrow, model: plain(`${model}_arrow`) },
                { when: facts.crossbow.rocket, model: plain(`${model}_firework`) },
              ],
              fallback: drawn,
            },
    },
    layer: 'resourcepack',
    schema: ITEM_DEFINITION_SCHEMA,
  };
}

/** The models a bow or crossbow item definition names besides its own model. */
export function rangedPullModels(model: string, type: 'bow' | 'crossbow'): string[] {
  const pulling = [0, 1, 2].map((index) => `${model}_pulling_${index}`);
  return type === 'bow' ? pulling : [...pulling, `${model}_arrow`, `${model}_firework`];
}

/** A non-empty string, or `undefined`. */
export const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;
