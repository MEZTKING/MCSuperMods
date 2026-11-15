/**
 * `controls.*` project validators of key binds (ADR 0088 D8) and HUD elements (ADR 0089 D9).
 * They read the element data, the target's control facts (`target.controls`, plugin API
 * 1.16.0) and the registry index (vanilla plus project ids).
 *
 * Key binds (`msm.controls.key-binds`):
 * - `controls.unknown-key` (error): a `default_key` that is not one of the target's key names
 *   (`controls.keyNames`); the runtime cannot bind it.
 * - `controls.vanilla-key-clash` (warning): a `default_key` a vanilla control uses by default,
 *   naming it. Vanilla's debug combinations (`controls.vanillaCombinations`, pressed with F3) do
 *   not clash.
 * - `controls.runtime-key-clash` (warning): a `default_key` of one of the runtime's own vehicle
 *   keys (`controls.runtimeKeys`), when the project has a vehicle (the runtime registers its keys
 *   only then).
 * - `controls.duplicate-key` (warning): two project key binds on the same default key.
 * - `controls.bad-category` (error): a `category` that is not a lower-case id path (letters,
 *   digits, `_`, `-`, `.`, `/`).
 * - `controls.name-conflict` (error): two key binds writing the same language key (a shared
 *   `name`, or a shared `category`) with different text, which the export cannot merge.
 * - `controls.unknown-event` (error): `msm:on_press`, `msm:on_release` or `msm:while_held`
 *   naming an event that is not in `events`.
 * - `controls.key-runs-function` (info): a key bind whose events run a function: every player
 *   gets a button for it (ADR 0088 D7 rule 5).
 * - `controls.vehicle-without-when` (error): `vehicle` without `when` `in_vehicle` or
 *   `driving`.
 *
 * HUD elements (`msm.controls.hud`):
 * - `controls.vehicle-without-show` (error): `vehicle` without `show` `in_vehicle` or `driving`.
 * - `controls.icons-need-icon` (error): an `icons` element without `icon`.
 * - `controls.bad-color` (error): `color`, `fill_color` or `back_color` not `#rrggbb`.
 * - `controls.field-not-for-type` (warning): a field another type reads (`text` on a bar,
 *   `fill_color` on text, `max` on text and so on); it is not used.
 * - `controls.unknown-objective` (info): a `score` value whose objective no project file
 *   creates (`scoreboard objectives add <name>` in a function, script or any other text). The
 *   validator re-runs when a HUD element or vehicle changes, not on every function edit.
 *
 * Both:
 * - `controls.unknown-vehicle` (error): `vehicle` naming a known entity type that is not one of
 *   the project's vehicles (an id nobody knows is the schema's `schema.unknown-id`).
 *
 * References (`msm.controls.hud-references`):
 * - `controls.unknown-hud` (error): a `show_hud`, `hide_hud` or `set_hud` action in any
 *   element's events naming no HUD element of the project.
 *
 * The three key checks against target facts (`unknown-key`, `vanilla-key-clash`,
 * `runtime-key-clash`) are skipped for a target without control facts. A value of the wrong
 * JSON type is the schema's problem and not reported again. Missing sprites are reported by the
 * host, which can see the project's files (`hudSpritePath`).
 */
import type {
  ControlFacts,
  Element,
  Json,
  JsonObject,
  Problem,
  ProjectValidator,
  ValidationRegistry,
} from '@msm/plugin-api';
import { HUD_KIND, KEY_BIND_KIND, VEHICLE_KIND } from './kinds';
import { keyBindNameKey, keyCategoryKey } from './lowering/key-bind';
import { isRecord, splitResourceLocation } from './lowering/paths';

/** Every code the validators of this plugin report. */
export const CONTROLS_PROBLEM_CODES = Object.freeze([
  'controls.unknown-key',
  'controls.vanilla-key-clash',
  'controls.runtime-key-clash',
  'controls.duplicate-key',
  'controls.bad-category',
  'controls.name-conflict',
  'controls.unknown-event',
  'controls.key-runs-function',
  'controls.vehicle-without-when',
  'controls.vehicle-without-show',
  'controls.unknown-vehicle',
  'controls.icons-need-icon',
  'controls.bad-color',
  'controls.field-not-for-type',
  'controls.unknown-objective',
  'controls.unknown-hud',
] as const);

/** A code of {@link CONTROLS_PROBLEM_CODES}. */
export type ControlsProblemCode = (typeof CONTROLS_PROBLEM_CODES)[number];

/** The three key bind triggers, each naming an event in `events` (ADR 0088 D3). */
export const KEY_BIND_TRIGGERS = ['msm:on_press', 'msm:on_release', 'msm:while_held'] as const;
/** The actions that name a HUD element (ADR 0089 D6). */
export const HUD_ACTIONS = ['show_hud', 'hide_hud', 'set_hud'] as const;

/** Fields each HUD type reads; a field of another type is `controls.field-not-for-type`. */
export const HUD_TYPE_FIELDS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  text: ['text', 'color', 'shadow'],
  bar: ['max', 'size', 'fill_color', 'back_color', 'sprite', 'back_sprite'],
  icons: ['max', 'icon', 'half_icon', 'empty_icon', 'per_icon'],
});

const TYPE_LABELS: Readonly<Record<string, { one: string; many: string }>> = {
  text: { one: 'this text', many: 'text' },
  bar: { one: 'this bar', many: 'bars' },
  icons: { one: 'this row of icons', many: 'rows of icons' },
};
/** `bars and rows of icons`: the types that read `field`. */
const fieldUsers = (field: string): string =>
  Object.entries(HUD_TYPE_FIELDS)
    .filter(([, fields]) => fields.includes(field))
    .map(([type]) => TYPE_LABELS[type]?.many ?? type)
    .join(' and ');
const VEHICLE_CONDITIONS: ReadonlySet<string> = new Set(['in_vehicle', 'driving']);
const CATEGORY_PATTERN = /^[a-z0-9_.-]+(\/[a-z0-9_.-]+)*$/;
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const COLOR_FIELDS = ['color', 'fill_color', 'back_color'] as const;
const OBJECTIVE_PATTERN = /scoreboard\s+objectives\s+add\s+(\S+)/g;
const RUN_FUNCTION = 'run_function';

const token = (key: string): string => key.replaceAll('~', '~0').replaceAll('/', '~1');
const pointer = (...keys: (string | number)[]): string =>
  keys.map((key) => `/${token(String(key))}`).join('');
const dataOf = (element: Element): JsonObject => (isRecord(element.data) ? element.data : {});
const text = (value: Json | undefined): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;
const namespaced = (id: string): string => (id.includes(':') ? id : `minecraft:${id}`);
const quoted = (values: readonly string[]): string => values.map((v) => `"${v}"`).join(', ');
/** `key.keyboard.left.alt` reads as `left alt`. */
const keyLabel = (key: string): string =>
  key.replace(/^key\.(keyboard|mouse)\./, '').replaceAll('.', ' ');

const ofKind = (elements: readonly Element[], kind: string): Element[] =>
  elements.filter((element) => element.kind === kind);

/** Every action of `data.events`, with its pointer. */
function eventActions(data: JsonObject): { action: JsonObject; path: string }[] {
  const found: { action: JsonObject; path: string }[] = [];
  const events = data.events;
  if (!isRecord(events)) return found;
  for (const [name, event] of Object.entries(events)) {
    const actions = isRecord(event) ? event.actions : undefined;
    if (!Array.isArray(actions)) continue;
    actions.forEach((action, index) => {
      if (isRecord(action)) {
        found.push({ action, path: pointer('events', name, 'actions', index) });
      }
    });
  }
  return found;
}

// ---------------------------------------------------------------------------------------------
// Vehicles named by key binds and HUD elements

function vehicleProblems(
  element: Element,
  conditionField: 'when' | 'show',
  vehicles: ReadonlySet<string>,
  registry: ValidationRegistry,
): Problem[] {
  const data = dataOf(element);
  const vehicle = text(data.vehicle);
  if (vehicle === undefined) return [];
  const problems: Problem[] = [];
  const condition = data[conditionField];
  if (typeof condition !== 'string' || !VEHICLE_CONDITIONS.has(condition)) {
    const isKey = conditionField === 'when';
    problems.push({
      severity: 'error',
      code: isKey ? 'controls.vehicle-without-when' : 'controls.vehicle-without-show',
      elementId: element.id,
      path: pointer('vehicle'),
      message: isKey
        ? `A vehicle only counts when the key works "in a vehicle" or "while driving", so the game ignores it now. Set "when" to "in_vehicle" or "driving", or remove the vehicle.`
        : `A vehicle only counts when the element shows "in a vehicle" or "while driving", so the game ignores it now. Set "show" to "in_vehicle" or "driving", or remove the vehicle.`,
    });
  }
  const id = namespaced(vehicle);
  if (!vehicles.has(id) && registry.has('entity_type', id)) {
    problems.push({
      severity: 'error',
      code: 'controls.unknown-vehicle',
      elementId: element.id,
      path: pointer('vehicle'),
      message: `"${vehicle}" is not one of this project's vehicles, so this never matches. Pick a vehicle made in this project, or remove it to mean any vehicle.`,
    });
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------
// Key binds (ADR 0088 D8)

function keyFactProblems(
  element: Element,
  key: string,
  controls: ControlFacts,
  hasVehicle: boolean,
): Problem[] {
  if (!controls.keyNames.includes(key)) {
    return [
      {
        severity: 'error',
        code: 'controls.unknown-key',
        elementId: element.id,
        path: pointer('default_key'),
        message: `"${key}" is not a key the game knows, so the key cannot be bound. Use a name such as "key.keyboard.k" or "key.mouse.4", or press the key in the Key bind Studio.`,
      },
    ];
  }
  if (key === controls.unboundKey) return [];
  const problems: Problem[] = [];
  const combinations = new Set(controls.vanillaCombinations);
  const clashes = Object.entries(controls.vanillaKeys)
    .filter(([control, bound]) => bound === key && !combinations.has(control))
    .map(([control]) => control)
    .sort();
  if (clashes.length > 0) {
    problems.push({
      severity: 'warning',
      code: 'controls.vanilla-key-clash',
      elementId: element.id,
      path: pointer('default_key'),
      message: `The ${keyLabel(key)} key already does something in Minecraft (${quoted(clashes)}), so pressing it does both. Pick a free key; players can still change it in Controls.`,
    });
  }
  if (hasVehicle) {
    const runtime = Object.entries(controls.runtimeKeys)
      .filter(([, bound]) => bound === key)
      .map(([name]) => name)
      .sort();
    if (runtime.length > 0) {
      problems.push({
        severity: 'warning',
        code: 'controls.runtime-key-clash',
        elementId: element.id,
        path: pointer('default_key'),
        message: `The ${keyLabel(key)} key is also the vehicles' ${runtime.join(' and ')} key, so pressing it in a vehicle does both. Pick another key.`,
      });
    }
  }
  return problems;
}

function duplicateKeys(keyBinds: readonly Element[], unbound: string | undefined): Problem[] {
  const byKey = new Map<string, Element[]>();
  for (const element of keyBinds) {
    const key = text(dataOf(element).default_key);
    if (key === undefined || key === unbound || key === 'key.keyboard.unknown') continue;
    byKey.set(key, [...(byKey.get(key) ?? []), element]);
  }
  const problems: Problem[] = [];
  for (const [key, elements] of byKey) {
    if (elements.length < 2) continue;
    for (const element of elements) {
      const others = elements.filter((other) => other !== element).map((other) => other.id);
      problems.push({
        severity: 'warning',
        code: 'controls.duplicate-key',
        elementId: element.id,
        path: pointer('default_key'),
        message: `${quoted(others)} also uses the ${keyLabel(key)} key, so one press fires both. Give each key bind its own key.`,
      });
    }
  }
  return problems;
}

/** The language entries of a key bind with the field each comes from; none for an unsafe id. */
function langUses(element: Element): { key: string; value: string; field: string }[] {
  const data = dataOf(element);
  try {
    const { namespace } = splitResourceLocation(element.id);
    const uses: { key: string; value: string; field: string }[] = [];
    const displayName = text(data.display_name);
    if (displayName !== undefined) {
      const key = keyBindNameKey(element.id, text(data.name));
      uses.push({ key, value: displayName, field: 'display_name' });
    }
    const categoryName = text(data.category_name);
    if (categoryName !== undefined) {
      const key = keyCategoryKey(namespace, text(data.category));
      uses.push({ key, value: categoryName, field: 'category_name' });
    }
    return uses;
  } catch {
    return [];
  }
}

function nameConflicts(keyBinds: readonly Element[]): Problem[] {
  const byKey = new Map<string, { element: Element; value: string; field: string }[]>();
  for (const element of keyBinds) {
    for (const { key, value, field } of langUses(element)) {
      byKey.set(key, [...(byKey.get(key) ?? []), { element, value, field }]);
    }
  }
  const problems: Problem[] = [];
  for (const [key, uses] of byKey) {
    if (new Set(uses.map((use) => use.value)).size < 2) continue;
    for (const use of uses) {
      const others = uses
        .filter((other) => other.element !== use.element && other.value !== use.value)
        .map((other) => `"${other.value}" (${other.element.id})`);
      problems.push({
        severity: 'error',
        code: 'controls.name-conflict',
        elementId: use.element.id,
        path: pointer(use.field),
        message: `This name "${use.value}" goes in the language key "${key}", which ${others.join(', ')} also writes, so the export cannot choose. Use the same text in both, or a different ${use.field === 'category_name' ? 'category' : 'name'}.`,
      });
    }
  }
  return problems;
}

function eventProblems(element: Element): Problem[] {
  const data = dataOf(element);
  const events = isRecord(data.events) ? data.events : {};
  const problems: Problem[] = [];
  for (const trigger of KEY_BIND_TRIGGERS) {
    const name = text(data[trigger]);
    if (name === undefined || Object.hasOwn(events, name)) continue;
    problems.push({
      severity: 'error',
      code: 'controls.unknown-event',
      elementId: element.id,
      path: pointer(trigger),
      message: `There is no event "${name}" in this key bind's events, so pressing the key does nothing. Add the event, or pick one of its events.`,
    });
  }
  const runsFunction = eventActions(data).find(({ action }) => action.type === RUN_FUNCTION);
  if (runsFunction !== undefined) {
    problems.push({
      severity: 'info',
      code: 'controls.key-runs-function',
      elementId: element.id,
      path: runsFunction.path,
      message:
        'Every player can press this key as often as the cooldown allows, so it is a button for this function. Make sure the function is safe to run that way.',
    });
  }
  return problems;
}

function keyBindProblems(
  element: Element,
  controls: ControlFacts | undefined,
  hasVehicle: boolean,
  vehicles: ReadonlySet<string>,
  registry: ValidationRegistry,
): Problem[] {
  const data = dataOf(element);
  const problems: Problem[] = [];
  const key = text(data.default_key);
  if (key !== undefined && controls !== undefined) {
    problems.push(...keyFactProblems(element, key, controls, hasVehicle));
  }
  const category = data.category;
  if (typeof category === 'string' && !CATEGORY_PATTERN.test(category)) {
    problems.push({
      severity: 'error',
      code: 'controls.bad-category',
      elementId: element.id,
      path: pointer('category'),
      message: `"${category}" cannot be a Controls group id: use lower-case letters, digits and _ - . / only, such as "abilities".`,
    });
  }
  problems.push(...eventProblems(element));
  problems.push(...vehicleProblems(element, 'when', vehicles, registry));
  return problems;
}

// ---------------------------------------------------------------------------------------------
// HUD elements (ADR 0089 D9)

/** The objectives that `scoreboard objectives add` creates anywhere in the project's text. */
function createdObjectives(elements: readonly Element[]): Set<string> {
  const found = new Set<string>();
  const visit = (value: Json | undefined): void => {
    if (typeof value === 'string') {
      for (const match of value.matchAll(OBJECTIVE_PATTERN)) {
        if (match[1] !== undefined) found.add(match[1]);
      }
    } else if (Array.isArray(value)) {
      for (const entry of value) visit(entry);
    } else if (isRecord(value)) {
      for (const entry of Object.values(value)) visit(entry);
    }
  };
  for (const element of elements) visit(element.data);
  return found;
}

function hudProblems(
  element: Element,
  objectives: ReadonlySet<string>,
  vehicles: ReadonlySet<string>,
  registry: ValidationRegistry,
): Problem[] {
  const data = dataOf(element);
  const problems: Problem[] = [...vehicleProblems(element, 'show', vehicles, registry)];
  const type = data.type;
  if (type === 'icons' && text(data.icon) === undefined) {
    problems.push({
      severity: 'error',
      code: 'controls.icons-need-icon',
      elementId: element.id,
      path: pointer('type'),
      message:
        'A row of icons needs a picture for a full icon, so nothing is drawn now. Pick an icon sprite, or make it a bar.',
    });
  }
  for (const field of COLOR_FIELDS) {
    const value = data[field];
    if (typeof value !== 'string' || COLOR_PATTERN.test(value)) continue;
    problems.push({
      severity: 'error',
      code: 'controls.bad-color',
      elementId: element.id,
      path: pointer(field),
      message: `"${value}" is not a colour the game can read. Write it as # and six hex digits, such as "#e0c040".`,
    });
  }
  if (typeof type === 'string' && HUD_TYPE_FIELDS[type] !== undefined) {
    const own = new Set(HUD_TYPE_FIELDS[type]);
    const reported = new Set<string>();
    for (const [other, fields] of Object.entries(HUD_TYPE_FIELDS)) {
      if (other === type) continue;
      for (const field of fields) {
        if (own.has(field) || reported.has(field) || data[field] === undefined) continue;
        reported.add(field);
        problems.push({
          severity: 'warning',
          code: 'controls.field-not-for-type',
          elementId: element.id,
          path: pointer(field),
          message: `"${field}" is only used by ${fieldUsers(field)}, so ${TYPE_LABELS[type]?.one ?? 'this element'} ignores it. Remove it, or change the type.`,
        });
      }
    }
  }
  const scored: { value: Json | undefined; path: string[] }[] = [
    { value: data.value, path: ['value'] },
    { value: data.max, path: ['max'] },
  ];
  for (const { value, path } of scored) {
    if (!isRecord(value) || value.source !== 'score') continue;
    const objective = text(value.objective);
    if (objective === undefined || objectives.has(objective)) continue;
    problems.push({
      severity: 'info',
      code: 'controls.unknown-objective',
      elementId: element.id,
      path: pointer(...path, 'objective'),
      message: `No function or script of this project creates the scoreboard objective "${objective}", so this shows nothing until something does. Add "scoreboard objectives add ${objective} dummy" to a load function.`,
    });
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------
// HUD references in events (ADR 0089 D6)

function hudReferences(elements: readonly Element[]): Problem[] {
  const huds = new Set(ofKind(elements, HUD_KIND).map((element) => element.id as string));
  const problems: Problem[] = [];
  const actions = new Set<string>(HUD_ACTIONS);
  for (const element of elements) {
    for (const { action, path } of eventActions(dataOf(element))) {
      if (typeof action.type !== 'string' || !actions.has(action.type)) continue;
      const hud = text(action.hud);
      if (hud === undefined || huds.has(hud) || huds.has(namespaced(hud))) continue;
      problems.push({
        severity: 'error',
        code: 'controls.unknown-hud',
        elementId: element.id,
        path: `${path}/hud`,
        message: `"${hud}" is not a HUD element of this project, so this step does nothing. Pick one of the project's HUD elements.`,
      });
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------
// Validators

const vehicleIds = (elements: readonly Element[]): Set<string> =>
  new Set(ofKind(elements, VEHICLE_KIND).map((element) => element.id as string));

/** Key bind checks (ADR 0088 D8). */
export const keyBindValidator: ProjectValidator = {
  id: 'msm.controls.key-binds',
  kinds: [KEY_BIND_KIND, VEHICLE_KIND],
  validate: ({ elements, target, registry }) => {
    const keyBinds = ofKind(elements, KEY_BIND_KIND);
    if (keyBinds.length === 0) return [];
    const vehicles = vehicleIds(elements);
    const controls = target.controls;
    return [
      ...keyBinds.flatMap((element) =>
        keyBindProblems(element, controls, vehicles.size > 0, vehicles, registry),
      ),
      ...duplicateKeys(keyBinds, controls?.unboundKey),
      ...nameConflicts(keyBinds),
    ];
  },
};

/** HUD element checks (ADR 0089 D9). */
export const hudValidator: ProjectValidator = {
  id: 'msm.controls.hud',
  kinds: [HUD_KIND, VEHICLE_KIND],
  validate: ({ elements, registry }) => {
    const huds = ofKind(elements, HUD_KIND);
    if (huds.length === 0) return [];
    const objectives = createdObjectives(elements);
    const vehicles = vehicleIds(elements);
    return huds.flatMap((element) => hudProblems(element, objectives, vehicles, registry));
  },
};

/** `show_hud`, `hide_hud` and `set_hud` steps naming a project HUD element (ADR 0089 D6). */
export const hudReferenceValidator: ProjectValidator = {
  id: 'msm.controls.hud-references',
  kinds: [
    HUD_KIND,
    KEY_BIND_KIND,
    VEHICLE_KIND,
    'msm:block',
    'msm:item',
    'msm:entity',
    'msm:effect',
  ],
  validate: ({ elements }) => hudReferences(elements),
};

/** Every validator this plugin contributes, in order. */
export const controlsValidators: readonly ProjectValidator[] = Object.freeze([
  keyBindValidator,
  hudValidator,
  hudReferenceValidator,
]);
