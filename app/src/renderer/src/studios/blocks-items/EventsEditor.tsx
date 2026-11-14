/**
 * The events editor shared by the Block, Item and Entity Studios (B97, B118): add, rename and
 * remove events, and edit each event's ordered action list (add, remove, reorder, change type,
 * and the fields of the format v1 actions with their ADR 0025 D4 defaults, including
 * `run_script` with its handler picked from the project's scripts or typed, ADR 0032 D4, and
 * `apply_effect` with its mob effect, seconds, amplifier and target, ADR 0044 D2, the
 * project's own effects offered first; "Hurt" (`damage`) and "Heal" (`heal`), ADR 0055 D4;
 * entity events also offer `play_animation`, ADR 0028; every element offers "Light a portal"
 * (`light_portal`, ADR 0077 D3, ADR 0078 D1) with the project's portals to pick from, or a
 * block id typed when the Studio gives none). "Spawn particle" (ADR 0081 D2) has a "Kind" (a
 * particle, coloured dust, block pieces or item pieces; ADR 0080 D5 options objects) with the
 * matching fields, "Motion" and "Show from far away", and its particle picker lists the
 * project's particles first. Action types are listed by label with their format id.
 *
 * Renaming rewrites the references in trigger components and `trigger_event` actions in one
 * edit (one undo step); removing an event leaves its references, which the
 * `blocks-items.unknown-event` validator then reports.
 *
 * Rules (ADR 0082 D7 (c)): given the project and target, the editor lists the events the
 * project's rules make on this thing under "From rules", read-only, with a link to their rule
 * book, and offers "Turn into rules" on a hand-made event whose actions all map to rule steps
 * (one undo step through the host's `applyChanges`: the rules are added, the event removed and
 * its trigger left to the rules).
 *
 * @packageDocumentation
 */

import type { Element, Json, Project } from '@msm/core';
import type { TargetFacts } from '@msm/plugin-api';
import { triggerById } from '@msm/plugin-rules';
import { ArrowDown, ArrowUp, ExternalLink, ListChecks, Plus, X } from 'lucide-react';
import { type ReactNode, useId, useMemo, useState } from 'react';
import { Button, iconButtonClass } from '../../components/ui/Button';
import {
  type ChangeOptions,
  type FormProblem,
  IdInput,
  inputClass,
  isWithin,
  ProblemList,
} from '../../forms';
import { typingKey } from '../../forms/context';
import { isJsonObject } from '../../forms/pointer';
import type { RuleEventEntry } from '../../session/rules-view';
import { planTurnIntoRules, subjectRules } from '../rules/turn-into-rules';
import { useStructureStudioHost } from '../structures/host';
import { IdField, NumberField, SelectField } from '../structures/pickers';
import { ColourField } from '../worldgen/ColourField';
import { Section } from '../worldgen/parts';
import {
  type ActionField,
  type ActionSpec,
  actionSpec,
  actionsFor,
  asObject,
  eventActions,
  eventNames,
  moved,
  newAction,
  pointerOf,
  renameEvent,
  suggestEventId,
  withProjectIds,
} from './blocks-items-model';
import { useBlocksItemsStudioHost } from './host';
import {
  blockPiecesId,
  DEFAULT_DUST_SCALE,
  itemPiecesId,
  motionWith,
  PARTICLE_SPEC_KIND_LABELS,
  PARTICLE_SPEC_KINDS,
  type ParticleSpecKind,
  particleSpecFor,
  particleSpecKind,
  particlesFirst,
  withItemPieces,
  withOption,
} from './particle-model';
import { CheckField, EventSelect } from './parts';
import { LIGHT_PORTAL_ACTION, newLightPortalAction } from './portal-model';

/** The action type that spawns particles (ADR 0025 D4, ADR 0080 D5). */
const SPAWN_PARTICLE = 'spawn_particle';

const offsetAxes = ['X', 'Y', 'Z'] as const;

/** A select over values shown by their labels; a value outside them is kept as an option. */
export function LabelledChoice(props: {
  label: string;
  value: string;
  labels: Readonly<Record<string, string>>;
  order: readonly string[];
  testId?: string;
  onChange(value: string): void;
}) {
  const id = useId();
  const options = props.order.includes(props.value) ? props.order : [props.value, ...props.order];
  return (
    <div className="flex min-w-0 flex-col gap-0.5 text-xs">
      <label htmlFor={id} className="text-muted">
        {props.label}
      </label>
      <select
        id={id}
        className={inputClass}
        data-testid={props.testId}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {props.labels[option] ?? option}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * A particle to spawn (ADR 0080 D5, ADR 0081 D2): "Kind" and the kind's fields: a particle
 * type id (project particles first in `suggest`), dust's colour and size, a block or an item.
 * Every change replaces the whole value in one edit; another options object is left to
 * Advanced.
 */
export function ParticleSpecField(props: {
  label: string;
  value: Json | undefined;
  suggest(registry: string, prefix: string): string[];
  /** Replaces the value (`coalesce` merges typing). */
  onChange(value: Json, coalesce?: string): void;
  /** The value's pointer in the element, for coalescing typing. */
  pointer: string;
  /** Prefix of the fields' test ids, for example `spawn-particle`. */
  testId: string;
}) {
  const { label, value, onChange, testId, pointer } = props;
  const kind = particleSpecKind(value);
  return (
    <>
      <LabelledChoice
        label={`${label} kind`}
        value={kind}
        labels={PARTICLE_SPEC_KIND_LABELS}
        order={PARTICLE_SPEC_KINDS}
        testId={`${testId}-kind`}
        onChange={(next) => {
          if (next === kind || next === 'other') return;
          onChange(particleSpecFor(next as Exclude<ParticleSpecKind, 'other'>));
        }}
      />
      {kind === 'particle' && (
        <IdField
          label={label}
          value={typeof value === 'string' ? value : ''}
          registry="particle_type"
          suggest={props.suggest}
          className="min-w-48"
          testId={`${testId}-id`}
          onCommit={(text) => onChange(text)}
        />
      )}
      {kind === 'dust' && (
        <>
          <ColourField
            label={`${label} colour`}
            value={isJsonObject(value) ? value.color : undefined}
            testId={`${testId}-dust-colour`}
            onChange={(colour) => {
              if (colour !== undefined)
                onChange(withOption(value, 'color', colour), typingKey(`${pointer}/color`));
            }}
          />
          <NumberField
            label={`${label} size`}
            value={isJsonObject(value) ? (value.scale ?? DEFAULT_DUST_SCALE) : DEFAULT_DUST_SCALE}
            testId={`${testId}-dust-size`}
            onCommit={(scale) =>
              onChange(
                withOption(value, 'scale', scale ?? DEFAULT_DUST_SCALE),
                typingKey(`${pointer}/scale`),
              )
            }
          />
        </>
      )}
      {kind === 'block' && (
        <IdField
          label={`${label} block`}
          value={blockPiecesId(value)}
          registry="block"
          suggest={props.suggest}
          className="min-w-48"
          testId={`${testId}-block`}
          onCommit={(text) => onChange(withOption(value, 'block_state', text))}
        />
      )}
      {kind === 'item' && (
        <IdField
          label={`${label} item`}
          value={itemPiecesId(value)}
          registry="item"
          suggest={props.suggest}
          className="min-w-48"
          testId={`${testId}-item`}
          onCommit={(text) => onChange(withItemPieces(value, text))}
        />
      )}
      {kind === 'other' && (
        <span className="text-muted text-xs" data-testid={`${testId}-other`}>
          {PARTICLE_SPEC_KIND_LABELS.other}
        </span>
      )}
    </>
  );
}

/** "Motion" (three numbers, blocks per tick) and "Show from far away" of a Spawn particle. */
function SpawnParticleExtras(props: {
  name: string;
  action: { [key: string]: Json };
  pointer: string;
  set(key: string, value: Json | undefined, coalesce?: string): void;
}) {
  const { name, action, set } = props;
  const motion = Array.isArray(action.motion) ? action.motion : [];
  return (
    <>
      {offsetAxes.map((axis, at) => (
        <NumberField
          key={axis}
          label={`${name} motion ${axis}`}
          value={motion[at]}
          allowEmpty
          testId={`spawn-particle-motion-${axis.toLowerCase()}`}
          onCommit={(next) =>
            set('motion', motionWith(action.motion, at, next), typingKey(`${props.pointer}/motion`))
          }
        />
      ))}
      <CheckField
        label="Show from far away"
        checked={action.force === true}
        testId="spawn-particle-force"
        onChange={(checked) => set('force', checked ? true : undefined)}
      />
    </>
  );
}

/** "Light a portal" (ADR 0077 D3): lights the portal's empty frame at or next to the event's block. */
export const LIGHT_PORTAL_SPEC: ActionSpec = Object.freeze({
  type: LIGHT_PORTAL_ACTION,
  label: 'Light a portal',
  fields: [{ key: 'portal', label: 'Portal', type: 'id', registry: 'block', required: true }],
} satisfies ActionSpec);

/** The actions an element of `kind` offers here: its own plus "Light a portal". */
export function editorActionsFor(kind: string): readonly ActionSpec[] {
  return [...actionsFor(kind), LIGHT_PORTAL_SPEC];
}

export interface EventsEditorProps {
  element: Element;
  problems: readonly FormProblem[];
  suggest(registry: string, prefix: string): string[];
  onChange(pointer: string, value: Json | undefined, options?: ChangeOptions): void;
  /** Animation names `play_animation` offers (the entity's animation set). */
  animations?: readonly string[];
  /** Handler ids `run_script` offers (defined by the project's scripts). */
  handlers?: readonly string[];
  /** Trigger fields shown above the events (for example an entity's On hurt). */
  triggers?: ReactNode;
  /** The project's own mob effect ids, offered first by `apply_effect` ({@link projectEffects}). */
  effects?: readonly string[];
  /**
   * The project's portal block ids, which "Light a portal" offers in a picker
   * (`projectPortals`); without them the portal is a block id field.
   */
  portals?: readonly string[] | undefined;
  /**
   * The project and the target, for the "From rules" list and "Turn into rules" (ADR 0082 D7
   * (c)); without them neither is shown.
   */
  project?: Project | undefined;
  target?: TargetFacts | undefined;
}

/** The heading of the read-only list of the events Rules make. */
export const FROM_RULES_TITLE = 'From rules';

/** What the "From rules" list says about its events. */
export const FROM_RULES_NOTE =
  'Your rules make these events when the mod is exported. Change them in the rules, not here.';

/** Plain words for one action of an event Rules make. */
export function ruleActionWords(action: Json, actions: readonly ActionSpec[]): string {
  const object = asObject(action);
  if (object.type === 'run_script') return "Runs the rules' script";
  if (object.type === 'trigger_event') {
    return `Runs the event ${typeof object.event === 'string' ? object.event : ''} first`;
  }
  const spec = actionSpec(object.type, actions);
  return spec === undefined ? String(object.type) : spec.label;
}

/** The read-only list of the events Rules make on the thing. */
function FromRules(props: {
  entries: readonly RuleEventEntry[];
  actions: readonly ActionSpec[];
  onOpen: ((bookId: string) => void) | undefined;
}) {
  return (
    <section
      aria-label={FROM_RULES_TITLE}
      className="flex flex-col gap-1"
      data-testid="events-from-rules"
    >
      <h4 className="font-medium text-xs">{FROM_RULES_TITLE}</h4>
      <p className="text-muted text-xs">{FROM_RULES_NOTE}</p>
      <ul className="flex flex-col gap-1">
        {props.entries.map((entry) => {
          const actions = asObject(entry.event).actions;
          const label = triggerById(entry.trigger)?.label ?? entry.trigger;
          return (
            <li
              key={entry.eventId}
              className="flex flex-col gap-0.5 rounded border border-dashed border-border p-2 text-xs"
              data-testid={`rules-event-${entry.eventId}`}
            >
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{label}</span>
                <code className="font-mono text-muted">{entry.eventId}</code>
                {props.onOpen !== undefined && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 underline"
                    data-testid="rules-event-open"
                    onClick={() => props.onOpen?.(entry.origin.elementId)}
                  >
                    <ExternalLink size={12} aria-hidden /> Open the rule book
                  </button>
                )}
              </span>
              <ol className="list-decimal pl-5 text-muted">
                {(Array.isArray(actions) ? actions : []).map((action, index) => (
                  <li key={index}>{ruleActionWords(action, props.actions)}</li>
                ))}
              </ol>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The text of an action type's option: its label and its format id, as "Hurt (damage)". */
export function actionTypeLabel(spec: ActionSpec): string {
  return `${spec.label} (${spec.type})`;
}

/** A select over action types, showing each by {@link actionTypeLabel}. */
function ActionTypeSelect(props: {
  label: string;
  value: string | undefined;
  actions: readonly ActionSpec[];
  onChange(type: string): void;
}) {
  const id = useId();
  const current = props.value ?? '';
  const known = props.actions.some((spec) => spec.type === current);
  return (
    <div className="flex min-w-0 flex-col gap-0.5 text-xs">
      <label htmlFor={id} className="text-muted">
        {props.label}
      </label>
      <select
        id={id}
        className={inputClass}
        value={current}
        onChange={(event) => {
          if (event.target.value !== '') props.onChange(event.target.value);
        }}
      >
        {current === '' && <option value="">(choose an action)</option>}
        {!known && current !== '' && <option value={current}>{current}</option>}
        {props.actions.map((spec) => (
          <option key={spec.type} value={spec.type}>
            {actionTypeLabel(spec)}
          </option>
        ))}
      </select>
    </div>
  );
}

function ActionFieldEditor(props: {
  field: ActionField;
  action: { [key: string]: Json };
  pointer: string;
  name: string;
  events: readonly string[];
  animations: readonly string[];
  handlers: readonly string[];
  portals: readonly string[] | undefined;
  suggest(registry: string, prefix: string): string[];
  set(key: string, value: Json | undefined, coalesce?: string): void;
}) {
  const { field, action, pointer, name, set } = props;
  const label = `${name} ${field.label.toLowerCase()}`;
  const value = action[field.key];
  const fieldPointer = `${pointer}/${field.key}`;
  if (action.type === SPAWN_PARTICLE && field.key === 'particle') {
    return (
      <ParticleSpecField
        label={label}
        value={value}
        suggest={props.suggest}
        pointer={fieldPointer}
        testId="spawn-particle"
        onChange={(next, coalesce) => set(field.key, next, coalesce)}
      />
    );
  }
  if (
    action.type === LIGHT_PORTAL_ACTION &&
    field.key === 'portal' &&
    props.portals !== undefined
  ) {
    return <PortalPicker label={label} value={value} portals={props.portals} set={set} />;
  }
  switch (field.type) {
    case 'id':
      return (
        <IdField
          label={label}
          value={typeof value === 'string' ? value : ''}
          registry={field.registry ?? ''}
          suggest={props.suggest}
          className="min-w-48"
          onCommit={(text) => set(field.key, field.required || text !== '' ? text : undefined)}
        />
      );
    case 'text':
      return (
        <div className="flex min-w-48 flex-col gap-0.5 text-xs">
          <span className="text-muted" aria-hidden>
            {label}
          </span>
          <IdInput
            value={typeof value === 'string' ? value : ''}
            label={label}
            placeholder="minecraft:stone"
            className="font-mono"
            onCommit={(text) => set(field.key, text.trim())}
          />
        </div>
      );
    case 'int':
    case 'float':
      return (
        <NumberField
          label={label}
          value={typeof value === 'number' ? value : field.defaultValue}
          integer={field.type === 'int'}
          allowEmpty
          onCommit={(next) => set(field.key, next, typingKey(fieldPointer))}
        />
      );
    case 'offset': {
      const fallback = (field.defaultValue as number[] | undefined) ?? [0, 0, 0];
      const current =
        Array.isArray(value) && value.length === 3 && value.every((n) => typeof n === 'number')
          ? (value as number[])
          : fallback;
      return (
        <>
          {offsetAxes.map((axis, at) => (
            <NumberField
              key={axis}
              label={`${label} ${axis}`}
              value={current[at]}
              integer
              onCommit={(next) => {
                if (next === undefined) return;
                const offset = current.map((part, index) => (index === at ? next : part));
                set(
                  field.key,
                  offset.every((part) => part === 0) ? undefined : offset,
                  typingKey(fieldPointer),
                );
              }}
            />
          ))}
        </>
      );
    }
    case 'event':
      return (
        <EventSelect
          label={label}
          value={value}
          events={props.events}
          emptyLabel="(choose an event)"
          onChange={(next) => set(field.key, next ?? '')}
        />
      );
    case 'animation':
      return (
        <SelectField
          label={label}
          value={typeof value === 'string' && value !== '' ? value : undefined}
          choices={props.animations}
          emptyLabel="(choose an animation)"
          onChange={(next) => set(field.key, next ?? '')}
        />
      );
    case 'handler':
      return <HandlerField label={label} value={value} handlers={props.handlers} set={set} />;
    case 'choice':
      return (
        <SelectField
          label={label}
          value={typeof value === 'string' && value !== '' ? value : undefined}
          choices={field.choices ?? []}
          emptyLabel={
            typeof field.defaultValue === 'string' ? `(default: ${field.defaultValue})` : '(none)'
          }
          onChange={(next) => set(field.key, next)}
        />
      );
  }
}

/** Shown under "Light a portal" when the project has no portal block yet. */
export const NO_PORTALS_NOTE = 'No portal blocks yet: add a block and set its Type to "Portal".';

/** The portal "Light a portal" lights: one of the project's portal blocks. */
function PortalPicker(props: {
  label: string;
  value: Json | undefined;
  portals: readonly string[];
  set(key: string, value: Json | undefined): void;
}) {
  const current = typeof props.value === 'string' ? props.value : '';
  return (
    <>
      <SelectField
        label={props.label}
        value={current === '' ? undefined : current}
        choices={props.portals}
        emptyLabel="(choose a portal)"
        onChange={(next) => props.set('portal', next ?? '')}
      />
      {props.portals.length === 0 && <span className="text-muted text-xs">{NO_PORTALS_NOTE}</span>}
    </>
  );
}

/** Shown under a `run_script` handler when no script defines a handler yet. */
export const NO_HANDLERS_NOTE =
  'No script defines a handler yet: add msm.actions.define("<id>", (e) => { ... }) to a script.';

/**
 * A `run_script` handler: a select over the handlers the project's scripts define, plus a
 * text field for an id no script defines yet (the `scripting.unknown-handler` warning then
 * says so).
 */
function HandlerField(props: {
  label: string;
  value: Json | undefined;
  handlers: readonly string[];
  set(key: string, value: Json | undefined): void;
}) {
  const { label, handlers, set } = props;
  const current = typeof props.value === 'string' ? props.value : '';
  return (
    <>
      <SelectField
        label={label}
        value={current === '' ? undefined : current}
        choices={handlers}
        emptyLabel="(choose a handler)"
        onChange={(next) => set('handler', next ?? '')}
      />
      <div className="flex min-w-48 flex-col gap-0.5 text-xs">
        <span className="text-muted" aria-hidden>
          {label} id
        </span>
        <IdInput
          value={current}
          label={`${label} id`}
          placeholder="mymod:handler"
          className="font-mono"
          onCommit={(text) => set('handler', text.trim())}
        />
      </div>
      {handlers.length === 0 && <span className="text-muted text-xs">{NO_HANDLERS_NOTE}</span>}
    </>
  );
}

function EventEditor(props: {
  name: string;
  data: Json;
  kind: string;
  events: readonly string[];
  actions: readonly ActionSpec[];
  animations: readonly string[];
  handlers: readonly string[];
  portals: readonly string[] | undefined;
  problems: readonly FormProblem[];
  suggest(registry: string, prefix: string): string[];
  onChange: EventsEditorProps['onChange'];
  /** "Turn into rules", when the event can become rules. */
  onTurnIntoRules?: (() => void) | undefined;
}) {
  const { name, data, events, problems, onChange } = props;
  const create = (type: string) =>
    type === LIGHT_PORTAL_ACTION
      ? newLightPortalAction(props.portals ?? [])
      : newAction(type, events, name);
  const [error, setError] = useState<string | null>(null);
  const [addType, setAddType] = useState<string>(props.actions[0]?.type ?? 'play_sound');
  const eventPointer = pointerOf(['events', name]);
  const actionsPointer = pointerOf(['events', name, 'actions']);
  const actions = eventActions(data, name);
  const setActions = (next: Json[]) => onChange(actionsPointer, next);
  const rename = (text: string) => {
    const to = text.trim();
    if (to === name) return;
    try {
      onChange('', renameEvent(data, props.kind, name, to));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };
  return (
    <li
      className="flex flex-col gap-2 rounded border border-border p-2"
      data-testid={`msm-event-${name}`}
    >
      <div className="flex items-end gap-1">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-xs">
          <span className="text-muted" aria-hidden>
            Event id
          </span>
          <IdInput
            value={name}
            label={`Event id ${name}`}
            className="font-mono"
            invalid={error !== null}
            onCommit={rename}
          />
        </div>
        {props.onTurnIntoRules !== undefined && (
          <Button
            className="text-xs"
            data-testid={`turn-into-rules-${name}`}
            aria-label={`Turn ${name} into rules`}
            onClick={props.onTurnIntoRules}
          >
            <ListChecks size={12} aria-hidden />
            Turn into rules
          </Button>
        )}
        <button
          type="button"
          aria-label={`Remove event ${name}`}
          className={iconButtonClass}
          onClick={() => onChange(eventPointer, undefined)}
        >
          <X size={12} aria-hidden />
        </button>
      </div>
      {error !== null && (
        <p role="alert" className="text-error text-xs">
          {error}
        </p>
      )}
      <ProblemList problems={problems.filter((problem) => problem.path === eventPointer)} />
      {actions.length === 0 && <p className="text-muted text-xs">No actions.</p>}
      <ol className="flex flex-col gap-2">
        {actions.map((raw, index) => {
          const action = asObject(raw);
          const pointer = `${actionsPointer}/${index}`;
          const actionName = `${name} action ${index + 1}`;
          const spec = actionSpec(action.type, props.actions);
          const set = (key: string, value: Json | undefined, coalesce?: string) => {
            const options = coalesce === undefined ? undefined : { coalesce };
            if (value === undefined) {
              if (Object.hasOwn(action, key)) onChange(`${pointer}/${key}`, undefined, options);
              return;
            }
            onChange(`${pointer}/${key}`, value, options);
          };
          return (
            <li key={index} className="flex flex-col gap-1" data-testid={`msm-action-${index}`}>
              <div className="flex flex-wrap items-end gap-2">
                <ActionTypeSelect
                  label={`${actionName} type`}
                  value={typeof action.type === 'string' ? action.type : undefined}
                  actions={props.actions}
                  onChange={(type) => {
                    if (type === action.type) return;
                    onChange(pointer, create(type));
                  }}
                />
                {spec?.fields.map((field) => (
                  <ActionFieldEditor
                    key={field.key}
                    field={field}
                    action={action}
                    pointer={pointer}
                    name={actionName}
                    events={events}
                    animations={props.animations}
                    handlers={props.handlers}
                    portals={props.portals}
                    suggest={props.suggest}
                    set={set}
                  />
                ))}
                {action.type === SPAWN_PARTICLE && (
                  <SpawnParticleExtras
                    name={actionName}
                    action={action}
                    pointer={pointer}
                    set={set}
                  />
                )}
                {spec === undefined && (
                  <span className="text-muted text-xs">
                    Unknown action type; edit it under Advanced.
                  </span>
                )}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label={`Move ${actionName} up`}
                    className={iconButtonClass}
                    disabled={index === 0}
                    onClick={() => setActions(moved(actions, index, index - 1))}
                  >
                    <ArrowUp size={12} aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${actionName} down`}
                    className={iconButtonClass}
                    disabled={index === actions.length - 1}
                    onClick={() => setActions(moved(actions, index, index + 1))}
                  >
                    <ArrowDown size={12} aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${actionName}`}
                    className={iconButtonClass}
                    onClick={() => setActions(actions.filter((_, at) => at !== index))}
                  >
                    <X size={12} aria-hidden />
                  </button>
                </div>
              </div>
              <ProblemList
                problems={problems.filter((problem) => isWithin(problem.path, pointer))}
              />
            </li>
          );
        })}
      </ol>
      <div className="flex items-end gap-1">
        <ActionTypeSelect
          label={`New action type for ${name}`}
          value={addType}
          actions={props.actions}
          onChange={setAddType}
        />
        <Button
          className="text-xs"
          aria-label={`Add action to ${name}`}
          onClick={() => {
            const action = create(addType);
            if (actions.length > 0) {
              onChange(`${actionsPointer}/${actions.length}`, action);
            } else {
              setActions([action]);
            }
          }}
        >
          <Plus size={12} aria-hidden />
          Add action
        </Button>
      </div>
    </li>
  );
}

/** The events of a block, item or entity and their actions. */
export function EventsEditor({
  element,
  problems,
  suggest,
  onChange,
  animations = [],
  handlers = [],
  triggers,
  effects = [],
  portals,
  project,
  target,
}: EventsEditorProps) {
  const suggestIds = particlesFirst(withProjectIds(suggest, 'mob_effect', effects));
  const events = eventNames(element.data);
  const actions = editorActionsFor(element.kind);
  const rules = useMemo(
    () => (project === undefined || target === undefined ? null : subjectRules(project, target)),
    [project, target],
  );
  const ruleEvents = useMemo(
    () => rules?.view.ruleEventsFor(element.id) ?? [],
    [rules, element.id],
  );
  const host = useBlocksItemsStudioHost();
  const structureHost = useStructureStudioHost();
  const applyChanges = host?.applyChanges;
  const [turnError, setTurnError] = useState<string | null>(null);
  const turnInto = (name: string): (() => void) | undefined => {
    if (project === undefined || applyChanges === undefined) return undefined;
    const plan = planTurnIntoRules(project, element, name);
    if (!plan.ok) return undefined;
    return () => {
      setTurnError(null);
      applyChanges(plan.items, plan.label, []).catch((cause: unknown) =>
        setTurnError(cause instanceof Error ? cause.message : String(cause)),
      );
    };
  };
  const [draft, setDraft] = useState('');
  const inputId = useId();
  const proposed = draft.trim();
  const clash = events.includes(proposed);
  const add = () => {
    if (proposed === '' || clash) return;
    const value: Json = { actions: [] };
    if (isJsonObject(asObject(element.data).events)) {
      onChange(pointerOf(['events', proposed]), value);
    } else {
      onChange('/events', { [proposed]: value });
    }
    setDraft('');
  };
  return (
    <Section title="Events" testId="msm-events">
      <p className="text-muted text-xs">
        Events run their actions in order on the server. Triggers and "Trigger event" actions pick
        events from this list.
      </p>
      {triggers}
      {events.length === 0 && <p className="text-muted text-xs">No events.</p>}
      <ul className="flex flex-col gap-2">
        {events.map((name) => (
          <EventEditor
            key={name}
            name={name}
            data={element.data}
            kind={element.kind}
            events={events}
            actions={actions}
            animations={animations}
            handlers={handlers}
            portals={portals}
            problems={problems}
            suggest={suggestIds}
            onChange={onChange}
            onTurnIntoRules={turnInto(name)}
          />
        ))}
      </ul>
      {turnError !== null && (
        <p role="alert" className="text-error text-xs" data-testid="turn-into-rules-error">
          {turnError}
        </p>
      )}
      {ruleEvents.length > 0 && (
        <FromRules
          entries={ruleEvents}
          actions={actions}
          onOpen={
            structureHost === null
              ? undefined
              : (bookId) => structureHost.openElement(bookId as Element['id'])
          }
        />
      )}
      <div className="flex items-end gap-1">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-xs">
          <label className="text-muted" htmlFor={inputId}>
            New event id
          </label>
          <input
            id={inputId}
            type="text"
            className={`${inputClass} font-mono`}
            spellCheck={false}
            placeholder={suggestEventId(element.id, events)}
            aria-invalid={clash}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                add();
              }
            }}
          />
        </div>
        <Button
          className="text-xs"
          disabled={proposed === '' || clash}
          onClick={add}
          aria-label="Add event"
        >
          <Plus size={12} aria-hidden />
          Add event
        </Button>
      </div>
      {clash && <p className="text-error text-xs">An event with this id already exists.</p>}
    </Section>
  );
}
