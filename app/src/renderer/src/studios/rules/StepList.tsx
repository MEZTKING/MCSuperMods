/**
 * The "Do" steps of a rule or of a logic step (ADR 0082 D1): each step a sentence with chips,
 * moved with buttons or Alt+Up and Alt+Down, duplicated or removed; "If", "Repeat" and "For each
 * player" have cards of their own holding their steps. The Do menu offers only what the trigger
 * has (its actors and whether it can be stopped), no logic below the nesting cap, and nothing past
 * the 50-step cap; Very easy leaves out the advanced-only steps.
 *
 * @packageDocumentation
 */

import { MAX_STEPS, type StepGroup, stepById } from '@msm/plugin-rules';
import { ArrowDown, ArrowUp, Copy, Plus, X } from 'lucide-react';
import { Popover } from 'radix-ui';
import type { KeyboardEvent } from 'react';
import { buttonClass, iconButtonClass } from '../../components/ui/Button';
import { ConditionList } from './ConditionList';
import { useBookEdit, useRulesEnv } from './env';
import { MenuList, ProblemLines, popoverClass } from './parts';
import {
  appendItem,
  asArray,
  asObject,
  canAddStep,
  duplicateItem,
  getAt,
  innerScope,
  moveItem,
  newStep,
  offeredSteps,
  type RuleScope,
  removeItem,
} from './rules-model';
import { rowProblems, SentenceRow } from './SlotChip';
import { stepDefaults } from './slot-words';

/** Headings of the Do menu's groups. */
export const STEP_GROUP_LABELS: Readonly<Record<StepGroup, string>> = {
  players: 'Players',
  world: 'World',
  sounds: 'Sounds and particles',
  mobs: 'Mobs',
  logic: 'Logic',
  counters: 'Counters',
};

/** Props of {@link StepList}. */
export interface StepListProps {
  /** The rule or logic step holding the list. */
  ownerPointer: string;
  /** `do`, or `else` for an "If"'s otherwise list. */
  field: 'do' | 'else';
  scope: RuleScope;
  /** The rule the list is in (for the step cap). */
  ruleIndex: number;
  /** The add button's words ("Add a step"). */
  addLabel?: string;
}

/** A list of steps. */
export function StepList(props: StepListProps) {
  const env = useRulesEnv();
  const { book, change } = useBookEdit();
  const listPointer = `${props.ownerPointer}/${props.field}`;
  const steps = asArray(getAt(book, listPointer));
  const room = canAddStep(book, props.ruleIndex);
  const offered = offeredSteps(props.scope, listPointer, { veryEasy: env.mode.veryEasy });
  const add = (id: string): void => {
    change(appendItem(book, listPointer, newStep(id)));
    env.requestFocus(`${listPointer}/${steps.length}`);
  };
  return (
    <div className="flex flex-col gap-1" data-testid={`rules-steps-${props.field}`}>
      {steps.length === 0 && (
        <p className="text-xs text-muted" data-testid="rules-steps-empty">
          Nothing yet.
        </p>
      )}
      <ol className="flex flex-col gap-1">
        {steps.map((step, index) => (
          <StepRow
            key={index}
            pointer={`${listPointer}/${index}`}
            index={index}
            last={index === steps.length - 1}
            step={asObject(step)}
            scope={props.scope}
            ruleIndex={props.ruleIndex}
          />
        ))}
      </ol>
      {room ? (
        <Popover.Root>
          <Popover.Trigger
            className={`${buttonClass} self-start`}
            data-testid={`rules-add-step-${props.field}`}
          >
            <Plus size={14} aria-hidden /> {props.addLabel ?? 'Add a step'}
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content align="start" sideOffset={4} className={popoverClass}>
              <MenuList
                label="Steps"
                choices={offered.map((entry) => ({
                  key: entry.id,
                  label: entry.label,
                  group: STEP_GROUP_LABELS[entry.group],
                  testId: `rules-step-${entry.id}`,
                }))}
                onPick={add}
              />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      ) : (
        <p className="text-xs text-muted" data-testid="rules-steps-full">
          A rule can have at most {MAX_STEPS} steps.
        </p>
      )}
    </div>
  );
}

/** One step: its sentence or logic card, and its buttons. */
function StepRow(props: {
  pointer: string;
  index: number;
  last: boolean;
  step: ReturnType<typeof asObject>;
  scope: RuleScope;
  ruleIndex: number;
}) {
  const env = useRulesEnv();
  const { book, change } = useBookEdit();
  const id = typeof props.step?.step === 'string' ? props.step.step : '';
  const entry = stepById(id);
  const move = (delta: number): void => {
    const next = moveItem(book, props.pointer, delta);
    if (next === book) return;
    change(next);
    env.requestFocus(props.pointer.replace(/\d+$/, String(props.index + delta)));
  };
  const onKeyDown = (event: KeyboardEvent<HTMLLIElement>): void => {
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    event.preventDefault();
    event.stopPropagation();
    move(event.key === 'ArrowUp' ? -1 : 1);
  };
  const canCopy = canAddStep(book, props.ruleIndex);
  return (
    <li
      className="flex items-start gap-2 rounded border border-border bg-panel p-1.5"
      data-pointer={props.pointer}
      data-testid="rules-step"
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      <div className="min-w-0 flex-1">
        {entry === undefined ? (
          <>
            <p className="text-error" data-testid="rules-step-unknown">
              Unknown step ({id}): it may come from a newer MSM. It is kept as it is.
            </p>
            <ProblemLines problems={rowProblems(env.problems, props.pointer, [])} />
          </>
        ) : id === 'if' ? (
          <IfCard pointer={props.pointer} scope={props.scope} ruleIndex={props.ruleIndex} />
        ) : entry.logic ? (
          <LoopCard
            pointer={props.pointer}
            id={id}
            scope={props.scope}
            ruleIndex={props.ruleIndex}
          />
        ) : (
          <SentenceRow
            template={entry.sentence}
            slots={entry.slots}
            ownerPointer={props.pointer}
            ownerId={id}
            scope={props.scope}
            defaults={stepDefaults(entry.defaultWho)}
            capitalise
          />
        )}
      </div>
      <span className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          className={iconButtonClass}
          aria-label="Move step up"
          disabled={props.index === 0}
          onClick={() => move(-1)}
        >
          <ArrowUp size={14} aria-hidden />
        </button>
        <button
          type="button"
          className={iconButtonClass}
          aria-label="Move step down"
          disabled={props.last}
          onClick={() => move(1)}
        >
          <ArrowDown size={14} aria-hidden />
        </button>
        <button
          type="button"
          className={iconButtonClass}
          aria-label="Duplicate step"
          disabled={!canCopy}
          onClick={() => change(duplicateItem(book, props.pointer))}
        >
          <Copy size={14} aria-hidden />
        </button>
        <button
          type="button"
          className={iconButtonClass}
          aria-label="Remove step"
          data-testid="rules-step-remove"
          onClick={() => change(removeItem(book, props.pointer))}
        >
          <X size={14} aria-hidden />
        </button>
      </span>
    </li>
  );
}

/** "If ... then ... otherwise ...": its conditions and two step lists. */
function IfCard(props: { pointer: string; scope: RuleScope; ruleIndex: number }) {
  return (
    <div className="flex flex-col gap-1.5" data-testid="rules-if">
      <ConditionList ownerPointer={props.pointer} scope={props.scope} lead="If" />
      <div className="flex flex-col gap-1 border-l-2 border-accent pl-2">
        <p className="font-semibold">Then</p>
        <StepList
          ownerPointer={props.pointer}
          field="do"
          scope={props.scope}
          ruleIndex={props.ruleIndex}
        />
      </div>
      <div className="flex flex-col gap-1 border-l-2 border-border pl-2">
        <p className="font-semibold">Otherwise</p>
        <StepList
          ownerPointer={props.pointer}
          field="else"
          scope={props.scope}
          ruleIndex={props.ruleIndex}
        />
      </div>
    </div>
  );
}

/** "Repeat N times" and "For each player": the heading sentence and the steps inside. */
function LoopCard(props: { pointer: string; id: string; scope: RuleScope; ruleIndex: number }) {
  const { book } = useBookEdit();
  const entry = stepById(props.id);
  if (entry === undefined) return null;
  const inner = innerScope(props.scope, props.id);
  const radius = getAt(book, `${props.pointer}/radius`) !== undefined;
  const template =
    props.id === 'repeat'
      ? 'Repeat {times} times:'
      : radius
        ? 'For each player within {radius} blocks:'
        : 'For each player {radius}:';
  return (
    <div className="flex flex-col gap-1.5" data-testid={`rules-${props.id}`}>
      <SentenceRow
        template={template}
        slots={entry.slots}
        ownerPointer={props.pointer}
        ownerId={props.id}
        scope={props.scope}
        absentWords={{ radius: 'in the world' }}
      />
      <div className="flex flex-col gap-1 border-l-2 border-accent pl-2">
        <StepList
          ownerPointer={props.pointer}
          field="do"
          scope={inner}
          ruleIndex={props.ruleIndex}
        />
      </div>
    </div>
  );
}
