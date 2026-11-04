/**
 * Scalar controls: text (with completions), number (with slider when bounded), switch and
 * choice (select, or a segmented control for up to four values).
 */
import type { Json } from '@msm/core';
import type { NumericRange, SchemaNode } from '@msm/schemas';
import { useEffect, useId, useState } from 'react';
import { type CompletionSource, typingKey, useForm } from './context';
import { isFractional, stripMinecraft } from './schema-utils';

const MAX_SUGGESTIONS = 50;

export const inputClass =
  'w-full min-w-0 rounded border border-border bg-bg px-1.5 py-0.5 text-sm aria-[invalid=true]:border-error';

interface ScalarProps {
  pointer: string;
  label: string;
  invalid: boolean;
}

/** Suggestions for a string node from the host's completion source. */
export function suggestionsFor(
  node: SchemaNode & { kind: 'string' },
  completions: CompletionSource | undefined,
  prefix: string,
): string[] {
  if (completions === undefined) return [];
  const tags = node.tags ?? [];
  const out = new Set<string>();
  const registry = node.idRegistry;
  const idPath = node.idPath;
  if (tags.includes('texture_slot') || registry === 'texture') {
    for (const id of completions.projectIds('texture', prefix, idPath)) out.add(id);
  }
  if (registry === 'model') {
    for (const id of completions.projectIds('model', prefix)) out.add(id);
  }
  if (registry !== undefined && registry !== '') {
    for (const id of completions.suggest(registry, prefix, idPath)) out.add(id);
  }
  if (tags.includes('translation_key')) {
    for (const id of completions.suggest('translation_key', prefix)) out.add(id);
  }
  return [...out].slice(0, MAX_SUGGESTIONS);
}

/** Text input; typing coalesces into one undo step per field. */
export function StringControl({
  node,
  value,
  pointer,
  label,
  invalid,
}: ScalarProps & { node: SchemaNode & { kind: 'string' }; value: string | undefined }) {
  const { onChange, completions } = useForm();
  const [text, setText] = useState(value ?? '');
  const listId = useId();
  useEffect(() => setText(value ?? ''), [value]);
  const suggestions = suggestionsFor(node, completions, text);
  return (
    <>
      <input
        type="text"
        aria-label={label}
        aria-invalid={invalid}
        className={inputClass}
        spellCheck={false}
        list={suggestions.length > 0 ? listId : undefined}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          onChange(pointer, event.target.value, { coalesce: typingKey(pointer) });
        }}
      />
      {suggestions.length > 0 && (
        <datalist id={listId}>
          {suggestions.map((entry) => (
            <option key={entry} value={entry} />
          ))}
        </datalist>
      )}
    </>
  );
}

function isBounded(range: NumericRange | undefined): range is { min: number; max: number } {
  return (
    range?.min !== undefined &&
    range.max !== undefined &&
    Number.isFinite(range.min) &&
    Number.isFinite(range.max)
  );
}

/** Number input, plus a slider when both bounds are finite. */
export function NumberControl({
  node,
  value,
  pointer,
  label,
  invalid,
}: ScalarProps & { node: SchemaNode & { kind: 'number' }; value: number | undefined }) {
  const { onChange } = useForm();
  const [text, setText] = useState(value === undefined ? '' : String(value));
  useEffect(() => setText(value === undefined ? '' : String(value)), [value]);
  const fractional = isFractional(node.numberKind);
  const range = node.range;
  const commit = (raw: string) => {
    const parsed = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(parsed)) return;
    onChange(pointer, parsed, { coalesce: typingKey(pointer) });
  };
  return (
    <div className="flex min-w-0 items-center gap-2">
      <input
        type="number"
        aria-label={label}
        aria-invalid={invalid}
        className={inputClass}
        step={fractional ? 'any' : 1}
        min={range?.min}
        max={range?.max}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          commit(event.target.value);
        }}
      />
      {isBounded(range) && (
        <input
          type="range"
          aria-label={`${label} slider`}
          className="min-w-16 flex-1 accent-accent"
          min={range.min}
          max={range.max}
          step={fractional ? (range.max - range.min) / 100 : 1}
          value={value ?? range.min}
          onChange={(event) => {
            setText(event.target.value);
            commit(event.target.value);
          }}
        />
      )}
    </div>
  );
}

/** Toggle switch. */
export function BooleanControl({
  value,
  pointer,
  label,
  invalid,
}: ScalarProps & { value: boolean | undefined }) {
  const { onChange } = useForm();
  const checked = value === true;
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      aria-invalid={invalid}
      onClick={() => onChange(pointer, !checked)}
      className={
        'relative inline-flex h-4 w-7 shrink-0 cursor-pointer items-center rounded-full border border-border ' +
        (checked ? 'bg-accent' : 'bg-bg')
      }
    >
      <span
        aria-hidden
        className={
          'inline-block size-3 rounded-full bg-panel shadow transition-transform ' +
          (checked ? 'translate-x-3' : 'translate-x-0.5')
        }
      />
    </button>
  );
}

/** One choice of a select or segmented control. */
export interface Choice {
  value: string | number | boolean;
  label: string;
  desc?: string;
}

/** Whether `current` selects `choice`, accepting a `minecraft:` prefix on strings. */
function matches(choice: Choice['value'], current: Json | undefined): boolean {
  if (choice === current) return true;
  return (
    typeof choice === 'string' && typeof current === 'string' && choice === stripMinecraft(current)
  );
}

/**
 * Select over fixed values; four or fewer render as a segmented control (a radio group).
 * A current value outside the choices stays visible as an extra option.
 */
export function ChoiceControl({
  choices,
  value,
  pointer,
  label,
  invalid,
  onPick,
  forceSelect,
}: ScalarProps & {
  choices: readonly Choice[];
  value: Json | undefined;
  /** Overrides the default edit (setting the value at `pointer`). */
  onPick?: (value: Choice['value']) => void;
  forceSelect?: boolean;
}) {
  const { onChange } = useForm();
  const groupName = useId();
  const pick = onPick ?? ((next: Choice['value']) => onChange(pointer, next));
  const selected = choices.findIndex((choice) => matches(choice.value, value));
  if (choices.length <= 4 && forceSelect !== true && (selected >= 0 || value === undefined)) {
    return (
      <div
        role="radiogroup"
        aria-label={label}
        aria-invalid={invalid}
        className="inline-flex overflow-hidden rounded border border-border"
      >
        {choices.map((choice, index) => (
          <label
            key={String(choice.value)}
            title={choice.desc}
            className={
              'cursor-pointer px-2 py-0.5 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ' +
              (index === selected ? 'bg-accent text-panel' : 'bg-bg hover:bg-panel')
            }
          >
            <input
              type="radio"
              className="sr-only"
              name={groupName}
              checked={index === selected}
              onChange={() => pick(choice.value)}
            />
            {choice.label}
          </label>
        ))}
      </div>
    );
  }
  const otherValue = selected < 0 && value !== undefined ? '__other' : undefined;
  return (
    <select
      aria-label={label}
      aria-invalid={invalid}
      className={inputClass}
      value={selected >= 0 ? String(selected) : (otherValue ?? '')}
      onChange={(event) => {
        const choice = choices[Number(event.target.value)];
        if (choice !== undefined) pick(choice.value);
      }}
    >
      {selected < 0 && value === undefined && (
        <option value="" disabled>
          Choose...
        </option>
      )}
      {otherValue !== undefined && (
        <option value={otherValue} disabled>
          {JSON.stringify(value)} (not allowed)
        </option>
      )}
      {choices.map((choice, index) => (
        <option key={String(choice.value)} value={String(index)} title={choice.desc}>
          {choice.label}
        </option>
      ))}
    </select>
  );
}

/** Choices of an enum node. */
export function enumChoices(node: SchemaNode & { kind: 'enum' }): Choice[] {
  return node.values.map((entry) => ({
    value: entry.value,
    label: String(entry.value),
    ...(entry.desc === undefined ? {} : { desc: entry.desc }),
  }));
}
