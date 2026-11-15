/**
 * What the Vehicle Studio's sections share (B419): their props, a setter for one optional record
 * (`engine`, `health`, `storage`...) that removes the record when its last field goes, and a few
 * small fields.
 *
 * @packageDocumentation
 */

import type { Json, Project } from '@msm/core';
import type { Target } from '@msm/plugin-api';
import type { FormProblem } from '../../../forms';
import { typingKey } from '../../../forms/context';
import { asObject, pointerOf } from '../../blocks-items/blocks-items-model';
import { ProblemsAt } from '../../blocks-items/parts';
import { IdField, NumberField } from '../../structures/pickers';

/** Sets `value` at `path` (removes it for `undefined`); `coalesce` merges typing. */
export type VehicleSet = (
  path: readonly (string | number)[],
  value: Json | undefined,
  coalesce?: string,
) => void;

/** Props every section of the Vehicle Studio receives. */
export interface VehicleSectionProps {
  project: Project;
  target: Target;
  elementId: string;
  data: Json;
  set: VehicleSet;
  /** Replaces the whole element data in one undoable edit. */
  replace(next: Json): void;
  problems: readonly FormProblem[];
  suggest(registry: string, prefix: string): string[];
  /** The geometry's bones, or `null` when the geometry is not a project element. */
  bones: readonly string[] | null;
  /** The vehicle's event ids. */
  events: readonly string[];
}

/**
 * A setter for one field of the optional record at `path`: it removes the record when the last
 * field goes and does nothing when a field that is not there is cleared.
 */
export function recordSetter(props: VehicleSectionProps, path: readonly (string | number)[]) {
  let current: Json | undefined = props.data;
  for (const key of path) current = asObject(current)[String(key)];
  const record = asObject(current);
  return (key: string, value: Json | undefined, typing = false) => {
    if (value === undefined) {
      if (!Object.hasOwn(record, key)) return;
      const rest = { ...record };
      delete rest[key];
      props.set(path, Object.keys(rest).length === 0 ? undefined : rest);
      return;
    }
    props.set([...path, key], value, typing ? typingKey(pointerOf([...path, key])) : undefined);
  };
}

/** The value at `path` of the data. */
export function valueAt(
  data: Json | undefined,
  path: readonly (string | number)[],
): Json | undefined {
  let current: Json | undefined = data;
  for (const key of path) {
    if (Array.isArray(current) && typeof key === 'number') current = current[key];
    else current = asObject(current)[String(key)];
    if (current === undefined) return undefined;
  }
  return current;
}

/** A number field over `path`, committing while typing (one undo step) and clearing to absent. */
export function NumberAt(props: {
  section: VehicleSectionProps;
  path: readonly (string | number)[];
  label: string;
  testId: string;
  integer?: boolean;
  /** Sets the value; defaults to `section.set` at `path`. */
  onCommit?(value: number | undefined): void;
}) {
  const { section, path } = props;
  return (
    <div className="flex flex-col">
      <NumberField
        label={props.label}
        value={valueAt(section.data, path)}
        allowEmpty
        integer={props.integer === true}
        testId={props.testId}
        invalid={section.problems.some((problem) => problem.path === pointerOf(path))}
        onCommit={(value) =>
          props.onCommit !== undefined
            ? props.onCommit(value)
            : section.set(path, value, typingKey(pointerOf(path)))
        }
      />
    </div>
  );
}

/** An id field over `path` with registry suggestions. */
export function IdAt(props: {
  section: VehicleSectionProps;
  path: readonly (string | number)[];
  label: string;
  registry: string;
  testId: string;
  onCommit?(value: string | undefined): void;
}) {
  const { section, path } = props;
  const value = valueAt(section.data, path);
  return (
    <IdField
      label={props.label}
      value={typeof value === 'string' ? value : ''}
      registry={props.registry}
      suggest={section.suggest}
      testId={props.testId}
      invalid={section.problems.some(
        (problem) => problem.path === pointerOf(path) && problem.severity === 'error',
      )}
      className="min-w-48"
      onCommit={(text) => {
        const next = text === '' ? undefined : text;
        if (props.onCommit !== undefined) props.onCommit(next);
        else section.set(path, next);
      }}
    />
  );
}

/** The problems at each of `keys` under `path`, and at `path` itself. */
export function ProblemsUnder(props: {
  problems: readonly FormProblem[];
  path: readonly (string | number)[];
  keys?: readonly string[];
}) {
  return (
    <>
      <ProblemsAt problems={props.problems} pointer={pointerOf(props.path)} />
      {(props.keys ?? []).map((key) => (
        <ProblemsAt key={key} problems={props.problems} pointer={pointerOf([...props.path, key])} />
      ))}
    </>
  );
}

/** An `[x, y, z]` offset in blocks: three number fields edited as one list. */
export function OffsetFields(props: {
  section: VehicleSectionProps;
  path: readonly (string | number)[];
  label: string;
  testId: string;
  fallback?: readonly [number, number, number];
}) {
  const { section, path } = props;
  const raw = valueAt(section.data, path);
  const current: [number, number, number] = Array.isArray(raw)
    ? ([0, 1, 2].map((index) => {
        const value = raw[index];
        return typeof value === 'number' ? value : 0;
      }) as [number, number, number])
    : [...(props.fallback ?? [0, 0, 0])];
  const axes = ['Right', 'Up', 'Forwards'] as const;
  return (
    <fieldset className="flex flex-col gap-1 text-xs">
      <legend className="text-muted">{props.label} (blocks)</legend>
      <div className="flex flex-wrap gap-2">
        {axes.map((axis, index) => (
          <NumberField
            key={axis}
            label={axis}
            value={current[index]}
            testId={`${props.testId}-${axis.toLowerCase()}`}
            onCommit={(value) => {
              if (value === undefined) return;
              const next = [...current];
              next[index] = value;
              section.set(path, next, typingKey(pointerOf(path)));
            }}
          />
        ))}
      </div>
      <ProblemsAt problems={section.problems} pointer={pointerOf(path)} />
    </fieldset>
  );
}
