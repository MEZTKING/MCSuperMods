/**
 * `blocks-items.*` project validators of the plant and food block types (ADR 0094 D2, D4, D11).
 * They read the element data (editor fields still present) and the vanilla ids of the registry
 * index:
 *
 * - `blocks-items.berry-unknown` (error): a `berry_bush` whose `berry` is neither a project item
 *   (an `msm:item` or a block's item) nor a vanilla item.
 * - `blocks-items.potted-plant-unknown` (error): a `potted_plant` whose `plant` is neither a
 *   project block nor a vanilla block.
 * - `blocks-items.potted-plant-not-plant` (warning): a `potted_plant` whose `plant` is a project
 *   block that is not a `sapling`, a `berry_bush` or a `block` drawn as a cross (shape preset
 *   `cross`, or a project model on vanilla's `cross` or `tinted_cross`), a project `tall_plant`
 *   (tall plants cannot be potted, as in vanilla), or a vanilla plant that vanilla already pots
 *   (`minecraft:potted_<path>` exists): the game keeps one potted block per plant, so the project
 *   pot would replace vanilla's.
 * - `blocks-items.light-fixed-by-state` (warning): `msm:light_emitter` on a `candle` or
 *   `sea_pickle`, whose light comes from the state (3 per lit candle; 6 to 15 by count in water)
 *   and is not changed by the component (ADR 0094 D4).
 */
import type {
  Element,
  Json,
  JsonObject,
  Problem,
  ProjectValidator,
  ValidationRegistry,
} from '@msm/plugin-api';
import { BLOCK_KIND, ITEM_KIND } from './kinds';
import { blockItemId } from './lowering/block-item';
import { isRecord } from './lowering/paths';

/** Every code these validators report. */
export const PLANT2_PROBLEM_CODES: readonly string[] = Object.freeze([
  'blocks-items.berry-unknown',
  'blocks-items.potted-plant-unknown',
  'blocks-items.potted-plant-not-plant',
  'blocks-items.light-fixed-by-state',
]);

/** The project block types a pot takes, besides a `block` drawn as a cross. */
export const POTTABLE_TYPES: readonly string[] = Object.freeze(['sapling', 'berry_bush']);

/** The types whose light the state fixes (ADR 0094 D4). */
export const LIGHT_BY_STATE_TYPES: readonly string[] = Object.freeze(['candle', 'sea_pickle']);

/** The light each of {@link LIGHT_BY_STATE_TYPES} gives, for the message. */
const LIGHT_BY_STATE: Readonly<Record<string, string>> = {
  candle: '3 per lit candle',
  sea_pickle: '6 to 15 by the number of pickles in water, none when dry',
};

const LIGHT_EMITTER = 'msm:light_emitter';
const MODEL_KIND = 'minecraft:model';
const CROSS_PARENTS: readonly string[] = Object.freeze([
  'minecraft:block/cross',
  'minecraft:block/tinted_cross',
]);

const dataOf = (element: Element): JsonObject => (isRecord(element.data) ? element.data : {});
const text = (value: Json | undefined): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;
const namespaced = (id: string): string => (id.includes(':') ? id : `minecraft:${id}`);
const typeOf = (data: JsonObject): string => text(data.type) ?? 'block';

const blocksOfType = (elements: readonly Element[], type: string) =>
  elements
    .filter((element) => element.kind === BLOCK_KIND && typeOf(dataOf(element)) === type)
    .map((element) => ({ element, data: dataOf(element) }));

/** The project item ids: `msm:item` elements and the items of `msm:block` elements. */
function projectItems(elements: readonly Element[]): Set<string> {
  const ids = new Set<string>();
  for (const element of elements) {
    if (element.kind === ITEM_KIND) ids.add(element.id);
    if (element.kind === BLOCK_KIND) {
      const itemId = blockItemId(element);
      if (itemId !== undefined) ids.add(namespaced(itemId));
    }
  }
  return ids;
}

function unknownBerries(elements: readonly Element[], registry: ValidationRegistry): Problem[] {
  const bushes = blocksOfType(elements, 'berry_bush');
  if (bushes.length === 0) return [];
  const project = projectItems(elements);
  const vanillaKnown = registry.ids('item').length > 0;
  const problems: Problem[] = [];
  for (const { element, data } of bushes) {
    const berry = text(data.berry);
    if (berry === undefined) continue;
    const id = namespaced(berry);
    if (project.has(id) || !vanillaKnown || registry.has('item', id)) continue;
    problems.push({
      severity: 'error',
      code: 'blocks-items.berry-unknown',
      elementId: element.id,
      path: '/berry',
      message: `Berry "${berry}" is neither an item of this project nor a vanilla item, so harvesting the bush would drop nothing. Pick an item, or give the bush its own block item and use that id.`,
    });
  }
  return problems;
}

/** Whether a `block` element is drawn as a cross: shape preset `cross` or a project cross model. */
function isCrossBlock(data: JsonObject, models: ReadonlyMap<string, JsonObject>): boolean {
  const components = isRecord(data.components) ? data.components : undefined;
  const shape = isRecord(components?.['msm:shape']) ? components['msm:shape'] : undefined;
  if (shape?.preset === 'cross') return true;
  const model = text(data.model);
  const parent = model === undefined ? undefined : text(models.get(namespaced(model))?.parent);
  return parent !== undefined && CROSS_PARENTS.includes(namespaced(parent));
}

function pottedPlantProblems(
  elements: readonly Element[],
  registry: ValidationRegistry,
): Problem[] {
  const pots = blocksOfType(elements, 'potted_plant');
  if (pots.length === 0) return [];
  const blocks = new Map<string, JsonObject>();
  const models = new Map<string, JsonObject>();
  for (const element of elements) {
    if (element.kind === BLOCK_KIND) blocks.set(element.id, dataOf(element));
    if (element.kind === MODEL_KIND) models.set(element.id, dataOf(element));
  }
  const vanillaKnown = registry.ids('block').length > 0;
  const problems: Problem[] = [];
  for (const { element, data } of pots) {
    const plant = text(data.plant);
    if (plant === undefined) continue;
    const id = namespaced(plant);
    const warn = (reason: string): void => {
      problems.push({
        severity: 'warning',
        code: 'blocks-items.potted-plant-not-plant',
        elementId: element.id,
        path: '/plant',
        message: reason,
      });
    };
    const project = blocks.get(id);
    if (project !== undefined) {
      const type = typeOf(project);
      if (type === 'tall_plant') {
        warn(
          `"${plant}" is a tall plant, and tall plants cannot be potted (as in vanilla). Pot a sapling, a berry bush or a cross-shaped plant instead.`,
        );
      } else if (
        !POTTABLE_TYPES.includes(type) &&
        !(type === 'block' && isCrossBlock(project, models))
      ) {
        warn(
          `"${plant}" is a ${type === 'block' ? 'block that is not drawn as a cross' : `${type} block`}, not a plant, so the pot may look and behave oddly. Pot a sapling, a berry bush or a block with the cross shape.`,
        );
      }
      continue;
    }
    if (!vanillaKnown) continue;
    if (!registry.has('block', id)) {
      problems.push({
        severity: 'error',
        code: 'blocks-items.potted-plant-unknown',
        elementId: element.id,
        path: '/plant',
        message: `Plant "${plant}" is neither a block of this project nor a vanilla block, so nothing can go in the pot. Pick a plant block.`,
      });
      continue;
    }
    const colon = id.indexOf(':');
    const vanillaPot = `${id.slice(0, colon)}:potted_${id.slice(colon + 1)}`;
    if (registry.has('block', vanillaPot)) {
      warn(
        `Vanilla already pots "${plant}" as "${vanillaPot}", and the game keeps one potted block per plant, so this pot would replace vanilla's. Pot a plant vanilla does not pot, or one of your own.`,
      );
    }
  }
  return problems;
}

function lightFixedByState(elements: readonly Element[]): Problem[] {
  const problems: Problem[] = [];
  for (const type of LIGHT_BY_STATE_TYPES) {
    for (const { element, data } of blocksOfType(elements, type)) {
      const components = isRecord(data.components) ? data.components : undefined;
      if (components?.[LIGHT_EMITTER] === undefined) continue;
      problems.push({
        severity: 'warning',
        code: 'blocks-items.light-fixed-by-state',
        elementId: element.id,
        path: `/components/${LIGHT_EMITTER}`,
        message: `A ${type.replace('_', ' ')} gives light by its state (${LIGHT_BY_STATE[type]}), so "${LIGHT_EMITTER}" changes nothing. Remove the component.`,
      });
    }
  }
  return problems;
}

/** The validators of the plant and food types. */
export const plants2Validators: readonly ProjectValidator[] = Object.freeze([
  {
    id: 'msm.blocks-items.plants-2',
    kinds: [BLOCK_KIND, ITEM_KIND, MODEL_KIND],
    validate: ({ elements, registry }) => [
      ...unknownBerries(elements, registry),
      ...pottedPlantProblems(elements, registry),
      ...lightFixedByState(elements),
    ],
  },
] satisfies ProjectValidator[]);
