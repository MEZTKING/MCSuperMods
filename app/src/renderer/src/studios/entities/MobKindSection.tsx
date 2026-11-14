/**
 * The Entity Studio's "Kind of mob" section (B297, ADR 0070 D6, ADR 0073 D5): one picker that
 * sets base, category, spawn placement, spawn rule and movement mode in one undoable edit
 * ({@link withMobKind}), plus the base picker on its own (every value stays editable). Also
 * the small parts the other mob sections share: a labelled choice field and the on/off
 * component helper.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/core';
import { useId, useState } from 'react';
import { inputClass } from '../../forms';
import { typingKey } from '../../forms/context';
import { asObject, pointerOf } from '../blocks-items/blocks-items-model';
import { CheckField, ProblemsAt } from '../blocks-items/parts';
import { Section } from '../worldgen/parts';
import {
  baseOf,
  MOB_BASE_LABELS,
  MOB_BASES,
  MOB_KINDS,
  type MobSectionProps,
  matchingKinds,
  mobKind,
  withMobKind,
} from './mob-kinds';

type JsonObject = { [key: string]: Json };

/** A labelled select whose options show words for their values. */
export function ChoiceField(props: {
  label: string;
  value: string | undefined;
  choices: readonly string[];
  labels: Readonly<Record<string, string>>;
  onChange(value: string | undefined): void;
  /** The label of an empty choice that removes the value; no empty choice when absent. */
  emptyLabel?: string;
  testId?: string;
}) {
  const id = useId();
  const current = props.value ?? '';
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

/** Tools for one optional component of `components`: on, its fields, set, toggle, problems. */
export function componentTools(props: MobSectionProps, component: string) {
  const components = asObject(asObject(props.data).components);
  const on = components[component] !== undefined;
  const value = asObject(components[component]);
  const path = ['components', component] as const;
  return {
    on,
    value,
    /** The pointer of one field (or the component itself). */
    pointer: (...keys: (string | number)[]) => pointerOf([...path, ...keys]),
    /** Sets one field; `typing` merges the edits of one typing gesture into one undo step. */
    setField(key: string | readonly (string | number)[], next: Json | undefined, typing = false) {
      const keys = typeof key === 'string' ? [key] : key;
      props.set(
        [...path, ...keys],
        next,
        typing ? typingKey(pointerOf([...path, ...keys])) : undefined,
      );
    },
    /** Switches the component on (restoring the last value, else `fresh`) or off. */
    toggle(checked: boolean, fresh: () => JsonObject) {
      if (checked) {
        props.set([...path], props.remembered(component) ?? fresh());
        return;
      }
      props.remember(component, components[component]);
      props.set([...path], undefined);
    },
  };
}

/** A number value from a component's fields, for `NumberField`. */
export const numberAt = (object: JsonObject, key: string): Json | undefined =>
  typeof object[key] === 'number' ? object[key] : undefined;

/** A checkbox over an optional boolean field with a default: the default is stored as absent. */
export function DefaultCheck(props: {
  label: string;
  value: Json | undefined;
  fallback: boolean;
  testId: string;
  onChange(value: boolean | undefined): void;
}) {
  return (
    <CheckField
      label={props.label}
      checked={typeof props.value === 'boolean' ? props.value : props.fallback}
      testId={props.testId}
      onChange={(checked) => props.onChange(checked === props.fallback ? undefined : checked)}
    />
  );
}

/** Problems at each listed field of a component. */
export function FieldProblems(props: {
  problems: MobSectionProps['problems'];
  component: string;
  keys: readonly string[];
}) {
  return (
    <>
      <ProblemsAt problems={props.problems} pointer={pointerOf(['components', props.component])} />
      {props.keys.map((key) => (
        <ProblemsAt
          key={key}
          problems={props.problems}
          pointer={pointerOf(['components', props.component, key])}
        />
      ))}
    </>
  );
}

/** The "Kind of mob" section. */
export function MobKindSection(props: MobSectionProps) {
  const matches = matchingKinds(props.data);
  // "Farm animal" and "Pet" write the same values: the last pick wins while it still matches.
  const [picked, setPicked] = useState<string | undefined>(undefined);
  const current =
    picked !== undefined && matches.some((kind) => kind.id === picked) ? picked : matches[0]?.id;
  const kind = mobKind(current);
  const base = baseOf(props.data);
  return (
    <Section title="Kind of mob" testId="entity-mob-kind">
      <div className="flex flex-wrap items-end gap-2">
        <ChoiceField
          label="Kind of mob"
          value={current}
          choices={MOB_KINDS.map((entry) => entry.id)}
          labels={Object.fromEntries(MOB_KINDS.map((entry) => [entry.id, entry.label]))}
          emptyLabel="(custom)"
          testId="entity-kind"
          onChange={(value) => {
            const next = mobKind(value);
            if (next === undefined) return;
            setPicked(next.id);
            props.replace(withMobKind(props.data, next));
          }}
        />
        <ChoiceField
          label="Base"
          value={base}
          choices={MOB_BASES}
          labels={MOB_BASE_LABELS}
          testId="entity-base"
          onChange={(value) => props.set(['base'], value === 'mob' ? undefined : value)}
        />
      </div>
      <p className="text-muted text-xs" data-testid="entity-kind-note">
        {kind === undefined
          ? 'The base, category, movement and spawn rule match no kind; every value stays editable below.'
          : kind.description}{' '}
        Picking a kind sets the base, category, movement and the spawn placement and rule together.
        The base is fixed when the game starts: changing it needs a restart.
      </p>
      <ProblemsAt problems={props.problems} pointer="/base" />
    </Section>
  );
}
