/**
 * `blocks-items.*` project validators of boats (ADR 0110 D1) and of fluid cauldrons (ADR 0108
 * D2, D3). They read the element data (editor fields still present), the target's facts and the
 * registry ids:
 *
 * - `blocks-items.boat-chest-clash` (error): a boat's chest companion `<ns>:<wood>_chest_boat`
 *   (`boatChestId`) is the id of a project element or of another boat's chest boat, so the game
 *   would register two items under one id.
 * - `blocks-items.boat-planks-missing` (warning): the boat's recipe needs the planks
 *   `<ns>:<wood>_planks` (`boatPlanksId`, as the Wood set names them), and neither the project
 *   nor the registry has that item, so the recipe cannot be crafted. Skipped when the registry
 *   has no item ids.
 * - `blocks-items.boat-texture-missing` (warning): the boat (or, with `chest`, the chest boat)
 *   has no picture in `boat_textures` and none at its fixed path (`boatTextureId`, a project or
 *   vanilla texture of the registry), so the game draws it with the missing-texture pattern.
 *   Skipped when the registry has no texture ids.
 * - `blocks-items.boat-fields-unused` (warning): `boat_textures` or `chest_boat_display_name` on
 *   an item without `msm:boat`, or the chest boat's picture or name without `chest`; lowering
 *   leaves them out.
 * - `blocks-items.cauldron-id-clash` (error): a fluid's cauldron `<ns>:<path>_cauldron`
 *   (`fluidCauldronId`) is one of vanilla's cauldron ids (`BlockFacts.cauldrons`), the id of a
 *   project element or another fluid's cauldron.
 * - `blocks-items.cauldron-levels-ignored` (warning): `cauldron.levels` on a lava-like fluid; its
 *   cauldron is always full only, as vanilla's lava cauldron (ADR 0108 amendment).
 *
 * They also report codes of the other validators, with the same meaning:
 *
 * - `blocks-items.component-conflict` (error): an item with `msm:boat` and one of
 *   {@link BOAT_CONFLICT_COMPONENTS}: each owns the item's use, and a boat item's use places the
 *   boat.
 * - `blocks-items.max-stack-size` (error): a boat whose `max_stack_size` is above 1; vanilla's
 *   boats stack to 1, and lowering forces it.
 */
import type {
  Element,
  JsonObject,
  Problem,
  ProjectValidator,
  ValidationRegistry,
} from '@msm/plugin-api';
import { BLOCK_KIND, ITEM_KIND } from './kinds';
import { FLUID_KIND } from './kinds/fluid';
import { BOAT_COMPONENT, boatChestId, boatOf, boatPlanksId, boatTextureId } from './lowering/boat';
import { fluidCauldronId } from './lowering/cauldron';
import { fluidBehaviourOf } from './lowering/fluid';
import { isRecord } from './lowering/paths';
import { nonEmptyString } from './lowering/shared';

/** Every code these validators report besides the shared ones. */
export const BOAT_PROBLEM_CODES: readonly string[] = Object.freeze([
  'blocks-items.boat-chest-clash',
  'blocks-items.boat-planks-missing',
  'blocks-items.boat-texture-missing',
  'blocks-items.boat-fields-unused',
  'blocks-items.cauldron-id-clash',
  'blocks-items.cauldron-levels-ignored',
]);

/** The components a boat item cannot be combined with (each owns the item's use). */
export const BOAT_CONFLICT_COMPONENTS: readonly string[] = Object.freeze([
  'msm:tool',
  'msm:ranged_weapon',
  'msm:armor',
  'msm:shield',
  'msm:throwable',
  'msm:food',
  'msm:consumable',
  'msm:item_inventory',
  'msm:bundle',
]);

const dataOf = (element: Element): JsonObject => (isRecord(element.data) ? element.data : {});

const safe = <T>(make: () => T): T | undefined => {
  try {
    return make();
  } catch {
    return undefined;
  }
};

const token = (key: string): string => key.replaceAll('~', '~0').replaceAll('/', '~1');

function boatProblems(elements: readonly Element[], registry: ValidationRegistry): Problem[] {
  const ids = new Set(elements.map((element) => element.id as string));
  const checkItems = registry.ids('item').length > 0;
  const checkTextures = registry.ids('texture').length > 0;
  const chests = new Map<string, string>();
  const problems: Problem[] = [];
  for (const element of elements) {
    if (element.kind !== ITEM_KIND) continue;
    const data = dataOf(element);
    const boat = boatOf(data);
    const textures = isRecord(data.boat_textures) ? data.boat_textures : undefined;
    if (boat === undefined) {
      for (const field of ['boat_textures', 'chest_boat_display_name'] as const) {
        if (data[field] === undefined) continue;
        problems.push({
          severity: 'warning',
          code: 'blocks-items.boat-fields-unused',
          elementId: element.id,
          path: `/${field}`,
          message:
            'This item is not a boat, so its boat pictures and chest boat name are left out. Make it a boat or remove them.',
        });
      }
      continue;
    }
    const chest = boat.chest === true;
    if (!chest) {
      const unused: [string, unknown][] = [
        ['/boat_textures/chest_boat', textures?.chest_boat],
        ['/boat_textures/chest_boat_item', textures?.chest_boat_item],
        ['/chest_boat_display_name', data.chest_boat_display_name],
      ];
      for (const [path, value] of unused) {
        if (value === undefined) continue;
        problems.push({
          severity: 'warning',
          code: 'blocks-items.boat-fields-unused',
          elementId: element.id,
          path,
          message:
            'This boat has no chest boat, so the chest boat picture and name are left out. Give it a chest boat or remove them.',
        });
      }
    }
    const components = isRecord(data.components) ? data.components : {};
    for (const other of BOAT_CONFLICT_COMPONENTS) {
      if (components[other] === undefined) continue;
      problems.push({
        severity: 'error',
        code: 'blocks-items.component-conflict',
        elementId: element.id,
        path: `/components/${token(other)}`,
        message: `A boat cannot also have "${other}": using a boat item places the boat. Remove one of them.`,
      });
    }
    if (typeof data.max_stack_size === 'number' && data.max_stack_size > 1) {
      problems.push({
        severity: 'error',
        code: 'blocks-items.max-stack-size',
        elementId: element.id,
        path: '/max_stack_size',
        message: `Boats stack to 1, as vanilla's do, so a stack size of ${data.max_stack_size} is never used. Set it to 1 or remove it.`,
      });
    }
    if (chest) {
      const chestId = safe(() => boatChestId(element.id, data));
      if (chestId !== undefined) {
        const other = chests.get(chestId);
        if (ids.has(chestId) || other !== undefined) {
          problems.push({
            severity: 'error',
            code: 'blocks-items.boat-chest-clash',
            elementId: element.id,
            path: `/components/${token(BOAT_COMPONENT)}/chest`,
            message:
              other === undefined
                ? `This boat registers its chest boat as "${chestId}", but the project already has an element with that id. Rename that element, or this boat.`
                : `This boat registers its chest boat as "${chestId}", and the boat "${other}" registers one with the same id. Rename one of them.`,
          });
        } else {
          chests.set(chestId, element.id);
        }
      }
    }
    const planks = safe(() => boatPlanksId(element.id));
    if (checkItems && planks !== undefined && !ids.has(planks) && !registry.has('item', planks)) {
      problems.push({
        severity: 'warning',
        code: 'blocks-items.boat-planks-missing',
        elementId: element.id,
        message: `This boat is crafted from "${planks}", as vanilla's boats are from their wood's planks, but the project has no such item, so the recipe cannot be crafted. Add the planks (the Wood set makes them) or rename the boat after its wood.`,
      });
    }
    if (checkTextures) {
      const slots = chest ? (['boat', 'chest_boat'] as const) : (['boat'] as const);
      for (const slot of slots) {
        if (nonEmptyString(textures?.[slot]) !== undefined) continue;
        const fixed = safe(() => boatTextureId(element.id, data, slot));
        if (fixed === undefined || registry.has('texture', fixed)) continue;
        problems.push({
          severity: 'warning',
          code: 'blocks-items.boat-texture-missing',
          elementId: element.id,
          path: `/boat_textures/${slot}`,
          message: `This ${slot === 'boat' ? 'boat' : 'chest boat'} has no picture, so it shows the missing-picture pattern. Pick a ${slot === 'boat' ? '128 x 64' : '128 x 128'} picture, or name a vanilla wood such as "minecraft:oak" as its wood pictures.`,
        });
      }
    }
  }
  return problems;
}

function cauldronProblems(elements: readonly Element[], vanilla: ReadonlySet<string>): Problem[] {
  const ids = new Set(elements.map((element) => element.id as string));
  const owners = new Map<string, string>();
  const problems: Problem[] = [];
  for (const element of elements) {
    if (element.kind !== FLUID_KIND) continue;
    const data = dataOf(element);
    if (!isRecord(data.cauldron)) continue;
    if (data.cauldron.levels === true && fluidBehaviourOf(data) === 'lava') {
      problems.push({
        severity: 'warning',
        code: 'blocks-items.cauldron-levels-ignored',
        elementId: element.id,
        path: '/cauldron/levels',
        message:
          "A lava-like fluid's cauldron is always full, as vanilla's lava cauldron, so it never fills in levels. Turn levels off, or make the fluid water-like.",
      });
    }
    const cauldron = safe(() => fluidCauldronId(element.id));
    if (cauldron === undefined) continue;
    const other = owners.get(cauldron);
    let message: string | undefined;
    if (vanilla.has(cauldron)) {
      message = `This fluid's cauldron would be "${cauldron}", which is one of vanilla's cauldrons. Rename the fluid.`;
    } else if (ids.has(cauldron)) {
      message = `This fluid's cauldron would be "${cauldron}", but the project already has an element with that id. Rename that element, or this fluid.`;
    } else if (other !== undefined) {
      message = `This fluid's cauldron would be "${cauldron}", and the fluid "${other}" has a cauldron with the same id. Rename one of them.`;
    } else {
      owners.set(cauldron, element.id);
    }
    if (message !== undefined) {
      problems.push({
        severity: 'error',
        code: 'blocks-items.cauldron-id-clash',
        elementId: element.id,
        path: '/cauldron',
        message,
      });
    }
  }
  return problems;
}

/** The validators of boats and fluid cauldrons. */
export const boatValidators: readonly ProjectValidator[] = Object.freeze([
  {
    id: 'msm.blocks-items.boats',
    kinds: [ITEM_KIND, BLOCK_KIND],
    validate: ({ elements, registry }) => {
      if (!elements.some((element) => element.kind === ITEM_KIND)) return [];
      return boatProblems(elements, registry);
    },
  },
  {
    id: 'msm.blocks-items.cauldrons',
    kinds: [FLUID_KIND, BLOCK_KIND, ITEM_KIND],
    validate: ({ elements, target }) => {
      if (!elements.some((element) => element.kind === FLUID_KIND)) return [];
      return cauldronProblems(elements, new Set(target.blocks?.cauldrons ?? []));
    },
  },
] satisfies ProjectValidator[]);
