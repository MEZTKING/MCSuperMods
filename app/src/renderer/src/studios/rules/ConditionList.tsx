/**
 * The conditions of a rule's "Only if" or of an "If" step (ADR 0082 D1): "all of these" or "any
 * of these", each condition a sentence with chips that can be turned round ("not"), moved,
 * removed, and a menu to add one. The match is always written (`match` on every list, B363).
 *
 * @packageDocumentation
 */

import { conditionById } from '@msm/plugin-rules';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { Popover } from 'radix-ui';
import { type KeyboardEvent, useId } from 'react';
import { buttonClass, iconButtonClass } from '../../components/ui/Button';
import { useBookEdit, useRulesEnv } from './env';
import { ChipPopover, chipClass, MenuList, ProblemLines, popoverClass } from './parts';
import {
  asArray,
  asObject,
  getAt,
  moveItem,
  newCondition,
  offeredConditions,
  type RuleScope,
  removeItem,
  setAt,
} from './rules-model';
import { rowProblems, SentenceRow } from './SlotChip';
import { CONDITION_DEFAULTS } from './slot-words';

/** Props of {@link ConditionList}. */
export interface ConditionListProps {
  /** The object holding `match` and `conditions`: a rule's `only_if` or an `if` step. */
  ownerPointer: string;
  scope: RuleScope;
  /** Removing the last condition removes the owner (a rule's `only_if`). */
  removeWhenEmpty?: boolean;
  /** Words before the match chip ("Only if", "If"). */
  lead: string;
}

/** The conditions of one owner. */
export function ConditionList(props: ConditionListProps) {
  const env = useRulesEnv();
  const { book, change } = useBookEdit();
  const owner = asObject(getAt(book, props.ownerPointer));
  const conditions = asArray(owner?.conditions);
  const match = owner?.match === 'any' ? 'any' : 'all';
  const offered = offeredConditions(props.scope, { veryEasy: env.mode.veryEasy });
  const matchProblems = env.problems.get(props.ownerPointer) ?? [];

  const add = (id: string): void => {
    const next = setAt(book, props.ownerPointer, {
      ...(owner ?? {}),
      conditions: [...conditions, newCondition(id)],
      match,
    });
    change(next);
    env.requestFocus(`${props.ownerPointer}/conditions/${conditions.length}`);
  };

  const remove = (index: number): void => {
    if (props.removeWhenEmpty === true && conditions.length <= 1) {
      change(setAt(book, props.ownerPointer, undefined));
      return;
    }
    change(removeItem(book, `${props.ownerPointer}/conditions/${index}`));
  };

  return (
    <div className="flex flex-col gap-1" data-testid="rules-conditions">
      {conditions.length > 0 && (
        <p className="flex flex-wrap items-center gap-1">
          <span className="font-semibold">{props.lead}</span>
          <ChipPopover
            label={match === 'all' ? 'all of these' : 'any of these'}
            ariaLabel={`Match: ${match === 'all' ? 'all of these' : 'any of these'}`}
            className={chipClass({ invalid: matchProblems.length > 0 })}
            testId="rules-chip-match"
            pointer={`${props.ownerPointer}/match`}
          >
            <MenuList
              label="Match"
              choices={[
                { key: 'all', label: 'All of these must be true', chosen: match === 'all' },
                { key: 'any', label: 'Any one of these is enough', chosen: match === 'any' },
              ]}
              onPick={(key) => change(setAt(book, `${props.ownerPointer}/match`, key))}
            />
          </ChipPopover>
          <span>hold:</span>
        </p>
      )}
      <ProblemLines problems={matchProblems} />
      <ol className="flex flex-col gap-1 pl-3">
        {conditions.map((condition, index) => (
          <ConditionRow
            key={index}
            pointer={`${props.ownerPointer}/conditions/${index}`}
            index={index}
            last={index === conditions.length - 1}
            scope={props.scope}
            condition={asObject(condition)}
            onRemove={() => remove(index)}
          />
        ))}
      </ol>
      <Popover.Root>
        <Popover.Trigger className={`${buttonClass} self-start`} data-testid="rules-add-condition">
          <Plus size={14} aria-hidden />{' '}
          {conditions.length === 0 ? 'Add a condition' : 'And another condition'}
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content align="start" sideOffset={4} className={popoverClass}>
            <MenuList
              label="Conditions"
              choices={offered.map((entry) => ({
                key: entry.id,
                label: entry.label,
                testId: `rules-condition-${entry.id}`,
              }))}
              onPick={add}
            />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

/** One condition: its sentence, "not", move and remove. */
function ConditionRow(props: {
  pointer: string;
  index: number;
  last: boolean;
  scope: RuleScope;
  condition: ReturnType<typeof asObject>;
  onRemove(): void;
}) {
  const env = useRulesEnv();
  const { book, change } = useBookEdit();
  const notId = useId();
  const id = typeof props.condition?.condition === 'string' ? props.condition.condition : '';
  const entry = conditionById(id);
  const negated = props.condition?.not === true;
  const move = (delta: number): void => {
    const next = moveItem(book, props.pointer, delta);
    if (next === book) return;
    change(next);
    const to = props.pointer.replace(/\d+$/, String(props.index + delta));
    env.requestFocus(to);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLLIElement>): void => {
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    event.preventDefault();
    event.stopPropagation();
    move(event.key === 'ArrowUp' ? -1 : 1);
  };
  return (
    <li
      className="flex items-start gap-2 rounded border border-border p-1.5"
      data-pointer={props.pointer}
      data-testid="rules-condition"
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      <div className="min-w-0 flex-1">
        {entry === undefined ? (
          <>
            <p className="text-error">Unknown condition ({id}): it may come from a newer MSM.</p>
            <ProblemLines problems={rowProblems(env.problems, props.pointer, [])} />
          </>
        ) : (
          <SentenceRow
            template={negated ? entry.notSentence : entry.sentence}
            slots={entry.slots}
            ownerPointer={props.pointer}
            ownerId={id}
            scope={props.scope}
            defaults={CONDITION_DEFAULTS}
            singleWho={id === 'mob_is'}
            capitalise
          />
        )}
      </div>
      <span className="flex shrink-0 items-center gap-0.5">
        {entry !== undefined && (
          <span className="flex items-center gap-1 text-xs">
            <input
              id={notId}
              type="checkbox"
              data-testid="rules-condition-not"
              checked={negated}
              onChange={(event) =>
                change(setAt(book, `${props.pointer}/not`, event.target.checked ? true : undefined))
              }
            />
            <label htmlFor={notId} title="Turn this condition round">
              Not
            </label>
          </span>
        )}
        <button
          type="button"
          className={iconButtonClass}
          aria-label="Move condition up"
          disabled={props.index === 0}
          onClick={() => move(-1)}
        >
          <ArrowUp size={14} aria-hidden />
        </button>
        <button
          type="button"
          className={iconButtonClass}
          aria-label="Move condition down"
          disabled={props.last}
          onClick={() => move(1)}
        >
          <ArrowDown size={14} aria-hidden />
        </button>
        <button
          type="button"
          className={iconButtonClass}
          aria-label="Remove condition"
          data-testid="rules-condition-remove"
          onClick={props.onRemove}
        >
          <X size={14} aria-hidden />
        </button>
      </span>
    </li>
  );
}
