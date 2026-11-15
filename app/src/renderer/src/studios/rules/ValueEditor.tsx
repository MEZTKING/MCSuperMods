/**
 * The editors inside a chip's popover: a number with words ("2 seconds", "25%") or a reading
 * (ADR 0082 D2: a random number, a counter, the player's health, one level of sums), text made
 * of typed pieces and readings, and the counter picker that declares a counter on first use.
 * Every editor reads and writes the book at its pointer; typing coalesces into one undo step.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/core';
import { type SlotSpec, valueById } from '@msm/plugin-rules';
import { Plus, X } from 'lucide-react';
import { useId, useState } from 'react';
import { Button, iconButtonClass } from '../../components/ui/Button';
import { inputClass } from '../../forms';
import { typingKey } from '../../forms/context';
import { useBookEdit, useRulesEnv } from './env';
import { WeaponSelect } from './project-pickers';
import {
  asArray,
  asObject,
  COUNTER_NAME_PATTERN,
  countersOf,
  getAt,
  isPlainText,
  newValue,
  offeredCounterScopes,
  offeredValues,
  type RuleScope,
  setAt,
  setCounter,
} from './rules-model';

/** Words after a number of each slot type. */
const UNITS: Partial<Record<SlotSpec['type'], string>> = { seconds: 'seconds', percent: '%' };

/** A literal number typed into `text`, or undefined when it is not one. */
function parseNumber(text: string, slot: SlotSpec): number | undefined {
  if (text.trim() === '') return undefined;
  const value = Number(text);
  if (!Number.isFinite(value)) return undefined;
  let next = slot.whole === true ? Math.round(value) : value;
  if (slot.min !== undefined) next = Math.max(slot.min, next);
  if (slot.max !== undefined) next = Math.min(slot.max, next);
  return next;
}

/** A number input bound to the book at `pointer`. */
function LiteralNumber(props: { pointer: string; slot: SlotSpec; label: string }) {
  const { book, change } = useBookEdit();
  const value = getAt(book, props.pointer);
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (typeof value === 'number' ? String(value) : '');
  const unit = UNITS[props.slot.type];
  return (
    <span className="flex items-center gap-1.5">
      <label htmlFor={id} className="sr-only">
        {props.label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        className={`${inputClass} w-24`}
        data-testid="rules-number"
        value={shown}
        step={props.slot.whole === true ? 1 : 'any'}
        {...(props.slot.min === undefined ? {} : { min: props.slot.min })}
        {...(props.slot.max === undefined ? {} : { max: props.slot.max })}
        onChange={(event) => {
          setDraft(event.target.value);
          const next = parseNumber(event.target.value, props.slot);
          if (next !== undefined) {
            change(setAt(book, props.pointer, next), typingKey(props.pointer));
          }
        }}
        onBlur={() => setDraft(null)}
      />
      {unit !== undefined && <span className="text-muted">{unit}</span>}
    </span>
  );
}

/**
 * A number slot: a number, or (when `readings`) a reading. `plainOnly` leaves out sums (inside
 * sums). `optional` offers "Use the default", which removes the value.
 */
export function NumberEditor(props: {
  pointer: string;
  slot: SlotSpec;
  label: string;
  scope: RuleScope;
  readings: boolean;
  plainOnly?: boolean;
  /** Text pieces hold readings only, never a bare number. */
  readingOnly?: boolean;
}) {
  const { book, change } = useBookEdit();
  const env = useRulesEnv();
  const value = getAt(book, props.pointer);
  const reading = asObject(value);
  const kind = typeof reading?.value === 'string' ? reading.value : null;
  const selectId = useId();
  const offered = props.readings
    ? offeredValues(props.scope, {
        veryEasy: env.mode.veryEasy,
        ...(props.plainOnly === true ? { plainOnly: true } : {}),
      })
    : [];
  const literal = (): number =>
    typeof value === 'number'
      ? value
      : Math.max(props.slot.min ?? 1, Math.min(1, props.slot.max ?? 1));

  const choose = (choice: string): void => {
    if (choice === '') {
      change(setAt(book, props.pointer, literal()));
      return;
    }
    if (choice === 'counter') {
      const scopes = offeredCounterScopes(props.scope);
      const counter = countersOf(book).find((entry) => scopes.includes(entry.scope));
      if (counter !== undefined) {
        const next = setAt(book, props.pointer, { value: 'counter' });
        change(setCounter(next, props.pointer, counter.name, counter.scope));
        return;
      }
      const scope = scopes[0] ?? 'world';
      const next = setAt(book, props.pointer, { value: 'counter' });
      change(setCounter(next, props.pointer, 'count', scope));
      return;
    }
    change(setAt(book, props.pointer, newValue(choice)));
  };

  return (
    <div className="flex flex-col gap-1.5" data-testid="rules-value-editor">
      {offered.length > 0 && (
        <span className="flex items-center gap-1.5">
          <label htmlFor={selectId} className="text-muted">
            Use
          </label>
          <select
            id={selectId}
            className={inputClass}
            data-testid="rules-value-kind"
            value={kind ?? ''}
            onChange={(event) => choose(event.target.value)}
          >
            {props.readingOnly !== true && <option value="">A number</option>}
            {offered.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </span>
      )}
      {kind === null ? (
        <LiteralNumber pointer={props.pointer} slot={props.slot} label={props.label} />
      ) : (
        <ReadingFields pointer={props.pointer} kind={kind} scope={props.scope} />
      )}
    </div>
  );
}

/** The fields of a reading at `pointer`. */
function ReadingFields(props: { pointer: string; kind: string; scope: RuleScope }) {
  const { book, change } = useBookEdit();
  const entry = valueById(props.kind);
  const axisId = useId();
  const opId = useId();
  const wholeId = useId();
  if (entry === undefined) {
    return <p className="text-error">This reading is unknown; it may come from a newer MSM.</p>;
  }
  const at = (field: string): string => `${props.pointer}/${field}`;
  switch (props.kind) {
    case 'random': {
      const whole = asObject(getAt(book, props.pointer))?.whole !== false;
      return (
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5">
            from{' '}
            <LiteralNumber
              pointer={at('min')}
              slot={{ name: 'min', type: 'number' }}
              label="From"
            />
            to{' '}
            <LiteralNumber pointer={at('max')} slot={{ name: 'max', type: 'number' }} label="To" />
          </span>
          <span className="flex items-center gap-1.5">
            <input
              id={wholeId}
              type="checkbox"
              checked={whole}
              onChange={(event) =>
                change(setAt(book, at('whole'), event.target.checked ? undefined : false))
              }
            />
            <label htmlFor={wholeId}>Whole numbers only</label>
          </span>
        </div>
      );
    }
    case 'counter':
      return <CounterEditor pointer={props.pointer} scope={props.scope} />;
    case 'vehicle_ammo':
      return <WeaponSelect pointer={at('weapon')} />;
    case 'player_position': {
      const axis = asObject(getAt(book, props.pointer))?.axis;
      return (
        <span className="flex items-center gap-1.5">
          <label htmlFor={axisId}>Part</label>
          <select
            id={axisId}
            className={inputClass}
            value={typeof axis === 'string' ? axis : 'y'}
            onChange={(event) => change(setAt(book, at('axis'), event.target.value))}
          >
            <option value="x">x (east and west)</option>
            <option value="y">y (height)</option>
            <option value="z">z (north and south)</option>
          </select>
        </span>
      );
    }
    case 'math': {
      const op = asObject(getAt(book, props.pointer))?.op;
      return (
        <div className="flex flex-col gap-1.5 border-l-2 border-border pl-2">
          <NumberEditor
            pointer={at('a')}
            slot={{ name: 'a', type: 'number' }}
            label="First number"
            scope={props.scope}
            readings
            plainOnly
          />
          <span className="flex items-center gap-1.5">
            <label htmlFor={opId} className="sr-only">
              Sum
            </label>
            <select
              id={opId}
              className={inputClass}
              data-testid="rules-math-op"
              value={typeof op === 'string' ? op : '+'}
              onChange={(event) => change(setAt(book, at('op'), event.target.value))}
            >
              <option value="+">plus</option>
              <option value="-">minus</option>
              <option value="*">times</option>
              <option value="/">divided by</option>
            </select>
          </span>
          <NumberEditor
            pointer={at('b')}
            slot={{ name: 'b', type: 'number' }}
            label="Second number"
            scope={props.scope}
            readings
            plainOnly
          />
        </div>
      );
    }
    default:
      return <p className="text-muted">{entry.label}</p>;
  }
}

const SCOPE_WORDS: Record<'player' | 'mob' | 'world', string> = {
  player: "The player's",
  mob: "The mob's",
  world: "The world's",
};

/**
 * Picks the counter of the object at `pointer` (a counter step or condition, or a counter
 * reading): one of the book's counters, or a new one, declared on first use.
 */
export function CounterEditor(props: { pointer: string; scope: RuleScope }) {
  const { book, change } = useBookEdit();
  const scopes = offeredCounterScopes(props.scope);
  const object = asObject(getAt(book, props.pointer));
  const current = typeof object?.counter === 'string' ? `${object.scope}:${object.counter}` : '';
  const counters = countersOf(book).filter((counter) => scopes.includes(counter.scope));
  const [name, setName] = useState('');
  const [scope, setScope] = useState<'player' | 'mob' | 'world'>(scopes[0] ?? 'world');
  const pickId = useId();
  const nameId = useId();
  const scopeId = useId();
  const valid = COUNTER_NAME_PATTERN.test(name);
  return (
    <div className="flex flex-col gap-1.5" data-testid="rules-counter-editor">
      {counters.length > 0 && (
        <span className="flex items-center gap-1.5">
          <label htmlFor={pickId}>Counter</label>
          <select
            id={pickId}
            className={inputClass}
            data-testid="rules-counter-pick"
            value={current}
            onChange={(event) => {
              const [pickedScope, ...rest] = event.target.value.split(':');
              const picked = rest.join(':');
              if (picked === '') return;
              change(
                setCounter(book, props.pointer, picked, pickedScope as 'player' | 'mob' | 'world'),
              );
            }}
          >
            {current === '' && <option value="">Pick a counter</option>}
            {counters.map((counter) => (
              <option
                key={`${counter.scope}:${counter.name}`}
                value={`${counter.scope}:${counter.name}`}
              >
                {SCOPE_WORDS[counter.scope]} {counter.name.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </span>
      )}
      <p className="text-xs text-muted">New counter</p>
      <span className="flex items-center gap-1.5">
        <label htmlFor={scopeId} className="sr-only">
          Whose counter
        </label>
        <select
          id={scopeId}
          className={inputClass}
          data-testid="rules-counter-scope"
          value={scope}
          onChange={(event) => setScope(event.target.value as 'player' | 'mob' | 'world')}
        >
          {scopes.map((entry) => (
            <option key={entry} value={entry}>
              {SCOPE_WORDS[entry]}
            </option>
          ))}
        </select>
        <label htmlFor={nameId} className="sr-only">
          Counter name
        </label>
        <input
          id={nameId}
          className={inputClass}
          data-testid="rules-counter-name"
          placeholder="name, like clicks"
          value={name}
          aria-invalid={name !== '' && !valid}
          spellCheck={false}
          onChange={(event) => setName(event.target.value.toLowerCase().replace(/[\s-]+/g, '_'))}
        />
      </span>
      {name !== '' && !valid && (
        <p className="text-xs text-error">Use 1 to 32 lower-case letters, digits or underscores.</p>
      )}
      <Button
        data-testid="rules-counter-new"
        disabled={!valid}
        onClick={() => {
          change(setCounter(book, props.pointer, name, scope));
          setName('');
        }}
      >
        Use this counter
      </Button>
    </div>
  );
}

/** A text slot: a plain string, or pieces of typed text and readings. */
export function TextEditor(props: {
  pointer: string;
  slot: SlotSpec;
  label: string;
  scope: RuleScope;
}) {
  const { book, change } = useBookEdit();
  const env = useRulesEnv();
  const inputId = useId();
  const value = getAt(book, props.pointer);
  if (isPlainText(props.slot.name)) {
    return (
      <span className="flex flex-col gap-1">
        <label htmlFor={inputId}>{props.label}</label>
        <input
          id={inputId}
          className={inputClass}
          data-testid="rules-text"
          value={typeof value === 'string' ? value : ''}
          spellCheck={false}
          onChange={(event) =>
            change(
              setAt(
                book,
                props.pointer,
                event.target.value === '' ? undefined : event.target.value,
              ),
              typingKey(props.pointer),
            )
          }
        />
      </span>
    );
  }
  const pieces: readonly Json[] = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? [value]
      : [];
  const readings = offeredValues(props.scope, { veryEasy: env.mode.veryEasy, text: true });
  const firstReading = readings.find((entry) => entry.id !== 'math') ?? readings[0];
  return (
    <div className="flex flex-col gap-1.5" data-testid="rules-text-editor">
      <p className="text-muted">{props.label}</p>
      {pieces.map((piece, index) => {
        const at = `${props.pointer}/${index}`;
        return (
          <div key={index} className="flex items-start gap-1">
            {typeof piece === 'string' ? (
              <TextPiece pointer={at} index={index} value={piece} />
            ) : (
              <div className="flex-1 rounded border border-border p-1.5">
                <NumberEditor
                  pointer={at}
                  slot={{ name: 'value', type: 'number' }}
                  label={`Number in the text, part ${index + 1}`}
                  scope={props.scope}
                  readings
                  readingOnly
                />
              </div>
            )}
            {pieces.length > 1 && (
              <button
                type="button"
                className={iconButtonClass}
                aria-label={`Remove part ${index + 1}`}
                onClick={() => change(setAt(book, at, undefined))}
              >
                <X size={14} aria-hidden />
              </button>
            )}
          </div>
        );
      })}
      <span className="flex flex-wrap gap-1.5">
        <Button
          data-testid="rules-text-add"
          onClick={() => change(setAt(book, props.pointer, [...asArray(value), '']))}
        >
          <Plus size={14} aria-hidden /> Add text
        </Button>
        {firstReading !== undefined && (
          <Button
            data-testid="rules-text-add-number"
            onClick={() =>
              change(setAt(book, props.pointer, [...pieces, newValue(firstReading.id)]))
            }
          >
            <Plus size={14} aria-hidden /> Add a number
          </Button>
        )}
      </span>
    </div>
  );
}

/** One typed piece of a text slot. */
function TextPiece(props: { pointer: string; index: number; value: string }) {
  const { book, change } = useBookEdit();
  const id = useId();
  return (
    <span className="flex flex-1 flex-col">
      <label htmlFor={id} className="sr-only">
        Text, part {props.index + 1}
      </label>
      <input
        id={id}
        className={inputClass}
        data-testid="rules-text-piece"
        value={props.value}
        spellCheck
        onChange={(event) =>
          change(setAt(book, props.pointer, event.target.value), typingKey(props.pointer))
        }
      />
    </span>
  );
}
