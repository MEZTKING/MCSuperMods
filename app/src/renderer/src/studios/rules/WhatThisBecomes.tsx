/**
 * "What this becomes" (ADR 0082 D7 (a), Advanced only): the events the book's rules add to their
 * things and the script it needs, read-only, compiled here with `compileRuleBooks` exactly as the
 * expander compiles them on export (every book of the project together, so shared events match).
 *
 * @packageDocumentation
 */

import type { Element, Project } from '@msm/core';
import type { TargetFacts } from '@msm/plugin-api';
import { compileRuleBooks, RULES_KIND } from '@msm/plugin-rules';
import { useMemo } from 'react';

/** What a book compiles to: its patches by thing, and its script lines. */
export interface BookOutput {
  readonly patches: readonly { elementId: string; path: string; value: string }[];
  readonly script: readonly string[] | null;
}

/** Compiles the project's books and keeps book `bookId`'s part. */
export function bookOutput(project: Project, bookId: string, target: TargetFacts): BookOutput {
  const elements: Element[] = project.namespaces.flatMap((namespace) => namespace.elements);
  const books = elements
    .filter((element) => element.kind === RULES_KIND)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const result = compileRuleBooks(books, elements, target);
  return {
    patches: result.patches
      .filter((patch) => patch.origin.elementId === bookId)
      .map((patch) => ({
        elementId: patch.elementId,
        path: patch.path.join('/'),
        value: JSON.stringify(patch.value, null, 2),
      })),
    script: result.scripts.get(bookId as Element['id']) ?? null,
  };
}

/** The read-only drawer. */
export function WhatThisBecomes(props: { project: Project; bookId: string; target: TargetFacts }) {
  const output = useMemo(() => {
    try {
      return bookOutput(props.project, props.bookId, props.target);
    } catch (error) {
      return error instanceof Error ? error : new Error(String(error));
    }
  }, [props.project, props.bookId, props.target]);
  return (
    <details className="rounded border border-border p-2" data-testid="rules-what-this-becomes">
      <summary className="cursor-pointer font-semibold">What this becomes</summary>
      {output instanceof Error ? (
        <p className="text-error">The rules could not be compiled: {output.message}</p>
      ) : (
        <div className="mt-2 flex flex-col gap-2 text-xs">
          <p className="text-muted">
            Made from the rules when the mod is exported; edit the rules, not these.
          </p>
          {output.patches.length === 0 ? (
            <p className="text-muted">No events: no rule is on one of your things yet.</p>
          ) : (
            output.patches.map((patch) => (
              <section
                key={`${patch.elementId}#${patch.path}`}
                aria-label={`${patch.elementId} ${patch.path}`}
              >
                <p className="font-mono">
                  {patch.elementId} · {patch.path}
                </p>
                <pre className="max-h-64 overflow-auto rounded bg-panel p-1.5 font-mono">
                  {patch.value}
                </pre>
              </section>
            ))
          )}
          {output.script === null ? (
            <p className="text-muted" data-testid="rules-no-script">
              No script: every rule here becomes plain events.
            </p>
          ) : (
            <section aria-label="Generated script">
              <p className="font-semibold">Script</p>
              <pre
                className="max-h-96 overflow-auto rounded bg-panel p-1.5 font-mono"
                data-testid="rules-script"
              >
                {output.script.join('\n')}
              </pre>
            </section>
          )}
        </div>
      )}
    </details>
  );
}
