import type { Problem } from '@msm/core';
import { CircleAlert, Info, TriangleAlert } from 'lucide-react';

function SeverityIcon({ severity }: { severity: Problem['severity'] }) {
  if (severity === 'error') return <CircleAlert size={14} aria-hidden className="text-error" />;
  if (severity === 'warning') {
    return <TriangleAlert size={14} aria-hidden className="text-warning" />;
  }
  return <Info size={14} aria-hidden className="text-muted" />;
}

/** The project's problems. */
export function ProblemsPanel({ problems }: { problems: readonly Problem[] }) {
  return (
    <section aria-label="Problems" className="p-2">
      <h2 className="sr-only">Problems ({problems.length})</h2>
      {problems.length === 0 ? (
        <p className="text-muted">No problems.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {problems.map((problem, index) => (
            <li key={index} className="flex items-start gap-1.5">
              <span className="mt-0.5 shrink-0">
                <SeverityIcon severity={problem.severity} />
              </span>
              <span>
                <span className="sr-only">{problem.severity}: </span>
                {problem.elementId !== undefined && (
                  <code className="mr-1 font-mono text-xs">{problem.elementId}</code>
                )}
                {problem.file !== undefined && (
                  <code className="mr-1 font-mono text-xs">{problem.file}</code>
                )}
                {problem.path !== undefined && (
                  <code className="mr-1 font-mono text-xs text-muted">{problem.path}</code>
                )}
                {problem.message}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
