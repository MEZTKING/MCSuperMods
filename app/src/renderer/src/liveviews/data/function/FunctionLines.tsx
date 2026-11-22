/**
 * What Try it does with a function (B613, ADR 0120 D8): each line with its mark, **Runs in Try
 * it** or **Only in the game** with the reason (the same marks as the Function editor's gutter,
 * `function-editor/line-marks.ts`), how many of its lines run, and whether Try it runs it by itself
 * (the project's `#minecraft:load` or `#minecraft:tick`). Running it is the editor's **Run in Try
 * it** or `/function` in Try it's chat box: this view only reads files, so it can draw in the
 * panel, the Creator and the AI review alike.
 */

import type { Element, Json, Project } from '@msm/plugin-api';
import {
  type LineMark,
  marksSummary,
  ONLY_WORDS,
  RUN_IN_TRY_IT_WORDS,
  RUNS_WORDS,
} from '../../../components/function-editor/line-marks';
import { joinLines } from '../../../components/function-editor/source-text';
import { useLineMarks } from '../../../components/function-editor/use-line-marks';
import { LiveViewFrame } from '../../frame/LiveViewFrame';
import type { LiveViewProps } from '../../registry';

/** The function tags the game runs by itself, and when. */
const SELF_RUN: readonly { readonly tag: string; readonly words: string }[] = [
  {
    tag: 'minecraft:load',
    words: 'when Try it starts and after you change a function (#minecraft:load)',
  },
  { tag: 'minecraft:tick', words: 'every tick (#minecraft:tick)' },
];

/** The function's source lines. */
export function functionLines(element: Pick<Element, 'data'>): readonly string[] {
  const data = element.data;
  const lines =
    typeof data === 'object' && data !== null && !Array.isArray(data) ? data.lines : undefined;
  return Array.isArray(lines)
    ? lines.filter((line): line is string => typeof line === 'string')
    : [];
}

function namesFunction(values: Json | undefined, id: string): boolean {
  if (!Array.isArray(values)) return false;
  return values.some((value) => {
    const entry =
      typeof value === 'string'
        ? value
        : typeof value === 'object' && value !== null && !Array.isArray(value)
          ? value.id
          : undefined;
    return entry === id;
  });
}

/** When Try it runs the function by itself: the project's load and tick tags that name it. */
export function selfRuns(project: Project, id: string): string[] {
  const out: string[] = [];
  for (const { tag, words } of SELF_RUN) {
    const named = project.namespaces.some((namespace) =>
      namespace.elements.some((element) => {
        if (element.kind !== 'minecraft:tag/function' || element.id !== tag) return false;
        const data = element.data;
        return (
          typeof data === 'object' &&
          data !== null &&
          !Array.isArray(data) &&
          namesFunction(data.values, id)
        );
      }),
    );
    if (named) out.push(words);
  }
  return out;
}

function LineRow({
  text,
  number,
  mark,
}: {
  text: string;
  number: number;
  mark: LineMark | undefined;
}) {
  return (
    <li
      data-testid="function-view-line"
      data-line={number}
      data-runs={mark === undefined ? undefined : String(mark.runs)}
      className="grid grid-cols-[2.5rem_1fr] gap-x-2"
    >
      <span className="text-right text-muted tabular-nums">{number + 1}</span>
      <span className="flex flex-col">
        <code className="whitespace-pre-wrap font-mono [overflow-wrap:anywhere]">
          {text || ' '}
        </code>
        {mark !== undefined && (
          <span className={`text-xs ${mark.runs ? 'text-accent' : 'text-warning'}`}>
            {mark.words}
          </span>
        )}
      </span>
    </li>
  );
}

/** The registry's view of a function. */
export default function FunctionLines({ project, element }: LiveViewProps) {
  const lines = functionLines(element);
  const marks = useLineMarks(joinLines(lines));
  const byLine = new Map((marks ?? []).map((mark) => [mark.line, mark]));
  const summary = marks === null ? null : marksSummary(marks);
  const self = selfRuns(project, element.id);
  const notes = [
    `${RUN_IN_TRY_IT_WORDS} in the function’s editor runs it at you; /function ${element.id} in Try it’s chat box does too.`,
    `A line marked ${ONLY_WORDS} is said in What happened, never run. Try it is a small world of 48 by 48 blocks with one player: @a is you.`,
  ];
  return (
    <LiveViewFrame title="Function" fidelity="about_right" notes={notes}>
      <div className="flex flex-col gap-2 text-sm">
        <p data-testid="function-view-summary">
          {summary === null
            ? 'Reading what Try it can run…'
            : summary.lines === 0
              ? 'No commands yet.'
              : summary.runs === summary.lines
                ? `${RUNS_WORDS}: every line (${summary.lines}).`
                : `${RUNS_WORDS}: ${summary.runs} of ${summary.lines} lines.`}
        </p>
        {self.map((words) => (
          <p key={words} data-testid="function-view-self-run">
            {`Try it runs it by itself ${words}.`}
          </p>
        ))}
        <ol aria-label="Lines" className="flex flex-col gap-1">
          {lines.map((text, number) => (
            <LineRow key={number} text={text} number={number} mark={byLine.get(number)} />
          ))}
        </ol>
      </div>
    </LiveViewFrame>
  );
}
