/**
 * Loads the session's schema context for the open project's target (memoised by the session)
 * and exposes it to the Studio views.
 *
 * @packageDocumentation
 */

import { useEffect, useState } from 'react';
import type { ProjectSession } from '../session/project-session';
import type { SchemaContext } from '../session/schema-context';

/** The schema context, or why it is not available yet. */
export type SchemaContextState =
  | { status: 'loading' }
  | { status: 'ready'; context: SchemaContext }
  | { status: 'failed'; message: string };

/**
 * The schema context for `targetId` (the open project's target), or `loading` without a
 * project.
 */
export function useSchemaContext(
  session: ProjectSession,
  targetId: string | null,
): SchemaContextState {
  const [state, setState] = useState<SchemaContextState>({ status: 'loading' });
  useEffect(() => {
    if (targetId === null) {
      setState({ status: 'loading' });
      return;
    }
    let live = true;
    session.schemas().then(
      (context) => {
        if (live) setState({ status: 'ready', context });
      },
      (error: unknown) => {
        if (live) {
          setState({
            status: 'failed',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      },
    );
    return () => {
      live = false;
    };
  }, [session, targetId]);
  return state;
}
