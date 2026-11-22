/**
 * `blocks-items.*` project validators of waterlogging, weathering and waxing (ADR 0094 D7 to D9,
 * D11). They read the block elements and the vanilla block ids of the registry index:
 *
 * - `blocks-items.weathering-next-unknown` (error): a `next` of `msm:weathering` that is neither
 *   a project block nor a vanilla block.
 * - `blocks-items.weathering-cycle` (error): blocks whose `next` chain comes back to them; the
 *   runtime refuses the cycle at load. Each block of the cycle is reported.
 * - `blocks-items.weathering-stage-order` (warning): a `next` that is a project weathering block
 *   whose `stage` is not the one after this block's, or a `next` on the last stage
 *   (`oxidized`). The blocks still age, but not as copper's four stages do.
 * - `blocks-items.waxable-not-weathering` (error): `msm:waxable` without `msm:weathering`
 *   (only a weathering block can be waxed).
 * - `blocks-items.waxable-target-unknown` (error): an `into` of `msm:waxable` that is neither a
 *   project block nor a vanilla block.
 * - `blocks-items.waxed-block-invalid` (error): an `into` that is a project block with
 *   `msm:weathering` (a waxed copy must not age; B440), or the waxed copy of two blocks (the
 *   axe could not tell which one to give back: the runtime's reverse map needs one).
 *
 * They also report two codes of the other block validators:
 *
 * - `blocks-items.component-not-for-type` (error): `msm:waterloggable` on a type other than
 *   `block`, `pillar`, `horizontal` and `directional` (types that vanilla waterlogs keep their
 *   own waterlogging), or `msm:weathering` or `msm:waxable` on a type that does not age
 *   (`WEATHERING_BLOCK_TYPES`: copper's eleven types of ADR 0094 D8 and the rod, button,
 *   pressure plate, fence, fence gate and wall of ADR 0104 D1).
 * - `blocks-items.component-conflict` (error): `msm:waterloggable` together with
 *   `msm:container` or `msm:machine`; such a block is not waterloggable (limit Q8).
 */
import type { Element, Json, JsonObject, Problem, ProjectValidator } from '@msm/plugin-api';
import { BLOCK_KIND } from './kinds';
import { isRecord } from './lowering/paths';
import { BLOCK_TYPES, type BlockTypeName, containerOf, machineOf } from './lowering/types';
import {
  hasWaterloggable,
  WATERLOGGABLE_BLOCK_TYPES,
  WATERLOGGABLE_COMPONENT,
} from './lowering/waterlog';
import {
  fullBlockId,
  nextWeatheringStage,
  WAXABLE_COMPONENT,
  WEATHERING_BLOCK_TYPES,
  WEATHERING_COMPONENT,
  type WeatheringFields,
  waxableInto,
  weatheringOf,
} from './lowering/weathering';

/** Every code these validators report besides the two shared ones. */
export const WEATHERING_PROBLEM_CODES = Object.freeze([
  'blocks-items.weathering-next-unknown',
  'blocks-items.weathering-cycle',
  'blocks-items.weathering-stage-order',
  'blocks-items.waxable-not-weathering',
  'blocks-items.waxable-target-unknown',
  'blocks-items.waxed-block-invalid',
] as const);

const token = (key: string): string => key.replaceAll('~', '~0').replaceAll('/', '~1');
const pointer = (...keys: string[]): string => keys.map((key) => `/${token(key)}`).join('');
const dataOf = (element: Element): JsonObject => (isRecord(element.data) ? element.data : {});

const NEXT_PATH = pointer('components', WEATHERING_COMPONENT, 'next');
const INTO_PATH = pointer('components', WAXABLE_COMPONENT, 'into');

interface Block {
  element: Element;
  data: JsonObject;
  type: BlockTypeName | undefined;
  weathering: WeatheringFields | undefined;
  into: string | undefined;
}

function typeOf(data: JsonObject): BlockTypeName | undefined {
  const type = data.type;
  if (type === undefined) return 'block';
  return typeof type === 'string' && (BLOCK_TYPES as readonly string[]).includes(type)
    ? (type as BlockTypeName)
    : undefined;
}

const blocksOf = (elements: readonly Element[]): Block[] =>
  elements
    .filter((element) => element.kind === BLOCK_KIND)
    .map((element) => {
      const data = dataOf(element);
      return {
        element,
        data,
        type: typeOf(data),
        weathering: weatheringOf(data),
        into: waxableInto(data),
      };
    });

/** What the checks know about the project and the game's blocks. */
interface Context {
  blocks: readonly Block[];
  byId: ReadonlyMap<string, Block>;
  /** Whether `id` (a full id) is a project or a vanilla block. */
  known: (id: string) => boolean;
}

function contextOf(
  elements: readonly Element[],
  registry: {
    ids(registry: string): readonly string[];
    has(registry: string, id: string): boolean;
  },
): Context {
  const blocks = blocksOf(elements);
  const byId = new Map(blocks.map((block) => [block.element.id as string, block]));
  const vanillaKnown = registry.ids('block').length > 0;
  return {
    blocks,
    byId,
    known: (id) => byId.has(id) || !vanillaKnown || registry.has('block', id),
  };
}

// ---------------------------------------------------------------------------------------------
// Types and pairs (ADR 0094 D7, D8; limit Q8)

const component = (data: JsonObject, key: string): Json | undefined => {
  const components = isRecord(data.components) ? data.components : undefined;
  return components?.[key];
};

function notForType(blocks: readonly Block[]): Problem[] {
  const problems: Problem[] = [];
  const report = (block: Block, key: string, allowed: readonly BlockTypeName[], why: string) => {
    if (block.type === undefined || allowed.includes(block.type)) return;
    if (component(block.data, key) === undefined) return;
    problems.push({
      severity: 'error',
      code: 'blocks-items.component-not-for-type',
      elementId: block.element.id,
      path: pointer('components', key),
      message: `A ${block.type} block cannot have "${key}": ${why} Remove the component, or change the type to ${allowed.join(', ')}.`,
    });
  };
  for (const block of blocks) {
    report(
      block,
      WATERLOGGABLE_COMPONENT,
      WATERLOGGABLE_BLOCK_TYPES,
      'only the plain block types can be made to hold water (ladders, lanterns, chains, signs, candles, sea pickles and scaffolding hold water by themselves).',
    );
    report(
      block,
      WEATHERING_COMPONENT,
      WEATHERING_BLOCK_TYPES,
      'only blocks, pillars, facing blocks, slabs, stairs, doors, trapdoors, panes, chains, lanterns, rods, buttons, pressure plates, fences, fence gates and walls can age.',
    );
    report(
      block,
      WAXABLE_COMPONENT,
      WEATHERING_BLOCK_TYPES,
      'only the kinds of block that age can be waxed.',
    );
  }
  return problems;
}

function waterloggedContainers(blocks: readonly Block[]): Problem[] {
  return blocks.flatMap((block) => {
    if (!hasWaterloggable(block.data)) return [];
    const other =
      machineOf(block.data) !== undefined
        ? 'msm:machine'
        : containerOf(block.data) !== undefined
          ? 'msm:container'
          : undefined;
    if (other === undefined) return [];
    return [
      {
        severity: 'error',
        code: 'blocks-items.component-conflict',
        elementId: block.element.id,
        path: pointer('components', WATERLOGGABLE_COMPONENT),
        message: `A block with "${other}" cannot hold water, so "${WATERLOGGABLE_COMPONENT}" does nothing here. Remove one of them.`,
      } satisfies Problem,
    ];
  });
}

// ---------------------------------------------------------------------------------------------
// Weathering (ADR 0094 D8)

function nextUnknown({ blocks, known }: Context): Problem[] {
  return blocks.flatMap(({ element, weathering }) => {
    const next = weathering?.next;
    if (next === undefined || known(fullBlockId(next))) return [];
    return [
      {
        severity: 'error',
        code: 'blocks-items.weathering-next-unknown',
        elementId: element.id,
        path: NEXT_PATH,
        message: `The next stage "${next}" is neither a block of this project nor a vanilla block. Pick an existing block, or leave "next" out on the last stage.`,
      } satisfies Problem,
    ];
  });
}

/** The blocks whose `next` chain (through project weathering blocks) comes back to them. */
function cycles({ blocks, byId }: Context): Problem[] {
  const inCycle = new Set<string>();
  for (const start of blocks) {
    const seen: string[] = [];
    let current: Block | undefined = start;
    while (current !== undefined && current.weathering !== undefined) {
      const id = current.element.id as string;
      const at = seen.indexOf(id);
      if (at >= 0) {
        for (const member of seen.slice(at)) inCycle.add(member);
        break;
      }
      seen.push(id);
      const next: string | undefined = current.weathering.next;
      current = next === undefined ? undefined : byId.get(fullBlockId(next));
    }
  }
  return blocks
    .filter((block) => inCycle.has(block.element.id))
    .map(({ element }) => ({
      severity: 'error',
      code: 'blocks-items.weathering-cycle',
      elementId: element.id,
      path: NEXT_PATH,
      message: `The stages after "${element.id}" come back to it, so it would never stop ageing. Leave "next" out on the last stage.`,
    }));
}

function stageOrder({ blocks, byId }: Context): Problem[] {
  const problems: Problem[] = [];
  for (const { element, weathering } of blocks) {
    if (weathering?.next === undefined || weathering.stage === undefined) continue;
    const after = nextWeatheringStage(weathering.stage);
    if (after === undefined) {
      problems.push({
        severity: 'warning',
        code: 'blocks-items.weathering-stage-order',
        elementId: element.id,
        path: NEXT_PATH,
        message: `"${weathering.stage}" is the last stage, but this block still ages into "${weathering.next}". Leave "next" out, or give this block an earlier stage.`,
      });
      continue;
    }
    const stage = byId.get(fullBlockId(weathering.next))?.weathering?.stage;
    if (stage === undefined || stage === after) continue;
    problems.push({
      severity: 'warning',
      code: 'blocks-items.weathering-stage-order',
      elementId: element.id,
      path: NEXT_PATH,
      message: `This block is "${weathering.stage}", so its next stage should be "${after}", but "${weathering.next}" is "${stage}". Neighbours at a lower stage slow ageing as with copper, so mixed-up stages age unevenly.`,
    });
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------
// Waxing (ADR 0094 D9)

function waxing(context: Context): Problem[] {
  const { blocks, byId, known } = context;
  const problems: Problem[] = [];
  const waxedFrom = new Map<string, string[]>();
  for (const { element, weathering, into } of blocks) {
    if (into === undefined) continue;
    if (weathering === undefined) {
      problems.push({
        severity: 'error',
        code: 'blocks-items.waxable-not-weathering',
        elementId: element.id,
        path: pointer('components', WAXABLE_COMPONENT),
        message: `Only a block that ages can be waxed: add "${WEATHERING_COMPONENT}" or remove "${WAXABLE_COMPONENT}".`,
      });
    }
    if (into === '') continue;
    const id = fullBlockId(into);
    if (!known(id)) {
      problems.push({
        severity: 'error',
        code: 'blocks-items.waxable-target-unknown',
        elementId: element.id,
        path: INTO_PATH,
        message: `The waxed block "${into}" is neither a block of this project nor a vanilla block. Make a waxed copy of this block and pick it.`,
      });
      continue;
    }
    if (byId.get(id)?.weathering !== undefined) {
      problems.push({
        severity: 'error',
        code: 'blocks-items.waxed-block-invalid',
        elementId: element.id,
        path: INTO_PATH,
        message: `The waxed block "${into}" ages itself ("${WEATHERING_COMPONENT}"), but a waxed block must stay as it is. Remove "${WEATHERING_COMPONENT}" from "${into}".`,
      });
    }
    waxedFrom.set(id, [...(waxedFrom.get(id) ?? []), element.id]);
  }
  for (const [id, sources] of waxedFrom) {
    if (sources.length < 2) continue;
    for (const source of sources) {
      problems.push({
        severity: 'error',
        code: 'blocks-items.waxed-block-invalid',
        elementId: source as Element['id'],
        path: INTO_PATH,
        message: `"${id}" is the waxed block of ${sources.map((other) => `"${other}"`).join(' and ')}, so an axe could not tell which one to turn it back into. Give each block its own waxed copy.`,
      });
    }
  }
  return problems;
}

/** The validators. */
export const weatheringValidators: readonly ProjectValidator[] = Object.freeze([
  {
    id: 'msm.blocks-items.waterlog-weathering-types',
    kinds: [BLOCK_KIND],
    validate: ({ elements }) => {
      const blocks = blocksOf(elements);
      return [...notForType(blocks), ...waterloggedContainers(blocks)];
    },
  },
  {
    id: 'msm.blocks-items.weathering',
    kinds: [BLOCK_KIND],
    validate: ({ elements, registry }) => {
      const context = contextOf(elements, registry);
      return [
        ...nextUnknown(context),
        ...cycles(context),
        ...stageOrder(context),
        ...waxing(context),
      ];
    },
  },
] satisfies ProjectValidator[]);
