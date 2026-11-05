/**
 * The events editor shared by the Block and Item Studios (B97): add, rename and remove
 * events, and edit each event's ordered action list (add, remove, reorder, change type, and
 * the fields of the six format v1 actions with their ADR 0025 D4 defaults).
 *
 * Renaming rewrites the references in trigger components and `trigger_event` actions in one
 * edit (one undo step); removing an event leaves its references, which the
 * `blocks-items.unknown-event` validator then reports.
 *
 * @packageDocumentation
 */

import type { Element, Json } from '@msm/core';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { useId, useState } from 'react';
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
import { IdField, NumberField, SelectField } from '../structures/pickers';
import { Section } from '../worldgen/parts';
import {
  ACTIONS,
  type ActionField,
  actionSpec,
  asObject,
  eventActions,
  eventNames,
  moved,
  newAction,
  pointerOf,
  renameEvent,
  suggestEventId,
} from './blocks-items-model';
import { EventSelect } from './parts';

export interface EventsEditorProps {
  element: Element;
  problems: readonly FormProblem[];
  suggest(registry: string, prefix: string): string[];
  onChange(pointer: string, value: Json | undefined, options?: ChangeOptions): void;
}

const offsetAxes = ['X', 'Y', 'Z'] as const;

function ActionFieldEditor(props: {
  field: ActionField;
  action: { [key: string]: Json };
  pointer: string;
  name: string;
  events: readonly string[];
  suggest(registry: string, prefix: string): string[];
  set(key: string, value: Json | undefined, coalesce?: string): void;
}) {
  const { field, action, pointer, name, set } = props;
  const label = `${name} ${field.label.toLowerCase()}`;
  const value = action[field.key];
  const fieldPointer = `${pointer}/${field.key}`;
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
  }
}

function EventEditor(props: {
  name: string;
  data: Json;
  kind: string;
  events: readonly string[];
  problems: readonly FormProblem[];
  suggest(registry: string, prefix: string): string[];
  onChange: EventsEditorProps['onChange'];
}) {
  const { name, data, events, problems, onChange } = props;
  const [error, setError] = useState<string | null>(null);
  const [addType, setAddType] = useState<string>(ACTIONS[0]?.type ?? 'play_sound');
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
          const spec = actionSpec(action.type);
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
                <SelectField
                  label={`${actionName} type`}
                  value={typeof action.type === 'string' ? action.type : undefined}
                  choices={ACTIONS.map((entry) => entry.type)}
                  onChange={(type) => {
                    if (type === undefined || type === action.type) return;
                    onChange(pointer, newAction(type, events, name));
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
                    suggest={props.suggest}
                    set={set}
                  />
                ))}
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
        <SelectField
          label={`New action type for ${name}`}
          value={addType}
          choices={ACTIONS.map((entry) => entry.type)}
          onChange={(type) => {
            if (type !== undefined) setAddType(type);
          }}
        />
        <Button
          className="text-xs"
          aria-label={`Add action to ${name}`}
          onClick={() => {
            const action = newAction(addType, events, name);
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

/** The events of a block or item and their actions. */
export function EventsEditor({ element, problems, suggest, onChange }: EventsEditorProps) {
  const events = eventNames(element.data);
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
      {events.length === 0 && <p className="text-muted text-xs">No events.</p>}
      <ul className="flex flex-col gap-2">
        {events.map((name) => (
          <EventEditor
            key={name}
            name={name}
            data={element.data}
            kind={element.kind}
            events={events}
            problems={problems}
            suggest={suggest}
            onChange={onChange}
          />
        ))}
      </ul>
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
