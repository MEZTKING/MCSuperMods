/**
 * A chip that opens the ThingPicker (ADR 0082 D7) for one slot: an item, block, mob and the
 * other things of `THING_SLOTS`, and the games slot types of Rules 3 (B553: a loot table, a
 * structure and the project's teams, scores, timers, areas and magic blocks). The chip shows
 * the thing's name, never its id outside Advanced. For a team, score, timer, area, magic block
 * or loot table the picker offers "Make a new one", which makes the thing in the book's
 * namespace and picks it in one undo step (`changeWith`, as "Make a new on-screen number").
 * Kept apart from `SlotChip.tsx` so the reading editor (`ValueEditor.tsx`) can use it too.
 * A sound chip with a sound picked has a small Play button beside it (ADR 0121 D2 follow-up),
 * test id `<chip's test id>-play`; it names no id, so Very easy shows none.
 *
 * @packageDocumentation
 */

import type { SlotSpec } from '@msm/plugin-rules';
import { useMemo, useState } from 'react';
import { SoundPlayButton } from '../../audio/SoundPlayButton';
import { ThingPicker } from '../../components/thing-picker/ThingPicker';
import {
  PROJECT_ONLY_SORTS,
  THING_WORDS,
  type ThingSort,
  thingSections,
} from '../../components/thing-picker/thing-sources';
import { MAKEABLE_SORTS, newGameThing, newThingLabel } from './book-changes';
import { useBookEdit, useRulesEnv } from './env';
import { chipClass } from './parts';
import { asObject, getAt, type JsonObject, setAt } from './rules-model';
import { emptyWords, sentenceContext, slotLabel, slotWords, THING_SLOTS } from './slot-words';

/** The namespace of an id (`demo` of `demo:rules`); `minecraft` without one. */
const namespaceOf = (id: string): string =>
  id.includes(':') ? id.slice(0, id.indexOf(':')) : 'minecraft';

/** Props of {@link ThingChip}. */
export interface ThingChipProps {
  pointer: string;
  label: string;
  ariaLabel: string;
  invalid: boolean;
  describedBy: string | undefined;
  testId: string;
  className: string;
  sort: ThingSort;
  slot: SlotSpec;
  /** Offers a first tile with these words that picks "block" (what caused it). */
  blockLabel?: string;
}

/** A thing chip: opens the ThingPicker. */
export function ThingChip(props: ThingChipProps) {
  const env = useRulesEnv();
  const { book, change, changeWith } = useBookEdit();
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
            ...(PROJECT_ONLY_SORTS.has(props.sort) ? { projectOnly: true } : {}),
          })
        : [],
    [open, env.project, env.registries, env.texturesFolder, props.sort],
  );
  const makeNew =
    changeWith !== undefined && MAKEABLE_SORTS.has(props.sort)
      ? {
          label: newThingLabel(props.sort),
          onMake: () => {
            const made = newGameThing(env.project, props.sort, namespaceOf(env.bookId));
            setOpen(false);
            if (made === undefined) return;
            changeWith(setAt(book, props.pointer, made.id), [made], newThingLabel(props.sort));
          },
        }
      : undefined;
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
      {props.sort === 'sound' && typeof value === 'string' && value.trim() !== '' && (
        <SoundPlayButton
          event={value}
          compact
          project={env.project}
          testId={`${props.testId}-play`}
        />
      )}
      {open && (
        <ThingPicker
          title={`Pick ${THING_WORDS[props.sort].one}`}
          sort={props.sort}
          sections={sections}
          value={typeof value === 'string' ? value : undefined}
          pictures={env.pictures}
          noneLabel={props.blockLabel}
          makeNew={makeNew}
          onCancel={() => setOpen(false)}
          onPick={(id) => {
            setOpen(false);
            const picked = id === null && props.blockLabel !== undefined ? 'block' : id;
            if (picked === null) return;
            const object = asObject(raw);
            // A particle with options keeps them (ADR 0080's options objects).
            change(
              setAt(
                book,
                props.pointer,
                object === undefined ? picked : { ...object, type: picked },
              ),
            );
          }}
        />
      )}
    </>
  );
}

/**
 * The chip of a thing slot of the object at `ownerPointer` outside a sentence row: a reading's
 * score, timer or team (`ValueEditor`'s reading fields), with its own words and label.
 */
export function OwnedThingChip(props: { ownerPointer: string; slot: SlotSpec }) {
  const env = useRulesEnv();
  const { book } = useBookEdit();
  const sort = THING_SLOTS[props.slot.type];
  if (sort === undefined) return null;
  const pointer = `${props.ownerPointer}/${props.slot.name}`;
  const owner: JsonObject = asObject(getAt(book, props.ownerPointer)) ?? {};
  const own = slotWords(
    props.slot,
    owner,
    sentenceContext((id) => env.name(id), undefined),
  );
  const words = own ?? emptyWords(props.slot);
  const invalid = (env.problems.get(pointer)?.length ?? 0) > 0;
  return (
    <ThingChip
      pointer={pointer}
      label={words}
      ariaLabel={`${slotLabel(props.slot)}: ${words}`}
      invalid={invalid}
      describedBy={undefined}
      testId={`rules-chip-${props.slot.name}`}
      className={chipClass({ empty: own === undefined, invalid })}
      sort={sort}
      slot={props.slot}
    />
  );
}
