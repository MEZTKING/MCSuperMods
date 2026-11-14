/**
 * A chip: one blank of a rule's sentence (ADR 0082 D1). Every chip is a button whose accessible
 * name says what the blank is and what it holds ("Item: Ruby"); it opens the editor its slot
 * type needs: the ThingPicker for things, a menu for choices, who and places, the number and
 * reading editor, the text editor or the counter picker. A chip with a problem is marked and
 * points at the problem lines under its row.
 *
 * @packageDocumentation
 */

import type { Json, Problem } from '@msm/core';
import type { SlotSpec } from '@msm/plugin-rules';
import { type ReactNode, useId, useMemo, useState } from 'react';
import { ThingPicker } from '../../components/thing-picker/ThingPicker';
import {
  THING_WORDS,
  type ThingSort,
  thingSections,
} from '../../components/thing-picker/thing-sources';
import { Button } from '../../components/ui/Button';
import { inputClass } from '../../forms';
import { useBookEdit, useRulesEnv } from './env';
import { ChipPopover, chipClass, MenuList, ProblemLines } from './parts';
import {
  acceptsReadings,
  asObject,
  getAt,
  type JsonObject,
  offeredPlaces,
  offeredWho,
  type RuleScope,
  setAt,
} from './rules-model';
import {
  emptyWords,
  sentenceContext,
  sentenceParts,
  slotLabel,
  slotWords,
  THING_SLOTS,
} from './slot-words';
import { CounterEditor, NumberEditor, TextEditor } from './ValueEditor';

/** Props of {@link SlotChip}. */
export interface SlotChipProps {
  /** The object holding the slot: a step, a condition or a trigger's options. */
  ownerPointer: string;
  /** The step or condition id, or `when` for trigger options. */
  ownerId: string;
  slot: SlotSpec;
  scope: RuleScope;
  /** What an absent optional value means (shown muted). */
  defaults?: Readonly<Record<string, Json>>;
  /** `mob_is` takes one entity, never every player. */
  singleWho?: boolean;
  /** The id of the row's problem lines, when this chip has problems. */
  describedBy?: string;
  /** Words for an absent optional value that has no default ("in the world"). */
  absentWords?: string;
}

/** The chip of one slot. */
export function SlotChip(props: SlotChipProps) {
  const { slot } = props;
  const env = useRulesEnv();
  const { book } = useBookEdit();
  const pointer = `${props.ownerPointer}/${slot.name}`;
  const owner: JsonObject = asObject(getAt(book, props.ownerPointer)) ?? {};
  const context = sentenceContext((id) => env.name(id), props.scope.trigger);
  const own = slotWords(slot, owner, context);
  const fallback = own === undefined ? slotWords(slot, owner, context, props.defaults) : undefined;
  const words = own ?? fallback ?? props.absentWords ?? emptyWords(slot);
  const invalid = (env.problems.get(pointer)?.length ?? 0) > 0;
  const label = slotLabel(slot);
  const common = {
    pointer,
    label: words,
    ariaLabel: `${label}: ${words}`,
    invalid,
    describedBy: invalid ? props.describedBy : undefined,
    testId: `rules-chip-${slot.name}`,
    className: chipClass({
      empty: own === undefined && fallback === undefined && props.absentWords === undefined,
      muted: own === undefined && (fallback !== undefined || props.absentWords !== undefined),
      invalid,
    }),
  };

  const sort = THING_SLOTS[slot.type];
  if (sort !== undefined) {
    return <ThingChip {...common} sort={sort} slot={slot} />;
  }
  switch (slot.type) {
    case 'choice':
      return (
        <ChipPopover {...common}>
          <ChoiceMenu pointer={pointer} slot={slot} />
        </ChipPopover>
      );
    case 'who':
      return (
        <ChipPopover {...common}>
          <WhoMenu pointer={pointer} scope={props.scope} single={props.singleWho === true} />
        </ChipPopover>
      );
    case 'place':
      return (
        <ChipPopover {...common}>
          <PlaceMenu pointer={pointer} scope={props.scope} optional={slot.optional === true} />
        </ChipPopover>
      );
    case 'number':
    case 'seconds':
    case 'percent':
      return (
        <ChipPopover {...common}>
          <NumberEditor
            pointer={pointer}
            slot={slot}
            label={label}
            scope={props.scope}
            readings={props.ownerId !== 'when' && acceptsReadings(props.ownerId, slot.name)}
          />
          {slot.optional === true && <DefaultButton pointer={pointer} />}
        </ChipPopover>
      );
    case 'text':
      return (
        <ChipPopover {...common}>
          <TextEditor pointer={pointer} slot={slot} label={label} scope={props.scope} />
          {slot.optional === true && <DefaultButton pointer={pointer} label="Remove" />}
        </ChipPopover>
      );
    case 'counter':
      return (
        <ChipPopover {...common}>
          <CounterEditor pointer={props.ownerPointer} scope={props.scope} />
        </ChipPopover>
      );
    default:
      return <span className={common.className}>{words}</span>;
  }
}

/** "Use the default": removes an optional value. */
function DefaultButton(props: { pointer: string; label?: string }) {
  const { book, change } = useBookEdit();
  const present = getAt(book, props.pointer) !== undefined;
  return (
    <Button
      data-testid="rules-chip-default"
      disabled={!present}
      onClick={() => change(setAt(book, props.pointer, undefined))}
    >
      {props.label ?? 'Use the default'}
    </Button>
  );
}

/** A thing chip: opens the ThingPicker. */
function ThingChip(props: {
  pointer: string;
  label: string;
  ariaLabel: string;
  invalid: boolean;
  describedBy: string | undefined;
  testId: string;
  className: string;
  sort: ThingSort;
  slot: SlotSpec;
}) {
  const env = useRulesEnv();
  const { book, change } = useBookEdit();
  const [open, setOpen] = useState(false);
  const raw = getAt(book, props.pointer);
  const value = typeof raw === 'string' ? raw : asObject(raw)?.type;
  const sections = useMemo(
    () =>
      open
        ? thingSections({
            project: env.project,
            registries: env.registries,
            sort: props.sort,
            texturesFolder: env.texturesFolder,
          })
        : [],
    [open, env.project, env.registries, env.texturesFolder, props.sort],
  );
  return (
    <>
      <button
        type="button"
        className={props.className}
        aria-label={props.ariaLabel}
        aria-invalid={props.invalid ? true : undefined}
        aria-describedby={props.describedBy}
        data-testid={props.testId}
        data-pointer={props.pointer}
        title={env.mode.advanced && typeof value === 'string' ? value : undefined}
        onClick={() => setOpen(true)}
      >
        {props.label}
      </button>
      {open && (
        <ThingPicker
          title={`Pick ${THING_WORDS[props.sort].one}`}
          sort={props.sort}
          sections={sections}
          value={typeof value === 'string' ? value : undefined}
          pictures={env.pictures}
          onCancel={() => setOpen(false)}
          onPick={(id) => {
            setOpen(false);
            if (id === null) return;
            const object = asObject(raw);
            // A particle with options keeps them (ADR 0080's options objects).
            change(setAt(book, props.pointer, object === undefined ? id : { ...object, type: id }));
          }}
        />
      )}
    </>
  );
}

/** The menu of a choice slot. */
function ChoiceMenu(props: { pointer: string; slot: SlotSpec }) {
  const { book, change } = useBookEdit();
  const value = getAt(book, props.pointer);
  const choices = (props.slot.choices ?? []).map((choice) => ({
    key: JSON.stringify(choice.value),
    label: choice.label,
    chosen: choice.value === value,
    testId: `rules-choice-${String(choice.value)}`,
  }));
  if (props.slot.optional === true) {
    choices.push({
      key: '',
      label: 'The default',
      chosen: value === undefined,
      testId: 'rules-choice-default',
    });
  }
  return (
    <MenuList
      label={slotLabel(props.slot)}
      choices={choices}
      onPick={(key) =>
        change(setAt(book, props.pointer, key === '' ? undefined : (JSON.parse(key) as Json)))
      }
    />
  );
}

/** The "who" menu, with the distance of "every player nearby". */
function WhoMenu(props: { pointer: string; scope: RuleScope; single: boolean }) {
  const env = useRulesEnv();
  const { book, change } = useBookEdit();
  const value = getAt(book, props.pointer);
  const kind = typeof value === 'string' ? value : asObject(value)?.who;
  const context = sentenceContext((id) => env.name(id), props.scope.trigger);
  const entries = offeredWho(props.scope, { veryEasy: env.mode.veryEasy, single: props.single });
  return (
    <>
      {kind === 'players_nearby' && (
        <span className="flex items-center gap-1.5">
          within
          <NumberEditor
            pointer={`${props.pointer}/radius`}
            slot={{ name: 'radius', type: 'number', min: 1, max: 64, whole: true }}
            label="Blocks away"
            scope={props.scope}
            readings={false}
          />
          blocks
        </span>
      )}
      <MenuList
        label="Who"
        choices={entries.map((entry) => ({
          key: entry.id,
          label:
            entry.id === 'player' || entry.id === 'mob' || entry.id === 'other'
              ? capitalise(
                  context.trigger?.actorLabels[entry.id as 'player' | 'mob' | 'other'] ??
                    entry.label,
                )
              : entry.label,
          chosen: entry.id === kind,
          testId: `rules-who-${entry.id}`,
        }))}
        onPick={(id) =>
          change(
            setAt(
              book,
              props.pointer,
              id === 'players_nearby' ? { radius: 8, who: 'players_nearby' } : id,
            ),
          )
        }
      />
    </>
  );
}

const capitalise = (text: string): string =>
  text.length === 0 ? text : text.charAt(0).toUpperCase() + text.slice(1);

/** The place menu, with the distance of "where the player looks" and an offset's numbers. */
function PlaceMenu(props: { pointer: string; scope: RuleScope; optional: boolean }) {
  const env = useRulesEnv();
  const { book, change } = useBookEdit();
  const value = getAt(book, props.pointer);
  const kind = typeof value === 'string' ? value : asObject(value)?.place;
  const entries = offeredPlaces(props.scope, { veryEasy: env.mode.veryEasy });
  const fromId = useId();
  return (
    <>
      {kind === 'player_looking' && (
        <span className="flex items-center gap-1.5">
          up to
          <NumberEditor
            pointer={`${props.pointer}/distance`}
            slot={{ name: 'distance', type: 'number', min: 1, max: 64, whole: true }}
            label="Blocks away"
            scope={props.scope}
            readings={false}
          />
          blocks
        </span>
      )}
      {kind === 'offset' && (
        <div className="flex flex-col gap-1" data-testid="rules-offset">
          {(['x', 'y', 'z'] as const).map((axis, index) => (
            <span key={axis} className="flex items-center gap-1.5">
              {axis}
              <NumberEditor
                pointer={`${props.pointer}/offset/${index}`}
                slot={{ name: axis, type: 'number' }}
                label={`${axis} blocks`}
                scope={props.scope}
                readings={false}
              />
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <label htmlFor={fromId}>from</label>
            <select
              id={fromId}
              className={inputClass}
              value={
                typeof asObject(value)?.from === 'string'
                  ? (asObject(value)?.from as string)
                  : 'here'
              }
              onChange={(event) =>
                change(
                  setAt(
                    book,
                    `${props.pointer}/from`,
                    event.target.value === 'here' ? undefined : event.target.value,
                  ),
                )
              }
            >
              {entries
                .filter((entry) => typeof entry.id === 'string' && entry.slots.length === 0)
                .map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
            </select>
          </span>
        </div>
      )}
      <MenuList
        label="Where"
        choices={entries.map((entry) => ({
          key: entry.id,
          label: entry.label,
          chosen: entry.id === kind,
          testId: `rules-place-${entry.id}`,
        }))}
        onPick={(id) => {
          const next: Json =
            id === 'player_looking'
              ? { place: 'player_looking' }
              : id === 'offset'
                ? { offset: [0, 1, 0], place: 'offset' }
                : id;
          change(setAt(book, props.pointer, props.optional && id === 'here' ? undefined : next));
        }}
      />
    </>
  );
}

/** Problems at a row and its slots, and the id their lines carry. */
export function rowProblems(
  problems: ReadonlyMap<string, readonly Problem[]>,
  rowPointer: string,
  slots: readonly SlotSpec[],
): Problem[] {
  const out: Problem[] = [...(problems.get(rowPointer) ?? [])];
  for (const slot of slots) out.push(...(problems.get(`${rowPointer}/${slot.name}`) ?? []));
  return out;
}

const capitaliseFirst = (text: string, first: boolean): string => (first ? capitalise(text) : text);

/**
 * A sentence with chips for its blanks (`{slot}` in `template`); slots the template does not
 * name follow under "More" with their labels. The row's problems are listed underneath.
 */
export function SentenceRow(props: {
  template: string;
  slots: readonly SlotSpec[];
  ownerPointer: string;
  ownerId: string;
  scope: RuleScope;
  defaults?: Readonly<Record<string, Json>>;
  singleWho?: boolean;
  /** Words for absent optional slots by name. */
  absentWords?: Readonly<Record<string, string>>;
  /** Capitalise the first word (a step or condition on its own line). */
  capitalise?: boolean;
  /** Rendered before the sentence (the trigger chip). */
  lead?: ReactNode;
  /** Chips drawn by the caller for blanks that are not slots of the owner (the trigger's thing). */
  special?: Readonly<Record<string, ReactNode>>;
}) {
  const env = useRulesEnv();
  const { book } = useBookEdit();
  const problemsId = useId();
  const owner = asObject(getAt(book, props.ownerPointer)) ?? {};
  const problems = rowProblems(env.problems, props.ownerPointer, props.slots);
  const parts = sentenceParts(props.template);
  const named = new Set(parts.flatMap((part) => (part.slot === undefined ? [] : [part.slot])));
  const bySlot = new Map(props.slots.map((slot) => [slot.name, slot]));
  const extras = props.slots.filter(
    (slot) => !named.has(slot.name) && (owner[slot.name] !== undefined || !env.mode.veryEasy),
  );
  const chip = (slot: SlotSpec) => (
    <SlotChip
      key={slot.name}
      ownerPointer={props.ownerPointer}
      ownerId={props.ownerId}
      slot={slot}
      scope={props.scope}
      {...(props.defaults === undefined ? {} : { defaults: props.defaults })}
      {...(props.singleWho === true ? { singleWho: true } : {})}
      {...(props.absentWords?.[slot.name] === undefined
        ? {}
        : { absentWords: props.absentWords[slot.name] })}
      {...(problems.length > 0 ? { describedBy: problemsId } : {})}
    />
  );
  return (
    <div className="flex flex-col gap-1">
      <p className="flex flex-wrap items-center gap-1 leading-7">
        {props.lead}
        {parts.map((part, index) => {
          if (part.slot === undefined) {
            const text = capitaliseFirst(part.text, index === 0 && props.capitalise === true);
            return <span key={index}>{text}</span>;
          }
          const special = props.special?.[part.slot];
          if (special !== undefined) return <span key={part.slot}>{special}</span>;
          const slot = bySlot.get(part.slot);
          return slot === undefined ? null : chip(slot);
        })}
      </p>
      {extras.length > 0 && (
        <p className="flex flex-wrap items-center gap-1 text-xs text-muted">
          <span>More:</span>
          {extras.map((slot) => (
            <span key={slot.name} className="inline-flex items-center gap-1">
              {slotLabel(slot)} {chip(slot)}
            </span>
          ))}
        </p>
      )}
      <ProblemLines problems={problems} id={problemsId} />
    </div>
  );
}
