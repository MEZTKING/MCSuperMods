/**
 * Small fields the Key bind and HUD Studios share (B420): a select with words for each choice,
 * a colour field over `#rrggbb` and the project vehicle picker.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/core';
import { useEffect, useId, useState } from 'react';
import { inputClass } from '../../forms';

/** A select over `choices`, each shown by its words; the empty choice clears the value. */
export function WordsSelect(props: {
  label: string;
  value: Json | undefined;
  choices: readonly string[];
  labels: Readonly<Record<string, string>>;
  onChange(value: string | undefined): void;
  /** The words of an empty choice that removes the value; none when absent. */
  emptyLabel?: string;
  testId: string;
}) {
  const id = useId();
  const current = typeof props.value === 'string' ? props.value : '';
  const options = [...props.choices];
  if (current !== '' && !options.includes(current)) options.unshift(current);
  return (
    <div className="flex min-w-0 flex-col gap-0.5 text-xs">
      <label htmlFor={id} className="text-muted">
        {props.label}
      </label>
      <select
        id={id}
        className={inputClass}
        data-testid={props.testId}
        value={current}
        onChange={(event) =>
          props.onChange(event.target.value === '' ? undefined : event.target.value)
        }
      >
        {(props.emptyLabel !== undefined || current === '') && (
          <option value="">{props.emptyLabel ?? '(none)'}</option>
        )}
        {options.map((option) => (
          <option key={option} value={option}>
            {props.labels[option] ?? option}
          </option>
        ))}
      </select>
    </div>
  );
}

const COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * A colour: a colour picker and the `#rrggbb` text beside it, showing `fallback` (the runtime's
 * default) while unset. Clearing the text removes the field.
 */
export function ColourField(props: {
  label: string;
  value: Json | undefined;
  fallback: string;
  onCommit(value: string | undefined): void;
  testId: string;
}) {
  const external = typeof props.value === 'string' ? props.value : '';
  const [text, setText] = useState(external);
  useEffect(() => setText(external), [external]);
  const id = useId();
  const shown = COLOR.test(external) ? external : props.fallback;
  return (
    <div className="flex min-w-0 flex-col gap-0.5 text-xs">
      <label htmlFor={id} className="text-muted">
        {props.label}
      </label>
      <div className="flex items-center gap-1">
        <input
          type="color"
          aria-label={`${props.label} picker`}
          data-testid={`${props.testId}-picker`}
          value={shown.toLowerCase()}
          className="h-6 w-8 cursor-pointer rounded border border-border bg-transparent"
          onChange={(event) => props.onCommit(event.target.value)}
        />
        <input
          id={id}
          type="text"
          className={`${inputClass} w-24 font-mono`}
          data-testid={props.testId}
          placeholder={props.fallback}
          value={text}
          onChange={(event) => {
            const next = event.target.value.trim();
            setText(event.target.value);
            props.onCommit(next === '' ? undefined : next);
          }}
        />
      </div>
    </div>
  );
}

/** The project vehicle picker: "Any vehicle" or one of the project's vehicles. */
export function VehiclePicker(props: {
  value: Json | undefined;
  vehicles: readonly string[];
  onChange(value: string | undefined): void;
  testId: string;
}) {
  return (
    <WordsSelect
      label="Which vehicle"
      value={props.value}
      choices={props.vehicles}
      labels={{}}
      emptyLabel="Any vehicle"
      testId={props.testId}
      onChange={props.onChange}
    />
  );
}
