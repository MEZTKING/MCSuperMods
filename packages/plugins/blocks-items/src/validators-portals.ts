/**
 * `blocks-items.*` project validators of portal blocks (ADR 0077 D8): the `portal` block type
 * and the `light_portal` action. They read the element data, the target's portal facts
 * (`target.blocks.portal`, since plugin API 1.13.0) and the registry index (vanilla plus project
 * ids). Each id check is skipped when the registry knows no ids of that registry at all.
 *
 * - `blocks-items.portal-destination-unknown` (error): a `destination` or `return_to` that is
 *   neither a project dimension nor a dimension of the target.
 * - `blocks-items.portal-same-dimension` (error): `destination` equal to `return_to` (default
 *   `minecraft:overworld`), so the portal would lead nowhere.
 * - `blocks-items.portal-frame-unknown` (error): a `frame` (block or `#tag`) or `frame_block`
 *   that is neither a project nor a vanilla block or block tag.
 * - `blocks-items.portal-frame-block-needed` (error): a tag `frame` without `frame_block`.
 * - `blocks-items.portal-igniter-unknown` (error): an `igniter` (item or `#tag`) that is neither
 *   a project nor a vanilla item or item tag.
 * - `blocks-items.portal-particle-options` (error): `particles.color` with a `particles.type`
 *   other than `minecraft:dust` (only dust takes a colour; limit P3). A `type` that takes other
 *   options is the runtime's load error (it keeps the default particle), as for leaves: the
 *   app has no list of option-less particle types.
 * - `blocks-items.portal-sound-unknown` (warning): a `sounds.ambient` or `sounds.travel` that is
 *   neither a vanilla sound event nor an event key of the project's `sounds.json` (project keys
 *   count, ADR 0057 D3). Only when the target has portal facts.
 * - `blocks-items.portal-event-unknown` (error): an `on_travel` that the element's `events` do
 *   not declare.
 * - `blocks-items.portal-frame-clash` (warning): two portals with the same frame and igniter;
 *   the runtime tries portals in sorted id order, so the first id wins and the later one is
 *   reported. Portals with `igniter: false` never clash (only the action lights them).
 * - `blocks-items.light-portal-not-portal` (error): a `light_portal` action in a block's,
 *   item's or effect's events naming a block that is not a project portal. A `light_portal` in
 *   an entity's events is left to the schema's id check and the runtime's load error.
 * - `blocks-items.component-not-for-type` (error, the block types' code): a component other
 *   than {@link PORTAL_COMPONENTS} on a portal. The shaped-only components (`msm:shape`,
 *   `msm:redstone`, `msm:container`, `msm:machine`) are already reported by the block type
 *   validators, so they are not reported twice.
 */
import type {
  Element,
  Json,
  JsonObject,
  Problem,
  ProjectValidator,
  TargetFacts,
  ValidationRegistry,
} from '@msm/plugin-api';
import { BLOCK_KIND, EFFECT_KIND, ITEM_KIND } from './kinds';
import { blockItemId } from './lowering/block-item';
import { isRecord } from './lowering/paths';
import { SHAPED_ONLY_COMPONENTS } from './validators-types';

/** Every code the portal validators report besides `blocks-items.component-not-for-type`. */
export const PORTAL_PROBLEM_CODES = Object.freeze([
  'blocks-items.portal-destination-unknown',
  'blocks-items.portal-same-dimension',
  'blocks-items.portal-frame-unknown',
  'blocks-items.portal-frame-block-needed',
  'blocks-items.portal-igniter-unknown',
  'blocks-items.portal-particle-options',
  'blocks-items.portal-sound-unknown',
  'blocks-items.portal-event-unknown',
  'blocks-items.portal-frame-clash',
  'blocks-items.light-portal-not-portal',
] as const);

/** The block type of portals (ADR 0077 D1). */
export const PORTAL_TYPE = 'portal';
/** The action that lights a portal's frame (ADR 0077 D3). */
export const LIGHT_PORTAL_ACTION = 'light_portal';
/** The components a portal takes (ADR 0077 D1); the runtime drops any other with an error. */
export const PORTAL_COMPONENTS: readonly string[] = Object.freeze([
  'msm:breakable',
  'msm:light_emitter',
  'msm:on_break',
  'msm:on_place',
  'msm:on_random_tick',
  'msm:on_entity_inside',
]);
/** The igniter of a portal without `igniter` (ADR 0077 D1). */
export const DEFAULT_PORTAL_IGNITER = 'minecraft:flint_and_steel';
/** The dimension a portal leads back to without `return_to` (ADR 0077 D1). */
export const DEFAULT_PORTAL_RETURN_TO = 'minecraft:overworld';
/** The only particle type a portal's `particles.color` applies to (limit P3). */
export const DUST_PARTICLE = 'minecraft:dust';

const DIMENSION_KIND = 'minecraft:dimension';
const BLOCK_TAG_KIND = 'minecraft:tag/block';
const ITEM_TAG_KIND = 'minecraft:tag/item';
const SOUNDS_KIND = 'minecraft:sounds';
const SOUND_EVENT_REGISTRY = 'sound_event';
const WEIGHED_SOUND_EVENT_REGISTRY = 'weighed_sound_event';

const token = (key: string): string => key.replaceAll('~', '~0').replaceAll('/', '~1');
const pointer = (...keys: (string | number)[]): string =>
  keys.map((key) => `/${token(String(key))}`).join('');
const dataOf = (element: Element): JsonObject => (isRecord(element.data) ? element.data : {});
const record = (value: Json | undefined): JsonObject | undefined =>
  isRecord(value) ? value : undefined;
const text = (value: Json | undefined): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;
const namespaced = (id: string): string => (id.includes(':') ? id : `minecraft:${id}`);
/** `#a:b` or `a:b` with the namespace filled in (`#b` is `#minecraft:b`). */
const normalised = (value: string): string =>
  value.startsWith('#') ? `#${namespaced(value.slice(1))}` : namespaced(value);

/** Whether `element` is an `msm:block` of type `portal`. */
export const isPortalElement = (element: Pick<Element, 'kind' | 'data'>): boolean =>
  element.kind === BLOCK_KIND && isRecord(element.data) && element.data.type === PORTAL_TYPE;

interface Portal {
  element: Element;
  data: JsonObject;
}

const portalsOf = (elements: readonly Element[]): Portal[] =>
  elements
    .filter(isPortalElement)
    .map((element) => ({ element, data: dataOf(element) }))
    .sort((a, b) => (a.element.id < b.element.id ? -1 : a.element.id > b.element.id ? 1 : 0));

const idsOfKind = (elements: readonly Element[], kind: string): Set<string> =>
  new Set(elements.filter((element) => element.kind === kind).map((element) => element.id));

/** Known when the project has it, the registry has it, or the registry knows none at all. */
function known(
  id: string,
  project: ReadonlySet<string>,
  registry: ValidationRegistry,
  name: string,
): boolean {
  if (project.has(id)) return true;
  if (registry.ids(name).length === 0) return true;
  return registry.has(name, id);
}

// ---------------------------------------------------------------------------------------------
// Destinations (ADR 0077 D6)

function destinations(
  portals: readonly Portal[],
  elements: readonly Element[],
  registry: ValidationRegistry,
): Problem[] {
  const projectDimensions = idsOfKind(elements, DIMENSION_KIND);
  const problems: Problem[] = [];
  for (const { element, data } of portals) {
    const destination = text(data.destination);
    const returnTo = text(data.return_to);
    for (const [field, value] of [
      ['destination', destination],
      ['return_to', returnTo],
    ] as const) {
      if (value === undefined) continue;
      if (known(namespaced(value), projectDimensions, registry, 'dimension')) continue;
      problems.push({
        severity: 'error',
        code: 'blocks-items.portal-destination-unknown',
        elementId: element.id,
        path: pointer(field),
        message: `Dimension "${value}" is neither a dimension of this project nor a vanilla dimension, so the portal could not take anyone there. Pick an existing dimension, or add it to the project.`,
      });
    }
    if (destination === undefined) continue;
    const back = namespaced(returnTo ?? DEFAULT_PORTAL_RETURN_TO);
    if (namespaced(destination) !== back) continue;
    problems.push({
      severity: 'error',
      code: 'blocks-items.portal-same-dimension',
      elementId: element.id,
      path: pointer(returnTo === undefined ? 'destination' : 'return_to'),
      message: `The portal leads to "${back}" and back to "${back}", so it would go nowhere. Pick a different destination${returnTo === undefined ? ' (the portal leads back to the overworld unless "Comes back to" is set)' : ' or a different dimension to come back to'}.`,
    });
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------
// Frame and igniter (ADR 0077 D1, D2, D3)

function frames(
  portals: readonly Portal[],
  elements: readonly Element[],
  registry: ValidationRegistry,
): Problem[] {
  const projectBlocks = idsOfKind(elements, BLOCK_KIND);
  const projectTags = idsOfKind(elements, BLOCK_TAG_KIND);
  const blockKnown = (id: string) => known(id, projectBlocks, registry, 'block');
  const tagKnown = (id: string) => known(id, projectTags, registry, 'tag/block');
  const problems: Problem[] = [];
  for (const { element, data } of portals) {
    const frame = text(data.frame);
    const frameBlock = text(data.frame_block);
    const isTag = frame?.startsWith('#') === true;
    if (frame !== undefined) {
      const id = namespaced(isTag ? frame.slice(1) : frame);
      if (!(isTag ? tagKnown(id) : blockKnown(id))) {
        problems.push({
          severity: 'error',
          code: 'blocks-items.portal-frame-unknown',
          elementId: element.id,
          path: pointer('frame'),
          message: `Frame ${isTag ? 'tag' : 'block'} "${frame}" is neither ${isTag ? 'a block tag of this project nor a vanilla block tag' : 'a block of this project nor a vanilla block'}, so no frame could ever be lit. Pick an existing ${isTag ? 'tag' : 'block'}.`,
        });
      }
    }
    if (frameBlock !== undefined && !blockKnown(namespaced(frameBlock))) {
      problems.push({
        severity: 'error',
        code: 'blocks-items.portal-frame-unknown',
        elementId: element.id,
        path: pointer('frame_block'),
        message: `Block "${frameBlock}" is neither a block of this project nor a vanilla block, so exit portals could not be built of it. Pick an existing block.`,
      });
    }
    if (isTag && frameBlock === undefined) {
      problems.push({
        severity: 'error',
        code: 'blocks-items.portal-frame-block-needed',
        elementId: element.id,
        path: pointer('frame_block'),
        message: `The frame is the tag "${frame}", so the game does not know which block to build exit portals of. Pick the block exit portals are built of, such as one block of the tag.`,
      });
    }
  }
  return problems;
}

function igniters(
  portals: readonly Portal[],
  elements: readonly Element[],
  registry: ValidationRegistry,
): Problem[] {
  const projectItems = new Set<string>(idsOfKind(elements, ITEM_KIND));
  for (const element of elements) {
    if (element.kind !== BLOCK_KIND) continue;
    const itemId = blockItemId(element);
    if (itemId !== undefined) projectItems.add(itemId);
  }
  const projectTags = idsOfKind(elements, ITEM_TAG_KIND);
  const problems: Problem[] = [];
  for (const { element, data } of portals) {
    const igniter = text(data.igniter);
    if (igniter === undefined) continue;
    const isTag = igniter.startsWith('#');
    const id = namespaced(isTag ? igniter.slice(1) : igniter);
    const found = isTag
      ? known(id, projectTags, registry, 'tag/item')
      : known(id, projectItems, registry, 'item');
    if (found) continue;
    problems.push({
      severity: 'error',
      code: 'blocks-items.portal-igniter-unknown',
      elementId: element.id,
      path: pointer('igniter'),
      message: `Igniter ${isTag ? 'tag' : 'item'} "${igniter}" is neither ${isTag ? 'an item tag of this project nor a vanilla item tag' : 'an item of this project nor a vanilla item'}, so nothing could light the portal. Pick an existing ${isTag ? 'tag' : 'item'}, or "Nothing" to light it with the light_portal action only.`,
    });
  }
  return problems;
}

/** The frame and igniter that decide which portal a click lights; `undefined` for `igniter: false`. */
function lightingKey(data: JsonObject): string | undefined {
  const frame = text(data.frame);
  if (frame === undefined || data.igniter === false) return undefined;
  const igniter = text(data.igniter) ?? DEFAULT_PORTAL_IGNITER;
  return `${normalised(frame)} ${normalised(igniter)}`;
}

function frameClashes(portals: readonly Portal[]): Problem[] {
  const first = new Map<string, string>();
  const problems: Problem[] = [];
  for (const { element, data } of portals) {
    const key = lightingKey(data);
    if (key === undefined) continue;
    const winner = first.get(key);
    if (winner === undefined) {
      first.set(key, element.id);
      continue;
    }
    problems.push({
      severity: 'warning',
      code: 'blocks-items.portal-frame-clash',
      elementId: element.id,
      path: pointer('frame'),
      message: `Portal "${winner}" has the same frame and igniter, and the game lights the first portal by id, so this one is never lit by its igniter. Use another frame or igniter, or light it with the light_portal action.`,
    });
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------
// Looks (ADR 0077 D1, D4)

function particleOptions(portals: readonly Portal[]): Problem[] {
  const problems: Problem[] = [];
  for (const { element, data } of portals) {
    const particles = record(data.particles);
    if (particles?.color === undefined) continue;
    const type = text(particles.type);
    if (type === undefined || namespaced(type) === DUST_PARTICLE) continue;
    problems.push({
      severity: 'error',
      code: 'blocks-items.portal-particle-options',
      elementId: element.id,
      path: pointer('particles', 'type'),
      message: `Only dust particles take a colour, so the colour cannot apply to "${type}". Remove the particle type (a colour alone gives coloured dust), set it to ${DUST_PARTICLE}, or remove the colour.`,
    });
  }
  return problems;
}

/** The project's sound event keys: `<ns>:<key>` for every key of a `minecraft:sounds` element. */
function projectSoundKeys(elements: readonly Element[]): Set<string> {
  const keys = new Set<string>();
  for (const element of elements) {
    if (element.kind !== SOUNDS_KIND || !isRecord(element.data)) continue;
    const colon = element.id.indexOf(':');
    const namespace = colon < 0 ? 'minecraft' : element.id.slice(0, colon);
    for (const key of Object.keys(element.data)) {
      if (key !== '') keys.add(`${namespace}:${key}`);
    }
  }
  return keys;
}

function portalSounds(
  portals: readonly Portal[],
  elements: readonly Element[],
  target: TargetFacts,
  registry: ValidationRegistry,
): Problem[] {
  const facts = target.blocks?.portal;
  if (facts === undefined || registry.ids(SOUND_EVENT_REGISTRY).length === 0) return [];
  const projectKeys = projectSoundKeys(elements);
  const soundKnown = (id: string): boolean =>
    projectKeys.has(id) ||
    registry.has(SOUND_EVENT_REGISTRY, id) ||
    registry.has(WEIGHED_SOUND_EVENT_REGISTRY, id);
  const defaults = { ambient: facts.ambientSound, travel: facts.travelSound } as const;
  const problems: Problem[] = [];
  for (const { element, data } of portals) {
    const sounds = record(data.sounds);
    for (const field of ['ambient', 'travel'] as const) {
      const sound = text(sounds?.[field]);
      if (sound === undefined || soundKnown(namespaced(sound))) continue;
      problems.push({
        severity: 'warning',
        code: 'blocks-items.portal-sound-unknown',
        elementId: element.id,
        path: pointer('sounds', field),
        message: `Sound "${sound}" is neither a vanilla sound event nor a sound of this project, so the portal plays nothing there. Pick an existing sound, or remove it for the portal's own ${field} sound (${defaults[field]}).`,
      });
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------
// Events and the light_portal action (ADR 0077 D3, D6)

function travelEvents(portals: readonly Portal[]): Problem[] {
  const problems: Problem[] = [];
  for (const { element, data } of portals) {
    const event = text(data.on_travel);
    if (event === undefined || record(data.events)?.[event] !== undefined) continue;
    problems.push({
      severity: 'error',
      code: 'blocks-items.portal-event-unknown',
      elementId: element.id,
      path: pointer('on_travel'),
      message: `Event "${event}" is not declared in this block's "events", so nothing runs when someone travels. Add it there or pick an existing event.`,
    });
  }
  return problems;
}

const ACTION_OWNERS: ReadonlySet<string> = new Set([BLOCK_KIND, ITEM_KIND, EFFECT_KIND]);

function lightPortalActions(elements: readonly Element[]): Problem[] {
  const portals = new Set(elements.filter(isPortalElement).map((element) => element.id as string));
  const problems: Problem[] = [];
  for (const element of elements) {
    if (!ACTION_OWNERS.has(element.kind)) continue;
    for (const [name, event] of Object.entries(record(dataOf(element).events) ?? {})) {
      const actions = record(event)?.actions;
      if (!Array.isArray(actions)) continue;
      actions.forEach((action, index) => {
        const fields = record(action);
        if (fields?.type !== LIGHT_PORTAL_ACTION) return;
        const portal = text(fields.portal);
        if (portal === undefined || portals.has(namespaced(portal))) return;
        problems.push({
          severity: 'error',
          code: 'blocks-items.light-portal-not-portal',
          elementId: element.id,
          path: pointer('events', name, 'actions', index, 'portal'),
          message: `"${portal}" is not a portal block of this project, so this action lights nothing (the game drops it with an error). Pick a block of type portal.`,
        });
      });
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------
// Components (ADR 0077 D1)

function portalComponents(portals: readonly Portal[]): Problem[] {
  const problems: Problem[] = [];
  for (const { element, data } of portals) {
    for (const key of Object.keys(record(data.components) ?? {})) {
      if (PORTAL_COMPONENTS.includes(key) || SHAPED_ONLY_COMPONENTS.includes(key)) continue;
      problems.push({
        severity: 'error',
        code: 'blocks-items.component-not-for-type',
        elementId: element.id,
        path: pointer('components', key),
        message: `A portal block cannot have "${key}": the game drops it with an error. A portal takes only ${PORTAL_COMPONENTS.map((name) => `"${name}"`).join(', ')}.`,
      });
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------

export const portalValidators: readonly ProjectValidator[] = Object.freeze([
  {
    id: 'msm.blocks-items.portals',
    kinds: [BLOCK_KIND, DIMENSION_KIND, BLOCK_TAG_KIND, ITEM_KIND, ITEM_TAG_KIND, SOUNDS_KIND],
    validate: ({ elements, target, registry }) => {
      const portals = portalsOf(elements);
      if (portals.length === 0) return [];
      return [
        ...destinations(portals, elements, registry),
        ...frames(portals, elements, registry),
        ...igniters(portals, elements, registry),
        ...frameClashes(portals),
        ...particleOptions(portals),
        ...portalSounds(portals, elements, target, registry),
        ...travelEvents(portals),
        ...portalComponents(portals),
      ];
    },
  },
  {
    id: 'msm.blocks-items.light-portal',
    kinds: [BLOCK_KIND, ITEM_KIND, EFFECT_KIND],
    validate: ({ elements }) => lightPortalActions(elements),
  },
] satisfies ProjectValidator[]);
