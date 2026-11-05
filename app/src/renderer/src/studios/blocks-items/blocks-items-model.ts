/**
 * Pure helpers of the Block and Item Studios (B97): the action table of MSM definition
 * format v1 (ADR 0025 D4), event lists, renaming an event with its references, and schema
 * choices. No React, no session.
 *
 * The action table is a fact of the MSM format, which is version-independent (it lives in
 * `@msm/schemas`, not in a target); vanilla choices (sound types, tiers, tools, rarities) are
 * read from the schema.
 *
 * @packageDocumentation
 */

import type { Element, Json, Project } from '@msm/core';
import type { SchemaNode } from '@msm/schemas';
import { childPointer, isJsonObject } from '../../forms/pointer';
import { fieldNode, stringChoices } from '../structures/pickers';

type JsonObject = { [key: string]: Json };

/** The kind ids the Studios edit. */
export const BLOCK_KIND = 'msm:block';
export const ITEM_KIND = 'msm:item';
/** The kind id of custom entities (the Entity Studio, ADR 0028), which share the events editor. */
export const ENTITY_KIND = 'msm:entity';
/** The kind id a model id may name in the project (go to definition). */
export const MODEL_KIND = 'minecraft:model';

/** The object at `value`, or an empty one. */
export function asObject(value: Json | undefined): JsonObject {
  return isJsonObject(value) ? value : {};
}

/** The pointer of `path` (keys and indices) from the element root. */
export function pointerOf(path: readonly (string | number)[]): string {
  return path.reduce<string>((pointer, key) => childPointer(pointer, key), '');
}

/** One field of an action. */
export interface ActionField {
  key: string;
  label: string;
  /**
   * `id`: a registry id (with {@link registry}); `text`: free text; `int`/`float`: a number;
   * `offset`: three integers; `event`: an event of the same element; `animation`: an
   * animation name offered by the host (the entity's animation set); `handler`: a script
   * handler id (`msm.actions.define`), offered from the project's scripts or typed.
   */
  type: 'id' | 'text' | 'int' | 'float' | 'offset' | 'event' | 'animation' | 'handler';
  /** The registry suggestions come from, for `id` fields. */
  registry?: string;
  /** Whether the field must be set. */
  required: boolean;
  /** The value the runtime uses when the field is absent (ADR 0025 D4). */
  defaultValue?: Json;
}

/** One action type of format v1. */
export interface ActionSpec {
  type: string;
  label: string;
  fields: readonly ActionField[];
}

/**
 * The actions of format v1 with their fields and defaults: the six of ADR 0025 D4 plus
 * `run_script` (ADR 0032 D4), which calls a handler a script defines.
 */
export const ACTIONS: readonly ActionSpec[] = Object.freeze([
  {
    type: 'play_sound',
    label: 'Play sound',
    fields: [
      { key: 'sound', label: 'Sound', type: 'id', registry: 'sound_event', required: true },
      { key: 'volume', label: 'Volume', type: 'float', required: false, defaultValue: 1 },
      { key: 'pitch', label: 'Pitch', type: 'float', required: false, defaultValue: 1 },
    ],
  },
  {
    type: 'spawn_particle',
    label: 'Spawn particle',
    fields: [
      {
        key: 'particle',
        label: 'Particle',
        type: 'id',
        registry: 'particle_type',
        required: true,
      },
      { key: 'count', label: 'Count', type: 'int', required: false, defaultValue: 1 },
      { key: 'spread', label: 'Spread', type: 'float', required: false, defaultValue: 0 },
      { key: 'speed', label: 'Speed', type: 'float', required: false, defaultValue: 0 },
    ],
  },
  {
    type: 'run_function',
    label: 'Run function',
    fields: [
      { key: 'function', label: 'Function', type: 'id', registry: 'function', required: true },
    ],
  },
  {
    type: 'set_block_state',
    label: 'Set block state',
    fields: [
      { key: 'state', label: 'Block state', type: 'text', required: true },
      { key: 'offset', label: 'Offset', type: 'offset', required: false, defaultValue: [0, 0, 0] },
    ],
  },
  {
    type: 'give_item',
    label: 'Give item',
    fields: [
      { key: 'item', label: 'Item', type: 'id', registry: 'item', required: true },
      { key: 'count', label: 'Count', type: 'int', required: false, defaultValue: 1 },
    ],
  },
  {
    type: 'trigger_event',
    label: 'Trigger event',
    fields: [{ key: 'event', label: 'Event', type: 'event', required: true }],
  },
  {
    type: 'run_script',
    label: 'Run script',
    fields: [{ key: 'handler', label: 'Handler', type: 'handler', required: true }],
  },
] satisfies ActionSpec[]);

/** `play_animation` (ADR 0028), which only entity events may use. */
export const PLAY_ANIMATION_ACTION: ActionSpec = Object.freeze({
  type: 'play_animation',
  label: 'Play animation',
  fields: [
    { key: 'animation', label: 'Animation', type: 'animation', required: true },
    { key: 'controller', label: 'Controller', type: 'text', required: false },
  ],
} satisfies ActionSpec);

/** The actions entity events offer: those of format v1 plus `play_animation`. */
export const ENTITY_ACTIONS: readonly ActionSpec[] = Object.freeze([
  ...ACTIONS,
  PLAY_ANIMATION_ACTION,
]);

/** The actions an element of `kind` offers. */
export function actionsFor(kind: string): readonly ActionSpec[] {
  return kind === ENTITY_KIND ? ENTITY_ACTIONS : ACTIONS;
}

/** The spec of action `type` among `actions`, or `undefined` for an unknown type. */
export function actionSpec(
  type: Json | undefined,
  actions: readonly ActionSpec[] = ENTITY_ACTIONS,
): ActionSpec | undefined {
  return actions.find((spec) => spec.type === type);
}

/**
 * A new action of `type`: the type and its required fields (ids empty for the user to fill;
 * a `trigger_event` takes the first of `events` other than `ownEvent`). Optional fields stay
 * absent, so the runtime defaults apply.
 */
export function newAction(type: string, events: readonly string[], ownEvent?: string): JsonObject {
  const spec = actionSpec(type);
  const action: JsonObject = { type };
  for (const field of spec?.fields ?? []) {
    if (!field.required) continue;
    action[field.key] =
      field.type === 'event' ? (events.find((name) => name !== ownEvent) ?? '') : '';
  }
  return action;
}

/** The event ids declared in `data.events`, in declaration order. */
export function eventNames(data: Json | undefined): string[] {
  return Object.keys(asObject(asObject(data).events));
}

/** The actions of event `name`, or `[]`. */
export function eventActions(data: Json | undefined, name: string): Json[] {
  const actions = asObject(asObject(asObject(data).events)[name]).actions;
  return Array.isArray(actions) ? actions : [];
}

/** The trigger fields that name an event, per kind: `[component, field]`. */
export const EVENT_FIELDS: Readonly<Record<string, readonly (readonly [string, string])[]>> =
  Object.freeze({
    [BLOCK_KIND]: [
      ['msm:on_interact', 'event'],
      ['msm:on_step', 'event'],
      ['msm:redstone', 'on_powered'],
      ['msm:redstone', 'on_unpowered'],
    ],
    [ITEM_KIND]: [['msm:on_use', 'event']],
    [ENTITY_KIND]: [
      ['msm:on_hurt', 'event'],
      ['msm:on_death', 'event'],
      ['msm:on_interact', 'event'],
      ['msm:attack', 'on_attack'],
    ],
  });

/**
 * `data` with event `from` renamed to `to`, keeping its position, and every reference to it
 * (trigger component fields of `kind` and `trigger_event` actions) rewritten.
 *
 * @throws Error If `from` is not declared, or `to` is empty or already declared.
 */
export function renameEvent(data: Json, kind: string, from: string, to: string): JsonObject {
  const root = asObject(data);
  const events = asObject(root.events);
  if (!Object.hasOwn(events, from)) throw new Error(`No event "${from}".`);
  if (to === '') throw new Error('An event id cannot be empty.');
  if (to !== from && Object.hasOwn(events, to)) throw new Error(`Event "${to}" already exists.`);
  const renamedEvents: JsonObject = {};
  for (const [name, event] of Object.entries(events)) {
    const object = asObject(event);
    const actions = Array.isArray(object.actions)
      ? object.actions.map((action) =>
          isJsonObject(action) && action.type === 'trigger_event' && action.event === from
            ? { ...action, event: to }
            : action,
        )
      : object.actions;
    const nextEvent: Json = isJsonObject(event)
      ? actions === undefined
        ? event
        : { ...event, actions }
      : event;
    renamedEvents[name === from ? to : name] = nextEvent;
  }
  const components = isJsonObject(root.components) ? { ...root.components } : undefined;
  if (components !== undefined) {
    for (const [component, field] of EVENT_FIELDS[kind] ?? []) {
      const value = components[component];
      if (isJsonObject(value) && value[field] === from) {
        components[component] = { ...value, [field]: to };
      }
    }
  }
  return {
    ...root,
    events: renamedEvents,
    ...(components === undefined ? {} : { components }),
  };
}

/** `list` with the entry at `from` moved to `to`. */
export function moved<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [entry] = next.splice(from, 1);
  if (entry !== undefined) next.splice(to, 0, entry);
  return next;
}

/**
 * The string choices (enum values) of the field at `path` under `node`, following `value`
 * through the struct fields; `[]` when the schema has no such field.
 */
export function choicesAt(
  node: SchemaNode | undefined,
  value: Json | undefined,
  path: readonly string[],
): string[] {
  let current: SchemaNode | undefined = node;
  let currentValue: Json | undefined = value;
  for (const key of path) {
    current = fieldNode(current, currentValue, key);
    currentValue = asObject(currentValue)[key];
    if (current === undefined) return [];
  }
  return stringChoices(current);
}

/** The project element with id `id` and kind `kind`, or `undefined`. */
export function findElement(project: Project, id: string, kind: string): Element | undefined {
  for (const namespace of project.namespaces) {
    const found = namespace.elements.find((entry) => entry.id === id && entry.kind === kind);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** A suggested id for a new event of `elementId`: `<id>_event`, `<id>_event_2`, … */
export function suggestEventId(elementId: string, existing: readonly string[]): string {
  const base = `${elementId}_event`;
  if (!existing.includes(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}_${n}`;
    if (!existing.includes(candidate)) return candidate;
  }
}

/** The `onChange` of a Studio. */
export type StudioChange = (
  pointer: string,
  value: Json | undefined,
  options?: { coalesce?: string },
) => void;

/**
 * A setter over element paths: sets `value` at `path` (the core command creates absent
 * parents), and removes the key only when it exists, so a clear never adds an empty undo
 * step. `coalesce` merges typing into one undo step.
 */
export function pathSetter(data: Json, onChange: StudioChange) {
  return (path: readonly (string | number)[], value: Json | undefined, coalesce?: string) => {
    const pointer = pointerOf(path);
    const options = coalesce === undefined ? undefined : { coalesce };
    if (value === undefined) {
      let current: Json | undefined = data;
      for (const key of path) {
        current = isJsonObject(current) ? current[String(key)] : undefined;
        if (current === undefined) return;
      }
      onChange(pointer, undefined, options);
      return;
    }
    onChange(pointer, value, options);
  };
}
