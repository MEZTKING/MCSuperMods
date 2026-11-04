import type { Problem } from '@msm/core';
import { CircleAlert, FolderSearch, Info, TriangleAlert } from 'lucide-react';
import { iconButtonClass } from './ui/Button';

function SeverityIcon({ severity }: { severity: Problem['severity'] }) {
  if (severity === 'error') return <CircleAlert size={14} aria-hidden className="text-error" />;
  if (severity === 'warning') {
    return <TriangleAlert size={14} aria-hidden className="text-warning" />;
  }
  return <Info size={14} aria-hidden className="text-muted" />;
}

/** Props of {@link ProblemsPanel}. */
export interface ProblemsPanelProps {
  /** Live project problems (load, schema and session problems). */
  problems: readonly Problem[];
  /** Problems of the last export or install. Their `file` is an output path. */
  exportProblems?: readonly Problem[];
  /**
   * Called for a problem that belongs to an element: select it and focus the field (for a
   * function line, the caret goes to the start of the problem's `range` within the line).
   */
  onNavigate?(problem: Problem & { elementId: NonNullable<Problem['elementId']> }): void;
  /** Reveals a project file (`file` is project-relative) in the OS file manager. */
  onReveal?(file: string): void;
}

const LINE_PATH = /^\/lines\/(\d+)$/;

/**
 * A problem's location as shown: `line <n>` (1-based, with the column of `range` when
 * present) for a function line (`/lines/<n>`), else the pointer itself.
 */
export function problemLocation(problem: Problem): string | undefined {
  const path = problem.path;
  if (path === undefined) return undefined;
  const match = LINE_PATH.exec(path);
  if (match === null) return path;
  const line = `line ${Number(match[1]) + 1}`;
  return problem.range === undefined ? line : `${line}:${problem.range.start + 1}`;
}

function ProblemText({ problem }: { problem: Problem }) {
  const location = problemLocation(problem);
  return (
    <>
      <span className="sr-only">{problem.severity}: </span>
      {problem.elementId !== undefined && (
        <code className="mr-1 font-mono text-xs">{problem.elementId}</code>
      )}
      {problem.file !== undefined && <code className="mr-1 font-mono text-xs">{problem.file}</code>}
      {location !== undefined && (
        <code className="mr-1 font-mono text-xs text-muted">{location}</code>
      )}
      {problem.message}
    </>
  );
}

function ProblemRow(props: {
  problem: Problem;
  onDisk: boolean;
  onNavigate: ProblemsPanelProps['onNavigate'];
  onReveal: ProblemsPanelProps['onReveal'];
}) {
  const { problem, onNavigate, onReveal } = props;
  const elementId = problem.elementId;
  const file = problem.file;
  return (
    <li
      className="flex items-start gap-1.5"
      data-testid="problem-row"
      data-severity={problem.severity}
      data-code={problem.code}
    >
      <span className="mt-0.5 shrink-0">
        <SeverityIcon severity={problem.severity} />
      </span>
      {elementId !== undefined && onNavigate !== undefined ? (
        <button
          type="button"
          className="flex-1 cursor-pointer rounded text-left hover:bg-bg"
          title={
            problem.path !== undefined && LINE_PATH.test(problem.path)
              ? 'Go to the line'
              : 'Go to the field'
          }
          onClick={() => onNavigate({ ...problem, elementId })}
        >
          <ProblemText problem={problem} />
        </button>
      ) : (
        <span className="flex-1">
          <ProblemText problem={problem} />
        </span>
      )}
      {props.onDisk && file !== undefined && onReveal !== undefined && (
        <button
          type="button"
          className={iconButtonClass}
          aria-label={`Reveal ${file} in folder`}
          title="Reveal in folder"
          onClick={() => onReveal(file)}
        >
          <FolderSearch size={14} aria-hidden />
        </button>
      )}
    </li>
  );
}

/** The project's problems, plus those of the last export. */
export function ProblemsPanel({
  problems,
  exportProblems = [],
  onNavigate,
  onReveal,
}: ProblemsPanelProps) {
  const total = problems.length + exportProblems.length;
  return (
    <section aria-label="Problems" className="flex flex-col gap-2 p-2" data-testid="problems-panel">
      <h2 className="sr-only">Problems ({total})</h2>
      {problems.length === 0 ? (
        <p className="text-muted">No problems.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {problems.map((problem, index) => (
            <ProblemRow
              key={index}
              problem={problem}
              onDisk={problem.elementId === undefined}
              onNavigate={onNavigate}
              onReveal={onReveal}
            />
          ))}
        </ul>
      )}
      {exportProblems.length > 0 && (
        <section aria-label="Last export" data-testid="export-problems">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
            Last export
          </h3>
          <ul className="flex flex-col gap-1">
            {exportProblems.map((problem, index) => (
              <ProblemRow
                key={index}
                problem={problem}
                onDisk={false}
                onNavigate={onNavigate}
                onReveal={onReveal}
              />
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
