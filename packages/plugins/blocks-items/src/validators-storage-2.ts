/**
 * `blocks-items.*` project validators of waterlogged, double, per-player and ageing storage
 * (ADR 0104 D3 to D6). Containers and machines may hold water now (D3), so the old
 * `component-conflict` of `msm:waterloggable` with them is gone; these report what the runtime
 * refuses or quietly turns off (`BlockComponents.checkContainer`), and what would lose items:
 *
 * - `blocks-items.double-chest-layout` (error): `double` on a chest of other than 3 rows, or with
 *   `keep_contents`; the runtime turns `double` off with a load error. (`double` outside the chest
 *   layout is `blocks-items.container-layout-fields`.)
 * - `blocks-items.double-chest-type` (error): `double` on a `pillar` or `directional` block: a
 *   double chest is vanilla's chest family, which faces one of four ways and has no axis or up
 *   and down, so the block's turned looks would not match it. Use `block` or `horizontal`.
 * - `blocks-items.per-player-conflict` (error): `per_player` with `keep_contents` or `double`; the
 *   runtime turns `per_player` off with a load error.
 * - `blocks-items.per-player-hoppers` (info): `hoppers` or `comparator` set to `true` on a
 *   per-player chest: neither reaches a player's own store, as with vanilla's ender chest.
 * - `blocks-items.ageing-container-mismatch` (warning): a container with `msm:weathering` or
 *   `msm:waxable` whose next stage or waxed block is a project block but not a container of the
 *   same shape (layout,
 *   rows or size, `keep_contents`, `double`, `per_player`): ageing and waxing copy the contents
 *   into the new block (D6), so a block without the slots loses them.
 * - `blocks-items.machine-cannot-age` (warning): a machine with `msm:weathering` or `msm:waxable`:
 *   a machine keeps its working block entity, so the runtime loads it without them and says so
 *   only in the game log (`BlockComponents.checkAgeing`).
 */
import type { Element, Json, JsonObject, Problem, ProjectValidator } from '@msm/plugin-api';
import { BLOCK_KIND } from './kinds';
import { isRecord } from './lowering/paths';
import { CONTAINER_COMPONENT, containerOf, machineOf } from './lowering/types';
import {
  fullBlockId,
  WAXABLE_COMPONENT,
  WEATHERING_COMPONENT,
  waxableInto,
  weatheringOf,
} from './lowering/weathering';

/** Every code these validators report. */
export const STORAGE2_PROBLEM_CODES: readonly string[] = Object.freeze([
  'blocks-items.double-chest-layout',
  'blocks-items.double-chest-type',
  'blocks-items.per-player-conflict',
  'blocks-items.per-player-hoppers',
  'blocks-items.ageing-container-mismatch',
  'blocks-items.machine-cannot-age',
]);

const DEFAULT_CHEST_ROWS = 3;
/** The types a double chest cannot take: they turn by axis or face up and down. */
const NOT_DOUBLE_TYPES: readonly string[] = Object.freeze(['pillar', 'directional']);

const token = (key: string): string => key.replaceAll('~', '~0').replaceAll('/', '~1');
const pointer = (...keys: string[]): string => keys.map((key) => `/${token(key)}`).join('');
const dataOf = (element: Element): JsonObject => (isRecord(element.data) ? element.data : {});
const typeOf = (data: JsonObject): string => (typeof data.type === 'string' ? data.type : 'block');
const layoutOf = (container: JsonObject): string =>
  typeof container.layout === 'string' ? container.layout : 'chest';

/** A project block with its `msm:container` (machines win over containers, so they are left out). */
interface Storage {
  element: Element;
  data: JsonObject;
  container: JsonObject;
}

const storages = (elements: readonly Element[]): Storage[] =>
  elements.flatMap((element) => {
    if (element.kind !== BLOCK_KIND) return [];
    const data = dataOf(element);
    const container = containerOf(data);
    if (container === undefined || machineOf(data) !== undefined) return [];
    return [{ element, data, container }];
  });

const fieldPath = (field: string): string => pointer('components', CONTAINER_COMPONENT, field);

function doubleChests(blocks: readonly Storage[]): Problem[] {
  const problems: Problem[] = [];
  for (const { element, data, container } of blocks) {
    if (container.double !== true || layoutOf(container) !== 'chest') continue;
    const rows = container.rows ?? DEFAULT_CHEST_ROWS;
    if (rows !== DEFAULT_CHEST_ROWS || container.keep_contents === true) {
      problems.push({
        severity: 'error',
        code: 'blocks-items.double-chest-layout',
        elementId: element.id,
        path: fieldPath('double'),
        message:
          container.keep_contents === true
            ? 'A chest that keeps its contents when broken cannot join into a double chest, so the game turns "Double chest" off. Turn one of them off.'
            : `Two chests join into six rows only when each has 3 rows, but this one has ${String(rows)}, so the game turns "Double chest" off. Use 3 rows, or turn "Double chest" off.`,
      });
    }
    const type = typeOf(data);
    if (NOT_DOUBLE_TYPES.includes(type)) {
      problems.push({
        severity: 'error',
        code: 'blocks-items.double-chest-type',
        elementId: element.id,
        path: fieldPath('double'),
        message: `A double chest faces one of four ways, as vanilla's chest does, so a ${type} block cannot be one: its turned looks would not match. Use the block or horizontal type, or turn "Double chest" off.`,
      });
    }
  }
  return problems;
}

function perPlayer(blocks: readonly Storage[]): Problem[] {
  const problems: Problem[] = [];
  for (const { element, container } of blocks) {
    if (container.per_player !== true || layoutOf(container) !== 'chest') continue;
    const other =
      container.keep_contents === true
        ? 'keeps its contents when broken'
        : container.double === true
          ? 'joins into a double chest'
          : undefined;
    if (other !== undefined) {
      problems.push({
        severity: 'error',
        code: 'blocks-items.per-player-conflict',
        elementId: element.id,
        path: fieldPath('per_player'),
        message: `Each player's own chest holds nothing in the block itself, so it cannot be a chest that ${other}; the game turns "Each player's own chest" off. Turn one of them off.`,
      });
    }
    for (const field of ['hoppers', 'comparator']) {
      if (container[field] !== true) continue;
      problems.push({
        severity: 'info',
        code: 'blocks-items.per-player-hoppers',
        elementId: element.id,
        path: fieldPath(field),
        message: `Each player sees their own contents, so ${field === 'hoppers' ? 'hoppers reach nothing' : 'comparators read nothing'} here, as with vanilla's ender chest. "${field}" does nothing.`,
      });
    }
  }
  return problems;
}

/** The parts of a container's shape that its slots depend on. */
function shapeOf(container: JsonObject): string {
  const layout = layoutOf(container);
  const flag = (value: Json | undefined): boolean => value === true;
  const parts: (string | number | boolean)[] = [layout];
  if (layout === 'chest') {
    parts.push(
      typeof container.rows === 'number' ? container.rows : DEFAULT_CHEST_ROWS,
      flag(container.keep_contents),
      flag(container.double),
      flag(container.per_player),
    );
  }
  if (layout === 'none') parts.push(typeof container.size === 'number' ? container.size : 1);
  return JSON.stringify(parts);
}

function ageingContainers(elements: readonly Element[], blocks: readonly Storage[]): Problem[] {
  const byId = new Map<string, JsonObject>();
  for (const element of elements) {
    if (element.kind === BLOCK_KIND) byId.set(element.id, dataOf(element));
  }
  const problems: Problem[] = [];
  for (const { element, data, container } of blocks) {
    const steps: [string, string, string][] = [];
    const next = weatheringOf(data)?.next;
    if (next !== undefined) steps.push([next, WEATHERING_COMPONENT, 'next']);
    const waxed = waxableInto(data);
    if (waxed !== undefined && waxed !== '') steps.push([waxed, WAXABLE_COMPONENT, 'into']);
    for (const [id, component, field] of steps) {
      const other = byId.get(fullBlockId(id));
      // A vanilla block (a copper chest) is the runtime's to judge; unknown ids are reported
      // by the weathering validators.
      if (other === undefined) continue;
      const otherContainer = machineOf(other) !== undefined ? undefined : containerOf(other);
      if (otherContainer !== undefined && shapeOf(otherContainer) === shapeOf(container)) continue;
      problems.push({
        severity: 'warning',
        code: 'blocks-items.ageing-container-mismatch',
        elementId: element.id,
        path: pointer('components', component, field),
        message:
          otherContainer === undefined
            ? `"${id}" is not a container, so the items inside are lost when this block ${field === 'next' ? 'ages into it' : 'is waxed'}. Make "${id}" a container with the same slots.`
            : `"${id}" is a container of another shape, so the items inside may not fit when this block ${field === 'next' ? 'ages into it' : 'is waxed'}. Give both the same layout, rows and options.`,
      });
    }
  }
  return problems;
}

function ageingMachines(elements: readonly Element[]): Problem[] {
  const problems: Problem[] = [];
  for (const element of elements) {
    if (element.kind !== BLOCK_KIND) continue;
    const data = dataOf(element);
    if (machineOf(data) === undefined) continue;
    const components = isRecord(data.components) ? data.components : {};
    for (const component of [WEATHERING_COMPONENT, WAXABLE_COMPONENT]) {
      if (components[component] === undefined) continue;
      problems.push({
        severity: 'warning',
        code: 'blocks-items.machine-cannot-age',
        elementId: element.id,
        path: pointer('components', component),
        message: `A machine keeps its working parts, so it cannot ${component === WEATHERING_COMPONENT ? 'age like copper' : 'be waxed'}: the game loads it without "${component}". Remove it, or make the block a container instead.`,
      });
    }
  }
  return problems;
}

export const storage2Validators: readonly ProjectValidator[] = Object.freeze([
  {
    id: 'msm.blocks-items.storage-2',
    kinds: [BLOCK_KIND],
    validate: ({ elements }) => {
      const blocks = storages(elements);
      return [
        ...doubleChests(blocks),
        ...perPlayer(blocks),
        ...ageingContainers(elements, blocks),
        ...ageingMachines(elements),
      ];
    },
  },
] satisfies ProjectValidator[]);
