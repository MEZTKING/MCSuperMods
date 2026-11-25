/**
 * The text difference of a thing's lowered files before and after a move (ADR 0136 D13, B819):
 * one entry per file with its layer and path, said as the same, changed, new or gone, and the
 * lines taken out and put in. Shown under More options, or openly for a kind with no view.
 *
 * @packageDocumentation
 */

import type { FileDifference } from './sides';

const STATUS_WORDS: Record<FileDifference['status'], string> = {
  same: 'the same',
  changed: 'changed',
  added: 'new after the move',
  removed: 'gone after the move',
};

/** Props of {@link TextDifference}. */
export interface TextDifferenceProps {
  differences: readonly FileDifference[];
  testId: string;
}

/** The files and their lines; see the module comment. */
export function TextDifference({ differences, testId }: TextDifferenceProps) {
  if (differences.length === 0) {
    return (
      <p className="text-muted text-xs" data-testid={testId}>
        It makes no files on either version.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2" data-testid={testId}>
      {differences.map((file) => (
        <li
          key={`${file.layer}:${file.path}`}
          className="flex flex-col gap-1"
          data-status={file.status}
          data-testid={`${testId}-file`}
        >
          <p className="text-xs">
            <code>{`${file.layer}: ${file.path}`}</code> {`(${STATUS_WORDS[file.status]})`}
          </p>
          {file.status === 'same' ? null : file.lines === undefined ? (
            <p className="text-muted text-xs">A picture or other file that is not text.</p>
          ) : (
            <pre className="max-h-64 overflow-auto rounded border border-border p-1 font-mono text-xs">
              {file.lines.map((line, index) => (
                <div
                  key={index}
                  className={
                    line.type === 'added'
                      ? 'bg-green-500/15 text-green-700 dark:text-green-300'
                      : line.type === 'removed'
                        ? 'bg-red-500/15 text-red-700 dark:text-red-300'
                        : ''
                  }
                  data-line={line.type}
                >
                  {line.type === 'added' ? '+ ' : line.type === 'removed' ? '- ' : '  '}
                  {line.text}
                </div>
              ))}
            </pre>
          )}
        </li>
      ))}
    </ul>
  );
}
