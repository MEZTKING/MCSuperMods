import type { Problem } from '@msm/core';

/** The problems found when the project was loaded. */
export function ProblemsPanel({ problems }: { problems: readonly Problem[] }) {
  return (
    <section className="problems" aria-label="Problems">
      <h2>Problems ({problems.length})</h2>
      {problems.length === 0 ? (
        <p className="empty">No problems.</p>
      ) : (
        <ul>
          {problems.map((problem, index) => (
            <li key={index} className={`problem problem-${problem.severity}`}>
              <span className="severity">{problem.severity}</span>{' '}
              {problem.path !== undefined && <code>{problem.path}</code>} {problem.message}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
