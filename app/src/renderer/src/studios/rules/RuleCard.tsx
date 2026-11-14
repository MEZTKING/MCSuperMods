/**
 * One rule card (ADR 0082 D1): a sentence in three parts, **When** (one trigger, its thing and
 * options), **Only if** (optional conditions) and **Do** (the steps), with its name, on and off,
 * move, duplicate and delete. The card reads the book and sends every edit as the next book
 * through `onChange` (one undo step each; typing coalesces). Used by the Rule book Studio and,
 * with {@link RuleCardProps.fixedSubject}, by the Rules sections of other Studios (B375); both
 * provide a {@link RulesEnvContext}.
 *
 * @packageDocumentation
 */

import {
  ruleSentence,
  TRIGGERS,
  type TriggerEntry,
  type TriggerGroup,
  triggerById,
} from '@msm/plugin-rules';
import { ArrowDown, ArrowUp, Copy, Trash2 } from 'lucide-react';
import { type KeyboardEvent, useId, useMemo, useState } from 'react';
import { ThingPicker } from '../../components/thing-picker/ThingPicker';
import { type ThingSort, thingSections } from '../../components/thing-picker/thing-sources';
import { iconButtonClass } from '../../components/ui/Button';
import { inputClass } from '../../forms';
import { typingKey } from '../../forms/context';
import { ConditionList } from './ConditionList';
import { BookEditContext, useBookEdit, useRulesEnv } from './env';
import { ChipPopover, chipClass, MenuList, ProblemLines } from './parts';
import {
  asObject,
  duplicateRule,
  getAt,
  type JsonObject,
  moveRule,
  pointerOf,
  type RuleBookData,
  removeRule,
  ruleEnabled,
  ruleScope,
  rulesOf,
  setAt,
  setRuleEnabled,
  setTrigger,
} from './rules-model';
import { SentenceRow } from './SlotChip';
import { StepList } from './StepList';
import { sentenceParts, WHEN_ABSENT_WORDS, WHEN_DEFAULTS } from './slot-words';

/** Headings of the When menu's groups. */
export const TRIGGER_GROUP_LABELS: Readonly<Record<TriggerGroup, string>> = {
  blocks: 'Blocks',
  containers: 'Containers',
  machines: 'Machines',
  portals: 'Portals',
  items: 'Items',
  thrown: 'Thrown items',
  mobs: 'Mobs',
  effects: 'Effects',
  players: 'Players',
  world: 'The world',
  any: 'Any block, item or mob',
};

/** The thing sort of a trigger's subject. */
const SUBJECT_SORTS: Readonly<Record<string, ThingSort>> = {
  block: 'block',
  item: 'item',
  mob: 'mob',
  effect: 'effect',
};

/** Props of {@link RuleCard}. */
export interface RuleCardProps {
  /** The whole book (the card edits rule {@link index} of it). */
  book: RuleBookData;
  index: number;
  /** Sends the next book as one undo step; `coalesce` merges typing. */
  onChange(next: RuleBookData, coalesce?: string): void;
  /**
   * Fixes the rule's subject to one project element (the Rules section of its Studio): the
   * When menu offers only triggers for that element's kind and the thing chip is not shown as a
   * choice.
   */
  fixedSubject?: { id: string; kind: string } | undefined;
}

/** One rule card. */
export function RuleCard(props: RuleCardProps) {
  const { book, index, onChange } = props;
  const edit = useMemo(() => ({ book, change: onChange }), [book, onChange]);
  return (
    <BookEditContext.Provider value={edit}>
      <RuleCardBody index={index} fixedSubject={props.fixedSubject} />
    </BookEditContext.Provider>
  );
}

function RuleCardBody(props: { index: number; fixedSubject: RuleCardProps['fixedSubject'] }) {
  const env = useRulesEnv();
  const { book, change } = useBookEdit();
  const { index } = props;
  const pointer = pointerOf('rules', index);
  const rule = asObject(rulesOf(book)[index]) ?? {};
  const when = asObject(rule.when);
  const triggerId = typeof when?.trigger === 'string' ? when.trigger : '';
  const trigger = triggerById(triggerId);
  const scope = ruleScope(trigger);
  const enabled = ruleEnabled(rule);
  const name = typeof rule.name === 'string' ? rule.name : '';
  const nameId = useId();
  const onId = useId();
  const count = rulesOf(book).length;
  const sentence = ruleSentence(rule, (id) => env.name(id));
  const cardProblems = env.problems.get(pointer) ?? [];

  const move = (delta: number): void => {
    const next = moveRule(book, index, delta);
    if (next === book) return;
    change(next);
    env.requestFocus(pointerOf('rules', index + delta));
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    event.preventDefault();
    event.stopPropagation();
    move(event.key === 'ArrowUp' ? -1 : 1);
  };

  return (
    <article
      aria-label={`Rule ${index + 1}: ${name !== '' ? name : sentence}`}
      data-pointer={pointer}
      data-testid="rule-card"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className={`flex flex-col gap-2 rounded-md border p-3 ${enabled ? 'border-border bg-bg' : 'border-dashed border-border bg-bg opacity-70'}`}
    >
      <header className="flex flex-wrap items-center gap-2">
        <label htmlFor={nameId} className="sr-only">
          Rule name
        </label>
        <input
          id={nameId}
          className={`${inputClass} min-w-40 flex-1 font-semibold`}
          data-testid="rule-name"
          placeholder={`Rule ${index + 1}`}
          value={name}
          onChange={(event) =>
            change(
              setAt(
                book,
                `${pointer}/name`,
                event.target.value === '' ? undefined : event.target.value,
              ),
              typingKey(`${pointer}/name`),
            )
          }
        />
        <span className="flex items-center gap-1 text-sm">
          <input
            id={onId}
            type="checkbox"
            data-testid="rule-enabled"
            checked={enabled}
            onChange={(event) => change(setRuleEnabled(book, index, event.target.checked))}
          />
          <label htmlFor={onId}>On</label>
        </span>
        <span className="flex items-center gap-0.5">
          <button
            type="button"
            className={iconButtonClass}
            aria-label="Move rule up"
            disabled={index === 0}
            onClick={() => move(-1)}
          >
            <ArrowUp size={14} aria-hidden />
          </button>
          <button
            type="button"
            className={iconButtonClass}
            aria-label="Move rule down"
            disabled={index === count - 1}
            onClick={() => move(1)}
          >
            <ArrowDown size={14} aria-hidden />
          </button>
          <button
            type="button"
            className={iconButtonClass}
            aria-label="Duplicate rule"
            data-testid="rule-duplicate"
            onClick={() => {
              change(duplicateRule(book, index));
              env.requestFocus(pointerOf('rules', index + 1));
            }}
          >
            <Copy size={14} aria-hidden />
          </button>
          <button
            type="button"
            className={iconButtonClass}
            aria-label="Delete rule"
            data-testid="rule-delete"
            onClick={() => change(removeRule(book, index))}
          >
            <Trash2 size={14} aria-hidden />
          </button>
        </span>
      </header>
      {env.mode.advanced && typeof rule.key === 'string' && (
        <p className="text-xs text-muted" data-testid="rule-key">
          Key: <code className="font-mono">{rule.key}</code>
        </p>
      )}
      <ProblemLines problems={cardProblems} testId="rule-problems" />
      <section aria-label="When" className="flex flex-col gap-1">
        <WhenRow
          pointer={`${pointer}/when`}
          ruleIndex={index}
          trigger={trigger}
          triggerId={triggerId}
          when={when}
          fixedSubject={props.fixedSubject}
        />
      </section>
      <section aria-label="Only if" className="flex flex-col gap-1 pl-2">
        <ConditionList
          ownerPointer={`${pointer}/only_if`}
          scope={scope}
          lead="Only if"
          removeWhenEmpty
        />
      </section>
      <section aria-label="Do" className="flex flex-col gap-1">
        <p className="font-semibold">Do:</p>
        <StepList ownerPointer={pointer} field="do" scope={scope} ruleIndex={index} />
      </section>
      <p className="text-xs text-muted" data-testid="rule-sentence">
        {enabled ? sentence : `Turned off: ${sentence}`}
      </p>
    </article>
  );
}

/** The "When" line: the trigger chip, the thing and the trigger's options. */
function WhenRow(props: {
  pointer: string;
  ruleIndex: number;
  trigger: TriggerEntry | undefined;
  triggerId: string;
  when: JsonObject | undefined;
  fixedSubject: RuleCardProps['fixedSubject'];
}) {
  const env = useRulesEnv();
  const { book, change } = useBookEdit();
  const { trigger } = props;
  const triggerProblems = env.problems.get(props.pointer) ?? [];
  const fixed = props.fixedSubject;
  const triggers = TRIGGERS.filter(
    (entry) =>
      (!env.mode.veryEasy || entry.veryEasy) &&
      (fixed === undefined || entry.subjectKinds.includes(fixed.kind)),
  );
  const triggerChip = (label: string) => (
    <ChipPopover
      label={label}
      ariaLabel={`When: ${trigger?.label ?? 'pick when'}`}
      className={chipClass({ invalid: triggerProblems.length > 0, empty: trigger === undefined })}
      testId="rules-chip-trigger"
      pointer={props.pointer}
    >
      <MenuList
        label="When"
        choices={triggers.map((entry) => ({
          key: entry.id,
          label: entry.label,
          group: TRIGGER_GROUP_LABELS[entry.group],
          chosen: entry.id === props.triggerId,
          testId: `rules-trigger-${entry.id}`,
        }))}
        onPick={(id) => {
          let next = setTrigger(book, props.ruleIndex, id);
          if (fixed !== undefined && triggerById(id)?.subject !== 'none') {
            next = setAt(next, `${props.pointer}/subject`, fixed.id);
          }
          change(next);
        }}
      />
    </ChipPopover>
  );

  if (trigger === undefined) {
    return (
      <div className="flex flex-col gap-1">
        <p className="flex flex-wrap items-center gap-1">
          {triggerChip(
            props.triggerId === '' ? 'When…' : `When something unknown (${props.triggerId})`,
          )}
        </p>
        <ProblemLines problems={triggerProblems} />
      </div>
    );
  }
  // The leading words of the trigger's sentence are the trigger chip; the rest are blanks.
  const parts = sentenceParts(trigger.sentence);
  const lead = parts[0]?.text !== undefined ? parts[0].text.trim() : 'When';
  const rest =
    parts[0]?.text !== undefined ? trigger.sentence.slice(parts[0].text.length) : trigger.sentence;
  const subjectSlot = trigger.slots.find((slot) => slot.name === 'subject');
  const optionSlots = trigger.slots.filter((slot) => slot.name !== 'subject');
  return (
    <div className="flex flex-col gap-1" data-testid="rules-when">
      <SentenceRow
        lead={triggerChip(lead)}
        template={rest}
        slots={optionSlots}
        ownerPointer={`${props.pointer}/options`}
        ownerId="when"
        scope={ruleScope(trigger)}
        defaults={WHEN_DEFAULTS}
        absentWords={WHEN_ABSENT_WORDS}
        special={
          subjectSlot === undefined
            ? {}
            : {
                subject: (
                  <SubjectChip
                    pointer={`${props.pointer}/subject`}
                    trigger={trigger}
                    fixed={fixed}
                  />
                ),
              }
        }
      />
      <ProblemLines problems={triggerProblems} />
      <ProblemLines problems={env.problems.get(`${props.pointer}/subject`) ?? []} />
    </div>
  );
}

/** The thing a trigger is about: a project thing (definition triggers) or any thing (`any_`). */
function SubjectChip(props: {
  pointer: string;
  trigger: TriggerEntry;
  fixed: RuleCardProps['fixedSubject'];
}) {
  const env = useRulesEnv();
  const { book, change } = useBookEdit();
  const [open, setOpen] = useState(false);
  const { trigger } = props;
  const sort = SUBJECT_SORTS[trigger.subject] ?? 'block';
  const raw = getAt(book, props.pointer);
  const subject = typeof raw === 'string' ? raw : undefined;
  const invalid = (env.problems.get(props.pointer)?.length ?? 0) > 0;
  const definition = trigger.definition !== undefined;
  const words =
    subject !== undefined
      ? env.name(subject, sort)
      : trigger.subjectOptional
        ? `any ${sort}`
        : definition
          ? `pick one of your ${sort === 'mob' ? 'mobs' : `${sort}s`}`
          : `pick ${sort === 'item' || sort === 'effect' ? 'an' : 'a'} ${sort}`;
  const sections = useMemo(
    () =>
      open
        ? thingSections({
            project: env.project,
            registries: env.registries,
            sort,
            texturesFolder: env.texturesFolder,
            ...(definition ? { projectOnly: true, kinds: trigger.subjectKinds } : {}),
          })
        : [],
    [open, env.project, env.registries, env.texturesFolder, sort, definition, trigger.subjectKinds],
  );
  if (props.fixed !== undefined && subject === props.fixed.id) {
    return (
      <span className={chipClass({})} data-pointer={props.pointer} data-testid="rules-chip-subject">
        {words}
      </span>
    );
  }
  return (
    <>
      <button
        type="button"
        className={chipClass({
          invalid,
          empty: subject === undefined && !trigger.subjectOptional,
          muted: subject === undefined && trigger.subjectOptional,
        })}
        aria-label={`Thing: ${words}`}
        aria-invalid={invalid ? true : undefined}
        data-testid="rules-chip-subject"
        data-pointer={props.pointer}
        title={env.mode.advanced ? subject : undefined}
        onClick={() => setOpen(true)}
      >
        {words}
      </button>
      {open && (
        <ThingPicker
          title={
            definition
              ? `Pick one of your ${sort === 'mob' ? 'mobs' : `${sort}s`}`
              : `Pick ${sort === 'item' || sort === 'effect' ? 'an' : 'a'} ${sort}`
          }
          sort={sort}
          sections={sections}
          value={subject}
          pictures={env.pictures}
          noneLabel={trigger.subjectOptional ? `Any ${sort}` : undefined}
          onCancel={() => setOpen(false)}
          onPick={(id) => {
            setOpen(false);
            change(setAt(book, props.pointer, id ?? undefined));
          }}
        />
      )}
    </>
  );
}
