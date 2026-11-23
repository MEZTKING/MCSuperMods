/**
 * Command Studio (ADR 0096 D1, ADR 0101 D1) for `msm:command` element data, loaded lazily:
 *
 * - "How it is typed": a live preview of the chat line (`/name <arg> [optional]`, test id
 *   `command-usage`) and of each alias.
 * - "Name": the name and up to four aliases (other names that run the same command).
 * - "What the player types after it": the argument rows (name, kind of value in plain words,
 *   lowest and highest for numbers, "May be left out"), added, removed and moved up or down;
 *   each change of the list is one undo step. The kinds of value are the target's argument types
 *   (ADR 0111 D2, B538: the twelve of ADR 0096 and 32 more).
 * - "Who can use it": the permission level in plain words.
 * - "What it does": the steps of an event (edited in the shared events editor below), a
 *   function, or nothing when a script listens for it; switching is one undo step.
 * - "Message back": the feedback text the player sees when it worked.
 * - The Rules section, only when the rules catalogue offers a trigger for commands.
 *
 * Everything else stays behind "Advanced (all fields)".
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/core';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { lazy, Suspense, useId, useState } from 'react';
import { Button, iconButtonClass } from '../../components/ui/Button';
import { inputClass } from '../../forms';
import { typingKey } from '../../forms/context';
import { asObject, pathSetter, pointerOf } from '../blocks-items/blocks-items-model';
import { EventsEditor } from '../blocks-items/EventsEditor';
import { CheckField, EventSelect, ProblemsAt, TextField } from '../blocks-items/parts';
import { RulesSlot } from '../RulesSlot';
import { firstTriggerFor } from '../rules/turn-into-rules';
import { IdField, NumberField } from '../structures/pickers';
import type { StudioProps } from '../types';
import { useVeryEasy } from '../very-easy';
import { AdvancedToggle, Section } from '../worldgen/parts';
import {
  aliasesOf,
  aliasUsages,
  argumentsOf,
  argumentTypeLabel,
  type CommandRuns,
  commandRuns,
  commandUsage,
  followEventRename,
  isRangedType,
  MAX_ALIASES,
  MAX_ARGUMENTS,
  offeredArgumentTypes,
  PERMISSION_LABELS,
  permissionOf,
  RUNS_LABELS,
  withArgumentAdded,
  withArgumentMoved,
  withArgumentRemoved,
  withArgumentType,
  withRuns,
} from './command-model';
import { projectHandlers } from './script-model';

/** The Rules section (ADR 0082 D7 (b)), a chunk of its own. */
const RulesSection = lazy(() => import('../rules/RulesSection'));

const RUNS_ORDER: readonly CommandRuns[] = ['event', 'function', 'nothing'];

/** A select whose options show plain words for each value. */
function WordsSelect(props: {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange(value: string): void;
  testId?: string;
}) {
  const id = useId();
  const known = props.options.some((option) => option.value === props.value);
  return (
    <div className="flex min-w-0 flex-col gap-0.5 text-xs">
      <label htmlFor={id} className="text-muted">
        {props.label}
      </label>
      <select
        id={id}
        className={inputClass}
        data-testid={props.testId}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      >
        {!known && <option value={props.value}>{props.value || '(choose)'}</option>}
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** The type picker's options on a target (ADR 0111 D2: the target's argument types). */
function typeOptions(target: StudioProps['target']): { value: string; label: string }[] {
  return offeredArgumentTypes(target.commands).map((type) => ({
    value: type,
    label: argumentTypeLabel(type),
  }));
}

const PERMISSION_OPTIONS = PERMISSION_LABELS.map((label, level) => ({
  value: String(level),
  label,
}));

/** The Command Studio. */
export default function CommandStudio(props: StudioProps) {
  const { project, element, problems, suggest, onChange } = props;
  const [advanced, setAdvanced] = useState(false);
  const veryEasy = useVeryEasy();
  const data = asObject(element.data);
  const set = pathSetter(element.data, onChange);
  const at = (path: readonly (string | number)[]) => (
    <ProblemsAt problems={problems} pointer={pointerOf(path)} />
  );

  if (advanced) {
    return (
      <section
        aria-label="Command Studio"
        data-testid="command-studio"
        className="flex flex-col gap-3"
      >
        <AdvancedToggle
          checked={advanced}
          onChange={setAdvanced}
          testId="command-advanced-toggle"
        />
        {props.form}
      </section>
    );
  }

  const args = argumentsOf(element.data);
  const aliases = aliasesOf(element.data);
  const runs = commandRuns(element.data);
  const events = Object.keys(asObject(data.events));
  const setArguments = (next: readonly Json[]) =>
    set(['arguments'], next.length === 0 ? undefined : [...next]);
  const setAliases = (next: readonly string[]) =>
    set(['aliases'], next.length === 0 ? undefined : [...next]);

  const preview = (
    <Section title="How it is typed" testId="command-preview">
      <p className="text-muted text-xs">This is what a player types in chat to use it.</p>
      <code
        data-testid="command-usage"
        className="self-start rounded border border-border bg-bg px-2 py-1 font-mono text-sm"
      >
        {commandUsage(element.data)}
      </code>
      {aliasUsages(element.data).length > 0 && (
        <p className="text-xs" data-testid="command-alias-usages">
          <span className="text-muted">Also typed as: </span>
          {aliasUsages(element.data).join(', ')}
        </p>
      )}
      {args.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-xs" data-testid="command-usage-key">
          {args.map((argument, index) => (
            <li key={index}>
              <span className="font-mono">
                {typeof argument.name === 'string' ? argument.name : ''}
              </span>
              <span className="text-muted">
                : {argumentTypeLabel(argument.type)}
                {argument.optional === true ? ', may be left out' : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );

  const nameSection = (
    <Section title="Name" testId="command-name-section">
      <TextField
        label="Name (lower case letters, digits and _, without the slash)"
        value={data.name}
        testId="command-name"
        placeholder="hello"
        onCommit={(value) => set(['name'], value ?? '', typingKey('/name'))}
      />
      {at(['name'])}
      <p className="text-muted text-xs">Other names that run the same command (up to four).</p>
      <ol className="flex flex-col gap-1">
        {aliases.map((alias, index) => (
          <li key={index} className="flex flex-col gap-0.5" data-testid={`command-alias-${index}`}>
            <div className="flex items-end gap-1">
              <TextField
                label={`Other name ${index + 1}`}
                value={alias}
                testId={`command-alias-${index}-name`}
                onCommit={(value) =>
                  set(['aliases', index], value ?? '', typingKey(pointerOf(['aliases', index])))
                }
              />
              <button
                type="button"
                aria-label={`Remove other name ${index + 1}`}
                data-testid={`command-alias-${index}-remove`}
                className={iconButtonClass}
                onClick={() => setAliases(aliases.filter((_, place) => place !== index))}
              >
                <X size={12} aria-hidden />
              </button>
            </div>
            {at(['aliases', index])}
          </li>
        ))}
      </ol>
      <Button
        className="self-start text-xs"
        data-testid="command-add-alias"
        disabled={aliases.length >= MAX_ALIASES}
        onClick={() => setAliases([...aliases, ''])}
      >
        <Plus size={12} aria-hidden />
        Add another name
      </Button>
      {at(['aliases'])}
    </Section>
  );

  const argumentSection = (
    <Section title="What the player types after it" testId="command-arguments">
      {args.length === 0 && (
        <p className="text-muted text-xs" data-testid="command-no-arguments">
          Nothing: the player types just the name.
        </p>
      )}
      <ol className="flex flex-col gap-2">
        {args.map((argument, index) => {
          const row = `Value ${index + 1}`;
          const path = ['arguments', index];
          const type = typeof argument.type === 'string' ? argument.type : '';
          return (
            <li
              key={index}
              className="flex flex-col gap-1 rounded border border-border p-1.5"
              data-testid={`command-argument-${index}`}
            >
              <div className="flex flex-wrap items-end gap-2">
                <TextField
                  label={`${row} name`}
                  value={argument.name}
                  testId={`command-argument-${index}-name`}
                  onCommit={(value) =>
                    set([...path, 'name'], value ?? '', typingKey(pointerOf([...path, 'name'])))
                  }
                />
                <WordsSelect
                  label={`${row} is`}
                  value={type}
                  options={typeOptions(props.target)}
                  testId={`command-argument-${index}-type`}
                  onChange={(next) => {
                    const list = [...args];
                    list[index] = withArgumentType(argument, next);
                    setArguments(list);
                  }}
                />
                {isRangedType(type) && (
                  <>
                    <NumberField
                      label="Lowest"
                      value={argument.min}
                      integer={type === 'integer'}
                      allowEmpty
                      testId={`command-argument-${index}-min`}
                      onCommit={(value) =>
                        set([...path, 'min'], value, typingKey(pointerOf([...path, 'min'])))
                      }
                    />
                    <NumberField
                      label="Highest"
                      value={argument.max}
                      integer={type === 'integer'}
                      allowEmpty
                      testId={`command-argument-${index}-max`}
                      onCommit={(value) =>
                        set([...path, 'max'], value, typingKey(pointerOf([...path, 'max'])))
                      }
                    />
                  </>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <CheckField
                  label="May be left out"
                  checked={argument.optional === true}
                  testId={`command-argument-${index}-optional`}
                  onChange={(checked) => set([...path, 'optional'], checked ? true : undefined)}
                />
                <span className="flex-1" />
                <button
                  type="button"
                  aria-label={`Move ${row.toLowerCase()} up`}
                  data-testid={`command-argument-${index}-up`}
                  className={iconButtonClass}
                  disabled={index === 0}
                  onClick={() => setArguments(withArgumentMoved(args, index, index - 1))}
                >
                  <ArrowUp size={12} aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={`Move ${row.toLowerCase()} down`}
                  data-testid={`command-argument-${index}-down`}
                  className={iconButtonClass}
                  disabled={index === args.length - 1}
                  onClick={() => setArguments(withArgumentMoved(args, index, index + 1))}
                >
                  <ArrowDown size={12} aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${row.toLowerCase()}`}
                  data-testid={`command-argument-${index}-remove`}
                  className={iconButtonClass}
                  onClick={() => setArguments(withArgumentRemoved(args, index))}
                >
                  <X size={12} aria-hidden />
                </button>
              </div>
              {at([...path, 'name'])}
              {at([...path, 'type'])}
              {at([...path, 'min'])}
              {at([...path, 'max'])}
              {at([...path, 'optional'])}
            </li>
          );
        })}
      </ol>
      <Button
        className="self-start text-xs"
        data-testid="command-add-argument"
        disabled={args.length >= MAX_ARGUMENTS}
        onClick={() => setArguments(withArgumentAdded(args))}
      >
        <Plus size={12} aria-hidden />
        Add a value to type
      </Button>
      {at(['arguments'])}
    </Section>
  );

  const permission = permissionOf(element.data);
  const whoSection = (
    <Section title="Who can use it" testId="command-permission-section">
      <WordsSelect
        label="Who can use it"
        value={String(permission)}
        options={PERMISSION_OPTIONS}
        testId="command-permission"
        onChange={(next) => {
          const level = Number(next);
          set(['permission'], level === 0 ? undefined : level);
        }}
      />
      {permission === 0 && runs === 'function' && (
        <p className="text-warning text-xs" data-testid="command-everyone-note">
          Every player can use it, and the function then runs with operator rights.
        </p>
      )}
      {at(['permission'])}
    </Section>
  );

  const runsSection = (
    <Section title="What it does" testId="command-runs-section">
      <WordsSelect
        label="When typed"
        value={runs}
        options={RUNS_ORDER.map((value) => ({ value, label: RUNS_LABELS[value] }))}
        testId="command-runs"
        onChange={(next) => {
          if (next !== runs) onChange('', withRuns(element.data, next as CommandRuns));
        }}
      />
      {runs === 'event' && (
        <>
          <EventSelect
            label="Event"
            value={data.event}
            events={events}
            testId="command-event"
            onChange={(next) => {
              if (next !== undefined) set(['event'], next);
            }}
          />
          <p className="text-muted text-xs">
            {veryEasy
              ? 'It does the steps of this event (Easy shows them); rules below can do more.'
              : 'Its steps are in the events below. The player who typed it is "self".'}
          </p>
        </>
      )}
      {runs === 'function' && (
        <>
          <IdField
            label="Function"
            value={typeof data.function === 'string' ? data.function : ''}
            registry="function"
            suggest={suggest}
            testId="command-function"
            onCommit={(value) => set(['function'], value)}
          />
          <p className="text-muted text-xs">
            The function gets each value as $(name). It runs as and at the player.
          </p>
        </>
      )}
      {runs === 'nothing' && (
        <p className="text-muted text-xs" data-testid="command-script-note">
          A script that listens for the "command" event with this name does the work.
        </p>
      )}
      {at(['event'])}
      {at(['function'])}
    </Section>
  );

  const feedbackSection = (
    <Section title="Message back" testId="command-feedback-section">
      <TextField
        label="Message shown to the player when it worked"
        value={data.feedback_text}
        testId="command-feedback"
        placeholder="Done!"
        onCommit={(value) => set(['feedback_text'], value, typingKey('/feedback_text'))}
      />
      {at(['feedback_text'])}
      {at(['feedback'])}
    </Section>
  );

  const rulesTrigger = firstTriggerFor(element.kind, element.data);

  return (
    <section
      aria-label="Command Studio"
      data-testid="command-studio"
      className="flex flex-col gap-4"
    >
      <AdvancedToggle checked={advanced} onChange={setAdvanced} testId="command-advanced-toggle" />
      <ProblemsAt problems={problems} pointer="" />
      {preview}
      {nameSection}
      {argumentSection}
      {whoSection}
      {runsSection}
      {feedbackSection}
      {rulesTrigger !== undefined && (
        <RulesSlot>
          <Suspense
            fallback={
              <p className="text-muted text-xs" data-testid="rules-section-loading">
                Loading the Rules section…
              </p>
            }
          >
            <RulesSection
              project={project}
              element={element}
              target={props.target}
              context={props.context}
            />
          </Suspense>
        </RulesSlot>
      )}
      <EventsEditor
        element={element}
        project={project}
        target={props.target}
        problems={problems}
        suggest={suggest}
        onChange={(pointer, value, options) =>
          pointer === '' && value !== undefined
            ? onChange('', followEventRename(element.data, value), options)
            : onChange(pointer, value, options)
        }
        handlers={projectHandlers(project)}
      />
    </section>
  );
}
