/**
 * "Things to fix" (ADR 0083 D5): Very easy mode's strip in place of the Problems panel. One line
 * per error in plain words (`session/plain-problems.ts`), naming the thing by its display name,
 * with "Show me" (opens the thing at the field) and "Fix it" where one step fixes it; codes the
 * table lacks read "Something in <thing> needs fixing" with "Show details" for the original
 * message. Warnings and info are folded under "Tips". With the AI helper, each row also offers
 * "Ask the helper" (ADR 0125 D11), which opens the helper with the problem attached and sends
 * nothing. Presentational: the host opens things, runs the fixes and asks the helper.
 *
 * After a move to another Minecraft version (ADR 0136 D6, B818) a group **After moving to
 * Minecraft X** lists what the move's report said the user must change and is still open
 * (`session.openUpgradeItems()`): each item checks itself, so it leaves the group when fixed; an
 * item with no check of its own has a **Done** box. **What changed when I moved** reopens the
 * saved report. Problems the group shows are not repeated in the lists below it. One `note` may
 * sit above everything (the notice that a newer Minecraft is ready, ADR 0136 D5, B817); it is
 * never an error.
 *
 * @packageDocumentation
 */

import { type Problem, type Project, problemKey, type UpgradeTodoItem } from '@msm/core';
import { CircleAlert, CircleArrowUp, Lightbulb } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import {
  PLAIN_FIX_LABELS,
  type PlainFix,
  plainProblem,
  problemThingName,
} from '../session/plain-problems';
import { todoItemHint, todoItemText } from './upgrade/sentences';

/**
 * The After moving group (ADR 0136 D6): the open items of the newest saved move, as
 * `session.openUpgradeItems()` gives them.
 */
export interface AfterMovingGroup {
  /** The saved move's folder (`SavedUpgrade.folder`), for ticks and for reopening its report. */
  folder: string;
  /** The Minecraft version the mod moved to. */
  mcVersion: string;
  /** The items still open, in the report's order. */
  items: readonly UpgradeTodoItem[];
}

/** Props of {@link ThingsToFix}. */
export interface ThingsToFixProps {
  project: Project | null;
  /** The live problems and the last Play or Share problems; duplicates are shown once. */
  problems: readonly Problem[];
  /** Opens the thing a problem is on, at its field. */
  onShow(problem: Problem): void;
  /** Runs a one-step fix; without it no "Fix it" buttons are shown. */
  onFix?(problem: Problem, fix: PlainFix): void;
  /** Opens the AI helper with the problem attached (sends nothing); without it no "Ask the helper". */
  onAsk?(problem: Problem): void;
  /** The After moving group; absent or `null` (or with no items) shows none. */
  afterMoving?: AfterMovingGroup | null;
  /** Ticks or unticks an item that has no check of its own (`session.setUpgradeItemTicked`). */
  onTickUpgradeItem?(folder: string, itemId: string, ticked: boolean): void;
  /** Reopens the saved report of a move (**What changed when I moved**). */
  onOpenMoveReport?(folder: string): void;
  /** One note above the list (ADR 0136 D5: a newer Minecraft is ready); never an error. */
  note?: ReactNode;
}

/**
 * The After moving group of `session.openUpgradeItems()`'s answer (the newest saved move and its
 * open items), or `null` when there is none.
 */
export function afterMovingGroup(
  open: {
    upgrade: { folder: string; to: { mcVersion: string } };
    items: readonly UpgradeTodoItem[];
  } | null,
): AfterMovingGroup | null {
  if (open === null || open.items.length === 0) return null;
  return { folder: open.upgrade.folder, mcVersion: open.upgrade.to.mcVersion, items: open.items };
}

/** The label of the After moving group's button that reopens the saved report. */
export const WHAT_CHANGED_WHEN_I_MOVED = 'What changed when I moved';

/** The label of the row's button that asks the AI helper about the problem. */
export const ASK_THE_HELPER = 'Ask the helper';

/** The problems without repeats (same code, thing, place and message), errors first. */
export function uniqueProblems(problems: readonly Problem[]): Problem[] {
  const seen = new Set<string>();
  const out: Problem[] = [];
  for (const problem of problems) {
    const key = [problem.code, problem.elementId ?? '', problem.path ?? '', problem.message].join(
      '\u0000',
    );
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(problem);
  }
  return out;
}

const linkClass =
  'cursor-pointer rounded px-1.5 py-0.5 text-xs text-accent underline-offset-2 hover:underline';

function Row(props: {
  project: Project | null;
  problem: Problem;
  testId: string;
  onShow(problem: Problem): void;
  onFix?: ((problem: Problem, fix: PlainFix) => void) | undefined;
  onAsk?: ((problem: Problem) => void) | undefined;
  /** Words in place of the problem table's (the After moving group's own). */
  text?: string;
  /** More under the row's line (a hint, a Done box). */
  children?: ReactNode;
}) {
  const { problem, testId } = props;
  const [details, setDetails] = useState(false);
  const table = plainProblem(problem, problemThingName(props.project, problem));
  const plain = props.text === undefined ? table : { ...table, text: props.text };
  return (
    <li className="flex flex-col gap-0.5" data-testid={testId} data-code={problem.code}>
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-sm" data-testid={`${testId}-text`}>
          {plain.text}
        </span>
        {problem.elementId !== undefined && (
          <button
            type="button"
            className={linkClass}
            data-testid={`${testId}-show`}
            onClick={() => props.onShow(problem)}
          >
            Show me
          </button>
        )}
        {plain.fix !== undefined && props.onFix !== undefined && (
          <button
            type="button"
            className={linkClass}
            data-testid={`${testId}-fix`}
            onClick={() => {
              if (plain.fix !== undefined) props.onFix?.(problem, plain.fix);
            }}
          >
            Fix it: {PLAIN_FIX_LABELS[plain.fix]}
          </button>
        )}
        {!plain.known && (
          <button
            type="button"
            className={linkClass}
            aria-expanded={details}
            data-testid={`${testId}-details`}
            onClick={() => setDetails((open) => !open)}
          >
            {details ? 'Hide details' : 'Show details'}
          </button>
        )}
        {props.onAsk !== undefined && (
          <button
            type="button"
            className={linkClass}
            data-testid={`${testId}-ask`}
            onClick={() => props.onAsk?.(problem)}
          >
            {ASK_THE_HELPER}
          </button>
        )}
      </div>
      {props.children}
      {details && (
        <p className="pl-2 text-muted text-xs" data-testid={`${testId}-message`}>
          {problem.message}
        </p>
      )}
    </li>
  );
}

/** The After moving group: one row per open item, with its hint and, when it needs one, Done. */
function AfterMoving(props: {
  group: AfterMovingGroup;
  project: Project | null;
  onShow(problem: Problem): void;
  onFix?: ((problem: Problem, fix: PlainFix) => void) | undefined;
  onAsk?: ((problem: Problem) => void) | undefined;
  onTick?: ((folder: string, itemId: string, ticked: boolean) => void) | undefined;
  onOpenReport?: ((folder: string) => void) | undefined;
}) {
  const { group } = props;
  return (
    <section
      aria-label={`After moving to Minecraft ${group.mcVersion}`}
      className="flex flex-col gap-1"
      data-testid="things-to-fix-after-moving"
    >
      <h3 className="flex flex-wrap items-center gap-1 text-sm">
        <CircleArrowUp size={12} aria-hidden />
        <span data-testid="things-to-fix-after-moving-title">
          {`After moving to Minecraft ${group.mcVersion} (${group.items.length})`}
        </span>
        {props.onOpenReport !== undefined && (
          <button
            type="button"
            className={linkClass}
            data-testid="things-to-fix-after-moving-report"
            onClick={() => props.onOpenReport?.(group.folder)}
          >
            {WHAT_CHANGED_WHEN_I_MOVED}
          </button>
        )}
      </h3>
      <ul className="flex flex-col gap-1">
        {group.items.map((item, index) => {
          const testId = `things-to-fix-after-moving-${index}`;
          const hint = todoItemHint(item, group.items[index - 1]);
          return (
            <Row
              key={item.id}
              project={props.project}
              problem={item.problem}
              testId={testId}
              text={todoItemText(item, props.project, group.mcVersion)}
              onShow={props.onShow}
              onFix={props.onFix}
              onAsk={props.onAsk}
            >
              {hint !== null && (
                <p className="pl-2 text-muted text-xs" data-testid={`${testId}-hint`}>
                  {hint}
                </p>
              )}
              {item.check === 'manual' && props.onTick !== undefined && (
                <label className="flex items-center gap-1 pl-2 text-xs">
                  <input
                    type="checkbox"
                    data-testid={`${testId}-done`}
                    onChange={(event) =>
                      props.onTick?.(group.folder, item.id, event.currentTarget.checked)
                    }
                  />
                  Done
                </label>
              )}
            </Row>
          );
        })}
      </ul>
    </section>
  );
}

/** The "Things to fix" strip. */
export function ThingsToFix(props: ThingsToFixProps) {
  const group =
    props.afterMoving !== undefined &&
    props.afterMoving !== null &&
    props.afterMoving.items.length > 0
      ? props.afterMoving
      : null;
  // The group's problems are shown once, in the group.
  const inGroup = new Set(group?.items.map((item) => problemKey(item.problem)) ?? []);
  const unique = uniqueProblems(props.problems).filter(
    (problem) => !inGroup.has(problemKey(problem)),
  );
  const errors = unique.filter((problem) => problem.severity === 'error');
  const tips = unique.filter((problem) => problem.severity !== 'error');
  const count = errors.length + (group?.items.length ?? 0);
  return (
    <section
      aria-label="Things to fix"
      data-testid="things-to-fix"
      className="flex max-h-48 flex-col gap-1 overflow-auto border-t border-border bg-panel px-3 py-2"
    >
      <h2 className="flex items-center gap-1 font-medium text-sm">
        <CircleAlert size={14} aria-hidden />
        {count === 0 ? 'Nothing to fix' : `Things to fix (${count})`}
      </h2>
      {props.note !== undefined && props.note !== null && (
        <div data-testid="things-to-fix-note">{props.note}</div>
      )}
      {group !== null && (
        <AfterMoving
          group={group}
          project={props.project}
          onShow={props.onShow}
          onFix={props.onFix}
          onAsk={props.onAsk}
          onTick={props.onTickUpgradeItem}
          onOpenReport={props.onOpenMoveReport}
        />
      )}
      {count === 0 ? (
        <p className="text-muted text-xs" data-testid="things-to-fix-none">
          Everything is ready to play.
        </p>
      ) : errors.length === 0 ? null : (
        <ul className="flex flex-col gap-1">
          {errors.map((problem, index) => (
            <Row
              key={`${problem.code}-${problem.elementId ?? ''}-${problem.path ?? ''}-${index}`}
              project={props.project}
              problem={problem}
              testId={`things-to-fix-${index}`}
              onShow={props.onShow}
              onFix={props.onFix}
              onAsk={props.onAsk}
            />
          ))}
        </ul>
      )}
      {tips.length > 0 && (
        <details data-testid="things-to-fix-tips">
          <summary className="flex cursor-pointer items-center gap-1 text-muted text-xs">
            <Lightbulb size={12} aria-hidden />
            Tips ({tips.length})
          </summary>
          <ul className="mt-1 flex flex-col gap-1">
            {tips.map((problem, index) => (
              <Row
                key={`${problem.code}-${problem.elementId ?? ''}-${problem.path ?? ''}-${index}`}
                project={props.project}
                problem={problem}
                testId={`things-to-fix-tip-${index}`}
                onShow={props.onShow}
                onFix={props.onFix}
                onAsk={props.onAsk}
              />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
