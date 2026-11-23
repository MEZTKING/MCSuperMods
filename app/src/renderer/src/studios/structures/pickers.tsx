/**
 * Small labelled fields shared by the structure Studios (an id picker over `IdInput`, a
 * number field and a select), plus schema readers for choices (enum and literal values,
 * dispatcher keys) so no version fact is hard-coded here.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/core';
import type { SchemaNode } from '@msm/schemas';
import { type ReactNode, useContext, useId, useState } from 'react';
import { SoundPlayButton } from '../../audio/SoundPlayButton';
import { isSoundEventRegistry } from '../../audio/sound-pickers';
import { InMore } from '../../components/ui/MoreOptions';
import { IdInput, idSuggestions, inputClass, resolveNode, type SuggestIds } from '../../forms';
import { literalChoices, pickableKeys, structShape } from '../../forms/schema-utils';
import { usePlain } from '../plain';
import { PlainIdField, PlainThingsContext, plainIdWords, plainWordsIn } from '../plain-things';
import type { PoolStatus } from './connections';

const labelClass = 'flex min-w-0 flex-col gap-0.5 text-xs';

/** A visible caption above a control whose `aria-label` is the same text. */
function Labelled(props: { label: string; children: ReactNode; className?: string }) {
  // The control carries the same text as its `aria-label`.
  return (
    <div
      className={props.className === undefined ? labelClass : `${labelClass} ${props.className}`}
    >
      <span className="text-muted" aria-hidden>
        {props.label}
      </span>
      {props.children}
    </div>
  );
}

/** An id field with registry suggestions (project and vanilla ids, `#` for tags). */
export function IdField(props: {
  label: string;
  value: string;
  registry: string;
  suggest?: SuggestIds | undefined;
  onCommit(text: string): void;
  testId?: string;
  invalid?: boolean;
  className?: string;
  /** For a sound event field: the volume and pitch its Play button multiplies by. */
  sound?: { volume?: number; pitch?: number } | undefined;
}) {
  const { suggest, registry } = props;
  const plain = usePlain();
  // A sound has its Play button beside it (ADR 0121 D2, B622).
  // The wrapper stays while the field is empty, so clearing it never remounts the input.
  const soundField = isSoundEventRegistry(registry);
  const play =
    soundField && props.value.trim() !== '' ? (
      <SoundPlayButton
        event={props.value.trim()}
        compact
        {...(props.sound === undefined ? {} : props.sound)}
      />
    ) : null;
  // Plain (ADR 0130 D2): the thing's name, picked by name where it can be; the id itself is in
  // the section's More options.
  if (plain) {
    const field = (
      <PlainIdField
        label={props.label}
        value={props.value}
        registry={registry}
        testId={props.testId === undefined ? undefined : `${props.testId}-plain`}
        className={props.className}
        onCommit={(text) => props.onCommit(text.trim())}
      />
    );
    return (
      <>
        {!soundField ? (
          field
        ) : (
          <span className="flex min-w-0 items-end gap-1">
            {field}
            {play}
          </span>
        )}
        <InMore fallbackKey={`id-${props.testId ?? props.label}`}>
          <IdField {...props} />
        </InMore>
      </>
    );
  }
  const input = (
    <IdInput
      value={props.value}
      label={props.label}
      onCommit={(text) => props.onCommit(text.trim())}
      suggestions={(text) => idSuggestions(suggest, registry, text)}
      {...(props.testId === undefined ? {} : { testId: props.testId })}
      invalid={props.invalid === true}
      className="font-mono"
    />
  );
  return (
    <Labelled
      label={props.label}
      {...(props.className === undefined ? {} : { className: props.className })}
    >
      {!soundField ? (
        input
      ) : (
        <span className="flex min-w-0 items-center gap-1">
          {input}
          {play}
        </span>
      )}
    </Labelled>
  );
}

/**
 * A number field: edits commit while typing (with a `typing:` coalescing key by the caller),
 * and an empty field commits `undefined` when {@link allowEmpty} is set.
 */
export function NumberField(props: {
  label: string;
  value: Json | undefined;
  onCommit(value: number | undefined): void;
  testId?: string;
  integer?: boolean;
  allowEmpty?: boolean;
  invalid?: boolean;
}) {
  const external = typeof props.value === 'number' ? String(props.value) : '';
  const [text, setText] = useState(external);
  // Reset during render, not in an effect: a mount effect can run after the first keystroke and wipe it.
  const [shown, setShown] = useState(external);
  if (shown !== external) {
    setShown(external);
    setText(external);
  }
  return (
    <Labelled label={props.label}>
      <input
        type="number"
        aria-label={props.label}
        inputMode={props.integer === true ? 'numeric' : 'decimal'}
        step={props.integer === true ? 1 : 'any'}
        className={`${inputClass} w-24`}
        data-testid={props.testId}
        aria-invalid={props.invalid === true}
        value={text}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          if (next.trim() === '') {
            if (props.allowEmpty === true) props.onCommit(undefined);
            return;
          }
          const parsed = Number(next);
          if (!Number.isFinite(parsed)) return;
          if (props.integer === true && !Number.isInteger(parsed)) return;
          if (parsed !== props.value) props.onCommit(parsed);
        }}
      />
    </Labelled>
  );
}

/** A select over string choices; the current value is kept as an option when it is not one. */
export function SelectField(props: {
  label: string;
  value: string | undefined;
  choices: readonly string[];
  onChange(value: string | undefined): void;
  /** The label of an empty choice that removes the value; no empty choice when absent. */
  emptyLabel?: string;
  testId?: string;
}) {
  const id = useId();
  // Plain names a choice that is an id by its words (ADR 0130 D2).
  const plain = usePlain();
  const things = useContext(PlainThingsContext);
  const words = (option: string) =>
    plain && option.includes(':') ? plainIdWords(things?.project, option) : option;
  const label = plain ? plainWordsIn(props.label) : props.label;
  const emptyLabel =
    plain && props.emptyLabel !== undefined ? plainWordsIn(props.emptyLabel) : props.emptyLabel;
  const current = props.value ?? '';
  const options = [...props.choices];
  if (current !== '' && !options.includes(current)) options.unshift(current);
  return (
    <div className={labelClass}>
      <label htmlFor={id} className="text-muted">
        {label}
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
        {(emptyLabel !== undefined || current === '') && (
          <option value="">{emptyLabel ?? '(none)'}</option>
        )}
        {options.map((option) => (
          <option key={option} value={option}>
            {words(option)}
          </option>
        ))}
      </select>
    </div>
  );
}

/** The words shown for a pool status. */
export const POOL_STATUS_LABELS: Readonly<Record<PoolStatus, string>> = Object.freeze({
  project: 'In project',
  vanilla: 'Vanilla',
  missing: 'Missing',
});

/** The string values a schema node allows: enum values or a union of literals; else `[]`. */
export function stringChoices(node: SchemaNode | undefined): string[] {
  if (node === undefined) return [];
  const resolved = resolveNode(node);
  if (resolved.kind === 'enum') return resolved.values.map((entry) => String(entry.value));
  if (resolved.kind === 'union') {
    return (literalChoices(resolved) ?? []).filter(
      (value): value is string => typeof value === 'string',
    );
  }
  if (resolved.kind === 'literal' && typeof resolved.value === 'string') return [resolved.value];
  return [];
}

/** The node of field `key` of a struct (or dispatcher) node for `value`, or `undefined`. */
export function fieldNode(
  node: SchemaNode | undefined,
  value: Json | undefined,
  key: string,
): SchemaNode | undefined {
  if (node === undefined) return undefined;
  const resolved = resolveNode(node);
  if (resolved.kind !== 'struct' && resolved.kind !== 'dispatcher') return undefined;
  return structShape(resolved, value).fields.find((field) => field.key === key)?.type;
}

/** The item node of a list node, or `undefined`. */
export function listItemNode(node: SchemaNode | undefined): SchemaNode | undefined {
  if (node === undefined) return undefined;
  const resolved = resolveNode(node);
  return resolved.kind === 'list' ? resolved.item : undefined;
}

/**
 * The values a field-keyed dispatcher allows for `key` on a struct (or dispatcher) node, as
 * `minecraft:<key>` ids, plus `extra` ids (for example a vanilla registry, for types whose
 * dispatcher has no member). Sorted, without duplicates.
 */
export function discriminatorChoices(
  node: SchemaNode | undefined,
  value: Json | undefined,
  key: string,
  extra: readonly string[] = [],
): string[] {
  const out = new Set<string>();
  if (node !== undefined) {
    const resolved = resolveNode(node);
    if (resolved.kind === 'struct' || resolved.kind === 'dispatcher') {
      const discriminator = structShape(resolved, value).discriminators.find(
        (entry) => entry.key === key,
      );
      if (discriminator !== undefined) {
        for (const choice of pickableKeys(discriminator.dispatcher)) {
          out.add(choice.includes(':') ? choice : `minecraft:${choice}`);
        }
      }
    }
  }
  for (const choice of extra) out.add(choice.includes(':') ? choice : `minecraft:${choice}`);
  return [...out].sort();
}
