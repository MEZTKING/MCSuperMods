/**
 * Part 3 of the report (ADR 0136 D4, D6): what you need to change. Each item in plain words with
 * the change set's hint, **Show me**, **Fix it** where one step fixes it (only for a move already
 * made, when the project has the problem now) and **Ask the helper**. In a saved report an item
 * fixed since is marked done. The problem's code, place and message under More options.
 *
 * @packageDocumentation
 */

import type { UpgradeTodoItem } from '@msm/core';
import { plainProblem } from '../../../session/plain-problems';
import { todoItemHint, todoItemText } from '../sentences';
import { AskHelper, FixIt, Part, Raw, ShowMe, useReport } from './shared';

/** Part 3. Hidden when the move needs nothing of the user. */
export function TodoPart(props: {
  items: readonly UpgradeTodoItem[];
  /** For a saved report: the ids of the items still open now; others read as done. */
  open?: ReadonlySet<string> | undefined;
}) {
  const report = useReport();
  if (props.items.length === 0) return null;
  return (
    <Part id="todo" title="What you need to change">
      <ul className="flex flex-col gap-1.5 pl-1" data-testid="upgrade-todo">
        {props.items.map((item, index) => {
          const testId = `upgrade-todo-${index}`;
          const problem = item.problem;
          const done = props.open !== undefined && !props.open.has(item.id);
          const hint = todoItemHint(item, props.items[index - 1]);
          const fix = report.made && !done ? plainProblem(problem, '').fix : undefined;
          return (
            <li
              key={item.id}
              className="flex flex-col gap-0.5"
              data-testid={testId}
              data-done={done ? 'true' : undefined}
            >
              <span className="flex flex-wrap items-center gap-1">
                <span
                  className={`text-sm ${done ? 'text-muted line-through' : ''}`}
                  data-testid={`${testId}-text`}
                >
                  {todoItemText(item, report.project, report.versionOf(item.targetId))}
                </span>
                {done && (
                  <span className="text-muted text-xs" data-testid={`${testId}-done`}>
                    Done
                  </span>
                )}
                {problem.elementId !== undefined && (
                  <ShowMe
                    elementId={problem.elementId}
                    path={problem.path}
                    testId={`${testId}-show`}
                  />
                )}
                <FixIt problem={problem} fix={fix} testId={`${testId}-fix`} />
                <AskHelper problem={problem} testId={`${testId}-ask`} />
              </span>
              {hint !== null && (
                <span className="pl-2 text-muted text-xs" data-testid={`${testId}-hint`}>
                  {hint}
                </span>
              )}
              <Raw testId={`${testId}-raw`}>
                {`${problem.code} ${problem.elementId ?? ''} ${problem.path ?? ''}: ${problem.message}${item.hint === undefined ? '' : ` (${item.hint})`}`}
              </Raw>
            </li>
          );
        })}
      </ul>
    </Part>
  );
}
