/**
 * `blocks-items.*` project validators of fluids (ADR 0099 D1, D4 and its amendment after the
 * spike, B470). They read the element data (editor fields still present) and the target's fluid
 * facts:
 *
 * - `blocks-items.generated-item-clash` (error): a fluid's generated bucket item
 *   `<ns>:<path>_bucket` (`fluidBucketId`) or bottle item `<ns>:<path>_bottle` (`fluidBottleId`,
 *   with `bottle`; ADR 0108 D3) is the id of a project element, of a block's item or of another
 *   fluid's bucket or bottle, so the game would register two items under one id.
 * - `blocks-items.fluid-flow-range` (warning): `slope_distance` is larger than the number of
 *   blocks the fluid can spread (`floor(7 / drop_off)`, `fluidSpreadDistance`), defaults of
 *   `behaves_like` filled in, so the fluid would look for a way down further than it can ever
 *   flow. Vanilla's water (4 within 7) and lava (2 within 3) keep inside it.
 * - `blocks-items.fluid-texture-missing` (warning): `textures.still`, `textures.flowing` or
 *   `textures.bucket` is not set, so the fluid shows vanilla water's (or lava's) picture there.
 *   Whether a named picture exists is the host's check (it sees the project's files).
 * - `blocks-items.fluid-no-fog` (warning): a fluid that behaves like nothing on a target that
 *   registers a liquid as one fluid (`fluidModel: 'one_fluid'`): its under-the-surface fog
 *   comes from the fluid's own properties, which the runtime copies from vanilla water or lava by
 *   `behaves_like`, so it has none and players see through it as through air.
 * - `blocks-items.fluid-unknown-event` (error, B485): `on_entity_inside`, or a `trigger_event`
 *   action in one of the fluid's events, names an event that is not in the fluid's own `events`.
 *   The runtime's `FluidParser` refuses such a definition, so the fluid would not load. The
 *   shared `blocks-items.unknown-event` covers blocks, items and effects only. `bottle.on_drink`
 *   (ADR 0108 D3) is checked the same way.
 * - `blocks-items.fluid-mixing-empty` (error, ADR 0108 D1): a mixing rule names neither `source`
 *   nor `flowing`, so it changes nothing (the runtime drops it with a warning).
 * - `blocks-items.fluid-mixing-self` (error): a mixing rule's `with` is the fluid itself (or its
 *   flowing id), which can never be the other liquid.
 * - `blocks-items.fluid-mixing-duplicate` (warning): two rules name the same `with`; the first
 *   wins, so the later one is never used.
 * - `blocks-items.fluid-mixing-liquid-result` (warning): a rule turns the fluid into a liquid
 *   block (`minecraft:water`, `minecraft:lava` or a project fluid), so the two can go on mixing
 *   instead of making a solid block as vanilla's lava does. Whether a named block exists at all
 *   is the schema's `schema.unknown-id` (the fields are block ids), not repeated here.
 */
import type { Element, JsonObject, Problem, ProjectValidator, TargetFacts } from '@msm/plugin-api';
import { BLOCK_KIND } from './kinds';
import { FLUID_KIND } from './kinds/fluid';
import { blockItemIdOf } from './lowering/block-item';
import { fluidBottleId, hasFluidBottle } from './lowering/cauldron';
import {
  type FluidTextureSlot,
  flowingFluidId,
  fluidBehaviourOf,
  fluidBucketId,
  fluidFlowOf,
  fluidSpreadDistance,
  fluidTextureOf,
} from './lowering/fluid';
import { isRecord } from './lowering/paths';

/** Every code these validators report. */
export const FLUID_PROBLEM_CODES: readonly string[] = Object.freeze([
  'blocks-items.generated-item-clash',
  'blocks-items.fluid-flow-range',
  'blocks-items.fluid-texture-missing',
  'blocks-items.fluid-no-fog',
  'blocks-items.fluid-unknown-event',
]);

/**
 * The codes of the mixing checks (ADR 0108 D1; B531), kept apart from {@link FLUID_PROBLEM_CODES}
 * (which the AI helper's prompt and the Very easy wording pin) until the guide and AI briefs
 * word them.
 */
export const FLUID_MIXING_PROBLEM_CODES: readonly string[] = Object.freeze([
  'blocks-items.fluid-mixing-empty',
  'blocks-items.fluid-mixing-self',
  'blocks-items.fluid-mixing-duplicate',
  'blocks-items.fluid-mixing-liquid-result',
]);

/** The texture slots `fluid-texture-missing` asks for, in report order. */
const REQUIRED_TEXTURES: readonly FluidTextureSlot[] = ['still', 'flowing', 'bucket'];

const TEXTURE_WORDS: Readonly<Record<FluidTextureSlot, string>> = {
  still: 'still surface',
  flowing: 'flowing surface',
  overlay: 'overlay',
  bucket: 'bucket',
  bottle: 'bottle',
};

const dataOf = (element: Element): JsonObject => (isRecord(element.data) ? element.data : {});

/** The bucket id of `element`, or `undefined` when its id is not a safe resource location. */
function bucketOf(element: Element): string | undefined {
  try {
    return fluidBucketId(element.id);
  } catch {
    return undefined;
  }
}

/** The items a block element registers: its own block item, if any. */
function blockItemOf(element: Element): string | undefined {
  try {
    return blockItemIdOf(element.id, dataOf(element));
  } catch {
    return undefined;
  }
}

/** The items a fluid generates: its bucket and, with `bottle`, its bottle. */
function generatedItemsOf(element: Element): { id: string; what: string }[] {
  const items: { id: string; what: string }[] = [];
  const bucket = bucketOf(element);
  if (bucket !== undefined) items.push({ id: bucket, what: 'bucket' });
  if (hasFluidBottle(dataOf(element))) {
    try {
      items.push({ id: fluidBottleId(element.id), what: 'bottle' });
    } catch {
      // An unsafe id: the schema reports it.
    }
  }
  return items;
}

function generatedItemClashes(elements: readonly Element[]): Problem[] {
  const fluids = elements.filter((element) => element.kind === FLUID_KIND);
  if (fluids.length === 0) return [];
  const ids = new Set(elements.map((element) => element.id as string));
  const blockItems = new Map<string, string>();
  for (const element of elements) {
    if (element.kind !== BLOCK_KIND) continue;
    const item = blockItemOf(element);
    if (item !== undefined && item !== element.id) blockItems.set(item, element.id);
  }
  const owners = new Map<string, string>();
  const problems: Problem[] = [];
  for (const element of fluids) {
    for (const { id: item, what } of generatedItemsOf(element)) {
      const block = blockItems.get(item);
      const other = owners.get(item);
      let message: string | undefined;
      if (ids.has(item)) {
        message = `This fluid registers its ${what} as "${item}", but the project already has an element with that id, so the game would load only one of them. Rename that element, or this fluid.`;
      } else if (block !== undefined) {
        message = `This fluid registers its ${what} as "${item}", and the block "${block}" registers its item under the same id. Rename one of them.`;
      } else if (other !== undefined) {
        message = `This fluid registers its ${what} as "${item}", and the fluid "${other}" registers an item with the same id. Rename one of them.`;
      } else {
        owners.set(item, element.id);
      }
      if (message !== undefined) {
        problems.push({
          severity: 'error',
          code: 'blocks-items.generated-item-clash',
          elementId: element.id,
          ...(what === 'bottle' ? { path: '/bottle' } : {}),
          message,
        });
      }
    }
  }
  return problems;
}

/** The pointer of the flow field a flow warning points at: the one the element sets itself. */
function flowPath(data: JsonObject): string {
  const flow = isRecord(data.flow) ? data.flow : {};
  if (flow.slope_distance !== undefined) return '/flow/slope_distance';
  if (flow.drop_off !== undefined) return '/flow/drop_off';
  return data.flow === undefined ? '/behaves_like' : '/flow';
}

function flowRanges(fluids: readonly Element[]): Problem[] {
  const problems: Problem[] = [];
  for (const element of fluids) {
    const data = dataOf(element);
    const flow = fluidFlowOf(data);
    const spread = fluidSpreadDistance(flow.dropOff);
    if (flow.slopeDistance <= spread) continue;
    problems.push({
      severity: 'warning',
      code: 'blocks-items.fluid-flow-range',
      elementId: element.id,
      path: flowPath(data),
      message: `This fluid looks ${flow.slopeDistance} blocks ahead for a way down, but with a drop-off of ${flow.dropOff} it only spreads ${spread} ${spread === 1 ? 'block' : 'blocks'} from its source. Lower the slope distance to ${spread} or less, or lower the drop-off.`,
    });
  }
  return problems;
}

function missingTextures(fluids: readonly Element[]): Problem[] {
  const problems: Problem[] = [];
  for (const element of fluids) {
    const data = dataOf(element);
    const vanilla = fluidBehaviourOf(data) === 'lava' ? 'lava' : 'water';
    for (const slot of REQUIRED_TEXTURES) {
      if (fluidTextureOf(data, slot) !== undefined) continue;
      problems.push({
        severity: 'warning',
        code: 'blocks-items.fluid-texture-missing',
        elementId: element.id,
        path: `/textures/${slot}`,
        message: `This fluid has no ${TEXTURE_WORDS[slot]} picture, so it shows vanilla ${vanilla}'s there. Pick a picture.`,
      });
    }
  }
  return problems;
}

function missingFog(fluids: readonly Element[], target: TargetFacts): Problem[] {
  if (target.blocks?.fluidModel !== 'one_fluid') return [];
  return fluids
    .filter((element) => fluidBehaviourOf(dataOf(element)) === 'none')
    .map((element) => ({
      severity: 'warning' as const,
      code: 'blocks-items.fluid-no-fog',
      elementId: element.id,
      path: '/behaves_like',
      message: `On Minecraft ${target.mcVersion} a fluid that behaves like nothing has no fog under its surface, so players see through it as through air. Make it behave like water or lava to give it their fog.`,
    }));
}

/** The events a fluid declares in its own `events` map. */
function fluidEvents(data: JsonObject): JsonObject {
  return isRecord(data.events) ? data.events : {};
}

function unknownFluidEvents(fluids: readonly Element[]): Problem[] {
  const problems: Problem[] = [];
  for (const element of fluids) {
    const data = dataOf(element);
    const events = fluidEvents(data);
    const declared = new Set(Object.keys(events));
    const report = (event: string, path: string) => {
      if (declared.has(event)) return;
      problems.push({
        severity: 'error',
        code: 'blocks-items.fluid-unknown-event',
        elementId: element.id,
        path,
        message: `Event "${event}" is not in this fluid's own "events", so the runtime would refuse the fluid. Add the event there or pick one of its events.`,
      });
    };
    if (typeof data.on_entity_inside === 'string') {
      report(data.on_entity_inside, '/on_entity_inside');
    }
    if (isRecord(data.bottle) && typeof data.bottle.on_drink === 'string') {
      report(data.bottle.on_drink, '/bottle/on_drink');
    }
    for (const [name, event] of Object.entries(events)) {
      const actions = isRecord(event) ? event.actions : undefined;
      if (!Array.isArray(actions)) continue;
      actions.forEach((action, index) => {
        if (!isRecord(action) || action.type !== 'trigger_event') return;
        if (typeof action.event !== 'string') return;
        report(action.event, `/events/${escapePointer(name)}/actions/${index}/event`);
      });
    }
  }
  return problems;
}

/** The liquid blocks a mixing result may not be without a warning: vanilla's and the project's. */
const VANILLA_LIQUID_BLOCKS: readonly string[] = ['minecraft:water', 'minecraft:lava'];

const namespaced = (id: string): string => (id.includes(':') ? id : `minecraft:${id}`);

function mixingProblems(fluids: readonly Element[], target: TargetFacts): Problem[] {
  const liquids = new Set([...VANILLA_LIQUID_BLOCKS, ...fluids.map((fluid) => fluid.id as string)]);
  const problems: Problem[] = [];
  for (const element of fluids) {
    const rules = dataOf(element).mixing;
    if (!Array.isArray(rules)) continue;
    let flowing: string | undefined;
    try {
      flowing = flowingFluidId(target, element.id);
    } catch {
      flowing = undefined;
    }
    const own = new Set([element.id as string, ...(flowing === undefined ? [] : [flowing])]);
    const seen = new Map<string, number>();
    rules.forEach((rule, index) => {
      if (!isRecord(rule)) return;
      const path = `/mixing/${index}`;
      const withValue = typeof rule.with === 'string' ? rule.with : undefined;
      const source = typeof rule.source === 'string' ? rule.source : undefined;
      const flowingResult = typeof rule.flowing === 'string' ? rule.flowing : undefined;
      if (source === undefined && flowingResult === undefined) {
        problems.push({
          severity: 'error',
          code: 'blocks-items.fluid-mixing-empty',
          elementId: element.id,
          path,
          message:
            'This mixing rule turns nothing into a block: give it a block for the source, for flowing fluid, or both.',
        });
      }
      if (withValue === undefined) return;
      const other =
        withValue === 'water' || withValue === 'lava' ? withValue : namespaced(withValue);
      if (own.has(other)) {
        problems.push({
          severity: 'error',
          code: 'blocks-items.fluid-mixing-self',
          elementId: element.id,
          path: `${path}/with`,
          message:
            'This mixing rule mixes the fluid with itself, which never happens. Pick water, lava or another fluid.',
        });
      }
      const first = seen.get(other);
      if (first === undefined) {
        seen.set(other, index);
      } else {
        problems.push({
          severity: 'warning',
          code: 'blocks-items.fluid-mixing-duplicate',
          elementId: element.id,
          path: `${path}/with`,
          message: `Mixing rule ${first + 1} already says what happens with "${withValue}", and the first matching rule wins, so this one is never used. Remove it or merge the two.`,
        });
      }
      for (const [field, block] of [
        ['source', source],
        ['flowing', flowingResult],
      ] as const) {
        if (block === undefined || !liquids.has(namespaced(block))) continue;
        problems.push({
          severity: 'warning',
          code: 'blocks-items.fluid-mixing-liquid-result',
          elementId: element.id,
          path: `${path}/${field}`,
          message: `This mixing rule turns the fluid into the liquid "${block}", so the two liquids can keep mixing. Pick a solid block, as lava makes obsidian and cobblestone.`,
        });
      }
    });
  }
  return problems;
}

/** One JSON Pointer segment (RFC 6901). */
function escapePointer(segment: string): string {
  return segment.replaceAll('~', '~0').replaceAll('/', '~1');
}

/** The validators of fluids. */
export const fluidValidators: readonly ProjectValidator[] = Object.freeze([
  {
    id: 'msm.blocks-items.fluids',
    kinds: [FLUID_KIND, BLOCK_KIND],
    validate: ({ elements, target }) => {
      const fluids = elements.filter((element) => element.kind === FLUID_KIND);
      if (fluids.length === 0) return [];
      return [
        ...generatedItemClashes(elements),
        ...flowRanges(fluids),
        ...missingTextures(fluids),
        ...missingFog(fluids, target),
        ...unknownFluidEvents(fluids),
        ...mixingProblems(fluids, target),
      ];
    },
  },
] satisfies ProjectValidator[]);
