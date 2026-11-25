/**
 * What the report's parts share (B818): the part's section with its heading, the context the
 * report view hands them (the project for names, whether ids show, the version moved to and
 * the host's Show me, Fix it and Ask the helper), and the buttons each item carries.
 *
 * @packageDocumentation
 */

import type { Problem, Project, UpgradeDoneItem } from '@msm/core';
import { createContext, type ReactNode, useContext, useId } from 'react';
import type { PlainFix } from '../../../session/plain-problems';
import { PLAIN_FIX_LABELS, problemThingName } from '../../../session/plain-problems';

/** What every part of the report reads. */
export interface ReportContextValue {
  /** The project, for the things' display names. */
  project: Project | null;
  /** Whether ids, paths and registry names show (the dialog's More options is open). */
  ids: boolean;
  /** The Minecraft version moved (or to be moved) to. */
  mcVersion: string;
  /** The Minecraft version of a target the report names (a chain's hops); `mcVersion` otherwise. */
  versionOf(targetId: string | undefined): string;
  /** Whether the report is of a move already made (a saved report). */
  made: boolean;
  /** Opens a thing at a field. */
  onShow?: ((elementId: string, path?: string) => void) | undefined;
  /** Runs a one-step fix of a problem the project has now. */
  onFix?: ((problem: Problem, fix: PlainFix) => void) | undefined;
  /** Opens the AI helper with the problem attached (sends nothing). */
  onAsk?: ((problem: Problem) => void) | undefined;
  /** More under each item of part 2 (B819's before and after views). */
  doneExtra?: ((item: UpgradeDoneItem) => ReactNode) | undefined;
}

/** The report's context; the view provides it. */
export const ReportContext = createContext<ReportContextValue>({
  project: null,
  ids: false,
  mcVersion: '',
  versionOf: () => '',
  made: false,
});

/** The report's context. */
export function useReport(): ReportContextValue {
  return useContext(ReportContext);
}

/** The display name of a thing of the project, or words of its id when it is gone. */
export function thingName(project: Project | null, elementId: string): string {
  return problemThingName(project, {
    severity: 'info',
    code: 'upgrade.place',
    message: '',
    elementId: elementId as Problem['elementId'] & string,
  });
}

export const linkClass =
  'cursor-pointer rounded px-1.5 py-0.5 text-xs text-accent underline-offset-2 hover:underline';

/** One part of the report: a heading and its items, labelled by the heading. */
export function Part(props: { id: string; title: string; children: ReactNode }) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-1"
      data-testid={`upgrade-part-${props.id}`}
    >
      <h3 id={headingId} className="font-semibold text-sm">
        {props.title}
      </h3>
      {props.children}
    </section>
  );
}

/** An id or path, shown only while ids show. */
export function Raw(props: { children: ReactNode; testId?: string }) {
  const { ids } = useReport();
  if (!ids) return null;
  return (
    <span className="font-mono text-muted text-xs" data-testid={props.testId}>
      {props.children}
    </span>
  );
}

/** **Show me** for a thing, named for screen readers. */
export function ShowMe(props: { elementId: string; path?: string | undefined; testId: string }) {
  const { onShow, project } = useReport();
  if (onShow === undefined) return null;
  return (
    <button
      type="button"
      className={linkClass}
      aria-label={`Show me ${thingName(project, props.elementId)}`}
      data-testid={props.testId}
      onClick={() => onShow(props.elementId, props.path)}
    >
      Show me
    </button>
  );
}

/** **Ask the helper** about a problem. */
export function AskHelper(props: { problem: Problem; testId: string }) {
  const { onAsk } = useReport();
  if (onAsk === undefined) return null;
  return (
    <button
      type="button"
      className={linkClass}
      data-testid={props.testId}
      onClick={() => onAsk(props.problem)}
    >
      Ask the helper
    </button>
  );
}

/** **Fix it** for a problem the project has now, when one step fixes it. */
export function FixIt(props: { problem: Problem; fix: PlainFix | undefined; testId: string }) {
  const { onFix } = useReport();
  const fix = props.fix;
  if (onFix === undefined || fix === undefined) return null;
  return (
    <button
      type="button"
      className={linkClass}
      data-testid={props.testId}
      onClick={() => onFix(props.problem, fix)}
    >
      Fix it: {PLAIN_FIX_LABELS[fix]}
    </button>
  );
}
