/**
 * Pickers shared by the games Studios and the Structure Studio's "Chests and containers"
 * (B555): a block position, a percentage, a thing (an item, block, mob, effect, function or
 * dimension: a named button opening the ThingPicker in the main area) and a named id (a structure, loot table, advancement, dialog or world type: a
 * list of names). The main area never shows an id (ADR 0117 D3); the ids are in More options.
 *
 * @packageDocumentation
 */

import type { Json, Project } from '@msm/core';
import type { Target } from '@msm/plugin-api';
import { useId, useMemo, useState } from 'react';
import {
  THING_REGISTRIES,
  ThingPicker,
  type ThingPictures,
  type ThingRegistries,
  type ThingSort,
  thingName,
  thingSections,
} from '../../components/thing-picker/ThingPicker';
import { buttonClass } from '../../components/ui/Button';
import { InMore } from '../../components/ui/MoreOptions';
import { inputClass } from '../../forms';
import { useBlocksItemsStudioHost } from '../blocks-items/host';
import { usePlain } from '../plain';
import { IdField, NumberField } from '../structures/pickers';
import { chanceOfPercent, elementsOf, idWords, type Pos, percentOf, posOf } from './games-model';

/** A block position as three whole numbers, committed together. */
export function PosField(props: {
  label: string;
  value: Json | undefined;
  fallback?: Pos;
  testId: string;
  onCommit(pos: Pos): void;
}) {
  const pos = posOf(props.value, props.fallback);
  const axis = (at: 0 | 1 | 2, name: string) => (
    <NumberField
      label={`${props.label}: ${name}`}
      value={pos[at]}
      integer
      testId={`${props.testId}-${name.toLowerCase()}`}
      onCommit={(value) => {
        if (value === undefined) return;
        const next = [...pos] as Pos;
        next[at] = value;
        props.onCommit(next);
      }}
    />
  );
  return (
    <fieldset className="flex flex-col gap-1" data-testid={props.testId}>
      <legend className="text-muted text-xs">{props.label}</legend>
      <div className="flex flex-wrap items-end gap-2">
        {axis(0, 'X')}
        {axis(1, 'Y')}
        {axis(2, 'Z')}
      </div>
    </fieldset>
  );
}

/** A chance from 0 to 1 edited as a percentage (the game rolls in 10,000ths). */
export function PercentField(props: {
  label: string;
  value: Json | undefined;
  testId: string;
  onCommit(chance: number): void;
}) {
  return (
    <NumberField
      label={`${props.label} (%)`}
      value={percentOf(props.value)}
      testId={props.testId}
      onCommit={(value) => props.onCommit(chanceOfPercent(value ?? 0))}
    />
  );
}

/** The thing picker's registries from the Studio's suggestions, and pictures from the host. */
function usePickerSources(suggest: (registry: string, prefix: string) => string[]): {
  registries: ThingRegistries;
  pictures: ThingPictures | null;
} {
  const host = useBlocksItemsStudioHost();
  const registries = useMemo<ThingRegistries>(
    () => ({ ids: (registry) => suggest(registry, '') }),
    [suggest],
  );
  const pictures = useMemo<ThingPictures | null>(
    () => (host === null ? null : { project: host.thumbnail, revision: host.revision }),
    [host],
  );
  return { registries, pictures };
}

/**
 * One thing: a button with its name opening the ThingPicker, its id field with suggestions in
 * the section's More options (ADR 0130). An empty value reads `emptyLabel`.
 */
export function ThingField(props: {
  project: Project;
  target: Target;
  sort: ThingSort;
  label: string;
  value: string;
  testId: string;
  emptyLabel?: string;
  suggest(registry: string, prefix: string): string[];
  onChange(value: string | undefined): void;
}) {
  const plain = usePlain();
  const [open, setOpen] = useState(false);
  const { registries, pictures } = usePickerSources(props.suggest);
  const texturesFolder = props.target.folders.resource.textures;
  const sections = useMemo(
    () =>
      open
        ? thingSections({ project: props.project, registries, sort: props.sort, texturesFolder })
        : [],
    [open, props.project, registries, props.sort, texturesFolder],
  );
  const idField = (
    <IdField
      label={props.label}
      value={props.value}
      registry={THING_REGISTRIES[props.sort]}
      suggest={props.suggest}
      testId={props.testId}
      onCommit={(text) => props.onChange(text === '' ? undefined : text)}
    />
  );
  if (!plain) return idField;
  const words =
    props.value === ''
      ? (props.emptyLabel ?? 'Pick…')
      : thingName(props.project, props.value, props.sort);
  return (
    <div className="flex min-w-0 flex-col gap-0.5 text-xs">
      <span className="text-muted">{props.label}</span>
      <button
        type="button"
        className={`${buttonClass} self-start`}
        data-testid={`${props.testId}-plain`}
        onClick={() => setOpen(true)}
      >
        {words}
      </button>
      <InMore fallbackKey={props.testId}>{idField}</InMore>
      {open && (
        <ThingPicker
          title={`Pick: ${props.label.toLowerCase()}`}
          sort={props.sort}
          sections={sections}
          value={props.value === '' ? undefined : props.value}
          pictures={pictures}
          noneLabel={props.emptyLabel}
          onCancel={() => setOpen(false)}
          onPick={(id) => {
            setOpen(false);
            props.onChange(id ?? undefined);
          }}
        />
      )}
    </div>
  );
}

/** One choice of a {@link NamedIdField}. */
export interface NamedChoice {
  readonly id: string;
  readonly name: string;
}

/**
 * The choices of a named id list: the project's elements of `kinds` first (by their names),
 * then the game's ids of `registry` that `vanilla` keeps, each in words; `current` is kept.
 */
export function namedChoices(input: {
  project: Project;
  kinds: readonly string[];
  registry: string;
  suggest(registry: string, prefix: string): string[];
  vanilla?(id: string): boolean;
  current: string;
}): NamedChoice[] {
  const out: NamedChoice[] = [];
  const seen = new Set<string>();
  const add = (id: string, name: string) => {
    if (id === '' || seen.has(id)) return;
    seen.add(id);
    out.push({ id, name });
  };
  for (const kind of input.kinds) {
    for (const element of elementsOf(input.project, kind)) {
      add(element.id, thingName(input.project, element.id));
    }
  }
  const keep = input.vanilla;
  if (keep !== undefined) {
    const own = out.length;
    const vanilla = input.suggest(input.registry, '').filter((id) => !seen.has(id) && keep(id));
    for (const id of vanilla) add(id, idWords(id));
    out.splice(
      own,
      out.length - own,
      ...out.slice(own).sort((a, b) => a.name.localeCompare(b.name)),
    );
  }
  if (input.current !== '' && !seen.has(input.current)) {
    out.unshift({ id: input.current, name: thingName(input.project, input.current) });
  }
  return out;
}

/**
 * A named id (a structure, loot table, advancement, dialog or world type): a list of names (the
 * project's own first, then the game's that `vanilla` keeps), with the id field and its
 * suggestions in the section's More options (ADR 0130).
 */
export function NamedIdField(props: {
  project: Project;
  label: string;
  value: string;
  registry: string;
  kinds: readonly string[];
  testId: string;
  emptyLabel: string;
  suggest(registry: string, prefix: string): string[];
  vanilla?(id: string): boolean;
  onChange(value: string | undefined): void;
}) {
  const plain = usePlain();
  const id = useId();
  const idField = (
    <IdField
      label={props.label}
      value={props.value}
      registry={props.registry}
      suggest={props.suggest}
      testId={props.testId}
      onCommit={(text) => props.onChange(text === '' ? undefined : text)}
    />
  );
  if (!plain) return idField;
  const choices = namedChoices({
    project: props.project,
    kinds: props.kinds,
    registry: props.registry,
    suggest: props.suggest,
    ...(props.vanilla === undefined ? {} : { vanilla: props.vanilla }),
    current: props.value,
  });
  return (
    <div className="flex min-w-0 flex-col gap-0.5 text-xs">
      <label htmlFor={id} className="text-muted">
        {props.label}
      </label>
      <select
        id={id}
        className={inputClass}
        data-testid={`${props.testId}-plain`}
        value={props.value}
        onChange={(event) =>
          props.onChange(event.target.value === '' ? undefined : event.target.value)
        }
      >
        <option value="">{props.emptyLabel}</option>
        {choices.map((choice) => (
          <option key={choice.id} value={choice.id}>
            {choice.name}
          </option>
        ))}
      </select>
      <InMore fallbackKey={props.testId}>{idField}</InMore>
    </div>
  );
}

/** A labelled multi-line text field; `onCommit(undefined)` when cleared. */
export function TextArea(props: {
  label: string;
  value: Json | undefined;
  testId: string;
  placeholder?: string;
  onCommit(value: string | undefined): void;
}) {
  const id = useId();
  const external = typeof props.value === 'string' ? props.value : '';
  const [text, setText] = useState(external);
  const [shown, setShown] = useState(external);
  if (shown !== external) {
    setShown(external);
    setText(external);
  }
  return (
    <div className="flex min-w-0 flex-col gap-0.5 text-xs">
      <label htmlFor={id} className="text-muted">
        {props.label}
      </label>
      <textarea
        id={id}
        rows={2}
        className={inputClass}
        data-testid={props.testId}
        placeholder={props.placeholder}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          props.onCommit(event.target.value === '' ? undefined : event.target.value);
        }}
      />
    </div>
  );
}
